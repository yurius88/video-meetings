import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CommandBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { RegisterCommand } from '../register.command';
import { CreateUserCommand } from '../../../users/commands/create-user.command';
import { JwtPayload } from '../../interfaces/jwt-payload.interface';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private commandBus: CommandBus,
    private jwtService: JwtService,
  ) {}

  async execute(command: RegisterCommand) {
    const { email, password } = command;

    const user = await this.commandBus.execute(new CreateUserCommand(email, password));

    const payload: JwtPayload = { email: user.email, sub: user.id };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
