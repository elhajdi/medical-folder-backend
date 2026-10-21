import base64
import contextlib
import io
import json
import math
import os
import re
import sys
import warnings


ARABIC_SCRIPT = re.compile(r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]")
SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}
MODEL_VERSION = (
    "multilingual PP-OCRv3 detector; fr uses latin PP-OCRv3 recognition; "
    "ar uses Arabic PP-OCRv4 recognition"
)


class WorkerFailure(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def positive_integer(value, fallback):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def normalize_prediction(prediction, width, height, language):
    if not prediction:
        return []
    lines = prediction
    if (
        isinstance(prediction, (list, tuple))
        and len(prediction) == 1
        and isinstance(prediction[0], (list, tuple))
        and not (
            len(prediction[0]) == 2
            and isinstance(prediction[0][1], (list, tuple))
            and len(prediction[0][1]) == 2
            and isinstance(prediction[0][1][0], str)
        )
    ):
        lines = prediction[0]

    regions = []
    for line in lines:
        try:
            raw_box, recognition = line
            text, confidence = recognition
            if not isinstance(text, str) or not text.strip():
                continue
            contains_arabic = bool(ARABIC_SCRIPT.search(text))
            if language == "ar" and not contains_arabic:
                continue
            if language == "fr" and contains_arabic:
                continue

            points = []
            for point in raw_box:
                x = float(point[0])
                y = float(point[1])
                if not math.isfinite(x) or not math.isfinite(y):
                    raise ValueError("non-finite box")
                points.append(
                    {
                        "x": min(max(x, 0.0), float(width)),
                        "y": min(max(y, 0.0), float(height)),
                    }
                )
            if len(points) != 4:
                continue

            score = float(confidence)
            if not math.isfinite(score) or score < 0.0 or score > 1.0:
                score = None
            regions.append(
                {
                    "text": text.strip(),
                    "confidence": score,
                    "boundingBox": points,
                    "_language": language,
                }
            )
        except (TypeError, ValueError, IndexError):
            continue
    return regions


def normalize_document_regions(language_results):
    regions = []
    for page_number, page_results in enumerate(language_results, start=1):
        page_regions = []
        for language, prediction, width, height in page_results:
            page_regions.extend(
                normalize_prediction(prediction, width, height, language)
            )
        page_regions.sort(
            key=lambda region: (
                min(point["y"] for point in region["boundingBox"]),
                min(point["x"] for point in region["boundingBox"]),
            )
        )
        for region in page_regions:
            region.pop("_language", None)
        text = "\n".join(region["text"] for region in page_regions)
        scores = [
            region["confidence"]
            for region in page_regions
            if region["confidence"] is not None
        ]
        regions.append(
            {
                "page": page_number,
                "text": text,
                "confidence": sum(scores) / len(scores) if scores else None,
                "regions": page_regions,
            }
        )
    return regions


def emit(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")
    sys.stdout.flush()


def load_engines():
    from paddleocr import PaddleOCR

    engines = {}
    use_gpu = os.environ.get("PADDLEOCR_USE_GPU", "false").lower() == "true"
    with contextlib.redirect_stdout(sys.stderr):
        for language in ("fr", "ar"):
            engines[language] = PaddleOCR(
                lang=language,
                ocr_version="PP-OCRv4",
                use_gpu=use_gpu,
                use_angle_cls=False,
                show_log=False,
            )
    return engines


def iter_document_pages(raw_bytes, mime_type, max_pages, max_pixels):
    import cv2
    import fitz
    import numpy as np
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = max_pixels
    if mime_type == "application/pdf":
        try:
            document = fitz.open(stream=raw_bytes, filetype="pdf")
        except Exception as error:
            raise WorkerFailure("MALFORMED_FILE") from error
        try:
            if document.needs_pass:
                raise WorkerFailure("ENCRYPTED_PDF")
            page_count = document.page_count
            if page_count == 0:
                raise WorkerFailure("EMPTY_DOCUMENT")
            if page_count > max_pages:
                raise WorkerFailure("PAGE_LIMIT_EXCEEDED")
            for index in range(page_count):
                page = document.load_page(index)
                rect = page.rect
                if rect.width <= 0 or rect.height <= 0:
                    raise WorkerFailure("MALFORMED_FILE")
                scale = min(
                    2.0,
                    math.sqrt(max_pixels / (rect.width * rect.height)),
                )
                pixmap = page.get_pixmap(
                    matrix=fitz.Matrix(scale, scale),
                    colorspace=fitz.csRGB,
                    alpha=False,
                )
                if pixmap.width * pixmap.height > max_pixels:
                    raise WorkerFailure("MALFORMED_FILE")
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
                    pixmap.height, pixmap.width, pixmap.n
                )
                yield index + 1, cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        finally:
            document.close()
        return

    if mime_type not in ("image/jpeg", "image/png"):
        raise WorkerFailure("UNSUPPORTED_FILE_TYPE")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw_bytes)) as source:
                expected_format = "JPEG" if mime_type == "image/jpeg" else "PNG"
                if source.format != expected_format:
                    raise WorkerFailure("MALFORMED_FILE")
                if source.width * source.height > max_pixels:
                    raise WorkerFailure("MALFORMED_FILE")
                source.verify()
            with Image.open(io.BytesIO(raw_bytes)) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                if image.width * image.height > max_pixels:
                    raise WorkerFailure("MALFORMED_FILE")
                pixels = np.asarray(image)
                yield 1, cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
    except WorkerFailure:
        raise
    except Exception as error:
        raise WorkerFailure("MALFORMED_FILE") from error


def process_document(message, engines, max_bytes, max_pages, max_pixels):
    if not isinstance(message, dict):
        raise WorkerFailure("MALFORMED_FILE")
    request_id = message.get("id")
    mime_type = message.get("mimeType")
    encoded_bytes = message.get("bytes")
    if not isinstance(request_id, str):
        raise WorkerFailure("MALFORMED_FILE")
    if not isinstance(mime_type, str) or mime_type not in SUPPORTED_MIME_TYPES:
        raise WorkerFailure("UNSUPPORTED_FILE_TYPE")
    if not isinstance(encoded_bytes, str):
        raise WorkerFailure("MALFORMED_FILE")
    try:
        raw_bytes = base64.b64decode(encoded_bytes, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise WorkerFailure("MALFORMED_FILE") from error
    if not raw_bytes:
        raise WorkerFailure("MALFORMED_FILE")
    if len(raw_bytes) > max_bytes:
        raise WorkerFailure("FILE_TOO_LARGE")

    if mime_type == "application/pdf":
        valid_signature = raw_bytes.startswith(b"%PDF-")
    elif mime_type == "image/jpeg":
        valid_signature = raw_bytes.startswith(b"\xff\xd8\xff")
    else:
        valid_signature = raw_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    if not valid_signature:
        raise WorkerFailure("MALFORMED_FILE")

    language_results = []
    with contextlib.redirect_stdout(sys.stderr):
        for page_number, image in iter_document_pages(
            raw_bytes, mime_type, max_pages, max_pixels
        ):
            page_results = []
            height, width = image.shape[:2]
            for language in ("fr", "ar"):
                prediction = engines[language].ocr(image, cls=False)
                page_results.append((language, prediction, width, height))
            language_results.append(page_results)

    pages = normalize_document_regions(language_results)
    total_regions = sum(len(page["regions"]) for page in pages)
    total_text_length = sum(len(page["text"]) for page in pages)
    if total_regions > 10_000 or total_text_length > 2_000_000:
        raise WorkerFailure("OCR_WORKER_ERROR")
    return {
        "pages": pages,
        "status": (
            "completed"
            if any(page["text"].strip() for page in pages)
            else "empty"
        ),
        "languages": ["fr", "ar"],
        "modelVersion": MODEL_VERSION,
    }


def main():
    try:
        engines = load_engines()
    except Exception:
        sys.stderr.write("PaddleOCR worker initialization failed\n")
        sys.stderr.flush()
        return 1

    max_bytes = positive_integer(os.environ.get("MAX_UPLOAD_MB"), 15) * 1024 * 1024
    max_pages = positive_integer(os.environ.get("PADDLEOCR_MAX_PAGES"), 20)
    max_pixels = positive_integer(
        os.environ.get("PADDLEOCR_MAX_PIXELS"), 25_000_000
    )
    emit(
        {
            "type": "ready",
            "providerVersion": "2.10.0",
            "modelVersion": MODEL_VERSION,
            "languages": ["fr", "ar"],
        }
    )

    for line in sys.stdin:
        request_id = None
        message = None
        result = None
        try:
            message = json.loads(line)
            request_id = message.get("id") if isinstance(message, dict) else None
            result = process_document(
                message, engines, max_bytes, max_pages, max_pixels
            )
            emit({"id": request_id, "ok": True, "result": result})
        except WorkerFailure as error:
            emit({"id": request_id, "ok": False, "code": error.code})
        except Exception:
            emit(
                {
                    "id": request_id,
                    "ok": False,
                    "code": "OCR_WORKER_ERROR",
                }
            )
        finally:
            line = ""
            message = None
            result = None
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
