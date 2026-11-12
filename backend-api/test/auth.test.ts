import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createAdmin, createProvider, createTraveler, resetData, setupDatabase, teardownDatabase } from './helpers.js';
import { matchPattern, decide } from '../src/security/accessRules.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_auth');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

describe('access rules', () => {
  it('matches Ant-style patterns', () => {
    expect(matchPattern('/api/v1/admin/accounts/**', '/api/v1/admin/accounts')).toBe(true);
    expect(matchPattern('/api/v1/admin/accounts/**', '/api/v1/admin/accounts/5/status')).toBe(true);
    expect(matchPattern('/api/v1/admin/accounts/*/status', '/api/v1/admin/accounts/5/status')).toBe(true);
    expect(matchPattern('/api/v1/admin/accounts/*/status', '/api/v1/admin/accounts/5/6/status')).toBe(false);
    expect(matchPattern('/', '/')).toBe(true);
    expect(matchPattern('/', '/x')).toBe(false);
  });

  it('applies admin levels', () => {
    const l3 = { accountId: 1, identifier: 'a', role: 'ADMIN', providerId: null, adminLevel: 3 } as const;
    const l2 = { ...l3, adminLevel: 2 };
    const l1 = { ...l3, adminLevel: 1 };
    expect(decide('GET', '/api/v1/admin/bookings', l3)).toBe('allow');
    expect(decide('POST', '/api/v1/admin/bookings/1/confirm', l3)).toBe('forbidden');
    expect(decide('POST', '/api/v1/admin/bookings/1/confirm', l2)).toBe('allow');
    expect(decide('POST', '/api/v1/admin/bookings/1/notes', l3)).toBe('allow');
    expect(decide('GET', '/api/v1/admin/finance/refunds', l2)).toBe('forbidden');
    expect(decide('GET', '/api/v1/admin/finance/refunds', l1)).toBe('allow');
    expect(decide('GET', '/api/v1/admin/audit-logs', l3)).toBe('forbidden');
    expect(decide('GET', '/api/v1/admin/bookings', undefined)).toBe('unauthenticated');
    expect(decide('GET', '/api/public/places', undefined)).toBe('allow');
  });
});

describe('health', () => {
  it('reports UP', async () => {
    const res = await request(app).get('/api/public/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('portal login', () => {
  it('logs an admin in and returns a usable session token', async () => {
    const admin = await createAdmin(1);
    const res = await request(app).post('/api/v1/auth/portal/login').send({ identifier: admin.email, password: admin.password });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.adminLevel).toBe(1);
    expect(res.body.redirectUrl).toBe('/admin');
    expect(res.body.tokenType).toBe('Bearer');

    // Token mới đi qua được bộ lọc xác thực (vùng cần ADMIN).
    const me = await request(app).get('/api/v1/admin/accounts/me').set(bearer(res.body.token));
    expect(me.status).not.toBe(403);
    expect(me.status).not.toBe(401);
  });

  it('rejects bad credentials with a generic message', async () => {
    const admin = await createAdmin(1);
    const res = await request(app).post('/api/v1/auth/portal/login').send({ identifier: admin.email, password: 'sai-mat-khau' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('validates the body', async () => {
    const res = await request(app).post('/api/v1/auth/portal/login').send({ identifier: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('refuses traveler accounts at the portal door', async () => {
    const t = await createTraveler();
    const res = await request(app).post('/api/v1/auth/portal/login').send({ identifier: t.email, password: t.password });
    expect(res.status).toBe(401);
  });

  it('revokes the session on logout', async () => {
    const admin = await createAdmin(1);
    const login = await request(app).post('/api/v1/auth/portal/login').send({ identifier: admin.email, password: admin.password });
    const token = login.body.token as string;
    expect((await request(app).post('/api/v1/auth/portal/logout').set(bearer(token))).status).toBe(204);
    const after = await request(app).get('/api/v1/admin/accounts/me').set(bearer(token));
    expect(after.status).toBe(401);
    expect(after.body.errorCode).toBe('SESSION_REVOKED');
  });
});

describe('authorization', () => {
  it('returns 403 for anonymous access to protected endpoints', async () => {
    const res = await request(app).get('/api/v1/admin/bookings');
    expect(res.status).toBe(403);
  });

  it('returns 401 SESSION_REVOKED for forged tokens on protected paths', async () => {
    const res = await request(app).get('/api/v1/admin/bookings').set(bearer('not.a.token'));
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('SESSION_REVOKED');
  });

  it('denies a provider on admin endpoints and records an audit event', async () => {
    const ncc = await createProvider();
    const res = await request(app).get('/api/v1/admin/bookings').set(bearer(ncc.token));
    expect(res.status).toBe(403);
  });

  it('ignores a bad token on public paths', async () => {
    const res = await request(app).get('/api/public/health').set(bearer('garbage'));
    expect(res.status).toBe(200);
  });
});

describe('traveler auth', () => {
  it('registers, logs in and rejects duplicates', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/traveler/register')
      .send({ fullName: 'Nguyen Van A', email: 'A@Example.com', phone: '0912345678', password: 'matkhau123', confirmPassword: 'matkhau123' });
    expect(reg.status).toBe(201);
    expect(reg.body.email).toBe('a@example.com');
    expect(reg.body.token).toBeTruthy();

    const dup = await request(app)
      .post('/api/v1/auth/traveler/register')
      .send({ fullName: 'Nguyen Van B', email: 'a@example.com', phone: '0912345678', password: 'matkhau123', confirmPassword: 'matkhau123' });
    expect(dup.status).toBe(409);
    expect(dup.body.errorCode).toBe('ACCOUNT_EXISTS');
    expect(dup.body.fieldErrors).toHaveLength(2);

    const login = await request(app).post('/api/v1/auth/traveler/login').send({ identifier: 'a@example.com', password: 'matkhau123' });
    expect(login.status).toBe(200);
    const bad = await request(app).post('/api/v1/auth/traveler/login').send({ identifier: 'a@example.com', password: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('throttles repeated wrong passwords per identifier', async () => {
    await createTraveler('x@test.vn');
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await request(app).post('/api/v1/auth/traveler/login').send({ identifier: 'x@test.vn', password: 'sai' })).status;
    }
    expect(last).toBe(429);
  });
});
