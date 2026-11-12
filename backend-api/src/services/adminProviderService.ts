import { query, scalar, tx } from '../db/pool.js';
import { Where, escapeLike, updateRow } from '../db/sql.js';
import type { ProviderApplicationStatus, ProviderServiceType, ProviderStatus } from '../domain/enums.js';
import { IllegalArgumentError, IllegalStateError } from '../lib/errors.js';
import { pageOf, type PageJson } from '../lib/page.js';
import { nowLocal, today } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as providers from '../repositories/providerRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import * as audit from './auditLogService.js';
import * as bookingImpact from './bookingImpactService.js';
import * as recorder from './notificationRecorder.js';
import type { ProviderApplicationRow } from './providerApplicationService.js';

// ===== Đối tác NCC (AdminProviderService) ========================================================================================

export interface ProviderSummaryDto extends providers.ProviderRow {
  placeCount: number;
  accountCount: number;
}

const providerNotFound = (id: number) => new IllegalArgumentError(`Không tìm thấy đối tác NCC với ID: ${id}`);

const summaryOf = (p: providers.ProviderRow, placeCount: number, accountCount: number): ProviderSummaryDto => ({
  id: p.id,
  name: p.name,
  contactName: p.contactName,
  contactPhone: p.contactPhone,
  contactEmail: p.contactEmail,
  address: p.address,
  note: p.note,
  status: p.status,
  serviceType: p.serviceType,
  placeCount,
  accountCount,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export async function getProviders(status: ProviderStatus | undefined): Promise<ProviderSummaryDto[]> {
  const list = status ? await providers.findByStatusOrderByCreatedAtDesc(status) : await providers.findAllByCreatedAtDesc();
  // Lấy số lượng places và accounts theo provider để tránh N+1 queries.
  const placeCounts = await providers.countPlacesByProvider();
  const accountCounts = await providers.countAccountsByProvider();
  return list.map((p) => summaryOf(p, Number(placeCounts.get(p.id) ?? 0), Number(accountCounts.get(p.id) ?? 0)));
}

export async function getProviderById(id: number): Promise<ProviderSummaryDto> {
  const provider = await providers.findById(id);
  if (!provider) throw providerNotFound(id);
  const placeCounts = await providers.countPlacesByProvider();
  const accountCounts = await providers.countAccountsByProvider();
  return summaryOf(provider, Number(placeCounts.get(id) ?? 0), Number(accountCounts.get(id) ?? 0));
}

export async function getProviderAccounts(providerId: number) {
  if (!(await providers.findById(providerId))) throw providerNotFound(providerId);
  return (await accounts.findByProviderId(providerId)).map((a) => ({
    id: a.id,
    email: a.email,
    phone: a.phone,
    fullName: a.fullName,
    status: a.status,
    lastLoginAt: a.lastLoginAt,
  }));
}

export interface CreateProviderInput {
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  note?: string | null;
  serviceType?: ProviderServiceType | null;
  accountEmail: string;
  accountPhone?: string | null;
  accountPassword: string;
  accountFullName: string;
}

const trimOrNull = (s: string | null | undefined): string | null => (s != null ? s.trim() : null);

export function createProviderWithAccount(request: CreateProviderInput, callerAccountId: number | null): Promise<ProviderSummaryDto> {
  return tx(async () => {
    if (await accounts.existsByEmail(request.accountEmail)) throw new IllegalArgumentError(`Email tài khoản ${request.accountEmail} đã được sử dụng`);
    const accountPhone = request.accountPhone == null || request.accountPhone.trim() === '' ? null : request.accountPhone.trim();
    if (accountPhone != null && (await accounts.existsByPhone(accountPhone))) throw new IllegalArgumentError(`Số điện thoại tài khoản ${accountPhone} đã được sử dụng`);
    // 1. Tạo Provider luôn ở trạng thái ACTIVE (schema chuẩn xác nhận không có Pending Approval).
    const now = nowLocal();
    const provider = await providers.insert({
      name: request.name.trim(),
      contactName: trimOrNull(request.contactName),
      contactPhone: trimOrNull(request.contactPhone),
      contactEmail: trimOrNull(request.contactEmail),
      address: trimOrNull(request.address),
      note: request.note ?? null,
      serviceType: request.serviceType ?? 'HOMESTAY',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    // 2. Tạo tài khoản đăng nhập đầu tiên cho NCC.
    const account = await accounts.insert({
      email: request.accountEmail.trim().toLowerCase(),
      phone: accountPhone,
      passwordHash: await passwords.encode(request.accountPassword),
      fullName: request.accountFullName.trim(),
      role: 'PROVIDER',
      status: 'ACTIVE',
      providerId: provider.id,
      createdAt: now,
    });
    await audit.record(callerAccountId, 'CREATE_PROVIDER', 'Provider', provider.id, `Tạo mới Đối tác NCC và tài khoản đăng nhập đầu tiên: ${provider.name}`, null, {
      providerName: provider.name,
      accountEmail: account.email,
    });
    return summaryOf(provider, 0, 1);
  });
}

export interface UpdateProviderInput {
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  note?: string | null;
  serviceType?: ProviderServiceType | null;
}

export function updateProvider(id: number, request: UpdateProviderInput, callerAccountId: number | null): Promise<ProviderSummaryDto> {
  return tx(async () => {
    const provider = await providers.findById(id);
    if (!provider) throw providerNotFound(id);
    const before = { name: provider.name ?? '', contactName: provider.contactName ?? '', contactPhone: provider.contactPhone ?? '' };
    const saved = (await providers.update(id, {
      name: request.name.trim(),
      ...(request.contactName != null ? { contactName: request.contactName.trim() } : {}),
      ...(request.contactPhone != null ? { contactPhone: request.contactPhone.trim() } : {}),
      ...(request.contactEmail != null ? { contactEmail: request.contactEmail.trim() } : {}),
      ...(request.address != null ? { address: request.address.trim() } : {}),
      ...(request.note != null ? { note: request.note } : {}),
      ...(request.serviceType != null ? { serviceType: request.serviceType } : {}),
      updatedAt: nowLocal(),
    }))!;
    await audit.record(callerAccountId, 'UPDATE_PROVIDER', 'Provider', saved.id, 'Cập nhật hồ sơ đối tác NCC', before, {
      name: saved.name ?? '',
      contactName: saved.contactName ?? '',
      contactPhone: saved.contactPhone ?? '',
    });
    return getProviderById(saved.id);
  });
}

export function updateProviderStatus(id: number, request: { status: ProviderStatus; reason?: string | null }, callerAccountId: number | null): Promise<ProviderSummaryDto> {
  return tx(async () => {
    const provider = await providers.findById(id);
    if (!provider) throw providerNotFound(id);
    if (request.status !== 'ACTIVE' && (request.reason == null || request.reason.trim() === '')) {
      throw new IllegalArgumentError('Vui lòng nhập lý do khi đình chỉ hoặc chấm dứt đối tác.');
    }
    const oldStatus = provider.status;
    if (request.status !== 'ACTIVE' && oldStatus === 'ACTIVE') {
      await bookingImpact.cancelForProvider(provider.id, `Nhà cung cấp đã ngừng hoạt động: ${request.reason!.trim()}`, today());
    }
    const saved = (await providers.update(id, { status: request.status, updatedAt: nowLocal() }))!;
    await audit.record(callerAccountId, 'UPDATE_PROVIDER_STATUS', 'Provider', saved.id, request.reason ?? 'Thay đổi trạng thái Đối tác NCC', { status: oldStatus }, { status: saved.status });
    return getProviderById(saved.id);
  });
}

// ===== Hồ sơ đăng ký NCC (AdminProviderApplicationService) =========================================================================

const APPROVED_TEMPLATE = 'PROVIDER_APPLICATION_APPROVED';
const REJECTED_TEMPLATE = 'PROVIDER_APPLICATION_REJECTED';
const ENTITY = 'ProviderApplication';

export interface ApplicationSummaryDto {
  id: number;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  address: string;
  businessLicenseNo: string | null;
  status: ProviderApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  providerId: number | null;
  serviceType: ProviderServiceType;
}

const blankToNull = (s: string | null | undefined): string | null => (s == null || s.trim() === '' ? null : s);

function clean(text: string | null | undefined): string | null {
  if (text == null || text.trim() === '') return null;
  const trimmed = text.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function searchApplications(
  status: ProviderApplicationStatus | undefined,
  serviceType: ProviderServiceType | undefined,
  keyword: string | undefined,
  from: string | undefined,
  to: string | undefined,
  sortDir: string,
  page: number,
  size: number,
): Promise<PageJson<ApplicationSummaryDto>> {
  if (from && to && to < from) throw new IllegalArgumentError('Khoảng thời gian không hợp lệ: ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  const kw = keyword && keyword.trim() !== '' ? keyword.trim().toLowerCase() : null;
  const where = new Where();
  if (status) where.and('status = ?', status);
  if (serviceType) where.and('service_type = ?', serviceType);
  if (from) where.and('created_at >= ?', `${from}T00:00:00`);
  if (to) where.and('created_at < ?', `${nextDay(to)}T00:00:00`);
  if (kw) {
    const like = `%${escapeLike(kw)}%`;
    where.and(
      `(lower(business_name) LIKE ? ESCAPE '\\' OR lower(contact_name) LIKE ? ESCAPE '\\' OR lower(contact_email) LIKE ? ESCAPE '\\' OR contact_phone LIKE ? ESCAPE '\\')`,
      like,
      like,
      like,
      like,
    );
  }
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const p = Math.max(page, 0);
  const s = Math.min(Math.max(size, 1), 100);
  const total = (await scalar<number>(`SELECT count(*) FROM provider_application ${where.toSql()}`, where.params)) ?? 0;
  const rows = await query<ProviderApplicationRow>(`SELECT * FROM provider_application ${where.toSql()} ORDER BY created_at ${dir}, id ${dir} LIMIT ${s} OFFSET ${p * s}`, where.params);
  const reviewers = await reviewerNames(rows);
  return pageOf(rows.map((a) => summaryOf2(a, reviewers)), p, s, total, true);
}

export async function pendingApplicationCount(): Promise<number> {
  return Number((await scalar<number>(`SELECT count(*) FROM provider_application WHERE status = 'PENDING'`)) ?? 0);
}

const applicationNotFound = (id: number) => new IllegalArgumentError(`Không tìm thấy hồ sơ đăng ký với ID: ${id}`);

export async function applicationDetail(id: number) {
  const [application] = await query<ProviderApplicationRow>('SELECT * FROM provider_application WHERE id = $1', [id]);
  if (!application) throw applicationNotFound(id);
  return toDetail(application);
}

async function lockedApplication(id: number): Promise<ProviderApplicationRow> {
  const [application] = await query<ProviderApplicationRow>('SELECT * FROM provider_application WHERE id = $1 FOR UPDATE', [id]);
  if (!application) throw applicationNotFound(id);
  return application;
}

async function lockPending(id: number): Promise<ProviderApplicationRow> {
  const application = await lockedApplication(id);
  if (application.status !== 'PENDING') throw new IllegalStateError('Hồ sơ không còn ở trạng thái có thể xử lý');
  return application;
}

const requireAdmin = (adminAccountId: number | null): void => {
  if (adminAccountId == null) throw new IllegalStateError('Không xác định được tài khoản quản trị đang thao tác.');
};

async function identifierTaken(identifier: string | null | undefined): Promise<boolean> {
  return blankToNull(identifier) != null && (await accounts.findByIdentifier(identifier!.trim())) != null;
}

/** Duyệt → tạo Provider + Account (giữ nguyên mật khẩu đã băm BCrypt trong hồ sơ). */
export function approveApplication(id: number, adminAccountId: number | null, note: string | null | undefined) {
  return tx(async () => {
    const application = await lockPending(id);
    requireAdmin(adminAccountId);
    // Kiểm tra lại ngay trước khi tạo: trong lúc chờ duyệt SĐT/email có thể đã được cấp cho tài khoản khác.
    if ((await identifierTaken(application.contactPhone)) || (await identifierTaken(application.contactEmail))) {
      throw new IllegalStateError('Nhà cung cấp đã có tài khoản hoặc email/số điện thoại đã được sử dụng');
    }
    const now = nowLocal();
    const provider = await providers.insert({
      name: application.businessName,
      contactName: application.contactName,
      contactPhone: application.contactPhone,
      contactEmail: application.contactEmail,
      address: application.address,
      note: application.description,
      // Loại hình quyết định cổng NCC hiện công cụ homestay hay công cụ dịch vụ (trải nghiệm / nhà xe).
      serviceType: application.serviceType,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    const account = await accounts.insert({
      email: blankToNull(application.contactEmail) == null ? null : application.contactEmail!.trim().toLowerCase(),
      phone: application.contactPhone,
      // Mật khẩu đã được băm BCrypt lúc đăng ký: dùng nguyên, không băm lại.
      passwordHash: application.passwordHash,
      fullName: application.contactName,
      role: 'PROVIDER',
      status: 'ACTIVE',
      providerId: provider.id,
      createdAt: now,
    });
    await finish(id, 'APPROVED', adminAccountId, note, { providerId: provider.id });
    await audit.record(adminAccountId, 'PROVIDER_APPLICATION_APPROVED', ENTITY, id, clean(note), { status: 'PENDING' }, { status: 'APPROVED', providerId: provider.id, accountId: account.id });
    await recorder.toCustomer(APPROVED_TEMPLATE, application.contactPhone, application.contactEmail, 'provider_application', id, { business_name: application.businessName });
    return applicationDetail(id);
  });
}

export function rejectApplication(id: number, adminAccountId: number | null, reason: string | null | undefined) {
  return tx(async () => {
    if (reason == null || reason.trim() === '') throw new IllegalArgumentError('Vui lòng nhập lý do từ chối.');
    const application = await lockPending(id);
    requireAdmin(adminAccountId);
    await finish(id, 'REJECTED', adminAccountId, reason, {});
    await audit.record(adminAccountId, 'PROVIDER_APPLICATION_REJECTED', ENTITY, id, clean(reason), { status: 'PENDING' }, { status: 'REJECTED' });
    await recorder.toCustomer(REJECTED_TEMPLATE, application.contactPhone, application.contactEmail, 'provider_application', id, {
      business_name: application.businessName,
      reason: clean(reason),
    });
    return applicationDetail(id);
  });
}

/**
 * Xem xét lại hồ sơ đã bị từ chối: đưa về Chờ duyệt để Admin duyệt hoặc từ chối lại. Kết quả từ chối cũ được giữ trong Audit Log. Không
 * mở lại nếu NCC đã gửi hồ sơ mới đang chờ (tránh hai hồ sơ chờ cho cùng một cơ sở).
 */
export function reopenApplication(id: number, adminAccountId: number | null, note: string | null | undefined) {
  return tx(async () => {
    requireAdmin(adminAccountId);
    const application = await lockedApplication(id);
    if (application.status !== 'REJECTED') throw new IllegalStateError('Chỉ có thể xem xét lại hồ sơ đã bị từ chối.');
    const pending = await scalar<boolean>(
      `SELECT count(*) > 0 FROM provider_application WHERE contact_phone = $1 AND status = 'PENDING' AND id <> $2`,
      [application.contactPhone, id],
    );
    if (pending) throw new IllegalStateError('Nhà cung cấp đã gửi hồ sơ mới đang chờ duyệt — hãy xử lý hồ sơ mới đó.');
    const previousNote = application.reviewNote;
    await updateRow('provider_application', id, { status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNote: null });
    const before: Record<string, unknown> = { status: 'REJECTED' };
    if (previousNote != null) before.reason = previousNote;
    await audit.record(adminAccountId, 'PROVIDER_APPLICATION_REOPENED', ENTITY, id, clean(note), before, { status: 'PENDING' });
    return applicationDetail(id);
  });
}

async function finish(id: number, status: ProviderApplicationStatus, adminAccountId: number | null, note: string | null | undefined, extra: Record<string, unknown>): Promise<void> {
  await updateRow('provider_application', id, { status, reviewedBy: adminAccountId, reviewedAt: nowLocal(), reviewNote: clean(note), ...extra });
}

/** Xử lý hàng loạt: mỗi hồ sơ độc lập, hồ sơ lỗi không chặn các hồ sơ còn lại. */
export async function runBulk(ids: number[], action: (id: number) => Promise<unknown>) {
  const succeededIds: number[] = [];
  const failed: Array<{ id: number; message: string }> = [];
  for (const id of ids) {
    try {
      await action(id);
      succeededIds.push(id);
    } catch (err) {
      failed.push({ id, message: (err as Error).message ? (err as Error).message : `Không thể xử lý hồ sơ #${id}` });
    }
  }
  return { succeededIds, failed };
}

async function toDetail(a: ProviderApplicationRow) {
  const pending = a.status === 'PENDING';
  return {
    summary: summaryOf2(a, await reviewerNames([a])),
    description: a.description,
    phoneTaken: pending && (await identifierTaken(a.contactPhone)),
    emailTaken: pending && (await identifierTaken(a.contactEmail)),
    details: a.details,
  };
}

function summaryOf2(a: ProviderApplicationRow, reviewers: Map<number, string>): ApplicationSummaryDto {
  return {
    id: a.id,
    businessName: a.businessName,
    contactName: a.contactName,
    contactPhone: a.contactPhone,
    contactEmail: a.contactEmail,
    address: a.address,
    businessLicenseNo: a.businessLicenseNo,
    status: a.status,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt,
    reviewedByName: a.reviewedBy == null ? null : (reviewers.get(a.reviewedBy) ?? null),
    reviewNote: a.reviewNote,
    providerId: a.providerId,
    serviceType: a.serviceType,
  };
}

async function reviewerNames(list: ProviderApplicationRow[]): Promise<Map<number, string>> {
  const ids = [...new Set(list.map((a) => a.reviewedBy).filter((v): v is number => v != null))];
  const names = new Map<number, string>();
  if (ids.length > 0) for (const a of await query<{ id: number; fullName: string | null }>('SELECT id, full_name FROM account WHERE id = ANY($1)', [ids])) names.set(a.id, a.fullName ?? 'Quản trị viên');
  return names;
}
