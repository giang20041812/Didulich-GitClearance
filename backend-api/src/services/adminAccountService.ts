import { exec, query, scalar, tx } from '../db/pool.js';
import { Where, camelizeKeys, escapeLike } from '../db/sql.js';
import type { AccountRole, AccountStatus, ProviderStatus } from '../domain/enums.js';
import { HttpError, IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal, today } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as providers from '../repositories/providerRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import { LOWEST_ADMIN_LEVEL } from '../security/principal.js';
import * as audit from './auditLogService.js';
import * as bookingImpact from './bookingImpactService.js';

export interface AccountDto {
  id: number | null;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: AccountRole;
  /** Cấp quản trị 1..3 (chỉ ADMIN; null với tài khoản khác). */
  adminLevel: number | null;
  status: AccountStatus;
  providerId: number | null;
  providerName: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface CreateAdminAccountInput {
  email: string;
  phone: string;
  password: string;
  fullName: string;
  adminLevel?: number | null;
}

export interface UpdateAccountInput {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
}

const notFound = (id: number) => new IllegalArgumentError(`Không tìm thấy tài khoản với ID: ${id}`);

const SORT_FIELDS: Record<string, string> = { createdAt: 'a.created_at', lastLoginAt: 'a.last_login_at', fullName: 'a.full_name', email: 'a.email' };

function toDto(a: accounts.AccountWithProvider): AccountDto {
  return {
    id: a.id,
    email: a.email,
    phone: a.phone,
    fullName: a.fullName,
    role: a.role,
    adminLevel: accounts.effectiveAdminLevel(a),
    status: a.status,
    providerId: a.provider ? a.provider.id : null,
    providerName: a.provider ? a.provider.name : null,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Màn "Tài khoản" quản lý tài khoản cổng (Admin / NCC); khách du lịch có màn riêng (adminTravelerService). */
export async function getAccounts(
  role: AccountRole | undefined,
  status: AccountStatus | undefined,
  keyword: string | undefined,
  providerStatus: ProviderStatus | undefined,
  createdFrom: string | undefined,
  createdTo: string | undefined,
  sortBy: string,
  sortDir: string,
  page: number,
  size: number,
): Promise<PageJson<AccountDto>> {
  const kw = keyword && keyword.trim() !== '' ? keyword.trim().toLowerCase() : null;
  const sortColumn = SORT_FIELDS[sortBy] ?? SORT_FIELDS.createdAt;
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), 100);
  const where = new Where();
  if (role) where.and('a.role = ?', role);
  else where.and(`a.role IN ('ADMIN', 'PROVIDER')`);
  if (status) where.and('a.status = ?', status);
  if (providerStatus) where.and('pr.status = ?', providerStatus);
  if (kw) {
    const like = `%${escapeLike(kw)}%`;
    where.and(`(lower(a.full_name) LIKE ? ESCAPE '\\' OR lower(a.email) LIKE ? ESCAPE '\\' OR a.phone LIKE ? ESCAPE '\\')`, like, like, like);
  }
  if (createdFrom) where.and('a.created_at >= ?', `${createdFrom}T00:00:00`);
  if (createdTo) where.and('a.created_at < ?', `${nextDay(createdTo)}T00:00:00`);
  const from = `FROM account a LEFT JOIN provider pr ON pr.id = a.provider_id ${where.toSql()}`;
  const total = (await scalar<number>(`SELECT count(*) ${from}`, where.params)) ?? 0;
  const rows = await query<accounts.AccountRow & { providerJson: any }>(
    `SELECT a.*, to_jsonb(pr) AS provider_json ${from} ORDER BY ${sortColumn} ${dir}, a.id ${dir} LIMIT ${s} OFFSET ${p * s}`,
    where.params,
  );
  const content = rows.map((r) => {
    const { providerJson, ...account } = r;
    return toDto({ ...account, provider: providerJson ? camelizeKeys<providers.ProviderRow>(providerJson) : null });
  });
  return pageOf(content, p, s, total, true);
}

export async function getAccountById(id: number): Promise<AccountDto> {
  const account = await accounts.findById(id);
  if (!account) throw notFound(id);
  return toDto(account);
}

const validLevel = (level: number | null | undefined): number => {
  if (level == null || level < 1 || level > LOWEST_ADMIN_LEVEL) {
    throw new IllegalArgumentError(`Cấp quản trị không hợp lệ (chỉ từ 1 đến ${LOWEST_ADMIN_LEVEL}).`);
  }
  return level;
};

function requireReason(reason: string | null | undefined, message: string): string {
  if (reason == null || reason.trim() === '') throw new IllegalArgumentError(message);
  return reason.trim();
}

/**
 * Cấp 2 không được khóa/mở khóa hay đặt lại mật khẩu của tài khoản Admin (tránh leo thang đặc quyền). Không xác định được người
 * gọi hoặc cấp của họ thì từ chối — không bao giờ mặc định là cấp 1.
 */
async function requireLevelOneForAdminTarget(target: accounts.AccountRow, callerAccountId: number | null): Promise<void> {
  if (target.role !== 'ADMIN') return;
  const caller = callerAccountId == null ? null : await accounts.findById(callerAccountId);
  const level = caller ? accounts.effectiveAdminLevel(caller) : null;
  if (level !== 1) throw new HttpError(403, 'Chỉ quản trị viên cấp 1 mới được thao tác trên tài khoản quản trị viên.');
}

export function createAdminAccount(request: CreateAdminAccountInput, callerAccountId: number | null): Promise<AccountDto> {
  return tx(async () => {
    if (await accounts.existsByEmail(request.email)) throw new IllegalArgumentError(`Email ${request.email} đã được sử dụng`);
    if (request.phone && request.phone.trim() !== '' && (await accounts.existsByPhone(request.phone.trim()))) {
      throw new IllegalArgumentError(`Số điện thoại ${request.phone} đã được sử dụng`);
    }
    const encoded = await passwords.encode(request.password);
    // Không nêu cấp thì cấp thấp nhất (ít quyền nhất): cấp cao phải được gán chủ động.
    const level = request.adminLevel == null ? LOWEST_ADMIN_LEVEL : validLevel(request.adminLevel);
    const saved = await accounts.insert({
      email: request.email.trim().toLowerCase(),
      phone: request.phone != null ? request.phone.trim() : null,
      passwordHash: encoded,
      fullName: request.fullName.trim(),
      role: 'ADMIN',
      adminLevel: level,
      status: 'ACTIVE',
      createdAt: nowLocal(),
    });
    await audit.record(callerAccountId, 'CREATE_ADMIN_ACCOUNT', 'Account', saved.id, `Tạo tài khoản quản trị viên mới: ${saved.email} (cấp ${level})`, null, {
      email: saved.email,
      fullName: saved.fullName,
      role: saved.role,
      adminLevel: level,
    });
    return toDto((await accounts.findById(saved.id))!);
  });
}

export function updateAccount(id: number, request: UpdateAccountInput, callerAccountId: number | null): Promise<AccountDto> {
  return tx(async () => {
    const account = await accounts.findById(id);
    if (!account) throw notFound(id);
    const before = { email: account.email ?? '', phone: account.phone ?? '', fullName: account.fullName ?? '' };
    const patch: Partial<accounts.AccountRow> = {};
    let identifierChanged = false;
    if (request.email != null && request.email.trim() !== '') {
      const email = request.email.trim().toLowerCase();
      // So không phân biệt hoa/thường: existsByEmail cũng vậy, nên chính tài khoản này không bị tính là "trùng".
      if (email.toLowerCase() !== (account.email ?? '').toLowerCase() && (await accounts.existsByEmail(email))) {
        throw new IllegalArgumentError(`Email ${email} đã được sử dụng`);
      }
      identifierChanged ||= email !== account.email;
      patch.email = email;
    }
    if (request.phone != null && request.phone.trim() !== '') {
      const phone = request.phone.trim();
      if (phone !== account.phone && (await accounts.existsByPhone(phone))) throw new IllegalArgumentError(`Số điện thoại ${phone} đã được sử dụng`);
      identifierChanged ||= phone !== account.phone;
      patch.phone = phone;
    }
    // NFR-SEC-03: JWT mang email/SĐT làm định danh. Đổi định danh thì thu hồi mọi phiên đang có.
    if (identifierChanged) patch.tokenVersion = account.tokenVersion + 1;
    if (request.fullName != null && request.fullName.trim() !== '') patch.fullName = request.fullName.trim();
    await accounts.update(id, patch);
    const saved = (await accounts.findById(id))!;
    await audit.record(callerAccountId, 'UPDATE_ACCOUNT', 'Account', saved.id, 'Cập nhật thông tin tài khoản', before, {
      email: saved.email ?? '',
      phone: saved.phone ?? '',
      fullName: saved.fullName ?? '',
    });
    return toDto(saved);
  });
}

export function updateAccountStatus(id: number, request: { status: AccountStatus; reason?: string | null }, callerAccountId: number | null): Promise<AccountDto> {
  return tx(async () => {
    // Khóa ghi ngay khi đọc: 2 request đổi trạng thái cùng tài khoản phải xử lý tuần tự (double-submit).
    const account = await accounts.findByIdForUpdate(id);
    if (!account) throw notFound(id);
    await requireLevelOneForAdminTarget(account, callerAccountId);
    // BV-08: chặn không thể tự khoá chính tài khoản đang đăng nhập.
    if (callerAccountId === id && request.status === 'INACTIVE') throw new IllegalStateError('Bạn không thể tự vô hiệu hoá tài khoản của chính mình');
    if (request.status === 'INACTIVE' && (request.reason == null || request.reason.trim() === '')) {
      throw new IllegalArgumentError('Vui lòng nhập lý do khi khóa tài khoản.');
    }
    const oldStatus = account.status;
    const changed = oldStatus !== request.status;
    // NFR-SEC-03: đổi trạng thái là vô hiệu hóa mọi phiên đang có; giữ nguyên trạng thái thì không thu hồi / không chạy lại hệ quả.
    await accounts.update(id, { status: request.status, ...(changed ? { tokenVersion: account.tokenVersion + 1 } : {}) });
    const saved = (await accounts.findById(id))!;
    // ACC-BR-08/09: khóa tài khoản đăng nhập của NCC (ACTIVE → INACTIVE) hủy các Booking của NCC và giải phóng phòng đang giữ.
    let cancelledBookings = 0;
    if (changed && saved.role === 'PROVIDER' && saved.status === 'INACTIVE' && saved.provider) {
      cancelledBookings = await bookingImpact.cancelForProvider(saved.provider.id, `Tài khoản nhà cung cấp bị khóa: ${request.reason!.trim()}`, today());
    }
    const after: Record<string, unknown> = { status: saved.status };
    if (cancelledBookings > 0) after.cancelledPendingBookings = cancelledBookings;
    await audit.record(callerAccountId, 'UPDATE_ACCOUNT_STATUS', 'Account', saved.id, request.reason ?? 'Thay đổi trạng thái tài khoản', { status: oldStatus }, after);
    return toDto(saved);
  });
}

/**
 * FR-AD-05: đổi quyền ADMIN ⇄ PROVIDER, có hiệu lực ngay (phiên cũ bị thu hồi), bắt buộc lý do và ghi audit. Không tự đổi quyền
 * của chính mình, không hạ quyền Admin đang hoạt động cuối cùng.
 */
export function updateAccountRole(
  id: number,
  request: { role: AccountRole; providerId?: number | null; reason: string },
  callerAccountId: number | null,
): Promise<AccountDto> {
  return tx(async () => {
    const account = await accounts.findByIdForUpdate(id);
    if (!account) throw notFound(id);
    if (callerAccountId === id) throw new IllegalStateError('Bạn không thể tự đổi quyền của chính mình');
    if (request.reason == null || request.reason.trim() === '') throw new IllegalArgumentError('Vui lòng nhập lý do đổi quyền.');
    const oldRole = account.role;
    const newRole = request.role;
    if (!accounts.isPortalAccount(account) || newRole == null || newRole === 'TRAVELER') {
      throw new IllegalArgumentError('Chỉ đổi quyền giữa Quản trị viên và Nhà cung cấp.');
    }
    if (oldRole === newRole) throw new IllegalArgumentError(`Tài khoản đã có quyền ${newRole}.`);
    // Luôn còn ít nhất một quản trị viên đang hoạt động: chặn hạ quyền Admin cuối cùng.
    if (oldRole === 'ADMIN' && account.status === 'ACTIVE' && (await accounts.countByRoleAndStatus('ADMIN', 'ACTIVE')) <= 1) {
      throw new IllegalStateError('Không thể hạ quyền quản trị viên đang hoạt động cuối cùng.');
    }
    const before = { role: oldRole, providerId: account.provider ? account.provider.id : 0 };
    let newProviderId: number | null = null;
    if (newRole === 'PROVIDER') {
      if (request.providerId == null) throw new IllegalArgumentError('Vui lòng chọn nhà cung cấp cho tài khoản.');
      const provider = await providers.findById(request.providerId);
      if (!provider) throw new IllegalArgumentError(`Không tìm thấy đối tác NCC với ID: ${request.providerId}`);
      if ((await accounts.findByProviderId(provider.id)).length > 0) throw new IllegalStateError('Nhà cung cấp này đã có tài khoản đăng nhập.');
      newProviderId = provider.id;
    }
    // Nâng lên ADMIN: mặc định cấp thấp nhất; chuyển sang PROVIDER: bỏ cấp. Đổi quyền thu hồi mọi phiên đang có (NFR-SEC-03).
    await accounts.update(id, {
      role: newRole,
      providerId: newProviderId,
      adminLevel: newRole === 'ADMIN' ? LOWEST_ADMIN_LEVEL : null,
      tokenVersion: account.tokenVersion + 1,
    });
    const saved = (await accounts.findById(id))!;
    await audit.record(callerAccountId, 'UPDATE_ACCOUNT_ROLE', 'Account', saved.id, request.reason.trim(), before, { role: newRole, providerId: newProviderId ?? 0 });
    return toDto(saved);
  });
}

export function resetPassword(id: number, request: { newPassword: string; reason?: string | null }, callerAccountId: number | null): Promise<void> {
  return tx(async () => {
    const account = await accounts.findById(id);
    if (!account) throw notFound(id);
    await requireLevelOneForAdminTarget(account, callerAccountId);
    // S4: thao tác nhạy cảm — bắt buộc lý do thật của người thao tác (ghi vào audit log).
    const reason = requireReason(request.reason, 'Vui lòng nhập lý do đặt lại mật khẩu.');
    // NFR-SEC-03: đặt lại mật khẩu thu hồi các phiên cũ.
    await accounts.update(id, { passwordHash: await passwords.encode(request.newPassword), tokenVersion: account.tokenVersion + 1 });
    await audit.record(callerAccountId, 'RESET_PASSWORD', 'Account', account.id, reason, null, { email: account.email ?? '' });
  });
}

/** Thông tin (gồm cấp quản trị) của chính người đang đăng nhập — giao diện dùng để ẩn/hiện chức năng theo cấp. */
export async function me(callerAccountId: number | null): Promise<AccountDto> {
  if (callerAccountId == null) {
    // Tài khoản QA mẫu không có trong DB: cấp 1.
    return { id: null, email: null, phone: null, fullName: 'Quản trị viên', role: 'ADMIN', adminLevel: 1, status: 'ACTIVE', providerId: null, providerName: null, lastLoginAt: null, createdAt: null };
  }
  return getAccountById(callerAccountId);
}

/**
 * Đổi cấp quản trị (chỉ cấp 1, do accessRules chặn). Không tự đổi cấp của chính mình và luôn còn ít nhất một quản trị viên cấp 1
 * đang hoạt động để không ai bị khóa khỏi việc quản lý tài khoản.
 */
export function updateAdminLevel(id: number, request: { adminLevel: number; reason?: string | null }, callerAccountId: number | null): Promise<AccountDto> {
  return tx(async () => {
    const account = await accounts.findByIdForUpdate(id);
    if (!account) throw notFound(id);
    if (account.role !== 'ADMIN') throw new IllegalArgumentError('Chỉ tài khoản quản trị viên mới có cấp quản trị.');
    if (callerAccountId === id) throw new IllegalStateError('Bạn không thể tự đổi cấp của chính mình');
    const newLevel = validLevel(request.adminLevel);
    const oldLevel = accounts.effectiveAdminLevel(account)!;
    if (oldLevel === newLevel) throw new IllegalArgumentError(`Tài khoản đã ở cấp ${newLevel}.`);
    if (oldLevel === 1 && account.status === 'ACTIVE' && (await accounts.countActiveLevelOneAdmins()) <= 1) {
      throw new IllegalStateError('Không thể hạ cấp quản trị viên cấp 1 đang hoạt động cuối cùng.');
    }
    const reason = requireReason(request.reason, 'Vui lòng nhập lý do đổi cấp quản trị viên.');
    await accounts.update(id, { adminLevel: newLevel });
    const saved = (await accounts.findById(id))!;
    await audit.record(callerAccountId, 'UPDATE_ADMIN_LEVEL', 'Account', saved.id, reason, { adminLevel: oldLevel }, { adminLevel: newLevel });
    return toDto(saved);
  });
}

// ===== Xóa hẳn tài khoản (AccountDeletionService) ===============================================================================

function cleanReason(reason: string | null | undefined): string {
  if (reason == null || reason.trim() === '') throw new IllegalArgumentError('Vui lòng nhập lý do xóa tài khoản.');
  const trimmed = reason.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
}

/**
 * Xóa hẳn tài khoản Admin / NCC theo yêu cầu của quản trị viên cấp 1. Khóa ngoại của schema tự xử lý dữ liệu liên quan (xóa theo
 * hoặc gỡ về null); Provider không bị xóa — NCC hết tài khoản hoạt động thì các booking đang chờ được hủy như khi khóa tài khoản.
 */
export function deleteAccount(id: number, reason: string | null | undefined, callerAccountId: number | null): Promise<void> {
  return tx(async () => {
    const why = cleanReason(reason);
    if (callerAccountId === id) throw new IllegalStateError('Bạn không thể tự xóa tài khoản đang đăng nhập.');
    const account = await accounts.findByIdForUpdate(id);
    if (!account) throw notFound(id);
    if (account.role === 'ADMIN' && account.status === 'ACTIVE') {
      if ((await accounts.countByRoleAndStatus('ADMIN', 'ACTIVE')) <= 1) throw new IllegalStateError('Không thể xóa quản trị viên đang hoạt động cuối cùng.');
      const level = accounts.effectiveAdminLevel(account);
      if ((level == null || level === 1) && (await accounts.countActiveLevelOneAdmins()) <= 1) {
        throw new IllegalStateError('Không thể xóa quản trị viên cấp 1 đang hoạt động cuối cùng.');
      }
    }
    const commissions =
      (await scalar<number>('SELECT count(*) FROM commission_ledger c JOIN affiliate_link l ON l.id = c.affiliate_link_id WHERE l.account_id = $1', [id])) ?? 0;
    if (commissions > 0) {
      throw new IllegalStateError('Tài khoản đã phát sinh hoa hồng affiliate (dữ liệu tài chính phải lưu giữ) — hãy khóa thay vì xóa.');
    }
    const snapshot: Record<string, unknown> = { role: account.role, status: account.status };
    if (account.fullName != null) snapshot.fullName = account.fullName;
    if (account.email != null) snapshot.email = account.email;
    if (account.phone != null) snapshot.phone = account.phone;
    // NCC mất tài khoản hoạt động cuối cùng: hủy booking đang chờ như khi khóa tài khoản (ACC-BR-08/09).
    if (account.role === 'PROVIDER' && account.provider && account.status === 'ACTIVE') {
      const providerId = account.provider.id;
      snapshot.providerId = providerId;
      const otherActive = (await accounts.findByProviderId(providerId)).some((a) => a.id !== id && a.status === 'ACTIVE');
      if (!otherActive) {
        const cancelled = await bookingImpact.cancelForProvider(providerId, `Tài khoản nhà cung cấp bị xóa: ${why}`, today());
        if (cancelled > 0) snapshot.cancelledPendingBookings = cancelled;
      }
    }
    await exec('DELETE FROM account WHERE id = $1', [id]);
    await audit.record(callerAccountId, 'ACCOUNT_DELETED', 'Account', id, why, snapshot, { deleted: true });
  });
}

/** Xóa hẳn tài khoản khách: booking giữ lại (thông tin khách đã lưu trên booking); lịch trình, check-in, thông báo đẩy, OTP xóa theo. */
export function deleteTraveler(id: number, reason: string | null | undefined, callerAccountId: number | null): Promise<void> {
  return tx(async () => {
    const why = cleanReason(reason);
    const traveler = await accounts.findById(id);
    if (!traveler || traveler.role !== 'TRAVELER') throw new IllegalArgumentError(`Không tìm thấy tài khoản khách với ID: ${id}`);
    const snapshot: Record<string, unknown> = {};
    if (traveler.fullName != null) snapshot.fullName = traveler.fullName;
    if (traveler.email != null) snapshot.email = traveler.email;
    if (traveler.phone != null) snapshot.phone = traveler.phone;
    await exec('DELETE FROM account WHERE id = $1', [id]);
    await audit.record(callerAccountId, 'TRAVELER_DELETED', 'Traveler', id, why, snapshot, { deleted: true });
  });
}
