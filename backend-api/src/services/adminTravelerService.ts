import { query, scalar, tx } from '../db/pool.js';
import { Where, escapeLike } from '../db/sql.js';
import type { AccountStatus } from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import * as audit from './auditLogService.js';

/** Admin quản lý tài khoản khách du lịch (tài khoản vai trò TRAVELER). */

const SORT_FIELDS: Record<string, string> = { createdAt: 'created_at', lastLoginAt: 'last_login_at', fullName: 'full_name', email: 'email' };

export interface TravelerDto {
  id: number;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  pictureUrl: string | null;
  status: AccountStatus;
  signupMethod: 'GOOGLE' | 'EMAIL';
  lastLoginAt: string | null;
  createdAt: string;
}

const toDto = (t: accounts.AccountRow): TravelerDto => ({
  id: t.id,
  email: t.email,
  phone: t.phone,
  fullName: t.fullName,
  pictureUrl: t.avatarUrl,
  status: t.status,
  signupMethod: t.passwordHash == null ? 'GOOGLE' : 'EMAIL',
  lastLoginAt: t.lastLoginAt,
  createdAt: t.createdAt,
});

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** @param signupMethod GOOGLE (chưa đặt mật khẩu) hoặc EMAIL (có mật khẩu) */
export async function search(
  status: AccountStatus | undefined,
  keyword: string | undefined,
  signupMethod: string | undefined,
  createdFrom: string | undefined,
  createdTo: string | undefined,
  sortBy: string,
  sortDir: string,
  page: number,
  size: number,
): Promise<PageJson<TravelerDto>> {
  const kw = keyword && keyword.trim() !== '' ? keyword.trim().toLowerCase() : null;
  const column = SORT_FIELDS[sortBy] ?? SORT_FIELDS.createdAt;
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const where = new Where();
  where.and(`role = 'TRAVELER'`);
  if (status) where.and('status = ?', status);
  if (signupMethod?.toUpperCase() === 'GOOGLE') where.and('password_hash IS NULL');
  if (signupMethod?.toUpperCase() === 'EMAIL') where.and('password_hash IS NOT NULL');
  if (kw) {
    const like = `%${escapeLike(kw)}%`;
    where.and(`(lower(full_name) LIKE ? ESCAPE '\\' OR lower(email) LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')`, like, like, like);
  }
  if (createdFrom) where.and('created_at >= ?', `${createdFrom}T00:00:00`);
  if (createdTo) where.and('created_at < ?', `${nextDay(createdTo)}T00:00:00`);
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), 100);
  const total = (await scalar<number>(`SELECT count(*) FROM account ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<accounts.AccountRow>(`SELECT * FROM account ${where.toSql()} ORDER BY ${column} ${dir}, id ${dir} LIMIT ${s} OFFSET ${p * s}`, where.params);
  return pageOf(rows.map(toDto), p, s, total, true);
}

/** Admin tạo tài khoản khách (đăng nhập bằng email + mật khẩu) cho người chưa có tài khoản. */
export function create(
  fullName: string | undefined,
  email: string | undefined,
  phone: string | undefined,
  password: string | undefined,
  callerAccountId: number | null,
): Promise<TravelerDto> {
  return tx(async () => {
    const name = fullName == null ? '' : fullName.trim();
    const mail = email == null ? '' : email.trim().toLowerCase();
    const tel = phone == null || phone.trim() === '' ? null : phone.trim();
    if (name === '') throw new IllegalArgumentError('Họ tên không được để trống.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new IllegalArgumentError('Email không đúng định dạng.');
    if (password == null || password.length < 6) throw new IllegalArgumentError('Mật khẩu tối thiểu 6 ký tự.');
    if (await accounts.existsByEmail(mail)) throw new IllegalArgumentError(`Email ${mail} đã có tài khoản.`);
    if (tel != null && (await accounts.existsByPhone(tel))) throw new IllegalArgumentError(`Số điện thoại ${tel} đã có tài khoản.`);
    const saved = await accounts.insert({
      fullName: name,
      email: mail,
      phone: tel,
      passwordHash: await passwords.encode(password),
      role: 'TRAVELER',
      status: 'ACTIVE',
      createdAt: nowLocal(),
    });
    await audit.record(callerAccountId, 'CREATE_TRAVELER', 'Traveler', saved.id, `Admin tạo tài khoản khách: ${mail}`, null, { email: mail, fullName: name });
    return toDto(saved);
  });
}

export function updateStatus(id: number, status: AccountStatus, reason: string | undefined, callerAccountId: number | null): Promise<TravelerDto> {
  return tx(async () => {
    const traveler = await accounts.findById(id);
    if (!traveler || traveler.role !== 'TRAVELER') throw new IllegalArgumentError(`Không tìm thấy khách với ID: ${id}`);
    if (status !== 'ACTIVE' && (reason == null || reason.trim() === '')) throw new IllegalArgumentError('Vui lòng nhập lý do khi khóa tài khoản.');
    const old = traveler.status;
    await accounts.update(id, { status, ...(old !== status ? { tokenVersion: traveler.tokenVersion + 1 } : {}) });
    const saved = (await accounts.findById(id))!;
    await audit.record(callerAccountId, 'UPDATE_TRAVELER_STATUS', 'Traveler', saved.id, reason != null && reason.trim() !== '' ? reason : 'Mở khóa tài khoản khách', { status: old }, { status: saved.status });
    return toDto(saved);
  });
}
