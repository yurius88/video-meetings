# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Frontend-приложение платформы видеовстреч на Next.js 15 (App Router), React 19, TypeScript и Tailwind CSS. Часть NPM-монорепозитория — общие команды и структура описаны в `CLAUDE.md` в корне репозитория.

## Development Commands

Запускать можно как из этой директории, так и из корня через `--workspace=apps/frontend`.

```bash
npm run dev            # Запуск dev-сервера (порт 3000)
npm run build          # Продакшн-сборка
npm run start          # Запуск собранного приложения
npm run lint           # Линтинг (next lint)
```

## Architecture

- **App Router** — вся маршрутизация и страницы находятся в `src/app/`. Каждая страница — `page.tsx`, общий layout — `layout.tsx`.
- **Стилизация** — Tailwind CSS (`tailwind.config.js`, `postcss.config.js`), глобальные стили в `src/app/globals.css`.
- **TypeScript** — путь-алиас `@/*` указывает на `src/*` (см. `tsconfig.json`).
- **ESLint** — конфигурация наследуется от `next/core-web-vitals` (`.eslintrc.json`).

## Key Files

- `next.config.js` — конфигурация Next.js
- `tailwind.config.js` — пути для сканирования классов Tailwind (`src/app`, `src/pages`, `src/components`)
- `src/app/layout.tsx` — корневой layout, задаёт `<html>`/`<body>` и метаданные страницы
- `src/app/page.tsx` — главная страница

## Поддержание документации в актуальном состоянии

При изменении архитектуры этого приложения (смена роутера, стека стилизации, структуры директорий `src/`, добавление новых ключевых паттернов) — обновляй этот файл, чтобы раздел "Architecture" отражал текущее состояние кода. Если изменения затрагивают также корневые скрипты или структуру монорепозитория — обновляй ещё и `CLAUDE.md` в корне репозитория.
