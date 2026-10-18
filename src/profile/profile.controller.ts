import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { PrismaService } from "../prisma/prisma.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuditService } from "../audit/audit.module";
class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() preferredLanguage?: string;
  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
}
@ApiTags("profile")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("profile")
export class ProfileController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get() async get(@Req() req: any) {
    return this.prisma.patientProfile.findUnique({
      where: { userId: req.user.id },
    });
  }
  @Put() async update(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const data = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      phone: dto.phone,
      preferredLanguage: dto.preferredLanguage,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
    };
    const result = await this.prisma.patientProfile.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...data },
      update: data,
    });
    await this.audit.record({
      actorId: req.user.id,
      action: "PROFILE_UPDATED",
      resourceType: "PatientProfile",
      resourceId: result.id,
    });
    return result;
  }
}
