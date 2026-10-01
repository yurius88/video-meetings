import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { GetMeetingByIdHandler } from './queries/handlers';

const QueryHandlers = [GetMeetingByIdHandler];

@Module({
  imports: [CqrsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, ...QueryHandlers],
})
export class MeetingsModule {}
