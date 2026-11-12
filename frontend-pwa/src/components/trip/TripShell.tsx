import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import HomeMotifs from '@/components/home/HomeMotifs';
import { BRAND_NAME, LogoMark } from '@/components/ui/logo';

interface TripShellProps {
  children: ReactNode;
  /** Tên việc đang làm ("Tạo lịch trình", "Sửa lịch trình") — tên chuyến đi đã nằm ở đầu trình sửa, không lặp lại. */
  title?: string;
  onClose: () => void;
}

/**
 * Khung riêng của trang tạo / sửa lịch trình (không nằm trong bố cục có sidebar): một thanh trên cao 3.5rem gồm logo, tên
 * việc đang làm và nút thoát — tập trung vào một việc, như trang đặt phòng. Thanh tab ngày của lộ trình dính ngay dưới.
 */
export default function TripShell({ children, title, onClose }: TripShellProps) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-[linear-gradient(180deg,var(--color-canvas)_0%,#f1faf6_45%,#fbf7ee_100%)]">
      <HomeMotifs variant="journey" className="inset-x-0 bottom-0 top-14" />
      <header className="sticky top-0 z-30 border-b border-[#e3e8dc] bg-[var(--color-canvas)]/95 pt-[var(--safe-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label={`${BRAND_NAME} — trang chủ`}>
            <LogoMark size={30} />
            <span className="hidden text-sm font-extrabold text-[var(--color-ink-deep)] sm:inline">{BRAND_NAME}</span>
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            {title && <h1 className="truncate text-base font-extrabold text-[var(--color-ink-deep)]">{title}</h1>}
          </div>
          <button type="button" onClick={onClose} aria-label="Thoát" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#59766e] transition-colors hover:bg-black/5 hover:text-slate-800 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
