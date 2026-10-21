import * as childProcess from "child_process";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { PaddleOcrProvider } from "./paddleocr-provider";

jest.mock("child_process", () => ({ spawn: jest.fn() }));

describe("PaddleOcrProvider input contract", () => {
  const provider = new PaddleOcrProvider();

  afterEach(() => {
    jest.restoreAllMocks();
    provider.onModuleDestroy();
  });

  it("identifies the pinned local PaddleOCR and model version", () => {
    expect(provider.providerName).toBe("paddleocr");
    expect(provider.providerVersion).toBe("2.10.0/PP-OCRv4");
  });

  it("rejects unsupported types and malformed signatures before starting a worker", async () => {
    await expect(
      provider.recognize({
        bytes: Buffer.from("synthetic"),
        mimeType: "image/tiff",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });

    await expect(
      provider.recognize({
        bytes: Buffer.from("synthetic"),
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_FILE" });

    await expect(
      provider.recognize({ bytes: Buffer.alloc(0), mimeType: "image/png" }),
    ).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("enforces the configured upload size cap", async () => {
    const original = process.env.MAX_UPLOAD_MB;
    process.env.MAX_UPLOAD_MB = "1";
    try {
      await expect(
        provider.recognize({
          bytes: Buffer.alloc(1024 * 1024 + 1),
          mimeType: "application/pdf",
        }),
      ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    } finally {
      if (original === undefined) delete process.env.MAX_UPLOAD_MB;
      else process.env.MAX_UPLOAD_MB = original;
    }
  });

  it("normalizes worker output and reports controlled worker errors", async () => {
    mockWorker({
      id: "request",
      ok: true,
      result: {
        status: "completed",
        languages: ["fr", "ar"],
        modelVersion: "synthetic-model",
        pages: [
          {
            page: 1,
            text: "Synthetic medicine",
            confidence: 0.91,
            regions: [
              {
                text: "Synthetic medicine",
                confidence: 0.91,
                boundingBox: [
                  { x: 1, y: 2 },
                  { x: 30, y: 2 },
                  { x: 30, y: 12 },
                  { x: 1, y: 12 },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = await provider.recognize({
      bytes: Buffer.from("%PDF-1.7 synthetic"),
      mimeType: "application/pdf",
    });

    expect(result).toMatchObject({
      status: "completed",
      languages: ["fr", "ar"],
      modelVersion: "synthetic-model",
      pages: [
        {
          page: 1,
          text: "Synthetic medicine",
          confidence: 0.91,
          regions: [
            {
              text: "Synthetic medicine",
              confidence: 0.91,
              boundingBox: [
                { x: 1, y: 2 },
                { x: 30, y: 2 },
                { x: 30, y: 12 },
                { x: 1, y: 12 },
              ],
            },
          ],
        },
      ],
    });

    provider.onModuleDestroy();
    jest.restoreAllMocks();
    mockWorker({ id: "request", ok: false, code: "ENCRYPTED_PDF" });
    await expect(
      provider.recognize({
        bytes: Buffer.from("%PDF-1.7 synthetic"),
        mimeType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "ENCRYPTED_PDF" });
  });

  it("times out and terminates a worker that does not respond", async () => {
    const original = process.env.PADDLEOCR_TIMEOUT_MS;
    process.env.PADDLEOCR_TIMEOUT_MS = "5";
    mockWorker(undefined);

    try {
      await expect(
        provider.recognize({
          bytes: Buffer.from("%PDF-1.7 synthetic"),
          mimeType: "application/pdf",
        }),
      ).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
    } finally {
      if (original === undefined) delete process.env.PADDLEOCR_TIMEOUT_MS;
      else process.env.PADDLEOCR_TIMEOUT_MS = original;
    }
  });
});

function mockWorker(response: Record<string, unknown> | undefined) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let killed = false;
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: jest.fn(() => {
      killed = true;
      setImmediate(() => child.emit("exit", null, "SIGTERM"));
      return true;
    }),
  });
  Object.defineProperty(child, "killed", { get: () => killed });

  setImmediate(() => stdout.write('{"type":"ready"}\n'));
  if (response) {
    stdin.on("data", (chunk: Buffer) => {
      const request = JSON.parse(chunk.toString("utf8")) as { id: string };
      stdout.write(`${JSON.stringify({ ...response, id: request.id })}\n`);
    });
  }

  (childProcess.spawn as jest.Mock).mockImplementation(() => child as never);
}
