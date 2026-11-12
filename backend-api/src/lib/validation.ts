import { z } from 'zod';
import { isConstraintIssue } from './http.js';
import { isValidDate } from './time.js';

/**
 * Khối dựng schema zod cho các DTO có ràng buộc kiểu Bean Validation. Thông báo của ràng buộc được trả nguyên văn cho
 * khách (xem parseBody): thiếu / null → thông báo @NotNull / @NotBlank; sai kiểu → "Dữ liệu gửi lên không hợp lệ.".
 * Với một trường, ràng buộc được kiểm theo thứ tự: bắt buộc → không trống → độ dài → mẫu; lỗi đầu tiên là lỗi báo về.
 */

export const MSG_INVALID = 'Dữ liệu gửi lên không hợp lệ.';

/** errorMap: thiếu hoặc null → `message`; lỗi khác giữ nguyên mặc định (parseBody coi là sai kiểu). */
export const whenMissing = (message: string) => ({
  errorMap: (issue: z.ZodIssueOptionalMessage, ctx: { defaultError: string }) =>
    issue.code === 'invalid_type' && (issue.received === 'undefined' || issue.received === 'null') ? { message } : { message: ctx.defaultError },
});

export interface TextRules {
  /** @NotNull: thông báo khi thiếu / null. */
  required?: string;
  /** @NotBlank: thông báo khi thiếu, null hoặc chỉ có khoảng trắng. */
  notBlank?: string;
  /** @Size(min). */
  min?: [number, string];
  /** @Size(max). */
  max?: [number, string];
  /** @Pattern (so khớp toàn chuỗi do regex tự neo ^$). */
  pattern?: [RegExp, string];
}

/** Chuỗi có ràng buộc (bắt buộc có mặt). */
export function text(rules: TextRules) {
  const schema = z.string(whenMissing(rules.notBlank ?? rules.required ?? MSG_INVALID)).superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (rules.notBlank && s.trim() === '') return fail(rules.notBlank);
    if (rules.min && s.length < rules.min[0]) return fail(rules.min[1]);
    if (rules.max && s.length > rules.max[0]) return fail(rules.max[1]);
    if (rules.pattern && !rules.pattern[0].test(s)) return fail(rules.pattern[1]);
  });
  return schema;
}

export interface IntRules {
  required?: string;
  min?: [number, string];
  max?: [number, string];
}

/** Số nguyên (Integer / Long / Byte) có ràng buộc. */
export function int(rules: IntRules) {
  const schema = z.number(whenMissing(rules.required ?? MSG_INVALID)).int().superRefine((n, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (rules.min && n < rules.min[0]) return fail(rules.min[1]);
    if (rules.max && n > rules.max[0]) return fail(rules.max[1]);
  });
  return schema;
}

export interface NumRules {
  required?: string;
  /** @DecimalMin(value, inclusive = true) / @Min. */
  min?: [number, string];
  /** @DecimalMin(value, inclusive = false). */
  gt?: [number, string];
  /** @DecimalMax / @Max. */
  max?: [number, string];
  /** @Digits(integer, fraction = 0): số nguyên không quá `integer` chữ số. */
  digits?: [number, string];
}

/** Số (BigDecimal / Double) có ràng buộc. */
export function num(rules: NumRules) {
  return z.number(whenMissing(rules.required ?? MSG_INVALID)).superRefine((n, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (rules.min && n < rules.min[0]) return fail(rules.min[1]);
    if (rules.gt && n <= rules.gt[0]) return fail(rules.gt[1]);
    if (rules.max && n > rules.max[0]) return fail(rules.max[1]);
    if (rules.digits && (!Number.isInteger(n) || Math.abs(n) >= 10 ** rules.digits[0])) return fail(rules.digits[1]);
  });
}

/** Như {@link num} nhưng cho phép thiếu / null. */
export const optNum = (rules: NumRules) => num(rules).nullish();

export interface EachRules {
  /** @NotNull: thông báo khi thiếu / null. */
  required?: string;
  /** @Size(max). */
  max?: [number, string];
}

/**
 * Danh sách có ràng buộc trên từng phần tử (@Valid List<...>): `factory(path)` dựng schema của phần tử thứ i với tên trường
 * "name[i]" để thông báo mặc định của Bean Validation đúng như Spring ("photos[0].imageId ..."). @Size của danh sách kiểm trước.
 * Không có `required` thì danh sách được phép thiếu / null.
 */
export function each<T extends z.ZodTypeAny>(name: string, factory: (path: string) => T, rules: EachRules = {}) {
  const schema = z.array(z.unknown(), whenMissing(rules.required ?? MSG_INVALID)).transform((items, ctx): Array<z.output<T>> => {
    if (rules.max && items.length > rules.max[0]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: rules.max[1] });
      return z.NEVER;
    }
    const out: Array<z.output<T>> = [];
    for (let i = 0; i < items.length; i++) {
      const r = factory(`${name}[${i}]`).safeParse(items[i]);
      if (!r.success) {
        const constraint = r.error.issues.find(isConstraintIssue);
        if (constraint) ctx.addIssue({ code: z.ZodIssueCode.custom, message: constraint.message });
        else ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: 'object', received: typeof items[i] as never, message: 'Expected valid element' });
        return z.NEVER;
      }
      out.push(r.data);
    }
    return out;
  });
  return rules.required ? schema : schema.nullish();
}

/** LocalDate ("YYYY-MM-DD"); sai định dạng → "Dữ liệu gửi lên không hợp lệ.". */
export function date(required?: string) {
  const schema = z.string(whenMissing(required ?? MSG_INVALID)).refine(isValidDate, MSG_INVALID);
  return schema;
}

/** Như {@link text} nhưng cho phép thiếu / null (các ràng buộc còn lại chỉ áp khi có giá trị). */
export const optText = (rules: TextRules) => text(rules).nullish();

/** Như {@link int} nhưng cho phép thiếu / null. */
export const optInt = (rules: IntRules) => int(rules).nullish();

/** Như {@link date} nhưng cho phép thiếu / null. */
export const optDate = () => date().nullish();

/**
 * Thông báo mặc định của Bean Validation (tiếng Anh) khi ràng buộc không khai báo `message`, theo cách PartnerOperationErrors hiển
 * thị: "Dữ liệu không hợp lệ: <trường> <thông báo>". Thông báo tiếng Việt khai báo sẵn trên DTO được hiển thị nguyên văn.
 */
const prefix = (field: string, message: string): string => `Dữ liệu không hợp lệ: ${field} ${message}`;
export const std = {
  blank: (field: string) => prefix(field, 'must not be blank'),
  nul: (field: string) => prefix(field, 'must not be null'),
  size: (field: string, min: number, max: number) => prefix(field, `size must be between ${min} and ${max}`),
  pattern: (field: string, regexp: string) => prefix(field, `must match "${regexp}"`),
  email: (field: string) => prefix(field, 'must be a well-formed email address'),
  min: (field: string, value: number) => prefix(field, `must be greater than or equal to ${value}`),
  max: (field: string, value: number) => prefix(field, `must be less than or equal to ${value}`),
  greaterThan: (field: string, value: number) => prefix(field, `must be greater than ${value}`),
  digits: (field: string, integer: number, fraction: number) => prefix(field, `numeric value out of bounds (<${integer} digits>.<${fraction} digits> expected)`),
};
