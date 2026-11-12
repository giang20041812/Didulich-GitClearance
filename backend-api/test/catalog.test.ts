import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anyRegionId, createPlace, createProvider, createRoomType, resetData, setupDatabase, teardownDatabase } from './helpers.js';
import { containsPattern, normalize, unaccentSql } from '../src/lib/vietnamese.js';
import { exec, scalar } from '../src/db/pool.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_catalog');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

describe('vietnamese search helpers', () => {
  it('normalizes and matches without accents in SQL', async () => {
    expect(normalize('  Mù   Cang Chải ĐẸP ')).toBe('mu cang chai dep');
    expect(containsPattern('Mù 100%')).toBe('%mu 100\\%%');
    const hit = await scalar<boolean>(`SELECT ${unaccentSql(`'Mù Cang Chải'`)} LIKE '%mu cang%'`);
    expect(hit).toBe(true);
    const nfd = await scalar<string>(`SELECT ${unaccentSql(`'Đà Nẵng'`)}`);
    expect(nfd).toBe('da nang');
  });
});

describe('public places', () => {
  it('lists published homestays with price, cover and availability', async () => {
    const ncc = await createProvider();
    const region = await anyRegionId(2);
    const id = await createPlace({ name: 'Nhà Sàn Xanh', providerId: ncc.providerId, regionId: region, coverUrl: 'https://img/x.jpg', latitude: 21.7, longitude: 104.0, priceRefMin: 400000 });
    await createRoomType(id, 'Phòng đôi', 450000);
    await createRoomType(id, 'Phòng đơn', 300000);
    await createPlace({ name: 'Bản nháp', providerId: ncc.providerId, visibility: 'DRAFT' });

    const res = await request(app).get('/api/public/places?kind=HOMESTAY&size=12');
    expect(res.status).toBe(200);
    expect(res.body.totalElements).toBe(1);
    const card = res.body.content[0];
    expect(card.name).toBe('Nhà Sàn Xanh');
    expect(card.priceRefMin).toBe(300000);
    expect(card.coverImageUrl).toBe('https://img/x.jpg');
    expect(card.availableForSelectedDates).toBe(true);
    expect(card).not.toHaveProperty('description');
    expect(card).not.toHaveProperty('ratingAvg');
    expect(card.kind).toBe('HOMESTAY');
    expect(res.headers['cdn-cache-control']).toContain('s-maxage=60');
    expect(res.headers.etag).toBeTruthy();
    // ETag → 304
    const again = await request(app).get('/api/public/places?kind=HOMESTAY&size=12').set('If-None-Match', res.headers.etag);
    expect(again.status).toBe(304);
  });

  it('lists published homestays that have no rooms yet as info-only (contact directly)', async () => {
    const ncc = await createProvider();
    const bookable = await createPlace({ name: 'Có phòng bán', providerId: ncc.providerId, priceRefMin: 500000 });
    await createRoomType(bookable, 'Phòng đôi', 500000);
    await createPlace({ name: 'Chỉ có thông tin', providerId: null, priceRefMin: 300000 });
    // Loại phòng đã tắt (INACTIVE) vẫn là chỗ nghỉ có phòng nhưng không bán được → không được liệt kê như "chỉ có thông tin".
    const closed = await createPlace({ name: 'Đã tắt bán phòng', providerId: ncc.providerId });
    const closedRoom = await createRoomType(closed, 'Phòng', 400000);
    await exec(`UPDATE room_type SET status = 'INACTIVE' WHERE id = $1`, [closedRoom]);

    const all = await request(app).get('/api/public/places?kind=HOMESTAY&size=12');
    expect(all.body.content.map((c: { name: string }) => c.name).sort()).toEqual(['Chỉ có thông tin', 'Có phòng bán']);
    const info = all.body.content.find((c: { name: string }) => c.name === 'Chỉ có thông tin');
    expect(info).toMatchObject({ priceRefMin: 300000, hasOnlineRooms: false });
    expect(all.body.content.find((c: { name: string }) => c.name === 'Có phòng bán')).toMatchObject({ hasOnlineRooms: true });

    // Số khách không loại chỗ nghỉ chưa biết sức chứa; lọc theo giá thì vẫn chỉ lấy chỗ có phòng bán có giá.
    const guests = await request(app).get('/api/public/places?kind=HOMESTAY&guests=4');
    expect(guests.body.content.map((c: { name: string }) => c.name)).toContain('Chỉ có thông tin');
    const priced = await request(app).get('/api/public/places?kind=HOMESTAY&maxPrice=1000000');
    expect(priced.body.content.map((c: { name: string }) => c.name)).toEqual(['Có phòng bán']);
    // Loại khác không bị thêm trường này.
    await createPlace({ name: 'Quán ăn', kind: 'RESTAURANT', providerId: null });
    const restaurants = await request(app).get('/api/public/places?kind=RESTAURANT');
    expect(restaurants.body.content[0]).not.toHaveProperty('hasOnlineRooms');
  });

  it('filters by price, keyword (accent-insensitive) and validates', async () => {
    const ncc = await createProvider();
    const a = await createPlace({ name: 'Mù Cang Chải Homestay', providerId: ncc.providerId });
    await createRoomType(a, 'Phòng', 800000);
    const b = await createPlace({ name: 'Sapa View', providerId: ncc.providerId });
    await createRoomType(b, 'Phòng', 200000);

    const cheap = await request(app).get('/api/public/places?kind=HOMESTAY&maxPrice=300000');
    expect(cheap.body.content.map((c: { name: string }) => c.name)).toEqual(['Sapa View']);
    const kw = await request(app).get('/api/public/places?keyword=mu%20cang');
    expect(kw.body.content.map((c: { name: string }) => c.name)).toEqual(['Mù Cang Chải Homestay']);
    const bad = await request(app).get('/api/public/places?minPrice=5&maxPrice=1');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Giá từ không được lớn hơn Giá đến');
  });

  it('marks a place unavailable when the nights are sold out', async () => {
    const ncc = await createProvider();
    const id = await createPlace({ name: 'Hết phòng', providerId: ncc.providerId });
    const room = await createRoomType(id, 'Phòng', 500000, 1);
    await exec(
      `INSERT INTO room_inventory_day (room_type_id, stay_date, total_rooms, held_rooms, confirmed_rooms, stop_sell, updated_at)
       VALUES ($1, '2030-01-02', 1, 0, 1, FALSE, now())`,
      [room],
    );
    const res = await request(app).get('/api/public/places?kind=HOMESTAY&checkIn=2030-01-01&checkOut=2030-01-04');
    expect(res.body.content[0].availableForSelectedDates).toBe(false);
    const free = await request(app).get('/api/public/places?kind=HOMESTAY&checkIn=2030-02-01&checkOut=2030-02-03');
    expect(free.body.content[0].availableForSelectedDates).toBe(true);
  });

  it('serves detail by slug and id, rooms, map context, regions', async () => {
    const ncc = await createProvider();
    const region = await anyRegionId(2);
    const id = await createPlace({ name: 'Chi tiết', slug: 'chi-tiet', providerId: ncc.providerId, regionId: region, latitude: 21.7, longitude: 104.0, address: 'Bản A' });
    await createRoomType(id, 'Phòng đôi', 450000);

    const bySlug = await request(app).get('/api/public/places/chi-tiet');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.slug).toBe('chi-tiet');
    expect(bySlug.body.rooms).toHaveLength(1);
    expect(bySlug.body.verifiedGpsText).toBe('21.700000 - 104.000000');
    expect(bySlug.body.priceUnitNote).toBe('đêm');
    expect(bySlug.body.provinceName).toBeTruthy();

    const byId = await request(app).get(`/api/public/places/${id}`);
    expect(byId.body.id).toBe(id);
    expect((await request(app).get('/api/public/places/khong-co')).status).toBe(404);

    const roomsRes = await request(app).get('/api/public/places/chi-tiet/rooms');
    expect(roomsRes.body[0].availableRooms).toBe(2);
    expect(roomsRes.body[0].badgeText).toBe('Còn 2 phòng trống');
    expect(roomsRes.body[0].features).toContain('Vệ sinh khép kín');

    const map = await request(app).get('/api/public/places/chi-tiet/map-context');
    expect(map.body.scenarios[0].code).toBe(`MAP-${id}`);
    expect(map.body.verificationBadge).toBe('Community Listed');

    const regions = await request(app).get('/api/public/places/regions');
    expect(Array.isArray(regions.body)).toBe(true);
    expect(regions.body[0]).toHaveProperty('province');
    expect((await request(app).get('/api/public/places/amenities')).status).toBe(200);
  });

  it('serves the home page payload', async () => {
    const res = await request(app).get('/api/public/home');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ categories: [], featuredTours: [] });
    expect(Array.isArray(res.body.featuredDestinations)).toBe(true);
  });
});
