# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Backend-приложение платформы видеовстреч на NestJS 10 (Express-платформа), TypeScript. Часть NPM-монорепозитория — общие команды и структура описаны в `CLAUDE.md` в корне репозитория.

## Development Commands

Запускать можно как из этой директории, так и из корня через `--workspace=apps/backend`.

```bash
npm run start:dev      # Dev-сервер с watch-режимом (порт 3001)
npm run start:debug    # Dev-сервер с watch и debug (--inspect)
npm run build          # Компиляция в dist/ (nest build)
npm run start:prod     # Запуск собранного приложения (node dist/main)
npm run lint           # ESLint с автофиксом
```

### Тесты

```bash
npm run test                # Unit-тесты (Jest)
npm run test:watch          # Unit-тесты в watch-режиме
npm run test:cov            # Unit-тесты с покрытием
npm run test:e2e            # E2E-тесты (конфиг ./test/jest-e2e.json)
npm run test:debug          # Debug-режим для тестов

# Запуск одного тестового файла:
npx jest src/app.controller.spec.ts
npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts
```

## Architecture

- **Модульная структура NestJS** — точка входа `src/main.ts` создаёт приложение через `NestFactory.create(AppModule)` и включает CORS.
- **Корневой модуль** — `src/app.module.ts` регистрирует `UsersModule`, `AuthModule`, `MeetingsModule`, `FilesModule`. Новые фичи оформляются как отдельные модули (`imports: []`) по стандартному паттерну NestJS (Controller → Service → Module).
- **CQRS** — используется пакет `@nestjs/cqrs` (`CqrsModule`). Команды и запросы определяются как классы и обрабатываются соответствующими `CommandHandler`/`QueryHandler`. Шины `CommandBus`/`QueryBus` являются единственной точкой взаимодействия между модулями.
- **Авторизация (`AuthModule`)** — контроллер `AuthController` получает входные DTO, диспатчит `RegisterCommand`/`LoginCommand` через `CommandBus`, генерирует JWT через `JwtService`. Валидация JWT — `JwtStrategy` + `JwtAuthGuard`. Для доступа к пользователям `AuthModule` импортирует `UsersModule`; сам `UsersService` в хендлеры auth не инжектится — поиск происходит через `QueryBus` (`GetUserByEmailQuery`), создание — через `CommandBus` (`CreateUserCommand`).
- **Пользователи (`UsersModule`)** — единственный владелец `UsersService` (in-memory массив). Его публичное API — `CreateUserCommand`/`CreateUserHandler` (проверяет дубль email, хеширует пароль) и `GetUserByEmailQuery`/`GetUserByEmailHandler`. Экспортирует `UsersService` для `AuthModule`, зарегистрирован в `AppModule`.
- **Встречи (`MeetingsModule`)** — CRUD-lite: `POST /meetings`, `GET /meetings`, `GET /meetings/recent?limit=3`, `GET /meetings/:id`; хранение в памяти; роут `recent` объявлен до `:id` чтобы не попасть в параметр. Для других модулей публикует `GetMeetingByIdQuery` (встреча по ID без проверки владельца).
- **Файлы встреч (`FilesModule`)** — `POST /meetings/:meetingId/files` (multipart, поле `file`, только создатель), `GET /meetings/:meetingId/files` и `GET /meetings/:meetingId/files/:fileId/download` (создатель и участники — email из `participants`). Метаданные (`MeetingFile`) in-memory в `FilesService`, содержимое — на диске в `<FILES_STORAGE_DIR>/files/<uuid>` (по умолчанию `./storage`, лимит `MAX_FILE_SIZE`, по умолчанию 2 ГиБ).
  - `MeetingAccessGuard` получает встречу через `QueryBus` и проверяет роль (`@RequireMeetingRole('creator')`); посторонним — 404, участнику на загрузку — 403. Guard срабатывает до чтения тела.
  - `MeetingFileUploadInterceptor` — Multer с собственным storage engine `HashingDiskStorage`: стриминг во временный файл `files/.tmp`, SHA-256 на лету, атомарный rename. Whitelist расширений и проверка сигнатур — `file-types.ts`. Ошибки: 413 (лимит), 415 (тип), 400 (нет файла).
  - Скачивание — `res.download()` (Range, UTF-8 имя в `Content-Disposition`).
  - `server.requestTimeout` в `main.ts` поднят до 2 часов под загрузку больших файлов.

## Key Files

- `src/main.ts` — bootstrap приложения, порт 3001, CORS включён
- `src/app.module.ts` — корневой модуль приложения
- `src/app.controller.ts` — содержит `GET /` и `GET /health` (health-check эндпоинт)
- `src/app.service.ts` — бизнес-логика для контроллера
- `nest-cli.json` — конфигурация Nest CLI (`sourceRoot: src`)
- `tsconfig.json` — decorators и metadata включены (`emitDecoratorMetadata`, `experimentalDecorators`), обязательны для DI NestJS

## Поддержание документации в актуальном состоянии

При изменении архитектуры этого приложения (новые модули, смена структуры контроллеров/сервисов, смена ORM/БД, изменение конфигурации тестирования) — обновляй этот файл, чтобы раздел "Architecture" отражал текущее состояние кода. Если изменения затрагивают также корневые скрипты или структуру монорепозитория — обновляй ещё и `CLAUDE.md` в корне репозитория.
