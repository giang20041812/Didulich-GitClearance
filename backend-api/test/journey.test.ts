import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createAdmin, createPlace, createProvider, createTraveler, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_journey');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

describe('traveler journeys', () => {
  it('rejects non-traveler sessions', async () => {
    const ncc = await createProvider();
    expect((await request(app).get('/api/v1/traveler/journeys').set(bearer(ncc.token))).status).toBe(403);
    expect((await request(app).get('/api/v1/traveler/journeys')).status).toBe(403);
  });

  it('creates, updates, shares, publishes and copies a journey', async () => {
    const owner = await createTraveler('owner@test.vn');
    const other = await createTraveler('other@test.vn');
    const spot = await createPlace({ name: 'Đèo Khau Phạ', kind: 'ATTRACTION', slug: 'deo-khau-pha', latitude: 21.8, longitude: 104.1 });

    const created = await request(app)
      .post('/api/v1/traveler/journeys')
      .set(bearer(owner.token))
      .send({ title: 'Chuyến Tây Bắc', startDate: '2030-03-01', endDate: '2030-03-02', stops: [{ placeId: spot, visitDate: '2030-03-01', session: 'MORNING' }] });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Chuyến Tây Bắc');
    expect(created.body.stops).toHaveLength(1);
    expect(created.body.stops[0]).toMatchObject({ placeId: spot, session: 'MORNING', kind: 'PLACE', origin: 'CUSTOM' });
    expect(created.body.source).toBe('TRAVELER');
    const id = created.body.id as number;

    const list = await request(app).get('/api/v1/traveler/journeys').set(bearer(owner.token));
    expect(list.body).toHaveLength(1);
    expect((await request(app).get(`/api/v1/traveler/journeys/${id}`).set(bearer(other.token))).status).toBe(404);

    // Format 2: thêm mục ăn uống không gắn địa điểm + giờ.
    const updated = await request(app)
      .put(`/api/v1/traveler/journeys/${id}`)
      .set(bearer(owner.token))
      .send({
        title: 'Chuyến Tây Bắc',
        startDate: '2030-03-01',
        endDate: '2030-03-02',
        format: 2,
        stops: [
          { id: created.body.stops[0].id, placeId: spot, visitDate: '2030-03-01', session: 'MORNING', startTime: '08:00', endTime: '09:30' },
          { kind: 'MEAL', title: 'Ăn trưa', dayIndex: 1, startTime: '12:00', session: 'NOON', note: 'Xôi nếp' },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.stops).toHaveLength(2);
    expect(updated.body.stops[0].startTime).toBe('08:00');
    expect(updated.body.stops[1]).toMatchObject({ kind: 'MEAL', title: 'Ăn trưa', dayIndex: 1, visitDate: '2030-03-01' });
    // id của mục đã có được giữ nguyên.
    expect(updated.body.stops[0].id).toBe(created.body.stops[0].id);

    const shared = await request(app).post(`/api/v1/traveler/journeys/${id}/share`).set(bearer(owner.token));
    expect(shared.status).toBe(200);
    const token = shared.body.shareToken as string;
    expect(token).toHaveLength(22);

    const pub = await request(app).get(`/api/public/journeys/shared/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.headers['cache-control']).toBe('no-store');
    expect(pub.body.ownerName).toBe('Test');
    expect(pub.body.items).toHaveLength(2);
    expect(pub.body.completed).toBe(false);
    expect(pub.body.stops[0].visitDate).toBeNull();
    expect(pub.body.stops[0].dayNumber).toBe(1);

    const published = await request(app).post(`/api/v1/traveler/journeys/${id}/publish`).set(bearer(owner.token));
    expect(published.status).toBe(200);
    const feed = await request(app).get('/api/public/journeys/feed');
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0].placeNames).toEqual(['Đèo Khau Phạ']);

    // Khách khác bấm "Hữu ích"; chủ bài thì không.
    const heart = await request(app).put(`/api/v1/traveler/journeys/helpful/${token}`).set(bearer(other.token));
    expect(heart.body).toEqual({ helpful: true, count: 1 });
    expect((await request(app).put(`/api/v1/traveler/journeys/helpful/${token}`).set(bearer(owner.token))).status).toBe(400);
    const state = await request(app).get(`/api/v1/traveler/journeys/helpful?tokens=${token}`).set(bearer(other.token));
    expect(state.body.helpful).toEqual([token]);

    // Áp dụng lịch trình: bản chép của khách khác.
    const copy = await request(app)
      .post('/api/v1/traveler/journeys/copy')
      .set(bearer(other.token))
      .send({ shareToken: token, startDate: '2030-05-10' });
    expect(copy.status).toBe(201);
    expect(copy.body.stops).toHaveLength(2);
    expect(copy.body.startDate).toBe('2030-05-10');
    expect(copy.body.stops[0].visitDate).toBe('2030-05-10');

    // Check-in không ảnh.
    const checkin = await request(app)
      .post(`/api/v1/traveler/journeys/${id}/stops/${spot}/checkin`)
      .set(bearer(owner.token))
      .field('note', 'Đẹp quá')
      .field('removePhoto', 'false');
    expect(checkin.status).toBe(200);
    expect(checkin.body.note).toBe('Đẹp quá');
    const visited = await request(app).get('/api/v1/traveler/journeys/visited-places').set(bearer(owner.token));
    expect(visited.body).toHaveLength(1);

    // Admin ẩn check-in.
    const admin = await createAdmin(3);
    const mod = await request(app).get('/api/v1/admin/journey-checkins').set(bearer(admin.token));
    expect(mod.body.totalElements).toBe(1);
    const hidden = await request(app).post(`/api/v1/admin/journey-checkins/${checkin.body.id}/hide`).set(bearer(admin.token)).send({ reason: 'spam' });
    expect(hidden.status).toBe(200);
    expect(hidden.body.hiddenReason).toBe('spam');

    expect((await request(app).delete(`/api/v1/traveler/journeys/${id}/share`).set(bearer(owner.token))).status).toBe(204);
    expect((await request(app).get(`/api/public/journeys/shared/${token}`)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/traveler/journeys/${id}`).set(bearer(owner.token))).status).toBe(204);
  });

  it('serves an empty trip catalog', async () => {
    const res = await request(app).get('/api/public/trips/catalog?province=Y%C3%AAn%20B%C3%A1i');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('templates');
    expect(res.body).toHaveProperty('addons');
  });
});
