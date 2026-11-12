import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exec, one, query } from '../src/db/pool.js';
import { formatDistance } from '../src/lib/exploreRules.js';
import { byDistanceThenName, rank } from '../src/lib/exploreRanking.js';
import { statusAt } from '../src/lib/openingHours.js';
import { bearer, createAdmin, createPlace, createProvider, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_explore');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

const homestayAt = (providerId: number | null = null) =>
  createPlace({ name: 'Homestay Mù Cang Chải', providerId, latitude: 21.85, longitude: 104.08, coordVerified: true });

const placeBody = (extra: Record<string, unknown> = {}) => ({
  name: 'Quán Xôi Nếp Nương',
  category: 'FOOD',
  summary: 'Xôi nếp nương thơm dẻo',
  address: 'Bản Mù, Mù Cang Chải',
  latitude: 21.86,
  longitude: 104.09,
  phone: '0912 345 678',
  website: 'https://xoi.example.vn',
  openingHours: [
    { dayOfWeek: 1, closed: false, open: '06:00', close: '21:00' },
    { dayOfWeek: 7, closed: true },
  ],
  images: [{ imageId: `img-${Math.random().toString(36).slice(2)}`, url: 'https://cdn.example/a.jpg' }],
  coordVerified: true,
  ...extra,
});

describe('pure rules', () => {
  it('formats distances like the Java service', () => {
    expect(formatDistance(0.85)).toBe('850 m');
    expect(formatDistance(0.9951)).toBe('1,0 km');
    expect(formatDistance(2.44)).toBe('2,4 km');
    expect(formatDistance(0.004)).toBe('0 m');
    expect(formatDistance(-1)).toBeNull();
  });

  it('ranks pins first, then distance then Vietnamese name', () => {
    const c = (id: number, name: string, km: number) => ({ id, name, category: 'FOOD' as const, distanceKm: km });
    const ranked = rank([c(9, 'Ghim xa', 30)], [c(1, 'Đồi', 1.0), c(2, 'Ăn', 1.0001), c(3, 'Ba', 0.5), c(9, 'Ghim xa', 30)]);
    expect(ranked.map((r) => [r.candidate.id, r.pinned])).toEqual([[9, true], [3, false], [2, false], [1, false]]);
    expect(byDistanceThenName(c(1, 'Ăn', 1), c(2, 'Bún', 1))).toBeLessThan(0);
  });

  it('computes the open status in Vietnam time', () => {
    const week = [
      { dayOfWeek: 1, closed: false, open: '08:00:00', close: '17:00:00' },
      { dayOfWeek: 2, closed: true, open: null, close: null },
      { dayOfWeek: 5, closed: false, open: '18:00:00', close: '02:00:00' },
    ];
    // 2026-10-19 là thứ Hai.
    expect(statusAt(week, '2026-10-19T10:00:00')).toEqual({ open: true, text: 'Đang mở cửa, đóng lúc 17:00' });
    expect(statusAt(week, '2026-10-19T17:00:00')?.open).toBe(false);
    expect(statusAt(week, '2026-10-19T07:00:00')).toEqual({ open: false, text: 'Đã đóng cửa, mở lúc 08:00' });
    expect(statusAt(week, '2026-10-20T10:00:00')).toEqual({ open: false, text: 'Hôm nay nghỉ, mở lúc 18:00 thứ Sáu' });
    // Thứ Bảy 01:00 vẫn trong khung qua đêm của thứ Sáu.
    expect(statusAt(week, '2026-10-24T01:00:00')).toEqual({ open: true, text: 'Đang mở cửa, đóng lúc 02:00' });
    expect(statusAt([], '2026-10-19T10:00:00')).toBeNull();
  });
});

describe('admin explore places', () => {
  it('validates the form, creates a visible place and lists it', async () => {
    const root = await createAdmin(1);
    const invalid = await request(app).post('/api/v1/admin/explore/places').set(bearer(root.token)).send({ name: ' ', latitude: 10, images: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain('Vui lòng nhập tên địa điểm.');
    const fields = invalid.body.fieldErrors.map((f: { field: string }) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'category', 'summary', 'images', 'coordinates']));

    const created = await request(app).post('/api/v1/admin/explore/places').set(bearer(root.token)).send(placeBody());
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      name: 'Quán Xôi Nếp Nương',
      category: 'FOOD',
      kind: 'RESTAURANT',
      visible: true,
      approvalStatus: 'APPROVED',
      coordVerified: true,
      phone: '0912345678',
      website: 'https://xoi.example.vn',
    });
    expect(created.body.images).toHaveLength(1);
    expect(created.body.images[0].cover).toBe(true);
    expect(created.body.openingHours).toEqual([
      { dayOfWeek: 1, dayName: 'thứ Hai', closed: false, open: '06:00', close: '21:00' },
      { dayOfWeek: 7, dayName: 'Chủ nhật', closed: true, open: null, close: null },
    ]);
    const id = created.body.id;

    const list = await request(app).get('/api/v1/admin/explore/places?keyword=xoi nep&category=FOOD&status=VISIBLE&coord=VERIFIED').set(bearer(root.token));
    expect(list.body.totalElements).toBe(1);
    expect(list.body.content[0]).toMatchObject({ id, categoryLabel: 'Ăn uống', visible: true, hasCoordinates: true, coordVerified: true, pendingEdit: false });

    // Đổi tọa độ → cờ xác minh tự tắt dù form còn tick.
    const moved = await request(app).put(`/api/v1/admin/explore/places/${id}`).set(bearer(root.token)).send(placeBody({ latitude: 21.87, longitude: 104.1, images: [{ mediaId: created.body.images[0].mediaId }] }));
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ latitude: 21.87, longitude: 104.1, coordVerified: false });
    const verified = await request(app).patch(`/api/v1/admin/explore/places/${id}/coord-verified`).set(bearer(root.token)).send({ verified: true });
    expect(verified.body.coordVerified).toBe(true);

    const hidden = await request(app).patch(`/api/v1/admin/explore/places/${id}/visibility`).set(bearer(root.token)).send({ visible: false });
    expect(hidden.body.visible).toBe(false);
    expect((await request(app).get('/api/v1/admin/explore/places?status=HIDDEN').set(bearer(root.token))).body.totalElements).toBe(1);

    const noCoord = await createPlace({ name: 'Thác chưa có tọa độ', kind: 'ATTRACTION' });
    const bulk = await request(app).post('/api/v1/admin/explore/places/coord-verified/bulk').set(bearer(root.token)).send({ ids: [noCoord, id] });
    expect(bulk.body).toEqual({ updated: 0, skipped: ['Thác chưa có tọa độ: chưa có tọa độ'] });
  });

  it('configures the radius and pins places for a homestay', async () => {
    const root = await createAdmin(1);
    const home = await homestayAt();
    const near = await request(app).post('/api/v1/admin/explore/places').set(bearer(root.token)).send(placeBody({ name: 'Quán gần' }));
    const far = await request(app)
      .post('/api/v1/admin/explore/places')
      .set(bearer(root.token))
      .send(placeBody({ name: 'Thác xa', category: 'SIGHTSEEING', latitude: 22.4, longitude: 104.9 }));
    expect(far.status).toBe(200);

    expect((await request(app).get('/api/v1/admin/explore/settings').set(bearer(root.token))).body).toEqual({ radiusKm: 10, radiusMinKm: 1, radiusMaxKm: 50 });
    const badRadius = await request(app).put('/api/v1/admin/explore/settings').set(bearer(root.token)).send({ radiusKm: 99 });
    expect(badRadius.body).toEqual({ status: 400, message: 'Bán kính phải từ 1 đến 50 km.' });
    expect((await request(app).put('/api/v1/admin/explore/settings').set(bearer(root.token)).send({ radiusKm: 5 })).body.radiusKm).toBe(5);

    const options = await request(app).get('/api/v1/admin/explore/homestays?keyword=mu cang').set(bearer(root.token));
    expect(options.body).toEqual([{ id: home, name: 'Homestay Mù Cang Chải', address: null, hasCoordinates: true }]);

    const overview = await request(app).get(`/api/v1/admin/explore/homestays/${home}`).set(bearer(root.token));
    expect(overview.body).toMatchObject({ hasCoordinates: true, radiusKm: 5, pinMax: 10, pins: [] });
    expect(overview.body.inRadius.map((i: { id: number }) => i.id)).toEqual([near.body.id]);

    const pinned = await request(app).post(`/api/v1/admin/explore/homestays/${home}/pins`).set(bearer(root.token)).send({ placeId: far.body.id });
    expect(pinned.status).toBe(200);
    expect(pinned.body.pins.map((p: { id: number }) => p.id)).toEqual([far.body.id]);
    expect(pinned.body.preview.map((c: { id: number; pinned: boolean }) => [c.id, c.pinned])).toEqual([[far.body.id, true], [near.body.id, false]]);
    const dup = await request(app).post(`/api/v1/admin/explore/homestays/${home}/pins`).set(bearer(root.token)).send({ placeId: far.body.id });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Địa điểm đã được ghim.');
    const reordered = await request(app).put(`/api/v1/admin/explore/homestays/${home}/pins/order`).set(bearer(root.token)).send({ placeIds: [far.body.id] });
    expect(reordered.status).toBe(200);
    const stale = await request(app).put(`/api/v1/admin/explore/homestays/${home}/pins/order`).set(bearer(root.token)).send({ placeIds: [near.body.id] });
    expect(stale.status).toBe(409);

    const search = await request(app).get(`/api/v1/admin/explore/homestays/${home}/search?keyword=thac`).set(bearer(root.token));
    expect(search.body[0]).toMatchObject({ id: far.body.id, pinned: true, eligible: true });

    // Công khai: ghim ngoài bán kính vẫn hiện, đứng đầu.
    const publicPage = await request(app).get(`/api/public/explore/homestays/${home}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body).toMatchObject({ radiusKm: 5, totalElements: 2, hasMore: false });
    expect(publicPage.body.items.map((i: { id: number; pinned: boolean }) => [i.id, i.pinned])).toEqual([[far.body.id, true], [near.body.id, false]]);
    expect(publicPage.body.items[1]).toMatchObject({ category: 'FOOD', categoryLabel: 'Ăn uống', distanceText: '1,5 km' });
    expect(publicPage.body.categories.map((c: { code: string; count: number }) => [c.code, c.count])).toEqual([['SIGHTSEEING', 1], ['FOOD', 1]]);
    const onlyFood = await request(app).get(`/api/public/explore/homestays/${home}?category=FOOD`);
    expect(onlyFood.body.items).toHaveLength(1);

    const detail = await request(app).get(`/api/public/explore/places/${near.body.id}?homestayId=${home}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ name: 'Quán gần', phone: '0912345678', homestay: { id: home }, distanceText: '1,5 km' });
    expect(detail.body.openingHours).toHaveLength(2);
    expect(detail.body).toHaveProperty('openStatus');

    const unpinned = await request(app).delete(`/api/v1/admin/explore/homestays/${home}/pins/${far.body.id}`).set(bearer(root.token));
    expect(unpinned.body.pins).toEqual([]);
    expect((await request(app).get('/api/public/explore/homestays/999999')).status).toBe(404);
  });
});

describe('partner explore places', () => {
  it('goes through approval for new places and edits', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const other = await createProvider();
    const created = await request(app).post('/api/v1/partner/explore-places').set(bearer(ncc.token)).send(placeBody({ name: 'Quán của NCC', coordVerified: true, visible: true }));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ approvalStatus: 'PENDING', visible: false, coordVerified: false, providerId: ncc.providerId });
    const id = created.body.id;

    // Khách chưa thấy; NCC khác không mở được.
    expect((await request(app).get(`/api/public/explore/places/${id}`)).status).toBe(404);
    const foreign = await request(app).get(`/api/v1/partner/explore-places/${id}`).set(bearer(other.token));
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ status: 403, message: 'Bạn không có quyền truy cập nội dung này' });

    const list = await request(app).get('/api/v1/partner/explore-places').set(bearer(ncc.token));
    expect(list.body.totalElements).toBe(1);
    const pendingList = await request(app).get('/api/v1/admin/explore/places?status=PENDING').set(bearer(root.token));
    expect(pendingList.body.totalElements).toBe(1);

    const shortReason = await request(app).post(`/api/v1/admin/explore/places/${id}/reject`).set(bearer(root.token)).send({ reason: 'ngắn' });
    expect(shortReason.body).toEqual({ status: 400, message: 'Lý do từ chối phải từ 10 đến 500 ký tự.' });
    const approved = await request(app).post(`/api/v1/admin/explore/places/${id}/approve`).set(bearer(root.token));
    expect(approved.body).toMatchObject({ approvalStatus: 'APPROVED', visible: true });
    expect((await request(app).post(`/api/v1/admin/explore/places/${id}/approve`).set(bearer(root.token))).status).toBe(409);

    // Sửa bản đã duyệt → bản sửa chờ duyệt, bản đang hiển thị giữ nguyên.
    const edited = await request(app)
      .put(`/api/v1/partner/explore-places/${id}`)
      .set(bearer(ncc.token))
      .send(placeBody({ name: 'Quán của NCC (đổi tên)', images: [{ mediaId: created.body.images[0].mediaId }] }));
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('Quán của NCC');
    expect(edited.body.pendingEdit).toMatchObject({ status: 'PENDING', changes: { name: 'Quán của NCC (đổi tên)' } });
    const reject = await request(app).post(`/api/v1/admin/explore/places/${id}/edit/reject`).set(bearer(root.token)).send({ reason: 'Tên chưa phù hợp, vui lòng sửa lại' });
    expect(reject.body.pendingEdit).toMatchObject({ status: 'REJECTED', rejectReason: 'Tên chưa phù hợp, vui lòng sửa lại' });
    await request(app)
      .put(`/api/v1/partner/explore-places/${id}`)
      .set(bearer(ncc.token))
      .send(placeBody({ name: 'Quán của NCC (bản 2)', images: [{ mediaId: created.body.images[0].mediaId }] }));
    const applied = await request(app).post(`/api/v1/admin/explore/places/${id}/edit/approve`).set(bearer(root.token));
    expect(applied.body).toMatchObject({ name: 'Quán của NCC (bản 2)', pendingEdit: null });
    expect(await query('SELECT id FROM place_edit_request WHERE place_id = $1 AND status = $2', [id, 'APPROVED'])).toHaveLength(1);

    const notices = await request(app).get('/api/v1/partner/notifications').set(bearer(ncc.token));
    expect(notices.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('manages service listings for transport and experience providers', async () => {
    const root = await createAdmin(1);
    const bus = await createProvider('Nhà xe Sơn Lâm', 'TRANSPORT');
    const homestay = await createProvider('Homestay thường', 'HOMESTAY');
    const denied = await request(app).get('/api/v1/partner/listings/config').set(bearer(homestay.token));
    expect(denied.status).toBe(403);
    expect(denied.body.message).toBe('Chức năng này dành cho nhà xe và nhà cung cấp trải nghiệm.');

    const config = await request(app).get('/api/v1/partner/listings/config').set(bearer(bus.token));
    expect(config.body).toMatchObject({ serviceType: 'TRANSPORT', category: 'LOCAL_SERVICE', categoryLabel: 'Dịch vụ địa phương' });
    expect(config.body.groups.map((g: { code: string }) => g.code)).toEqual(['LOCAL_MOTO', 'TOUR_MOTO', 'SELF_DRIVE', 'INTERCITY_BUS', 'SHARED_CAR']);

    const noService = await request(app).post('/api/v1/partner/listings').set(bearer(bus.token)).send(placeBody({ category: 'LOCAL_SERVICE' }));
    expect(noService.status).toBe(400);
    expect(noService.body.fieldErrors).toEqual([{ field: 'serviceGroup', message: 'Vui lòng chọn loại dịch vụ.' }]);
    const wrongGroup = await request(app)
      .post('/api/v1/partner/listings')
      .set(bearer(bus.token))
      .send(placeBody({ service: { serviceGroup: 'TREKKING' } }));
    expect(wrongGroup.body.message).toBe('Loại dịch vụ không phù hợp với loại hình Nhà xe.');
    const noRoute = await request(app)
      .post('/api/v1/partner/listings')
      .set(bearer(bus.token))
      .send(placeBody({ service: { serviceGroup: 'INTERCITY_BUS', seats: 16 } }));
    expect(noRoute.body.fieldErrors).toEqual([{ field: 'route', message: 'Vui lòng nhập điểm đi và điểm đến của tuyến.' }]);

    const created = await request(app)
      .post('/api/v1/partner/listings')
      .set(bearer(bus.token))
      .send(placeBody({ name: 'Xe khách Hà Nội - Mù Cang Chải', priceFrom: 250000, priceUnit: 'vé', service: { serviceGroup: 'INTERCITY_BUS', routeFrom: 'Hà Nội', routeTo: 'Mù Cang Chải', departureTimes: '06:00, 13:00', seats: 16 } }));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ kind: 'TRANSPORT', approvalStatus: 'PENDING', priceFrom: 250000, priceUnit: 'vé' });
    expect(created.body.service).toMatchObject({ serviceGroup: 'INTERCITY_BUS', serviceGroupLabel: 'Xe khách liên tỉnh', seats: 16, languages: [] });

    const rows = await request(app).get('/api/v1/partner/listings').set(bearer(bus.token));
    expect(rows.body.content[0]).toMatchObject({ serviceGroup: 'INTERCITY_BUS', priceFrom: 250000, route: 'Hà Nội → Mù Cang Chải' });
    expect(rows.body.content[0].place).toMatchObject({ id: created.body.id, approvalStatus: 'PENDING' });
    expect((await request(app).get(`/api/v1/partner/listings/${created.body.id}`).set(bearer(bus.token))).body.id).toBe(created.body.id);
    expect((await request(app).get(`/api/v1/partner/listings/${created.body.id}`).set(bearer(homestay.token))).status).toBe(403);

    await request(app).post(`/api/v1/admin/explore/places/${created.body.id}/approve`).set(bearer(root.token));
    const updated = await request(app)
      .put(`/api/v1/partner/listings/${created.body.id}`)
      .set(bearer(bus.token))
      .send(placeBody({ priceFrom: 300000, service: { serviceGroup: 'INTERCITY_BUS', routeFrom: 'Hà Nội', routeTo: 'Sa Pa', seats: 29 }, images: [{ mediaId: created.body.images[0].mediaId }] }));
    expect(updated.status).toBe(200);
    expect(updated.body.pendingEdit.status).toBe('PENDING');
    // Bản đang hiển thị chưa đổi giá.
    expect(await one<{ priceRefMin: number }>('SELECT price_ref_min FROM place WHERE id = $1', [created.body.id])).toMatchObject({ priceRefMin: 250000 });
    await request(app).post(`/api/v1/admin/explore/places/${created.body.id}/edit/approve`).set(bearer(root.token));
    expect(await one<{ priceRefMin: number }>('SELECT price_ref_min FROM place WHERE id = $1', [created.body.id])).toMatchObject({ priceRefMin: 300000 });
    expect(await one<{ seats: number; routeTo: string }>('SELECT seats, route_to FROM place_service_profile WHERE place_id = $1', [created.body.id])).toMatchObject({ seats: 29, routeTo: 'Sa Pa' });
    void exec;
  });
});
