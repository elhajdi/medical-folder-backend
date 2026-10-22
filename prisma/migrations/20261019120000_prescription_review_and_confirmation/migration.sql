ALTER TYPE "AuditAction" ADD VALUE 'PRESCRIPTION_EXTRACTION_REVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PRESCRIPTION_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'PRESCRIPTION_REJECTED';

ALTER TABLE "PrescriptionExtraction"
    ADD COLUMN "confirmation" JSONB,
    ADD COLUMN "confirmedAt" TIMESTAMP(3),
    ADD COLUMN "rejectedAt" TIMESTAMP(3),
    ADD COLUMN "rejectedReason" TEXT,
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "PrescriptionExtraction_ownerId_documentId_idx"
    ON "PrescriptionExtraction"("ownerId", "documentId");
