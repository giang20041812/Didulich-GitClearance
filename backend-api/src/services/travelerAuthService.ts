import { tx } from '../db/pool.js';
import { DuplicateFieldsError, IllegalArgumentError, type FieldError } from '../lib/errors.js';
import { currentIp } from '../lib/requestContext.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import { identifierOf, isPortalAccount, type AccountRow } from '../repositories/accountRepo.js';
import { generateToken } from '../security/jwt.js';
import * as passwords from '../security/passwordEncoder.js';
import * as audit from './auditLogService.js';
import type { GoogleProfile } from './googleTokenVerifier.js';
import * as notifications from './notificationRecorder.js';

/**
 * Đăng ký / đăng nhập trang khách (email + mật khẩu hoặc Google). Dùng chung bảng tài khoản với cổng Admin / NCC: mọi tài
 * khoản đang hoạt động đều đăng nhập được trang khách bằng chính tài khoản đó (phiên "ROLE_TRAVELER"); đăng ký mới tạo
 * tài khoản vai trò TRAVELER.
 */

const INVALID_CREDENTIALS = 'Thông tin đăng nhập không chính xác. Vui lòng kiểm tra lại Email/Số điện thoại hoặc Mật khẩu.';
const PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface TravelerSession {
  token: string;
  email: string | null;
  fullName: string | null;
  picture: string | null;
  phone: string | null;
}

export class InvalidRegistrationError extends Error {}
export class TravelerInactiveError extends Error {
  constructor() {
    super('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ ban quản trị hệ thống.');
  }
}
export class InvalidTravelerCredentialsError extends Error {
  constructor() {
    super(INVALID_CREDENTIALS);
  }
}
/** Email Google trùng email CHƯA XÁC MINH của tài khoản cổng Admin / NCC: không tự gắn, phải đăng nhập bằng mật khẩu. */
export class GoogleLinkRefusedError extends Error {
  constructor() {
    super(
      'Email này đang gắn với một tài khoản đối tác chưa xác minh email. Vui lòng đăng nhập bằng mật khẩu ' +
        'của tài khoản đó hoặc liên hệ bộ phận hỗ trợ.',
    );
  }
}
/** Email Google chưa có tài khoản: khách điền form "Hãy tạo tài khoản của bạn" rồi mới tạo (registerWithGoogle). */
export class GoogleSignupRequiredError extends Error {
  constructor(readonly profile: GoogleProfile) {
    super('Vui lòng hoàn tất thông tin để tạo tài khoản.');
  }
}

export interface SignupPrefill {
  email: string;
  firstName: string;
  lastName: string;
  picture: string | null;
}

const trimToEmpty = (s: string | null | undefined): string => (s == null ? '' : s.trim());

/**
 * Ưu tiên tên / họ Google tách sẵn (given_name / family_name); không có thì tách họ tên hiển thị, chữ cuối là tên.
 * Verifier dùng email làm tên khi token thiếu tên: khi đó để trống.
 */
export function signupPrefill(profile: GoogleProfile): SignupPrefill {
  let given = trimToEmpty(profile.givenName);
  let family = trimToEmpty(profile.familyName);
  if (given === '') {
    let name = trimToEmpty(profile.fullName);
    if (name.includes('@')) name = '';
    const cut = name.lastIndexOf(' ');
    given = cut < 0 ? name : name.slice(cut + 1);
    family = cut < 0 ? '' : name.slice(0, cut).trim();
  }
  return { email: profile.email, firstName: given, lastName: family, picture: profile.picture };
}

/** Báo cho các Admin biết có khách du lịch mới đăng ký (không làm hỏng đăng ký nếu gửi thông báo lỗi). */
async function notifyAdminsNewTraveler(traveler: AccountRow): Promise<void> {
  const name = traveler.fullName && traveler.fullName.trim() ? traveler.fullName : traveler.email;
  await notifications.toAdmins('ADMIN_NEW_TRAVELER', 'Account', traveler.id, `Khách "${name}" (${traveler.email}) vừa đăng ký tài khoản.`, 'accounts');
}

async function loginEvent(account: AccountRow | null, identifier: string, action: string, result: string, reason: string | null, method = 'EMAIL'): Promise<void> {
  await audit.recordEvent(account === null ? 'SYSTEM' : 'CUSTOMER', account?.id ?? null, action, 'Traveler', account?.id ?? null, result, currentIp(), reason, {
    identifier: audit.mask(identifier),
    method,
  });
}

function session(account: AccountRow): TravelerSession {
  return {
    token: generateToken(identifierOf(account), 'ROLE_TRAVELER'),
    email: account.email,
    fullName: account.fullName,
    picture: account.avatarUrl,
    phone: account.phone,
  };
}

function assertActive(account: AccountRow): void {
  if (account.status !== 'ACTIVE') throw new TravelerInactiveError();
}

export async function register(
  fullName: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined,
  password: string | null | undefined,
  confirmPassword: string | null | undefined,
): Promise<TravelerSession> {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedPhone = phone == null || phone.trim() === '' ? null : phone.trim();
  const trimmedName = (fullName ?? '').trim();

  if (trimmedName.length < 2) throw new InvalidRegistrationError('Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).');
  if (!EMAIL_REGEX.test(normalizedEmail)) throw new InvalidRegistrationError('Địa chỉ Email không đúng định dạng.');
  if (normalizedPhone != null && !PHONE_REGEX.test(normalizedPhone)) {
    throw new InvalidRegistrationError('Số điện thoại không đúng định dạng (VD: 0912345678).');
  }
  if (password == null || password.length < 8) throw new InvalidRegistrationError('Mật khẩu phải chứa ít nhất 8 ký tự.');
  if (confirmPassword != null && password !== confirmPassword) {
    throw new InvalidRegistrationError('Xác nhận mật khẩu không khớp với mật khẩu đã nhập.');
  }
  // Kiểm tra đủ mọi trường trước khi báo, để khách thấy cùng lúc tất cả thông tin bị trùng.
  const duplicates: FieldError[] = [];
  if (await accounts.existsByEmail(normalizedEmail)) duplicates.push({ field: 'email', message: 'Email này đã được sử dụng' });
  if (normalizedPhone != null && (await accounts.existsByPhone(normalizedPhone))) {
    duplicates.push({ field: 'phone', message: 'Số điện thoại này đã được đăng ký' });
  }
  if (duplicates.length > 0) throw new DuplicateFieldsError(duplicates);

  const hash = await passwords.encode(password);
  const now = nowLocal();
  const traveler = await accounts.insert({
    email: normalizedEmail,
    phone: normalizedPhone,
    fullName: trimmedName,
    passwordHash: hash,
    role: 'TRAVELER',
    lastLoginAt: now,
    createdAt: now,
  });
  await notifyAdminsNewTraveler(traveler);
  await loginEvent(traveler, normalizedEmail, 'LOGIN_SUCCESS', audit.RESULT_SUCCESS, 'Đăng nhập sau đăng ký');
  return session(traveler);
}

export async function login(identifier: string | null | undefined, password: string | null | undefined): Promise<TravelerSession> {
  const id = (identifier ?? '').trim();
  const account = await accounts.findByIdentifier(id);
  if (!account) {
    await loginEvent(null, id, 'LOGIN_FAILED', audit.RESULT_FAILURE, 'Tài khoản không tồn tại');
    throw new InvalidTravelerCredentialsError();
  }
  if (!(await passwords.checkPassword(password, account.passwordHash))) {
    await loginEvent(account, id, 'LOGIN_FAILED', audit.RESULT_FAILURE, 'Sai mật khẩu');
    throw new InvalidTravelerCredentialsError();
  }
  if (account.status !== 'ACTIVE') await loginEvent(account, id, 'LOGIN_BLOCKED', audit.RESULT_DENIED, 'Tài khoản bị vô hiệu hóa');
  assertActive(account);
  const saved = await accounts.update(account.id, { lastLoginAt: nowLocal() });
  await loginEvent(account, id, 'LOGIN_SUCCESS', audit.RESULT_SUCCESS, null);
  return session(saved ?? account);
}

/**
 * Tìm theo email Google đã xác minh. Chưa có tài khoản thì báo GoogleSignupRequiredError: khách điền form tạo tài khoản
 * (họ tên, số điện thoại) rồi gọi registerWithGoogle.
 *
 * Đăng ký bằng email + mật khẩu không xác minh email, nên ai cũng có thể tạo trước tài khoản khách bằng email của người
 * khác. Lần đầu chủ email thật đăng nhập Google vào một tài khoản khách như vậy (chưa xác minh, có mật khẩu): xóa mật
 * khẩu do người tạo trước đặt rồi đánh dấu email đã xác minh. Tài khoản cổng Admin / NCC có email chưa xác minh thì KHÔNG
 * tự gắn Google: từ chối, chủ tài khoản đăng nhập bằng mật khẩu.
 */
export async function loginWithGoogle(profile: GoogleProfile): Promise<TravelerSession> {
  const account = await accounts.findByEmailIgnoreCase(profile.email);
  if (!account) throw new GoogleSignupRequiredError(profile);
  assertActive(account);
  if (isPortalAccount(account) && account.emailVerifiedAt == null) {
    await loginEvent(account, profile.email, 'LOGIN_BLOCKED', audit.RESULT_DENIED, 'Google trùng email chưa xác minh của tài khoản cổng', 'GOOGLE');
    throw new GoogleLinkRefusedError();
  }
  const now = nowLocal();
  const patch: Partial<AccountRow> = {};
  if (account.emailVerifiedAt == null) {
    if (account.passwordHash != null) {
      patch.passwordHash = null;
      await loginEvent(account, profile.email, 'PASSWORD_CLEARED_UNVERIFIED', audit.RESULT_SUCCESS, 'Đăng nhập Google vào tài khoản chưa xác minh email: xóa mật khẩu đã đặt trước');
    }
    patch.emailVerifiedAt = now;
  }
  if (account.fullName == null) patch.fullName = profile.fullName;
  if (profile.picture != null) patch.avatarUrl = profile.picture;
  patch.lastLoginAt = now;
  const saved = (await accounts.update(account.id, patch)) ?? account;
  await loginEvent(saved, profile.email, 'LOGIN_SUCCESS', audit.RESULT_SUCCESS, null, 'GOOGLE');
  return session(saved);
}

/**
 * Bước 2 của lần đầu đăng nhập Google: tạo tài khoản khách từ form "Hãy tạo tài khoản của bạn". Họ tên ghép theo thứ tự
 * Việt Nam (họ + tên); số điện thoại bắt buộc để chủ nhà liên hệ. Email lấy từ token Google nên đã xác minh, không có mật
 * khẩu. Email đã có tài khoản thì đăng nhập vào tài khoản đó như loginWithGoogle.
 */
export async function registerWithGoogle(
  profile: GoogleProfile,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  phone: string | null | undefined,
): Promise<TravelerSession> {
  if (await accounts.findByEmailIgnoreCase(profile.email)) return loginWithGoogle(profile);
  const first = trimToEmpty(firstName);
  const fullName = `${trimToEmpty(lastName)} ${first}`.trim();
  if (first === '') throw new InvalidRegistrationError('Vui lòng nhập tên của bạn.');
  if (fullName.length < 2 || fullName.length > 255) throw new InvalidRegistrationError('Vui lòng nhập họ và tên hợp lệ (2-255 ký tự).');
  const cleanedPhone = trimToEmpty(phone).replace(/[\s.()-]/g, '');
  const normalizedPhone = cleanedPhone === '' ? null : cleanedPhone;
  if (normalizedPhone != null) {
    if (!PHONE_REGEX.test(normalizedPhone)) throw new InvalidRegistrationError('Số điện thoại không đúng định dạng (VD: 0912345678).');
    const alternate = normalizedPhone.startsWith('+84') ? `0${normalizedPhone.slice(3)}` : `+84${normalizedPhone.slice(1)}`;
    if ((await accounts.existsByPhone(normalizedPhone)) || (await accounts.existsByPhone(alternate))) {
      throw new DuplicateFieldsError([{ field: 'phone', message: 'Số điện thoại này đã được đăng ký' }]);
    }
  }
  const now = nowLocal();
  const traveler = await accounts.insert({
    email: profile.email.trim().toLowerCase(),
    phone: normalizedPhone,
    fullName,
    avatarUrl: profile.picture,
    role: 'TRAVELER',
    emailVerifiedAt: now,
    lastLoginAt: now,
    createdAt: now,
  });
  await notifyAdminsNewTraveler(traveler);
  await loginEvent(traveler, profile.email, 'LOGIN_SUCCESS', audit.RESULT_SUCCESS, 'Đăng ký bằng Google', 'GOOGLE');
  return session(traveler);
}

/** Tài khoản đang hoạt động của phiên trang khách (định danh = subject của JWT); không có thì lỗi. */
async function activeAccount(identifier: string | null | undefined): Promise<AccountRow> {
  const account = await accounts.findByIdentifier((identifier ?? '').trim());
  if (!account) throw new IllegalArgumentError('Không tìm thấy tài khoản.');
  assertActive(account);
  return account;
}

/**
 * Khách tự sửa họ tên và số điện thoại. Email là danh tính đăng nhập nên không đổi ở đây. Trả lại phiên mới để giao diện
 * cập nhật tên / SĐT đang hiển thị. Tài khoản đăng nhập bằng SĐT (không có email) không đổi SĐT ở đây.
 */
export async function updateProfile(identifier: string | null | undefined, fullName: string | null | undefined, phone: string | null | undefined): Promise<TravelerSession> {
  const account = await activeAccount(identifier);
  const name = (fullName ?? '').trim();
  if (name.length < 2 || name.length > 255) throw new IllegalArgumentError('Vui lòng nhập họ và tên hợp lệ (2-255 ký tự).');
  const normalizedPhone = phone == null || phone.trim() === '' ? null : phone.trim().replace(/[\s.()-]/g, '');
  if (normalizedPhone != null && !PHONE_REGEX.test(normalizedPhone)) {
    throw new IllegalArgumentError('Số điện thoại không đúng định dạng (VD: 0912345678).');
  }
  if (account.email == null && normalizedPhone !== account.phone) {
    throw new IllegalArgumentError('Tài khoản đăng nhập bằng số điện thoại không đổi số điện thoại ở đây.');
  }
  if (normalizedPhone != null && normalizedPhone !== account.phone && (await accounts.existsByPhone(normalizedPhone))) {
    throw new DuplicateFieldsError([{ field: 'phone', message: 'Số điện thoại này đã được đăng ký' }]);
  }
  const saved = await accounts.update(account.id, { fullName: name, phone: normalizedPhone });
  return session(saved ?? account);
}

export interface TravelerProfile {
  email: string | null;
  fullName: string | null;
  picture: string | null;
  phone: string | null;
  phoneRequired: boolean;
}

/**
 * Tài khoản khách đang đăng nhập. Khách chưa có số điện thoại thì phoneRequired = true — trang khách yêu cầu bổ sung ở lần
 * vào sau. Tài khoản Admin / NCC dùng trang khách không bị yêu cầu.
 */
export async function profile(identifier: string | null | undefined): Promise<TravelerProfile> {
  const account = await activeAccount(identifier);
  const missing = account.phone == null || account.phone.trim() === '';
  return {
    email: account.email,
    fullName: account.fullName,
    picture: account.avatarUrl,
    phone: account.phone,
    phoneRequired: false,
  };
}

/** Khách bổ sung số điện thoại. Kiểm định dạng và trùng với tài khoản khác ở cả hai dạng 0… / +84…; trả phiên mới. */
export async function addPhone(identifier: string | null | undefined, phone: string | null | undefined): Promise<TravelerSession> {
  const account = await activeAccount(identifier);
  const normalized = trimToEmpty(phone).replace(/[\s.()-]/g, '');
  if (normalized === '') throw new IllegalArgumentError('Vui lòng nhập số điện thoại.');
  if (!PHONE_REGEX.test(normalized)) throw new IllegalArgumentError('Số điện thoại không đúng định dạng (VD: 0912345678).');
  if (account.email == null) throw new IllegalArgumentError('Tài khoản đăng nhập bằng số điện thoại không đổi số điện thoại ở đây.');
  const alternate = normalized.startsWith('+84') ? `0${normalized.slice(3)}` : `+84${normalized.slice(1)}`;
  const own = normalized === account.phone || alternate === account.phone;
  if (!own && ((await accounts.existsByPhone(normalized)) || (await accounts.existsByPhone(alternate)))) {
    throw new DuplicateFieldsError([{ field: 'phone', message: 'Số điện thoại này đã được đăng ký' }]);
  }
  const saved = await accounts.update(account.id, { phone: normalized });
  return session(saved ?? account);
}

export async function changePassword(identifier: string | null | undefined, currentPassword: string | null | undefined, newPassword: string | null | undefined): Promise<void> {
  const account = await activeAccount(identifier);

  if (account.passwordHash != null && currentPassword != null) {
    if (!(await passwords.checkPassword(currentPassword, account.passwordHash))) {
      await loginEvent(account, identifier ?? '', 'CHANGE_PASSWORD_FAILED', audit.RESULT_FAILURE, 'Mật khẩu hiện tại không đúng');
      throw new IllegalArgumentError('Mật khẩu hiện tại không đúng.');
    }
  } else if (account.passwordHash != null && currentPassword == null) {
    throw new IllegalArgumentError('Vui lòng nhập mật khẩu hiện tại.');
  }
  if (newPassword == null || newPassword.length < 8) throw new IllegalArgumentError('Mật khẩu mới phải chứa ít nhất 8 ký tự.');

  const hash = await passwords.encode(newPassword);
  await tx(async () => {
    // Mật khẩu dùng chung với cổng Admin / NCC: đổi mật khẩu thu hồi các phiên cổng đang mở (NFR-SEC-03).
    await accounts.update(account.id, {
      passwordHash: hash,
      ...(isPortalAccount(account) ? { tokenVersion: account.tokenVersion + 1 } : {}),
    });
  });
  await loginEvent(account, identifier ?? '', 'CHANGE_PASSWORD_SUCCESS', audit.RESULT_SUCCESS, 'Đổi mật khẩu thành công');
}
