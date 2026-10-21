import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrescriptionProcessingService } from "./prescription-processing.service";

class CandidateSourceDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  regionIndex?: number | null;

  @ApiPropertyOptional({ type: () => CandidateBoundingBoxDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateBoundingBoxDto)
  boundingBox?: CandidateBoundingBoxDto | null;
}

class CandidatePointDto {
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsNumber()
  @Min(0)
  x!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsNumber()
  @Min(0)
  y!: number;
}

class CandidateBoundingBoxDto {
  @ApiPropertyOptional({
    type: CandidatePointDto,
    isArray: true,
    minItems: 4,
    maxItems: 4,
  })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CandidatePointDto)
  points!: CandidatePointDto[];
}

class CandidateFieldDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  value?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number | null;

  @ApiPropertyOptional({ type: CandidateSourceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateSourceDto)
  source?: CandidateSourceDto | null;
}

class MedicationCandidateDto {
  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  name?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  strength?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  form?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  dose?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  route?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  frequency?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  duration?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  quantity?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  instructions?: CandidateFieldDto | null;
}

class PrescriptionCandidateReviewDto {
  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  prescriptionDate?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  clinician?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: CandidateFieldDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateFieldDto)
  facility?: CandidateFieldDto | null;

  @ApiPropertyOptional({ type: MedicationCandidateDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationCandidateDto)
  medications?: MedicationCandidateDto[] | null;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[] | null;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  reviewRequired?: boolean;
}

class RejectPrescriptionDto {
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

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

  @Patch(":prescriptionId/extraction")
  @ApiOperation({
    summary: "Save patient corrections to a prescription candidate",
    description:
      "Updates an unconfirmed candidate owned by the authenticated patient. This does not create or update confirmed medication records.",
  })
  reviewExtraction(
    @Req() req: any,
    @Param("prescriptionId") prescriptionId: string,
    @Body() patch: PrescriptionCandidateReviewDto,
  ) {
    return this.processing.reviewExtraction(req.user.id, prescriptionId, patch);
  }

  @Post(":prescriptionId/confirm")
  @ApiOperation({
    summary: "Confirm a reviewed prescription candidate",
    description:
      "Patient confirmation may create medication records after required candidate fields have been validated. Confirmation is not clinician verification or medical advice.",
  })
  confirmExtraction(
    @Req() req: any,
    @Param("prescriptionId") prescriptionId: string,
    @Body() payload: PrescriptionCandidateReviewDto,
  ) {
    return this.processing.confirmExtraction(
      req.user.id,
      prescriptionId,
      payload as Record<string, unknown>,
    );
  }

  @Post(":prescriptionId/reject")
  @ApiOperation({
    summary: "Reject a prescription candidate",
    description:
      "Marks an unconfirmed prescription candidate as rejected for the authenticated patient.",
  })
  rejectExtraction(
    @Req() req: any,
    @Param("prescriptionId") prescriptionId: string,
    @Body() payload: RejectPrescriptionDto,
  ) {
    return this.processing.rejectExtraction(
      req.user.id,
      prescriptionId,
      payload?.reason,
    );
  }
}
