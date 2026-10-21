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
import { PaddleOcrProvider } from "../prescription-processing/paddleocr-provider";
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
    PaddleOcrProvider,
    {
      provide: OCR_PROVIDER,
      useFactory: (
        disabledProvider: DisabledOcrProvider,
        paddleOcrProvider: PaddleOcrProvider,
      ) => {
        const configuredProvider = process.env.OCR_PROVIDER || "disabled";
        if (configuredProvider === "disabled") return disabledProvider;
        if (configuredProvider === "paddleocr") return paddleOcrProvider;
        throw new Error(
          `Unsupported OCR_PROVIDER=${configuredProvider}; supported values are disabled and paddleocr`,
        );
      },
      inject: [DisabledOcrProvider, PaddleOcrProvider],
    },
  ],
})
export class DocumentsModule {}
