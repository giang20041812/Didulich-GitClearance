import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Eye, Loader2, Mountain, Route, Send, ShieldCheck, Undo2, X } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { getApiErrorMessage } from '@/lib/apiError';
import { journeyRange, journeyTitle } from '@/lib/journey';
import { phaseChip } from '@/components/journey/journeyUi';
import { mediaUrl } from '@/lib/mediaUrl';
import { fetchMyJourneys, publishJourney, unpublishJourney } from '@/services/journeyService';
import { isSightStop, type JourneyView } from '@/types/journey';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { journeyThumb, relativeDay } from './feedFormat';

interface ShareJourneySheetProps {
  onClose: () => void;
  /** Đăng / gỡ xong — trang tải lại bảng tin để thấy ngay bài của mình. */
  onChanged: () => void;
}

const dayMonth = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** Thứ tự trong sheet: chuyến đã đi / đang đi trước (kể lại được ngay), rồi chuyến sắp đi, chưa có ngày cuối; mỗi nhóm mới nhất trước. */
const PHASE_ORDER = { today: 0, past: 1, upcoming: 2, undated: 3 } as const;
function sortForSharing(list: JourneyView[]): JourneyView[] {
  const keyed = list.map((journey) => ({ journey, phase: phaseChip(journey).phase, first: journeyRange(journey).first ?? '' }));
  keyed.sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]
    || (a.phase === 'upcoming' ? a.first.localeCompare(b.first) : b.first.localeCompare(a.first)));
  return keyed.map((k) => k.journey);
}

/** Một lịch trình của tôi với nút Đăng / Gỡ bài và trạng thái hiện tại ở mục Khám phá. */
function JourneyRow({ journey, busy, onPublish, onUnpublish }: {
  journey: JourneyView;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const { first, last } = journeyRange(journey);
  const thumb = mediaUrl(journeyThumb(journey));
  const checkins = journey.stops.filter((s) => s.checkin).length;
  const published = !!journey.publishedAt;
  const hidden = published && !!journey.feedHidden;
  // Mục Khám phá chỉ kể điểm tham quan: chưa có điểm nào thì chưa đăng được.
  const sights = journey.stops.filter(isSightStop).length;
  const empty = sights === 0;
  const chip = phaseChip(journey);

  return (
    <li className={`rounded-2xl p-3 ring-1 transition-colors ${published && !hidden ? 'bg-[#f4fbf8] ring-[#0a7d64]/30' : 'bg-white ring-slate-200'}`}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-slate-900">{journeyTitle(journey)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
            {chip.phase !== 'undated' && (
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-extrabold ${chip.className}`}>
                {chip.phase === 'past' ? 'Đã đi' : chip.phase === 'today' ? 'Đang đi' : 'Sắp đi'}
              </span>
            )}
            <span>{first && last ? (first === last ? dayMonth(first) : `${dayMonth(first)} → ${dayMonth(last)}`) : 'Chưa chọn ngày'}</span>
            <span className="whitespace-nowrap">· {sights} điểm</span>
            {checkins > 0 && <span className="whitespace-nowrap">· {checkins} check-in</span>}
          </p>
          {published && !hidden && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0a7d64]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Đang hiển thị · đăng {relativeDay(journey.publishedAt).toLowerCase()}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {published ? (
            <button
              type="button"
              onClick={onUnpublish}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-300 transition-colors hover:text-rose-600 hover:ring-rose-300 disabled:opacity-60 cursor-pointer"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Gỡ bài
            </button>
          ) : (
            <button
              type="button"
              onClick={onPublish}
              disabled={busy || empty}
              title={empty ? 'Thêm ít nhất một điểm trước khi đăng' : undefined}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#0a7d64] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#06604a] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none cursor-pointer"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Đăng
            </button>
          )}
        </div>
      </div>

      {hidden && (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            <strong className="font-bold">Quản trị viên đã ẩn lịch trình này khỏi mục Khám phá.</strong>
            {journey.feedHiddenReason ? ` Lý do: ${journey.feedHiddenReason}` : ''}
          </span>
        </p>
      )}
      {empty && !published && (
        <p className="mt-2 text-[11px] font-medium text-slate-500">Lịch trình chưa có điểm nào — thêm điểm rồi quay lại đăng nhé.</p>
      )}
      {published && !hidden && journey.shareToken && (
        <Link to={`/j/${journey.shareToken}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#0a7d64] hover:underline">
          <Eye className="h-3.5 w-3.5" /> Xem bài như người khác thấy
        </Link>
      )}
    </li>
  );
}

/**
 * Sheet "Chia sẻ lịch trình của bạn" (khách đã đăng nhập): danh sách lịch trình của tôi, mỗi cái có nút Đăng / Gỡ bài
 * khỏi mục Khám phá của trang Lịch trình, kèm trạng thái (đang hiển thị, bị quản trị viên ẩn kèm lý do). Điện thoại là bottom sheet, máy tính là
 * hộp giữa màn hình.
 */
export default function ShareJourneySheet({ onClose, onChanged }: ShareJourneySheetProps) {
  const [journeys, setJourneys] = useState<JourneyView[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchMyJourneys()
      .then((list) => { if (alive) setJourneys(sortForSharing(list)); })
      .catch((err: unknown) => { if (alive) setLoadError(getApiErrorMessage(err, 'Không tải được lịch trình của bạn.')); });
    return () => { alive = false; };
  }, [reload]);

  // Esc để đóng, khóa cuộn trang phía sau; focus nằm trong sheet, đóng thì trả về nút đã mở.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  useDialogFocus(panelRef);

  const patch = (id: number, change: Partial<JourneyView>) =>
    setJourneys((list) => list && list.map((j) => (j.id === id ? { ...j, ...change } : j)));

  const publish = async (journey: JourneyView) => {
    setBusyId(journey.id);
    setActionError('');
    setNotice('');
    try {
      const result = await publishJourney(journey.id);
      // Bài bị quản trị viên ẩn vẫn bị ẩn khi đăng lại (máy chủ giữ trạng thái ẩn) — không xoá cờ ẩn ở đây.
      patch(journey.id, { publishedAt: result.publishedAt, shareToken: result.shareToken });
      setNotice(`Đã đăng công khai "${journeyTitle(journey)}".`);
      onChanged();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Chưa đăng được lịch trình. Vui lòng thử lại.'));
    } finally {
      setBusyId(null);
    }
  };

  const unpublish = async (journey: JourneyView) => {
    setBusyId(journey.id);
    setActionError('');
    setNotice('');
    try {
      await unpublishJourney(journey.id);
      patch(journey.id, { publishedAt: null });
      setNotice(`Đã gỡ "${journeyTitle(journey)}" khỏi mục Khám phá.`);
      onChanged();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Chưa gỡ được bài. Vui lòng thử lại.'));
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (loadError) {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-semibold text-slate-700">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(''); setReload((r) => r + 1); }} className="rounded-xl bg-[#0a7d64] px-4 py-2 text-sm font-bold text-white hover:bg-[#06604a] cursor-pointer">
          Thử lại
        </button>
      </div>
    );
  } else if (!journeys) {
    body = (
      <ul className="flex flex-col gap-2.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-slate-100">
            <div className="h-14 w-14 animate-pulse rounded-xl bg-slate-100" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-200/80" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-9 w-16 animate-pulse rounded-xl bg-slate-100" />
          </li>
        ))}
      </ul>
    );
  } else if (journeys.length === 0) {
    body = (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edfbf7] text-[#0a7d64]">
          <Route className="h-7 w-7" />
        </span>
        <p className="mt-3 text-base font-extrabold text-slate-900">Bạn chưa có lịch trình nào</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Lên lịch trình gợi ý theo số ngày, ngân sách, sở thích rồi sửa theo ý — hoàn toàn miễn phí.
        </p>
        <Link to="/lich-trinh/tao" onClick={onClose} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0a7d64] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#06604a]">
          Tạo lịch trình <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2.5">
        {journeys.map((journey) => (
          <JourneyRow
            key={journey.id}
            journey={journey}
            busy={busyId === journey.id}
            onPublish={() => { void publish(journey); }}
            onUnpublish={() => { void unpublish(journey); }}
          />
        ))}
      </ul>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:max-h-[min(720px,90dvh)] sm:max-w-lg sm:rounded-3xl"
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <header className="flex items-start gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id="share-sheet-title" className="text-lg font-extrabold text-slate-900">Chia sẻ lịch trình của bạn</h2>
            <p className="mt-0.5 text-sm text-slate-500">Chọn lịch trình muốn đăng công khai ở mục Khám phá.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <p className="mb-4 flex items-start gap-2.5 rounded-2xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0a7d64]" />
            <span>
              Bài đăng chỉ hiện <strong className="text-slate-800">tên gọi</strong> của bạn, các điểm đã chọn, ảnh và lưu bút check-in.
              Không hiện mã đơn, giá phòng hay số điện thoại. Gỡ bài bất cứ lúc nào.
            </span>
          </p>
          {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">{notice}</p>}
          {actionError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">{actionError}</p>}
          {body}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:pb-4">
          <Link to="/lich-trinh?tab=cua-toi" onClick={onClose} className="inline-flex items-center gap-1 text-xs font-bold text-[#0a7d64] hover:underline">
            Lịch trình của tôi <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 cursor-pointer">
            Xong
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
