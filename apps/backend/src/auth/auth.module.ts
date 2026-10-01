import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RegisterHandler, LoginHandler } from './commands/handlers';
import { getJwtSecret } from './jwt-secret';

const CommandHandlers = [RegisterHandler, LoginHandler];

@Module({
  imports: [
    CqrsModule,
    PassportModule,
    UsersModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, ...CommandHandlers],
})
export class AuthModule {}
