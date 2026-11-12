import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bus, Car, ChevronRight, Footprints, MapPin, Motorbike, Mountain, Navigation, Phone, Tent, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import Reveal from '@/components/ui/Reveal';
import { useCurrentPosition } from '@/hooks/useCurrentPosition';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { cachedFetch } from '@/lib/dataCache';
import { formatDistance, haversineKm, type LatLng } from '@/lib/distance';
import { mediaUrl } from '@/lib/mediaUrl';
import { placeDetailPath } from '@/lib/placeRoutes';
import { formatSlotStart, slotAt, type TimeSlot } from '@/lib/timeSlots';
import { fetchNearMeCandidates, type NearMeKind, type NearMePlace } from '@/services/placeService';
import { fetchTransports, type TransportDto } from '@/services/transportService';
import type { PlaceContactItem } from '@/types/homestay';

/** Chỉ coi là "gần bạn" trong bán kính này — xa hơn thì không hiện section. */
const MAX_RADIUS_KM = 30;
/** Đường đèo vòng vèo: quãng đường thật ≈ 1,35 lần đường chim bay. */
const ROAD_FACTOR = 1.35;

const PLACE_ICON: Record<NearMeKind, LucideIcon> = { ATTRACTION: Mountain, RESTAURANT: UtensilsCrossed, HOMESTAY: Tent };

/** Khách đang ở vùng: ưu tiên xe ôm / xe ghép đi chặng ngắn trước xe khách liên tỉnh. */
const RIDE_ORDER = ['LOCAL_MOTO', 'TOUR_MOTO', 'SHARED_CAR', 'SELF_DRIVE', 'INTERCITY_BUS'];
const RIDE_ICON: Record<string, LucideIcon> = {
  LOCAL_MOTO: Motorbike, TOUR_MOTO: Motorbike, SHARED_CAR: Car, SELF_DRIVE: Car, INTERCITY_BUS: Bus,
};

const contactOf = (contacts: PlaceContactItem[] | undefined, channel: 'PHONE' | 'ZALO') =>
  contacts?.find((contact) => contact.channel === channel && contact.value)?.value;
const telHref = (value: string) => `tel:${value.replace(/[^0-9+]/g, '')}`;
const zaloHref = (value: string) => (value.startsWith('http') ? value : `https://zalo.me/${value.replace(/[^0-9]/g, '')}`);

const directionsUrl = (from: LatLng, to: LatLng, walking: boolean) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: walking ? 'walking' : 'driving',
  })}`;

const formatMinutes = (minutes: number) => {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const rest = Math.round((m % 60) / 5) * 5;
  return rest ? `${h} giờ ${rest} phút` : `${h} giờ`;
};

/** Cách đi ước lượng theo khoảng cách (tốc độ trung bình đường núi). */
function travelModes(km: number): { Icon: LucideIcon; label: string; time: string }[] {
  const road = km * ROAD_FACTOR;
  const modes: { Icon: LucideIcon; label: string; time: string }[] = [];
  if (km <= 2) modes.push({ Icon: Footprints, label: 'Đi bộ', time: formatMinutes((road / 4.5) * 60) });
  modes.push({ Icon: Motorbike, label: 'Xe máy', time: formatMinutes((road / 25) * 60) });
  if (km > 3) modes.push({ Icon: Car, label: 'Ô tô', time: formatMinutes((road / 30) * 60) });
  return modes;
}

/** Lớp kính mờ dùng chung cho panel trên nền xanh rừng. */
const GLASS = 'rounded-3xl bg-white/[0.06] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_48px_-28px_rgba(0,0,0,0.7)]';

/**
 * Section "Gần bạn" (trang chủ, ngay trên "Hôm nay đi đâu"): mỗi lần mở trang lấy vị trí khách + giờ hiện tại để gợi ý
 * nơi nên tới (5h30 ngắm bình minh, 7h ăn sáng...), kèm cách đi và liên hệ xe. Chỉ hiện khi quanh khách thật sự có chỗ
 * (đã có vị trí và có địa điểm trong 30 km) — không có thì không chiếm chỗ trên trang. Vị trí chỉ dùng trên máy.
 */
export default function TimelySuggestion() {
  const [now, setNow] = useState(() => new Date());
  useVisibleInterval(() => setNow(new Date()), 60_000);
  const { current: slot, next } = slotAt(now);

  const { state } = useCurrentPosition();
  const userPos = state.status === 'ready' ? state.position : null;
  const [loaded, setLoaded] = useState<{ kind: NearMeKind; list: NearMePlace[] } | null>(null);
  const [transports, setTransports] = useState<TransportDto[] | null>(null);

  // Chỉ tải danh sách khi đã có vị trí — khách từ chối vị trí thì không tốn request nào.
  const located = userPos !== null;
  useEffect(() => {
    if (!located) return;
    let alive = true;
    fetchNearMeCandidates(slot.kind)
      .then((list) => { if (alive) setLoaded({ kind: slot.kind, list }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slot.kind, located]);

  useEffect(() => {
    if (!located) return;
    let alive = true;
    cachedFetch('timely:transport', 10 * 60_000, () => fetchTransports())
      .then((list) => { if (alive) setTransports(list); });
    return () => { alive = false; };
  }, [located]);

  const places = loaded?.kind === slot.kind ? loaded.list : null;

  const picks = useMemo(() => {
    if (!places || !userPos) return [];
    return places
      .map((place) => ({ place, km: haversineKm(userPos, { lat: place.latitude, lng: place.longitude }) }))
      .filter((item) => item.km <= MAX_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
  }, [places, userPos]);

  const rides = useMemo(() => {
    if (!transports || !userPos) return [];
    return transports
      .filter((t) => contactOf(t.contacts, 'PHONE') || contactOf(t.contacts, 'ZALO'))
      .map((t) => ({
        t,
        km: t.latitude != null && t.longitude != null ? haversineKm(userPos, { lat: t.latitude, lng: t.longitude }) : null,
        rank: RIDE_ORDER.includes(t.categoryGroup) ? RIDE_ORDER.indexOf(t.categoryGroup) : RIDE_ORDER.length,
      }))
      .sort((a, b) => a.rank - b.rank || (a.km ?? Infinity) - (b.km ?? Infinity) || b.t.ratingScore - a.t.ratingScore)
      .slice(0, 3);
  }, [transports, userPos]);

  const top = picks[0];
  if (!userPos || !top) return null;

  const others = picks.slice(1);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const PlaceIcon = PLACE_ICON[slot.kind];
  const hasSide = others.length > 0 || rides.length > 0;

  return (
    <section className="relative isolate overflow-hidden bg-[#062a21] pt-14 pb-16 md:pt-16 md:pb-20 text-white shadow-[0_-14px_30px_-26px_rgba(10,46,38,0.45)]">
      {/* Chiều sâu nền: quầng màu theo khung giờ + quầng xanh ngọc + lưới chấm mờ dần */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `radial-gradient(46rem 28rem at 88% -5%, ${slot.glow}, transparent 70%), radial-gradient(40rem 26rem at 0% 100%, rgb(45 212 191 / 0.14), transparent 70%), linear-gradient(180deg, #0b4a3c 0%, #062a21 55%, #041d17 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,#000,transparent)]"
      />

      <div className="relative max-w-[1280px] mx-auto w-full px-4 md:px-8">
        <Reveal className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              Gần bạn · {clock}
            </p>
            <h2 className="text-[26px] md:text-3xl lg:text-[36px] font-extrabold leading-tight tracking-tight">{slot.title}</h2>
            <p className="mt-2 max-w-xl text-sm md:text-[15px] font-medium leading-relaxed text-white/65">{slot.hint}</p>
          </div>
          <NextSlotChip slot={next} />
        </Reveal>

        <div className={`grid gap-5 lg:gap-6 ${hasSide ? 'lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]' : ''}`}>
          <Reveal delay={80} className="relative">
            <FeatureCard place={top.place} km={top.km} from={userPos} slot={slot} Icon={PlaceIcon} />
          </Reveal>

          {hasSide && (
            <div className="flex min-w-0 flex-col gap-5">
              {others.length > 0 && (
                <Reveal delay={140}>
                  <div className={`${GLASS} p-4 md:p-5`}>
                    <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Hoặc ghé</p>
                    <ul className="space-y-2">
                      {others.map(({ place, km }) => (
                        <li key={place.id}>
                          <Link
                            to={placeDetailPath(place.kind, place.id)}
                            className="group flex items-center gap-3 rounded-2xl p-1.5 pr-3 transition-colors hover:bg-white/[0.07]"
                          >
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10">
                              {place.coverImageUrl ? (
                                <img src={mediaUrl(place.coverImageUrl, 200)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500" />
                              ) : (
                                <ImagePlaceholder Icon={PlaceIcon} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{place.name}</p>
                              <p className="truncate text-xs text-white/55">
                                <span className="font-bold text-emerald-300">{formatDistance(km)}</span>
                                {place.regionName && ` · ${place.regionName}`}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              )}

              {rides.length > 0 && (
                <Reveal delay={200} className="flex-1">
                  <div className={`${GLASS} h-full p-4 md:p-5`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Gọi xe tới đó</p>
                      <Link to="/transport" className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-300 hover:text-white">
                        Tất cả <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                    <ul className="space-y-2">
                      {rides.map(({ t, km }) => {
                        const phone = contactOf(t.contacts, 'PHONE');
                        const zalo = contactOf(t.contacts, 'ZALO');
                        const RideIcon = RIDE_ICON[t.categoryGroup] ?? Car;
                        return (
                          <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2 pr-2.5 ring-1 ring-white/[0.06]">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-teal-500/10 text-emerald-200 ring-1 ring-emerald-300/20">
                              <RideIcon className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link to={placeDetailPath('TRANSPORT', t.id)} className="block truncate text-[13px] font-bold hover:text-emerald-200">
                                {t.name}
                              </Link>
                              <p className="truncate text-[11px] text-white/55">
                                {t.categoryGroupName || t.vehicleType}
                                {km != null && ` · ${formatDistance(km)}`}
                              </p>
                            </div>
                            {zalo && (
                              <a
                                href={zaloHref(zalo)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Nhắn Zalo ${t.name}`}
                                className="flex h-9 shrink-0 items-center rounded-full bg-[#0068ff] px-3 text-xs font-extrabold shadow-[0_6px_14px_-6px_rgba(0,104,255,0.8)] transition-transform hover:-translate-y-px"
                              >
                                Zalo
                              </a>
                            )}
                            {phone && (
                              <a
                                href={telHref(phone)}
                                aria-label={`Gọi ${t.name}`}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[#05241e] shadow-[0_6px_14px_-6px_rgba(52,211,153,0.9)] transition-transform hover:-translate-y-px"
                              >
                                <Phone className="h-4 w-4" aria-hidden />
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Reveal>
              )}
            </div>
          )}
        </div>

        <p className="mt-5 text-[11px] text-white/40">
          Thời gian đi ước lượng theo đường núi · Vị trí của bạn chỉ dùng trên máy này, không gửi đi.
        </p>
      </div>
    </section>
  );
}

/** Viên kính "Tiếp theo 07:00 · Bữa sáng". */
function NextSlotChip({ slot }: { slot: TimeSlot }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] py-1.5 pl-1.5 pr-3.5 text-xs font-semibold text-white/75 ring-1 ring-white/10">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${slot.tone} text-white`}>
        <slot.Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      Tiếp theo <strong className="font-extrabold text-white">{formatSlotStart(slot.start)}</strong> · {slot.label}
    </span>
  );
}

/** Gợi ý chính: ảnh phủ kín thẻ, lớp thẻ xếp chồng phía sau tạo chiều sâu, chữ + cách đi + nút nằm trên chân ảnh. */
function FeatureCard({ place, km, from, slot, Icon }: { place: NearMePlace; km: number; from: LatLng; slot: TimeSlot; Icon: LucideIcon }) {
  const to = { lat: place.latitude, lng: place.longitude };
  const phone = contactOf(place.contacts, 'PHONE');
  const detail = placeDetailPath(place.kind, place.id);
  return (
    <div className="relative h-full pb-3">
      {/* Hai lớp thẻ mờ phía sau, lệch xuống dưới — cảm giác "xấp gợi ý" */}
      <div aria-hidden className="absolute inset-x-8 bottom-0 top-6 rounded-[28px] bg-white/[0.05] ring-1 ring-white/10" />
      <div aria-hidden className="absolute inset-x-4 bottom-1.5 top-3 rounded-[28px] bg-white/[0.08] ring-1 ring-white/10" />

      <div className="group relative flex h-full min-h-[380px] md:min-h-[440px] flex-col overflow-hidden rounded-[28px] bg-[#0b3b30] ring-1 ring-white/15 shadow-[0_2px_4px_rgba(0,0,0,0.2),0_40px_70px_-30px_rgba(0,0,0,0.85)]">
        <Link to={detail} className="absolute inset-0" aria-label={place.name}>
          {place.coverImageUrl ? (
            <img
              src={mediaUrl(place.coverImageUrl, 1100)}
              alt=""
              className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          ) : (
            <ImagePlaceholder Icon={Icon} variant="hero" />
          )}
        </Link>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#03180f]/95 via-[#03180f]/45 via-45% to-black/10" />

        {/* Chip trên: khung giờ + khoảng cách */}
        <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-2 p-4 md:p-5">
          <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${slot.tone} px-3 py-1 text-xs font-extrabold shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)]`}>
            <slot.Icon className="h-3.5 w-3.5" aria-hidden /> {slot.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-xs font-bold ring-1 ring-white/15">
            <MapPin className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Cách bạn {formatDistance(km)}
          </span>
        </div>

        <div className="relative z-10 mt-auto p-4 md:p-6">
          {place.regionName && <p className="text-xs font-semibold text-emerald-200/90">{place.regionName}</p>}
          <Link to={detail} className="mt-0.5 block text-2xl md:text-[32px] font-extrabold leading-tight tracking-tight [text-shadow:0_2px_16px_rgba(0,0,0,0.5)] line-clamp-2">
            {place.name}
          </Link>

          <ul className="mt-3 flex flex-wrap gap-2">
            {travelModes(km).map(({ Icon: ModeIcon, label, time }) => (
              <li key={label} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15">
                <ModeIcon className="h-4 w-4 text-emerald-300" aria-hidden />
                {label} <span className="font-extrabold text-white">~{time}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={directionsUrl(from, to, km <= 1.5)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--color-sun)] px-5 text-sm font-extrabold text-[#0a2e26] shadow-[0_10px_24px_-10px_rgba(250,204,21,0.8)] transition-transform hover:-translate-y-0.5"
            >
              <Navigation className="h-4 w-4" aria-hidden /> Chỉ đường
            </a>
            {phone && (
              <a
                href={telHref(phone)}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-bold ring-1 ring-white/25 transition-colors hover:bg-white/20"
              >
                <Phone className="h-4 w-4" aria-hidden /> Gọi quán
              </a>
            )}
            <Link to={detail} className="group/more inline-flex h-11 items-center gap-1 px-2 text-sm font-bold text-white/80 hover:text-white">
              Xem chi tiết <ArrowRight className="h-4 w-4 transition-transform group-hover/more:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
