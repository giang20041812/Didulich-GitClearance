import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfig } from '../src/config/env.js';
import { exec, one, query } from '../src/db/pool.js';
import { CronExpression, dueSlot } from '../src/lib/cronExpression.js';
import { nowLocal, plusDaysTime } from '../src/lib/time.js';
import { resetCronState } from '../src/services/cronService.js';
import { resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_cron');
});
afterAll(async () => {
  delete process.env.CRON_SECRET;
  delete process.env.RETENTION_CRON;
  resetConfig();
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
  resetCronState();
});

describe('cron expression', () => {
  it('computes the next run like Spring CronExpression', () => {
    const daily = new CronExpression('0 30 3 * * *');
    expect(daily.next('2026-10-22T01:00:00')).toBe('2026-10-22T03:30:00');
    expect(daily.next('2026-10-22T03:30:00')).toBe('2026-10-23T03:30:00');
    expect(daily.next('2026-12-31T23:59:59')).toBe('2027-01-01T03:30:00');
    expect(new CronExpression('0 */15 * * * *').next('2026-10-22T10:07:30')).toBe('2026-10-22T10:15:00');
    // Thứ Hai 09:00 hằng tuần (2026-10-22 là thứ Năm).
    expect(new CronExpression('0 0 9 * * MON').next('2026-10-22T10:00:00')).toBe('2026-10-26T09:00:00');
    expect(new CronExpression('0 0 0 29 FEB *').next('2026-10-22T00:00:00')).toBe('2028-02-29T00:00:00');
    expect(() => new CronExpression('* * *')).toThrow();
  });

  it('finds the due slot inside the window', () => {
    const cron = new CronExpression('0 30 3 * * *');
    expect(dueSlot(cron, 15, '2026-10-22T03:36:10')).toBe('2026-10-22T03:30:00');
    expect(dueSlot(cron, 15, '2026-10-22T03:45:01')).toBeNull();
    expect(dueSlot(cron, 15, '2026-10-22T03:29:59')).toBeNull();
  });
});

describe('/api/internal/cron/tick', () => {
  it('is disabled without CRON_SECRET and checks the bearer secret', async () => {
    delete process.env.CRON_SECRET;
    resetConfig();
    const off = await request(app).get('/api/internal/cron/tick');
    expect(off.status).toBe(404);
    expect(off.body).toEqual({ status: 404, errorCode: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên.' });

    process.env.CRON_SECRET = 'cron-secret-123';
    resetConfig();
    expect((await request(app).get('/api/internal/cron/tick')).status).toBe(401);
    const wrong = await request(app).get('/api/internal/cron/tick').set('Authorization', 'Bearer nope');
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ status: 401, errorCode: 'UNAUTHORIZED', message: 'Thiếu hoặc sai CRON_SECRET.' });
  });

  it('runs retention, reminders and auto checkout in one tick', async () => {
    process.env.CRON_SECRET = 'cron-secret-123';
    // Khung dọn dữ liệu luôn rơi vào lúc này: mỗi giây của mọi phút.
    process.env.RETENTION_CRON = '* * * * * *';
    resetConfig();
    const old = plusDaysTime(nowLocal(), -400);
    await exec(`INSERT INTO audit_log (actor, action, entity_type, result, created_at) VALUES ('SYSTEM', 'OLD_EVENT', 'System', 'SUCCESS', $1)`, [old]);
    await exec(`INSERT INTO audit_log (actor, action, entity_type, result, created_at) VALUES ('SYSTEM', 'NEW_EVENT', 'System', 'SUCCESS', $1)`, [nowLocal()]);

    const res = await request(app).get('/api/internal/cron/tick').set('Authorization', 'Bearer cron-secret-123');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK', retention: { auditLogs: 1, passwordResetTokens: 0, notifications: 0 }, stayCheckout: { checkedOut: 0 } });
    expect(res.body.journeyReminders).toBeDefined();
    expect(await one('SELECT id FROM audit_log WHERE action = $1', ['OLD_EVENT'])).toBeNull();
    const purge = await query<{ action: string }>(`SELECT action FROM audit_log WHERE action = 'DATA_RETENTION_PURGE'`);
    expect(purge).toHaveLength(1);

    // Cùng khung thì không dọn lại.
    const again = await request(app).get('/api/internal/cron/tick').set('Authorization', 'Bearer cron-secret-123');
    expect(again.body.retention).toMatch(/ALREADY_DONE|^\{/);
  });
});
