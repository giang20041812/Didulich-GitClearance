import { query, scalar, tx } from '../db/pool.js';
import { BOOKING_STATUSES, type ActorType, type BookingNoteKind, type BookingNoteOutcome, type BookingStatus } from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as bookings from '../repositories/bookingRepo.js';
import * as audit from './auditLogService.js';
import { attachRooms, attachRoomsTo, roomSummary, totalRooms, type BookingFull } from './bookingModel.js';
import * as stays from './bookingStayService.js';
import * as workflow from './bookingWorkflowService.js';
import type { Action } from './bookingWorkflowService.js';

/** Admin xem toàn bộ đơn đặt phòng kèm thông tin khách (chỉ đọc), và xử lý đơn / ghi nhận xác minh. */

const SORT_FIELDS: Record<string, string> = { createdAt: 'b.created_at', checkIn: 'b.check_in', totalAmount: 'b.total_amount' };

/**
 * checkedInAt / checkedOutAt: nhận / trả phòng (mốc thời gian, không phải trạng thái); trả phòng là mốc hiệu lực (quá giờ trả
 * phòng thì coi như đã trả dù job chưa ghi). *By: CUSTOMER / PROVIDER / ADMIN / SYSTEM.
 */
export interface BookingDto {
  id: number;
  bookingCode: string;
  placeId: number;
  placeName: string;
  roomTypeName: string;
  providerId: number;
  providerName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  guestNote: string | null;
  status: BookingStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  confirmedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  checkedInAt: string | null;
  checkedInBy: ActorType | null;
  checkedOutAt: string | null;
  checkedOutBy: ActorType | null;
}

type BookingWithProvider = BookingFull & { providerName: string };

const escapeLike = (v: string): string => v.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

export function toDto(b: BookingWithProvider): BookingDto {
  // Danh sách không nạp hồ sơ homestay: trả phòng hiệu lực tính theo giờ trả phòng mặc định.
  const now = nowLocal();
  return {
    id: b.id,
    bookingCode: b.bookingCode,
    placeId: b.placeId,
    placeName: b.placeName,
    roomTypeName: roomSummary(b),
    providerId: b.providerId,
    providerName: b.providerName,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    roomCount: totalRooms(b),
    guestCount: b.guestCount,
    guestName: b.guestName,
    guestPhone: b.guestPhone,
    guestEmail: b.guestEmail,
    guestNote: b.guestNote,
    status: b.status,
    totalAmount: b.totalAmount,
    currency: b.currency,
    createdAt: b.createdAt,
    confirmedAt: b.confirmedAt,
    closedAt: b.closedAt,
    closeReason: b.closeReason,
    checkedInAt: b.checkedInAt,
    checkedInBy: b.checkedInBy,
    checkedOutAt: stays.effectiveCheckedOutAtOf(b, null, now),
    checkedOutBy: stays.effectiveCheckedOutBy(b, null, now),
  };
}

async function withProvider(list: BookingFull[]): Promise<BookingWithProvider[]> {
  if (list.length === 0) return [];
  const rows = await query<{ id: number; name: string }>('SELECT id, name FROM provider WHERE id = ANY($1)', [[...new Set(list.map((b) => b.providerId))]]);
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return list.map((b) => ({ ...b, providerName: names.get(b.providerId) ?? '' }));
}

export interface SearchOptions {
  statuses?: readonly BookingStatus[] | null;
  keyword?: string | null;
  guest?: string | null;
  place?: string | null;
  placeId?: number | null;
  providerId?: number | null;
  checkInFrom?: string | null;
  checkInTo?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  sortBy?: string;
  sortDir?: string;
  page: number;
  size: number;
}

const nextDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Tìm đơn theo nhóm trạng thái (null hoặc rỗng = mọi trạng thái). */
export async function search(o: SearchOptions): Promise<PageJson<BookingDto>> {
  const where: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (o.statuses && o.statuses.length > 0) where.push(`b.status = ANY(${bind(o.statuses)})`);
  if (o.providerId != null) where.push(`b.provider_id = ${bind(o.providerId)}`);
  if (o.placeId != null) where.push(`b.place_id = ${bind(o.placeId)}`);
  const placeKw = o.place && o.place.trim() !== '' ? o.place.trim().toLowerCase() : null;
  if (placeKw) where.push(`lower(p.name) LIKE ${bind(`%${escapeLike(placeKw)}%`)} ESCAPE '\\'`);
  const guestKw = o.guest && o.guest.trim() !== '' ? o.guest.trim().toLowerCase() : null;
  if (guestKw) {
    const p = bind(`%${escapeLike(guestKw)}%`);
    where.push(`(lower(b.guest_name) LIKE ${p} ESCAPE '\\' OR lower(b.guest_email) LIKE ${p} ESCAPE '\\' OR b.guest_phone LIKE ${p} ESCAPE '\\')`);
  }
  if (o.checkInFrom) where.push(`b.check_in >= ${bind(o.checkInFrom)}`);
  if (o.checkInTo) where.push(`b.check_in <= ${bind(o.checkInTo)}`);
  if (o.createdFrom) where.push(`b.created_at >= ${bind(`${o.createdFrom}T00:00:00`)}`);
  if (o.createdTo) where.push(`b.created_at < ${bind(`${nextDay(o.createdTo)}T00:00:00`)}`);
  const kw = o.keyword && o.keyword.trim() !== '' ? o.keyword.trim().toLowerCase() : null;
  if (kw) {
    const p = bind(`%${escapeLike(kw)}%`);
    where.push(
      `(lower(b.booking_code) LIKE ${p} ESCAPE '\\' OR lower(b.guest_name) LIKE ${p} ESCAPE '\\' OR lower(b.guest_email) LIKE ${p} ESCAPE '\\'
        OR b.guest_phone LIKE ${p} ESCAPE '\\' OR lower(p.name) LIKE ${p} ESCAPE '\\' OR lower(pr.name) LIKE ${p} ESCAPE '\\')`,
    );
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sortColumn = SORT_FIELDS[o.sortBy ?? ''] ?? SORT_FIELDS.createdAt;
  const dir = (o.sortDir ?? '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(o.page, 0);
  const size = Math.min(Math.max(o.size, 1), 100);
  const from = `FROM booking b JOIN place p ON p.id = b.place_id JOIN provider pr ON pr.id = b.provider_id ${clause}`;
  const total = (await scalar<number>(`SELECT count(*) ${from}`, params)) ?? 0;
  const rows = await query<bookings.BookingWithPlace & { providerName: string }>(
    `SELECT b.*, p.name AS place_name, p.slug AS place_slug, p.kind AS place_kind, p.address AS place_address, p.latitude AS place_latitude,
            p.longitude AS place_longitude, pr.name AS provider_name ${from}
      ORDER BY ${sortColumn} ${dir}, b.id ${dir} LIMIT ${size} OFFSET ${page * size}`,
    params,
  );
  const full = await attachRooms(rows);
  const content = full.map((b, i) => toDto({ ...b, providerName: rows[i].providerName }));
  return pageOf(content, page, size, total, true);
}

/** @param providerId null = toàn hệ thống; có giá trị = chỉ đơn của nhà cung cấp đó */
export async function countByStatus(providerId?: number | null): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const s of BOOKING_STATUSES) counts[s] = 0;
  const grouped = await bookings.countGroupedByStatus(providerId ?? null);
  for (const [status, n] of Object.entries(grouped)) counts[status] = n;
  return counts;
}

/** Dùng cho các service giám sát để tái sử dụng cách map DTO. */
export async function toDtoOf(id: number): Promise<BookingDto> {
  const found = await bookings.findByIdWithPlace(id);
  if (!found) throw new IllegalArgumentError(`Không tìm thấy đơn đặt phòng với ID: ${id}`);
  const [withName] = await withProvider([await attachRoomsTo(found)]);
  return toDto(withName);
}

// ===== Giám sát đơn của Admin ======================================================================================================
// Chi tiết đầy đủ, ghi nhận xác minh / kết quả, và xử lý đơn (xác nhận / từ chối / ghi nhận thanh toán / hủy) — cùng quy trình với
// NCC qua bookingWorkflowService, mỗi thao tác ghi thêm audit log.

const MAX_NOTE_LENGTH = 2000;
/** Bằng giới hạn của bookingWorkflowService / cột lý do — báo lỗi thay vì âm thầm cắt bớt. */
const MAX_ACTION_NOTE_LENGTH = 500;

interface NoteRow {
  id: number;
  bookingId: number;
  adminAccountId: number | null;
  adminName: string | null;
  kind: BookingNoteKind;
  outcome: BookingNoteOutcome | null;
  content: string;
  createdAt: string;
}

const noteDto = (n: NoteRow) => ({ id: n.id, kind: n.kind, outcome: n.outcome, content: n.content, adminName: n.adminName, createdAt: n.createdAt });

export async function monitorDetail(id: number) {
  const found = await bookings.findByIdWithPlace(id);
  if (!found) throw new IllegalArgumentError(`Không tìm thấy đơn đặt phòng với ID: ${id}`);
  const full = await attachRoomsTo(found);
  const [withName] = await withProvider([full]);
  const history = (await bookings.historyOf(id)).map((h) => ({
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actor: h.actor ?? null,
    actorId: h.actorId,
    reason: h.reason,
    createdAt: h.createdAt,
  }));
  const payments = await query<{ id: number; gatewayName: string; externalTxnId: string | null; amount: number; currency: string; status: string; initiatedAt: string; paidAt: string | null }>(
    `SELECT pt.id, g.name AS gateway_name, pt.external_txn_id, pt.amount, pt.currency, pt.status, pt.initiated_at, pt.paid_at
       FROM payment_transaction pt JOIN payment_gateway g ON g.id = pt.gateway_id WHERE pt.booking_id = $1 ORDER BY pt.initiated_at DESC`,
    [id],
  );
  const notes = await query<NoteRow>('SELECT * FROM booking_admin_note WHERE booking_id = $1 ORDER BY created_at DESC, id DESC', [id]);
  const until = await stays.checkOutUntil(full.placeId);
  return {
    booking: toDto(withName),
    closedByActor: full.closedByActor ?? null,
    actions: workflow.allowedActions(full, until, nowLocal()),
    history,
    payments: payments.map((p) => ({
      id: p.id,
      gateway: p.gatewayName,
      externalTxnId: p.externalTxnId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      initiatedAt: p.initiatedAt,
      paidAt: p.paidAt,
    })),
    notes: notes.map(noteDto),
  };
}

/** Lý do / chứng từ bắt buộc cho các thao tác của Admin (400 nếu thiếu hoặc quá dài). */
export function requireNote(action: Action, note: string | null | undefined): void {
  const text = note == null ? '' : note.trim();
  if (text === '') {
    if (action === 'REJECT') throw new IllegalArgumentError('Vui lòng nhập lý do từ chối đơn.');
    if (action === 'CANCEL') throw new IllegalArgumentError('Vui lòng nhập lý do hủy đơn.');
    if (action === 'PAY') throw new IllegalArgumentError('Vui lòng nhập chứng từ thanh toán (cách thanh toán, mã giao dịch).');
    return;
  }
  if (text.length > MAX_ACTION_NOTE_LENGTH) throw new IllegalArgumentError(`Lý do / chứng từ tối đa ${MAX_ACTION_NOTE_LENGTH} ký tự.`);
}

/**
 * Admin xử lý đơn (mọi đơn trong hệ thống); trả chi tiết mới nhất. `note` bắt buộc khi từ chối / hủy (lý do, khách thấy) và khi
 * ghi nhận thanh toán (chứng từ — lưu ở lịch sử đơn và audit log, không gửi cho khách / NCC); xác nhận và nhận phòng thì không bắt buộc.
 */
export function act(bookingId: number, action: Action, note: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    requireNote(action, note);
    const booking = await workflow.apply(bookingId, () => true, action, { type: 'ADMIN', accountId: adminAccountId }, note);
    const after: Record<string, unknown> = { bookingCode: booking.bookingCode, status: booking.status };
    if (action === 'CHECK_IN') after.checkedInAt = String(booking.checkedInAt);
    await audit.record(adminAccountId, `BOOKING_${action}`, 'Booking', booking.id, note == null || note.trim() === '' ? null : note.trim(), null, after);
    return monitorDetail(bookingId);
  });
}

/** Ghi nhận thông tin xác minh (FR-AD-09) hoặc kết quả giám sát (FR-AD-10). */
export function addNote(bookingId: number, kind: BookingNoteKind | null | undefined, outcome: BookingNoteOutcome | null | undefined, content: string | null | undefined, adminAccountId: number | null) {
  return tx(async () => {
    const booking = await bookings.findById(bookingId);
    if (!booking) throw new IllegalArgumentError(`Không tìm thấy đơn đặt phòng với ID: ${bookingId}`);
    if (!kind) throw new IllegalArgumentError('Vui lòng chọn loại ghi nhận.');
    const text = content == null ? '' : content.trim();
    if (text === '') throw new IllegalArgumentError('Nội dung ghi nhận không được để trống.');
    if (text.length > MAX_NOTE_LENGTH) throw new IllegalArgumentError(`Nội dung tối đa ${MAX_NOTE_LENGTH} ký tự.`);
    if (kind === 'OUTCOME' && !outcome) throw new IllegalArgumentError('Vui lòng chọn hướng xử lý khi ghi nhận kết quả.');
    const finalOutcome = kind === 'VERIFICATION' ? null : (outcome ?? null);
    const adminName = adminAccountId == null ? null : ((await accounts.findById(adminAccountId))?.fullName ?? null);
    const [saved] = await query<NoteRow>(
      `INSERT INTO booking_admin_note (booking_id, admin_account_id, admin_name, kind, outcome, content, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [bookingId, adminAccountId, adminName, kind, finalOutcome, text, nowLocal()],
    );
    const after: Record<string, unknown> = { bookingCode: booking.bookingCode, kind };
    if (finalOutcome) after.outcome = finalOutcome;
    await audit.record(adminAccountId, kind === 'OUTCOME' ? 'BOOKING_MONITOR_OUTCOME' : 'BOOKING_MONITOR_VERIFICATION', 'Booking', booking.id, text, null, after);
    return noteDto(saved);
  });
}

