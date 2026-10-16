import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
@Module({ imports: [PrismaModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'unsafe-dev-secret-change-me', signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any } })], controllers: [AuthController], providers: [AuthService, JwtAuthGuard], exports: [JwtAuthGuard, JwtModule, AuthService] }) export class AuthModule {}
