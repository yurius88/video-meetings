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
- **Корневой модуль** — `src/app.module.ts` регистрирует контроллеры и провайдеры. Новые фичи оформляются как отдельные модули (`imports: []`) по стандартному паттерну NestJS (Controller → Service → Module).
- **Контроллер/сервис** — `app.controller.ts` делегирует логику в `app.service.ts` через dependency injection (стандартный паттерн NestJS).
- **Тесты** — unit-тесты (`*.spec.ts`) лежат рядом с исходным кодом в `src/`, конфигурация в `package.json` (`jest` секция, `rootDir: "src"`). E2E-тесты — в `test/`, со своим конфигом `test/jest-e2e.json`.

## Key Files

- `src/main.ts` — bootstrap приложения, порт 3001, CORS включён
- `src/app.module.ts` — корневой модуль приложения
- `src/app.controller.ts` — содержит `GET /` и `GET /health` (health-check эндпоинт)
- `src/app.service.ts` — бизнес-логика для контроллера
- `nest-cli.json` — конфигурация Nest CLI (`sourceRoot: src`)
- `tsconfig.json` — decorators и metadata включены (`emitDecoratorMetadata`, `experimentalDecorators`), обязательны для DI NestJS

## Поддержание документации в актуальном состоянии

При изменении архитектуры этого приложения (новые модули, смена структуры контроллеров/сервисов, смена ORM/БД, изменение конфигурации тестирования) — обновляй этот файл, чтобы раздел "Architecture" отражал текущее состояние кода. Если изменения затрагивают также корневые скрипты или структуру монорепозитория — обновляй ещё и `CLAUDE.md` в корне репозитория.
