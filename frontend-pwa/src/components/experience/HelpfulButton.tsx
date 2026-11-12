import { Heart } from 'lucide-react';
import type { HelpfulVote } from './useHelpfulVotes';

interface HelpfulButtonProps {
  vote: HelpfulVote;
  onToggle: () => void;
  /** row: dòng thao tác của bài (bảng tin, đầu trang) · large: nút lớn cuối bài. */
  variant?: 'row' | 'large';
  className?: string;
}

/**
 * Nút "Hữu ích" (tim) của một lịch trình công khai: tim rỗng + số lượt; đã bấm thì tim đỏ đặc. Bài của chính khách chỉ hiện
 * số lượt (không bấm được).
 */
export default function HelpfulButton({ vote, onToggle, variant = 'row', className = '' }: HelpfulButtonProps) {
  const { helpful, own, count, busy, error } = vote;
  const label = own ? `${count} người thấy hữu ích — bài của bạn` : helpful ? `Bỏ Hữu ích (${count})` : `Bấm Hữu ích (${count})`;
  const heart = (
    <Heart
      className={`shrink-0 transition-transform duration-200 ${variant === 'large' ? 'h-5 w-5' : 'h-[18px] w-[18px]'} ${
        helpful ? 'scale-110 fill-rose-500 text-rose-500' : ''
      }`}
      aria-hidden
    />
  );

  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      {variant === 'large' ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={own || busy}
          aria-pressed={helpful}
          aria-label={label}
          title={own ? 'Bài của bạn' : undefined}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-extrabold transition-colors disabled:cursor-default cursor-pointer ${
            helpful
              ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100'
              : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:text-rose-600 hover:ring-rose-300'
          } ${own ? 'opacity-80' : ''}`}
        >
          {heart}
          <span className="tabular-nums">{count}</span>
          <span>Hữu ích</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={own || busy}
          aria-pressed={helpful}
          aria-label={label}
          title={own ? 'Bài của bạn' : undefined}
          className={`-mx-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full px-1.5 text-sm font-semibold transition-colors disabled:cursor-default cursor-pointer ${
            helpful ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          {heart}
          <span className="tabular-nums">{count}</span>
          <span>Hữu ích</span>
        </button>
      )}
      {error && <span role="alert" className="mt-0.5 text-[11px] font-semibold text-rose-600">{error}</span>}
    </span>
  );
}
