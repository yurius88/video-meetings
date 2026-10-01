import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { Observable } from 'rxjs';
import { FILES_CONFIG, FilesConfig, fileTooLargeMessage } from '../files.config';
import { normalizeFileName, resolveFileType, unsupportedTypeMessage } from '../file-types';
import { HashingDiskStorage } from '../storage/hashing-disk-storage';

export const UPLOAD_FIELD = 'file';

// Запас на multipart-обёртку (boundary, заголовки части, короткие поля).
const MULTIPART_OVERHEAD = 64 * 1024;

@Injectable()
export class MeetingFileUploadInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<ReturnType<typeof multer>['single']>;

  constructor(@Inject(FILES_CONFIG) private readonly config: FilesConfig) {
    this.upload = multer({
      storage: new HashingDiskStorage(config.filesDir, config.tmpDir),
      limits: {
        // busboy сигналит limit при достижении fileSize, а не при превышении.
        fileSize: config.maxFileSize + 1,
        files: 1,
        fields: 5,
        parts: 6,
      },
      fileFilter: (_req, file, callback) => {
        if (resolveFileType(normalizeFileName(file.originalname))) {
          return callback(null, true);
        }
        callback(new UnsupportedMediaTypeException(unsupportedTypeMessage()));
      },
    }).single(UPLOAD_FIELD);
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const declaredLength = Number(request.headers['content-length']);
    if (declaredLength > this.config.maxFileSize + MULTIPART_OVERHEAD) {
      throw new PayloadTooLargeException(fileTooLargeMessage(this.config.maxFileSize));
    }

    await new Promise<void>((resolve, reject) =>
      this.upload(request, response, (error: unknown) =>
        error ? reject(this.toHttpException(error)) : resolve(),
      ),
    );

    if (!request.file) {
      throw new BadRequestException(
        `Файл не передан: ожидается поле "${UPLOAD_FIELD}" в multipart/form-data`,
      );
    }
    return next.handle();
  }

  private toHttpException(error: unknown): unknown {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return new PayloadTooLargeException(fileTooLargeMessage(this.config.maxFileSize));
      }
      return new BadRequestException(`Некорректный запрос: ${error.message}`);
    }
    if (error instanceof Error && /multipart|boundary|form/i.test(error.message)) {
      return new BadRequestException(`Некорректный multipart-запрос: ${error.message}`);
    }
    return error;
  }
}
