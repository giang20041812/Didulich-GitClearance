import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, ExternalLink, EyeOff, Footprints, Link2, Link2Off, Loader2, Send, Share2 } from 'lucide-react';
import JourneySheet from '@/components/journey/JourneySheet';
import SwitchToggle from '@/components/journey/SwitchToggle';
import { usePublishJourney } from '@/components/journey/usePublishJourney';
import { isSightStop, type JourneyView } from '@/types/journey';
import { journeyPhase, journeyTitle } from '@/lib/journey';
import { getApiErrorMessage } from '@/lib/apiError';
import { journeyShareUrl, shareJourney, unshareJourney } from '@/services/journeyService';

interface ShareControlProps {
  journey: JourneyView;
  onChange: (journey: JourneyView) => void;
  className?: string;
}

/**
 * Chia sẻ lịch trình: link công khai /j/{mã} (người nhận xem được trọn lịch trình theo giờ — các mục, ghi chú, dịch vụ —
 * cùng video, ảnh check-in; không có mã đơn, giá, SĐT; chuyến chưa đi xong chỉ hiện "Ngày 1, 2"; áp dụng được nguyên lịch
 * trình cho mình hoặc đặt homestay này) và công tắc "Đăng công khai" (mục Khám phá của trang Lịch trình). Tắt chia sẻ thì
 * link chết và lịch trình cũng bị gỡ khỏi mục Khám phá (máy chủ gỡ cùng lúc).
 */
export default function ShareControl({ journey, onChange, className = '' }: ShareControlProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const feed = usePublishJourney(journey, onChange);
  // Mục Khám phá chỉ kể điểm tham quan: chưa có điểm nào thì chưa đăng được.
  const hasSights = journey.stops.some(isSightStop);
  const url = journey.shareToken ? journeyShareUrl(journey.shareToken) : null;
  const upcoming = journeyPhase(journey) !== 'past';
  const hidden = feed.published && !!journey.feedHidden;

  const start = async () => {
    setOpen(true);
    setError('');
    setConfirmStop(false);
    if (journey.shareToken) return;
    setBusy(true);
    try {
      const token = await shareJourney(journey.id);
      onChange({ ...journey, shareToken: token });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa tạo được link chia sẻ.'));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      await unshareJourney(journey.id);
      // Máy chủ gỡ luôn bài ở mục Khám phá (bài trỏ tới link chia sẻ).
      onChange({ ...journey, shareToken: null, publishedAt: null });
      setConfirmStop(false);
      setOpen(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa tắt được chia sẻ.'));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!url) return;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => {
    if (!url || !canNativeShare) return;
    void navigator.share({ title: journeyTitle(journey), text: 'Lịch trình Mù Cang Chải của mình — xem và áp dụng cho chuyến của bạn nhé!', url }).catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { void start(); }}
        className={`inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition-colors hover:text-[#0a7d64] hover:ring-[#0a7d64] cursor-pointer ${className}`}
      >
        <Share2 className="h-4 w-4" /> Chia sẻ
      </button>

      <JourneySheet
        open={open}
        onClose={() => setOpen(false)}
        title="Chia sẻ hành trình"
        description={journeyTitle(journey)}
        footer={url ? (
          confirmStop ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs font-semibold text-slate-700">
                Tắt link? Link cũ sẽ không mở được nữa{feed.published ? ', lịch trình cũng bị gỡ khỏi mục Khám phá' : ''}.
              </p>
              <button type="button" onClick={() => setConfirmStop(false)} className="rounded-full px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Giữ link</button>
              <button type="button" onClick={() => { void stop(); }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tắt chia sẻ
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmStop(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 cursor-pointer">
              <Link2Off className="h-4 w-4" /> Tắt chia sẻ
            </button>
          )
        ) : undefined}
      >
        <div className="space-y-4 pt-2">
          {/* Link riêng */}
          <section>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Gửi link cho bạn bè</p>
            {busy && !url ? (
              <p className="flex h-12 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo link…</p>
            ) : url ? (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1.5 pl-3 ring-1 ring-slate-200">
                  <Link2 className="h-4 w-4 shrink-0 text-[#0a7d64]" />
                  <input readOnly value={url} aria-label="Link chia sẻ" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 focus:outline-none" />
                  <button
                    type="button"
                    onClick={copy}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white transition-colors cursor-pointer ${copied ? 'bg-emerald-600' : 'bg-[#0a7d64] hover:bg-[#06604a]'}`}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Đã chép' : 'Sao chép'}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Ai có link đều xem và áp dụng được trọn lịch trình (giờ, các mục, ghi chú), video và ảnh check-in. Không hiện mã đơn, giá, số điện thoại{upcoming ? '; chuyến chưa đi chỉ hiện "Ngày 1, 2".' : '.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canNativeShare && (
                    <button type="button" onClick={nativeShare} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#edfbf7] px-3.5 text-xs font-bold text-[#06604a] ring-1 ring-teal-200 hover:ring-[#0a7d64] cursor-pointer">
                      <Send className="h-3.5 w-3.5" /> Gửi qua Zalo, Messenger…
                    </button>
                  )}
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:text-[#0a7d64] hover:ring-[#0a7d64]">
                    Xem trang chia sẻ <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </>
            ) : null}
          </section>

          {/* Đăng công khai (mục Khám phá của trang Lịch trình) */}
          <section className={`rounded-2xl p-4 ring-1 transition-colors ${feed.published && !hidden ? 'bg-[#f4fbf8] ring-[#0a7d64]/30' : 'bg-white ring-slate-200'}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Footprints className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-slate-900">Đăng công khai</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Hiện ở mục Khám phá của trang Lịch trình — du khách khác xem và áp dụng được.</p>
              </div>
              <SwitchToggle
                checked={feed.published}
                onChange={() => { void feed.toggle(); }}
                busy={feed.busy}
                disabled={!feed.published && !hasSights}
                label="Đăng công khai"
              />
            </div>
            {feed.published && !hidden && (
              <Link to="/lich-trinh" className="ml-[52px] mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#0a7d64] hover:underline">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Đang hiện ở mục Khám phá <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {hidden && (
              <p className="ml-[52px] mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Quản trị viên đã ẩn lịch trình khỏi mục Khám phá{journey.feedHiddenReason ? `: ${journey.feedHiddenReason}` : '.'}</span>
              </p>
            )}
            {!feed.published && !hasSights && <p className="ml-[52px] mt-2 text-xs text-slate-500">Thêm ít nhất một điểm tham quan vào lịch trình để đăng.</p>}
            {feed.error && <p role="alert" className="ml-[52px] mt-2 text-xs font-semibold text-rose-600">{feed.error}</p>}
          </section>

          {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
      </JourneySheet>
    </>
  );
}
