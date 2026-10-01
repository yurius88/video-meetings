import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConflictException } from '@nestjs/common';
import { CreateUserCommand } from '../create-user.command';
import { UsersService } from '../../users.service';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private usersService: UsersService) {}

  async execute(command: CreateUserCommand) {
    const { email, password } = command;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    return this.usersService.create(email, password);
  }
}
