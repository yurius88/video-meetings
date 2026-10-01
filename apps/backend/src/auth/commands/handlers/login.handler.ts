import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QueryBus } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { LoginCommand } from '../login.command';
import { GetUserByEmailQuery } from '../../../users/queries/get-user-by-email.query';
import { JwtPayload } from '../../interfaces/jwt-payload.interface';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private queryBus: QueryBus,
    private jwtService: JwtService,
  ) {}

  async execute(command: LoginCommand) {
    const { email, password } = command;

    const user = await this.queryBus.execute(new GetUserByEmailQuery(email));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { email: user.email, sub: user.id };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
