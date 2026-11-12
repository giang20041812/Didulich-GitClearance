import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

const PARAM = 'status';
/** "Tất cả" (giá trị rỗng) ghi lên URL bằng từ khóa này để phân biệt với "không có tham số" (= tab mặc định của trang). */
const ALL = 'ALL';

/**
 * Tab trạng thái lưu trên URL (?status=...). Giá trị lấy trực tiếp từ URL nên tải lại / gửi link vẫn giữ đúng tab.
 * - Không có tham số hoặc giá trị không hợp lệ → `defaultValue` của trang.
 * - `?status=ALL` → "Tất cả" (chuỗi rỗng).
 * - Chọn lại tab mặc định thì xóa tham số để URL gọn.
 * Chỉ đụng tham số `status`; các tham số khác trên URL được giữ nguyên.
 */
export function useUrlStatus<T extends string>(allowed: readonly T[], defaultValue: T | ''): [T | '', (next: T | '') => void] {
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);
  const value: T | '' = raw === null ? defaultValue : raw === ALL ? '' : (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;

  const set = useCallback(
    (next: T | '') => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (next === defaultValue) copy.delete(PARAM);
          else copy.set(PARAM, next === '' ? ALL : next);
          return copy;
        },
        { replace: true, state },
      );
    },
    [defaultValue, setParams, state],
  );

  return [value, set];
}

/** Xóa tham số trạng thái khi chuyển sang mục khác của cổng quản trị (mỗi trang có bộ trạng thái riêng). */
export function clearStatusParam(prev: URLSearchParams): URLSearchParams {
  const copy = new URLSearchParams(prev);
  copy.delete(PARAM);
  return copy;
}
