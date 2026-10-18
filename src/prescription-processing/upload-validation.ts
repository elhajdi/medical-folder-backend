export interface UploadFileMetadata {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Uint8Array;
}

const supportedTypes = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);

export function validatePrescriptionUpload(
  file: UploadFileMetadata,
  maxBytes: number,
): string {
  const extension = file.originalname.match(/\.[^.\\/]+$/)?.[0].toLowerCase();
  const expectedMime = extension ? supportedTypes.get(extension) : undefined;
  if (!extension || !expectedMime || expectedMime !== file.mimetype) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  if (file.size > maxBytes) throw new Error("FILE_TOO_LARGE");
  if (file.size !== file.buffer.byteLength || file.size === 0) {
    throw new Error("MALFORMED_FILE");
  }

  const bytes = file.buffer;
  const isPdf =
    file.mimetype === "application/pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const isJpeg =
    file.mimetype === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    file.mimetype === "image/png" &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (!isPdf && !isJpeg && !isPng) throw new Error("MALFORMED_FILE");
  return extension;
}
