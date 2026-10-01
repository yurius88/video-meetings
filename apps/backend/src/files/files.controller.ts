import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilesService } from './files.service';
import { MeetingFileDto } from './dto/meeting-file.dto';
import {
  matchesSignature,
  normalizeFileName,
  resolveFileType,
  unsupportedTypeMessage,
} from './file-types';
import {
  MeetingAccessGuard,
  MeetingRequest,
  RequireMeetingRole,
} from './guards/meeting-access.guard';
import { MeetingFileUploadInterceptor } from './interceptors/meeting-file-upload.interceptor';
import { UploadedMeetingFile } from './storage/hashing-disk-storage';

@Controller('meetings/:meetingId/files')
@UseGuards(JwtAuthGuard, MeetingAccessGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // Guard'ы выполняются до интерцептора, поэтому права проверяются
  // до того, как тело запроса начнёт записываться на диск.
  @Post()
  @RequireMeetingRole('creator')
  @UseInterceptors(MeetingFileUploadInterceptor)
  async upload(
    @Req() req: MeetingRequest,
    @UploadedFile() stored: UploadedMeetingFile,
  ): Promise<MeetingFileDto> {
    const originalName = normalizeFileName(stored.originalname);
    const type = resolveFileType(originalName);

    if (!type || !matchesSignature(type, stored.head)) {
      await this.filesService.discard(stored);
      throw new UnsupportedMediaTypeException(
        type ? 'Содержимое файла не соответствует его расширению' : unsupportedTypeMessage(),
      );
    }

    const file = this.filesService.create(
      req.meeting.id,
      req.user.userId,
      stored,
      originalName,
      type,
    );
    return MeetingFileDto.from(file);
  }

  @Get()
  findAll(@Req() req: MeetingRequest): MeetingFileDto[] {
    return this.filesService
      .findAllByMeeting(req.meeting.id)
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
      .map(MeetingFileDto.from);
  }

  @Get(':fileId/download')
  download(
    @Req() req: MeetingRequest,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): void {
    const file = this.filesService.findOne(req.meeting.id, fileId);

    res.download(
      this.filesService.getContentPath(file),
      file.originalName,
      {
        dotfiles: 'allow',
        headers: {
          'Content-Type': file.mimeType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
      },
      (error) => {
        if (!error || res.headersSent) return;
        res.status(404).json({
          statusCode: 404,
          message: 'Содержимое файла недоступно',
          error: 'Not Found',
        });
      },
    );
  }
}
