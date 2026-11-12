/**
 * Hệ lỗi của API. Tương ứng các exception của bản Java:
 *  - HttpError                = ResponseStatusException (mã trạng thái + lý do)
 *  - IllegalArgumentError     = IllegalArgumentException (dữ liệu không hợp lệ → 400)
 *  - IllegalStateError        = IllegalStateException (trạng thái không cho phép → 409)
 *  - BookingNotFoundError     = BookingNotFoundException (404, không lộ mã đơn nào tồn tại)
 */

export interface FieldError {
  field: string;
  message: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly reason: string;
  /** Trường bổ sung trộn vào thân lỗi (vd errorCode riêng, fieldErrors). */
  readonly extras: Record<string, unknown>;

  constructor(status: number, reason: string, extras: Record<string, unknown> = {}) {
    super(reason);
    this.name = 'HttpError';
    this.status = status;
    this.reason = reason;
    this.extras = extras;
  }
}

export class IllegalArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalArgumentError';
  }
}

export class IllegalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStateError';
  }
}

export class BookingNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy đơn đặt phòng.');
    this.name = 'BookingNotFoundError';
  }
}

/** Đăng ký trùng thông tin (409) với đủ danh sách trường bị trùng. */
export class DuplicateFieldsError extends HttpError {
  readonly fieldErrors: FieldError[];
  constructor(fieldErrors: FieldError[]) {
    super(409, `${fieldErrors.map((f) => f.message).join('. ')}.`);
    this.name = 'DuplicateFieldsError';
    this.fieldErrors = fieldErrors;
  }
}

/** Dữ liệu nhập không hợp lệ (400) ở một hoặc nhiều trường. */
export class InvalidFieldsError extends HttpError {
  readonly fieldErrors: FieldError[];
  constructor(fieldErrors: FieldError[]) {
    super(400, fieldErrors.map((f) => f.message).join(' '));
    this.name = 'InvalidFieldsError';
    this.fieldErrors = fieldErrors;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const tooManyRequests = (message = 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.') =>
  new HttpError(429, message);

/** Lỗi vi phạm ràng buộc dữ liệu của PostgreSQL (mã 23xxx): trùng khóa, CHECK, khóa ngoại... */
export function isDataIntegrityViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('23');
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === '23505';
}

/** Tên ràng buộc bị vi phạm (nếu PostgreSQL cho biết). */
export function violatedConstraint(err: unknown): string | undefined {
  const c = (err as { constraint?: unknown } | null)?.constraint;
  return typeof c === 'string' ? c : undefined;
}
