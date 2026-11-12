import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exec, query } from '../src/db/pool.js';
import { quality, recommend } from '../src/lib/comboRecommender.js';
import { addDays, today } from '../src/lib/time.js';
import { bearer, createAdmin, createPlace, createProvider, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_combo');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

const comboBody = (stops: unknown[], extra: Record<string, unknown> = {}) => ({
  title: 'Mù Cang Chải 2 ngày 1 đêm',
  summary: 'Săn mây, ngắm ruộng bậc thang mùa lúa chín',
  description: 'Hành trình khám phá Mù Cang Chải',
  days: 2,
  nights: 1,
  priceFrom: 1850000,
  priceNote: 'Giá cho đoàn từ 4 khách',
  groupSizeMin: 2,
  groupSizeMax: 12,
  includes: '- Xe đưa đón\n• Hướng dẫn viên\n\nVé tham quan',
  excludes: 'Ăn uống',
  stops,
  restaurants: [],
  ...extra,
});

async function fixture() {
  const mountain = await createPlace({ name: 'Đèo Khau Phạ', kind: 'ATTRACTION', latitude: 21.85, longitude: 104.05, coordVerified: true });
  const terrace = await createPlace({ name: 'Ruộng bậc thang La Pán Tẩn', kind: 'ATTRACTION', latitude: 21.87, longitude: 104.07, coordVerified: true });
  const good = await createPlace({ name: 'Quán lẩu cá hồi', kind: 'RESTAURANT', latitude: 21.86, longitude: 104.06, coordVerified: true });
  const farAway = await createPlace({ name: 'Quán xa tít', kind: 'RESTAURANT', latitude: 22.5, longitude: 104.9, coordVerified: true });
  await exec('UPDATE place SET rating_avg = 4.8, rating_count = 20 WHERE id = $1', [good]);
  return { mountain, terrace, good, farAway };
}

describe('recommender', () => {
  it('scores restaurants with a Bayesian prior and falls back to Google rating', () => {
    expect(quality({ ratingCount: 20, ratingAvg: 4.8, googleRating: null })).toBeCloseTo((5 * 4 + 4.8 * 20) / 25, 6);
    expect(quality({ ratingCount: 1, ratingAvg: 5, googleRating: 4.3 })).toBe(4.3);
    expect(quality({ ratingCount: 1, ratingAvg: 5, googleRating: null })).toBeCloseTo((5 * 4 + 5) / 6, 6);
    expect(quality({ ratingCount: 0, ratingAvg: null, googleRating: null })).toBe(0);
    const near = { id: 1, name: 'Gần', latitude: 21.86, longitude: 104.06, ratingCount: 0, ratingAvg: null, googleRating: 4.5 } as never;
    const far = { id: 2, name: 'Xa', latitude: 23.5, longitude: 105, ratingCount: 0, ratingAvg: null, googleRating: 5 } as never;
    const picks = recommend([{ name: 'Đèo', latitude: 21.85, longitude: 104.05 }], [near, far], new Set(), 3);
    expect(picks.map((p) => p.place.id)).toEqual([1]);
    expect(picks[0].nearStop).toBe('Đèo');
  });
});

describe('admin combos and the public catalog', () => {
  it('validates the form, creates a combo and exposes it publicly with restaurant suggestions', async () => {
    const root = await createAdmin(1);
    const f = await fixture();
    const invalid = await request(app).post('/api/v1/admin/combos').set(bearer(root.token)).send({ title: 'ab', days: 20 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['title', 'summary', 'days', 'priceFrom', 'stops']));

    const missingDay = await request(app)
      .post('/api/v1/admin/combos')
      .set(bearer(root.token))
      .send(comboBody([{ dayNo: 1, placeId: f.mountain, startTime: '7:30', endTime: '09:00' }]));
    expect(missingDay.body.fieldErrors).toEqual([{ field: 'stops', message: 'Ngày 2 chưa có điểm nào trong lịch trình.' }]);
    const notRestaurant = await request(app)
      .post('/api/v1/admin/combos')
      .set(bearer(root.token))
      .send(comboBody([{ dayNo: 1, placeId: f.mountain }, { dayNo: 2, title: 'Về Hà Nội' }], { restaurants: [{ placeId: f.mountain }] }));
    expect(notRestaurant.body.fieldErrors).toEqual([{ field: 'restaurants.0', message: 'Đèo Khau Phạ không phải nhà hàng / quán ăn.' }]);

    const created = await request(app)
      .post('/api/v1/admin/combos')
      .set(bearer(root.token))
      .send(comboBody([{ dayNo: 2, title: 'Về Hà Nội' }, { dayNo: 1, placeId: f.terrace, startTime: '10:00', endTime: '12:00' }, { dayNo: 1, placeId: f.mountain, startTime: '7:30', endTime: '09:00', note: 'Ngắm bình minh' }], {
        restaurants: [{ placeId: f.farAway, note: 'Món gà nướng' }],
      }));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ status: 'APPROVED', visible: true, paused: false, providerId: null, publiclyVisible: true });
    expect(created.body.slug).toMatch(/^mu-cang-chai-2-ngay-1-dem-[0-9a-z]+$/);
    expect(created.body.content.stops.map((s: { dayNo: number; title: string; startTime: string | null }) => [s.dayNo, s.title, s.startTime])).toEqual([
      [1, 'Ruộng bậc thang La Pán Tẩn', '10:00'],
      [1, 'Đèo Khau Phạ', '07:30'],
      [2, 'Về Hà Nội', null],
    ]);
    expect(created.body.content.includes).toBe('Xe đưa đón\nHướng dẫn viên\nVé tham quan');
    expect(created.body.places).toHaveLength(3);

    const list = await request(app).get('/api/public/combos');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ title: 'Mù Cang Chải 2 ngày 1 đêm', durationText: '2 ngày 1 đêm', stopCount: 3, priceFrom: 1850000, providerName: null });
    expect(list.body[0].highlights).toEqual(['Ruộng bậc thang La Pán Tẩn', 'Đèo Khau Phạ']);

    const detail = await request(app).get(`/api/public/combos/${created.body.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.includes).toEqual(['Xe đưa đón', 'Hướng dẫn viên', 'Vé tham quan']);
    expect(detail.body.itinerary.map((d: { dayNo: number; stops: unknown[] }) => [d.dayNo, d.stops.length])).toEqual([[1, 2], [2, 1]]);
    // Nhà hàng người tạo chọn (xa lộ trình) đứng đầu; hệ thống tự thêm nhà hàng tốt gần lộ trình.
    expect(detail.body.restaurants.map((r: { name: string; pinned: boolean }) => [r.name, r.pinned])).toEqual([['Quán xa tít', true], ['Quán lẩu cá hồi', false]]);
    expect(detail.body.restaurants[1].nearStop).toBeTruthy();

    // Ẩn combo → khách không thấy nữa.
    const hidden = await request(app).post(`/api/v1/admin/combos/${created.body.id}/visibility`).set(bearer(root.token)).send({ visible: false });
    expect(hidden.body).toMatchObject({ visible: false, publiclyVisible: false });
    expect((await request(app).get(`/api/public/combos/${created.body.slug}`)).status).toBe(404);
    expect((await request(app).get('/api/v1/admin/combos?status=HIDDEN').set(bearer(root.token))).body.totalElements).toBe(1);
  });

  it('takes booking requests from guests and lets admin handle them', async () => {
    const root = await createAdmin(1);
    const f = await fixture();
    const created = await request(app)
      .post('/api/v1/admin/combos')
      .set(bearer(root.token))
      .send(comboBody([{ dayNo: 1, placeId: f.mountain }, { dayNo: 2, placeId: f.terrace }]));
    const slug = created.body.slug;

    const invalid = await request(app).post(`/api/public/combos/${slug}/requests`).send({ contactName: 'A', contactPhone: '123', startDate: addDays(today(), -1), guests: 1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors.map((e: { field: string }) => e.field)).toEqual(['contactName', 'contactPhone', 'startDate', 'guests']);
    expect(invalid.body.fieldErrors[3].message).toBe('Combo này nhận từ 2 khách mỗi đoàn.');

    const ok = await request(app).post(`/api/public/combos/${slug}/requests`).send({ contactName: 'Nguyễn Văn A', contactPhone: '0912 345 678', startDate: addDays(today(), 30), guests: 4, note: 'Đi cùng trẻ nhỏ' });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toBe('Đã gửi yêu cầu. Đi Du Lịch sẽ gọi lại cho bạn để xác nhận lịch đi và giá.');

    const rows = await request(app).get('/api/v1/admin/combos/requests?status=NEW').set(bearer(root.token));
    expect(rows.body.content[0]).toMatchObject({ contactName: 'Nguyễn Văn A', contactPhone: '0912345678', guests: 4, status: 'NEW', fromAccount: false, comboSlug: slug });
    const handled = await request(app).patch(`/api/v1/admin/combos/requests/${rows.body.content[0].id}`).set(bearer(root.token)).send({ status: 'CONTACTED' });
    expect(handled.body).toMatchObject({ status: 'CONTACTED', handledByName: 'Admin Test' });
    const list = await request(app).get('/api/v1/admin/combos').set(bearer(root.token));
    expect(list.body.content[0].newRequests).toBe(0);
    // Combo đã có yêu cầu thì không xóa được.
    const del = await request(app).delete(`/api/v1/admin/combos/${created.body.id}`).set(bearer(root.token));
    expect(del.status).toBe(409);
    expect(del.body.message).toBe('Combo đã có yêu cầu đặt của khách — hãy ẩn combo thay vì xóa.');
    const fresh = await request(app).post('/api/v1/admin/combos').set(bearer(root.token)).send(comboBody([{ dayNo: 1, placeId: f.mountain }, { dayNo: 2, placeId: f.terrace }], { title: 'Combo nhập thử' }));
    expect((await request(app).delete(`/api/v1/admin/combos/${fresh.body.id}`).set(bearer(root.token))).body).toEqual({ deleted: true });
  });
});

describe('partner combos', () => {
  it('requires approval for new combos and edits, and lets the provider pause', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider('Công ty Lữ hành Núi Rừng');
    const other = await createProvider();
    const f = await fixture();
    const stops = [{ dayNo: 1, placeId: f.mountain }, { dayNo: 2, placeId: f.terrace }];
    const created = await request(app).post('/api/v1/partner/combos').set(bearer(ncc.token)).send(comboBody(stops));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ status: 'PENDING', providerId: ncc.providerId, providerName: 'Công ty Lữ hành Núi Rừng', publiclyVisible: false });
    const id = created.body.id;

    expect((await request(app).get('/api/public/combos')).body).toEqual([]);
    expect((await request(app).get(`/api/v1/partner/combos/${id}`).set(bearer(other.token))).status).toBe(404);
    const pending = await request(app).get('/api/v1/admin/combos?status=PENDING&source=PROVIDER').set(bearer(root.token));
    expect(pending.body.totalElements).toBe(1);

    expect((await request(app).post(`/api/v1/admin/combos/${id}/reject`).set(bearer(root.token)).send({ reason: 'ngắn' })).body).toEqual({
      status: 400,
      message: 'Lý do từ chối phải từ 10 đến 500 ký tự.',
    });
    const approved = await request(app).post(`/api/v1/admin/combos/${id}/approve`).set(bearer(root.token));
    expect(approved.body).toMatchObject({ status: 'APPROVED', publiclyVisible: true });
    const publicList = await request(app).get('/api/public/combos');
    expect(publicList.body[0].providerName).toBe('Công ty Lữ hành Núi Rừng');

    // Sửa combo đã duyệt → bản sửa chờ duyệt; bản đang bán giữ nguyên.
    const edited = await request(app).put(`/api/v1/partner/combos/${id}`).set(bearer(ncc.token)).send(comboBody(stops, { title: 'Mù Cang Chải 2N1Đ (mới)', priceFrom: 2100000 }));
    expect(edited.body.content.title).toBe('Mù Cang Chải 2 ngày 1 đêm');
    expect(edited.body.pendingChanges).toMatchObject({ title: 'Mù Cang Chải 2N1Đ (mới)', priceFrom: 2100000 });
    expect((await request(app).get('/api/v1/admin/combos?status=PENDING').set(bearer(root.token))).body.content[0].pendingEdit).toBe(true);
    const applied = await request(app).post(`/api/v1/admin/combos/${id}/approve-edit`).set(bearer(root.token));
    expect(applied.body.content).toMatchObject({ title: 'Mù Cang Chải 2N1Đ (mới)', priceFrom: 2100000 });
    expect(applied.body.pendingChanges).toBeNull();
    expect((await request(app).post(`/api/v1/admin/combos/${id}/approve-edit`).set(bearer(root.token))).status).toBe(409);

    const paused = await request(app).post(`/api/v1/partner/combos/${id}/pause`).set(bearer(ncc.token)).send({ paused: true });
    expect(paused.body).toMatchObject({ paused: true, publiclyVisible: false });
    expect((await request(app).get('/api/public/combos')).body).toEqual([]);

    // Yêu cầu đặt: NCC thấy và xử lý được yêu cầu của combo mình.
    await request(app).post(`/api/v1/partner/combos/${id}/pause`).set(bearer(ncc.token)).send({ paused: false });
    await request(app).post(`/api/public/combos/${applied.body.slug}/requests`).send({ contactName: 'Trần B', contactPhone: '0987654321', startDate: addDays(today(), 10), guests: 3 });
    const reqs = await request(app).get('/api/v1/partner/combos/requests').set(bearer(ncc.token));
    expect(reqs.body.totalElements).toBe(1);
    expect((await request(app).get('/api/v1/partner/combos/requests').set(bearer(other.token))).body.totalElements).toBe(0);
    expect((await request(app).patch(`/api/v1/partner/combos/requests/${reqs.body.content[0].id}`).set(bearer(other.token)).send({ status: 'CLOSED' })).status).toBe(404);
    const closed = await request(app).patch(`/api/v1/partner/combos/requests/${reqs.body.content[0].id}`).set(bearer(ncc.token)).send({ status: 'CLOSED' });
    expect(closed.body.status).toBe('CLOSED');
    const notices = await request(app).get('/api/v1/partner/notifications').set(bearer(ncc.token));
    expect(notices.body.items.length).toBeGreaterThan(0);
    expect(await query('SELECT id FROM combo_request')).toHaveLength(1);
  });
});

describe('nearby suggestions', () => {
  it('lets a provider enable offers, shows them publicly and lets admin hide them', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider('Nhà xe Núi', 'TRANSPORT');
    const landmark = await createPlace({ name: 'Cổng trời Khau Phạ', kind: 'PHOTO', latitude: 21.85, longitude: 104.05, coordVerified: true });
    const service = await createPlace({ name: 'Thuê xe máy Mù Cang Chải', kind: 'RENTAL', providerId: ncc.providerId, latitude: 21.86, longitude: 104.06, coordVerified: true });
    const unverified = await createPlace({ name: 'Quán chưa xác minh', kind: 'RESTAURANT', providerId: ncc.providerId, latitude: 21.86, longitude: 104.06 });

    const list = await request(app).get('/api/v1/partner/nearby-offers').set(bearer(ncc.token));
    expect(list.body).toMatchObject({ radiusMinKm: 1, radiusMaxKm: 30, messageMax: 120 });
    const row = list.body.places.find((p: { placeId: number }) => p.placeId === service);
    expect(row).toMatchObject({ eligible: true, configured: false, enabled: false, radiusKm: 5, label: 'Dịch vụ địa phương' });
    expect(row.landmarks.map((l: { id: number }) => l.id)).toEqual([landmark]);
    expect(list.body.places.find((p: { placeId: number }) => p.placeId === unverified).notEligibleReason).toBe('Vị trí trên bản đồ chưa được quản trị viên xác minh.');

    const link = await request(app).put(`/api/v1/partner/nearby-offers/${service}`).set(bearer(ncc.token)).send({ enabled: true, message: 'Xem thêm tại www.example.com' });
    expect(link.status).toBe(400);
    expect(link.body.message).toBe('Lời mời không được chứa đường link hoặc tên trang web.');
    const blocked = await request(app).put(`/api/v1/partner/nearby-offers/${unverified}`).set(bearer(ncc.token)).send({ enabled: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('Chưa thể bật gợi ý: vị trí trên bản đồ chưa được quản trị viên xác minh.');
    const badRadius = await request(app).put(`/api/v1/partner/nearby-offers/${service}`).set(bearer(ncc.token)).send({ enabled: true, radiusKm: 99 });
    expect(badRadius.body.message).toBe('Bán kính gợi ý từ 1 đến 30 km.');
    const saved = await request(app).put(`/api/v1/partner/nearby-offers/${service}`).set(bearer(ncc.token)).send({ enabled: true, message: '  Thuê xe giảm 10%  ', radiusKm: 8 });
    expect(saved.body).toMatchObject({ configured: true, enabled: true, message: 'Thuê xe giảm 10%', radiusKm: 8 });

    const suggestions = await request(app).get('/api/public/nearby-suggestions');
    expect(suggestions.body.triggerRadiusM).toBe(1500);
    expect(suggestions.body.landmarks.map((l: { id: number }) => l.id)).toEqual([landmark]);
    expect(suggestions.body.offers).toHaveLength(1);
    expect(suggestions.body.offers[0]).toMatchObject({ placeId: service, radiusKm: 8, message: 'Thuê xe giảm 10%', label: 'Dịch vụ địa phương' });

    const admin = await request(app).get('/api/v1/admin/nearby-offers?hidden=false&keyword=thue xe').set(bearer(root.token));
    expect(admin.body.content[0]).toMatchObject({ placeId: service, enabled: true, hiddenByAdmin: false, placeVisible: true, providerName: 'Nhà xe Núi' });
    expect((await request(app).post(`/api/v1/admin/nearby-offers/${service}/hide`).set(bearer(root.token)).send({ reason: 'ngắn' })).status).toBe(400);
    const hidden = await request(app).post(`/api/v1/admin/nearby-offers/${service}/hide`).set(bearer(root.token)).send({ reason: 'Nội dung quảng cáo không phù hợp' });
    expect(hidden.body).toMatchObject({ hiddenByAdmin: true, hiddenReason: 'Nội dung quảng cáo không phù hợp' });
    expect((await request(app).get('/api/public/nearby-suggestions')).body.offers).toEqual([]);
    expect((await request(app).post(`/api/v1/admin/nearby-offers/${service}/hide`).set(bearer(root.token)).send({ reason: 'Nội dung quảng cáo không phù hợp' })).status).toBe(409);
    const shown = await request(app).post(`/api/v1/admin/nearby-offers/${service}/show`).set(bearer(root.token));
    expect(shown.body.hiddenByAdmin).toBe(false);
    expect((await request(app).get('/api/public/nearby-suggestions')).body.offers).toHaveLength(1);
  });
});
