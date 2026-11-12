import type { AccountRole } from '../domain/enums.js';

/**
 * Người dùng đã xác thực của request (thay cho UserPrincipal của Spring Security).
 *
 * adminLevel: cấp quản trị của ADMIN (1 = cao nhất … 3 = thấp nhất), null với PROVIDER. ADMIN cấp N nhận các authority
 * ADMIN_L<N>..ADMIN_L3, nên "tối thiểu cấp 2" là hasAuthority('ADMIN_L2').
 */
export interface UserPrincipal {
  accountId: number | null;
  identifier: string;
  role: AccountRole;
  providerId: number | null;
  adminLevel: number | null;
}

export const LOWEST_ADMIN_LEVEL = 3;

export function authoritiesOf(p: UserPrincipal): Set<string> {
  const out = new Set<string>([`ROLE_${p.role}`]);
  if (p.role === 'ADMIN') {
    const level = p.adminLevel == null ? 1 : Math.max(1, Math.min(LOWEST_ADMIN_LEVEL, p.adminLevel));
    for (let l = level; l <= LOWEST_ADMIN_LEVEL; l++) out.add(`ADMIN_L${l}`);
  }
  return out;
}

export function hasAuthority(p: UserPrincipal | undefined, authority: string): boolean {
  return !!p && authoritiesOf(p).has(authority);
}
