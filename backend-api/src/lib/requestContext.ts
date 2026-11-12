import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserPrincipal } from '../security/principal.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';

/**
 * Ngữ cảnh của request hiện tại (thay cho RequestContextHolder của Spring): IP client, principal đã xác thực và tài khoản
 * mà middleware xác thực vừa nạp — service dùng lại bản này thay vì tra bảng account thêm một lần trong cùng request.
 * Đây KHÔNG phải cache: chỉ sống trong một request.
 */
export interface RequestContext {
  ip?: string;
  principal?: UserPrincipal;
  account?: AccountWithProvider;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** IP của request đang xử lý; undefined ngoài request (job, test). */
export function currentIp(): string | undefined {
  return storage.getStore()?.ip;
}

/**
 * Tài khoản Admin/NCC mà middleware xác thực đã nạp và kiểm tra cho request hiện tại, nếu đúng là của {@code accountId}.
 */
export function authenticatedAccount(accountId: number | null | undefined): AccountWithProvider | undefined {
  const acc = storage.getStore()?.account;
  return acc && accountId != null && acc.id === accountId ? acc : undefined;
}
