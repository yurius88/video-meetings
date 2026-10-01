import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersService } from './users.service';
import { CreateUserHandler } from './commands/handlers';
import { GetUserByEmailHandler } from './queries/handlers';

const CommandHandlers = [CreateUserHandler];
const QueryHandlers = [GetUserByEmailHandler];

@Module({
  imports: [CqrsModule],
  providers: [UsersService, ...CommandHandlers, ...QueryHandlers],
  exports: [UsersService],
})
export class UsersModule {}
