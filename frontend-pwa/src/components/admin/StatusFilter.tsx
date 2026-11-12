import type { ReactNode } from 'react';
import { UnderlineTabs, type TabItem } from './AdminFilters';
import type { StatusTone } from './StatusBadge';

export interface StatusFilterItem<T extends string> {
  /** Giá trị trạng thái dùng để gọi API / lọc (không gồm "Tất cả"). */
  value: T;
  /** Tên hiển thị trên tab. */
  label: string;
  tone: StatusTone;
}

interface StatusFilterProps<T extends string> {
  /** Danh sách trạng thái của TRANG NÀY; tab "Tất cả" luôn được thêm ở đầu. */
  items: readonly StatusFilterItem<T>[];
  /** '' = Tất cả. */
  value: T | '';
  onChange: (value: T | '') => void;
  /** Số lượng từng tab; khóa '' là tổng của "Tất cả". Thiếu/null thì không hiện số. */
  counts?: Record<string, number | null | undefined>;
  ariaLabel: string;
  /** Phần phụ đặt cuối hàng tab. */
  trailing?: ReactNode;
}

/** Hàng tab lọc theo trạng thái dùng chung: "● Tên  số" cho từng trạng thái, đặt ở đầu khung danh sách. */
export default function StatusFilter<T extends string>({ items, value, onChange, counts, ariaLabel, trailing }: StatusFilterProps<T>) {
  const tabs: TabItem<T>[] = [
    { value: '', label: 'Tất cả', tone: 'brand', count: counts?.[''] ?? null },
    ...items.map((i) => ({ value: i.value, label: i.label, tone: i.tone, count: counts?.[i.value] ?? null })),
  ];
  return <UnderlineTabs ariaLabel={ariaLabel} items={tabs} value={value} onChange={onChange} trailing={trailing} />;
}
