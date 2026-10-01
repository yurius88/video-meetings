import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetUserByEmailQuery } from '../get-user-by-email.query';
import { UsersService } from '../../users.service';

@QueryHandler(GetUserByEmailQuery)
export class GetUserByEmailHandler implements IQueryHandler<GetUserByEmailQuery> {
  constructor(private usersService: UsersService) {}

  async execute(query: GetUserByEmailQuery) {
    return this.usersService.findByEmail(query.email);
  }
}
