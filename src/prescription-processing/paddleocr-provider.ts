import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { OcrBoundingBox, OcrPage, OcrResult } from "./prescription-candidates";
import {
  OcrProvider,
  OcrProviderError,
  OcrProviderErrorCode,
} from "./ocr-provider";

const supportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const workerErrorCodes = new Set<OcrProviderErrorCode>([
  "UNSUPPORTED_FILE_TYPE",
  "MALFORMED_FILE",
  "FILE_TOO_LARGE",
  "PAGE_LIMIT_EXCEEDED",
  "ENCRYPTED_PDF",
  "EMPTY_DOCUMENT",
  "OCR_WORKER_ERROR",
]);
const maxWorkerLineBytes = 32 * 1024 * 1024;

interface WorkerPendingRequest {
  resolve(result: OcrResult): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class PaddleOcrProvider implements OcrProvider, OnModuleDestroy {
  readonly providerName = "paddleocr";
  readonly providerVersion = "2.10.0/PP-OCRv4";

  private worker?: ChildProcessWithoutNullStreams;
  private startupPromise?: Promise<void>;
  private startupTimer?: NodeJS.Timeout;
  private pendingStartup?: {
    resolve(): void;
    reject(error: Error): void;
  };
  private readonly pending = new Map<string, WorkerPendingRequest>();
  private stdoutBuffer = Buffer.alloc(0);
  private busy = false;

  async recognize(input: {
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<OcrResult> {
    this.validateInput(input.bytes, input.mimeType);
    if (this.busy) throw new OcrProviderError("OCR_BUSY");

    this.busy = true;
    try {
      await this.startWorker();
      const worker = this.worker;
      if (!worker) throw new OcrProviderError("OCR_WORKER_UNAVAILABLE");
      const requestId = randomUUID();
      const timeoutMs = this.positiveInteger(
        process.env.PADDLEOCR_TIMEOUT_MS,
        120_000,
      );

      return await new Promise<OcrResult>((resolveResult, rejectResult) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          rejectResult(new OcrProviderError("OCR_TIMEOUT"));
          this.stopWorker(
            new OcrProviderError("OCR_WORKER_UNAVAILABLE"),
            worker,
          );
        }, timeoutMs);
        this.pending.set(requestId, {
          resolve: resolveResult,
          reject: rejectResult,
          timer,
        });

        const message = JSON.stringify({
          id: requestId,
          mimeType: input.mimeType,
          bytes: Buffer.from(input.bytes).toString("base64"),
        });
        worker.stdin.write(`${message}\n`, (error) => {
          if (!error) return;
          const pending = this.pending.get(requestId);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(requestId);
          pending.reject(new OcrProviderError("OCR_WORKER_UNAVAILABLE"));
          this.stopWorker(
            new OcrProviderError("OCR_WORKER_UNAVAILABLE"),
            worker,
          );
        });
      });
    } finally {
      this.busy = false;
    }
  }

  onModuleDestroy() {
    this.stopWorker(new OcrProviderError("OCR_WORKER_UNAVAILABLE"));
  }

  private validateInput(bytes: Uint8Array, mimeType: string) {
    if (!supportedMimeTypes.has(mimeType)) {
      throw new OcrProviderError("UNSUPPORTED_FILE_TYPE");
    }
    const maxBytes =
      this.positiveInteger(process.env.MAX_UPLOAD_MB, 15) * 1024 * 1024;
    if (bytes.byteLength > maxBytes) {
      throw new OcrProviderError("FILE_TOO_LARGE");
    }
    if (bytes.byteLength === 0) {
      throw new OcrProviderError("MALFORMED_FILE");
    }

    const isPdf =
      mimeType === "application/pdf" &&
      Buffer.from(bytes.slice(0, 5)).toString("ascii") === "%PDF-";
    const isJpeg =
      mimeType === "image/jpeg" &&
      bytes.byteLength >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    const isPng =
      mimeType === "image/png" &&
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;

    if (!isPdf && !isJpeg && !isPng) {
      throw new OcrProviderError("MALFORMED_FILE");
    }
  }

  private startWorker(): Promise<void> {
    if (this.startupPromise) return this.startupPromise;
    const python = process.env.PADDLEOCR_PYTHON || "python3";
    const workerPath = resolve(
      process.cwd(),
      process.env.PADDLEOCR_WORKER_PATH ||
        "src/prescription-processing/paddleocr_worker.py",
    );
    const useGpu = process.env.PADDLEOCR_USE_GPU === "true";
    const child = spawn(python, [workerPath], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        MAX_UPLOAD_MB: String(
          this.positiveInteger(process.env.MAX_UPLOAD_MB, 15),
        ),
        PADDLEOCR_MAX_PAGES: String(
          this.positiveInteger(process.env.PADDLEOCR_MAX_PAGES, 20),
        ),
        PADDLEOCR_MAX_PIXELS: String(
          this.positiveInteger(process.env.PADDLEOCR_MAX_PIXELS, 25_000_000),
        ),
        PADDLEOCR_USE_GPU: String(useGpu),
        PADDLE_OCR_BASE_DIR: process.env.PADDLE_OCR_BASE_DIR,
        CUDA_VISIBLE_DEVICES: useGpu ? process.env.CUDA_VISIBLE_DEVICES : "",
        OMP_NUM_THREADS: String(
          this.positiveInteger(process.env.PADDLEOCR_CPU_THREADS, 2),
        ),
      },
    });
    this.worker = child;
    this.stdoutBuffer = Buffer.alloc(0);

    this.startupPromise = new Promise<void>((resolveStartup, rejectStartup) => {
      this.pendingStartup = {
        resolve: resolveStartup,
        reject: rejectStartup,
      };
      this.startupTimer = setTimeout(
        () => {
          if (this.worker !== child) return;
          this.failStartup(new OcrProviderError("OCR_TIMEOUT"));
          this.stopWorker(
            new OcrProviderError("OCR_WORKER_UNAVAILABLE"),
            child,
          );
        },
        this.positiveInteger(process.env.PADDLEOCR_STARTUP_TIMEOUT_MS, 180_000),
      );

      child.stdout.on("data", (chunk: Buffer) => {
        if (this.worker === child) this.onWorkerOutput(chunk);
      });
      child.stderr.on("data", () => undefined);
      child.on("error", () => {
        this.stopWorker(new OcrProviderError("OCR_WORKER_UNAVAILABLE"), child);
      });
      child.on("exit", () => {
        this.stopWorker(new OcrProviderError("OCR_WORKER_UNAVAILABLE"), child);
      });
    });

    return this.startupPromise;
  }

  private onWorkerOutput(chunk: Buffer) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    if (this.stdoutBuffer.byteLength > maxWorkerLineBytes) {
      this.stopWorker(new OcrProviderError("OCR_OUTPUT_INVALID"));
      return;
    }

    let newlineIndex = this.stdoutBuffer.indexOf(0x0a);
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.subarray(0, newlineIndex).toString("utf8");
      this.stdoutBuffer = this.stdoutBuffer.subarray(newlineIndex + 1);
      if (line) this.handleWorkerMessage(line);
      newlineIndex = this.stdoutBuffer.indexOf(0x0a);
    }
  }

  private handleWorkerMessage(line: string) {
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid worker response");
      }
      message = parsed as Record<string, unknown>;
    } catch {
      this.stopWorker(new OcrProviderError("OCR_OUTPUT_INVALID"));
      return;
    }

    if (message.type === "ready") {
      this.clearStartupTimer();
      this.pendingStartup?.resolve();
      this.pendingStartup = undefined;
      return;
    }

    if (typeof message.id !== "string") {
      this.stopWorker(new OcrProviderError("OCR_OUTPUT_INVALID"));
      return;
    }
    const request = this.pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(message.id);

    if (message.ok === false) {
      const code =
        typeof message.code === "string" &&
        workerErrorCodes.has(message.code as OcrProviderErrorCode)
          ? (message.code as OcrProviderErrorCode)
          : "OCR_WORKER_ERROR";
      request.reject(new OcrProviderError(code));
      return;
    }

    try {
      request.resolve(this.normalizeResult(message.result));
    } catch {
      request.reject(new OcrProviderError("OCR_OUTPUT_INVALID"));
    }
  }

  private normalizeResult(value: unknown): OcrResult {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid OCR output");
    }
    const result = value as Record<string, unknown>;
    if (!Array.isArray(result.pages)) throw new Error("Invalid OCR pages");
    const maxPages = this.positiveInteger(process.env.PADDLEOCR_MAX_PAGES, 20);
    if (result.pages.length > maxPages) throw new Error("Page limit exceeded");

    const pages: OcrPage[] = result.pages.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid OCR page");
      }
      const page = value as Record<string, unknown>;
      if (
        !Number.isInteger(page.page) ||
        Number(page.page) < 1 ||
        typeof page.text !== "string" ||
        page.text.length > 2_000_000 ||
        !this.validConfidence(page.confidence) ||
        !Array.isArray(page.regions) ||
        page.regions.length > 10_000
      ) {
        throw new Error("Invalid OCR page");
      }
      const regions = page.regions.map((regionValue) => {
        if (!regionValue || typeof regionValue !== "object") {
          throw new Error("Invalid OCR region");
        }
        const region = regionValue as Record<string, unknown>;
        if (
          typeof region.text !== "string" ||
          region.text.length > 20_000 ||
          !this.validConfidence(region.confidence) ||
          !Array.isArray(region.boundingBox) ||
          region.boundingBox.length !== 4
        ) {
          throw new Error("Invalid OCR region");
        }
        const points = region.boundingBox.map((pointValue) => {
          if (!pointValue || typeof pointValue !== "object") {
            throw new Error("Invalid OCR bounding box");
          }
          const point = pointValue as Record<string, unknown>;
          if (
            typeof point.x !== "number" ||
            !Number.isFinite(point.x) ||
            point.x < 0 ||
            typeof point.y !== "number" ||
            !Number.isFinite(point.y) ||
            point.y < 0
          ) {
            throw new Error("Invalid OCR bounding box");
          }
          return { x: point.x, y: point.y };
        });
        return {
          text: region.text,
          confidence: region.confidence as number | null,
          boundingBox: points as OcrBoundingBox,
        };
      });

      return {
        page: Number(page.page),
        text: page.text,
        confidence: page.confidence as number | null,
        regions,
      };
    });
    if (result.status !== "completed" && result.status !== "empty") {
      throw new Error("Invalid OCR status");
    }
    if (
      !Array.isArray(result.languages) ||
      result.languages.some(
        (language) => language !== "fr" && language !== "ar",
      ) ||
      typeof result.modelVersion !== "string"
    ) {
      throw new Error("Invalid OCR metadata");
    }

    return {
      pages,
      status: result.status,
      languages: result.languages as string[],
      modelVersion: result.modelVersion,
    };
  }

  private validConfidence(value: unknown): value is number | null {
    return (
      value === null ||
      (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1)
    );
  }

  private failStartup(error: Error) {
    this.clearStartupTimer();
    this.pendingStartup?.reject(error);
    this.pendingStartup = undefined;
  }

  private clearStartupTimer() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
  }

  private stopWorker(
    error: Error,
    expectedWorker?: ChildProcessWithoutNullStreams,
  ) {
    if (expectedWorker && this.worker !== expectedWorker) return;
    this.clearStartupTimer();
    this.failStartup(error);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    const worker = this.worker;
    this.worker = undefined;
    this.startupPromise = undefined;
    this.stdoutBuffer = Buffer.alloc(0);
    if (worker && !worker.killed) worker.kill();
  }

  private positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
