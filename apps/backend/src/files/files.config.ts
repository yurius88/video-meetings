import { join, resolve } from 'path';

export const FILES_CONFIG = Symbol('FILES_CONFIG');

export const DEFAULT_MAX_FILE_SIZE = 2 * 1024 ** 3;

export interface FilesConfig {
  filesDir: string;
  tmpDir: string;
  maxFileSize: number;
}

export function loadFilesConfig(): FilesConfig {
  const storageDir = resolve(process.env.FILES_STORAGE_DIR || 'storage');
  const maxFileSize = Number(process.env.MAX_FILE_SIZE);

  return {
    filesDir: join(storageDir, 'files'),
    tmpDir: join(storageDir, 'files', '.tmp'),
    maxFileSize:
      Number.isSafeInteger(maxFileSize) && maxFileSize > 0 ? maxFileSize : DEFAULT_MAX_FILE_SIZE,
  };
}

export function formatBytes(bytes: number): string {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Number(value.toFixed(2))} ${units[unit]}`;
}

export function fileTooLargeMessage(maxFileSize: number): string {
  return `Файл превышает максимальный размер ${formatBytes(maxFileSize)}`;
}
