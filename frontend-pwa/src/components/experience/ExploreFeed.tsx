import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronDown, Loader2, RefreshCw, Share2 } from 'lucide-react';
import FeedCard from '@/components/experience/FeedCard';
import { FeedListSkeleton } from '@/components/experience/FeedCardSkeleton';
import ShareJourneySheet from '@/components/experience/ShareJourneySheet';
import { useHelpfulVotes } from '@/components/experience/useHelpfulVotes';
import { getApiErrorMessage } from '@/lib/apiError';
import { getCurrentCustomer } from '@/services/authService';
import { fetchJourneyFeed } from '@/services/journeyService';
import type { FeedItem } from '@/types/journey';

const PAGE_SIZE = 12;

interface FeedState {
  items: FeedItem[];
  page: number;
  hasMore: boolean;
}

/** Chỉ tài khoản du khách mới có lịch trình để đăng. */
const isTraveler = () => getCurrentCustomer()?.role === 'TRAVELER';

/** Danh sách đã tải trong tab này: quay lại từ trang một lịch trình thì hiện ngay, làm mới ở nền. */
let feedCache: FeedState | null = null;

/**
 * Mục "Khám phá" của trang Lịch trình: lịch trình du khách đã đăng công khai, mỗi bài một hàng (FeedCard) — bấm vào xem
 * trọn lịch trình theo ngày và "Áp dụng" cho chuyến của mình. Một lối chia sẻ duy nhất ("Chia sẻ lịch trình của bạn" —
 * hàng tiêu đề, hoặc giữa trạng thái trống): đã đăng nhập mở sheet đăng / gỡ; chưa thì đăng nhập rồi quay lại (?share=1
 * mở sẵn sheet).
 */
export default function ExploreFeed() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [feed, setFeed] = useState<FeedState | null>(feedCache);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(() => searchParams.get('share') === '1' && isTraveler());
  const loadingMore = useRef(false);
  const votes = useHelpfulVotes(feed?.items.map((i) => i.shareToken) ?? []);

  useEffect(() => {
    let alive = true;
    // Lần đầu mở (có thể đang hiện danh sách đã tải nhiều trang): làm mới trang đầu nhưng giữ các trang sau để danh sách
    // không co lại. Sau khi đăng / gỡ bài (reload > 0): tải lại từ đầu để thấy ngay thay đổi.
    const keepLater = reload === 0;
    fetchJourneyFeed(0, PAGE_SIZE)
      .then((page) => {
        if (!alive) return;
        const cached = keepLater ? feedCache : null;
        const ids = new Set(page.items.map((i) => i.id));
        const next = cached && cached.page > 0
          ? { items: [...page.items, ...cached.items.slice(PAGE_SIZE).filter((i) => !ids.has(i.id))], page: cached.page, hasMore: cached.hasMore }
          : { items: page.items, page: 0, hasMore: page.hasMore };
        feedCache = next;
        setFeed(next);
        setLoadError('');
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(getApiErrorMessage(err, 'Kiểm tra kết nối mạng rồi bấm Thử lại.'));
      });
    return () => { alive = false; };
  }, [reload]);

  // Sheet đã mở theo ?share=1 — bỏ tham số khỏi đường dẫn để tải lại trang không mở lại.
  useEffect(() => {
    if (searchParams.get('share') !== '1') return;
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openShare = () => {
    if (isTraveler()) {
      setSheetOpen(true);
      return;
    }
    navigate('/login', {
      state: { returnUrl: '/lich-trinh?share=1', message: 'Đăng nhập bằng tài khoản du khách để chia sẻ lịch trình của bạn.' },
    });
  };

  const loadMore = async () => {
    if (!feed || loadingMore.current) return;
    loadingMore.current = true;
    setMoreLoading(true);
    setMoreError('');
    try {
      const page = await fetchJourneyFeed(feed.page + 1, PAGE_SIZE);
      setFeed((current) => {
        if (!current) return current;
        const seen = new Set(current.items.map((i) => i.id));
        const next = { items: [...current.items, ...page.items.filter((i) => !seen.has(i.id))], page: page.page, hasMore: page.hasMore };
        feedCache = next;
        return next;
      });
    } catch (err) {
      setMoreError(getApiErrorMessage(err, 'Không tải thêm được. Vui lòng thử lại.'));
    } finally {
      loadingMore.current = false;
      setMoreLoading(false);
    }
  };

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const refreshFeed = useCallback(() => {
    setLoadError('');
    setReload((r) => r + 1);
  }, []);

  const shareButton = (
    <button
      type="button"
      onClick={openShare}
      className="-mr-2 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-extrabold text-[#06604a] transition-colors hover:bg-white cursor-pointer"
    >
      <Share2 className="h-4 w-4" aria-hidden /> Đăng lịch trình<span className="hidden sm:inline"> của bạn</span>
    </button>
  );

  let content;
  if (!feed && loadError) {
    content = (
      <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-slate-200/80">
        <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden />
        <p className="mt-3 text-base font-extrabold text-slate-900">Chưa tải được danh sách</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{loadError}</p>
        <button type="button" onClick={refreshFeed} className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-4 text-sm font-bold text-white hover:bg-[#06604a] cursor-pointer">
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      </div>
    );
  } else if (!feed) {
    content = <FeedListSkeleton />;
  } else if (feed.items.length === 0) {
    content = (
      <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-slate-200/80">
        <p className="text-base font-extrabold text-slate-900">Chưa có lịch trình nào được chia sẻ</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">Đi về rồi? Đăng lịch trình kèm ảnh check-in để người đi sau tham khảo và áp dụng.</p>
        <div className="mt-3">{shareButton}</div>
      </div>
    );
  } else {
    content = (
      <>
        <ul className="divide-y divide-slate-200/80 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80">
          {feed.items.map((item) => (
            <li key={item.id} className="min-w-0">
              <FeedCard
                item={item}
                vote={votes.voteOf(item.shareToken, item.helpfulCount ?? 0)}
                onToggleHelpful={() => { void votes.toggle(item.shareToken, item.helpfulCount ?? 0); }}
              />
            </li>
          ))}
        </ul>
        {feed.hasMore && (
          <div className="mt-6 flex flex-col items-center gap-2">
            {moreError && <p role="alert" className="text-sm font-semibold text-rose-600">{moreError}</p>}
            <button
              type="button"
              onClick={() => { void loadMore(); }}
              disabled={moreLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#0a7d64] ring-1 ring-[#0a7d64]/35 transition-colors hover:bg-[#edfbf7] hover:ring-[#0a7d64] disabled:opacity-70 cursor-pointer"
            >
              {moreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
              {moreLoading ? 'Đang tải…' : 'Xem thêm'}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="explore-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="explore-title" className="text-base font-extrabold text-[var(--color-ink-deep)]">Du khách đã đi và chia sẻ</h2>
          <p className="text-xs text-[#59766e]">Mở một lịch trình để xem từng ngày, rồi áp dụng cho chuyến của bạn.</p>
        </div>
        {feed && feed.items.length > 0 && shareButton}
        {feed && loadError && (
          <button type="button" onClick={refreshFeed} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:underline cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Chưa làm mới được — thử lại
          </button>
        )}
      </div>
      {content}
      {sheetOpen && <ShareJourneySheet onClose={closeSheet} onChanged={refreshFeed} />}
    </section>
  );
}
