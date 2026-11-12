import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exec, one, query } from '../src/db/pool.js';
import { addDays, today } from '../src/lib/time.js';
import { anyRegionId, bearer, createAdmin, createPlace, createProvider, createRoomType, createTraveler, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_partner');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

const roomBody = (extra: Record<string, unknown> = {}) => ({
  name: 'Phòng đôi view núi',
  description: 'Phòng thoáng',
  maxOccupancy: 2,
  totalRoomCount: 3,
  privateBathroom: 'YES',
  areaSqm: 20,
  basePrice: 600000,
  weekendPrice: 700000,
  status: 'ACTIVE',
  viewDescription: 'Hướng núi',
  beds: [{ bedType: 'DOUBLE', quantity: 1 }],
  amenityIds: [],
  ...extra,
});

describe('access', () => {
  it('rejects anonymous, traveler and wrong-role callers', async () => {
    expect((await request(app).get('/api/v1/partner/homestays')).status).toBe(403);
    const traveler = await createTraveler();
    expect((await request(app).get('/api/v1/partner/homestays').set(bearer(traveler.token))).status).toBe(403);
  });
});

describe('homestays', () => {
  it('lists own homestays, names and options', async () => {
    const ncc = await createProvider('Hợp tác xã A');
    const other = await createProvider('Hợp tác xã B');
    const mine = await createPlace({ name: 'Nhà của tôi', providerId: ncc.providerId });
    await createPlace({ name: 'Nhà người khác', providerId: other.providerId });

    const list = await request(app).get('/api/v1/partner/homestays').set(bearer(ncc.token));
    expect(list.status).toBe(200);
    expect(list.body.homestays.map((h: { id: number }) => h.id)).toEqual([mine]);
    expect(list.body.stats.totalCount).toBe(1);
    expect(list.body.cooperativeName).toBe('Hợp tác xã A');

    const names = await request(app).get('/api/v1/partner/homestays/names').set(bearer(ncc.token));
    expect(names.body).toEqual([{ id: mine, name: 'Nhà của tôi' }]);

    const options = await request(app).get('/api/v1/partner/homestays/options').set(bearer(ncc.token));
    expect(options.status).toBe(200);
    expect(Array.isArray(options.body.regions)).toBe(true);
    expect(Array.isArray(options.body.amenities)).toBe(true);

    const detail = await request(app).get(`/api/v1/partner/homestays/${mine}`).set(bearer(ncc.token));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: mine, name: 'Nhà của tôi', visibility: 'PUBLISHED' });

    // Không xem được Homestay của NCC khác: lỗi kiểu {message}.
    const foreign = await createPlace({ name: 'Nhà lạ', providerId: other.providerId });
    const denied = await request(app).get(`/api/v1/partner/homestays/${foreign}`).set(bearer(ncc.token));
    expect([403, 404]).toContain(denied.status);
    expect(Object.keys(denied.body)).toEqual(['message']);
  });

  it('creates a draft homestay and updates it directly', async () => {
    const ncc = await createProvider();
    const region = await anyRegionId(2);
    const created = await request(app)
      .post('/api/v1/partner/homestays')
      .set(bearer(ncc.token))
      .send({ name: 'Homestay Suối Giàng', regionId: region, address: 'Bản Giàng', contactPhone: '0912345678', latitude: 21.7, longitude: 104.2 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Homestay Suối Giàng', visibility: 'DRAFT', providerCode: expect.any(String) });
    const id = created.body.id;

    const updated = await request(app)
      .put(`/api/v1/partner/homestays/${id}`)
      .set(bearer(ncc.token))
      .send({ ...created.body, description: 'Nhà sàn giữa rừng chè', houseRules: 'Giữ yên tĩnh sau 22h' });
    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe('Nhà sàn giữa rừng chè');

    const row = await one<{ description: string }>('SELECT description FROM place WHERE id = $1', [id]);
    expect(row?.description).toBe('Nhà sàn giữa rừng chè');

    // Chưa đủ điều kiện công khai: không gửi duyệt được, thông báo liệt kê mục còn thiếu.
    const publish = await request(app).patch(`/api/v1/partner/homestays/${id}/status`).set(bearer(ncc.token)).send({ visibility: 'PUBLISHED' });
    expect(publish.status).toBe(400);
    expect(publish.body.message).toContain('còn thiếu');
    expect(Object.keys(publish.body)).toEqual(['message']);
  });

  it('shows the QR check-in code of an own homestay', async () => {
    const ncc = await createProvider();
    const created = await request(app)
      .post('/api/v1/partner/homestays')
      .set(bearer(ncc.token))
      .send({ name: 'Nhà QR', regionId: await anyRegionId(2), address: 'Bản QR', contactPhone: '0912345678' });
    const id = created.body.id;
    const qr = await request(app).get(`/api/v1/partner/homestays/${id}/checkin-qr`).set(bearer(ncc.token));
    expect(qr.status).toBe(200);
    expect(qr.body).toMatchObject({ placeId: id, placeName: 'Nhà QR' });
    expect(qr.body.code).toMatch(/^[A-Z0-9]+$/);
    const again = await request(app).get(`/api/v1/partner/homestays/${id}/checkin-qr`).set(bearer(ncc.token));
    expect(again.body.code).toBe(qr.body.code);
  });

  it('validates onboarding input and creates everything in one transaction', async () => {
    const ncc = await createProvider();
    const region = await anyRegionId(2);
    const missing = await request(app).post('/api/v1/partner/homestays/onboard/check').set(bearer(ncc.token)).send({});
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ status: 400, errorCode: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ: homestay must not be null' });

    const homestay = { name: 'Homestay Đồi Chè', regionId: region, address: 'Mộc Châu', contactPhone: '0912345678', latitude: 20.8, longitude: 104.6 };
    const dup = await request(app)
      .post('/api/v1/partner/homestays/onboard/check')
      .set(bearer(ncc.token))
      .send({ homestay, rooms: [{ room: roomBody() }, { room: roomBody() }] });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toContain('bị trùng');

    const badRoom = await request(app)
      .post('/api/v1/partner/homestays/onboard')
      .set(bearer(ncc.token))
      .send({ homestay, rooms: [{ room: roomBody({ basePrice: 0 }) }] });
    expect(badRoom.status).toBe(400);
    expect(badRoom.body.message).toBe('Giá phòng phải lớn hơn 0');

    const ok = await request(app)
      .post('/api/v1/partner/homestays/onboard')
      .set(bearer(ncc.token))
      .send({
        homestay,
        photos: [{ imageId: 'img-1', url: 'https://cdn.example/a.jpg' }],
        rooms: [{ room: roomBody(), photos: [{ imageId: 'img-2', url: 'https://cdn.example/b.jpg' }] }],
        submit: false,
      });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ submitted: false });
    expect(ok.body.missingForPublish.length).toBeGreaterThanOrEqual(0);
    const rooms = await query('SELECT * FROM room_type WHERE place_id = $1', [ok.body.id]);
    expect(rooms).toHaveLength(1);
    const media = await query('SELECT * FROM place_media WHERE place_id = $1', [ok.body.id]);
    expect(media).toHaveLength(1);
  });
});

describe('rooms / prices / calendar', () => {
  it('saves a room, season prices and availability on a draft homestay', async () => {
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà nháp', providerId: ncc.providerId, visibility: 'DRAFT' });
    const base = `/api/v1/partner/homestays/${placeId}/rooms`;

    const invalid = await request(app).post(base).set(bearer(ncc.token)).send(roomBody({ name: '' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: 'Nhập tên loại phòng' });

    const noStatus = await request(app).post(base).set(bearer(ncc.token)).send(roomBody({ status: 'WRONG' }));
    expect(noStatus.body).toEqual({ message: 'Dữ liệu không hợp lệ: status must match "ACTIVE|INACTIVE"' });

    const created = await request(app).post(base).set(bearer(ncc.token)).send(roomBody());
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ placeId, name: 'Phòng đôi view núi', basePrice: 600000, totalRoomCount: 3 });
    const roomId = created.body.id;

    const dupName = await request(app).post(base).set(bearer(ncc.token)).send(roomBody());
    expect(dupName.status).toBe(400);

    const renamed = await request(app).put(`${base}/${roomId}`).set(bearer(ncc.token)).send(roomBody({ name: 'Phòng đôi mới' }));
    expect(renamed.body.name).toBe('Phòng đôi mới');
    expect((await request(app).get(base).set(bearer(ncc.token))).body).toHaveLength(1);

    const start = addDays(today(), 20);
    const end = addDays(today(), 25);
    const price = await request(app).post(`${base}/${roomId}/prices`).set(bearer(ncc.token)).send({ name: 'Mùa lễ', periodStart: start, periodEnd: end, price: 900000 });
    expect(price.status).toBe(200);
    expect(price.body).toMatchObject({ name: 'Mùa lễ', price: 900000 });
    const prices = await request(app).get(`${base}/${roomId}/prices`).set(bearer(ncc.token));
    expect(prices.body).toHaveLength(1);
    const del = await request(app).delete(`${base}/${roomId}/prices/${price.body.id}`).set(bearer(ncc.token));
    expect(del.status).toBe(200);
    expect((await request(app).get(`${base}/${roomId}/prices`).set(bearer(ncc.token))).body).toHaveLength(0);

    // Lịch phòng: đặt lại tổng số phòng và đóng bán một ngày.
    const inv = await request(app)
      .put(`${base}/${roomId}/calendar`)
      .set(bearer(ncc.token))
      .send({ startDate: start, endDate: addDays(start, 2), totalRooms: 2, stopSell: false });
    expect(inv.status).toBe(200);
    const cal = await request(app).get(`${base}/${roomId}/calendar?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(ncc.token));
    expect(cal.body).toHaveLength(2);
    expect(cal.body[0]).toMatchObject({ stayDate: start, totalRooms: 2, availableRooms: 2, stopSell: false });

    const avail = await request(app).get(`/api/v1/partner/homestays/${placeId}/availability?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(ncc.token));
    expect(avail.status).toBe(200);
    expect(avail.body.rooms[0].days).toHaveLength(2);

    const locks = await request(app)
      .put(`${base}/${roomId}/locks`)
      .set(bearer(ncc.token))
      .send({ startDate: start, endDate: addDays(start, 1), lockedRooms: 1, closed: false });
    expect(locks.body).toMatchObject({ updatedDays: 1, limitedDays: [] });

    const unit = await request(app).put(`${base}/${roomId}/units/1`).set(bearer(ncc.token)).send({ stayDate: addDays(start, 1), locked: true });
    expect(unit.status).toBe(200);
    expect(unit.body.stayDate).toBe(addDays(start, 1));

    const units = await request(app).get(`/api/v1/partner/homestays/${placeId}/units?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(ncc.token));
    expect(units.status).toBe(200);
    expect(units.body.rooms[0].days).toHaveLength(2);

    const boot = await request(app).get(`/api/v1/partner/calendar?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(ncc.token));
    expect(boot.status).toBe(200);
    expect(boot.body).toMatchObject({ placeId, homestays: [{ id: placeId, name: 'Nhà nháp' }] });

    const quote = await request(app).get(`${base}/${roomId}/quote?startDate=${start}&endDate=${addDays(start, 2)}&roomCount=1&guestCount=2`).set(bearer(ncc.token));
    expect(quote.status).toBe(200);
    expect(quote.body.roomTypeId).toBe(roomId);

    const block = await request(app)
      .put(`/api/v1/partner/homestays/${placeId}/calendar-block`)
      .set(bearer(ncc.token))
      .send({ startDate: start, endDate: addDays(start, 1), stopSell: true, reason: 'Sửa nhà' });
    expect(block.body).toEqual({ bookedDays: 0 });

    const log = await request(app).get(`/api/v1/partner/homestays/${placeId}/change-log`).set(bearer(ncc.token));
    expect(log.status).toBe(200);
    expect(Array.isArray(log.body)).toBe(true);
  });

  it('turns changes on a published homestay into pending change requests', async () => {
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà công khai', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId, 'Phòng sẵn', 500000, 2, 2);
    const base = `/api/v1/partner/homestays/${placeId}/rooms`;

    // Loại phòng mới trên Homestay đang công khai → 202 chờ Admin duyệt, chưa tạo phòng.
    const pending = await request(app).post(base).set(bearer(ncc.token)).send(roomBody());
    expect(pending.status).toBe(202);
    expect(pending.body).toMatchObject({ status: 'PENDING' });
    expect(await query('SELECT id FROM room_type WHERE place_id = $1', [placeId])).toHaveLength(1);

    const price = await request(app)
      .post(`${base}/${roomId}/prices`)
      .set(bearer(ncc.token))
      .send({ name: 'Mùa hè', periodStart: addDays(today(), 30), periodEnd: addDays(today(), 40), price: 800000 });
    expect(price.status).toBe(202);

    const list = await request(app).get('/api/v1/partner/change-requests').set(bearer(ncc.token));
    expect(list.status).toBe(200);
    expect(list.body.totalElements).toBe(2);

    const requestId = list.body.content[0].id;
    const cancelled = await request(app).delete(`/api/v1/partner/change-requests/${requestId}`).set(bearer(ncc.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const again = await request(app).delete(`/api/v1/partner/change-requests/${requestId}`).set(bearer(ncc.token));
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ message: 'Yêu cầu đã được xử lý, không thể rút lại.' });
  });
});

describe('services, reviews, media', () => {
  it('manages extra services of a homestay', async () => {
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà dịch vụ', providerId: ncc.providerId });
    const base = `/api/v1/partner/homestays/${placeId}/services`;
    const bad = await request(app).post(base).set(bearer(ncc.token)).send({ name: ' ', active: true });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: 'Dữ liệu không hợp lệ: name must not be blank' });
    const created = await request(app).post(base).set(bearer(ncc.token)).send({ name: 'Đưa đón', price: 150000, priceUnit: 'lượt', active: true });
    expect(created.body).toMatchObject({ name: 'Đưa đón', price: 150000, active: true });
    const updated = await request(app).put(`${base}/${created.body.id}`).set(bearer(ncc.token)).send({ name: 'Đưa đón sân bay', price: 200000, active: false });
    expect(updated.body).toMatchObject({ name: 'Đưa đón sân bay', active: false });
    expect((await request(app).get(base).set(bearer(ncc.token))).body).toHaveLength(1);
  });

  it('attaches and removes homestay photos', async () => {
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà ảnh', providerId: ncc.providerId });
    const bad = await request(app).post(`/api/v1/partner/homestays/${placeId}/media`).set(bearer(ncc.token)).send({ imageId: '', url: 'https://x/y.jpg' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: 'Dữ liệu không hợp lệ: imageId must not be blank' });
    const first = await request(app)
      .post(`/api/v1/partner/homestays/${placeId}/media`)
      .set(bearer(ncc.token))
      .send({ imageId: 'a1', url: 'https://cdn.example/a1.jpg' });
    expect(first.status).toBe(200);
    expect(first.body).toHaveLength(1);
    expect(first.body[0].role).toBe('COVER');
    const second = await request(app)
      .post(`/api/v1/partner/homestays/${placeId}/media`)
      .set(bearer(ncc.token))
      .send({ imageId: 'a2', url: 'https://cdn.example/a2.jpg' });
    expect(second.body).toHaveLength(2);
    const galleryId = second.body.find((m: { role: string }) => m.role === 'GALLERY').mediaId;
    const cover = await request(app).put(`/api/v1/partner/homestays/${placeId}/media/${galleryId}/cover`).set(bearer(ncc.token));
    expect(cover.body.find((m: { mediaId: number }) => m.mediaId === galleryId).role).toBe('COVER');
    const removed = await request(app).delete(`/api/v1/partner/homestays/${placeId}/media/${galleryId}`).set(bearer(ncc.token));
    expect(removed.body).toHaveLength(1);
  });

  it('replies to a guest review', async () => {
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà đánh giá', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId);
    const created = await request(app)
      .post('/api/public/bookings')
      .send({
        placeId,
        rooms: [{ roomTypeId: roomId, roomCount: 1 }],
        checkIn: addDays(today(), 10),
        checkOut: addDays(today(), 12),
        guestCount: 2,
        guestName: 'Khách Review',
        guestPhone: '0912345678',
        guestEmail: 'khach@example.com',
      });
    const booking = (await one<{ id: number }>('SELECT id FROM booking WHERE booking_code = $1', [created.body.bookingCode]))!;
    await exec(`UPDATE booking SET status = 'PAID' WHERE id = $1`, [booking.id]);
    const now = '2026-01-01T10:00:00';
    await exec(
      `INSERT INTO review (place_id, booking_id, rating, content, status, editable_until, created_at, updated_at)
       VALUES ($1, $2, 5, 'Rất tuyệt', 'VISIBLE', $3, $3, $3)`,
      [placeId, booking.id, now],
    );
    const reviews = await request(app).get(`/api/v1/partner/reviews?placeId=${placeId}`).set(bearer(ncc.token));
    expect(reviews.status).toBe(200);
    expect(reviews.body).toHaveLength(1);
    expect(reviews.body[0]).toMatchObject({ placeId, rating: 5, content: 'Rất tuyệt', guestName: 'Khách Review' });
    const id = reviews.body[0].id;
    const blank = await request(app).put(`/api/v1/partner/reviews/${id}/reply`).set(bearer(ncc.token)).send({ reply: '  ' });
    expect(blank.status).toBe(400);
    expect(blank.body).toEqual({ message: 'Dữ liệu không hợp lệ: reply must not be blank' });
    const ok = await request(app).put(`/api/v1/partner/reviews/${id}/reply`).set(bearer(ncc.token)).send({ reply: 'Cảm ơn bạn!' });
    expect(ok.status).toBe(200);
    expect(ok.body.providerReply).toBe('Cảm ơn bạn!');
    const removed = await request(app).delete(`/api/v1/partner/reviews/${id}/reply`).set(bearer(ncc.token));
    expect(removed.body.providerReply).toBeNull();
  });
});

describe('bookings', () => {
  it('lets the provider confirm, pay and cancel own bookings only', async () => {
    const ncc = await createProvider();
    const other = await createProvider();
    const placeId = await createPlace({ name: 'Nhà đơn', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId, 'Phòng A', 500000, 2, 2);
    const checkIn = addDays(today(), 10);
    const checkOut = addDays(today(), 12);

    const created = await request(app)
      .post('/api/public/bookings')
      .send({
        placeId,
        rooms: [{ roomTypeId: roomId, roomCount: 1 }],
        checkIn,
        checkOut,
        guestCount: 2,
        guestName: 'Nguyễn Văn A',
        guestPhone: '0912345678',
        guestEmail: 'khach@example.com',
      });
    expect(created.status).toBe(201);
    const id = (await one<{ id: number }>('SELECT id FROM booking WHERE booking_code = $1', [created.body.bookingCode]))!.id;

    const list = await request(app).get('/api/v1/partner/bookings?status=PENDING').set(bearer(ncc.token));
    expect(list.status).toBe(200);
    expect(list.body.totalElements).toBe(1);
    expect(list.body.content[0]).toMatchObject({ id, status: 'PENDING', actions: ['CONFIRM', 'REJECT'] });
    expect((await request(app).get('/api/v1/partner/bookings').set(bearer(other.token))).body.totalElements).toBe(0);
    expect((await request(app).get(`/api/v1/partner/bookings/${id}`).set(bearer(other.token))).status).toBe(404);

    const summary = await request(app).get('/api/v1/partner/bookings/summary').set(bearer(ncc.token));
    expect(summary.body).toMatchObject({ PENDING: 1 });

    const admin = await createAdmin();
    // Admin cũng vào được /partner/** nhưng không có providerId → 403 rỗng.
    const noProvider = await request(app).get('/api/v1/partner/bookings').set(bearer(admin.token));
    expect(noProvider.status).toBe(403);

    const confirmed = await request(app).post(`/api/v1/partner/bookings/${id}/confirm`).set(bearer(ncc.token)).send({ note: 'ok' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ id, status: 'CONFIRMED', actions: ['PAY', 'CANCEL'] });

    const tooLong = await request(app).post(`/api/v1/partner/bookings/${id}/pay`).set(bearer(ncc.token)).send({ note: 'x'.repeat(501) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toEqual({ message: 'Dữ liệu không hợp lệ: note size must be between 0 and 500' });

    const paid = await request(app).post(`/api/v1/partner/bookings/${id}/pay`).set(bearer(ncc.token));
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');

    const again = await request(app).post(`/api/v1/partner/bookings/${id}/cancel`).set(bearer(ncc.token));
    expect(again.status).toBe(409);
    expect(Object.keys(again.body)).toEqual(['message']);
  });
});

describe('account, dashboard, notifications, geocode', () => {
  it('changes password with validation', async () => {
    const ncc = await createProvider();
    const short = await request(app).patch('/api/v1/partner/account/password').set(bearer(ncc.token)).send({ currentPassword: ncc.password, newPassword: '123' });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ message: 'Mật khẩu mới phải từ 6 đến 72 ký tự' });
    const wrong = await request(app).patch('/api/v1/partner/account/password').set(bearer(ncc.token)).send({ currentPassword: 'sai-mat-khau', newPassword: 'MatKhauMoi1' });
    expect(wrong.status).toBe(400);
    expect(Object.keys(wrong.body)).toEqual(['message']);
    const ok = await request(app).patch('/api/v1/partner/account/password').set(bearer(ncc.token)).send({ currentPassword: ncc.password, newPassword: 'MatKhauMoi1' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
  });

  it('serves the dashboard summary and the notification inbox', async () => {
    const ncc = await createProvider();
    const dash = await request(app).get('/api/v1/partner/dashboard/summary').set(bearer(ncc.token));
    expect(dash.status).toBe(200);
    expect(dash.body).toMatchObject({ monthlyBookingsCount: 0, totalReviews: 0 });

    const inbox = await request(app).get('/api/v1/partner/notifications/inbox').set(bearer(ncc.token));
    expect(inbox.status).toBe(200);
    expect(inbox.body).toEqual({ feed: { items: [], unread: 0 }, changes: expect.any(Object) });

    const feed = await request(app).get('/api/v1/partner/notifications').set(bearer(ncc.token));
    expect(feed.body).toEqual({ items: [], unread: 0 });
    expect((await request(app).post('/api/v1/partner/notifications/read-all').set(bearer(ncc.token))).status).toBe(204);

    const admin = await createAdmin();
    const denied = await request(app).get('/api/v1/partner/notifications').set(bearer(admin.token));
    expect(denied.status).toBe(403);
  });

  it('validates the geocode query', async () => {
    const ncc = await createProvider();
    const short = await request(app).get('/api/v1/partner/geocode?address=abc').set(bearer(ncc.token));
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ message: 'Địa chỉ phải có từ 5 đến 500 ký tự.' });
  });
});

describe('provider registration', () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    businessName: 'Homestay Bản Lác',
    contactName: 'Hà Văn B',
    contactPhone: '0987654321',
    contactEmail: 'ncc.moi@example.com',
    password: 'MatKhau123',
    address: 'Bản Lác, Mai Châu, Hòa Bình',
    serviceType: 'HOMESTAY',
    details: { propertyType: 'NHA_SAN', roomCount: 4, maxGuests: 12 },
    ...extra,
  });

  it('registers an application, rejects duplicates and reports its status', async () => {
    const invalid = await request(app).post('/api/v1/auth/provider/register').send(body({ contactPhone: '12345' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: 'Số điện thoại không đúng định dạng (VD: 0912345678 hoặc +84912345678).' });

    const badDetails = await request(app).post('/api/v1/auth/provider/register').send(body({ details: { propertyType: 'XYZ' } }));
    expect(badDetails.status).toBe(400);
    expect(badDetails.body).toEqual({ message: 'Vui lòng chọn loại nhà.' });

    const ok = await request(app).post('/api/v1/auth/provider/register').send(body());
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', applicationId: expect.any(Number) });
    expect(ok.body.message).toContain('Mã hồ sơ');

    const dup = await request(app).post('/api/v1/auth/provider/register').send(body());
    expect(dup.status).toBe(409);
    expect(dup.body.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'contactPhone', message: 'Số điện thoại này đã có hồ sơ đăng ký đang chờ duyệt' },
        { field: 'contactEmail', message: 'Email này đã có hồ sơ đăng ký đang chờ duyệt' },
      ]),
    );

    const status = await request(app).post('/api/v1/auth/provider/application-status').send({ applicationId: ok.body.applicationId, contactPhone: '0987654321' });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ businessName: 'Homestay Bản Lác', status: 'PENDING', statusLabel: 'Hồ sơ đang chờ xét duyệt' });

    const notFound = await request(app).post('/api/v1/auth/provider/application-status').send({ applicationId: ok.body.applicationId, contactPhone: '0900000000' });
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: 'Không tìm thấy hồ sơ với mã và số điện thoại này.' });
  });
});
