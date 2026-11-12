import { one, query, type Row } from './pool.js';

/** camelCase → snake_case (tên thuộc tính → tên cột). */
export function snake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** snake_case → camelCase. */
export function camelKey(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Đổi tên khóa một object (kể cả lồng nhau và mảng) từ snake_case sang camelCase — dùng cho kết quả to_jsonb(...). */
export function camelizeKeys<T = any>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelizeKeys(v)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[camelKey(k)] = camelizeKeys(v);
    return out as T;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value as T;
  return value as T;
}

/** Đánh dấu một giá trị là JSON (cột json/jsonb) để driver không đổi mảng JS thành mảng PostgreSQL. */
export class JsonValue {
  constructor(readonly value: unknown) {}
  toPostgres(): string | null {
    return this.value === undefined || this.value === null ? null : JSON.stringify(this.value);
  }
}
export const json = (value: unknown) => new JsonValue(value);

function param(v: unknown): unknown {
  return v instanceof JsonValue ? v.toPostgres() : v;
}

/** Danh sách placeholder $start..$start+n-1: placeholders(3, 2) → "$2, $3, $4". */
export function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(', ');
}

/**
 * INSERT một dòng; khóa object ở dạng camelCase (đổi thành snake_case cho tên cột), giá trị undefined bị bỏ qua
 * (để DB dùng DEFAULT). Trả về dòng vừa tạo (RETURNING *).
 */
export async function insertRow<T = Row>(table: string, data: Record<string, unknown>): Promise<T> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const cols = keys.map((k) => `"${snake(k)}"`).join(', ');
  const ph = placeholders(keys.length);
  const sql = keys.length
    ? `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`
    : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
  const row = await one<T>(sql, keys.map((k) => param(data[k])));
  return row as T;
}

/** UPDATE theo khóa chính; chỉ ghi các khóa không phải undefined. Trả về dòng sau khi cập nhật hoặc null nếu không có. */
export async function updateRow<T = Row>(
  table: string,
  id: number | string,
  patch: Record<string, unknown>,
  idColumn = 'id',
): Promise<T | null> {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return one<T>(`SELECT * FROM ${table} WHERE "${idColumn}" = $1`, [id]);
  const sets = keys.map((k, i) => `"${snake(k)}" = $${i + 1}`).join(', ');
  return one<T>(
    `UPDATE ${table} SET ${sets} WHERE "${idColumn}" = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => param(patch[k])), id],
  );
}

/** Chạy một câu SELECT có điều kiện động: whereParts nối bằng AND, params đánh số tự động qua {@link Where}. */
export class Where {
  private readonly parts: string[] = [];
  readonly params: unknown[] = [];

  /** Thêm tham số và trả về placeholder `$n`. */
  add(value: unknown): string {
    this.params.push(param(value));
    return `$${this.params.length}`;
  }

  /** Thêm điều kiện; chuỗi có thể chứa `?` — mỗi `?` được thay bằng một tham số lấy lần lượt từ `values`. */
  and(clause: string, ...values: unknown[]): this {
    let i = 0;
    this.parts.push(clause.replace(/\?/g, () => this.add(values[i++])));
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  toSql(prefix = 'WHERE'): string {
    return this.parts.length ? `${prefix} ${this.parts.join(' AND ')}` : '';
  }
}

/** Thoát ký tự đặc biệt của LIKE (\ % _) với ký tự thoát là \. */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Chạy SELECT và trả mảng (alias gọn của query). */
export const select = query;
