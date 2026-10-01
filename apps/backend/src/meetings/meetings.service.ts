import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { Meeting } from './entities/meeting.entity';

@Injectable()
export class MeetingsService {
  private meetings: Meeting[] = [];
  private idCounter = 1;

  create(createMeetingDto: CreateMeetingDto, userId: string): Meeting {
    const meeting: Meeting = {
      id: `meeting-${this.idCounter++}`,
      ...createMeetingDto,
      createdBy: userId,
      createdAt: new Date(),
    };

    this.meetings.push(meeting);
    return meeting;
  }

  findAllByUser(userId: string): Meeting[] {
    return this.meetings.filter((meeting) => meeting.createdBy === userId);
  }

  findRecentByUser(userId: string, limit = 3): Meeting[] {
    return this.findAllByUser(userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  findById(id: string): Meeting | undefined {
    return this.meetings.find((m) => m.id === id);
  }

  findOne(id: string, userId: string): Meeting {
    const meeting = this.meetings.find((m) => m.id === id && m.createdBy === userId);

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${id} not found`);
    }

    return meeting;
  }
}
