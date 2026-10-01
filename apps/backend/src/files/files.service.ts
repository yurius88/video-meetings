import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { FILES_CONFIG, FilesConfig } from './files.config';
import { MeetingFile } from './entities/meeting-file.entity';
import { FileTypeSpec } from './file-types';
import { UploadedMeetingFile } from './storage/hashing-disk-storage';

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly filesByMeeting = new Map<string, MeetingFile[]>();

  constructor(@Inject(FILES_CONFIG) private readonly config: FilesConfig) {}

  async onModuleInit(): Promise<void> {
    // Незавершённые загрузки прошлого запуска больше никому не принадлежат.
    await fs.rm(this.config.tmpDir, { recursive: true, force: true });
    await fs.mkdir(this.config.tmpDir, { recursive: true });
  }

  create(
    meetingId: string,
    uploadedBy: string,
    stored: UploadedMeetingFile,
    originalName: string,
    type: FileTypeSpec,
  ): MeetingFile {
    const file: MeetingFile = {
      id: stored.storageId,
      meetingId,
      originalName,
      mimeType: type.mimeType,
      category: type.category,
      size: stored.size,
      sha256: stored.sha256,
      uploadedBy,
      uploadedAt: new Date(),
    };

    const files = this.filesByMeeting.get(meetingId) ?? [];
    files.push(file);
    this.filesByMeeting.set(meetingId, files);
    return file;
  }

  findAllByMeeting(meetingId: string): MeetingFile[] {
    return [...(this.filesByMeeting.get(meetingId) ?? [])];
  }

  findOne(meetingId: string, fileId: string): MeetingFile {
    const file = this.filesByMeeting.get(meetingId)?.find((candidate) => candidate.id === fileId);
    if (!file) {
      throw new NotFoundException('Файл не найден');
    }
    return file;
  }

  getContentPath(file: MeetingFile): string {
    return join(this.config.filesDir, file.id);
  }

  async discard(stored: { path?: string }): Promise<void> {
    if (!stored?.path) return;
    await fs.rm(stored.path, { force: true }).catch((error) => {
      this.logger.warn(`Не удалось удалить ${stored.path}: ${error}`);
    });
  }
}
