import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
export class RegisterDto { @IsEmail() email!: string; @IsString() @MinLength(12) @MaxLength(128) password!: string; }
export class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(1) @MaxLength(128) password!: string; }
