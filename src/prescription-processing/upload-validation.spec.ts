import { describe, expect, it } from "@jest/globals";
import { validatePrescriptionUpload } from "./upload-validation";

describe("validatePrescriptionUpload", () => {
  it("accepts a valid synthetic PDF with matching extension, MIME, size, and signature", () => {
    const bytes = Buffer.from("%PDF-1.7 synthetic");
    expect(
      validatePrescriptionUpload(
        {
          originalname: "synthetic-prescription.pdf",
          mimetype: "application/pdf",
          size: bytes.byteLength,
          buffer: bytes,
        },
        1024,
      ),
    ).toBe(".pdf");
  });

  it("rejects unsupported extensions and mismatched MIME types", () => {
    const bytes = Buffer.from("%PDF-1.7 synthetic");
    expect(() =>
      validatePrescriptionUpload(
        {
          originalname: "synthetic-prescription.txt",
          mimetype: "application/pdf",
          size: bytes.byteLength,
          buffer: bytes,
        },
        1024,
      ),
    ).toThrow("UNSUPPORTED_FILE_TYPE");
    expect(() =>
      validatePrescriptionUpload(
        {
          originalname: "synthetic-prescription.pdf",
          mimetype: "image/png",
          size: bytes.byteLength,
          buffer: bytes,
        },
        1024,
      ),
    ).toThrow("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects files larger than the configured cap", () => {
    const bytes = Buffer.from("%PDF-1.7 synthetic");
    expect(() =>
      validatePrescriptionUpload(
        {
          originalname: "synthetic-prescription.pdf",
          mimetype: "application/pdf",
          size: bytes.byteLength,
          buffer: bytes,
        },
        4,
      ),
    ).toThrow("FILE_TOO_LARGE");
  });

  it("rejects malformed signatures and empty files", () => {
    for (const bytes of [Buffer.from("not a PDF"), Buffer.alloc(0)]) {
      expect(() =>
        validatePrescriptionUpload(
          {
            originalname: "synthetic-prescription.pdf",
            mimetype: "application/pdf",
            size: bytes.byteLength,
            buffer: bytes,
          },
          1024,
        ),
      ).toThrow("MALFORMED_FILE");
    }
  });
});
