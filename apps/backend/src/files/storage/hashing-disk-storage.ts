import { createHash, randomUUID } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { pipeline, Readable, Transform } from 'stream';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { SNIFF_BYTES } from '../file-types';

export interface StoredFileInfo {
  storageId: string;
  path: string;
  size: number;
  sha256: string;
  head: Buffer;
}

export interface UploadedMeetingFile extends StoredFileInfo {
  fieldname: string;
  originalname: string;
  mimetype: string;
}

type IncomingFile = { stream: Readable };

export class HashingDiskStorage implements StorageEngine {
  constructor(
    private readonly filesDir: string,
    private readonly tmpDir: string,
  ) {}

  _handleFile(
    _req: Request,
    file: IncomingFile,
    callback: (error?: unknown, info?: Partial<StoredFileInfo>) => void,
  ): void {
    const storageId = randomUUID();
    const tmpPath = join(this.tmpDir, storageId);
    const finalPath = join(this.filesDir, storageId);
    const hash = createHash('sha256');
    const headChunks: Buffer[] = [];
    let headLength = 0;
    let size = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk);
        size += chunk.length;
        if (headLength < SNIFF_BYTES) {
          const part = chunk.subarray(0, SNIFF_BYTES - headLength);
          headChunks.push(part);
          headLength += part.length;
        }
        done(null, chunk);
      },
    });

    pipeline(file.stream, meter, createWriteStream(tmpPath), async (error) => {
      try {
        if (error) throw error;
        await fs.rename(tmpPath, finalPath);
      } catch (failure) {
        // Сбой очистки не должен помешать вызвать callback, иначе multer повиснет.
        await fs.rm(tmpPath, { force: true }).catch(() => undefined);
        return callback(failure);
      }
      callback(null, {
        storageId,
        path: finalPath,
        size,
        sha256: hash.digest('hex'),
        head: Buffer.concat(headChunks),
      });
    });
  }

  _removeFile(
    _req: Request,
    file: Partial<StoredFileInfo>,
    callback: (error: Error | null) => void,
  ): void {
    if (!file.path) return callback(null);
    fs.rm(file.path, { force: true }).then(() => callback(null), callback);
  }
}
