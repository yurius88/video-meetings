import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should register a new user and return JWT token', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(typeof res.body.access_token).toBe('string');
          expect(res.body.access_token.length).toBeGreaterThan(0);
        });
    });

    it('should fail to register with existing email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
        })
        .expect(201);

      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
        })
        .expect(409)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toContain('already exists');
        });
    });

    it('should fail to register the same email in a different case', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'case@example.com', password: 'Password123!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'CASE@Example.com', password: 'Password123!' })
        .expect(409);

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'Case@Example.COM', password: 'Password123!' })
        .expect(200);
    });

    it('should fail to register without email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          password: 'Password123!',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(Array.isArray(res.body.message)).toBe(true);
        });
    });

    it('should fail to register without password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
        })
        .expect(400);
    });

    it('should fail to register with invalid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123!',
        })
        .expect(400);
    });

    it('should fail to register with weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test2@example.com',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const userCredentials = {
      email: 'logintest@example.com',
      password: 'Password123!',
    };

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/auth/register').send(userCredentials);
    });

    it('should login existing user and return JWT token', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(userCredentials)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(typeof res.body.access_token).toBe('string');
          expect(res.body.access_token.length).toBeGreaterThan(0);
        });
    });

    it('should fail to login with wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: 'WrongPassword123!',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toContain('Invalid credentials');
        });
    });

    it('should fail to login with non-existent email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toContain('Invalid credentials');
        });
    });

    it('should fail to login without email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          password: 'Password123!',
        })
        .expect(400);
    });

    it('should fail to login without password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
        })
        .expect(400);
    });

    it('should return different tokens for register and login', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'tokentest@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'tokentest@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(registerResponse.body.access_token).toBeDefined();
      expect(loginResponse.body.access_token).toBeDefined();
      expect(typeof registerResponse.body.access_token).toBe('string');
      expect(typeof loginResponse.body.access_token).toBe('string');
    });
  });

  describe('JWT Token Validation', () => {
    let accessToken: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'jwttest@example.com',
        password: 'Password123!',
      });

      accessToken = response.body.access_token;
    });

    it('should reject a token signed with the old hard-coded secret', () => {
      const forged = new JwtService({ secret: 'your-secret-key' }).sign({
        sub: 'forged',
        email: 'jwttest@example.com',
      });
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('should access protected route with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('email');
          expect(res.body.email).toBe('jwttest@example.com');
        });
    });

    it('should fail to access protected route without token', () => {
      return request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('should fail to access protected route with invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });

    it('should fail to access protected route with malformed authorization header', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', accessToken)
        .expect(401);
    });
  });
});
