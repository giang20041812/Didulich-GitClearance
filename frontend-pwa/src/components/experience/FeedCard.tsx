import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, Mountain } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { mediaUrl } from '@/lib/mediaUrl';
import type { FeedItem } from '@/types/journey';
import HelpfulButton from './HelpfulButton';
import type { HelpfulVote } from './useHelpfulVotes';
import { avatarTone, feedExcerpt, feedMeta, feedTitle, ownerInitial, relativeDay } from './feedFormat';

interface FeedCardProps {
  item: FeedItem;
  vote: HelpfulVote;
  onToggleHelpful: () => void;
}

/**
 * Một lịch trình du khách đã đăng công khai (mục Khám phá của trang Lịch trình): ảnh check-in bên trái; bên phải tên chuyến,
 * "2 ngày · 4 điểm · nghỉ ở đâu", một đoạn trích (lưu bút, chưa có thì các điểm theo thứ tự đi), người đăng và "Hữu ích".
 * Ảnh và tên mở trang lịch trình (/j/{mã}) — chia sẻ link, áp dụng lịch trình nằm ở trang đó.
 */
export default function FeedCard({ item, vote, onToggleHelpful }: FeedCardProps) {
  const title = feedTitle(item);
  const cover = mediaUrl(item.coverImageUrl);
  const href = `/j/${item.shareToken}`;
  const excerpt = feedExcerpt(item);

  return (
    <article className="group flex gap-3.5 px-3.5 py-4 sm:gap-5 sm:p-5">
      {/* Ảnh và tên cùng mở bài — ảnh không nhận phím Tab để bàn phím chỉ dừng một lần */}
      <Link
        to={href}
        state={{ from: 'feed' }}
        tabIndex={-1}
        aria-hidden
        className="relative block h-[104px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-[136px] sm:w-[176px]"
      >
        {cover
          ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out" />
          : <ImagePlaceholder Icon={Mountain} />}
        <span
          className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold shadow-sm sm:bottom-2 sm:left-2 sm:px-2 sm:text-[11px] ${
            item.completed ? 'bg-emerald-50/95 text-emerald-700' : 'bg-amber-50/95 text-amber-800'
          }`}
        >
          {item.completed ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
          {item.completed ? 'Đã đi' : 'Sắp đi'}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[15px] font-extrabold leading-snug text-slate-900 sm:text-lg">
          <Link
            to={href}
            state={{ from: 'feed' }}
            className="line-clamp-2 rounded transition-colors hover:text-[#0a7d64] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a7d64]/50"
          >
            {title}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-xs font-semibold text-[#59766e] sm:text-[13px]">{feedMeta(item, title)}</p>
        {excerpt && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-600 sm:text-sm">{excerpt}</p>}

        <div className="mt-auto flex min-w-0 items-center gap-2 pt-2.5">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold sm:h-7 sm:w-7 sm:text-xs ${avatarTone(item.ownerName)}`} aria-hidden>
            {ownerInitial(item.ownerName)}
          </span>
          <span className="min-w-0 truncate text-[13px] font-bold text-slate-600">{item.ownerName || 'Du khách'}</span>
          {item.publishedAt && <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">· {relativeDay(item.publishedAt)}</span>}
          <HelpfulButton vote={vote} onToggle={onToggleHelpful} className="ml-auto shrink-0" />
        </div>
      </div>
    </article>
  );
}
