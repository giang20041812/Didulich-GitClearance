import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exec, one, query } from '../src/db/pool.js';
import { addDays, nowLocal, today } from '../src/lib/time.js';
import { bearer, createAdmin, createPlace, createProvider, createRoomType, createTraveler, resetData, setupDatabase, teardownDatabase } from './helpers.js';

let app: Express;

beforeAll(async () => {
  app = await setupDatabase('viettrek_test_admin');
});
afterAll(async () => {
  await teardownDatabase();
});
beforeEach(async () => {
  await resetData();
});

async function newBooking(placeId: number, roomTypeId: number, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/public/bookings')
    .send({
      placeId,
      rooms: [{ roomTypeId, roomCount: 1 }],
      checkIn: addDays(today(), 10),
      checkOut: addDays(today(), 12),
      guestCount: 2,
      guestName: 'Nguyễn Văn A',
      guestPhone: '0912345678',
      guestEmail: 'khach@example.com',
      ...extra,
    });
  expect(res.status).toBe(201);
  return (await one<{ id: number }>('SELECT id FROM booking WHERE booking_code = $1', [res.body.bookingCode]))!.id;
}

describe('access levels', () => {
  it('limits routes by admin level and role', async () => {
    const l1 = await createAdmin(1);
    const l3 = await createAdmin(3);
    const ncc = await createProvider();
    expect((await request(app).get('/api/v1/admin/accounts').set(bearer(ncc.token))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/accounts').set(bearer(l3.token))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/accounts').set(bearer(l1.token))).status).toBe(200);
    // Cấp 3 xem được danh sách đơn nhưng không xử lý đơn.
    expect((await request(app).get('/api/v1/admin/bookings').set(bearer(l3.token))).status).toBe(200);
    expect((await request(app).post('/api/v1/admin/bookings/1/confirm').set(bearer(l3.token))).status).toBe(403);
    const me = await request(app).get('/api/v1/admin/accounts/me').set(bearer(l3.token));
    expect(me.body).toMatchObject({ id: l3.id, role: 'ADMIN', adminLevel: 3 });
  });
});

describe('accounts', () => {
  it('creates, updates, locks and re-levels accounts with audit trail', async () => {
    const root = await createAdmin(1);
    const invalid = await request(app).post('/api/v1/admin/accounts').set(bearer(root.token)).send({ email: 'x', password: '123' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ status: 400, message: 'Email không đúng định dạng' });

    const created = await request(app)
      .post('/api/v1/admin/accounts')
      .set(bearer(root.token))
      .send({ email: 'Moi@Test.vn', phone: '0911111111', password: 'MatKhau123', fullName: 'Quản trị mới' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'moi@test.vn', role: 'ADMIN', adminLevel: 3, status: 'ACTIVE' });
    const id = created.body.id;

    const dup = await request(app)
      .post('/api/v1/admin/accounts')
      .set(bearer(root.token))
      .send({ email: 'moi@test.vn', phone: '0922222222', password: 'MatKhau123', fullName: 'Trùng' });
    expect(dup.status).toBe(400);
    expect(dup.body).toEqual({ status: 400, message: 'Email moi@test.vn đã được sử dụng' });

    const lockWithoutReason = await request(app).patch(`/api/v1/admin/accounts/${id}/status`).set(bearer(root.token)).send({ status: 'INACTIVE' });
    expect(lockWithoutReason.status).toBe(400);
    expect(lockWithoutReason.body.message).toBe('Vui lòng nhập lý do khi khóa tài khoản.');
    const selfLock = await request(app).patch(`/api/v1/admin/accounts/${root.id}/status`).set(bearer(root.token)).send({ status: 'INACTIVE', reason: 'x' });
    expect(selfLock.status).toBe(409);

    const locked = await request(app).patch(`/api/v1/admin/accounts/${id}/status`).set(bearer(root.token)).send({ status: 'INACTIVE', reason: 'Vi phạm' });
    expect(locked.body.status).toBe('INACTIVE');

    const level = await request(app).patch(`/api/v1/admin/accounts/${id}/admin-level`).set(bearer(root.token)).send({ adminLevel: 2, reason: 'Thăng cấp' });
    expect(level.body.adminLevel).toBe(2);
    const sameLevel = await request(app).patch(`/api/v1/admin/accounts/${id}/admin-level`).set(bearer(root.token)).send({ adminLevel: 2, reason: 'Lại' });
    expect(sameLevel.status).toBe(400);

    const list = await request(app).get('/api/v1/admin/accounts?keyword=quản trị mới&role=ADMIN').set(bearer(root.token));
    expect(list.body.totalElements).toBe(1);

    const logs = await request(app).get('/api/v1/admin/audit-logs?actor=ADMIN').set(bearer(root.token));
    const actions = logs.body.content.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE_ADMIN_ACCOUNT', 'UPDATE_ACCOUNT_STATUS', 'UPDATE_ADMIN_LEVEL']));
    const detail = await request(app).get(`/api/v1/admin/audit-logs/${logs.body.content[0].id}`).set(bearer(root.token));
    expect(detail.status).toBe(200);
    expect(detail.body).toHaveProperty('afterData');

    const del = await request(app).delete(`/api/v1/admin/accounts/${id}?reason=Dọn dẹp`).set(bearer(root.token));
    expect(del.status).toBe(204);
    expect(await one('SELECT id FROM account WHERE id = $1', [id])).toBeNull();
  });

  it('changes a provider account role only with a reason and a free provider', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const free = { providerId: (await query<{ id: number }>(`INSERT INTO provider (name, status, service_type, created_at, updated_at) VALUES ('NCC trống', 'ACTIVE', 'HOMESTAY', $1, $1) RETURNING id`, [nowLocal()]))[0].id };
    const noReason = await request(app).patch(`/api/v1/admin/accounts/${ncc.id}/role`).set(bearer(root.token)).send({ role: 'ADMIN' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe('Vui lòng nhập lý do đổi quyền');
    const toAdmin = await request(app).patch(`/api/v1/admin/accounts/${ncc.id}/role`).set(bearer(root.token)).send({ role: 'ADMIN', reason: 'Điều chuyển' });
    expect(toAdmin.body).toMatchObject({ role: 'ADMIN', adminLevel: 3, providerId: null });
    const back = await request(app).patch(`/api/v1/admin/accounts/${ncc.id}/role`).set(bearer(root.token)).send({ role: 'PROVIDER', providerId: free.providerId, reason: 'Quay lại' });
    expect(back.body).toMatchObject({ role: 'PROVIDER', providerId: free.providerId });
    const busy = await request(app).patch(`/api/v1/admin/accounts/${root.id}/role`).set(bearer(root.token)).send({ role: 'PROVIDER', providerId: free.providerId, reason: 'x' });
    expect(busy.status).toBe(409);
  });
});

describe('providers and applications', () => {
  it('approves an application into a provider with a login account', async () => {
    const root = await createAdmin(1);
    const reg = await request(app)
      .post('/api/v1/auth/provider/register')
      .send({
        businessName: 'Homestay Bản Hồ',
        contactName: 'Giàng A',
        contactPhone: '0933333333',
        contactEmail: 'banho@example.com',
        password: 'MatKhau123',
        address: 'Bản Hồ, Sa Pa',
        serviceType: 'HOMESTAY',
        details: { propertyType: 'NHA_SAN', roomCount: 3, maxGuests: 8 },
      });
    expect(reg.status).toBe(201);
    const id = reg.body.applicationId;

    const summary = await request(app).get('/api/v1/admin/provider-applications/summary').set(bearer(root.token));
    expect(summary.body).toEqual({ pending: 1 });
    const list = await request(app).get('/api/v1/admin/provider-applications?status=PENDING').set(bearer(root.token));
    expect(list.body.content[0]).toMatchObject({ id, businessName: 'Homestay Bản Hồ', status: 'PENDING' });
    const detail = await request(app).get(`/api/v1/admin/provider-applications/${id}`).set(bearer(root.token));
    expect(detail.body).toMatchObject({ phoneTaken: false, emailTaken: false, details: { propertyType: 'NHA_SAN' } });
    expect(detail.body.summary).not.toHaveProperty('passwordHash');

    const noReason = await request(app).post(`/api/v1/admin/provider-applications/${id}/reject`).set(bearer(root.token)).send({ reason: ' ' });
    expect(noReason.status).toBe(400);
    expect(noReason.body).toEqual({ status: 400, message: 'Vui lòng nhập lý do từ chối.' });

    const approved = await request(app).post(`/api/v1/admin/provider-applications/${id}/approve`).set(bearer(root.token)).send({ note: 'Hồ sơ đầy đủ' });
    expect(approved.status).toBe(200);
    expect(approved.body.summary).toMatchObject({ status: 'APPROVED', reviewNote: 'Hồ sơ đầy đủ' });
    expect(approved.body.summary.providerId).toBeGreaterThan(0);

    const again = await request(app).post(`/api/v1/admin/provider-applications/${id}/approve`).set(bearer(root.token)).send({});
    expect(again.status).toBe(409);

    // Đăng nhập được bằng mật khẩu đã băm lúc đăng ký.
    const login = await request(app).post('/api/v1/auth/portal/login').send({ identifier: '0933333333', password: 'MatKhau123' });
    expect(login.status).toBe(200);

    const providers = await request(app).get('/api/v1/admin/providers?status=ACTIVE').set(bearer(root.token));
    expect(providers.body).toHaveLength(1);
    expect(providers.body[0]).toMatchObject({ name: 'Homestay Bản Hồ', accountCount: 1, placeCount: 0, serviceType: 'HOMESTAY' });
    const accounts = await request(app).get(`/api/v1/admin/providers/${providers.body[0].id}/accounts`).set(bearer(root.token));
    expect(accounts.body[0]).toMatchObject({ phone: '0933333333', status: 'ACTIVE' });

    const bulk = await request(app).post('/api/v1/admin/provider-applications/bulk-reject').set(bearer(root.token)).send({ ids: [id, 99999], reason: 'Thử' });
    expect(bulk.body.succeededIds).toEqual([]);
    expect(bulk.body.failed).toHaveLength(2);
    const noIds = await request(app).post('/api/v1/admin/provider-applications/bulk-approve').set(bearer(root.token)).send({ ids: [] });
    expect(noIds.body).toEqual({ status: 400, message: 'Vui lòng chọn ít nhất một hồ sơ.' });
  });

  it('creates and suspends a provider (cancelling its pending bookings)', async () => {
    const root = await createAdmin(1);
    const created = await request(app)
      .post('/api/v1/admin/providers')
      .set(bearer(root.token))
      .send({ name: 'Nhà xe Sơn Lâm', accountEmail: 'sonlam@test.vn', accountPassword: 'MatKhau123', accountFullName: 'Lâm', serviceType: 'TRANSPORT' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Nhà xe Sơn Lâm', serviceType: 'TRANSPORT', status: 'ACTIVE', accountCount: 1 });

    const invalid = await request(app).post('/api/v1/admin/providers').set(bearer(root.token)).send({ name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('Tên cơ sở/đối tác không được để trống');

    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà đình chỉ', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId);
    const bookingId = await newBooking(placeId, roomId);
    const noReason = await request(app).patch(`/api/v1/admin/providers/${ncc.providerId}/status`).set(bearer(root.token)).send({ status: 'SUSPENDED' });
    expect(noReason.status).toBe(400);
    const suspended = await request(app)
      .patch(`/api/v1/admin/providers/${ncc.providerId}/status`)
      .set(bearer(root.token))
      .send({ status: 'SUSPENDED', reason: 'Vi phạm chính sách' });
    expect(suspended.body.status).toBe('SUSPENDED');
    expect((await one<{ status: string }>('SELECT status FROM booking WHERE id = $1', [bookingId]))?.status).toBe('CANCELLED');
  });
});

describe('places', () => {
  it('lists, verifies, hides and soft-deletes places', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const a = await createPlace({ name: 'Homestay Mù Cang Chải', providerId: ncc.providerId });
    const b = await createPlace({ name: 'Thác Bản Giốc', kind: 'ATTRACTION', providerId: null });
    await newBooking(a, await createRoomType(a));

    const list = await request(app).get('/api/v1/admin/places?keyword=mu cang').set(bearer(root.token));
    expect(list.body.content.map((p: { id: number }) => p.id)).toEqual([a]);
    expect(list.body.content[0]).toMatchObject({ categoryName: 'Homestay', providerName: ncc.providerId ? expect.any(String) : null });
    const byKind = await request(app).get('/api/v1/admin/places?kind=ATTRACTION').set(bearer(root.token));
    expect(byKind.body.content.map((p: { id: number }) => p.id)).toEqual([b]);

    const summary = await request(app).get('/api/v1/admin/places/summary').set(bearer(root.token));
    expect(summary.body).toMatchObject({ UNVERIFIED: 2, VERIFIED: 0 });

    const noReason = await request(app).patch(`/api/v1/admin/places/${a}/verification`).set(bearer(root.token)).send({ verification: 'NEEDS_UPDATE' });
    expect(noReason.status).toBe(400);
    expect(noReason.body).toEqual({ status: 400, message: 'Vui lòng nhập lý do khi yêu cầu bổ sung hoặc lưu trữ điểm đến.' });
    const verified = await request(app).patch(`/api/v1/admin/places/${a}/verification`).set(bearer(root.token)).send({ verification: 'VERIFIED' });
    expect(verified.body).toMatchObject({ verification: 'VERIFIED', lastVerifiedAt: today() });

    const bulk = await request(app).patch('/api/v1/admin/places/verification/bulk').set(bearer(root.token)).send({ ids: [a, b], verification: 'VERIFIED' });
    expect(bulk.body).toEqual({ updated: 2 });

    const hidden = await request(app).patch(`/api/v1/admin/places/${a}/visibility`).set(bearer(root.token)).send({ visibility: 'UNPUBLISHED', reason: 'Khẩn cấp' });
    expect(hidden.body.visibility).toBe('UNPUBLISHED');

    const detail = await request(app).get(`/api/v1/admin/places/${a}`).set(bearer(root.token));
    expect(detail.body).toMatchObject({ id: a, kind: 'HOMESTAY', contacts: [], highlights: [] });
    expect(detail.body).toHaveProperty('attributes');
    const showcase = await request(app).get(`/api/v1/admin/places/${a}/showcase`).set(bearer(root.token));
    expect(showcase.body).toMatchObject({ placeId: a, images: [], rooms: [{ name: 'Phòng đôi', basePrice: 500000, status: 'ACTIVE' }] });

    // Điểm đến còn đơn đang hiệu lực thì không xóa được.
    const blocked = await request(app).post('/api/v1/admin/places/delete').set(bearer(root.token)).send({ ids: [a], reason: 'Dọn' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('còn đơn đặt phòng đang hiệu lực');
    const deleted = await request(app).post('/api/v1/admin/places/delete').set(bearer(root.token)).send({ ids: [b], reason: 'Dọn' });
    expect(deleted.body).toEqual({ deleted: 1 });
    expect((await request(app).get(`/api/v1/admin/places/${b}`).set(bearer(root.token))).status).toBe(400);
  });
});

describe('places data-verified flag', () => {
  it('defaults to unverified, toggles independently of verification, filters and audits', async () => {
    const root = await createAdmin(1);
    const a = await createPlace({ name: 'Homestay cờ dữ liệu' });
    const b = await createPlace({ name: 'Điểm cờ dữ liệu', kind: 'ATTRACTION', providerId: null });

    const list = await request(app).get('/api/v1/admin/places').set(bearer(root.token));
    expect(list.body.content.every((p: { dataVerified: boolean }) => p.dataVerified === false)).toBe(true);

    const on = await request(app).patch(`/api/v1/admin/places/${a}/data-verified`).set(bearer(root.token)).send({ dataVerified: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ id: a, dataVerified: true, verification: 'UNVERIFIED' });

    const verifiedOnly = await request(app).get('/api/v1/admin/places?dataVerified=true').set(bearer(root.token));
    expect(verifiedOnly.body.content.map((p: { id: number }) => p.id)).toEqual([a]);
    const unverifiedOnly = await request(app).get('/api/v1/admin/places?dataVerified=false').set(bearer(root.token));
    expect(unverifiedOnly.body.content.map((p: { id: number }) => p.id)).toEqual([b]);
    expect((await request(app).get(`/api/v1/admin/places/${a}`).set(bearer(root.token))).body).toMatchObject({ dataVerified: true });

    // Duyệt nội dung không đụng tới cờ dữ liệu.
    const verification = await request(app).patch(`/api/v1/admin/places/${b}/verification`).set(bearer(root.token)).send({ verification: 'VERIFIED' });
    expect(verification.body).toMatchObject({ verification: 'VERIFIED', dataVerified: false });

    const off = await request(app).patch(`/api/v1/admin/places/${a}/data-verified`).set(bearer(root.token)).send({ dataVerified: false, reason: 'Phát hiện sai giá' });
    expect(off.body).toMatchObject({ dataVerified: false });
    const logs = await query<{ action: string; reason: string | null }>(
      `SELECT action, reason FROM audit_log WHERE action = 'UPDATE_PLACE_DATA_VERIFIED' AND entity_id = $1 ORDER BY id`,
      [a],
    );
    expect(logs.map((l) => l.reason)).toEqual(['Admin xác thực dữ liệu điểm đến', 'Phát hiện sai giá']);

    // Đặt lại đúng giá trị hiện tại thì không ghi thêm nhật ký.
    await request(app).patch(`/api/v1/admin/places/${a}/data-verified`).set(bearer(root.token)).send({ dataVerified: false });
    expect(await query(`SELECT 1 FROM audit_log WHERE action = 'UPDATE_PLACE_DATA_VERIFIED' AND entity_id = $1`, [a])).toHaveLength(2);

    expect((await request(app).patch(`/api/v1/admin/places/${a}/data-verified`).set(bearer(root.token)).send({})).status).toBe(400);
    expect((await request(app).patch('/api/v1/admin/places/999999/data-verified').set(bearer(root.token)).send({ dataVerified: true })).status).toBe(400);
  });
});

describe('bookings, finance, reports, dashboard', () => {
  it('handles a booking end to end with refunds, reports and dashboard counters', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà báo cáo', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId, 'Phòng A', 500000, 3, 2);
    const id = await newBooking(placeId, roomId);

    const list = await request(app).get('/api/v1/admin/bookings?status=PENDING,CONFIRMED').set(bearer(root.token));
    expect(list.body.totalElements).toBe(1);
    expect((await request(app).get('/api/v1/admin/bookings/summary').set(bearer(root.token))).body).toMatchObject({ PENDING: 1, CONFIRMED: 0 });
    const detail = await request(app).get(`/api/v1/admin/bookings/${id}`).set(bearer(root.token));
    expect(detail.body).toMatchObject({ actions: ['CONFIRM', 'REJECT'], notes: [], payments: [] });
    expect(detail.body.booking).toMatchObject({ id, status: 'PENDING' });

    const note = await request(app).post(`/api/v1/admin/bookings/${id}/notes`).set(bearer(root.token)).send({ kind: 'VERIFICATION', content: 'Đã gọi khách' });
    expect(note.status).toBe(201);
    const bad = await request(app).post(`/api/v1/admin/bookings/${id}/notes`).set(bearer(root.token)).send({ kind: 'OUTCOME', content: 'x' });
    expect(bad.body).toEqual({ status: 400, message: 'Vui lòng chọn hướng xử lý khi ghi nhận kết quả.' });

    expect((await request(app).post(`/api/v1/admin/bookings/${id}/confirm`).set(bearer(root.token)).send({})).body.booking.status).toBe('CONFIRMED');
    const needProof = await request(app).post(`/api/v1/admin/bookings/${id}/pay`).set(bearer(root.token)).send({});
    expect(needProof.status).toBe(400);
    expect(needProof.body.message).toContain('chứng từ thanh toán');
    const paid = await request(app).post(`/api/v1/admin/bookings/${id}/pay`).set(bearer(root.token)).send({ note: 'Chuyển khoản VCB 123' });
    expect(paid.body.booking.status).toBe('PAID');

    // Dòng tiền: giao dịch thanh toán + hoàn tiền chờ duyệt.
    const gateway = await one<{ id: number }>(`SELECT id FROM payment_gateway WHERE code = 'MANUAL'`);
    const payment = await one<{ id: number; amount: number }>('SELECT id, amount FROM payment_transaction WHERE booking_id = $1', [id]);
    expect(payment).not.toBeNull();
    expect(gateway).not.toBeNull();
    await exec(
      `INSERT INTO refund (booking_id, payment_transaction_id, refund_type, amount, reason, status, requested_at)
       VALUES ($1, $2, 'FULL_REFUND', 100000, 'Khách hủy', 'PENDING', $3)`,
      [id, payment!.id, nowLocal()],
    );
    const refunds = await request(app).get('/api/v1/admin/finance/refunds').set(bearer(root.token));
    expect(refunds.body).toHaveLength(1);
    expect(refunds.body[0]).toMatchObject({ bookingId: id, status: 'PENDING', amount: 100000 });
    const refundId = refunds.body[0].id;
    const noReason = await request(app).post(`/api/v1/admin/finance/refunds/${refundId}/reject`).set(bearer(root.token)).send({ reason: '' });
    expect(noReason.body).toEqual({ status: 400, message: 'Lý do từ chối là bắt buộc' });
    const cash = await request(app).get('/api/v1/admin/finance/cashflow').set(bearer(root.token));
    expect(cash.status).toBe(200);
    expect(cash.body.rows.content[0]).toMatchObject({ name: expect.any(String), paidBookings: 1, pendingRefundAmount: 100000, refundedAmount: 0 });
    const approved = await request(app).post(`/api/v1/admin/finance/refunds/${refundId}/approve`).set(bearer(root.token)).send({});
    expect(approved.body).toMatchObject({ status: 'PROCESSED', processedByAccountId: root.id });
    const twice = await request(app).post(`/api/v1/admin/finance/refunds/${refundId}/approve`).set(bearer(root.token)).send({});
    expect(twice.status).toBe(409);
    const place = await request(app).get('/api/v1/admin/finance/cashflow?level=PLACE').set(bearer(root.token));
    expect(place.body.rows.content[0]).toMatchObject({ id: placeId, refundedAmount: 100000, netAmount: payment!.amount - 100000 });

    const revenue = await request(app).get('/api/v1/admin/finance/revenue-summary').set(bearer(root.token));
    expect(revenue.body.grandTotal).toBe(payment!.amount);

    const link = await request(app).post('/api/v1/admin/finance/affiliate-links').set(bearer(root.token)).send({ accountId: ncc.id, code: 'GIOITHIEU', commissionRate: 0.05 });
    expect(link.status).toBe(201);
    expect((await request(app).post('/api/v1/admin/finance/affiliate-links').set(bearer(root.token)).send({ accountId: ncc.id, code: 'GIOITHIEU', commissionRate: 0.05 })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/admin/finance/affiliate-links/${link.body.id}`).set(bearer(root.token))).status).toBe(204);
    expect((await request(app).get('/api/v1/admin/finance/commissions').set(bearer(root.token))).body).toMatchObject({ totalPending: 0, items: [] });

    const report = await request(app).get('/api/v1/admin/reports/overview').set(bearer(root.token));
    expect(report.status).toBe(200);
    expect(report.body.kpi).toMatchObject({ totalBookings: 1, confirmedBookings: 1, bookingValue: payment!.amount, paidRevenue: payment!.amount });
    expect(report.body.topProviders[0]).toMatchObject({ id: ncc.providerId, bookings: 1 });
    expect(report.body.byStatus.map((s: { status: string }) => s.status)).toEqual(['PENDING', 'CONFIRMED', 'PAID', 'CANCELLED']);
    expect((await request(app).get('/api/v1/admin/reports/overview?group=ZZZ').set(bearer(root.token))).status).toBe(400);

    const summary = await request(app).get('/api/v1/admin/dashboard/summary').set(bearer(root.token));
    expect(summary.body).toMatchObject({ totalPlaces: 1, totalProviders: 1, monthlyBookingsCount: 1, pendingSosCount: 0 });
    expect(summary.body.revenueTrend).toHaveLength(6);
    const nav = await request(app).get('/api/v1/admin/dashboard/nav-counts').set(bearer(root.token));
    expect(nav.body).toMatchObject({ pendingApplications: 0, pendingChanges: 0, pendingSos: 0 });
    const l3 = await createAdmin(3);
    expect((await request(app).get('/api/v1/admin/dashboard/nav-counts').set(bearer(l3.token))).body).toMatchObject({ pendingApplications: null, pendingChanges: null });
    const activity = await request(app).get('/api/v1/admin/dashboard/activity?limit=3').set(bearer(root.token));
    expect(activity.body.length).toBeLessThanOrEqual(3);
    expect(activity.body[0]).toHaveProperty('actorName');
  });
});

describe('change requests', () => {
  it('lists pending partner change requests and lets admin approve them', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà đang công khai', providerId: ncc.providerId });
    await createRoomType(placeId, 'Phòng sẵn');
    const pending = await request(app)
      .post(`/api/v1/partner/homestays/${placeId}/rooms`)
      .set(bearer(ncc.token))
      .send({
        name: 'Phòng mới',
        maxOccupancy: 2,
        totalRoomCount: 2,
        privateBathroom: 'YES',
        basePrice: 700000,
        status: 'ACTIVE',
        beds: [{ bedType: 'DOUBLE', quantity: 1 }],
        amenityIds: [],
      });
    expect(pending.status).toBe(202);
    const id = pending.body.changeRequestId;

    const summary = await request(app).get('/api/v1/admin/change-requests/summary').set(bearer(root.token));
    expect(summary.body).toEqual({ pending: 1 });
    const list = await request(app).get('/api/v1/admin/change-requests?status=PENDING').set(bearer(root.token));
    expect(list.body.content[0]).toMatchObject({ id, status: 'PENDING', targetType: 'ROOM_TYPE', operation: 'CREATE' });
    const detail = await request(app).get(`/api/v1/admin/change-requests/${id}`).set(bearer(root.token));
    expect(detail.status).toBe(200);

    const approved = await request(app).post(`/api/v1/admin/change-requests/${id}/approve`).set(bearer(root.token)).send({ note: 'OK' });
    expect(approved.status).toBe(200);
    expect(approved.body.summary).toMatchObject({ status: 'APPROVED' });
    expect(await query('SELECT id FROM room_type WHERE place_id = $1', [placeId])).toHaveLength(2);
    const noReject = await request(app).post(`/api/v1/admin/change-requests/${id}/reject`).set(bearer(root.token)).send({ reason: 'x' });
    expect(noReject.status).toBe(409);
  });
});

describe('reviews, SOS, travelers, calendar, notifications', () => {
  it('moderates a review and refreshes the place rating', async () => {
    const root = await createAdmin(1);
    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà đánh giá', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId);
    const bookingId = await newBooking(placeId, roomId);
    await exec(`UPDATE booking SET status = 'PAID' WHERE id = $1`, [bookingId]);
    const now = nowLocal();
    await exec(
      `INSERT INTO review (place_id, booking_id, rating, content, status, editable_until, created_at, updated_at) VALUES ($1,$2,5,'Tuyệt vời','VISIBLE',$3,$3,$3)`,
      [placeId, bookingId, now],
    );
    await exec('UPDATE place SET rating_avg = 5, rating_count = 1 WHERE id = $1', [placeId]);

    const list = await request(app).get(`/api/v1/admin/reviews?placeId=${placeId}&processed=false`).set(bearer(root.token));
    expect(list.body.totalElements).toBe(1);
    expect(list.body.content[0]).toMatchObject({ rating: 5, status: 'VISIBLE', guestName: 'Nguyễn Văn A', providerName: expect.any(String) });
    const id = list.body.content[0].id;

    const noReason = await request(app).post(`/api/v1/admin/reviews/${id}/moderate`).set(bearer(root.token)).send({ action: 'HIDE' });
    expect(noReason.status).toBe(400);
    expect(noReason.body).toEqual({ status: 400, message: 'Vui lòng nhập lý do khi ẩn hoặc gỡ đánh giá.' });
    const hidden = await request(app).post(`/api/v1/admin/reviews/${id}/moderate`).set(bearer(root.token)).send({ action: 'HIDE', reason: 'Ngôn từ xấu' });
    expect(hidden.body).toMatchObject({ status: 'HIDDEN', moderationReason: 'Ngôn từ xấu', moderatedByName: 'Admin Test' });
    expect(await one<{ ratingCount: number; ratingAvg: number }>('SELECT rating_count, rating_avg FROM place WHERE id = $1', [placeId])).toMatchObject({ ratingCount: 0, ratingAvg: 0 });
    const restored = await request(app).post(`/api/v1/admin/reviews/${id}/moderate`).set(bearer(root.token)).send({ action: 'RESTORE' });
    expect(restored.body.status).toBe('VISIBLE');
    const removed = await request(app).post(`/api/v1/admin/reviews/${id}/moderate`).set(bearer(root.token)).send({ action: 'REMOVE', reason: 'Vi phạm' });
    expect(removed.body.status).toBe('REMOVED');
    const again = await request(app).post(`/api/v1/admin/reviews/${id}/moderate`).set(bearer(root.token)).send({ action: 'KEEP' });
    expect(again.status).toBe(409);
    expect((await request(app).get(`/api/v1/admin/reviews/${id}`).set(bearer(root.token))).body.status).toBe('REMOVED');
  });

  it('takes a public SOS and dispatches it to an emergency contact', async () => {
    const root = await createAdmin(1);
    const bad = await request(app).post('/api/public/sos').send({ requesterName: 'An' });
    expect(bad.status).toBe(400);
    const sent = await request(app).post('/api/public/sos').send({ requesterName: 'Lê An', requesterPhone: '0944444444', type: 'MEDICAL', latitude: 21.5, longitude: 103.9, description: 'Gãy chân' });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toContain('đã được ghi nhận');
    const sosId = sent.body.sosRequestId;

    const nav = await request(app).get('/api/v1/admin/dashboard/nav-counts').set(bearer(root.token));
    expect(nav.body.pendingSos).toBe(1);
    const notices = await request(app).get('/api/v1/admin/notifications').set(bearer(root.token));
    expect(notices.body.unread).toBeGreaterThanOrEqual(0);

    const contact = await request(app).post('/api/v1/admin/emergency-contacts').set(bearer(root.token)).send({ type: 'MEDICAL', name: 'Trạm y tế Tà Xùa', phone: '0212 3333' });
    expect(contact.status).toBe(201);
    expect(contact.body).toMatchObject({ isActive: true, type: 'MEDICAL' });
    const missing = await request(app).post('/api/v1/admin/emergency-contacts').set(bearer(root.token)).send({ name: 'x', phone: '1' });
    expect(missing.body).toEqual({ status: 400, message: 'Loại đầu mối liên hệ là bắt buộc' });

    const dispatched = await request(app).post(`/api/v1/admin/sos-requests/${sosId}/dispatch`).set(bearer(root.token)).send({ assignedContactId: contact.body.id, note: 'Đã gọi' });
    expect(dispatched.body).toMatchObject({ status: 'DISPATCHED', assignedContact: { name: 'Trạm y tế Tà Xùa' }, dispatchNote: 'Đã gọi' });
    expect((await request(app).post(`/api/v1/admin/sos-requests/${sosId}/dispatch`).set(bearer(root.token)).send({ assignedContactId: contact.body.id })).status).toBe(409);
    const resolved = await request(app).post(`/api/v1/admin/sos-requests/${sosId}/resolve`).set(bearer(root.token));
    expect(resolved.body.status).toBe('RESOLVED');
    const listed = await request(app).get('/api/v1/admin/sos-requests?status=resolved').set(bearer(root.token));
    expect(listed.body.total).toBe(1);
    expect((await request(app).get('/api/v1/admin/sos-requests?status=nope').set(bearer(root.token))).body).toEqual({ status: 400, message: 'Giá trị status không hợp lệ: nope' });
    const updated = await request(app).put(`/api/v1/admin/emergency-contacts/${contact.body.id}`).set(bearer(root.token)).send({ isActive: false });
    expect(updated.body.isActive).toBe(false);
    expect((await request(app).get('/api/v1/admin/emergency-contacts?activeOnly=true').set(bearer(root.token))).body).toEqual([]);
    expect((await request(app).delete(`/api/v1/admin/emergency-contacts/${contact.body.id}`).set(bearer(root.token))).status).toBe(204);
  });

  it('manages travelers and shows the room calendar', async () => {
    const root = await createAdmin(1);
    const created = await request(app).post('/api/v1/admin/travelers').set(bearer(root.token)).send({ fullName: 'Khách Mới', email: 'KhachMoi@Test.vn', phone: '0955555555', password: 'MatKhau123' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'khachmoi@test.vn', signupMethod: 'EMAIL', status: 'ACTIVE' });
    const badEmail = await request(app).post('/api/v1/admin/travelers').set(bearer(root.token)).send({ fullName: 'A', email: 'x', password: '123456' });
    expect(badEmail.body).toEqual({ status: 400, message: 'Email không đúng định dạng.' });
    const traveler = await createTraveler();
    const locked = await request(app).patch(`/api/v1/admin/travelers/${traveler.id}/status`).set(bearer(root.token)).send({ status: 'INACTIVE', reason: 'Spam' });
    expect(locked.body.status).toBe('INACTIVE');
    const list = await request(app).get('/api/v1/admin/travelers?status=INACTIVE&signupMethod=EMAIL').set(bearer(root.token));
    expect(list.body.totalElements).toBe(1);
    const history = await request(app).get(`/api/v1/admin/travelers/${traveler.id}/activity`).set(bearer(root.token));
    expect(history.status).toBe(200);
    const views = await request(app).get('/api/v1/admin/homestay-views').set(bearer(root.token));
    expect(views.body.totalElements).toBe(0);
    expect((await request(app).get('/api/v1/admin/homestay-views/summary').set(bearer(root.token))).body).toEqual({ totalViews: 0, travelers: 0, homestays: 0 });
    const l3 = await createAdmin(3);
    expect((await request(app).get('/api/v1/admin/homestay-views').set(bearer(l3.token))).status).toBe(403);
    const deleted = await request(app).delete(`/api/v1/admin/travelers/${traveler.id}?reason=Yêu cầu của khách`).set(bearer(root.token));
    expect(deleted.status).toBe(204);

    const ncc = await createProvider();
    const placeId = await createPlace({ name: 'Nhà lịch', providerId: ncc.providerId });
    const roomId = await createRoomType(placeId, 'Phòng A', 400000, 2);
    await newBooking(placeId, roomId);
    const start = addDays(today(), 10);
    const homestays = await request(app).get('/api/v1/admin/room-calendar/homestays').set(bearer(root.token));
    expect(homestays.body[0]).toMatchObject({ id: placeId, name: 'Nhà lịch' });
    const cal = await request(app).get(`/api/v1/admin/room-calendar?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(root.token));
    expect(cal.body[0].rooms[0].days[0]).toEqual({ date: start, free: 1, held: 1, booked: 0, locked: 0 });
    const units = await request(app).get(`/api/v1/admin/room-calendar/homestays/${placeId}/units?startDate=${start}&endDate=${addDays(start, 2)}`).set(bearer(root.token));
    expect(units.body.rooms[0].days[0].units).toContain('HELD');
    const tooLong = await request(app).get(`/api/v1/admin/room-calendar?startDate=${start}&endDate=${addDays(start, 40)}`).set(bearer(root.token));
    expect(tooLong.status).toBe(400);
  });
});
