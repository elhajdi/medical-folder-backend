import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.module";
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}
  async register(email: string, password: string) {
    const normalized = email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email: normalized } }))
      throw new ConflictException("Email already registered");
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { email: normalized, passwordHash, profile: { create: {} } },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return {
      user,
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
    };
  }
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(password, user.passwordHash))
    )
      throw new UnauthorizedException("Invalid credentials");
    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
    };
  }
}
