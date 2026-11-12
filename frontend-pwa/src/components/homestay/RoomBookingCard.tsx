import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import {
  Users,
  Maximize,
  AlertTriangle,
  BedDouble,
  Check,
  Coffee,
  ArrowRight,
  Route,
  X,
  CalendarDays,
  ChevronUp,
  ThumbsUp,
  LogIn,
  LogOut,
} from 'lucide-react';
import { RoomTypeDto, HomestayDetailDto } from '@/types/homestay';
import type { BookedDateRangeDto, BookingRoomChoice } from '@/types/booking';
import RoomAvailabilityCalendar from '@/components/homestay/RoomAvailabilityCalendar';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import ImageCarousel from '@/components/common/ImageCarousel';
import Stepper from '@/components/ui/Stepper';
import RoomStayInfo, { RoomQuickFacts } from '@/components/homestay/RoomStayInfo';
import { useStickyBottomBar } from '@/hooks/useStickyBottomBar';
import { buildOccupancy, formatVnDate, minAvailableInRange, nightsBetween, availableOn, addDaysKey } from '@/lib/roomAvailability';
import {
  MAX_ROOMS_PER_BOOKING, firstShortage, roomSummary, selectionPrice, suggestedGuestCount, totalRoomCount,
} from '@/lib/roomSelection';

interface RoomBookingCardProps {
  room: RoomTypeDto;
  homestay: HomestayDetailDto;
  bookedDates: BookedDateRangeDto[];
  /** Khoảng ngày dùng chung cho mọi loại phòng (trang cha giữ). Chỉ có ngày nhận = khách đang chọn ngày trả. */
  checkIn: string | null;
  checkOut: string | null;
  onDatesChange: (checkIn: string | null, checkOut: string | null) => void;
  /** Các loại phòng đã chọn của cả đơn (số phòng > 0) — trang cha giữ, một đơn đặt được nhiều loại phòng. */
  selection: BookingRoomChoice[];
  onRoomCountChange: (roomId: number, count: number) => void;
  /** Số khách của cả đơn. */
  guestCount: number;
  onGuestCountChange: (count: number) => void;
  /** Sang trang đặt phòng với toàn bộ lựa chọn. */
  onBook: () => void;
  /** Chỗ nghỉ có từ hai loại phòng đặt được — nhắc khách gộp nhiều loại phòng vào một đơn. */
  canMixRooms?: boolean;
  /** Thanh chọn loại phòng (Homestay có nhiều loại) — đặt ở đầu thẻ thay cho tên phòng. */
  roomPicker?: ReactNode;
  /** id vùng nội dung (aria-controls của thanh loại phòng). */
  panelId?: string;
  /** Loại phòng khác còn đủ phòng cho khoảng ngày đang chọn — gợi ý khi loại đang xem đã kín. */
  alternatives?: { room: RoomTypeDto; available: number }[];
  onSelectRoom?: (roomId: number) => void;
  /** Danh sách phòng: false = chỉ hiện thông tin phòng, lịch + số phòng + nút đặt xổ ra khi bấm "Xem lịch phòng". Mặc định true. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Phòng được gợi ý nhất cho số khách / ngày đang chọn. */
  recommended?: boolean;
  /** Đang chọn chỗ ở cho lịch trình này (?forJourney=) — đặt xong đơn tự gắn vào lịch trình. */
  journeyTitle?: string | null;
  /**
   * Phần "Lịch trình gợi ý quanh đây" đang hiện một lịch trình: ô "Lưu kèm lịch trình <tag> vào đơn" cạnh nút đặt (bật sẵn)
   * — đặt xong, màn hình kết quả mời lưu lịch trình đó cho đơn. null = không có gợi ý.
   */
  tripCarry?: TripCarry | null;
}

/** Ô chọn mang lịch trình gợi ý theo đơn: tag thời lượng ("2N1Đ"), trạng thái, đổi trạng thái. */
export interface TripCarry {
  tag: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** "Lưu kèm lịch trình 2N1Đ vào đơn" — ô tích thật (input checkbox), vùng bấm cao 44px. */
function TripCarryToggle({ tag, checked, onChange, compact = false }: TripCarry & { compact?: boolean }) {
  return (
    <label className={`relative flex cursor-pointer items-center gap-2 self-start text-[13px] font-bold text-[var(--color-ink)] ${compact ? 'min-h-9 before:absolute before:inset-x-0 before:-inset-y-1' : 'min-h-11'}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] peer-focus-visible:ring-offset-2 ${
          checked ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-slate-400 bg-white text-transparent'
        }`}
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
      </span>
      <span className="min-w-0">Lưu kèm lịch trình {tag} vào đơn</span>
    </label>
  );
}

export default function RoomBookingCard(props: RoomBookingCardProps) {
  // Loại phòng chưa có giá (dữ liệu nguồn không có giá cụ thể): không cho đặt, chỉ hướng khách liên hệ.
  if (props.room.basePrice == null) return <UnpricedRoomCard {...props} />;
  return <PricedRoomBookingCard {...props} basePrice={props.room.basePrice} />;
}

/** Vùng nội dung của loại phòng đang chọn (gắn với thanh loại phòng khi có). */
function panelProps(room: RoomTypeDto, roomPicker?: ReactNode, panelId?: string) {
  return roomPicker && panelId ? { id: panelId, role: 'tabpanel', 'aria-labelledby': `room-tab-${room.id}` } : {};
}

function RoomFacts({ room }: { room: RoomTypeDto }) {
  const item = 'inline-flex items-center gap-1 whitespace-nowrap';
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-slate-600">
      <span className={item}><Users className="h-3.5 w-3.5 text-[var(--color-primary)]" />Tối đa {room.maxOccupancy} khách</span>
      {room.areaSqm ? <span className={item}><Maximize className="h-3.5 w-3.5 text-[var(--color-primary)]" />{room.areaSqm} m²</span> : null}
      {room.bedType ? <span className={item}><BedDouble className="h-3.5 w-3.5 text-[var(--color-primary)]" />{room.bedType}</span> : null}
      {room.hasBreakfast ? <span className={item}><Coffee className="h-3.5 w-3.5 text-[var(--color-primary)]" />Có bữa sáng</span> : null}
    </div>
  );
}

/** Danh sách loại phòng đã chọn (khi đơn có loại phòng khác loại đang xem): bấm tên để xem, × để bỏ khỏi đơn. */
function SelectionList({ selection, prices, onSelectRoom, onRemove }: {
  selection: BookingRoomChoice[];
  prices: Map<number, number>;
  onSelectRoom?: (roomId: number) => void;
  onRemove: (roomId: number) => void;
}) {
  return (
    <ul className="space-y-1.5" aria-label="Phòng đã chọn">
      {selection.map((choice) => (
        <li key={choice.roomTypeId} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => onSelectRoom?.(choice.roomTypeId)}
            className="min-w-0 truncate text-left font-bold text-slate-800 transition-colors hover:text-[var(--color-primary)] cursor-pointer"
          >
            {choice.roomTypeName} <span className="font-semibold text-slate-500">×{choice.roomCount}</span>
          </button>
          <span className="flex shrink-0 items-center gap-1.5">
            {prices.has(choice.roomTypeId) && <span className="font-semibold text-slate-700">{vnd(prices.get(choice.roomTypeId) ?? 0)}đ</span>}
            <button
              type="button"
              onClick={() => onRemove(choice.roomTypeId)}
              aria-label={`Bỏ ${choice.roomTypeName} khỏi đơn`}
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function UnpricedRoomCard({ room, homestay, roomPicker, panelId }: RoomBookingCardProps) {
  const profile = homestay.homestayProfile;
  const checkInTime = profile?.checkInFrom ? profile.checkInFrom.slice(0, 5) : null;
  const checkOutTime = profile?.checkOutUntil ? profile.checkOutUntil.slice(0, 5) : null;

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-50/70 p-4 md:p-5 shadow-2xs">
      {roomPicker && <div className="-mx-4 -mt-4 mb-4 px-2 pt-1 md:-mx-5 md:-mt-5 md:px-3">{roomPicker}</div>}
      <div {...panelProps(room, roomPicker, panelId)}>
        <div className="flex flex-col gap-4 sm:flex-row items-start">
          <ImageCarousel
            key={room.id}
            images={room.images?.length ? room.images : (homestay.images ?? [])}
            alt={room.name}
            className="h-[175px] w-full shrink-0 rounded-xl bg-slate-200 sm:w-[250px] md:w-[280px]"
            imageClassName="h-full w-full object-cover"
            emptyContent={<ImagePlaceholder Icon={BedDouble} label="Ảnh phòng đang cập nhật" />}
          />
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 self-stretch">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-[var(--color-ink-deep)] mb-1.5">{room.name}</h3>
              <div className="mb-2">
                <span className="inline-block rounded-md bg-amber-50 px-2.5 py-1 text-xs md:text-sm font-bold text-amber-800">
                  Giá: liên hệ chỗ nghỉ
                </span>
              </div>
              <div className="mb-2">
                <RoomFacts room={room} />
              </div>
              {(checkInTime || checkOutTime) && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                  {checkInTime && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-2xs text-slate-700">
                      <LogIn className="h-3.5 w-3.5 text-[#0a7d64]" /> Nhận từ {checkInTime}
                    </span>
                  )}
                  {checkOutTime && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-2xs text-slate-700">
                      <LogOut className="h-3.5 w-3.5 text-rose-500" /> Trả trước {checkOutTime}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1">
                <RoomQuickFacts room={room} homestay={homestay} showStayTimes={false} />
              </div>
            </div>
            <p className="text-xs md:text-sm text-[var(--color-muted)] mt-2 pt-2 border-t border-slate-200/60">
              {room.totalRoomCount} phòng · Chỗ nghỉ chưa công bố giá cho loại phòng này nên chưa nhận đặt trực tuyến.
            </p>
          </div>
        </div>
        <RoomStayInfo room={room} homestay={homestay} />
      </div>
    </div>
  );
}

function PricedRoomBookingCard({
  room,
  homestay,
  bookedDates,
  checkIn,
  checkOut,
  onDatesChange,
  selection,
  onRoomCountChange,
  guestCount,
  onGuestCountChange,
  onBook,
  canMixRooms = false,
  basePrice,
  roomPicker,
  panelId,
  alternatives = [],
  onSelectRoom,
  journeyTitle = null,
  expanded = true,
  onToggleExpanded,
  recommended = false,
  tripCarry = null,
}: RoomBookingCardProps & { basePrice: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [cardInView, setCardInView] = useState(false);
  const [ctaInView, setCtaInView] = useState(true);
  useEffect(() => {
    const card = cardRef.current;
    const cta = ctaRef.current;
    if (!card || !cta || !('IntersectionObserver' in window)) return;
    // Thẻ phải lên tới nửa trên màn hình mới tính là "đang xem": thẻ mới ló ở đáy (khách còn đang xem lịch trình phía
    // trên, có nút đặt phòng riêng) thì chưa hiện thanh dính — mỗi màn hình chỉ một nút đặt phòng chính.
    const cardObserver = new IntersectionObserver(([entry]) => setCardInView(!!entry?.isIntersecting), { rootMargin: '0px 0px -45% 0px' });
    const ctaObserver = new IntersectionObserver(([entry]) => setCtaInView(!!entry?.isIntersecting));
    cardObserver.observe(card);
    ctaObserver.observe(cta);
    return () => { cardObserver.disconnect(); ctaObserver.disconnect(); };
  }, [expanded]);
  const maxRooms = Math.max(1, room.totalRoomCount || 1);
  // Số phòng của loại đang xem trong đơn (0 = chưa chọn loại này) và số phòng các loại khác đã chọn.
  const roomCount = selection.find((choice) => choice.roomTypeId === room.id)?.roomCount ?? 0;
  const otherRooms = totalRoomCount(selection.filter((choice) => choice.roomTypeId !== room.id));
  // Đơn còn loại phòng khác thì bớt được loại này về 0; chỉ có loại này thì tối thiểu 1 phòng.
  const minCount = otherRooms > 0 ? 0 : 1;

  // Đơn của riêng loại phòng này (hoặc đơn chung không chỉ định loại phòng).
  const occupancy = useMemo(() => buildOccupancy(bookedDates, room.id), [bookedDates, room.id]);
  const roomBookedDates = useMemo(
    () => bookedDates.filter((b) => !b.roomTypeId || Number(b.roomTypeId) === 0 || Number(b.roomTypeId) === Number(room.id)),
    [bookedDates, room.id],
  );

  const hasRange = !!checkIn && !!checkOut && checkOut > checkIn;
  const nights = nightsBetween(checkIn, checkOut);
  // Số phòng còn trống ít nhất trên các đêm đã chọn = "tổng phòng − phòng đã đặt" của loại phòng cho khoảng ngày.
  const availableForRange = hasRange && checkIn && checkOut ? minAvailableInRange(occupancy, maxRooms, checkIn, checkOut) : maxRooms;
  // Tối đa chọn được: phòng còn trống cả khoảng ngày, và cả đơn không quá giới hạn số phòng mỗi đơn.
  const maxCount = Math.max(minCount, Math.min(maxRooms, availableForRange, MAX_ROOMS_PER_BOOKING - otherRooms));

  // Đêm đầu tiên loại phòng này không đủ số phòng đang chọn (để báo đúng đêm nào kín).
  const shortNight = useMemo(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn || roomCount <= 0) return null;
    for (let key = checkIn; key < checkOut; key = addDaysKey(key, 1)) {
      const available = availableOn(occupancy, maxRooms, key);
      if (available < roomCount) return { key, available };
    }
    return null;
  }, [checkIn, checkOut, occupancy, maxRooms, roomCount]);

  // Cả đơn: tiền từng loại phòng, tổng tiền và loại phòng (khác) không đủ phòng cho khoảng ngày.
  const price = useMemo(
    () => (checkIn && checkOut && checkOut > checkIn ? selectionPrice(selection, checkIn, checkOut) : null),
    [selection, checkIn, checkOut],
  );
  const linePrices = useMemo(() => new Map((price?.lines ?? []).map((line) => [line.choice.roomTypeId, line.total])), [price]);
  const shortage = useMemo(
    () => (checkIn && checkOut && checkOut > checkIn ? firstShortage(selection, bookedDates, checkIn, checkOut) : null),
    [selection, bookedDates, checkIn, checkOut],
  );
  const otherShortage = shortage && shortage.choice.roomTypeId !== room.id ? shortage : null;
  const rooms = totalRoomCount(selection);
  // Đơn có loại phòng khác loại đang xem: liệt kê từng loại để khách biết đơn gồm những gì.
  const listSelection = selection.some((choice) => choice.roomTypeId !== room.id);
  const singlePrice = !listSelection ? price?.lines[0] : undefined;
  const canBook = hasRange && rooms > 0 && !shortage;
  const showAlternatives = hasRange && availableForRange < Math.max(1, roomCount) && alternatives.length > 0;
  const guestHint = suggestedGuestCount(selection) || room.maxOccupancy;
  // Số khách tối đa = sức chứa gợi ý + 2 khách ở thêm; giảm số phòng thì số khách tự hạ theo.
  const maxGuests = guestHint + 2;
  useEffect(() => {
    if (guestCount > maxGuests) onGuestCountChange(maxGuests);
  }, [guestCount, maxGuests, onGuestCountChange]);

  // Chỉ hiện thanh dính khi khách đã bắt đầu chọn ngày (tránh chiếm chỗ lúc còn đang xem ảnh, thông số).
  const showStickyBar = expanded && cardInView && !ctaInView && !!checkIn;
  const isMobileViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches;
  useStickyBottomBar(showStickyBar && isMobileViewport);

  const ctaLabel = !checkIn ? 'Chọn ngày nhận phòng'
    : !checkOut ? 'Chọn ngày trả phòng'
    : rooms === 0 ? 'Chọn số phòng'
    : shortage ? 'Không đủ phòng ngày đã chọn'
    : journeyTitle ? `Đặt ${rooms} phòng cho lịch trình`
    : `Đặt ${rooms} phòng`;

  const profile = homestay.homestayProfile;
  const checkInTime = profile?.checkInFrom ? profile.checkInFrom.slice(0, 5) : null;
  const checkOutTime = profile?.checkOutUntil ? profile.checkOutUntil.slice(0, 5) : null;

  return (
    <div
      ref={cardRef}
      className={`overflow-hidden rounded-2xl bg-slate-50/70 p-4 md:p-5 transition-shadow shadow-2xs ${
        hasRange && shortage ? 'ring-1 ring-rose-200 bg-rose-50/20' : ''
      }`}
    >
      {roomPicker && <div className="-mx-4 -mt-4 mb-4 px-2 pt-1 md:-mx-5 md:-mt-5 md:px-3">{roomPicker}</div>}

      <div {...panelProps(room, roomPicker, panelId)}>
        {/* Hàng thông tin phòng: Ảnh phòng bên trái + Thông tin phòng (Giá, Khách, Giờ nhận/trả...) CẠNH ẢNH PHÒNG */}
        <div className="flex flex-col gap-4 sm:flex-row items-start">
          {/* Cột ảnh phòng */}
          <div className="w-full sm:w-[250px] md:w-[280px] shrink-0">
            <ImageCarousel
              key={room.id}
              images={room.images?.length ? room.images : (homestay.images ?? [])}
              alt={room.name}
              className="h-[175px] sm:h-[195px] w-full rounded-xl bg-slate-200 overflow-hidden"
              imageClassName="h-full w-full object-cover"
              emptyContent={<ImagePlaceholder Icon={BedDouble} label="Ảnh phòng đang cập nhật" />}
            />
          </div>

          {/* Cột thông tin phòng (CẠNH ẢNH PHÒNG) */}
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 self-stretch">
            <div>
              {/* Tên phòng + Badge + Nút thu gọn lịch (nếu expanded) */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg md:text-xl font-bold text-[var(--color-ink-deep)]">{room.name}</h3>
                  {recommended && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-sun)] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0a2e26]">
                      <ThumbsUp className="h-3 w-3" /> Phù hợp nhất
                    </span>
                  )}
                </div>
                {expanded && onToggleExpanded && (
                  <button
                    type="button"
                    onClick={onToggleExpanded}
                    aria-expanded
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[var(--color-primary)] cursor-pointer"
                  >
                    <ChevronUp className="h-3.5 w-3.5" /> Thu gọn lịch
                  </button>
                )}
              </div>

              {/* Giá tham khảo / Giá theo đêm */}
              <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-slate-500">Giá tham khảo:</span>
                  <span className="text-xl md:text-2xl font-black text-[var(--color-coral)]">{vnd(basePrice)}đ</span>
                  <span className="text-xs font-semibold text-slate-500">/ đêm</span>
                </div>
                {room.weekendPrice && room.weekendPrice !== basePrice ? (
                  <div className="flex items-baseline gap-1 pl-3 border-l border-slate-300">
                    <span className="text-xs font-semibold text-slate-500">Cuối tuần:</span>
                    <span className="text-sm md:text-base font-bold text-pink-600">{vnd(room.weekendPrice)}đ</span>
                  </div>
                ) : null}
              </div>

              {/* Khách tối đa & thông số phòng */}
              <div className="mb-2">
                <RoomFacts room={room} />
              </div>

              {/* Giờ nhận / trả phòng */}
              {(checkInTime || checkOutTime) && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                  {checkInTime && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-2xs text-slate-700">
                      <LogIn className="h-3.5 w-3.5 text-[#0a7d64]" /> Nhận từ {checkInTime}
                    </span>
                  )}
                  {checkOutTime && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-2xs text-slate-700">
                      <LogOut className="h-3.5 w-3.5 text-rose-500" /> Trả trước {checkOutTime}
                    </span>
                  )}
                </div>
              )}

              {/* Tiện nghi nhanh */}
              <div className="mt-1">
                <RoomQuickFacts room={room} homestay={homestay} showStayTimes={false} />
              </div>
            </div>

            {/* KHI THU GỌN (!expanded): Tóm tắt phòng trống + Nút Xem lịch phòng & đặt */}
            {!expanded && (
              <div className="mt-2 pt-2.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <p className="text-xs md:text-sm font-semibold text-slate-600">
                  {hasRange
                    ? (availableForRange > 0
                      ? `Còn ${availableForRange} phòng trống cho ${nights} đêm bạn đã chọn.`
                      : 'Loại phòng này đã hết phòng cho ngày bạn chọn.')
                    : `${maxRooms} phòng loại này — bấm xem lịch để biết phòng trống từng ngày.`}
                </p>
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  aria-expanded={false}
                  className="inline-flex h-9 md:h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl cta cta-primary px-4 text-xs md:text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  <CalendarDays className="h-4 w-4" /> Xem lịch phòng & đặt
                </button>
              </div>
            )}
          </div>
        </div>

        {/* KHI MỞ RỘNG (expanded): Lịch, số phòng, số khách và tổng tiền + nút đặt */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-200/60 flex min-w-0 flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Stepper
                label={canMixRooms ? 'Phòng loại này' : 'Phòng'}
                value={roomCount}
                min={minCount}
                max={maxCount}
                onChange={(v) => onRoomCountChange(room.id, Math.max(minCount, Math.min(maxCount, v)))}
                hint={hasRange ? (availableForRange > 0 ? `Còn ${availableForRange} phòng trống cả ${nights} đêm` : 'Hết phòng ngày đã chọn') : `${maxRooms} phòng loại này`}
              />
              <Stepper label="Khách" value={guestCount} min={1} max={maxGuests} onChange={(v) => onGuestCountChange(Math.max(1, Math.min(maxGuests, v)))} hint={`Gợi ý ${guestHint} · tối đa ${maxGuests} khách`} />
            </div>
            {canMixRooms && !listSelection && (
              <p className="-mt-1.5 text-[11px] font-medium text-[var(--color-muted)]">
                Cần thêm loại phòng khác? Chọn loại trên thanh phía trên rồi tăng số phòng — tất cả gộp chung một đơn.
              </p>
            )}

            <RoomAvailabilityCalendar
              bookedDates={roomBookedDates}
              totalRoomCount={maxRooms}
              requestedRoomCount={Math.max(1, roomCount)}
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={onDatesChange}
            />

            {shortNight && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 md:text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span>
                  {shortNight.available <= 0
                    ? `Đêm ${formatVnDate(shortNight.key)} đã kín toàn bộ ${maxRooms} phòng loại này.`
                    : `Đêm ${formatVnDate(shortNight.key)} chỉ còn ${shortNight.available}/${maxRooms} phòng, không đủ ${roomCount} phòng bạn chọn.`}
                  {' '}Hãy chọn ngày khác{showAlternatives ? ' hoặc loại phòng còn trống bên dưới.' : '.'}
                </span>
              </div>
            )}

            {showAlternatives && onSelectRoom && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="mb-2 text-xs font-bold text-emerald-900">Còn trống cho ngày bạn chọn:</p>
                <div className="flex flex-wrap gap-2">
                  {alternatives.map(({ room: alt, available }) => (
                    <button
                      key={alt.id}
                      type="button"
                      onClick={() => onSelectRoom(alt.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer"
                    >
                      {alt.name}
                      <span className="font-semibold text-emerald-600">· còn {available}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Đang chọn chỗ ở cho một lịch trình: đặt xong đơn tự gắn vào lịch trình */}
            {journeyTitle && (
              <div className="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2.5 text-xs text-teal-900 md:text-[13px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a7d64] text-white">
                  <Route className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  Đặt cho lịch trình <strong>{journeyTitle}</strong> — đơn tự gắn vào lịch trình khi đặt xong.
                </span>
              </div>
            )}

            {/* Phòng đã chọn, tổng tiền & nút đặt: chỉ bật khi đã chọn đủ ngày nhận VÀ ngày trả, mọi loại phòng còn đủ phòng */}
            <div className="mt-auto flex flex-col gap-3 border-t border-slate-200/60 pt-3.5">
              {listSelection && (
                <SelectionList
                  selection={selection}
                  prices={linePrices}
                  onSelectRoom={onSelectRoom}
                  onRemove={(roomId) => onRoomCountChange(roomId, 0)}
                />
              )}
              {otherShortage && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    {otherShortage.choice.roomTypeName}: đêm {formatVnDate(otherShortage.night)}{' '}
                    {otherShortage.available <= 0
                      ? 'đã kín phòng.'
                      : `chỉ còn ${otherShortage.available} phòng, không đủ ${otherShortage.choice.roomCount} phòng bạn chọn.`}
                  </span>
                </div>
              )}
              {tripCarry && <TripCarryToggle {...tripCarry} />}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-700">
                  {price && rooms > 0 ? (
                    <>
                      <div>
                        {price.nights} đêm · {rooms} phòng:{' '}
                        <strong className="text-lg font-extrabold text-[var(--color-coral)]">{vnd(price.total)}đ</strong>
                      </div>
                      {singlePrice && singlePrice.weekendNights > 0 && (
                        <div className="text-[11px] font-medium text-pink-700">
                          Gồm {singlePrice.weekendNights} đêm cuối tuần giá {vnd(room.weekendPrice ?? basePrice)}đ
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs font-medium text-[var(--color-muted)] md:text-sm">
                      {!checkIn ? 'Chọn ngày nhận và trả phòng trên lịch để xem tổng tiền.'
                        : !checkOut ? 'Chọn ngày trả phòng để xem tổng tiền.'
                        : 'Chọn số phòng muốn đặt.'}
                    </span>
                  )}
                </div>
                <button
                  ref={ctaRef}
                  type="button"
                  disabled={!canBook}
                  onClick={onBook}
                  className={`inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold transition-colors sm:w-auto md:text-base ${
                    canBook
                      ? 'cta cta-coral text-white shadow-sm cursor-pointer'
                      : 'cursor-not-allowed bg-slate-100 text-slate-400'
                  }`}
                >
                  {ctaLabel}
                  {canBook && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tiện nghi đầy đủ + chính sách */}
        {expanded && <RoomStayInfo room={room} homestay={homestay} />}
      </div>

      {showStickyBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-2.5 pb-[max(var(--safe-bottom),0.75rem)] shadow-[0_-4px_16px_rgba(10,46,38,0.10)] backdrop-blur-md lg:hidden rise-in">
          {tripCarry && <div className="mx-auto mb-1 flex max-w-[1240px]"><TripCarryToggle {...tripCarry} compact /></div>}
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--color-ink-deep)]">{listSelection ? roomSummary(selection) : room.name}</p>
              <p className="truncate text-xs font-semibold text-[var(--color-muted)]">
                {price && rooms > 0 ? <><span className="text-base font-black text-[var(--color-coral)]">{vnd(price.total)}đ</span> · {price.nights} đêm{rooms > 1 ? ` · ${rooms} phòng` : ''}</> : checkOut ? 'Chọn số phòng muốn đặt' : 'Chọn ngày trả phòng trên lịch'}
              </p>
            </div>
            <button
              type="button"
              disabled={!canBook}
              onClick={onBook}
              className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors ${canBook ? 'cta cta-coral text-white cursor-pointer' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
            >
              {canBook && journeyTitle && <Route className="h-4 w-4" />}
              {canBook ? (journeyTitle ? 'Đặt cho lịch trình' : 'Đặt phòng') : !checkOut ? 'Chọn ngày trả' : rooms === 0 ? 'Chọn số phòng' : 'Không đủ phòng'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
