import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { DocumentsModule } from './documents/documents.module';
import { MedicationsModule } from './medications/medications.module';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]), PrismaModule, AuthModule, ProfileModule, DocumentsModule, MedicationsModule, AiModule, AuditModule], controllers: [HealthController] })
export class AppModule {}
