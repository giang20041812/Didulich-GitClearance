import type { UserPrincipal } from './principal.js';
import { authoritiesOf } from './principal.js';

/**
 * Bảng phân quyền theo đường dẫn — chuyển nguyên từ SecurityConfig.securityFilterChain của bản Java. Quy tắc đầu tiên
 * khớp (method + đường dẫn) quyết định; thứ tự khai báo vì thế quan trọng.
 *
 *  Cấp 1 = toàn quyền · Cấp 2 = vận hành (duyệt, xử lý) · Cấp 3 = xem + kiểm duyệt đánh giá + ghi nhận giám sát.
 */

export type Access =
  | { type: 'permitAll' }
  | { type: 'authenticated' }
  | { type: 'authority'; authority: string }
  | { type: 'anyRole'; roles: string[] };

interface Rule {
  methods?: string[];
  patterns: string[];
  access: Access;
}

const permitAll: Access = { type: 'permitAll' };
const authority = (a: string): Access => ({ type: 'authority', authority: a });
const hasRole = (r: string): Access => authority(`ROLE_${r}`);

const RULES: Rule[] = [
  // Public: không cần đăng nhập (SOS khẩn cấp, info công khai, error dispatch).
  { patterns: ['/api/public/**', '/api/v1/public/**', '/error'], access: permitAll },
  // Health check ở gốc tên miền cho uptime monitor / load test.
  { patterns: ['/', '/health'], access: permitAll },
  // Webhook thanh toán: endpoint tự xác thực secret trong controller (SEPay không có JWT).
  { patterns: ['/api/v1/webhooks/**'], access: permitAll },
  // Cron: InternalCronController tự kiểm tra "Authorization: Bearer <CRON_SECRET>".
  { methods: ['GET'], patterns: ['/api/internal/cron/**'], access: permitAll },
  // Auth endpoints (đăng nhập portal, google)
  { patterns: ['/api/v1/auth/**'], access: permitAll },
  // Mọi ADMIN: thông tin cấp của chính mình và thông báo của mình.
  { patterns: ['/api/v1/admin/accounts/me', '/api/v1/admin/notifications/**'], access: hasRole('ADMIN') },
  // Cấp 2: khóa/mở khóa và đặt lại mật khẩu (dịch vụ chặn cấp 2 tác động lên tài khoản Admin).
  {
    methods: ['PATCH'],
    patterns: ['/api/v1/admin/accounts/*/status', '/api/v1/admin/accounts/*/reset-password'],
    access: authority('ADMIN_L2'),
  },
  // Cấp 1: quản lý tài khoản (tạo Admin, đổi quyền/cấp), tài chính, xóa điểm đến.
  { patterns: ['/api/v1/admin/accounts/**', '/api/v1/admin/finance/**'], access: authority('ADMIN_L1') },
  { methods: ['POST'], patterns: ['/api/v1/admin/places/delete'], access: authority('ADMIN_L1') },
  // Xóa hẳn tài khoản khách: chỉ cấp 1.
  { methods: ['DELETE'], patterns: ['/api/v1/admin/travelers/*'], access: authority('ADMIN_L1') },
  // Cấp 3 trở lên được ghi nhận giám sát Booking, kiểm duyệt đánh giá, ảnh / lưu bút check-in và bài trang "Trải nghiệm".
  {
    methods: ['POST'],
    patterns: [
      '/api/v1/admin/reviews/*/moderate',
      '/api/v1/admin/bookings/*/notes',
      '/api/v1/admin/journey-checkins/*/hide',
      '/api/v1/admin/journey-checkins/*/unhide',
      '/api/v1/admin/journey-feed/*/hide',
      '/api/v1/admin/journey-feed/*/unhide',
    ],
    access: authority('ADMIN_L3'),
  },
  // Nhật ký hoạt động và hàng đợi hồ sơ NCC / yêu cầu thay đổi (chứa SĐT, email, thông tin cơ sở): từ cấp 2.
  {
    methods: ['GET'],
    patterns: [
      '/api/v1/admin/audit-logs/**',
      '/api/v1/admin/dashboard/activity',
      '/api/v1/admin/travelers/*/activity',
      '/api/v1/admin/provider-applications/**',
      '/api/v1/admin/change-requests/**',
    ],
    access: authority('ADMIN_L2'),
  },
  // Còn lại: đọc dữ liệu (mọi cấp), ghi/xử lý (từ cấp 2).
  { methods: ['GET'], patterns: ['/api/v1/admin/**'], access: authority('ADMIN_L3') },
  { patterns: ['/api/v1/admin/**'], access: authority('ADMIN_L2') },
  // Partner endpoints: PROVIDER hoặc ADMIN
  { patterns: ['/api/v1/partner/**'], access: { type: 'anyRole', roles: ['PROVIDER', 'ADMIN'] } },
];

const compiled = new Map<string, RegExp>();

function toRegex(pattern: string): RegExp {
  if (pattern === '/') return /^\/$/;
  const segments = pattern.split('/').slice(1); // bỏ phần rỗng trước dấu '/' đầu tiên
  let source = '^';
  segments.forEach((seg, i) => {
    if (seg === '**') {
      source += i === segments.length - 1 ? '(?:/.*)?' : '(?:/[^/]+)*';
    } else {
      source += '/' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    }
  });
  return new RegExp(`${source}$`);
}

/** Khớp mẫu kiểu Ant/PathPattern: `*` = một đoạn, `**` = không hoặc nhiều đoạn. */
export function matchPattern(pattern: string, path: string): boolean {
  let re = compiled.get(pattern);
  if (!re) {
    re = toRegex(pattern);
    compiled.set(pattern, re);
  }
  // Bỏ dấu '/' cuối (trừ gốc) để khớp ngay cả khi client gửi kèm.
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return re.test(normalized);
}

export function accessFor(method: string, path: string): Access | undefined {
  const m = method.toUpperCase();
  for (const rule of RULES) {
    if (rule.methods && !rule.methods.includes(m)) continue;
    if (rule.patterns.some((p) => matchPattern(p, path))) return rule.access;
  }
  return undefined;
}

export type Decision = 'allow' | 'unauthenticated' | 'forbidden';

/** Quyết định cho một request; đường dẫn không khớp quy tắc nào thì cần đăng nhập (anyRequest().authenticated()). */
export function decide(method: string, path: string, principal: UserPrincipal | undefined): Decision {
  const access = accessFor(method, path) ?? { type: 'authenticated' as const };
  if (access.type === 'permitAll') return 'allow';
  if (!principal) return 'unauthenticated';
  if (access.type === 'authenticated') return 'allow';
  const auths = authoritiesOf(principal);
  if (access.type === 'authority') return auths.has(access.authority) ? 'allow' : 'forbidden';
  return access.roles.some((r) => auths.has(`ROLE_${r}`)) ? 'allow' : 'forbidden';
}

/** Đường dẫn bắt buộc đăng nhập (khớp các nhánh permitAll). Phân loại sai chỉ ảnh hưởng mã lỗi, không cấp thêm quyền. */
export function requiresAuthentication(method: string, path: string): boolean {
  if (method.toUpperCase() === 'OPTIONS') return false;
  return !(
    path.startsWith('/api/public/') ||
    path === '/api/public' ||
    path.startsWith('/api/v1/public/') ||
    path.startsWith('/api/v1/auth/') ||
    path === '/error'
  );
}
