import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterCommand, LoginCommand } from './commands';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private commandBus: CommandBus) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.commandBus.execute(new RegisterCommand(registerDto.email, registerDto.password));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.commandBus.execute(new LoginCommand(loginDto.email, loginDto.password));
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return { email: req.user.email };
  }
}
