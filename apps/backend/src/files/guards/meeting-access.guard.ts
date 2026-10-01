import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QueryBus } from '@nestjs/cqrs';
import type { Request } from 'express';
import { GetMeetingByIdQuery } from '../../meetings/queries';
import { Meeting } from '../../meetings/entities/meeting.entity';

export type MeetingRole = 'creator' | 'participant';

const MEETING_ROLE = 'meetingRole';

export const RequireMeetingRole = (role: MeetingRole) => SetMetadata(MEETING_ROLE, role);

export interface MeetingRequest extends Request {
  user: { userId: string; email: string };
  meeting: Meeting;
}

export function isMeetingMember(meeting: Meeting, user: MeetingRequest['user']): boolean {
  const email = user.email.toLowerCase();
  return (
    meeting.createdBy === user.userId ||
    meeting.participants.some((p) => p.trim().toLowerCase() === email)
  );
}

@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly queryBus: QueryBus,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const role =
      this.reflector.getAllAndOverride<MeetingRole>(MEETING_ROLE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'participant';
    const request = context.switchToHttp().getRequest<MeetingRequest>();

    const meeting: Meeting | undefined = await this.queryBus.execute(
      new GetMeetingByIdQuery(request.params.meetingId),
    );
    // Посторонним не раскрываем существование встречи.
    if (!meeting || !isMeetingMember(meeting, request.user)) {
      throw new NotFoundException('Встреча не найдена');
    }
    if (role === 'creator' && meeting.createdBy !== request.user.userId) {
      throw new ForbiddenException('Загружать файлы может только создатель встречи');
    }

    request.meeting = meeting;
    return true;
  }
}
