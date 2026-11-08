import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(6) password: string;
}
class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Post('register') register(@Body() d: RegisterDto) { return this.auth.register(d.email, d.name, d.password); }
  @Public() @Post('login') login(@Body() d: LoginDto) { return this.auth.login(d.email, d.password); }
  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }
}
