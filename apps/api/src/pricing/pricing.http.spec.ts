import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PricingModule } from './pricing.module';

describe('POST /v1/pricing/calculate (isolated HTTP, no real DB)', () => {
  let app: INestApplication;
  let server: Server;
  const findUnique = jest.fn();
  const valid = { serviceSlug: 'design', priority: 'urgent' };

  beforeEach(async () => {
    findUnique.mockReset().mockResolvedValue({
      id: 'service-1',
      slug: 'design',
      isActive: true,
      pricingModel: 'fixed',
      basePrice: 101,
      packages: [],
    });
    const module = await Test.createTestingModule({
      imports: [PrismaModule, PricingModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ serviceLine: { findUnique } })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterEach(async () => {
    await app?.close();
  });

  it('works for guests with real guards and reads only the public catalog query', async () => {
    const response = await request(server)
      .post('/v1/pricing/calculate')
      .send(valid)
      .expect(200);
    expect(response.body).toMatchObject({
      final_price: 131,
      currency: 'IRT',
      is_binding: false,
      payment_allowed: false,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: 'design' },
      include: {
        packages: { where: { isActive: true } },
        formFields: { orderBy: { sortOrder: 'asc' } },
        acceptanceCriteria: true,
      },
    });
  });

  it.each([
    {},
    { ...valid, serviceSlug: '' },
    { ...valid, serviceSlug: 'x'.repeat(101) },
    { ...valid, serviceSlug: 12 },
    { ...valid, priority: 'constructor' },
    { ...valid, priority: null },
    { ...valid, packageId: null },
    { ...valid, packageId: 'foreign-id' },
    { ...valid, base_price: 1 },
    { ...valid, amount: 1 },
    { ...valid, final_price: 1 },
    { ...valid, policy: { surcharge_pct: 0 } },
  ])(
    'rejects malformed or client-controlled pricing input %#',
    async (body) => {
      await request(server)
        .post('/v1/pricing/calculate')
        .send(body)
        .expect(400);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([null, { id: 'inactive', isActive: false }])(
    'does not expose an unavailable service %#',
    async (service) => {
      findUnique.mockResolvedValue(service);
      await request(server)
        .post('/v1/pricing/calculate')
        .send(valid)
        .expect(404);
    },
  );

  it.each([
    { body: [] },
    { body: [{}] },
    { body: [valid] },
    { body: null },
    { body: 'design' },
  ])(
    'rejects non-object root body %# before reading catalog',
    async ({ body }) => {
      await request(server)
        .post('/v1/pricing/calculate')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(400);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('does not offer a literal /api alias or mutate data on repeated concurrent calls', async () => {
    await request(server)
      .post('/api/v1/pricing/calculate')
      .send(valid)
      .expect(404);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(server).post('/v1/pricing/calculate').send(valid).expect(200),
      ),
    );
    expect(
      responses.every(
        (response) =>
          JSON.stringify(response.body) === JSON.stringify(responses[0].body),
      ),
    ).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(10);
  });

  it('enforces 60 requests per minute without extra catalog reads after the limit', async () => {
    for (let index = 0; index < 60; index += 1) {
      await request(server)
        .post('/v1/pricing/calculate')
        .send(valid)
        .expect(200);
    }
    const response = await request(server)
      .post('/v1/pricing/calculate')
      .send(valid)
      .expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(findUnique).toHaveBeenCalledTimes(60);
  });
});
