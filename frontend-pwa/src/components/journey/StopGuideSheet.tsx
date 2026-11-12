import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Heart, MapPin, Mountain, Navigation, PlayCircle, Route, X } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import TikTokEmbedPlayer from '@/components/homestay/TikTokEmbedPlayer';
import CheckinForm from '@/components/journey/CheckinForm';
import { directionsTo } from '@/components/journey/journeyUi';
import type { CheckinView, SightStopView } from '@/types/journey';
import { SESSION_LABEL, SESSION_TONE, stopTimeLabel } from '@/lib/journey';
import { mediaUrl } from '@/lib/mediaUrl';

interface StopGuideSheetProps {
  journeyId: number;
  stop: SightStopView;
  onClose: () => void;
  onCheckinChange: (checkin: CheckinView | null) => void;
  /** false = trang chia sẻ / chỉ xem: không có check-in (ảnh, lưu bút của chủ lịch trình chỉ để xem). */
  editable?: boolean;
  /** "Ngày 1 · T5, 08/10" — mốc ngày của điểm trong chuyến. */
  dayLabel?: string | null;
  /** Thứ tự của điểm trong lộ trình (hiện "2/6" và nút sang điểm trước / sau). */
  position?: { index: number; total: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
  /** Điểm tiếp theo hôm nay. */
  isNext?: boolean;
  /** Trang chia sẻ: tên chủ lịch trình cho mục "Khoảnh khắc của …". */
  memoryOwner?: string | null;
  /** Mở thẳng ở mục check-in (nút "Check-in" của "Hôm nay"). */
  focusCheckin?: boolean;
}

function Section({ icon: Icon, title, children, sectionRef }: { icon: typeof BookOpen; title: string; children: ReactNode; sectionRef?: Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} className="scroll-mt-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#edfbf7] text-[#0a7d64]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Cẩm nang một điểm đến trong lịch trình: ảnh, giới thiệu, đường đi, video TikTok, check-in ảnh + lưu bút; nút "Chỉ
 * đường" (mở Google Maps chỉ đường từ vị trí khách — không gọi dịch vụ chỉ đường nào từ máy chủ) luôn nằm ở đáy.
 * Điện thoại: toàn màn hình; máy tính: hộp giữa màn hình. Có nút sang điểm trước / sau theo lộ trình.
 */
export default function StopGuideSheet({
  journeyId,
  stop,
  onClose,
  onCheckinChange,
  editable = true,
  dayLabel,
  position,
  onPrev,
  onNext,
  isNext = false,
  memoryOwner,
  focusCheckin = false,
}: StopGuideSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Radix Portal gắn nội dung sau lần render đầu: giữ phần tử trong state để các hiệu ứng chạy lại khi đã gắn.
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [checkinEl, setCheckinEl] = useState<HTMLElement | null>(null);
  const setBody = (el: HTMLDivElement | null) => { bodyRef.current = el; setBodyEl(el); };
  /** Mục check-in đang trong tầm nhìn: thanh đáy bỏ nút "Check-in" trùng lặp, "Chỉ đường" lùi xuống nút phụ. */
  const [checkinInView, setCheckinInView] = useState(false);
  const tone = SESSION_TONE[stop.session];
  const cover = stop.coverImageUrl ? mediaUrl(stop.coverImageUrl) : null;
  const memory = !editable && stop.checkin && (stop.checkin.photoUrl || stop.checkin.note) ? stop.checkin : null;

  // Chỉ cuộn vùng nội dung của cẩm nang (scrollIntoView cuộn cả khung hộp thoại, đẩy thanh trên ra ngoài).
  const goCheckin = (smooth = true) => {
    const body = bodyRef.current;
    const section = checkinEl;
    if (!body || !section) return;
    const top = section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 12;
    body.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Sang điểm khác: cuộn về đầu cẩm nang — mở từ nút "Check-in" thì cuộn thẳng tới mục check-in.
  useEffect(() => {
    if (!bodyEl) return undefined;
    if (!focusCheckin || !editable || !checkinEl) {
      bodyEl.scrollTo({ top: 0 });
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      const top = checkinEl.getBoundingClientRect().top - bodyEl.getBoundingClientRect().top + bodyEl.scrollTop - 12;
      bodyEl.scrollTo({ top });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stop.id, focusCheckin, editable, bodyEl, checkinEl]);

  useEffect(() => {
    if (!bodyEl || !checkinEl || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => setCheckinInView(!!entry?.isIntersecting), { root: bodyEl, rootMargin: '0px 0px -35% 0px' });
    observer.observe(checkinEl);
    return () => observer.disconnect();
  }, [bodyEl, checkinEl]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10000] flex items-stretch justify-center bg-slate-900/50 backdrop-blur-[2px] lg:items-center lg:p-6">
          <Dialog.Content
            aria-describedby={undefined}
            className="sheet-in flex h-full w-full flex-col bg-white lg:h-auto lg:max-h-[90vh] lg:max-w-xl lg:overflow-clip lg:rounded-3xl lg:shadow-2xl"
          >
            {/* Thanh trên: đóng · tên điểm · điểm trước / sau */}
            <div className="shrink-0 border-b border-slate-100 bg-white pt-[var(--safe-top)] lg:pt-0">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Dialog.Close aria-label="Đóng cẩm nang" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 cursor-pointer">
                  <X className="h-5 w-5" />
                </Dialog.Close>
                <div className="min-w-0 flex-1 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0a7d64]">
                    Cẩm nang{position ? ` · điểm ${position.index + 1}/${position.total}` : ''}
                  </p>
                  <Dialog.Title className="truncate text-base font-extrabold text-slate-900">{stop.placeName}</Dialog.Title>
                </div>
                {position && (onPrev || onNext) ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Điểm trước" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 cursor-pointer">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={onNext} disabled={!onNext} aria-label="Điểm sau" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 cursor-pointer">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <span className="w-9 shrink-0" aria-hidden />
                )}
              </div>
            </div>

            <div ref={setBody} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="px-4 pt-4">
                <div className="relative aspect-[2/1] overflow-hidden rounded-2xl bg-slate-100 sm:aspect-[16/7]">
                  {cover ? <img src={cover} alt={stop.placeName} className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} variant="hero" />}
                  {stop.checkin && editable && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Đã check-in
                    </span>
                  )}
                  {isNext && !stop.checkin && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-amber-950 shadow-sm">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-950" /> Điểm tiếp theo
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  {dayLabel && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{dayLabel}</span>}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${tone.chip}`}>
                    <Clock className="h-3.5 w-3.5" /> {SESSION_LABEL[stop.session]} · từ {stopTimeLabel(stop)}
                  </span>
                </div>
              </div>

              <div className="space-y-6 px-4 pb-6 pt-5">
                {(stop.summary || editable) && (
                  <Section icon={BookOpen} title="Giới thiệu">
                    {stop.summary ? (
                      <p className="text-sm leading-relaxed text-slate-700">{stop.summary}</p>
                    ) : (
                      <p className="text-sm text-slate-500">Chưa có giới thiệu cho địa điểm này.</p>
                    )}
                    <Link to={`/destinations/${stop.placeId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#0a7d64] hover:underline">
                      Xem trang địa điểm <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Section>
                )}

                {(stop.accessNote || stop.address) && (
                  <Section icon={Route} title="Đường đi">
                    <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
                      {stop.accessNote && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{stop.accessNote}</p>}
                      {stop.address && (
                        <p className={`flex items-start gap-1.5 text-xs text-slate-500 ${stop.accessNote ? 'mt-2 border-t border-slate-200/70 pt-2' : ''}`}>
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {stop.address}
                        </p>
                      )}
                    </div>
                  </Section>
                )}

                {stop.tiktokUrl && (
                  <Section icon={PlayCircle} title="Video">
                    <TikTokEmbedPlayer url={stop.tiktokUrl} placeName={stop.placeName} className="mx-auto max-w-[280px]" />
                  </Section>
                )}

                {memory && (
                  <Section icon={Heart} title={memoryOwner ? `Khoảnh khắc của ${memoryOwner}` : 'Khoảnh khắc'}>
                    <figure className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
                      {memory.photoUrl && <img src={mediaUrl(memory.photoUrl)} alt={`Ảnh tại ${stop.placeName}`} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />}
                      {memory.note && <figcaption className="px-2 pb-1 pt-2.5 text-sm italic leading-relaxed text-slate-700">“{memory.note}”</figcaption>}
                    </figure>
                  </Section>
                )}

                {editable && (
                  <Section icon={Camera} title="Check-in" sectionRef={setCheckinEl}>
                    {!stop.checkin && <p className="-mt-1 mb-2.5 text-xs text-slate-500">Lưu lại khoảnh khắc ở đây — ảnh và lưu bút đều tùy chọn, check-in lúc nào cũng được.</p>}
                    <CheckinForm
                      key={stop.id}
                      journeyId={journeyId}
                      placeId={stop.placeId}
                      placeName={stop.placeName}
                      checkin={stop.checkin}
                      onChange={onCheckinChange}
                    />
                  </Section>
                )}
              </div>
            </div>

            {/* Thanh đáy: Chỉ đường luôn trong tầm tay */}
            <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 lg:pb-3">
              <button
                type="button"
                onClick={() => directionsTo(stop)}
                className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-colors cursor-pointer ${
                  editable && checkinInView
                    ? 'bg-white text-[#0a7d64] ring-2 ring-[#0a7d64] hover:bg-[#edfbf7]'
                    : 'bg-[#0a7d64] text-white shadow-sm hover:bg-[#06604a]'
                }`}
              >
                <Navigation className="h-4 w-4" /> Chỉ đường
              </button>
              {editable ? (checkinInView ? null : (
                <button
                  type="button"
                  onClick={() => goCheckin()}
                  className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors cursor-pointer ${
                    stop.checkin ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-white text-[#0a7d64] ring-2 ring-[#0a7d64] hover:bg-[#edfbf7]'
                  }`}
                >
                  {stop.checkin ? <CheckCircle2 className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  {stop.checkin ? 'Đã check-in' : 'Check-in'}
                </button>
              )) : (
                <Link
                  to={`/destinations/${stop.placeId}`}
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#0a7d64] ring-2 ring-[#0a7d64] transition-colors hover:bg-[#edfbf7]"
                >
                  Xem địa điểm
                </Link>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
