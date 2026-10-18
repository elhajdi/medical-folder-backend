import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrescriptionProcessingService } from "./prescription-processing.service";

@ApiTags("prescription-processing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class PrescriptionProcessingController {
  constructor(private readonly processing: PrescriptionProcessingService) {}

  @Get(":id/processing-status")
  getStatus(@Req() req: any, @Param("id") id: string) {
    return this.processing.getStatus(req.user.id, id);
  }

  @Post(":id/process")
  process(@Req() req: any, @Param("id") id: string) {
    return this.processing.process(req.user.id, id);
  }
}

@ApiTags("prescription-processing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("prescriptions")
export class PrescriptionExtractionController {
  constructor(private readonly processing: PrescriptionProcessingService) {}

  @Get(":prescriptionId/extraction")
  getExtraction(
    @Req() req: any,
    @Param("prescriptionId") prescriptionId: string,
  ) {
    return this.processing.getExtraction(req.user.id, prescriptionId);
  }
}
