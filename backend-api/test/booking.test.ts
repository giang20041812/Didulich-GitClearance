import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exec, one, query } from '../src/db/pool.js';
import { addDays, nowLocal, today } from '../src/lib/time.js';
import * as workflow from '../src/services/bookingWorkflowService.js';
import * as stays from '../src/services/bookingStayService.js';
import { bearer, createPlace, createProvider, createRoomType, createTraveler, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_booking');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

interface Fixture {
  providerId: number;
  placeId: number;
  roomTypeId: number;
}

async function fixture(totalRooms = 2): Promise<Fixture> {
  const ncc = await createProvider();
  const placeId = await createPlace({ name: 'Homestay Mù Cang Chải', providerId: ncc.providerId, address: '1 Đường Núi', latitude: 21.85, longitude: 104.08 });
  const roomTypeId = await createRoomType(placeId, 'Phòng đôi', 500000, totalRooms, 2);
  return { providerId: ncc.providerId, placeId, roomTypeId };
}

const checkIn = () => addDays(today(), 10);
const checkOut = () => addDays(today(), 12);

function payload(f: Fixture, extra: Record<string, unknown> = {}) {
  return {
    placeId: f.placeId,
    rooms: [{ roomTypeId: f.roomTypeId, roomCount: 1 }],
    checkIn: checkIn(),
    checkOut: checkOut(),
    guestCount: 2,
    guestName: 'Nguyễn Văn A',
    guestPhone: '0912345678',
    guestEmail: 'khach@example.com',
    ...extra,
  };
}

async function inventoryOf(roomTypeId: number, date: string) {
  return one<{ heldRooms: number; confirmedRooms: number; totalRooms: number }>('SELECT * FROM room_inventory_day WHERE room_type_id = $1 AND stay_date = $2', [roomTypeId, date]);
}

describe('calendar / quote', () => {
  it('quotes nights and checks availability', async () => {
    const f = await fixture();
    const quote = await request(app).get(`/api/public/bookings/rooms/${f.roomTypeId}/quote?checkIn=${checkIn()}&checkOut=${checkOut()}&roomCount=2&guestCount=2`);
    expect(quote.status).toBe(200);
    expect(quote.body).toEqual({ roomTypeId: f.roomTypeId, availableRooms: 2, suitable: true, totalAmount: 2000000 });

    const avail = await request(app).get(`/api/public/bookings/rooms/${f.roomTypeId}/check-availability?checkIn=${checkIn()}&checkOut=${checkOut()}&roomCount=3`);
    expect(avail.body).toMatchObject({ available: false, requestedRooms: 3, minAvailableRooms: 2 });
    expect(avail.body.message).toContain('chỉ còn trống 2 phòng');

    const bad = await request(app).get(`/api/public/bookings/rooms/${f.roomTypeId}/check-availability?checkIn=${checkOut()}&checkOut=${checkIn()}`);
    expect(bad.body).toMatchObject({ available: false, message: 'Ngày trả phòng phải sau ngày nhận phòng.' });

    const missing = await request(app).get(`/api/public/bookings/rooms/${f.roomTypeId}/quote`);
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ status: 400, message: 'Dữ liệu gửi lên không hợp lệ.' });
  });
});

describe('create / read / update / cancel', () => {
  it('creates an anonymous booking, holds inventory and enforces access', async () => {
    const f = await fixture();
    const res = await request(app).post('/api/public/bookings').send(payload(f));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      placeId: f.placeId,
      placeName: 'Homestay Mù Cang Chải',
      nights: 2,
      roomCount: 1,
      totalAmount: 1000000,
      unitPrice: 500000,
      canEdit: true,
      canCancel: true,
      canReview: false,
      canCheckIn: false,
      roomTypeName: 'Phòng đôi',
    });
    expect(res.body.bookingCode).toMatch(/^VJ-[0-9A-Z]{8}$/);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.rooms).toEqual([{ roomTypeId: f.roomTypeId, roomTypeName: 'Phòng đôi', roomCount: 1, subtotal: 1000000 }]);
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(1);

    const code = res.body.bookingCode as string;
    const token = res.body.accessToken as string;
    expect((await request(app).get(`/api/public/bookings/${code}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/bookings/${code}`).set('X-Booking-Token', 'wrong')).status).toBe(404);
    const read = await request(app).get(`/api/public/bookings/${code}`).set('X-Booking-Token', token);
    expect(read.status).toBe(200);
    expect(read.body.accessToken).toBeUndefined();
    // Tra cứu chỉ đọc bằng mã đơn + SĐT.
    expect((await request(app).get(`/api/public/bookings/${code}?phone=%2B84912345678`)).status).toBe(200);
    expect((await request(app).get(`/api/public/bookings/${code}?phone=0900000000`)).status).toBe(404);

    const lookup = await request(app).post('/api/public/bookings/lookup').send({ bookings: [{ code, token }, { code: 'VJ-ZZZZZZZZ', token: 'x' }] });
    expect(lookup.status).toBe(200);
    expect(lookup.body).toHaveLength(1);

    // Đặt trùng (cùng SĐT + ngày) bị từ chối và không giữ thêm phòng.
    const dup = await request(app).post('/api/public/bookings').send(payload(f));
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('Bạn đã có một đơn khác');
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(1);

    // Phòng chỉ có 2: đơn thứ hai (SĐT khác) lấy phòng cuối, đơn thứ ba hết phòng.
    expect((await request(app).post('/api/public/bookings').send(payload(f, { guestPhone: '0912345679' }))).status).toBe(201);
    const full = await request(app).post('/api/public/bookings').send(payload(f, { guestPhone: '0912345670' }));
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/chỉ còn 0 phòng/);
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(2);

    // Lịch đã đặt.
    const booked = await request(app).get(`/api/public/bookings/rooms/${f.roomTypeId}/booked-dates?startDate=${addDays(today(), 5)}&endDate=${addDays(today(), 20)}`);
    expect(booked.body).toHaveLength(2);
    expect(booked.body[0]).toEqual({ roomTypeId: f.roomTypeId, checkIn: checkIn(), checkOut: checkOut(), roomCount: 1 });
  });

  it('validates the request like Bean Validation', async () => {
    const f = await fixture();
    const badPhone = await request(app).post('/api/public/bookings').send(payload(f, { guestPhone: '12345' }));
    expect(badPhone.status).toBe(400);
    expect(badPhone.body).toEqual({ status: 400, message: 'Số điện thoại không hợp lệ. Số Việt Nam gồm 10 chữ số, VD: 0912 345 678.' });
    expect((await request(app).post('/api/public/bookings').send(payload(f, { guestName: '  ' }))).body.message).toBe('guestName không được để trống');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { guestEmail: 'abc' }))).body.message).toBe('Email không hợp lệ, VD: ten@gmail.com');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { placeId: null }))).body.message).toBe('placeId không được để trống');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { checkIn: 'abc' }))).body.message).toBe('Dữ liệu gửi lên không hợp lệ.');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { checkIn: addDays(today(), -1) }))).body.message).toBe('Không thể đặt phòng trong quá khứ.');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { rooms: [] }))).body.message).toBe('Vui lòng chọn ít nhất một loại phòng.');
    expect((await request(app).post('/api/public/bookings').send(payload(f, { checkOut: addDays(today(), 60) }))).body.message).toBe('Mỗi đơn đặt phòng tối đa 30 đêm.');
    // Admin / NCC không đặt phòng được.
    const ncc = await createProvider();
    const forbidden = await request(app).post('/api/public/bookings').set(bearer(ncc.token)).send(payload(f));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toContain('không thể đặt phòng');
    // Cũ: roomTypeId + roomCount.
    const legacy = await request(app).post('/api/public/bookings').send({ ...payload(f), rooms: undefined, roomTypeId: f.roomTypeId, roomCount: 1 });
    expect(legacy.status).toBe(201);
  });

  it('links a booking to the signed-in traveler and lists it', async () => {
    const f = await fixture();
    const traveler = await createTraveler('khach@example.com');
    const res = await request(app).post('/api/public/bookings').set(bearer(traveler.token)).send(payload(f));
    expect(res.status).toBe(201);
    const code = res.body.bookingCode as string;

    const mine = await request(app).get('/api/public/bookings/my-bookings').set(bearer(traveler.token));
    expect(mine.body.map((b: { bookingCode: string }) => b.bookingCode)).toEqual([code]);
    const statuses = await request(app).get('/api/public/bookings/my-bookings/statuses').set(bearer(traveler.token));
    expect(statuses.headers['cache-control']).toContain('no-store');
    expect(statuses.body).toEqual([{ bookingCode: code, status: 'PENDING' }]);
    expect((await request(app).get('/api/public/bookings/my-bookings')).status).toBe(401);
    // Khách đăng nhập đọc được đơn của mình không cần mã truy cập; khách khác thì không.
    expect((await request(app).get(`/api/public/bookings/${code}`).set(bearer(traveler.token))).status).toBe(200);
    const other = await createTraveler('khac@example.com');
    expect((await request(app).get(`/api/public/bookings/${code}`).set(bearer(other.token))).status).toBe(404);
    // Thông báo cho khách + Admin/NCC.
    const notice = await query<{ templateCode: string }>(`SELECT template_code FROM notification ORDER BY id`);
    expect(notice.map((n) => n.templateCode)).toContain('BOOKING_CREATED');
  });

  it('updates a pending booking (dates, rooms, guests) and recomputes the total', async () => {
    const f = await fixture();
    const res = await request(app).post('/api/public/bookings').send(payload(f));
    const code = res.body.bookingCode as string;
    const h = { 'X-Booking-Token': res.body.accessToken as string };

    const nothing = await request(app).put(`/api/public/bookings/${code}`).set(h).send({});
    expect(nothing.status).toBe(400);
    expect(nothing.body.message).toBe('Bạn chưa thay đổi thông tin nào của đơn.');

    const newOut = addDays(today(), 13);
    const upd = await request(app).put(`/api/public/bookings/${code}`).set(h).send({ checkOut: newOut, roomCount: 2, guestCount: 3, guestNote: 'Gần suối' });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ nights: 3, roomCount: 2, guestCount: 3, totalAmount: 3000000, guestNote: 'Gần suối', status: 'PENDING' });
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(2);
    expect((await inventoryOf(f.roomTypeId, addDays(today(), 12)))?.heldRooms).toBe(2);
    const history = await query<{ reason: string }>(`SELECT reason FROM booking_status_history ORDER BY id`);
    expect(history[1].reason).toContain('Khách thay đổi đơn: ghi chú; ngày ở');

    // Cũ trả về lịch: đổi sang 1 phòng, 1 đêm.
    const shrink = await request(app).put(`/api/public/bookings/${code}`).set(h).send({ checkOut: addDays(today(), 11), roomCount: 1 });
    expect(shrink.body).toMatchObject({ nights: 1, roomCount: 1, totalAmount: 500000 });
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(1);
    expect((await inventoryOf(f.roomTypeId, addDays(today(), 11)))?.heldRooms).toBe(0);
    const nights = await query('SELECT * FROM booking_night WHERE booking_id = $1', [res.body.id]);
    expect(nights).toHaveLength(1);
  });

  it('cancels a booking and releases the rooms; paid bookings cannot be cancelled by the guest', async () => {
    const f = await fixture();
    const res = await request(app).post('/api/public/bookings').send(payload(f));
    const code = res.body.bookingCode as string;
    const h = { 'X-Booking-Token': res.body.accessToken as string };
    expect((await request(app).post(`/api/public/bookings/${code}/cancel`).send({})).status).toBe(404);
    const cancel = await request(app).post(`/api/public/bookings/${code}/cancel`).set(h).send({ reason: 'Đổi kế hoạch' });
    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({ status: 'CANCELLED', closeReason: 'Đổi kế hoạch', canCancel: false });
    expect((await inventoryOf(f.roomTypeId, checkIn()))?.heldRooms).toBe(0);
    const again = await request(app).post(`/api/public/bookings/${code}/cancel`).set(h).send({});
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('đã được hủy trước đó');

    const second = await request(app).post('/api/public/bookings').send(payload(f));
    const paid = await workflow.apply(second.body.id, () => true, 'CONFIRM', { type: 'ADMIN', accountId: null }, null);
    expect(paid.status).toBe('CONFIRMED');
    await workflow.apply(second.body.id, () => true, 'PAY', { type: 'ADMIN', accountId: null }, null);
    const blocked = await request(app).post(`/api/public/bookings/${second.body.bookingCode}/cancel`).set({ 'X-Booking-Token': second.body.accessToken }).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('ghi nhận thanh toán');
  });
});

describe('workflow', () => {
  it('confirms, pays and rejects with inventory, payments, history and notifications', async () => {
    const f = await fixture();
    const a = await request(app).post('/api/public/bookings').send(payload(f));
    const b = await request(app).post('/api/public/bookings').send(payload(f, { guestPhone: '0912345679' }));
    const admin = { type: 'ADMIN' as const, accountId: null };

    await workflow.apply(a.body.id, () => true, 'CONFIRM', admin, null);
    let inv = await inventoryOf(f.roomTypeId, checkIn());
    expect(inv).toMatchObject({ heldRooms: 1, confirmedRooms: 1 });

    await expect(workflow.apply(a.body.id, () => true, 'CONFIRM', admin, null)).rejects.toMatchObject({ status: 409 });
    await expect(workflow.apply(a.body.id, () => false, 'PAY', admin, null)).rejects.toMatchObject({ status: 404 });

    await workflow.apply(a.body.id, () => true, 'PAY', admin, 'Đã nhận chuyển khoản');
    const payments = await query<{ status: string; amount: number; externalTxnId: string }>('SELECT * FROM payment_transaction');
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: 'SUCCESS', amount: 1000000, externalTxnId: `MANUAL-${a.body.bookingCode}` });

    await workflow.apply(b.body.id, () => true, 'REJECT', { type: 'PROVIDER', accountId: null }, 'Hết phòng');
    inv = await inventoryOf(f.roomTypeId, checkIn());
    expect(inv).toMatchObject({ heldRooms: 0, confirmedRooms: 1 });
    const rejected = await one<{ status: string; closeReason: string }>('SELECT status, close_reason FROM booking WHERE id = $1', [b.body.id]);
    expect(rejected).toMatchObject({ status: 'CANCELLED', closeReason: 'Hết phòng' });

    const history = await query<{ fromStatus: string | null; toStatus: string; actor: string }>('SELECT * FROM booking_status_history WHERE booking_id = $1 ORDER BY id', [a.body.id]);
    expect(history.map((h) => `${h.fromStatus}>${h.toStatus}`)).toEqual(['null>PENDING', 'PENDING>CONFIRMED', 'CONFIRMED>PAID']);
    const guestNotices = await query<{ templateCode: string }>(`SELECT template_code FROM notification WHERE recipient_type = 'CUSTOMER' ORDER BY id`);
    expect(guestNotices.map((n) => n.templateCode)).toEqual(expect.arrayContaining(['BOOKING_CONFIRMED', 'BOOKING_PAID', 'BOOKING_REJECTED']));
  });
});

describe('reviews', () => {
  it('lets the owner review a paid stay after check-out, within the window', async () => {
    const f = await fixture();
    const res = await request(app).post('/api/public/bookings').send(payload(f, { checkIn: today(), checkOut: addDays(today(), 1) }));
    expect(res.status).toBe(201);
    const code = res.body.bookingCode as string;
    const h = { 'X-Booking-Token': res.body.accessToken as string };
    const admin = { type: 'ADMIN' as const, accountId: null };
    await workflow.apply(res.body.id, () => true, 'CONFIRM', admin, null);
    await workflow.apply(res.body.id, () => true, 'PAY', admin, null);

    // Chưa tới ngày trả phòng.
    const early = await request(app).post(`/api/public/bookings/${code}/review`).set(h).send({ rating: 5, content: 'Rất tuyệt vời' });
    expect(early.status).toBe(409);
    expect(early.body.message).toContain('Bạn có thể đánh giá từ ngày trả phòng');

    // Lùi ngày ở về quá khứ để đơn đã trả phòng.
    await exec('UPDATE booking SET check_in = $2, check_out = $3 WHERE id = $1', [res.body.id, addDays(today(), -3), addDays(today(), -1)]);
    const view = await request(app).get(`/api/public/bookings/${code}`).set(h);
    expect(view.body.canReview).toBe(true);

    const bad = await request(app).post(`/api/public/bookings/${code}/review`).set(h).send({ rating: 6, content: 'Rất tuyệt vời' });
    expect(bad.body.message).toBe('Đánh giá tối đa là 5 sao');
    const created = await request(app).post(`/api/public/bookings/${code}/review`).set(h).send({ rating: 5, content: 'Rất tuyệt vời', images: ['https://x/y.jpg', '  '] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ rating: 5, content: 'Rất tuyệt vời', images: ['https://x/y.jpg'], bookingCode: code, guestName: 'Nguyễn Văn A', placeId: f.placeId });
    expect((await one<{ ratingAvg: number; ratingCount: number }>('SELECT rating_avg, rating_count FROM place WHERE id = $1', [f.placeId]))).toEqual({ ratingAvg: 5, ratingCount: 1 });
    expect((await request(app).post(`/api/public/bookings/${code}/review`).set(h).send({ rating: 4, content: 'Lần hai' })).status).toBe(409);

    const upd = await request(app).put(`/api/public/bookings/${code}/review`).set(h).send({ rating: 3, content: 'Cũng được thôi' });
    expect(upd.body).toMatchObject({ rating: 3, content: 'Cũng được thôi', images: ['https://x/y.jpg'] });
    expect((await one<{ ratingAvg: number }>('SELECT rating_avg FROM place WHERE id = $1', [f.placeId]))?.ratingAvg).toBe(3);
    const got = await request(app).get(`/api/public/bookings/${code}/review`).set(h);
    expect(got.body.rating).toBe(3);

    expect((await request(app).delete(`/api/public/bookings/${code}/review`).set(h)).status).toBe(204);
    expect((await one<{ ratingCount: number }>('SELECT rating_count FROM place WHERE id = $1', [f.placeId]))?.ratingCount).toBe(0);
    const empty = await request(app).get(`/api/public/bookings/${code}/review`).set(h);
    expect(empty.status).toBe(200);
    expect(empty.text).toBe('');
  });
});

describe('QR check-in', () => {
  it('lets a traveler check in with the homestay QR code once paid', async () => {
    const f = await fixture();
    await exec(`INSERT INTO homestay_profile (place_id, checkin_code, updated_at) VALUES ($1, 'ABCD2345', $2)`, [f.placeId, nowLocal()]);
    const traveler = await createTraveler('khach@example.com');
    const res = await request(app).post('/api/public/bookings').set(bearer(traveler.token)).send(payload(f, { checkIn: today(), checkOut: addDays(today(), 1) }));
    const code = res.body.bookingCode as string;

    const place = await request(app).get('/api/public/qr/abcd-2345');
    expect(place.status).toBe(200);
    expect(place.body).toMatchObject({ placeId: f.placeId, placeName: 'Homestay Mù Cang Chải' });
    expect((await request(app).get('/api/public/qr/ZZZZ')).status).toBe(404);

    const before = await request(app).get('/api/v1/traveler/stays/qr/ABCD2345').set(bearer(traveler.token));
    expect(before.body.stays).toHaveLength(1);
    expect(before.body.stays[0]).toMatchObject({ bookingCode: code, canCheckIn: false });
    expect(before.body.stays[0].blockReason).toContain('chờ chủ nhà xác nhận');
    const early = await request(app).post('/api/v1/traveler/stays/qr/ABCD2345/check-in').set(bearer(traveler.token)).send({ bookingCode: code });
    expect(early.status).toBe(409);

    const admin = { type: 'ADMIN' as const, accountId: null };
    await workflow.apply(res.body.id, () => true, 'CONFIRM', admin, null);
    await workflow.apply(res.body.id, () => true, 'PAY', admin, null);
    const done = await request(app).post('/api/v1/traveler/stays/qr/ABCD2345/check-in').set(bearer(traveler.token)).send({ bookingCode: code });
    expect(done.status).toBe(200);
    expect(done.body.checkedInAt).toBeTruthy();
    expect(done.body.canCheckIn).toBe(false);
    // Bấm lần hai không lỗi.
    expect((await request(app).post('/api/v1/traveler/stays/qr/ABCD2345/check-in').set(bearer(traveler.token)).send({ bookingCode: code })).status).toBe(200);
    expect((await request(app).post('/api/v1/traveler/stays/qr/ABCD2345/check-in').set(bearer(traveler.token)).send({})).status).toBe(400);

    // Quá hạn trả phòng → job tự ghi trả phòng.
    await exec('UPDATE booking SET check_in = $2, check_out = $3, checked_in_at = $4 WHERE id = $1', [res.body.id, addDays(today(), -1), today(), `${addDays(today(), -1)}T14:00:00`]);
    const now = `${today()}T23:00:00`;
    expect(await stays.autoCheckout(now)).toEqual({ checkedOut: 1 });
    const row = await one<{ checkedOutAt: string; checkedOutBy: string }>('SELECT checked_out_at, checked_out_by FROM booking WHERE id = $1', [res.body.id]);
    expect(row).toEqual({ checkedOutAt: `${today()}T12:00:00`, checkedOutBy: 'SYSTEM' });
    expect(await stays.autoCheckout(now)).toEqual({ checkedOut: 0 });
  });
});

describe('sepay webhook', () => {
  it('requires configuration and a matching secret', async () => {
    const res = await request(app).post('/api/v1/webhooks/sepay').send({});
    expect(res.status).toBe(503);
  });
});
