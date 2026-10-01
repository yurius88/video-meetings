import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MeetingsModule } from './meetings/meetings.module';

@Module({
  imports: [UsersModule, AuthModule, MeetingsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
