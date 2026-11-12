/** Gom danh sách theo khóa, giữ thứ tự gốc trong từng nhóm. */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Map từ khóa → phần tử (phần tử sau đè phần tử trước). */
export function indexBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

/** Gom các dòng {id, value} thành Map id → danh sách value (giữ thứ tự của câu truy vấn). */
export function groupedValues<V>(rows: ReadonlyArray<{ id: number; value: V }>): Map<number, V[]> {
  const map = new Map<number, V[]>();
  for (const r of rows) {
    const list = map.get(r.id);
    if (list) list.push(r.value);
    else map.set(r.id, [r.value]);
  }
  return map;
}

/** Bỏ trùng giữ thứ tự xuất hiện đầu tiên. */
export function distinct<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Chia mảng thành các lô tối đa `size` phần tử. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Bỏ các khóa có giá trị null/undefined khỏi object (tương đương @JsonInclude(NON_NULL) cho từng trường). */
export function omitNullish<T extends Record<string, unknown>>(obj: T, keys: ReadonlyArray<keyof T>): Partial<T> {
  const out: Record<string, unknown> = { ...obj };
  for (const k of keys) if (out[k as string] == null) delete out[k as string];
  return out as Partial<T>;
}
