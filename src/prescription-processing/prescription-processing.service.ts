import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { AuditAction, DocumentType, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve, sep } from "path";
import { AuditService } from "../audit/audit.module";
import { PrismaService } from "../prisma/prisma.module";
import {
  CandidateField,
  PrescriptionCandidate,
} from "./prescription-candidates";
import { PrescriptionParser } from "./prescription-parser";
import { OCR_PROVIDER, OcrProvider, OcrUnavailableError } from "./ocr-provider";

const uploadDirectory = resolve(process.env.UPLOAD_DIR || "./var/uploads");

function candidateToJson(
  candidate: PrescriptionCandidate,
): Prisma.InputJsonValue {
  const field = (value: CandidateField): Prisma.InputJsonObject => ({
    value: value.value,
    confidence: value.confidence,
    source: value.source ? { page: value.source.page } : null,
  });
  return {
    prescriptionDate: field(candidate.prescriptionDate),
    clinician: field(candidate.clinician),
    facility: field(candidate.facility),
    medications: candidate.medications.map((medication) => ({
      name: field(medication.name),
      strength: field(medication.strength),
      form: field(medication.form),
      dose: field(medication.dose),
      route: field(medication.route),
      frequency: field(medication.frequency),
      duration: field(medication.duration),
      quantity: field(medication.quantity),
      instructions: field(medication.instructions),
    })),
    warnings: candidate.warnings,
    reviewRequired: true,
  };
}

@Injectable()
export class PrescriptionProcessingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrescriptionProcessingService.name);
  private readonly parser = new PrescriptionParser();
  private retentionTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
  ) {}

  async onModuleInit() {
    this.extractionExpiry();
    await this.purgeExpiredCandidates();
    this.retentionTimer = setInterval(() => {
      void this.purgeExpiredCandidates().catch(() => {
        this.logger.error(
          JSON.stringify({
            correlationId: randomUUID(),
            status: "failed",
            durationMs: 0,
            provider: this.ocrProvider.providerName,
            providerVersion: this.ocrProvider.providerVersion,
            errorCategory: "RETENTION_PURGE_FAILED",
          }),
        );
      });
    }, 60_000);
    this.retentionTimer.unref();
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  async process(ownerId: string, documentId: string) {
    const document = await this.prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        ownerId,
        type: DocumentType.PRESCRIPTION,
      },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
      },
    });
    if (!document)
      throw new NotFoundException("Prescription document not found");

    await this.purgeExpiredCandidates();
    const expired = await this.prisma.prescriptionExtraction.findFirst({
      where: {
        documentId,
        ownerId,
        status: "failed",
        errorCategory: "EXTRACTION_EXPIRED",
      },
      select: { documentId: true },
    });
    if (expired) {
      throw new ConflictException(
        "Prescription extraction expired; upload a new document to process again",
      );
    }

    const now = new Date();
    await this.prisma.prescriptionExtraction.upsert({
      where: { documentId, ownerId },
      create: {
        documentId,
        ownerId,
        status: "queued",
        provider: this.ocrProvider.providerName,
        providerVersion: this.ocrProvider.providerVersion,
      },
      update: { updatedAt: now },
    });

    const claim = await this.prisma.prescriptionExtraction.updateMany({
      where: {
        documentId,
        ownerId,
        status: { not: "processing" },
      },
      data: {
        status: "processing",
        candidate: Prisma.DbNull,
        provider: this.ocrProvider.providerName,
        providerVersion: this.ocrProvider.providerVersion,
        errorCategory: null,
        startedAt: now,
        completedAt: null,
      },
    });

    if (claim.count === 0) return this.getStatus(ownerId, documentId);

    const correlationId = randomUUID();
    const startedAt = Date.now();
    await this.audit.record({
      actorId: ownerId,
      action: AuditAction.PRESCRIPTION_PROCESSING_STARTED,
      resourceType: "PrescriptionExtraction",
      resourceId: documentId,
      metadata: { correlationId },
    });

    const sourcePath = resolve(uploadDirectory, document.storageKey);
    if (
      sourcePath !== uploadDirectory &&
      !sourcePath.startsWith(`${uploadDirectory}${sep}`)
    ) {
      return this.fail(
        ownerId,
        documentId,
        "SOURCE_UNAVAILABLE",
        correlationId,
        startedAt,
      );
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(sourcePath);
    } catch {
      return this.fail(
        ownerId,
        documentId,
        "SOURCE_UNAVAILABLE",
        correlationId,
        startedAt,
      );
    }

    let ocrResult;
    try {
      ocrResult = await this.ocrProvider.recognize({
        bytes,
        mimeType: document.mimeType,
      });
    } catch (error) {
      return this.fail(
        ownerId,
        documentId,
        error instanceof OcrUnavailableError
          ? "OCR_UNAVAILABLE"
          : "OCR_PROVIDER_ERROR",
        correlationId,
        startedAt,
      );
    }

    let candidate;
    try {
      candidate = this.parser.parse(ocrResult.pages);
    } catch {
      return this.fail(
        ownerId,
        documentId,
        "EXTRACTION_FAILED",
        correlationId,
        startedAt,
      );
    }

    const extraction = await this.prisma.prescriptionExtraction.update({
      where: { documentId, ownerId },
      data: {
        status: "needs_review",
        candidate: candidateToJson(candidate),
        errorCategory: null,
        completedAt: new Date(),
        expiresAt: this.extractionExpiry(),
      },
      select: {
        id: true,
        documentId: true,
        status: true,
        candidate: true,
        provider: true,
        providerVersion: true,
        errorCategory: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
      },
    });
    this.logOutcome(correlationId, "needs_review", null, startedAt);
    return extraction;
  }

  async processOnce(ownerId: string, documentId: string) {
    const existing = await this.prisma.prescriptionExtraction.findFirst({
      where: {
        documentId,
        ownerId,
        document: {
          ownerId,
          type: DocumentType.PRESCRIPTION,
        },
      },
      select: { documentId: true },
    });
    if (!existing) await this.process(ownerId, documentId);
    return this.getStatus(ownerId, documentId);
  }

  async getStatus(ownerId: string, documentId: string) {
    await this.purgeExpiredCandidates();
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: {
        documentId,
        ownerId,
        document: {
          ownerId,
          type: DocumentType.PRESCRIPTION,
        },
      },
      select: {
        documentId: true,
        status: true,
        provider: true,
        providerVersion: true,
        errorCategory: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
      },
    });
    if (!extraction) throw new NotFoundException("Processing status not found");
    await this.audit.record({
      actorId: ownerId,
      action: AuditAction.PRESCRIPTION_EXTRACTION_VIEWED,
      resourceType: "PrescriptionExtraction",
      resourceId: documentId,
      metadata: { view: "status" },
    });
    return extraction;
  }

  async getExtraction(ownerId: string, documentId: string) {
    await this.purgeExpiredCandidates();
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: {
        documentId,
        ownerId,
        document: {
          ownerId,
          type: DocumentType.PRESCRIPTION,
        },
      },
      select: {
        documentId: true,
        status: true,
        candidate: true,
        provider: true,
        providerVersion: true,
        errorCategory: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
      },
    });
    if (!extraction)
      throw new NotFoundException("Prescription extraction not found");

    await this.audit.record({
      actorId: ownerId,
      action: AuditAction.PRESCRIPTION_EXTRACTION_VIEWED,
      resourceType: "PrescriptionExtraction",
      resourceId: documentId,
    });
    return extraction;
  }

  private async fail(
    ownerId: string,
    documentId: string,
    errorCategory: string,
    correlationId: string,
    startedAt: number,
  ) {
    const extraction = await this.prisma.prescriptionExtraction.update({
      where: { documentId, ownerId },
      data: {
        status: "failed",
        candidate: Prisma.DbNull,
        errorCategory,
        completedAt: new Date(),
        expiresAt: null,
      },
      select: {
        id: true,
        documentId: true,
        status: true,
        candidate: true,
        provider: true,
        providerVersion: true,
        errorCategory: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
      },
    });
    this.logOutcome(correlationId, "failed", errorCategory, startedAt);
    return extraction;
  }

  async purgeExpiredCandidates() {
    await this.prisma.prescriptionExtraction.updateMany({
      where: {
        status: "needs_review",
        expiresAt: { lte: new Date() },
      },
      data: {
        status: "failed",
        candidate: Prisma.DbNull,
        errorCategory: "EXTRACTION_EXPIRED",
        completedAt: new Date(),
      },
    });
  }

  private extractionExpiry() {
    const hours = Number(process.env.EXTRACTION_RETENTION_HOURS || "24");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw new Error("EXTRACTION_RETENTION_HOURS must be between 0 and 24");
    }
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private logOutcome(
    correlationId: string,
    status: string,
    errorCategory: string | null,
    startedAt: number,
  ) {
    this.logger.log(
      JSON.stringify({
        correlationId,
        status,
        durationMs: Date.now() - startedAt,
        provider: this.ocrProvider.providerName,
        providerVersion: this.ocrProvider.providerVersion,
        errorCategory,
      }),
    );
  }
}
