import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { Server } from 'http';
import { AppModule } from './app.module';

// Загрузка файла до 2 ГБ на обычном канале идёт дольше дефолтных 5 минут
// Node.js (server.requestTimeout), поэтому поднимаем потолок до 2 часов.
const REQUEST_TIMEOUT_MS = 2 * 60 * 60 * 1000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());

  const server: Server = app.getHttpServer();
  server.requestTimeout = REQUEST_TIMEOUT_MS;

  await app.listen(3001);
}
bootstrap();
