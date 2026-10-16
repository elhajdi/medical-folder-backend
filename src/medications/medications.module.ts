import { Module } from '@nestjs/common'; import { MedicationsController } from './medications.controller'; import { PrismaModule } from '../prisma/prisma.module'; import { AuthModule } from '../auth/auth.module'; import { AuditModule } from '../audit/audit.module';
@Module({ imports: [PrismaModule, AuthModule, AuditModule], controllers: [MedicationsController] }) export class MedicationsModule {}
