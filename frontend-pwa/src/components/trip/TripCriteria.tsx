import { useId, useMemo } from 'react';
import { Check } from 'lucide-react';
import type { TripFilters, TripTag, TripTemplate } from '@/types/trip';
import { cleanFilters, criteriaRows, toggleCriterion } from '@/lib/tripPlanner';
import { chipClass } from './tripUi';

interface TripCriteriaProps {
  /** Lịch trình gợi ý của tỉnh — tag nào hiện tùy theo các lịch trình này. */
  templates: TripTemplate[];
  tags: TripTag[];
  filters: TripFilters;
  /** Tiêu chí mới (đã làm sạch: bỏ chọn ăn uống thì trải nghiệm bỏ theo). */
  onChange: (filters: TripFilters) => void;
  className?: string;
}

/**
 * Chọn tiêu chí lần lượt, gọn một khung: lúc đầu chỉ có hàng Thời gian (2N1Đ, 3N2Đ); chọn xong hàng nào thì hàng tiêu chí
 * kế tiếp trượt vào (Ăn uống → Trải nghiệm). Chỉ là tag tiêu chí — không giá, không mô tả, không chọn gói; lịch trình gợi
 * ý do trang chứa tự dựng theo tiêu chí. Tag làm hết lịch trình khớp thì mờ đi.
 */
export default function TripCriteria({ templates, tags, filters, onChange, className = '' }: TripCriteriaProps) {
  const baseId = useId();
  const rows = useMemo(() => criteriaRows(templates, tags, filters), [templates, tags, filters]);
  if (rows.length === 0) return null;

  const pick = (key: Parameters<typeof toggleCriterion>[1], value: string) =>
    onChange(cleanFilters(templates, tags, toggleCriterion(filters, key, value)));

  return (
    // Điện thoại: tên tiêu chí nằm trên hàng tag (tag dùng hết bề ngang); từ 640px: cột tên bên trái.
    <div className={`flex flex-col gap-3 rounded-lg bg-white p-3 ring-1 ring-[#e3e8dc] sm:grid sm:grid-cols-[92px_minmax(0,1fr)] sm:items-start sm:gap-x-2 sm:gap-y-2.5 sm:p-4 ${className}`}>
      {rows.map((row, index) => {
        const labelId = `${baseId}-${row.key}`;
        // Hàng đầu đứng yên; hàng sau trượt vào khi vừa hiện.
        const enter = index > 0 ? 'step-in' : '';
        return (
          <div key={row.key} className="flex flex-col gap-1.5 sm:contents">
            <span id={labelId} className={`text-xs font-extrabold text-[#59766e] sm:pt-1.5 ${enter}`}>{row.label}</span>
            <div
              role={row.multi ? 'group' : 'radiogroup'}
              aria-labelledby={labelId}
              className={`flex min-w-0 flex-wrap gap-1.5 ${enter}`}
            >
              {row.options.map((option) => {
                const active = row.selected.includes(option.value);
                const disabled = !active && option.count === 0;
                return (
                  <button
                    key={option.value}
                    type="button"
                    {...(row.multi ? { 'aria-pressed': active } : { role: 'radio', 'aria-checked': active })}
                    disabled={disabled}
                    onClick={() => pick(row.key, option.value)}
                    className={chipClass(active, disabled, 'sm')}
                  >
                    {active && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
