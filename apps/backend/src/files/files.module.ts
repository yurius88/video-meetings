import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FILES_CONFIG, loadFilesConfig } from './files.config';
import { MeetingAccessGuard } from './guards/meeting-access.guard';
import { MeetingFileUploadInterceptor } from './interceptors/meeting-file-upload.interceptor';

@Module({
  imports: [CqrsModule],
  controllers: [FilesController],
  providers: [
    { provide: FILES_CONFIG, useFactory: loadFilesConfig },
    FilesService,
    MeetingAccessGuard,
    MeetingFileUploadInterceptor,
  ],
})
export class FilesModule {}
