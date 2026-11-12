import { query, tx } from '../db/pool.js';
import { insertRow, json } from '../db/sql.js';
import { PROVIDER_SERVICE_TYPE_LABEL, type ProviderApplicationStatus, type ProviderServiceType } from '../domain/enums.js';
import { DuplicateFieldsError, HttpError, IllegalArgumentError, type FieldError } from '../lib/errors.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as passwords from '../security/passwordEncoder.js';
import * as recorder from './notificationRecorder.js';
import * as details from './providerApplicationDetails.js';

/**
 * UC-NCC-08: NCC tự đăng ký → hồ sơ PENDING trong provider_application (mật khẩu đã băm BCrypt). Provider/Account không có trạng
 * thái chờ duyệt, nên tài khoản đăng nhập chỉ được tạo khi Admin duyệt hồ sơ (adminProviderApplicationService).
 */

export interface RegisterInput {
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  password: string;
  address: string;
  businessLicenseNo?: string | null;
  description?: string | null;
  /** Loại hình đăng ký; giao diện cũ không gửi thì coi là HOMESTAY. */
  serviceType?: ProviderServiceType | null;
  /** Câu trả lời riêng của loại hình — xem providerApplicationDetails. */
  details?: Record<string, unknown> | null;
}

export interface ProviderApplicationRow {
  id: number;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  address: string;
  businessLicenseNo: string | null;
  description: string | null;
  passwordHash: string;
  status: ProviderApplicationStatus;
  reviewNote: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  providerId: number | null;
  createdAt: string;
  serviceType: ProviderServiceType;
  details: Record<string, unknown> | null;
}

const blankToNull = (s: string | null | undefined): string | null => (s == null || s.trim() === '' ? null : s.trim());

async function identifierTaken(identifier: string): Promise<boolean> {
  return (await accounts.existsByEmail(identifier)) || (await accounts.existsByPhone(identifier));
}

async function pendingFor(identifier: string): Promise<boolean> {
  const rows = await query(
    `SELECT id FROM provider_application WHERE (contact_phone = $1 OR lower(contact_email) = lower($1)) AND status = 'PENDING' LIMIT 1`,
    [identifier],
  );
  return rows.length > 0;
}

export function register(input: RegisterInput) {
  return tx(async () => {
    const phone = input.contactPhone.trim();
    let email = blankToNull(input.contactEmail);
    const businessLicenseNo = blankToNull(input.businessLicenseNo);
    if (!/^(0|\+84)[35789][0-9]{8}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không đúng định dạng.');
    if (email != null) email = email.toLowerCase();
    const alternatePhone = phone.startsWith('+84') ? `0${phone.slice(3)}` : `+84${phone.slice(1)}`;
    // Kiểm tra đủ mọi trường trước khi báo, để NCC thấy cùng lúc tất cả thông tin bị trùng (tên trường khớp RegisterInput).
    const duplicates: FieldError[] = [];
    if ((await identifierTaken(phone)) || (await identifierTaken(alternatePhone))) {
      duplicates.push({ field: 'contactPhone', message: 'Số điện thoại này đã được đăng ký' });
    } else if ((await pendingFor(phone)) || (await pendingFor(alternatePhone))) {
      duplicates.push({ field: 'contactPhone', message: 'Số điện thoại này đã có hồ sơ đăng ký đang chờ duyệt' });
    }
    if (email != null && (await identifierTaken(email))) duplicates.push({ field: 'contactEmail', message: 'Email này đã được sử dụng' });
    else if (email != null && (await pendingFor(email))) duplicates.push({ field: 'contactEmail', message: 'Email này đã có hồ sơ đăng ký đang chờ duyệt' });
    const serviceType = input.serviceType ?? 'HOMESTAY';
    let normalized: Record<string, unknown> | null;
    try {
      normalized = details.normalize(serviceType, input.details);
    } catch (err) {
      if (err instanceof IllegalArgumentError) throw new HttpError(400, err.message);
      throw err;
    }
    if (duplicates.length > 0) throw new DuplicateFieldsError(duplicates);
    const application = await insertRow<ProviderApplicationRow>('provider_application', {
      businessName: input.businessName.trim(),
      contactName: input.contactName.trim(),
      contactPhone: phone,
      contactEmail: email,
      address: input.address.trim(),
      businessLicenseNo,
      description: blankToNull(input.description),
      serviceType,
      details: json(normalized),
      passwordHash: await passwords.encode(input.password),
      status: 'PENDING',
      createdAt: nowLocal(),
    });
    await recorder.toAdmins(
      'ADMIN_NEW_PROVIDER_APPLICATION',
      'ProviderApplication',
      application.id,
      `Nhà cung cấp "${application.businessName}" (${application.contactName}) vừa gửi hồ sơ đăng ký ${PROVIDER_SERVICE_TYPE_LABEL[serviceType]}, đang chờ duyệt.`,
      'applications',
    );
    return {
      applicationId: application.id,
      status: application.status,
      message: `Đã tiếp nhận hồ sơ đăng ký Nhà cung cấp. Mã hồ sơ: ${application.id}. Quản trị viên sẽ thẩm định; bạn đăng nhập được bằng số điện thoại/email này sau khi hồ sơ được duyệt.`,
    };
  });
}

/** UC-NCC-01 "Xem trạng thái": tra cứu bằng mã hồ sơ + số điện thoại đã đăng ký. */
export async function status(applicationId: number, contactPhone: string) {
  const [a] = await query<ProviderApplicationRow>('SELECT * FROM provider_application WHERE id = $1', [applicationId]);
  if (!a || a.contactPhone !== contactPhone.trim()) throw new HttpError(404, 'Không tìm thấy hồ sơ với mã và số điện thoại này.');
  const label =
    a.status === 'PENDING' ? 'Hồ sơ đang chờ xét duyệt' : a.status === 'APPROVED' ? 'Hồ sơ đã được duyệt — bạn có thể đăng nhập Cổng đối tác' : 'Hồ sơ chưa được duyệt';
  return {
    applicationId: a.id,
    businessName: a.businessName,
    status: a.status,
    statusLabel: label,
    reviewNote: a.reviewNote,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt,
    serviceType: a.serviceType,
  };
}
