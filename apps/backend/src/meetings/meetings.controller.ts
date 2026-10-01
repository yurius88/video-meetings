import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  create(@Body() createMeetingDto: CreateMeetingDto, @Request() req) {
    return this.meetingsService.create(createMeetingDto, req.user.userId);
  }

  @Get()
  findAll(@Request() req) {
    return this.meetingsService.findAllByUser(req.user.userId);
  }

  @Get('recent')
  findRecent(@Request() req, @Query('limit') limit?: string) {
    const n = limit ? Math.max(1, Math.min(20, parseInt(limit, 10) || 3)) : 3;
    return this.meetingsService.findRecentByUser(req.user.userId, n);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.meetingsService.findOne(id, req.user.userId);
  }
}
