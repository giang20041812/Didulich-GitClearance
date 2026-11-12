import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { PROVIDER_SERVICES } from '@/components/layout/providerServices';
import type { ProviderServiceType } from '@/types/partner';

interface ProviderTypePickerProps {
  /** Tên nhóm radio (mỗi chỗ dùng một tên riêng). */
  name: string;
  value: ProviderServiceType | null;
  onChange: (type: ProviderServiceType) => void;
  /** Bấm đúp vào thẻ: chọn và đi tiếp luôn. */
  onConfirm?: (type: ProviderServiceType) => void;
}

/**
 * Ba thẻ loại hình (Homestay / Trải nghiệm / Nhà xe) với ảnh 3D — dùng trong hộp "Bạn muốn cung cấp gì?" và bước đầu của
 * trang đăng ký. Là nhóm radio thật: Tab vào nhóm, phím mũi tên đổi lựa chọn, Space chọn.
 * Điện thoại: thẻ nằm ngang xếp dọc (ảnh trái, chữ phải); từ 640px: ba thẻ đứng cạnh nhau.
 */
export default function ProviderTypePicker({ name, value, onChange, onConfirm }: ProviderTypePickerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div role="radiogroup" aria-label="Loại hình nhà cung cấp" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {PROVIDER_SERVICES.map((option, index) => {
        const checked = value === option.type;
        const typeStyles = {
          HOMESTAY: {
            activeBorder: 'border-emerald-600 bg-emerald-50/60 shadow-md shadow-emerald-900/10',
            hoverBorder: 'hover:border-emerald-300',
            checkBg: 'bg-emerald-600',
            tagColor: 'text-emerald-700 bg-emerald-100/70',
          },
          EXPERIENCE: {
            activeBorder: 'border-orange-600 bg-orange-50/60 shadow-md shadow-orange-900/10',
            hoverBorder: 'hover:border-orange-300',
            checkBg: 'bg-orange-600',
            tagColor: 'text-orange-700 bg-orange-100/70',
          },
          TRANSPORT: {
            activeBorder: 'border-sky-600 bg-sky-50/60 shadow-md shadow-sky-900/10',
            hoverBorder: 'hover:border-sky-300',
            checkBg: 'bg-sky-600',
            tagColor: 'text-sky-700 bg-sky-100/70',
          },
        }[option.type];

        return (
          <motion.label
            key={option.type}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.06 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onDoubleClick={() => onConfirm?.(option.type)}
            className={`group relative flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white p-3.5 text-left transition-[border-color,box-shadow,background-color] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-primary)]/40 sm:min-h-[196px] sm:flex-col sm:items-start sm:justify-between sm:gap-3 sm:p-5 ${
              checked
                ? `${typeStyles.activeBorder}`
                : `border-slate-200 ${typeStyles.hoverBorder} hover:shadow-xs`
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.type}
              checked={checked}
              onChange={() => onChange(option.type)}
              className="sr-only"
            />
            <div className="relative">
              <motion.img
                src={option.image}
                alt=""
                aria-hidden
                draggable={false}
                width={96}
                height={96}
                animate={checked && !reduceMotion ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="h-14 w-14 shrink-0 select-none object-contain transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-[84px] sm:w-[84px]"
              />
            </div>
            <span className="min-w-0 flex-1 pr-6 sm:flex-none sm:pr-0">
              <span className="block text-base font-bold text-slate-900 sm:text-lg">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500">{option.description}</span>
            </span>
            <span
              aria-hidden
              className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
                checked ? `scale-100 ${typeStyles.checkBg} text-white opacity-100 shadow-xs` : 'scale-75 opacity-0'
              }`}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </motion.label>
        );
      })}
    </div>
  );
}
