import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./dto";
@ApiTags("authentication")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post("register") register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }
  @Post("login") login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }
}
