import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
