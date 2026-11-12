import crypto from 'node:crypto';
import { tx } from '../db/pool.js';
import type { AccountRole, AccountStatus, ProviderServiceType, ProviderStatus } from '../domain/enums.js';
import { currentIp } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import { effectiveAdminLevel, identifierOf, isPortalAccount, type AccountWithProvider } from '../repositories/accountRepo.js';
import { generateSessionToken } from '../security/jwt.js';
import { checkPassword } from '../security/passwordEncoder.js';
import * as audit from './auditLogService.js';

/** Đăng nhập / đăng xuất cổng Admin & NCC. */

export class BadCredentialsError extends Error {}
export class AccountInactiveError extends Error {}
export class ProviderSuspendedError extends Error {}

const INVALID = 'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại Email/Số điện thoại hoặc Mật khẩu.';

export interface ProviderSummaryDto {
  id: number;
  name: string;
  status: ProviderStatus;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  /** Loại hình — cổng NCC chọn bộ công cụ (homestay / trải nghiệm / nhà xe) theo trường này. */
  serviceType: ProviderServiceType;
}

export interface PortalLoginResponse {
  token: string;
  tokenType: string;
  accountId: number;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: AccountRole;
  /** Cấp quản trị 1..3 (chỉ ADMIN). */
  adminLevel: number | null;
  status: AccountStatus;
  provider: ProviderSummaryDto | null;
  redirectUrl: string;
  message: string;
}

/** NFR-SEC-05: ghi sự kiện xác thực; định danh được che, không ghi mật khẩu/token. */
async function loginEvent(account: AccountWithProvider | null, identifier: string, action: string, result: string, reason: string | null): Promise<void> {
  const actor = account === null ? 'SYSTEM' : account.role === 'PROVIDER' ? 'PROVIDER' : 'ADMIN';
  await audit.recordEvent(actor, account?.id ?? null, action, 'Account', account?.id ?? null, result, currentIp(), reason, {
    identifier: audit.mask(identifier),
  });
}

export async function login(rawIdentifier: string | null | undefined, rawPassword: string | null | undefined): Promise<PortalLoginResponse> {
  const identifier = (rawIdentifier ?? '').trim();
  const password = (rawPassword ?? '').trim();

  const account = await accounts.findByIdentifier(identifier);
  if (!account) {
    await loginEvent(null, identifier, 'LOGIN_FAILED', audit.RESULT_FAILURE, 'Tài khoản không tồn tại');
    throw new BadCredentialsError(INVALID);
  }
  if (!(await checkPassword(password, account.passwordHash))) {
    // BV-08 / UC-08: Sai thông tin -> thông báo chung, không tiết lộ identifier
    await loginEvent(account, identifier, 'LOGIN_FAILED', audit.RESULT_FAILURE, 'Sai mật khẩu');
    throw new BadCredentialsError(INVALID);
  }
  // Tài khoản chỉ là khách du lịch không vào được cổng: cùng thông báo như sai thông tin (không lộ tài khoản tồn tại).
  if (!isPortalAccount(account)) {
    await loginEvent(account, identifier, 'LOGIN_FAILED', audit.RESULT_DENIED, 'Tài khoản khách không có quyền vào cổng');
    throw new BadCredentialsError(INVALID);
  }
  // UC-08: Kiểm tra Account Status
  if (account.status !== 'ACTIVE') {
    logger.info('Đăng nhập bị từ chối: tài khoản INACTIVE', { identifier: audit.mask(identifier) });
    await loginEvent(account, identifier, 'LOGIN_BLOCKED', audit.RESULT_DENIED, 'Tài khoản bị vô hiệu hóa');
    throw new AccountInactiveError('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ ban quản trị hệ thống.');
  }
  // UC-08: Nếu là NCC (PROVIDER), kiểm tra Provider Status
  if (account.role === 'PROVIDER') {
    const provider = account.provider;
    if (!provider || provider.status !== 'ACTIVE') {
      logger.info('Đăng nhập bị từ chối: nhà cung cấp không ở trạng thái ACTIVE', { identifier: audit.mask(identifier) });
      await loginEvent(account, identifier, 'LOGIN_BLOCKED', audit.RESULT_DENIED, 'Nhà cung cấp không hoạt động');
      throw new ProviderSuspendedError('Nhà cung cấp đã bị đình chỉ hoạt động hoặc không khả dụng. Vui lòng liên hệ kênh hỗ trợ đối tác.');
    }
  }

  const now = nowLocal();
  // Mỗi lần đăng nhập là một phiên thiết bị riêng (đăng xuất máy này không đăng xuất máy khác). Phiên của token_version
  // cũ đã bị thu hồi hàng loạt, dọn luôn cho bảng không phình.
  const sessionId = crypto.randomUUID().replace(/-/g, '');
  await tx(async () => {
    await accounts.update(account.id, { lastLoginAt: now, lastActivityAt: now });
    await accounts.deleteStaleSessions(account.id, account.tokenVersion);
    await accounts.insertSession(account.id, sessionId, account.tokenVersion, now);
  });
  await loginEvent(account, identifier, 'LOGIN_SUCCESS', audit.RESULT_SUCCESS, null);

  // Sinh JWT token (mang phiên bản token để thu hồi khi đổi quyền/khóa/đặt lại mật khẩu, và mã phiên thiết bị)
  const token = generateSessionToken(identifierOf(account), `ROLE_${account.role}`, account.tokenVersion, sessionId);

  const p = account.provider;
  const provider: ProviderSummaryDto | null = p
    ? {
        id: p.id,
        name: p.name,
        status: p.status,
        contactName: p.contactName,
        contactPhone: p.contactPhone,
        contactEmail: p.contactEmail,
        address: p.address,
        serviceType: p.serviceType,
      }
    : null;

  const isAdmin = account.role === 'ADMIN';
  return {
    token,
    tokenType: 'Bearer',
    accountId: account.id,
    email: account.email,
    phone: account.phone,
    fullName: account.fullName,
    role: account.role,
    adminLevel: effectiveAdminLevel(account),
    status: account.status,
    provider,
    redirectUrl: isAdmin ? '/admin' : '/partner',
    message: `Đăng nhập thành công! Đang điều hướng đến ${isAdmin ? 'Cổng Quản Trị Hệ Thống.' : 'Cổng Nhà Cung Cấp Đối Tác.'}`,
  };
}

/**
 * Đăng xuất thiết bị hiện tại: xóa phiên sessionId — các thiết bị khác của tài khoản vẫn đăng nhập. Token cũ chưa mang mã
 * phiên không thu hồi riêng được nên tăng phiên bản token (thu hồi mọi phiên) như trước.
 */
export async function logout(accountId: number | null, sessionId: string | null | undefined): Promise<void> {
  if (accountId == null) return;
  const account = await accounts.findById(accountId);
  if (!account) return;
  await tx(async () => {
    if (sessionId) {
      await accounts.deleteSession(accountId, sessionId);
    } else {
      await accounts.update(accountId, { tokenVersion: account.tokenVersion + 1, lastActivityAt: null });
    }
  });
  await loginEvent(account, identifierOf(account), 'LOGOUT', audit.RESULT_SUCCESS, null);
}
