import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Meetings (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'test@example.com',
      password: 'Test123!',
      name: 'Test User',
    });

    authToken = registerResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /meetings', () => {
    it('должен создать новую встречу', () => {
      return request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Планирование спринта',
          date: '2026-09-25T10:00:00Z',
          participants: ['user1@example.com', 'user2@example.com'],
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('Планирование спринта');
          expect(res.body.date).toBe('2026-09-25T10:00:00Z');
          expect(res.body.participants).toEqual(['user1@example.com', 'user2@example.com']);
          expect(res.body).toHaveProperty('createdBy');
        });
    });
  });

  describe('GET /meetings', () => {
    it('должен вернуть список всех встреч текущего пользователя', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Встреча 1',
          date: '2026-09-26T14:00:00Z',
          participants: ['user3@example.com'],
        });

      return request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('id');
          expect(res.body[0]).toHaveProperty('title');
          expect(res.body[0]).toHaveProperty('date');
          expect(res.body[0]).toHaveProperty('participants');
        });
    });
  });

  describe('GET /meetings/:id', () => {
    it('должен вернуть встречу по ID', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Встреча для получения',
          date: '2026-09-27T16:00:00Z',
          participants: ['user4@example.com'],
        });

      const meetingId = createResponse.body.id;

      return request(app.getHttpServer())
        .get(`/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(meetingId);
          expect(res.body.title).toBe('Встреча для получения');
        });
    });

    it('должен вернуть 404 если встреча не найдена', () => {
      return request(app.getHttpServer())
        .get('/meetings/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
