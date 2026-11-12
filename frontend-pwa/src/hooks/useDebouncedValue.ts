import { useEffect, useState } from 'react';

/** Trả về giá trị sau khi người dùng ngừng thay đổi `ms` mili giây (dùng cho ô tìm kiếm). */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
