import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdtempSync, promises as fs, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from './../src/app.module';

const MAX_FILE_SIZE = 64 * 1024;
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024, 7)]);
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(512, 1)]);

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const binaryParser = (
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Meeting files (e2e)', () => {
  let app: INestApplication;
  let storageDir: string;
  let ownerToken: string;
  let participantToken: string;
  let strangerToken: string;
  let meetingId: string;

  const register = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Test123!', name: email });
    return res.body.access_token as string;
  };

  const upload = (token: string, content: Buffer, filename: string) =>
    request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', content, filename);

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'vm-files-'));
    process.env.FILES_STORAGE_DIR = storageDir;
    process.env.MAX_FILE_SIZE = String(MAX_FILE_SIZE);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ownerToken = await register('files-owner@example.com');
    participantToken = await register('files-participant@example.com');
    strangerToken = await register('files-stranger@example.com');

    const meeting = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Встреча с файлами',
        date: '2026-10-01T10:00:00Z',
        participants: ['Files-Participant@example.com'],
      });
    meetingId = meeting.body.id;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FILES_STORAGE_DIR;
    delete process.env.MAX_FILE_SIZE;
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  describe('POST /meetings/:id/files', () => {
    it('создатель загружает файл, метаданные и хеш совпадают', async () => {
      const res = await upload(ownerToken, PDF, 'Отчёт за квартал.pdf').expect(201);

      expect(res.body).toMatchObject({
        meetingId,
        name: 'Отчёт за квартал.pdf',
        size: PDF.length,
        mimeType: 'application/pdf',
        category: 'pdf',
        sha256: sha256(PDF),
        previewUrl: null,
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(readdirSync(join(storageDir, 'files'))).toContain(res.body.id);
    });

    it('файл ровно в лимит загружается', async () => {
      const exact = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(MAX_FILE_SIZE - 8, 2)]);
      const res = await upload(ownerToken, exact, 'limit.png').expect(201);
      expect(res.body.size).toBe(MAX_FILE_SIZE);
    });

    it('файл на 1 байт больше лимита отклоняется с 413 и не остаётся на диске', async () => {
      const before = readdirSync(join(storageDir, 'files')).length;
      const tooBig = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(MAX_FILE_SIZE - 7, 2)]);

      const res = await upload(ownerToken, tooBig, 'too-big.png').expect(413);

      expect(res.body.message).toContain('Файл превышает максимальный размер');
      expect(readdirSync(join(storageDir, 'files'))).toHaveLength(before);
      expect(readdirSync(join(storageDir, 'files', '.tmp'))).toHaveLength(0);
    });

    it('запрос с Content-Length намного больше лимита отклоняется до чтения тела', () =>
      request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Content-Type', 'multipart/form-data; boundary=x')
        .set('Content-Length', String(MAX_FILE_SIZE * 10))
        .send('')
        .expect(413));

    it('недопустимое расширение отклоняется с 415', async () => {
      const res = await upload(ownerToken, Buffer.from('MZ'), 'virus.exe').expect(415);
      expect(res.body.message).toContain('Недопустимый тип файла');
    });

    it('подменённое расширение отклоняется с 415 и файл удаляется', async () => {
      const before = readdirSync(join(storageDir, 'files')).length;
      const res = await upload(ownerToken, Buffer.from('MZ\x90\x00binary'), 'fake.pdf').expect(415);
      expect(res.body.message).toContain('не соответствует');
      expect(readdirSync(join(storageDir, 'files'))).toHaveLength(before);
    });

    it('запрос без файла отклоняется с 400', () =>
      request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('comment', 'без файла')
        .expect(400));

    it('участник (не создатель) получает 403', () =>
      upload(participantToken, PDF, 'doc.pdf').expect(403));

    it('посторонний пользователь получает 404', () =>
      upload(strangerToken, PDF, 'doc.pdf').expect(404));

    it('без токена — 401', () =>
      request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .attach('file', PDF, 'doc.pdf')
        .expect(401));
  });

  describe('GET /meetings/:id/files', () => {
    it('участник видит список файлов с нужными полями', async () => {
      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
      for (const file of res.body) {
        expect(file).toEqual(
          expect.objectContaining({
            name: expect.any(String),
            size: expect.any(Number),
            mimeType: expect.any(String),
            uploadedAt: expect.any(String),
            previewUrl: null,
          }),
        );
      }
    });

    it('посторонний получает 404, несуществующая встреча — 404', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get('/meetings/non-existent/files')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('без токена — 401', () =>
      request(app.getHttpServer()).get(`/meetings/${meetingId}/files`).expect(401));
  });

  describe('GET /meetings/:id/files/:fileId/download', () => {
    let fileId: string;

    beforeAll(async () => {
      const res = await upload(ownerToken, PDF, 'Протокол встречи.pdf');
      fileId = res.body.id;
    });

    it('участник скачивает файл, идентичный загруженному', async () => {
      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .set('Authorization', `Bearer ${participantToken}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(sha256(res.body)).toBe(sha256(PDF));
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(
        encodeURIComponent('Протокол встречи.pdf'),
      );
    });

    it('поддерживает Range-запросы', async () => {
      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Range', 'bytes=0-3')
        .buffer(true)
        .parse(binaryParser)
        .expect(206);

      expect(res.body.toString()).toBe('%PDF');
    });

    it('посторонний — 404, без токена — 401, неизвестный файл — 404', async () => {
      const url = `/meetings/${meetingId}/files/${fileId}/download`;
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/unknown/download`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
