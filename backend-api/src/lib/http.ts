import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { HttpError } from './errors.js';
import { isValidDate } from './time.js';

/** Tham số sai kiểu / sai định dạng (MethodArgumentTypeMismatchException, MissingServletRequestParameterException). */
export class BadParamError extends Error {
  constructor(message = 'Dữ liệu gửi lên không hợp lệ.') {
    super(message);
    this.name = 'BadParamError';
  }
}

/** Dữ liệu body vi phạm ràng buộc khai báo (MethodArgumentNotValidException): thông báo đầu tiên của DTO. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Body không phải JSON hợp lệ / sai kiểu (HttpMessageNotReadableException). */
export class UnreadableBodyError extends Error {
  constructor() {
    super('Dữ liệu gửi lên không hợp lệ.');
    this.name = 'UnreadableBodyError';
  }
}

type Raw = string | string[] | undefined | unknown;

function first(raw: Raw): string | undefined {
  if (Array.isArray(raw)) return raw.length ? String(raw[0]) : undefined;
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
}

/** Chuỗi (có thể rỗng); undefined nếu không có tham số. */
export function strParam(raw: Raw): string | undefined {
  return first(raw);
}

/** Số nguyên; undefined nếu không có; BadParamError nếu không phải số. */
export function intParam(raw: Raw): number | undefined {
  const s = first(raw);
  if (s === undefined || s === '') return undefined;
  if (!/^[+-]?\d+$/.test(s.trim())) throw new BadParamError();
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new BadParamError();
  return n;
}

/** Số nguyên với giá trị mặc định (defaultValue = "0" của @RequestParam). */
export function intParamOr(raw: Raw, fallback: number): number {
  return intParam(raw) ?? fallback;
}

/** Số thực. */
export function numParam(raw: Raw): number | undefined {
  const s = first(raw);
  if (s === undefined || s === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new BadParamError();
  return n;
}

export function boolParam(raw: Raw): boolean | undefined {
  const s = first(raw);
  if (s === undefined || s === '') return undefined;
  const v = s.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new BadParamError();
}

/** Ngày ISO yyyy-MM-dd (@DateTimeFormat(iso = DATE)). */
export function dateParam(raw: Raw): string | undefined {
  const s = first(raw);
  if (s === undefined || s === '') return undefined;
  if (!isValidDate(s)) throw new BadParamError();
  return s;
}

/** Giá trị thuộc một enum; undefined nếu không có; BadParamError nếu lạ. */
export function enumParam<T extends string>(raw: Raw, allowed: readonly T[]): T | undefined {
  const s = first(raw);
  if (s === undefined || s === '') return undefined;
  if (!(allowed as readonly string[]).includes(s)) throw new BadParamError();
  return s as T;
}

/** Danh sách: lặp tham số (a=1&a=2) hoặc phân tách bằng dấu phẩy (a=1,2) như Spring. */
export function listParam(raw: Raw): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  const out = arr.flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v !== '');
  return out.length ? out : undefined;
}

export function enumListParam<T extends string>(raw: Raw, allowed: readonly T[]): T[] | undefined {
  const list = listParam(raw);
  if (!list) return undefined;
  for (const v of list) if (!(allowed as readonly string[]).includes(v)) throw new BadParamError();
  return list as T[];
}

export function longListParam(raw: Raw): number[] | undefined {
  const list = listParam(raw);
  if (!list) return undefined;
  return list.map((v) => {
    if (!/^[+-]?\d+$/.test(v)) throw new BadParamError();
    return Number(v);
  });
}

/**
 * Pageable của Spring (PageableHandlerMethodArgumentResolver): page < 0 hoặc không phải số → 0; size <= 0 hoặc không phải
 * số → mặc định; size tối đa 2000; sort=thuộc_tính[,asc|desc] (tham số lặp lại được, lấy tham số đầu).
 */
export function springPageable(
  query: Record<string, unknown>,
  defaultSize: number,
): { page: number; size: number; sortProperty?: string; sortDirection: 'asc' | 'desc' } {
  const p = Number.parseInt(String(first(query.page) ?? ''), 10);
  const s = Number.parseInt(String(first(query.size) ?? ''), 10);
  const rawSort = first(query.sort);
  let sortProperty: string | undefined;
  let sortDirection: 'asc' | 'desc' = 'asc';
  if (rawSort) {
    const [prop, dir] = rawSort.split(',');
    if (prop && prop.trim()) sortProperty = prop.trim();
    if (dir && dir.trim().toLowerCase() === 'desc') sortDirection = 'desc';
  }
  return {
    page: Number.isFinite(p) && p > 0 ? p : 0,
    size: Number.isFinite(s) && s > 0 ? Math.min(s, 2000) : defaultSize,
    sortProperty,
    sortDirection,
  };
}

/** @PathVariable Long id */
export function pathId(req: Request, name = 'id'): number {
  const raw = req.params[name];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new BadParamError();
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new BadParamError();
  return n;
}

/** Tham số bắt buộc (@RequestParam không required=false). */
export function required<T>(value: T | undefined, message = 'Dữ liệu gửi lên không hợp lệ.'): T {
  if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
    throw new BadParamError(message);
  }
  return value;
}

/** Vi phạm ràng buộc khai báo (có thông báo riêng) — khác với sai kiểu mà Jackson không đọc được. */
export function isConstraintIssue(i: z.ZodIssue): boolean {
  return (
    i.code === 'custom' ||
    i.code === 'too_small' ||
    i.code === 'too_big' ||
    i.code === 'invalid_string' ||
    // Trường bắt buộc (@NotNull / @NotBlank) thiếu hoặc null mà schema khai báo thông báo riêng cũng tính là ràng buộc.
    (i.code === 'invalid_type' && (i.received === 'undefined' || i.received === 'null') && i.message !== 'Required' && !i.message.startsWith('Expected '))
  );
}

/**
 * Kiểm tra body theo schema zod. Lỗi đầu tiên → ValidationError với thông báo khai báo trong schema (tiếng Việt);
 * body không phải object / sai kiểu → UnreadableBodyError (400).
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  // Ưu tiên ràng buộc có thông báo riêng (@NotBlank / @Size / @Min...); lỗi sai kiểu mà Jackson không đọc được
  // (invalid_type, enum lạ...) → 400 chung "Dữ liệu gửi lên không hợp lệ."
  // Trường bắt buộc (@NotNull / @NotBlank) thiếu hoặc null mà schema khai báo thông báo riêng cũng tính là ràng buộc.
  const constraint = result.error.issues.find(isConstraintIssue);
  if (constraint) throw new ValidationError(constraint.message);
  throw new UnreadableBodyError();
}

/** Body bắt buộc (@RequestBody) — thiếu body → 400. */
export function requireBody(req: Request): Record<string, unknown> {
  const body = req.body as unknown;
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new UnreadableBodyError();
  }
  return body as Record<string, unknown>;
}

/** Body tùy chọn (@RequestBody(required = false)): thiếu body → undefined. */
export function optionalBody(req: Request): Record<string, unknown> | undefined {
  const body = req.body as unknown;
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'object' || Array.isArray(body)) throw new UnreadableBodyError();
  if (Object.keys(body as object).length === 0 && !hasJsonBody(req)) return undefined;
  return body as Record<string, unknown>;
}

function hasJsonBody(req: Request): boolean {
  const len = req.header('content-length');
  return len !== undefined && Number(len) > 2;
}

/** Lỗi 401 "không xác định được tài khoản". */
export function unauthorizedAccount(): HttpError {
  return new HttpError(401, 'Không xác định được tài khoản admin');
}
