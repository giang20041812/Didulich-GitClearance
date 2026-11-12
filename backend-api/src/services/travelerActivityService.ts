import { HttpError } from '../lib/errors.js';
import { currentIp } from '../lib/requestContext.js';
import { pageOf } from '../lib/page.js';
import { plusMinutes, nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as auditRepo from '../repositories/auditLogRepo.js';
import type { AuditLogRow } from '../repositories/auditLogRepo.js';
import * as places from '../repositories/placeRepo.js';
import * as audit from './auditLogService.js';

/** Lịch sử tư vấn dùng nhật ký đã có, lọc theo cả vai trò CUSTOMER và ID để tránh trùng ID Admin/NCC. */

export const HOMESTAY_VIEW = 'HOMESTAY_VIEW';
const LOGIN = 'LOGIN_SUCCESS';

/** OffsetDateTime +07:00 từ LocalDateTime giờ Việt Nam. */
const withOffset = (local: string) => (local.length === 19 ? `${local}+07:00` : `${local}+07:00`);

function toDto(log: AuditLogRow) {
  const view = log.action === HOMESTAY_VIEW;
  const details = log.afterData ?? {};
  const method = details.method == null ? 'EMAIL' : String(details.method);
  return {
    id: log.id,
    type: view ? HOMESTAY_VIEW : 'LOGIN',
    loginMethod: view ? null : method,
    placeId: view ? log.entityId : null,
    placeName: view ? String(details.placeName ?? 'Homestay') : null,
    occurredAt: withOffset(log.createdAt),
  };
}

export async function history(travelerId: number, type: string | null | undefined, page: number, size: number) {
  if (!(await accounts.findById(travelerId))) throw new HttpError(404, 'Không tìm thấy khách du lịch.');
  let actions: string[];
  switch (type ?? 'ALL') {
    case 'ALL':
      actions = [LOGIN, HOMESTAY_VIEW];
      break;
    case 'LOGIN':
      actions = [LOGIN];
      break;
    case HOMESTAY_VIEW:
      actions = [HOMESTAY_VIEW];
      break;
    default:
      throw new HttpError(400, 'Bộ lọc lịch sử không hợp lệ.');
  }
  const p = Math.max(0, page);
  const s = Math.min(50, Math.max(1, size));
  const { rows, total } = await auditRepo.pageByActorActions('CUSTOMER', travelerId, actions, audit.RESULT_SUCCESS, s, p * s);
  return pageOf(rows.map(toDto), p, s, total);
}

/** Người nhận lấy từ JWT; tên homestay lấy từ DB, không nhận tên/ID khách do trình duyệt tự khai. */
export async function recordHomestayView(identifier: string, placeId: number): Promise<void> {
  const traveler = await accounts.findByIdentifier(identifier);
  if (!traveler || traveler.status !== 'ACTIVE') throw new HttpError(403, 'Tài khoản khách không hoạt động.');
  const place = await places.findById(placeId);
  if (!place || place.kind !== 'HOMESTAY' || place.visibility !== 'PUBLISHED' || place.isDeleted) {
    throw new HttpError(404, 'Không tìm thấy homestay công khai.');
  }
  // Tránh nhiều bản ghi khi render lại hoặc tải lại cùng trang trong một phút.
  if (await auditRepo.existsSince('CUSTOMER', traveler.id, HOMESTAY_VIEW, 'Place', placeId, plusMinutes(nowLocal(), -1))) return;
  await audit.recordEvent('CUSTOMER', traveler.id, HOMESTAY_VIEW, 'Place', placeId, audit.RESULT_SUCCESS, currentIp(), null, {
    placeId,
    placeName: place.name,
  });
}
