# Video Meetings Monorepo

NPM-монорепозиторий для платформы видеовстреч.

## Структура

```
video-meetings/
├── apps/
│   ├── frontend/    # Next.js приложение
│   └── backend/     # NestJS приложение
├── package.json
├── .prettierrc
└── .gitignore
```

## Установка

```bash
npm install
```

## Разработка

Запустить оба приложения:
```bash
npm run dev
```

Запустить только фронтенд:
```bash
npm run dev:frontend
```

Запустить только бэкенд:
```bash
npm run dev:backend
```

## Сборка

```bash
npm run build
```

## Линтинг и форматирование

```bash
npm run lint
npm run format
```
