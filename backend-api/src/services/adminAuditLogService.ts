import { query, scalar } from '../db/pool.js';
import { Where, escapeLike } from '../db/sql.js';
import type { ActorType } from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import * as auditRepo from '../repositories/auditLogRepo.js';
import type { AuditLogRow } from '../repositories/auditLogRepo.js';

/**
 * FR-AD-17: tra cứu Audit Log theo thời gian, người thao tác, loại đối tượng, hành động, kết quả, mã đối tượng và xem chi tiết ở
 * chế độ chỉ đọc. Không có thao tác ghi/sửa/xóa.
 */

const MAX_PAGE_SIZE = 100;
/** Kết quả mặc định cho bản ghi cũ chưa có cột result. */
const LEGACY_RESULT = 'SUCCESS';

export interface AuditLogDto {
  id: number;
  actor: ActorType;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  result: string;
  ip: string | null;
  reason: string | null;
  /** Chỉ có ở API chi tiết. */
  beforeData: Record<string, unknown> | null;
  /** Chỉ có ở API chi tiết. */
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

const normalize = (value: string | null | undefined): string | null => (value == null || value.trim() === '' ? null : value.trim().toUpperCase());

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface AuditSearch {
  from?: string;
  to?: string;
  actor?: ActorType;
  actorId?: number;
  action?: string;
  entityType?: string;
  entityId?: number;
  result?: string;
  /** Tìm nhanh theo mã hành động, loại đối tượng, lý do, tên/email người thao tác, hoặc mã đối tượng khi là số. */
  keyword?: string;
  /** Mã hành động bổ sung để khớp keyword (giao diện tra nhãn tiếng Việt → mã hành động). */
  actionCodes?: string[];
  page: number;
  size: number;
}

export async function search(o: AuditSearch): Promise<PageJson<AuditLogDto>> {
  if (o.from && o.to && o.to < o.from) {
    throw new IllegalArgumentError('Khoảng thời gian không hợp lệ: ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  }
  const actionFilter = normalize(o.action);
  const entityFilter = normalize(o.entityType);
  const resultFilter = normalize(o.result);
  const kw = o.keyword && o.keyword.trim() !== '' ? o.keyword.trim().toLowerCase() : null;
  const codes = (o.actionCodes ?? []).map(normalize).filter((c): c is string => c != null).slice(0, 50);
  const where = new Where();
  if (kw) {
    const like = `%${escapeLike(kw)}%`;
    const any: string[] = [
      `lower(l.action) LIKE ${where.add(like)} ESCAPE '\'`,
      `lower(l.entity_type) LIKE ${where.add(like)} ESCAPE '\'`,
      `lower(l.reason) LIKE ${where.add(like)} ESCAPE '\'`,
    ];
    if (/^\d{1,18}$/.test(kw)) any.push(`l.entity_id = ${where.add(Number(kw))}`);
    if (codes.length > 0) any.push(`upper(l.action) = ANY(${where.add(codes)})`);
    // Tên/email người thao tác (Admin, NCC hay khách đều là tài khoản trong bảng account).
    const byAccount = `l.actor <> 'SYSTEM' AND l.actor_id IN (SELECT a.id FROM account a WHERE lower(a.full_name) LIKE ${where.add(like)} ESCAPE '\' OR lower(a.email) LIKE ${where.add(like)} ESCAPE '\')`;
    any.push(`(${byAccount})`);
    where.and(`(${any.join(' OR ')})`);
  }
  if (o.from) where.and('l.created_at >= ?', `${o.from}T00:00:00`);
  if (o.to) where.and('l.created_at < ?', `${nextDay(o.to)}T00:00:00`);
  if (o.actor) where.and('l.actor = ?', o.actor);
  if (o.actorId != null) where.and('l.actor_id = ?', o.actorId);
  if (actionFilter) where.and('upper(l.action) = ?', actionFilter);
  if (entityFilter) where.and('upper(l.entity_type) = ?', entityFilter);
  if (o.entityId != null) where.and('l.entity_id = ?', o.entityId);
  if (resultFilter) {
    // Bản ghi cũ (trước khi có cột result) chưa có kết quả: đó đều là thao tác đã thực hiện thành công.
    if (resultFilter === LEGACY_RESULT) where.and('(upper(l.result) = ? OR l.result IS NULL)', resultFilter);
    else where.and('upper(l.result) = ?', resultFilter);
  }
  const page = Math.max(o.page, 0);
  const size = Math.min(Math.max(o.size, 1), MAX_PAGE_SIZE);
  const total = (await scalar<number>(`SELECT count(*) FROM audit_log l ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<AuditLogRow>(
    `SELECT l.* FROM audit_log l ${where.toSql()} ORDER BY l.created_at DESC, l.id DESC LIMIT ${size} OFFSET ${page * size}`,
    where.params,
  );
  const names = await actorNames(rows);
  // Danh sách không trả before/after (có thể chứa dữ liệu cá nhân); xem ở API chi tiết.
  return pageOf(rows.map((r) => toDto(r, names, false)), page, size, total, true);
}

export async function detail(id: number): Promise<AuditLogDto> {
  const log = await auditRepo.findById(id);
  if (!log) throw new IllegalArgumentError(`Không tìm thấy bản ghi Audit Log với ID: ${id}`);
  return toDto(log, await actorNames([log]), true);
}

/** Tên người thao tác (mọi loại người thao tác đều là tài khoản trong bảng account) theo actorId. */
async function actorNames(logs: AuditLogRow[]): Promise<Map<number, string | null>> {
  const ids = [...new Set(logs.filter((l) => l.actorId != null && l.actor !== 'SYSTEM').map((l) => l.actorId as number))];
  const names = new Map<number, string | null>();
  if (ids.length > 0) {
    for (const a of await query<{ id: number; fullName: string | null }>('SELECT id, full_name FROM account WHERE id = ANY($1)', [ids])) names.set(a.id, a.fullName);
  }
  return names;
}

function toDto(l: AuditLogRow, names: Map<number, string | null>, withData: boolean): AuditLogDto {
  return {
    id: l.id,
    actor: l.actor,
    actorId: l.actorId,
    actorName: l.actor === 'SYSTEM' || l.actorId == null ? null : (names.get(l.actorId) ?? null),
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    result: l.result ?? LEGACY_RESULT,
    ip: l.ip,
    reason: l.reason,
    beforeData: withData ? l.beforeData : null,
    afterData: withData ? l.afterData : null,
    createdAt: l.createdAt,
  };
}
