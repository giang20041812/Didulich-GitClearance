import type { ChangeEvent } from 'react';
import { ui } from '@/lib/partnerUi';

const MAX_DIGITS = 12; // backend: @DecimalMax("999999999999")
const format = (n: number | null) => (n == null ? '' : new Intl.NumberFormat('vi-VN').format(n));

/**
 * Ô nhập số tiền (VND) cho NCC: xóa được hết (ô trống = null, không tự hiện lại 0), tự thêm dấu chấm hàng nghìn,
 * có đơn vị "đ". Bắt buộc mà để trống thì báo "Giá phòng phải lớn hơn 0" (UC-NCC-04).
 */
export default function MoneyInput({ value, onChange, required, disabled, placeholder, invalidMessage = 'Giá phòng phải lớn hơn 0', ariaLabel }: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  invalidMessage?: string;
  ariaLabel?: string;
}) {
  function handle(e: ChangeEvent<HTMLInputElement>) {
    e.currentTarget.setCustomValidity('');
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
    const next = digits === '' ? null : Number(digits);
    // Số 0 coi như trống: giá phải lớn hơn 0.
    onChange(next === 0 ? null : next);
  }

  return (
    <div className="relative">
      <input
        className={`${ui.input} pr-9 tabular-nums`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
        placeholder={placeholder ?? 'VD: 500.000'}
        value={format(value ?? null)}
        onChange={handle}
        onInvalid={(e) => e.currentTarget.setCustomValidity(invalidMessage)}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">đ</span>
    </div>
  );
}
