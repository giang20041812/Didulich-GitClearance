import { exec, one, query, scalar } from '../db/pool.js';
import { camelizeKeys, insertRow, updateRow } from '../db/sql.js';
import type { AccountRole, AccountStatus } from '../domain/enums.js';
import type { ProviderRow } from './providerRepo.js';
import { IllegalStateError } from '../lib/errors.js';

export interface AccountRow {
  id: number;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: AccountRole;
  status: AccountStatus;
  adminLevel: number | null;
  providerId: number | null;
  emailVerifiedAt: string | null;
  tokenVersion: number;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface AccountWithProvider extends AccountRow {
  provider: ProviderRow | null;
}

/** Cấp quản trị hiệu lực: không phải ADMIN → null; ADMIN thiếu cấp → cấp thấp nhất (3). */
export function effectiveAdminLevel(a: Pick<AccountRow, 'role' | 'adminLevel'>): number | null {
  if (a.role !== 'ADMIN') return null;
  return a.adminLevel == null ? 3 : a.adminLevel;
}

/** Tài khoản cổng Admin / NCC (khác với tài khoản chỉ là khách du lịch). */
export function isPortalAccount(a: Pick<AccountRow, 'role'>): boolean {
  return a.role === 'ADMIN' || a.role === 'PROVIDER';
}

/** Định danh đăng nhập ghi trong JWT: email nếu có, không thì SĐT. */
export function identifierOf(a: Pick<AccountRow, 'email' | 'phone'>): string {
  return (a.email ?? a.phone) as string;
}

const WITH_PROVIDER = `SELECT a.*, to_jsonb(p) AS provider_json FROM account a LEFT JOIN provider p ON p.id = a.provider_id`;

function mapWithProvider(row: any): AccountWithProvider {
  const { providerJson, ...account } = row;
  return { ...account, provider: providerJson ? camelizeKeys<ProviderRow>(providerJson) : null } as AccountWithProvider;
}

/** Tìm theo email (không phân biệt hoa/thường) hoặc SĐT, kèm provider. */
export async function findByIdentifier(identifier: string): Promise<AccountWithProvider | null> {
  const rows = await query(`${WITH_PROVIDER} WHERE lower(a.email) = lower($1) OR a.phone = $1`, [identifier]);
  if (rows.length > 1) throw new IllegalStateError('Định danh khớp nhiều tài khoản.');
  return rows.length ? mapWithProvider(rows[0]) : null;
}

export interface SessionLookup {
  account: AccountWithProvider;
  sessionActive: boolean;
}

/** Như findByIdentifier nhưng kèm "thiết bị (sessionKey) này còn phiên đăng nhập không" trong CÙNG một câu SQL. */
export async function findByIdentifierWithSession(identifier: string, sessionKey: string): Promise<SessionLookup | null> {
  const rows = await query(
    `SELECT a.*, to_jsonb(p) AS provider_json,
            (SELECT count(*) FROM account_session s WHERE s.account_id = a.id AND s.session_key = $2) AS session_count
       FROM account a LEFT JOIN provider p ON p.id = a.provider_id
      WHERE lower(a.email) = lower($1) OR a.phone = $1`,
    [identifier, sessionKey],
  );
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new IllegalStateError('Định danh khớp nhiều tài khoản.');
  const { sessionCount, ...rest } = rows[0] as any;
  return { account: mapWithProvider(rest), sessionActive: Number(sessionCount) > 0 };
}

export async function findById(id: number): Promise<AccountWithProvider | null> {
  const rows = await query(`${WITH_PROVIDER} WHERE a.id = $1`, [id]);
  return rows.length ? mapWithProvider(rows[0]) : null;
}

/** Khóa ghi (FOR UPDATE) khi Admin đổi trạng thái/quyền — chống double-submit. Phải gọi trong transaction. */
export async function findByIdForUpdate(id: number): Promise<AccountWithProvider | null> {
  const locked = await scalar<number>('SELECT id FROM account WHERE id = $1 FOR UPDATE', [id]);
  if (locked == null) return null;
  return findById(id);
}

export async function findByEmailIgnoreCase(email: string): Promise<AccountWithProvider | null> {
  const rows = await query(`${WITH_PROVIDER} WHERE lower(a.email) = lower($1)`, [email]);
  return rows.length ? mapWithProvider(rows[0]) : null;
}

export async function findByPhone(phone: string): Promise<AccountWithProvider | null> {
  const rows = await query(`${WITH_PROVIDER} WHERE a.phone = $1`, [phone]);
  return rows.length ? mapWithProvider(rows[0]) : null;
}

export async function findByProviderId(providerId: number): Promise<AccountRow[]> {
  return query<AccountRow>('SELECT * FROM account WHERE provider_id = $1 ORDER BY id ASC', [providerId]);
}

export async function findFirstByProviderId(providerId: number): Promise<AccountRow | null> {
  return one<AccountRow>('SELECT * FROM account WHERE provider_id = $1 ORDER BY id ASC LIMIT 1', [providerId]);
}

/** Ghi nhận hoạt động của phiên mà không nạp/ghi lại toàn bộ dòng. */
export async function touchActivity(id: number, at: string): Promise<void> {
  await exec('UPDATE account SET last_activity_at = $2 WHERE id = $1', [id, at]);
}

/** Trùng email KHÔNG phân biệt hoa/thường và bỏ khoảng trắng đầu/cuối. */
export async function existsByEmail(email: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM account WHERE lower(email) = lower(trim($1))', [email])) === true;
}

export async function existsByPhone(phone: string): Promise<boolean> {
  return (await scalar<boolean>('SELECT count(*) > 0 FROM account WHERE phone = $1', [phone])) === true;
}

export async function countByStatus(status: AccountStatus): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE status = $1', [status])) ?? 0;
}

export async function countByRole(role: AccountRole): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE role = $1', [role])) ?? 0;
}

export async function countByRoleAndStatus(role: AccountRole, status: AccountStatus): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE role = $1 AND status = $2', [role, status])) ?? 0;
}

export async function countByRoleIn(roles: AccountRole[]): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE role = ANY($1)', [roles])) ?? 0;
}

export async function countByRoleInAndStatus(roles: AccountRole[], status: AccountStatus): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE role = ANY($1) AND status = $2', [roles, status])) ?? 0;
}

export async function countByRoleCreatedSince(role: AccountRole, since: string): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM account WHERE role = $1 AND created_at >= $2', [role, since])) ?? 0;
}

/** Số quản trị viên cấp 1 đang hoạt động (ADMIN chưa gán cấp được coi là cấp 1). */
export async function countActiveLevelOneAdmins(): Promise<number> {
  return (
    (await scalar<number>(
      `SELECT count(*) FROM account WHERE role = 'ADMIN' AND status = 'ACTIVE' AND (admin_level IS NULL OR admin_level = 1)`,
    )) ?? 0
  );
}

/** Tài khoản seed chưa được đặt mật khẩu (xem SEED_PENDING_HASH). */
export async function findAllByPasswordHash(hash: string): Promise<AccountRow[]> {
  return query<AccountRow>('SELECT * FROM account WHERE password_hash = $1', [hash]);
}

export async function insert(data: Partial<Omit<AccountRow, 'id'>> & { role: AccountRole; createdAt: string }): Promise<AccountRow> {
  return insertRow<AccountRow>('account', { status: 'ACTIVE', tokenVersion: 0, ...data });
}

export async function update(id: number, patch: Partial<Omit<AccountRow, 'id'>>): Promise<AccountRow | null> {
  return updateRow<AccountRow>('account', id, patch);
}

// ---- Phiên thiết bị -------------------------------------------------------------------------------------------------

export async function insertSession(accountId: number, sessionKey: string, tokenVersion: number, createdAt: string): Promise<void> {
  await exec('INSERT INTO account_session (account_id, session_key, token_version, created_at) VALUES ($1, $2, $3, $4)', [
    accountId,
    sessionKey,
    tokenVersion,
    createdAt,
  ]);
}

export async function sessionExists(accountId: number, sessionKey: string): Promise<boolean> {
  return (
    (await scalar<boolean>('SELECT count(*) > 0 FROM account_session WHERE account_id = $1 AND session_key = $2', [
      accountId,
      sessionKey,
    ])) === true
  );
}

/** Đăng xuất một thiết bị. */
export async function deleteSession(accountId: number, sessionKey: string): Promise<number> {
  return exec('DELETE FROM account_session WHERE account_id = $1 AND session_key = $2', [accountId, sessionKey]);
}

/** Dọn phiên của phiên bản token cũ (đã bị thu hồi hàng loạt). */
export async function deleteStaleSessions(accountId: number, tokenVersion: number): Promise<number> {
  return exec('DELETE FROM account_session WHERE account_id = $1 AND token_version <> $2', [accountId, tokenVersion]);
}

export async function deleteAllSessions(accountId: number): Promise<number> {
  return exec('DELETE FROM account_session WHERE account_id = $1', [accountId]);
}
