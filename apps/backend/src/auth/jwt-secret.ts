import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

let cached: string | undefined;

export function getJwtSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    cached = fromEnv;
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  } else {
    // Пользователи хранятся in-memory, поэтому секрет на процесс ничего не ломает.
    new Logger('Auth').warn('JWT_SECRET не задан — используется случайный секрет процесса');
    cached = randomBytes(32).toString('hex');
  }
  return cached;
}
