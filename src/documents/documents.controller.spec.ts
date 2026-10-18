jest.mock("fs", () => ({
  ...jest.requireActual<typeof import("fs")>("fs"),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock("fs/promises", () => ({
  ...jest.requireActual<typeof import("fs/promises")>("fs/promises"),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "@jest/globals";
import { validateSync } from "class-validator";
import { writeFile } from "fs/promises";
import { AuditService } from "../audit/audit.module";
import { PrismaService } from "../prisma/prisma.module";
import { PrescriptionProcessingService } from "../prescription-processing/prescription-processing.service";
import { DocumentType } from "../common/domain-enums";
import { DocumentMetaDto, DocumentsController } from "./documents.controller";

describe("DocumentsController prescription upload", () => {
  const document = {
    id: "doc-synthetic-2",
    type: DocumentType.PRESCRIPTION,
    title: "Synthetic prescription",
    status: "UPLOADED",
    createdAt: new Date("2026-05-12T00:00:00Z"),
  };
  let prisma: {
    medicalDocument: { create: jest.Mock; findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let processing: { processOnce: jest.Mock };
  let controller: DocumentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      medicalDocument: {
        create: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    processing = {
      processOnce: jest.fn().mockResolvedValue({
        status: "failed",
        errorCategory: "OCR_UNAVAILABLE",
      }),
    };
    controller = new DocumentsController(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      processing as unknown as PrescriptionProcessingService,
    );
  });

  it("accepts a valid synthetic prescription and returns safe processing status", async () => {
    const result = await controller.upload(
      {
        user: { id: "owner-synthetic" },
        ip: "127.0.0.1",
        headers: { "user-agent": "synthetic-test" },
      },
      {
        originalname: "synthetic-prescription.pdf",
        mimetype: "application/pdf",
        size: 18,
        buffer: Buffer.from("%PDF-1.7 synthetic"),
      } as Express.Multer.File,
      { type: DocumentType.PRESCRIPTION, title: "Synthetic prescription" },
    );

    expect(writeFile).toHaveBeenCalled();
    expect(prisma.medicalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner-synthetic",
          type: DocumentType.PRESCRIPTION,
        }),
      }),
    );
    expect(processing.processOnce).toHaveBeenCalledWith(
      "owner-synthetic",
      document.id,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: document.id,
        processing: {
          status: "failed",
          errorCategory: "OCR_UNAVAILABLE",
        },
      }),
    );
  });

  it("rejects malformed uploads before writing or creating a document", async () => {
    await expect(
      controller.upload(
        {
          user: { id: "owner-synthetic" },
          ip: "127.0.0.1",
          headers: {},
        },
        {
          originalname: "synthetic-prescription.pdf",
          mimetype: "application/pdf",
          size: 9,
          buffer: Buffer.from("not a PDF"),
        } as Express.Multer.File,
        { type: DocumentType.PRESCRIPTION, title: "Synthetic prescription" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.medicalDocument.create).not.toHaveBeenCalled();
    expect(processing.processOnce).not.toHaveBeenCalled();
  });

  it("does not run prescription processing for other document types", async () => {
    await controller.upload(
      {
        user: { id: "owner-synthetic" },
        ip: "127.0.0.1",
        headers: {},
      },
      {
        originalname: "synthetic-report.pdf",
        mimetype: "application/pdf",
        size: 18,
        buffer: Buffer.from("%PDF-1.7 synthetic"),
      } as Express.Multer.File,
      { type: DocumentType.MEDICAL_REPORT, title: "Synthetic report" },
    );

    expect(processing.processOnce).not.toHaveBeenCalled();
  });

  it("validates the upload metadata contract used by the API", () => {
    const valid = Object.assign(new DocumentMetaDto(), {
      type: DocumentType.PRESCRIPTION,
      title: "Synthetic prescription",
      documentDate: "2026-05-12T00:00:00.000Z",
    });
    const invalid = Object.assign(new DocumentMetaDto(), {
      type: "UNSUPPORTED",
      title: 42,
      unexpected: "not allowed",
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid).length).toBeGreaterThan(0);
  });

  it("deduplicates repeated uploads by authenticated owner, type, and content hash", async () => {
    const existing = { ...document, id: "previous-document" };
    prisma.medicalDocument.findFirst.mockResolvedValueOnce(existing);

    const result = await controller.upload(
      {
        user: { id: "owner-synthetic" },
        ip: "127.0.0.1",
        headers: {},
      },
      {
        originalname: "synthetic-prescription.pdf",
        mimetype: "application/pdf",
        size: 18,
        buffer: Buffer.from("%PDF-1.7 synthetic"),
      } as Express.Multer.File,
      { type: DocumentType.PRESCRIPTION, title: "Synthetic prescription" },
    );

    expect(prisma.medicalDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId: "owner-synthetic",
          type: DocumentType.PRESCRIPTION,
          sha256: expect.any(String),
        },
      }),
    );
    expect(prisma.medicalDocument.create).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(processing.processOnce).toHaveBeenCalledWith(
      "owner-synthetic",
      existing.id,
    );
    expect(result.id).toBe(existing.id);
  });
});
