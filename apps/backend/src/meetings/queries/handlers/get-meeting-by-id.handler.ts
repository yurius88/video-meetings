import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetMeetingByIdQuery } from '../get-meeting-by-id.query';
import { MeetingsService } from '../../meetings.service';
import { Meeting } from '../../entities/meeting.entity';

@QueryHandler(GetMeetingByIdQuery)
export class GetMeetingByIdHandler implements IQueryHandler<
  GetMeetingByIdQuery,
  Meeting | undefined
> {
  constructor(private meetingsService: MeetingsService) {}

  async execute(query: GetMeetingByIdQuery): Promise<Meeting | undefined> {
    return this.meetingsService.findById(query.id);
  }
}
