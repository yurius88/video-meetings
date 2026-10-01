# Research: технологическая реализация загрузки файлов во встречах

**План:** @docs/plan-загрузка-файла-встречи-для-последующего-хранения-и-обработки-а-также-интерфейса-загрузки-и-отображения-внутри-встречи.md
**PRD:** @docs/prd-загрузка-файла-встречи-для-последующего-хранения-и-обработки-а-также-интерфейса-загрузки-и-отображения-внутри-встречи.md
**Дата:** 2026-09-30

## TL;DR — рекомендуемый стек

| Задача | Решение | Почему |
|---|---|---|
| Приём файла до 2 ГБ | Multer (уже внутри `@nestjs/platform-express`) + **собственный storage engine**: стриминг на диск + подсчёт SHA-256 на лету | Файл не попадает в память; хеш нужен для критерия «скачанный файл идентичен» |
| Проверка прав до приёма тела | `MeetingCreatorGuard` (guard выполняется **до** `FileInterceptor`) + ранняя проверка `Content-Length` | Иначе не-создатель сначала зальёт 2 ГБ, и только потом получит 403 |
| Прогресс загрузки | `XMLHttpRequest` + `xhr.upload.onprogress`, запрос напрямую на backend `:3001` | `fetch` не отдаёт прогресс отправки; прокси через Next.js — лишний hop и свои лимиты тела |
| Скачивание и `<img>` превью | Короткоживущие подписанные ссылки (`?token=…`, отдельный секрет, scope на конкретный файл) | JWT лежит в `localStorage` — браузер не подставит `Authorization` в `<a href>`/`<img src>`; `fetch → blob` для 2 ГБ съест память |
| Отдача файла | `res.download()` (Express/`send`) | Range-запросы, ETag, корректный `Content-Disposition` для кириллических имён |
| Фоновые превью | `EventBus` из `@nestjs/cqrs` (`FileUploadedEvent`) + in-process очередь с лимитом параллелизма | CQRS уже в проекте; Redis/BullMQ для одного инстанса избыточны |
| Изображения | `sharp` | Быстрый, prebuilt-бинарники для Windows и Linux |
| Видео | бинарник `ffmpeg` (`ffmpeg-static` или системный) через `child_process.spawn` | `fluent-ffmpeg` больше не поддерживается; `spawn` с массивом аргументов достаточно |
| PDF | `pdfjs-dist` + `@napi-rs/canvas` (альтернатива — `pdftoppm` из Poppler) | Только npm-пакеты, без системных зависимостей на Windows-dev |
| Презентации | встроенная миниатюра из архива (`docProps/thumbnail.jpeg`, `Thumbnails/thumbnail.png`) → LibreOffice headless (опционально) → иконка | Рендера PPTX на чистом JS нет; LibreOffice тяжёлый, поэтому он — опциональный fallback |
| Обновление списка | Polling (`setInterval` + пауза по `visibilitychange`), без новых зависимостей | PRD не требует realtime; WebSocket-канала в проекте нет |

Новые зависимости backend: `sharp`, `ffmpeg-static` (+ `ffprobe-static` при необходимости), `pdfjs-dist`, `@napi-rs/canvas`, `yauzl`, dev: `@types/multer`, `@types/yauzl`. Frontend — без новых зависимостей.

## 1. Что в текущем коде влияет на решение

- **Участники не имеют доступа к встрече.** `MeetingsService.findOne(id, userId)` ищет только по `createdBy === userId`, `GET /meetings` возвращает только встречи создателя. Без изменения этого список/скачивание файлов для участников невозможны. Проверка участника: `meeting.createdBy === user.userId || meeting.participants.includes(user.email)` (email из `JwtPayload`; нормализовать в lower-case при создании встречи и при сравнении).
- **Участник не увидит встречу на главной** — нужна выдача «встречи, где я участник» (в плане не учтено, см. раздел 11).
- **JWT в `localStorage`** + `Authorization: Bearer` (`apps/frontend/src/app/page.tsx`). Прямые ссылки на файлы без доработок работать не будут (раздел 5).
- **ID встреч — счётчик `meeting-${n}`**, сбрасывается при рестарте. Если после рестарта восстанавливать файлы сканированием `storage/meetings/meeting-1/`, новая `meeting-1` получит чужие файлы. Вывод: в этой итерации метаданные с диска **не** восстанавливаем, пути файлов — UUID (`crypto.randomUUID()`), не производные от `meetingId`.
- **Захардкоженный JWT-секрет** в `JwtStrategy`. Для подписанных ссылок — отдельный секрет из env (`FILE_LINK_SECRET`) и отдельный `purpose` в payload, чтобы токен скачивания нельзя было использовать как access token и наоборот.
- **Межмодульное взаимодействие только через `CommandBus`/`QueryBus`** (`apps/backend/CLAUDE.md`). Новый `FilesModule` получает встречу через `GetMeetingQuery` (новый query в `MeetingsModule`), а не инъекцией `MeetingsService`.
- **`main.ts`** — только `enableCors()` и `ValidationPipe`. Настройки таймаутов HTTP-сервера отсутствуют (критично, раздел 2.4).
- `API_BASE = 'http://localhost:3001'` захардкожен в страницах, хотя в `.env.example` есть `NEXT_PUBLIC_API_URL`. С появлением страницы встречи стоит вынести в `src/lib/api.ts`.

## 2. Приём файла (Фаза 1)

### 2.1 Варианты

| Вариант | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| Multer `memoryStorage` | Просто | Весь файл в RAM — 2 ГБ на запрос, OOM | Нельзя |
| Multer `diskStorage` | Стриминг на диск, из коробки в Nest | Нет хеша, нет атомарной записи, нет магических байтов | База, но мало |
| **Multer + свой `StorageEngine`** | Стриминг + SHA-256 + temp→rename + сниффинг + гарантированная очистка | ~80 строк кода | **Рекомендуется** |
| `busboy` напрямую в контроллере | Полный контроль | Дублирует Multer, теряются `@UploadedFile`/интерцепторы | Не нужно |
| Resumable-протокол (tus, `@tus/server`) / чанки | Докачка после обрыва — ценно для 2 ГБ | Новый протокол, клиент (`tus-js-client`), отдельная логика сборки | Путь развития, не для этой итерации |
| Raw body (`PUT` с `application/octet-stream`) | Нет multipart-оверхеда | Нестандартно для Nest, имя/тип в заголовках | Не нужно |

### 2.2 Storage engine

Суть реализации `_handleFile(req, file, cb)`:

1. Путь `storage/files/.tmp/<uuid>`, итоговый — `storage/files/<uuid>` (без расширения — файл никогда не исполняется и не угадывается по имени).
2. `stream.pipeline(file.stream, hashTransform, fs.createWriteStream(tmp))`, где `hashTransform` обновляет `crypto.createHash('sha256')` и накапливает первые ~4 КБ для сниффинга.
3. На `file.stream` событие `limit` (busboy превысил `fileSize`) → уничтожить стрим, `unlink(tmp)`, ошибка `LIMIT_FILE_SIZE`.
4. Успех → `rename(tmp, final)` → `cb(null, { path, size, sha256, sniffedHead })`.
5. `_removeFile` — `unlink`. Multer вызывает его при ошибках/обрыве запроса; дополнительно при старте приложения чистить `storage/files/.tmp/`.

Параметры интерцептора:

```ts
FileInterceptor('file', {
  storage: new HashingDiskStorage(dir),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 5, parts: 6 },
  fileFilter, // расширение + MIME по whitelist, до записи на диск
})
```

- `MAX_FILE_SIZE = 2 * 1024 ** 3` (2 147 483 648 байт). «2 ГБ» трактуем как 2 ГиБ: файл 2049 МиБ отклоняется, ровно 2048 МиБ проходит (busboy срабатывает только при превышении). Значение — из env, чтобы e2e-тесты могли проверять граничные случаи на маленьком лимите.
- Ошибку Multer `LIMIT_FILE_SIZE` Nest (`transformException` в `platform-express`) превращает в `413 PayloadTooLargeException`; сообщение стоит переопределить на понятное («Файл превышает 2 ГБ»), например exception filter'ом или обёрткой.
- `ParseFilePipe`/`MaxFileSizeValidator` для лимита **не** использовать: они срабатывают после того, как файл полностью записан. В Nest 10 `FileTypeValidator` проверяет только присланный клиентом `mimetype` — ненадёжно.

### 2.3 Валидация типа

- **До записи (`fileFilter`)**: whitelist расширений и MIME: документы `doc, docx, odt, rtf, txt, md, xls, xlsx, ods, csv`; изображения `jpg, jpeg, png, gif, webp, bmp, tiff, heic`; видео `mp4, webm, mov, mkv, avi`; презентации `ppt, pptx, odp`; `pdf`. Отказ → `415`/`400` с сообщением «Недопустимый тип файла».
- **После записи (по первым байтам)**: сверка сигнатуры с расширением (`%PDF`, `PK\x03\x04` для OOXML/ODF, `\xD0\xCF\x11\xE0` для doc/ppt/xls, `\xFF\xD8\xFF`, `\x89PNG`, `ftyp` для mp4/mov, `\x1A\x45\xDF\xA3` для webm/mkv). Несовпадение → удалить файл, `415`.
- Пакет `file-type` с v17 — ESM-only, backend собирается в CommonJS; ради ~10 сигнатур проще собственная таблица, чем бороться с ESM-импортом.
- SVG исключить из whitelist: это активный контент (XSS при открытии inline), а растеризация через `sharp` добавляет поверхность атаки.
- `category` (`document | image | video | presentation | pdf`) определяется сервером по расширению и хранится в метаданных — от неё зависит генерация превью и иконка на фронте.

### 2.4 Лимиты HTTP-стека (главная ловушка)

- **Node.js `server.requestTimeout` по умолчанию 300 000 мс (5 минут, Node ≥ 18).** 2 ГБ за 5 минут — это ~7 МБ/с; на обычном канале загрузка будет оборвана. В `main.ts`:
  ```ts
  const server = app.getHttpServer();
  server.requestTimeout = 0; // или явный потолок, например 2 часа
  ```
  `headersTimeout` оставить по умолчанию (защита от slowloris на заголовках).
- Body-parser Nest (`json`/`urlencoded`) multipart не читает — его лимиты менять **не нужно** (частый ложный след; 413 в таких случаях обычно даёт внешний прокси).
- Если появится nginx/другой reverse proxy: `client_max_body_size 2g`, `proxy_request_buffering off`, увеличенный `proxy_read_timeout`/`client_body_timeout`.
- CORS: `enableCors()` без опций разрешает любой origin — для multipart с `Authorization` preflight пройдёт. Ограничить origin значением из env — отдельное улучшение.

### 2.5 Порядок проверок на `POST /meetings/:id/files`

В Nest порядок: middleware → **guards** → **interceptors** (здесь читается тело) → pipes → handler.

1. `JwtAuthGuard` → 401.
2. `MeetingCreatorGuard`: встреча через `QueryBus`; нет встречи / нет доступа → 404, участник, но не создатель → 403. **Тело ещё не прочитано.**
3. В том же guard: `Content-Length > MAX_FILE_SIZE + запас на multipart-обёртку (~64 КБ)` → 413 без приёма тела. Точная проверка всё равно делается Multer'ом.
4. `FileInterceptor` → стриминг, хеш, лимит.
5. Handler: сниффинг, запись метаданных, `EventBus.publish(new FileUploadedEvent(...))`, ответ `201` с DTO файла.

Нюанс: при раннем ответе (403/413) на ещё не отправленное тело браузер иногда видит обрыв соединения вместо статуса. Поэтому фронт обязан **дублировать** проверку размера/типа до отправки и прятать форму для не-создателей; серверные проверки — защитный слой.

### 2.6 Свободное место

Перед приёмом (в guard) проверять `fs.promises.statfs(dir)` (Node ≥ 18.15): если свободно меньше `Content-Length + резерв` → `507 Insufficient Storage`. Квот PRD не требует, но полный диск ломает и превью, и остальной сервер.

## 3. Хранение и метаданные

```
<FILES_STORAGE_DIR>/          # по умолчанию apps/backend/storage, добавить в .gitignore
  files/.tmp/                 # незавершённые загрузки, чистится при старте
  files/<fileId>              # оригинал, без расширения
  previews/<fileId>.webp      # превью
```

```ts
interface MeetingFile {
  id: string;            // UUID
  meetingId: string;
  originalName: string;  // только для отображения и Content-Disposition, никогда не для путей
  mimeType: string;      // определён сервером
  category: 'document' | 'image' | 'video' | 'presentation' | 'pdf';
  size: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: Date;
  previewStatus: 'none' | 'pending' | 'ready' | 'failed';
}
```

- `FilesService` — in-memory `Map<meetingId, MeetingFile[]>`, как и остальные сервисы.
- `originalName`: Multer/busboy по умолчанию декодирует имя как latin1 — кириллица превращается в кракозябры. Решение: `Buffer.from(file.originalname, 'latin1').toString('utf8')` (или `defParamCharset: 'utf8'`, если используемая версия Multer его пробрасывает — проверить). Обрезать до 255 символов, убрать управляющие символы и разделители путей.
- `sha256` отдавать в API — это прямой способ проверить критерий «скачанный файл идентичен загруженному».
- Персистентность через рестарты требует БД (Postgres уже в `docker-compose.yml`) — вне скоупа по PRD. Сейчас после рестарта файлы на диске становятся «сиротами»; стоит хотя бы логировать их количество при старте.

## 4. API-контракт

| Метод | Путь | Доступ | Ответ |
|---|---|---|---|
| `POST` | `/meetings/:id/files` | создатель | `201 MeetingFileDto`; `401/403/404/413/415/507` |
| `GET` | `/meetings/:id/files` | участник | `MeetingFileDto[]`, сортировка по `uploadedAt` |
| `GET` | `/meetings/:id/files/:fileId/download?token=` | подписанный токен или Bearer | файл, `Content-Disposition: attachment` |
| `GET` | `/meetings/:id/files/:fileId/preview?token=` | подписанный токен или Bearer | `image/webp`; `404`, если превью нет/не готово |

```ts
interface MeetingFileDto {
  id: string; name: string; size: number; mimeType: string;
  category: MeetingFile['category']; sha256: string; uploadedAt: string;
  previewStatus: MeetingFile['previewStatus'];
  previewUrl: string | null;   // есть только при previewStatus === 'ready'
  downloadUrl: string;         // с подписанным токеном
}
```

Для документов `previewStatus: 'none'`, `previewUrl: null`, `preview` → 404 — это и есть «зафиксированный контрактом» ответ из Фазы 3.

Контроллер: отдельный `MeetingFilesController` с `@Controller('meetings/:meetingId/files')` в `FilesModule` — не раздувает `MeetingsController` и не конфликтует с его маршрутами.

## 5. Скачивание и доступ по ссылке

### 5.1 Проблема

`<a href download>` и `<img src>` не отправляют `Authorization`, а токен хранится в `localStorage`.

| Вариант | Плюсы | Минусы |
|---|---|---|
| `fetch` с Bearer → `Blob` → `URL.createObjectURL` | Без изменений backend-авторизации | Весь файл в памяти вкладки (2 ГБ — падение), нет нативного менеджера загрузок |
| JWT в httpOnly cookie | Ссылки работают нативно | Переделка auth (login, CORS `credentials`, CSRF) — выходит за рамки фичи |
| **Подписанная ссылка `?token=`** | Нативное скачивание и `<img>`, Range, работает кросс-ориджин | Токен виден в URL/логах → короткий TTL и узкий scope |

### 5.2 Рекомендация

- При формировании `GET /meetings/:id/files` сервер для каждого файла генерирует токены (`JwtService.sign` с `FILE_LINK_SECRET`):
  `{ sub, meetingId, fileId, purpose: 'download' | 'preview' }`, TTL 10–15 минут.
- Периодический рефетч списка (Фаза 2) автоматически обновляет ссылки.
- Endpoint'ы `download`/`preview` принимают либо валидный подписанный токен с совпадающими `fileId/meetingId/purpose`, либо обычный Bearer + проверку участника (удобно для e2e и API-клиентов). Свой guard `FileAccessGuard` вместо `JwtAuthGuard` на этих маршрутах.
- В токене не должно быть ничего, кроме идентификаторов; в логах запросов маскировать `token`.

### 5.3 Отдача

```ts
res.download(filePath, file.originalName, {
  headers: { 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' },
});
```

- `res.download` (пакет `send`) даёт Range/`206`, `ETag`, `Last-Modified`, а `Content-Disposition` формирует через `content-disposition` с `filename*=UTF-8''…` — кириллические имена скачиваются корректно.
- `StreamableFile` тоже стримит, но Range не поддерживает — для видео 2 ГБ хуже.
- Всегда `attachment` (не `inline`) для оригиналов — HTML/PDF с активным содержимым не откроется в origin'е API.
- Превью: `Content-Type: image/webp`, `Cache-Control: private, max-age=300` (URL содержит токен, поэтому кеш безопасен по ключу).

## 6. Фоновая генерация превью (Фаза 3)

### 6.1 Оркестрация

| Вариант | Вердикт |
|---|---|
| `setImmediate`/`void promise` в handler'е | Работает, но без контроля параллелизма |
| **`EventBus` (`@nestjs/cqrs`) + `@EventsHandler(FileUploadedEvent)` + семафор** | Рекомендуется: вписывается в текущую архитектуру, не блокирует ответ |
| BullMQ + Redis | Переживает рестарт, ретраи, несколько воркеров — но новая инфраструктура; метаданные всё равно in-memory, поэтому смысла пока нет |
| `worker_threads` | `sharp`, `ffmpeg`, `soffice` и так работают вне JS-потока; нужен только для pdf.js (CPU-bound JS) — можно добавить позже, если рендер PDF начнёт блокировать event loop |

- Семафор на ~15 строк (не `p-limit`: он ESM-only): `PREVIEW_CONCURRENCY` (по умолчанию 2), для LibreOffice — отдельно 1.
- Статусы: при загрузке `pending` (или `none` для документов) → `ready`/`failed`. Ошибка генерации не должна ронять процесс: `try/catch` + лог + `failed`, фронт показывает иконку.
- Таймаут на каждую генерацию (например, 60 с для видео/PDF, 120 с для LibreOffice) с `kill` дочернего процесса.
- Единый формат превью: WebP, вписать в 480×480 (`fit: 'inside'`), качество 80. Финальную нормализацию всех источников делает `sharp`.

### 6.2 Изображения — `sharp`

```ts
await sharp(src, { limitInputPixels: 100_000_000, failOn: 'error' })
  .rotate()                                   // учесть EXIF-ориентацию
  .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80 })
  .toFile(dst);
```

- `limitInputPixels` защищает от «декомпрессионных бомб».
- Для анимированных GIF/WebP берётся первый кадр (поведение по умолчанию).
- HEIC prebuilt-сборка `sharp` не декодирует (патентные ограничения) → `failed` и иконка; либо исключить HEIC из whitelist изображений.
- Установка: prebuilt-бинарники ставятся как platform-specific optional deps (`@img/sharp-win32-x64`, `@img/sharp-linux-x64`). При переносе `node_modules` между Windows и Linux/Docker нужна переустановка на целевой платформе.

### 6.3 Видео — `ffmpeg`

- `fluent-ffmpeg` помечен как неподдерживаемый (репозиторий архивирован), использовать его в новом коде не стоит. Достаточно `child_process.spawn` с массивом аргументов (без shell — нет инъекций через имя файла).
- Бинарник: `ffmpeg-static` (скачивает бинарник в `postinstall`; может блокироваться корпоративным прокси) или системный `ffmpeg` через env `FFMPEG_PATH`. Сборки `ffmpeg-static` — под GPL; для внутреннего серверного использования это не проблема, но стоит зафиксировать.
- Команда (быстрый seek до `-i`, фильтр `thumbnail` отбрасывает чёрные/смазанные кадры):
  ```
  ffmpeg -hide_banner -loglevel error -ss 1 -i <src> -frames:v 1 -vf "thumbnail=50,scale=480:-2" -f image2 -y <tmp>.png
  ```
  Если на выходе пусто (видео короче 1 с) — повтор с `-ss 0`. Затем `sharp(<tmp>.png) → webp`.
- Длительность через `ffprobe` не обязательна; нужна только если выбирать кадр «из середины».

### 6.4 PDF

| Вариант | Плюсы | Минусы |
|---|---|---|
| **`pdfjs-dist` + `@napi-rs/canvas`** | Только npm, prebuilt под Windows/Linux; pdf.js в Node официально использует `@napi-rs/canvas` | `pdfjs-dist` v4+ — ESM-only (`.mjs`); CPU-bound JS в основном потоке |
| `pdftoppm` (Poppler) | Самый быстрый и точный: `pdftoppm -f 1 -l 1 -png -scale-to 480 src out` | Системная зависимость, неудобная установка на Windows |
| `mupdf` (WASM) | Качественный рендер | Лицензия AGPL |
| Ghostscript | Надёжен | Системная зависимость, AGPL |

Рекомендация: `pdfjs-dist` (рендер первой страницы в canvas с масштабом под 480 px → PNG-буфер → `sharp` → WebP), либо `pdftoppm`, если на сервере разрешены системные пакеты. Абстракция `PdfRenderer` позволит переключить реализацию через env.

ESM-нюанс: backend компилируется в CommonJS, и TypeScript превратит `await import('pdfjs-dist/legacy/build/pdf.mjs')` в `require()`, который упадёт. Варианты: вынести загрузку в небольшой `.mjs`-хелпер или использовать `new Function('s', 'return import(s)')`. Проверить на реальной сборке `nest build` и в Jest (для unit-тестов модуль мокать).

### 6.5 Презентации

Надёжного рендера PPTX на чистом JS нет. Каскад:

1. **Встроенная миниатюра.** PPTX — ZIP; PowerPoint по умолчанию сохраняет `docProps/thumbnail.jpeg` (первый слайд). ODP всегда содержит `Thumbnails/thumbnail.png`. Чтение через `yauzl` (читает по центральному каталогу, не загружая весь архив в память; `adm-zip` грузит файл целиком — не подходит для сотен МБ). Миниатюра обычно ~256 px — достаточно для карточки. Быстро и без внешних программ.
2. **LibreOffice headless** (опционально, если задан `SOFFICE_PATH`):
   ```
   soffice --headless --norestore -env:UserInstallation=file:///<tmp>/lo-<uuid> --convert-to pdf --outdir <tmp> <src>
   ```
   Затем первая страница PDF через пайплайн 6.4. Отдельный профиль `UserInstallation` на каждый запуск обязателен — иначе параллельные запуски конфликтуют. Параллелизм 1, таймаут 120 с. Установка ~500 МБ, конвертация секунды–десятки секунд. Это внутренняя конвертация ради превью, а не «конвертация форматов для просмотра», исключённая PRD, — но решение о включении стоит подтвердить.
3. **Иначе** — `failed`, фронт показывает иконку типа. Бинарный `.ppt` без LibreOffice превью не получит.

### 6.6 Документы

Превью не генерируется: `previewStatus: 'none'`, событие для них можно не публиковать.

## 7. Frontend (Фазы 2 и 4)

### 7.1 Экран встречи

- `src/app/meetings/[id]/page.tsx` — клиентский компонент (`'use client'`), как существующие страницы: токен в `localStorage` недоступен серверным компонентам. В Next 15 `params` — Promise: в клиентском компоненте использовать `useParams()` или `React.use(params)`.
- `MeetingCard` на главной обернуть в `Link` на `/meetings/${id}`.
- Общий `src/lib/api.ts`: `API_BASE` из `NEXT_PUBLIC_API_URL`, `authHeaders()`, обработка 401 → редирект на `/login`. Сейчас это продублировано по страницам.
- Признак «я создатель»: сравнить `meeting.createdBy` с `userId`. `/auth/profile` сейчас возвращает `email` — проверить, отдаёт ли он `userId`; если нет — добавить в ответ или вернуть в `GET /meetings/:id` флаг `isOwner` (проще и надёжнее).

### 7.2 Загрузка с прогрессом

```ts
function uploadFile(url: string, file: File, token: string, onProgress: (p: number) => void) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<MeetingFileDto>((resolve, reject) => {
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(parseError(xhr)));
    xhr.onerror = () => reject(new Error('Соединение прервано'));
    xhr.onabort = () => reject(new DOMException('Отменено', 'AbortError'));
  });
  xhr.open('POST', url);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  const body = new FormData();
  body.append('file', file);
  xhr.send(body);
  return { promise, abort: () => xhr.abort() };
}
```

- `fetch` не поддерживает прогресс отправки (streaming request body есть только в Chromium, с `duplex: 'half'`, и прогресса всё равно не даёт). `axios` внутри браузера тоже использует XHR — ради этого новая зависимость не нужна.
- Отправлять напрямую на backend, не через Next.js rewrites/route handlers: лишний hop и собственные лимиты размера тела.
- Предварительная валидация на клиенте: `file.size <= MAX_FILE_SIZE` и расширение из whitelist (атрибут `accept` у `<input type="file">` — только подсказка).
- Кнопка «Отмена» → `xhr.abort()`; сервер удаляет частичный файл (раздел 2.2).
- `beforeunload`-предупреждение, пока идёт загрузка.
- Ошибки по статусу: `413` → «Файл больше 2 ГБ», `415` → «Недопустимый тип файла», `403` → «Загружать файлы может только создатель встречи», `507` → «Недостаточно места на сервере», сетевая ошибка → «Соединение прервано».
- UI: компоненты HeroUI (`Button`, прогресс-бар — проверить наличие `ProgressBar` в `@heroui/react` v3, иначе нативный `<progress>` со стилями Tailwind), drag-and-drop зона опционально.

### 7.3 Список и polling

- Рефетч `GET /meetings/:id/files` каждые ~10 с; каждые ~3 с, пока есть файлы с `previewStatus: 'pending'`. Пауза при `document.hidden` (`visibilitychange`), немедленный рефетч при возврате на вкладку и после своей успешной загрузки.
- Без SWR/React Query: хватит `useEffect` + `setTimeout`-цепочки (не `setInterval`, чтобы запросы не накладывались).
- Скачивание: `<a href={file.downloadUrl}>` — браузер качает нативно, со своим менеджером загрузок, без буферизации в JS.
- Превью: обычный `<img src={previewUrl} loading="lazy">`, не `next/image` (оптимизатор Next пытался бы проксировать URL с токеном и требует `remotePatterns`). Для `pending` — скелетон, для `none`/`failed` — иконка по `category`; `onError` у `<img>` → иконка (токен мог истечь до следующего рефетча).
- Размер форматировать через `Intl.NumberFormat('ru-RU')` (КБ/МБ/ГБ), дату — `toLocaleString('ru-RU')`.

## 8. Безопасность

- Пути строятся только из UUID; `originalName` не участвует в путях (path traversal).
- Whitelist расширений + сверка магических байтов; SVG/HTML/исполняемые файлы не принимаются.
- Оригиналы — всегда `attachment` + `nosniff`; превью генерирует сервер (только WebP).
- Проверка прав до приёма тела (guard), проверка участника на каждом `GET`.
- Подписанные ссылки: отдельный секрет, `purpose`, привязка к `fileId`+`meetingId`, TTL 10–15 мин.
- Дочерние процессы (`ffmpeg`, `soffice`): `spawn` с массивом аргументов, таймауты, ограниченный параллелизм, рабочие файлы во временной директории с очисткой в `finally`.
- `sharp`: `limitInputPixels`. pdf.js: `isEvalSupported: false`, рендер только первой страницы.
- **Multer и CVE:** в 2025 году в Multer исправлены DoS-уязвимости (релиз 2.0.x); `@nestjs/platform-express` 10.x может тянуть ветку 1.4.x-lts. Проверить `npm ls multer`; при необходимости — обновление `@nestjs/platform-express` или `overrides` в корневом `package.json` (с согласованием).
- Существующий захардкоженный JWT-секрет вынести в env — связано с фичей, так как от него зависят все проверки доступа к файлам.

## 9. Тестирование

- **e2e (supertest):** `.attach('file', buffer, 'name.pdf')`. Граничные случаи лимита — на маленьком `MAX_FILE_SIZE` из env в тестовом модуле (например, 1 МиБ: ровно 1 МиБ → 201, 1 МиБ + 1 байт → 413), чтобы не гонять 2 ГБ в CI.
- Проверки: 201 для создателя, 403 для участника, 404 для постороннего, 401 без токена, 415 для `.exe`/подменённого расширения, совпадение `sha256` скачанного тела с исходным, Range-запрос (`206`), истёкший/чужой подписанный токен → 403, кириллическое имя в `Content-Disposition`.
- **Ручная проверка 2 ГиБ:** `fsutil file createnew big.bin 2147483648` (Windows) / `truncate -s 2G big.bin`; и файл 2049 МиБ. Контроль памяти процесса (`process.memoryUsage().rss` не должен расти пропорционально размеру файла) и что загрузка не обрывается через 5 минут.
- **Unit:** генераторы превью на маленьких фикстурах (`test/fixtures/`: jpg, png, mp4 ~100 КБ, pdf, pptx с миниатюрой и без); storage engine — очистка при `limit` и при обрыве стрима.
- **Playwright:** `setInputFiles` для загрузки, проверка прогресса и появления файла в списке у второго пользователя (два контекста браузера) — покрывает критерий «превью видно всем участникам».

## 10. Конфигурация (env)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `FILES_STORAGE_DIR` | `./storage` | Корень хранилища (добавить в `.gitignore`) |
| `MAX_FILE_SIZE` | `2147483648` | Лимит файла в байтах |
| `FILE_LINK_SECRET` | — (обязателен) | Секрет подписанных ссылок |
| `FILE_LINK_TTL` | `900` | TTL ссылок, секунд |
| `PREVIEW_CONCURRENCY` | `2` | Параллельные генерации превью |
| `FFMPEG_PATH` | из `ffmpeg-static` | Путь к `ffmpeg` |
| `SOFFICE_PATH` | не задан | Включает fallback превью презентаций через LibreOffice |

Сейчас в проекте нет `@nestjs/config`; читать `process.env` напрямую или добавить `@nestjs/config` (новая зависимость — согласовать).

## 11. Рекомендуемые корректировки плана

1. **Фаза 1:** добавить задачу «доступ участников к встрече» — `GET /meetings/:id` и файловые endpoint'ы должны пускать участников (по email), а не только создателя. Без неё критерии «участник видит и скачивает» невыполнимы.
2. **Фаза 1:** явно добавить `server.requestTimeout` и проверку прав в guard до приёма тела — иначе критерий «файл ровно 2 ГБ загружается» не пройдёт на реальном канале.
3. **Фаза 1:** подписанные ссылки для `download`/`preview` (или зафиксировать альтернативу) — от этого зависит реализация Фаз 2 и 4.
4. **Фаза 1:** `sha256` в метаданных и в ответе API.
5. **Фаза 2:** выдача «встречи, где я участник» на главной (или отдельный список) — иначе участник не найдёт экран встречи; флаг `isOwner` в ответе встречи.
6. **Фаза 3:** принять решение по LibreOffice (ставить на сервер или ограничиться встроенными миниатюрами PPTX/ODP с fallback на иконку) и по PDF-рендереру (`pdfjs-dist` vs Poppler).
7. **Фаза 3:** зафиксировать в контракте `previewStatus` (`none | pending | ready | failed`) вместо одного `previewUrl: null` — фронту нужно отличать «ещё генерируется» от «не будет».

## 12. Открытые вопросы

- Считать ли 2 ГБ как 2 ГиБ (2 147 483 648 байт)? Критерий «2049 МБ отклоняется» с этим согласуется.
- Допустима ли установка системных пакетов (LibreOffice, Poppler) на целевой сервер, или только npm-зависимости?
- Нужна ли докачка (resumable upload) для 2 ГБ-файлов в этой итерации — PRD её не требует, но при нестабильной сети без неё UX плохой.
- Что делать с файлами-сиротами на диске после рестарта (метаданные теряются): оставлять, чистить по расписанию, или ускорить переход на Postgres?
