import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import {
  PrescriptionExtractionController,
  PrescriptionProcessingController,
} from "../prescription-processing/prescription-processing.controller";
import { PrescriptionProcessingService } from "../prescription-processing/prescription-processing.service";
import {
  DisabledOcrProvider,
  OCR_PROVIDER,
} from "../prescription-processing/ocr-provider";
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [
    DocumentsController,
    PrescriptionProcessingController,
    PrescriptionExtractionController,
  ],
  providers: [
    PrescriptionProcessingService,
    DisabledOcrProvider,
    {
      provide: OCR_PROVIDER,
      useFactory: (disabledProvider: DisabledOcrProvider) => {
        const configuredProvider = process.env.OCR_PROVIDER || "disabled";
        if (configuredProvider !== "disabled") {
          throw new Error(
            "Only OCR_PROVIDER=disabled is supported until a reviewed provider is implemented",
          );
        }
        return disabledProvider;
      },
      inject: [DisabledOcrProvider],
    },
  ],
})
export class DocumentsModule {}
