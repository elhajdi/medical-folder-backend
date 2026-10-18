import { Injectable } from "@nestjs/common";
import { OcrResult } from "./prescription-candidates";

export const OCR_PROVIDER = "OCR_PROVIDER";

export interface OcrProvider {
  readonly providerName: string;
  readonly providerVersion: string;
  recognize(input: { bytes: Uint8Array; mimeType: string }): Promise<OcrResult>;
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
