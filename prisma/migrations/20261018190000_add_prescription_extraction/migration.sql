ALTER TYPE "AuditAction" ADD VALUE 'PRESCRIPTION_PROCESSING_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'PRESCRIPTION_EXTRACTION_VIEWED';

CREATE TABLE "PrescriptionExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "candidate" JSONB,
    "provider" TEXT NOT NULL,
    "providerVersion" TEXT,
    "errorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrescriptionExtraction_documentId_key"
    ON "PrescriptionExtraction"("documentId");
CREATE INDEX "PrescriptionExtraction_ownerId_status_idx"
    ON "PrescriptionExtraction"("ownerId", "status");
ALTER TABLE "PrescriptionExtraction"
    ADD CONSTRAINT "PrescriptionExtraction_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "MedicalDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionExtraction"
    ADD CONSTRAINT "PrescriptionExtraction_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MedicalDocument_ownerId_type_sha256_idx"
    ON "MedicalDocument"("ownerId", "type", "sha256");
