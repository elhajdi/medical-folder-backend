jest.mock("fs/promises", () => ({
  ...jest.requireActual<typeof import("fs/promises")>("fs/promises"),
  readFile: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.7 synthetic")),
}));

import { AuditAction, DocumentType } from "@prisma/client";
import { describe, expect, it } from "@jest/globals";
import { readFile } from "fs/promises";
import { AuditService } from "../audit/audit.module";
import { PrismaService } from "../prisma/prisma.module";
import { OcrProvider, OcrUnavailableError } from "./ocr-provider";
import { PrescriptionProcessingService } from "./prescription-processing.service";

describe("PrescriptionProcessingService", () => {
  const ownedDocument = {
    id: "doc-synthetic-1",
    storageKey: "synthetic.pdf",
    mimeType: "application/pdf",
  };
  let prisma: {
    medicalDocument: { findFirst: jest.Mock };
    medication: { create: jest.Mock };
    medicationReminder: { create: jest.Mock };
    prescriptionExtraction: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let audit: { record: jest.Mock };
  let provider: OcrProvider;
  let service: PrescriptionProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      medicalDocument: {
        findFirst: jest.fn().mockResolvedValue(ownedDocument),
      },
      medication: { create: jest.fn() },
      medicationReminder: { create: jest.fn() },
      prescriptionExtraction: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ data, where }) =>
          Promise.resolve({
            id: "extraction-1",
            documentId: where.documentId ?? ownedDocument.id,
            status: data.status,
            candidate: data.candidate,
            provider: "test-fake",
            providerVersion: "1",
            errorCategory: data.errorCategory,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            startedAt: new Date("2026-01-01T00:00:01Z"),
            completedAt: new Date("2026-01-01T00:00:02Z"),
            expiresAt: data.expiresAt,
          }),
        ),
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.errorCategory === "EXTRACTION_EXPIRED"
              ? null
              : {
                  documentId: ownedDocument.id,
                  status: "needs_review",
                  provider: "test-fake",
                  providerVersion: "1",
                  errorCategory: null,
                },
          ),
        ),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    provider = {
      providerName: "test-fake",
      providerVersion: "1",
      recognize: jest.fn().mockResolvedValue({
        pages: [
          {
            page: 1,
            confidence: 0.91,
            text: "Medication: Synthetic medicine\nDose: 1 tablet",
          },
        ],
      }),
    };
    service = new PrescriptionProcessingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      provider,
    );
  });

  it("processes valid synthetic OCR into an unconfirmed candidate without creating a medication", async () => {
    const result = await service.process("owner-synthetic", ownedDocument.id);

    expect(prisma.medicalDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: ownedDocument.id,
        ownerId: "owner-synthetic",
        type: DocumentType.PRESCRIPTION,
      },
      select: { id: true, storageKey: true, mimeType: true },
    });
    expect(provider.recognize).toHaveBeenCalledWith({
      bytes: Buffer.from("%PDF-1.7 synthetic"),
      mimeType: "application/pdf",
    });
    expect(result.status).toBe("needs_review");
    expect(result).toMatchObject({
      candidate: {
        reviewRequired: true,
        medications: [{ name: { value: "Synthetic medicine" } }],
      },
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + 24 * 60 * 60 * 1000,
    );
    expect(result).not.toHaveProperty("candidate.confirmed");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PRESCRIPTION_PROCESSING_STARTED,
        actorId: "owner-synthetic",
      }),
    );
    expect(prisma.medication.create).not.toHaveBeenCalled();
    expect(prisma.medicationReminder.create).not.toHaveBeenCalled();
  });

  it("records an explicit safe failure when OCR is unavailable", async () => {
    provider.recognize = jest.fn().mockRejectedValue(new OcrUnavailableError());

    const result = await service.process("owner-synthetic", ownedDocument.id);

    expect(result.status).toBe("failed");
    expect(result.errorCategory).toBe("OCR_UNAVAILABLE");
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("rawText");
  });

  it("records a safe provider error category without exposing exception text", async () => {
    provider.recognize = jest
      .fn()
      .mockRejectedValue(
        new Error("synthetic OCR payload must not be returned"),
      );

    const result = await service.process("owner-synthetic", ownedDocument.id);

    expect(result.errorCategory).toBe("OCR_PROVIDER_ERROR");
    expect(JSON.stringify(result)).not.toContain("synthetic OCR payload");
  });

  it("uses a unique document extraction and safely skips a duplicate in-flight retry", async () => {
    prisma.prescriptionExtraction.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await service.process("owner-synthetic", ownedDocument.id);

    expect(prisma.prescriptionExtraction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId: ownedDocument.id,
          ownerId: "owner-synthetic",
        },
      }),
    );
    expect(prisma.prescriptionExtraction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentId: ownedDocument.id,
          ownerId: "owner-synthetic",
        }),
      }),
    );
    expect(provider.recognize).not.toHaveBeenCalled();
    expect(result.status).toBe("needs_review");
  });

  it("marks expired candidates unavailable for review", async () => {
    await service.purgeExpiredCandidates();

    expect(prisma.prescriptionExtraction.updateMany).toHaveBeenCalledWith({
      where: {
        status: "needs_review",
        expiresAt: { lte: expect.any(Date) },
      },
      data: {
        status: "failed",
        candidate: expect.anything(),
        errorCategory: "EXTRACTION_EXPIRED",
        completedAt: expect.any(Date),
      },
    });
  });

  it("denies extraction reads for another owner and filters by both owners", async () => {
    prisma.prescriptionExtraction.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getExtraction("other-synthetic-owner", ownedDocument.id),
    ).rejects.toThrow("Prescription extraction not found");

    expect(prisma.prescriptionExtraction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId: ownedDocument.id,
          ownerId: "other-synthetic-owner",
          document: {
            ownerId: "other-synthetic-owner",
            type: DocumentType.PRESCRIPTION,
          },
        },
      }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("audits status access and returns only safe processing metadata", async () => {
    const result = await service.getStatus("owner-synthetic", ownedDocument.id);

    expect(result).toEqual(
      expect.objectContaining({
        status: "needs_review",
        provider: "test-fake",
        providerVersion: "1",
      }),
    );
    expect(result).not.toHaveProperty("candidate");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PRESCRIPTION_EXTRACTION_VIEWED,
        actorId: "owner-synthetic",
      }),
    );
  });

  it("denies status access for another owner", async () => {
    prisma.prescriptionExtraction.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getStatus("other-synthetic-owner", ownedDocument.id),
    ).rejects.toThrow("Processing status not found");

    expect(audit.record).not.toHaveBeenCalled();
  });

  it("does not begin processing a document owned by another patient", async () => {
    prisma.medicalDocument.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.process("other-synthetic-owner", ownedDocument.id),
    ).rejects.toThrow("Prescription document not found");

    expect(prisma.prescriptionExtraction.upsert).not.toHaveBeenCalled();
    expect(provider.recognize).not.toHaveBeenCalled();
  });

  it("keeps raw OCR text out of persisted extraction data", async () => {
    await service.process("owner-synthetic", ownedDocument.id);

    const updateData =
      prisma.prescriptionExtraction.update.mock.calls[0][0].data;
    expect(JSON.stringify(updateData)).not.toContain(
      "Medication: Synthetic medicine",
    );
    expect(readFile).toHaveBeenCalled();
  });
});
