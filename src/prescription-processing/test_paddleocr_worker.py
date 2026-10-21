import base64
import unittest

from paddleocr_worker import (
    WorkerFailure,
    normalize_document_regions,
    normalize_prediction,
    process_document,
)


class PaddleOcrWorkerNormalizationTest(unittest.TestCase):
    def test_normalizes_synthetic_french_and_arabic_regions_with_boxes(self):
        box = [[1, 2], [30, 2], [30, 12], [1, 12]]
        french = [[[box, ("Synthetic medicine", 0.91)]]]
        arabic = [[[box, ("دواء تجريبي", 0.83)]]]

        page = normalize_document_regions(
            [[
                ("fr", french, 40, 20),
                ("ar", arabic, 40, 20),
            ]]
        )[0]

        self.assertEqual(page["text"], "Synthetic medicine\nدواء تجريبي")
        self.assertEqual(page["confidence"], 0.87)
        self.assertEqual(len(page["regions"]), 2)
        self.assertEqual(
            page["regions"][0]["boundingBox"][0], {"x": 1.0, "y": 2.0}
        )

    def test_excludes_other_scripts_and_invalid_scores(self):
        box = [[-1, 2], [30, 2], [30, 12], [1, 12]]
        french = normalize_prediction(
            [
                [box, ("نص عربي", 0.9)],
                [box, ("123", float("nan"))],
            ],
            20,
            20,
            "fr",
        )

        self.assertEqual(len(french), 1)
        self.assertIsNone(french[0]["confidence"])
        self.assertEqual(french[0]["boundingBox"][0], {"x": 0.0, "y": 2.0})

    def test_preserves_empty_page_with_no_ocr_confidence(self):
        result = normalize_document_regions([[]])

        self.assertEqual(
            result,
            [{"page": 1, "text": "", "confidence": None, "regions": []}],
        )

    def test_rejects_unsupported_corrupt_and_oversized_payloads(self):
        with self.assertRaisesRegex(WorkerFailure, "UNSUPPORTED_FILE_TYPE"):
            process_document(
                {"id": "synthetic-1", "mimeType": "image/tiff", "bytes": ""},
                {},
                1024,
                20,
                25_000_000,
            )

        corrupt_pdf = base64.b64encode(b"not a PDF").decode("ascii")
        with self.assertRaisesRegex(WorkerFailure, "MALFORMED_FILE"):
            process_document(
                {
                    "id": "synthetic-2",
                    "mimeType": "application/pdf",
                    "bytes": corrupt_pdf,
                },
                {},
                1024,
                20,
                25_000_000,
            )

        oversized_pdf = base64.b64encode(b"%PDF-" + b"x" * 20).decode("ascii")
        with self.assertRaisesRegex(WorkerFailure, "FILE_TOO_LARGE"):
            process_document(
                {
                    "id": "synthetic-3",
                    "mimeType": "application/pdf",
                    "bytes": oversized_pdf,
                },
                {},
                10,
                20,
                25_000_000,
            )


if __name__ == "__main__":
    unittest.main()
