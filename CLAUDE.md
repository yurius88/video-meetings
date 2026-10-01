# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NPM-монорепозиторий для платформы видеовстреч с двумя приложениями:
- **Frontend** (`apps/frontend`) — Next.js 15 с React 19, TypeScript, Tailwind CSS
- **Backend** (`apps/backend`) — NestJS 10 с TypeScript, Express

## Architecture

### Монорепозиторий
Проект использует NPM workspaces для управления зависимостями. Корневой `package.json` содержит общие dev-зависимости (Prettier, ESLint), а каждое приложение имеет собственные зависимости.

### Frontend (Next.js)
- **App Router** — структура в `apps/frontend/src/app/`
- **Стилизация** — Tailwind CSS с PostCSS
- **TypeScript** — строгая конфигурация с путями через `@/*`
- **Порт разработки** — 3000 (по умолчанию Next.js)

### Backend (NestJS)
- **Модульная архитектура** — контроллеры, сервисы, модули
- **API** — REST API на Express
- **CORS** — включён по умолчанию в `main.ts`
- **Порт разработки** — 3001
- **Тестирование** — Jest для unit-тестов, e2e конфигурация в `test/`

## Development Commands

### Установка и запуск
```bash
npm install                    # Установка всех зависимостей (запускать из корня)
npm run dev                    # Запуск обоих приложений одновременно
npm run dev:frontend           # Только Next.js на порту 3000
npm run dev:backend            # Только NestJS на порту 3001
```

### Сборка
```bash
npm run build                  # Сборка обоих приложений
npm run build:frontend         # Только frontend
npm run build:backend          # Только backend
```

### Линтинг и форматирование
```bash
npm run lint                   # Линтинг всех workspaces
npm run format                 # Форматирование всех файлов через Prettier

# Для конкретного приложения:
npm run lint --workspace=apps/frontend
npm run lint --workspace=apps/backend
```

### Тестирование (Backend)
```bash
npm run test --workspace=apps/backend              # Unit-тесты
npm run test:watch --workspace=apps/backend        # Watch-режим
npm run test:cov --workspace=apps/backend          # С покрытием
npm run test:e2e --workspace=apps/backend          # E2E-тесты
npm run test:debug --workspace=apps/backend        # Debug-режим
```

### Тестирование (Frontend — Playwright E2E)
```bash
npm run test:e2e --workspace=apps/frontend          # Все e2e-тесты (chromium/firefox/webkit)
npm run test:e2e:ui --workspace=apps/frontend       # Интерактивный UI-режим Playwright
npm run test:e2e:debug --workspace=apps/frontend    # Debug-режим (пошаговая отладка)
npm run test:e2e:report --workspace=apps/frontend   # Отчёт HTML о последнем прогоне
```
Конфигурация: `apps/frontend/playwright.config.ts`, тесты в `apps/frontend/e2e/`. Требуется запущенный backend (порт 3001) — Playwright сам поднимает frontend dev-сервер (порт 3000).

## Working with Workspaces

При работе с конкретным приложением используй флаг `--workspace`:
```bash
npm install <package> --workspace=apps/frontend
npm run <script> --workspace=apps/backend
```

При добавлении новых зависимостей:
- **Frontend** — добавляй в `apps/frontend/package.json`
- **Backend** — добавляй в `apps/backend/package.json`
- **Общие dev-инструменты** (линтеры, форматтеры) — в корневой `package.json`

## Key Files

### Root
- `package.json` — workspace-конфигурация и общие скрипты
- `.prettierrc` — единая конфигурация форматирования для всего монорепо

### Frontend
- `apps/frontend/next.config.js` — конфигурация Next.js
- `apps/frontend/tailwind.config.js` — настройки Tailwind
- `apps/frontend/src/app/layout.tsx` — корневой layout (App Router)
- `apps/frontend/src/app/page.tsx` — главная страница

### Backend
- `apps/backend/src/main.ts` — точка входа, инициализация NestJS
- `apps/backend/src/app.module.ts` — корневой модуль
- `apps/backend/nest-cli.json` — конфигурация Nest CLI

## Поддержание документации в актуальном состоянии

При изменении архитектуры проекта необходимо актуализировать соответствующие файлы `CLAUDE.md`:

- **Изменения, затрагивающие структуру монорепозитория** (новые workspaces, изменение общих скриптов, изменение системы сборки/линтинга на уровне репозитория) — обновляй этот файл (`CLAUDE.md` в корне).
- **Изменения внутри frontend** (новые ключевые директории, смена роутера, изменение стека стилизации, новые паттерны организации кода) — обновляй `apps/frontend/CLAUDE.md`.
- **Изменения внутри backend** (новые модули, изменение структуры контроллеров/сервисов, смена ORM/БД, изменение конфигурации тестирования) — обновляй `apps/backend/CLAUDE.md`.
- Новое приложение в `apps/` — создай для него отдельный `CLAUDE.md` по аналогии с существующими и добавь ссылку/описание в этот файл.

Документация должна отражать текущее состояние кода, а не историю изменений — при обновлении архитектуры правь описание, а не дополняй его пометками вида "теперь используется X вместо Y".


## File upload
Используй файл ресерча для этого: @docs/research-meeting-upload.md