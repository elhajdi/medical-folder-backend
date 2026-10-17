import { Injectable, Module } from "@nestjs/common";
import { PrismaModule, PrismaService } from "../prisma/prisma.module";
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  async record(input: {
    actorId?: string;
    action: any;
    resourceType?: string;
    resourceId?: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
  }) {
    return this.prisma.auditEvent.create({ data: input });
  }
}
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
