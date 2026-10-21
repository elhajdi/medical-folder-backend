import { Injectable } from "@nestjs/common";
import { OcrResult } from "./prescription-candidates";

export const OCR_PROVIDER = "OCR_PROVIDER";

export interface OcrProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  recognize(input: { bytes: Uint8Array; mimeType: string }): Promise<OcrResult>;
}

export type OcrProviderErrorCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "MALFORMED_FILE"
  | "FILE_TOO_LARGE"
  | "PAGE_LIMIT_EXCEEDED"
  | "ENCRYPTED_PDF"
  | "EMPTY_DOCUMENT"
  | "EMPTY_OCR_RESULT"
  | "OCR_TIMEOUT"
  | "OCR_WORKER_UNAVAILABLE"
  | "OCR_WORKER_ERROR"
  | "OCR_BUSY"
  | "OCR_OUTPUT_INVALID";

export class OcrProviderError extends Error {
  constructor(readonly code: OcrProviderErrorCode) {
    super(code);
    this.name = "OcrProviderError";
  }
}

export class OcrUnavailableError extends Error {
  constructor() {
    super("OCR provider is not configured");
    this.name = "OcrUnavailableError";
  }
}

@Injectable()
export class DisabledOcrProvider implements OcrProvider {
  readonly providerName = "disabled";
  readonly providerVersion = "none";

  async recognize(_input: {
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<OcrResult> {
    throw new OcrUnavailableError();
  }
}
