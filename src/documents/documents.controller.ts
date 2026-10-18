import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import {
  mkdirSync,
  createReadStream,
  existsSync,
  unlinkSync,
  readFileSync,
} from "fs";
import { createHash, randomUUID } from "crypto";
import { Response } from "express";
import { Res } from "@nestjs/common";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { DocumentType } from "../common/domain-enums";
import { PrismaService } from "../prisma/prisma.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuditService } from "../audit/audit.module";
class DocumentMetaDto {
  @IsEnum(DocumentType) type!: DocumentType;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() documentDate?: string;
}
class CreateDocumentLinkDto {
  @IsString() fromDocumentId!: string;
  @IsString() toDocumentId!: string;
  @IsString() @MaxLength(80) relationship!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
const uploadDir = process.env.UPLOAD_DIR || "./var/uploads";
mkdirSync(uploadDir, { recursive: true });
@ApiTags("medical-documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get() async list(@Req() req: any, @Query("type") type?: DocumentType) {
    return this.prisma.medicalDocument.findMany({
      where: { ownerId: req.user.id, ...(type ? { type } : {}) },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        documentDate: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
      },
      orderBy: { documentDate: "desc" },
    });
  }
  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) =>
          cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
      }),
      limits: {
        fileSize: (Number(process.env.MAX_UPLOAD_MB) || 15) * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        const allowed = ["application/pdf", "image/jpeg", "image/png"];
        cb(
          allowed.includes(file.mimetype)
            ? null
            : new Error("Only PDF, JPEG and PNG are accepted"),
          allowed.includes(file.mimetype),
        );
      },
    }),
  )
  async upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: DocumentMetaDto,
  ) {
    if (!file) throw new BadRequestException("A supported file is required");
    const sha256 = createHash("sha256")
      .update(readFileSync(file.path))
      .digest("hex");
    const doc = await this.prisma.medicalDocument.create({
      data: {
        ownerId: req.user.id,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        originalFilename: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: file.filename,
        sha256,
      },
      select: {
        id: true,
        type: true,
        title: true,
        documentDate: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
      },
    });
    await this.audit.record({
      actorId: req.user.id,
      action: "DOCUMENT_UPLOADED",
      resourceType: "MedicalDocument",
      resourceId: doc.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return doc;
  }
  @Post("links") async createLink(
    @Req() req: any,
    @Body() dto: CreateDocumentLinkDto,
  ) {
    if (dto.fromDocumentId === dto.toDocumentId)
      throw new BadRequestException("A document cannot be linked to itself");
    const docs = await this.prisma.medicalDocument.findMany({
      where: {
        ownerId: req.user.id,
        id: { in: [dto.fromDocumentId, dto.toDocumentId] },
      },
      select: { id: true },
    });
    if (docs.length !== 2)
      throw new BadRequestException(
        "Both documents must belong to the authenticated patient",
      );
    return this.prisma.documentLink.create({
      data: {
        ownerId: req.user.id,
        fromDocumentId: dto.fromDocumentId,
        toDocumentId: dto.toDocumentId,
        relationship: dto.relationship,
        note: dto.note,
      },
    });
  }
  @Get(":id/links") async listLinks(@Req() req: any, @Param("id") id: string) {
    const owned = await this.prisma.medicalDocument.findFirst({
      where: { id, ownerId: req.user.id },
      select: { id: true },
    });
    if (!owned) throw new BadRequestException("Document not found");
    return this.prisma.documentLink.findMany({
      where: {
        ownerId: req.user.id,
        OR: [{ fromDocumentId: id }, { toDocumentId: id }],
      },
      include: {
        fromDocument: {
          select: { id: true, title: true, type: true, documentDate: true },
        },
        toDocument: {
          select: { id: true, title: true, type: true, documentDate: true },
        },
      },
    });
  }
  //"\]/g, '_')}"`); createReadStream(path).pipe(res); }
  @Get(":id/download") async download(
    @Req() req: any,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const doc = await this.prisma.medicalDocument.findFirst({
      where: { id, ownerId: req.user.id },
    });
    if (!doc) throw new BadRequestException("Document not found");
    const path = join(uploadDir, doc.storageKey);
    await this.audit.record({
      actorId: req.user.id,
      action: "DOCUMENT_VIEWED",
      resourceType: "MedicalDocument",
      resourceId: doc.id,
      ipAddress: req.ip,
    });
    res.setHeader("Content-Type", doc.mimeType);
    const safeFilename = doc.originalFilename
      .split('"')
      .join("_")
      .split("\\")
      .join("_")
      .split("\r")
      .join("_")
      .split("\n")
      .join("_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`,
    );
    createReadStream(path).pipe(res);
  }
  @Delete(":id") async remove(@Req() req: any, @Param("id") id: string) {
    const doc = await this.prisma.medicalDocument.findFirst({
      where: { id, ownerId: req.user.id },
    });
    if (!doc) throw new BadRequestException("Document not found");
    await this.prisma.medicalDocument.delete({ where: { id } });
    const diskPath = join(uploadDir, doc.storageKey);
    if (existsSync(diskPath)) unlinkSync(diskPath);
    await this.audit.record({
      actorId: req.user.id,
      action: "DOCUMENT_DELETED",
      resourceType: "MedicalDocument",
      resourceId: id,
    });
    return { deleted: true };
  }
}
