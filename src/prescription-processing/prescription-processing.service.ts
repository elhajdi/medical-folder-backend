import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve, sep } from "path";
import { AuditService } from "../audit/audit.module";
import { AuditAction, DocumentType } from "../common/domain-enums";
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

function parseCandidateDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  async process(ownerId: string, documentId: string): Promise<any> {
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
    const existing = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId, ownerId },
      select: { id: true, status: true, ownerId: true, confirmedAt: true },
    });
    if (existing?.status === "confirmed") {
      throw new ConflictException(
        "Prescription already confirmed; a new document or explicit re-confirmation is required before reprocessing.",
      );
    }
    if (existing?.status === "processing") {
      return this.getStatus(ownerId, documentId);
    }

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

    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId },
      select: { id: true },
    });
    if (!extraction) throw new NotFoundException("Prescription extraction not found");

    const result = await this.prisma.prescriptionExtraction.update({
      where: { id: extraction.id },
      data: {
        status: "needs_review",
        candidate: candidateToJson(candidate) as Prisma.InputJsonValue,
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
    return result;
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
        confirmedAt: true,
        rejectedAt: true,
        rejectedReason: true,
        version: true,
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
        confirmation: true,
        provider: true,
        providerVersion: true,
        errorCategory: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
        confirmedAt: true,
        rejectedAt: true,
        rejectedReason: true,
        version: true,
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

  async reviewExtraction(ownerId: string, documentId: string, patch: unknown) {
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId, ownerId, document: { ownerId, type: DocumentType.PRESCRIPTION } },
      select: { id: true, status: true, candidate: true, version: true },
    });
    if (!extraction) throw new NotFoundException("Prescription extraction not found");
    if (extraction.status === "confirmed") {
      throw new ConflictException("Confirmed prescription data cannot be edited in place");
    }
    if (extraction.status !== "needs_review") {
      throw new BadRequestException("Only a needs_review extraction can be edited");
    }
    const candidate = this.sanitizeCandidate(extraction.candidate as Record<string, unknown> | null, patch);
    const result = await this.prisma.prescriptionExtraction.update({
      where: { id: extraction.id },
      data: {
        status: "needs_review",
        candidate: candidate as Prisma.InputJsonValue,
        updatedAt: new Date(),
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
        correctedAt: true,
      } as any,
    });
    await this.audit.record({
      actorId: ownerId,
      action: AuditAction.PRESCRIPTION_EXTRACTION_REVIEWED,
      resourceType: "PrescriptionExtraction",
      resourceId: documentId,
      metadata: { view: "review" },
    });
    return result;
  }

  async rejectExtraction(ownerId: string, documentId: string, reason?: string) {
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId, ownerId, document: { ownerId, type: DocumentType.PRESCRIPTION } },
      select: { id: true, status: true, candidate: true },
    });
    if (!extraction) throw new NotFoundException("Prescription extraction not found");
    if (extraction.status === "confirmed") {
      throw new ConflictException("A confirmed prescription cannot be rejected");
    }
    if (extraction.status === "rejected") {
      return this.prisma.prescriptionExtraction.findFirst({
        where: { id: extraction.id },
        select: { documentId: true, status: true, candidate: true, rejectedAt: true, rejectedReason: true },
      });
    }
    const result = await this.prisma.prescriptionExtraction.update({
      where: { id: extraction.id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedReason: reason || "REJECTED_BY_PATIENT",
        expiresAt: null,
      },
      select: {
        documentId: true,
        status: true,
        candidate: true,
        rejectedAt: true,
        rejectedReason: true,
        version: true,
      },
    });
    await this.audit.record({
      actorId: ownerId,
      action: AuditAction.PRESCRIPTION_REJECTED,
      resourceType: "PrescriptionExtraction",
      resourceId: documentId,
      metadata: { rejectedReason: result.rejectedReason ?? "REJECTED_BY_PATIENT" },
    });
    return result;
  }

  async confirmExtraction(ownerId: string, documentId: string, payload?: Record<string, unknown>) {
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId, ownerId, document: { ownerId, type: DocumentType.PRESCRIPTION } },
      select: {
        id: true,
        status: true,
        candidate: true,
        version: true,
        documentId: true,
      },
    });
    if (!extraction) throw new NotFoundException("Prescription extraction not found");
    if (extraction.status === "confirmed") {
      return this.prisma.prescriptionExtraction.findFirst({
        where: { id: extraction.id },
        select: { documentId: true, status: true, confirmation: true, confirmedAt: true },
      });
    }
    if (extraction.status !== "needs_review") {
      throw new BadRequestException("Only a needs_review extraction can be confirmed");
    }

    const candidate = this.sanitizeCandidate(extraction.candidate as Record<string, unknown> | null, payload ?? undefined, true);
    const requiredDate = parseCandidateDate(
      (candidate.prescriptionDate as Record<string, unknown> | null)?.value ?? null,
    );
    const medications = Array.isArray(candidate.medications)
      ? (candidate.medications as Record<string, unknown>[])
      : [];
    if (!requiredDate || medications.length === 0)
      throw new BadRequestException(
        "Prescription cannot be confirmed until required date and medication details are present",
      );
    for (const medication of medications) {
      const name = (medication?.name as Record<string, unknown> | null)?.value;
      const dose =
        (medication?.dose as Record<string, unknown> | null)?.value ??
        (medication?.strength as Record<string, unknown> | null)?.value;
      const frequency =
        (medication?.frequency as Record<string, unknown> | null)?.value;
      if (!name || !dose || !frequency) {
        throw new BadRequestException(
          "Prescription cannot be confirmed until required medication fields are complete",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.prescriptionExtraction.findFirst({
        where: { id: extraction.id },
        select: { id: true, status: true, confirmation: true },
      });
      if (current?.status === "confirmed") {
        return tx.prescriptionExtraction.findFirst({
          where: { id: current.id },
          select: { documentId: true, status: true, confirmation: true, confirmedAt: true },
        });
      }

      const now = new Date();
      const createdMedications = await Promise.all(
        medications.map(async (medication) => {
          const medicationName = (medication.name as Record<string, unknown> | null)?.value;
          const medicationDose =
            (medication.dose as Record<string, unknown> | null)?.value ??
            (medication.strength as Record<string, unknown> | null)?.value;
          const medicationInstructions =
            (medication.instructions as Record<string, unknown> | null)?.value ??
            (medication.frequency as Record<string, unknown> | null)?.value ??
            null;

          return tx.medication.create({
            data: {
              ownerId,
              name: String(medicationName ?? "Medication"),
              dosage: String(medicationDose ?? "As directed"),
              instructions: medicationInstructions ? String(medicationInstructions) : null,
              startDate: requiredDate,
              status: "ACTIVE",
              sourceDocumentId: documentId,
              confirmedByPatientAt: now,
            },
          });
        }),
      );

      const result = await tx.prescriptionExtraction.update({
        where: { id: extraction.id },
        data: {
          status: "confirmed",
          confirmation: { ...candidate, confirmedAt: now.toISOString() },
          confirmedAt: now,
          rejectedAt: null,
          rejectedReason: null,
          version: { increment: 1 },
          expiresAt: null,
        },
        select: {
          documentId: true,
          status: true,
          confirmation: true,
          confirmedAt: true,
          version: true,
        },
      });
      await this.audit.record({
        actorId: ownerId,
        action: AuditAction.PRESCRIPTION_CONFIRMED,
        resourceType: "PrescriptionExtraction",
        resourceId: documentId,
        metadata: { medicationsCreated: createdMedications.length },
      });
      return { ...result, medications: createdMedications };
    });
  }

  private sanitizeCandidate(
    existing: Record<string, unknown> | null,
    patch: unknown,
    isConfirmation = false,
  ): Record<string, unknown> {
    if (patch !== undefined && patch !== null && typeof patch !== "object") {
      throw new BadRequestException("Prescription review payload must be an object");
    }
    const base = (existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}) as Record<string, unknown>;
    const input = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
    const candidate: Record<string, unknown> = { ...base, ...input };

    if (candidate.prescriptionDate !== undefined && candidate.prescriptionDate !== null) {
      this.validateCandidateField(candidate.prescriptionDate, "prescriptionDate", isConfirmation);
    }
    if (candidate.clinician !== undefined && candidate.clinician !== null) {
      this.validateCandidateField(candidate.clinician, "clinician", isConfirmation);
    }
    if (candidate.facility !== undefined && candidate.facility !== null) {
      this.validateCandidateField(candidate.facility, "facility", isConfirmation);
    }
    if (candidate.medications !== undefined && candidate.medications !== null) {
      if (!Array.isArray(candidate.medications)) {
        throw new BadRequestException("medications must be an array");
      }
      candidate.medications = candidate.medications.map((medication) => {
        if (!medication || typeof medication !== "object" || Array.isArray(medication)) {
          throw new BadRequestException("Each medication entry must be an object");
        }
        for (const fieldName of [
          "name",
          "strength",
          "form",
          "dose",
          "route",
          "frequency",
          "duration",
          "quantity",
          "instructions",
        ]) {
          const value = (medication as Record<string, unknown>)[fieldName];
          if (value !== undefined && value !== null) {
            this.validateCandidateField(value, `${fieldName}`, isConfirmation);
          }
        }
        return medication;
      });
    }
    if (candidate.warnings !== undefined && candidate.warnings !== null) {
      if (!Array.isArray(candidate.warnings) || candidate.warnings.some((warning) => typeof warning !== "string")) {
        throw new BadRequestException("warnings must be an array of strings");
      }
    }
    if (candidate.reviewRequired !== undefined && typeof candidate.reviewRequired !== "boolean") {
      throw new BadRequestException("reviewRequired must be a boolean");
    }
    return candidate;
  }

  private validateCandidateField(value: unknown, fieldName: string, isConfirmation = false) {
    if (value === null) return;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an object or null`);
    }
    const field = value as Record<string, unknown>;
    if ("value" in field && field.value !== undefined && typeof field.value !== "string" && field.value !== null) {
      throw new BadRequestException(`${fieldName}.value must be a string or null`);
    }
    if ("confidence" in field && field.confidence !== undefined && (typeof field.confidence !== "number" || Number.isNaN(field.confidence))) {
      throw new BadRequestException(`${fieldName}.confidence must be a number or null`);
    }
    if ("source" in field && field.source !== undefined && field.source !== null) {
      if (typeof field.source !== "object" || Array.isArray(field.source)) {
        throw new BadRequestException(`${fieldName}.source must be an object or null`);
      }
      const source = field.source as Record<string, unknown>;
      if ("page" in source && source.page !== undefined && (typeof source.page !== "number" || Number.isNaN(source.page))) {
        throw new BadRequestException(`${fieldName}.source.page must be a number or null`);
      }
    }
    if (isConfirmation && field.value === null && fieldName === "prescriptionDate") {
      throw new BadRequestException("Prescription date is required for confirmation");
    }
  }

  private async fail(
    ownerId: string,
    documentId: string,
    errorCategory: string,
    correlationId: string,
    startedAt: number,
  ) {
    const extraction = await this.prisma.prescriptionExtraction.findFirst({
      where: { documentId },
      select: { id: true },
    });
    if (!extraction) return null;
    const result = await this.prisma.prescriptionExtraction.update({
      where: { id: extraction.id },
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
    return result;
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
