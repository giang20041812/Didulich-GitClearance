import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Ban, Check, RotateCcw } from 'lucide-react';
import { BookedDateRangeDto } from '@/types/booking';
import {
  addDaysKey, availableOn, buildOccupancy, formatVnDayShort, nightsBetween, parseDateKey, todayKey,
} from '@/lib/roomAvailability';

/** Một loại phòng trên lịch: đơn đã đặt, tổng số phòng và số phòng khách cần của loại đó. */
export interface CalendarRoomLine {
  name: string;
  /** Lọc đơn theo loại phòng (đơn không ghi loại phòng được tính cho mọi loại); bỏ trống = đơn đã lọc sẵn. */
  roomTypeId?: number;
  bookedDates: BookedDateRangeDto[];
  totalRoomCount: number;
  requestedRoomCount: number;
}

interface RoomAvailabilityCalendarProps {
  /** Đơn đã đặt của loại phòng đang xem (đơn không ghi loại phòng cũng được tính). */
  bookedDates?: BookedDateRangeDto[];
  totalRoomCount?: number;
  /** Số phòng khách đang chọn: đêm còn ít phòng hơn thì không chọn được. */
  requestedRoomCount?: number;
  /**
   * Đơn có nhiều loại phòng: một đêm chỉ chọn được khi MỌI loại đều đủ phòng (thay cho bookedDates / totalRoomCount /
   * requestedRoomCount).
   */
  lines?: CalendarRoomLine[];
  /** Khoảng ngày do trang cha giữ (YYYY-MM-DD). Chỉ có ngày nhận = khách đang chọn ngày trả phòng. */
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  className?: string;
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Lịch trống của một loại phòng (hoặc của mọi loại phòng trong đơn — `lines`): một khung tháng, bấm mũi tên để sang tháng.
 * Bấm ngày nhận rồi ngày trả — chỉ khi có đủ CẢ HAI ngày trang cha mới cho đặt (trước đây bấm một ngày vẫn đặt được
 * với ngày trả mặc định). Ngày trả được phép rơi vào đêm đã kín (khách trả phòng sáng hôm đó, không ở đêm đó);
 * ngày sau đêm kín đầu tiên không làm ngày trả được — bấm vào sẽ chọn lại ngày nhận.
 */
export default function RoomAvailabilityCalendar({
  bookedDates,
  totalRoomCount = 1,
  requestedRoomCount = 1,
  lines,
  checkIn,
  checkOut,
  onChange,
  className = '',
}: RoomAvailabilityCalendarProps) {
  const today = useMemo(() => todayKey(), []);
  const [monthDate, setMonthDate] = useState(() => {
    const start = checkIn && checkIn >= today ? parseDateKey(checkIn) : new Date();
    return new Date(start.getFullYear(), start.getMonth(), 1);
  });

  // Ngày nhận phòng đổi từ nơi khác (đường dẫn, đổi loại phòng): mở lịch đúng tháng đó.
  useEffect(() => {
    if (!checkIn) return;
    const d = parseDateKey(checkIn);
    setMonthDate((current) => (current.getFullYear() === d.getFullYear() && current.getMonth() === d.getMonth() ? current : new Date(d.getFullYear(), d.getMonth(), 1)));
  }, [checkIn]);

  const rooms = useMemo(() => {
    const source: CalendarRoomLine[] = lines?.length
      ? lines
      : [{ name: '', bookedDates: bookedDates ?? [], totalRoomCount, requestedRoomCount }];
    return source.map((line) => ({
      name: line.name,
      occupancy: buildOccupancy(line.bookedDates, line.roomTypeId ?? null),
      total: Math.max(1, line.totalRoomCount),
      needed: Math.max(1, line.requestedRoomCount),
    }));
  }, [lines, bookedDates, totalRoomCount, requestedRoomCount]);
  const multiRoom = rooms.length > 1;

  /** Loại phòng "chật" nhất của một đêm (dư ít phòng nhất so với số phòng cần) — quyết định đêm chọn được hay không. */
  const nightOf = (key: string) => {
    let tightest = { name: '', available: 0, total: 1, needed: 1, slack: Number.POSITIVE_INFINITY };
    for (const room of rooms) {
      const available = availableOn(room.occupancy, room.total, key);
      const slack = available - room.needed;
      if (slack < tightest.slack) tightest = { name: room.name, available, total: room.total, needed: room.needed, slack };
    }
    return tightest;
  };

  const selectingCheckout = !!checkIn && !checkOut;
  // Ngày trả muộn nhất: đêm đầu tiên không đủ phòng kể từ ngày nhận (khách vẫn trả phòng được vào sáng hôm đó).
  const checkoutLimit = useMemo(() => {
    if (!selectingCheckout || !checkIn) return null;
    for (let i = 0, key = checkIn; i < 400; i += 1, key = addDaysKey(key, 1)) {
      if (rooms.some((room) => availableOn(room.occupancy, room.total, key) < room.needed)) return key;
    }
    return null;
  }, [selectingCheckout, checkIn, rooms]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const isValidCheckout = (key: string) => !!checkIn && key > checkIn && (!checkoutLimit || key <= checkoutLimit);
  const isNightOpen = (key: string) => key >= today && nightOf(key).slack >= 0;

  const handleDateClick = (key: string) => {
    setHoverKey(null);
    if (selectingCheckout && checkIn) {
      if (key === checkIn) { onChange(null, null); return; }
      if (isValidCheckout(key)) { onChange(checkIn, key); return; }
    }
    if (isNightOpen(key)) onChange(key, null);
  };

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const now = new Date();
  const isPrevDisabled = year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
  const nights = nightsBetween(checkIn, checkOut);
  // Dải ngày đang xem trước khi bấm ngày trả (rê chuột trên máy tính).
  const previewEnd = selectingCheckout && hoverKey && isValidCheckout(hoverKey) ? hoverKey : null;

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(<div key={`pad-${i}`} className="h-11 md:h-12" />);
  for (let d = 1; d <= totalDays; d++) {
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    const isPast = key < today;
    const night = nightOf(key);
    const { available, total: totalRooms, needed: neededRooms } = night;
    const isFull = available <= 0;
    const isShort = night.slack < 0;
    const isStart = key === checkIn;
    const isEnd = key === checkOut || key === previewEnd;
    const rangeEnd = checkOut ?? previewEnd;
    const inRange = !!checkIn && !!rangeEnd && key > checkIn && key < rangeEnd;
    const checkoutCandidate = selectingCheckout && isValidCheckout(key);
    // Sau đêm kín đầu tiên: không làm ngày trả được, bấm vào là chọn lại ngày nhận (nếu đêm đó còn phòng).
    const beyondLimit = selectingCheckout && !!checkoutLimit && key > checkoutLimit;
    const selectable = !isPast && (checkoutCandidate || isStart || !isShort);

    // Luôn ghi số phòng còn trống ở mỗi đêm (chỗ chỉ có 1 phòng thì ghi "Trống").
    const countLabel = totalRooms > 1 ? `Còn ${available}` : 'Trống';
    let tone = 'text-slate-800 hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary)]';
    let badge: string | null = null;
    let badgeTone = '';
    if (isPast) {
      tone = 'text-slate-300 line-through';
    } else if (isStart || isEnd) {
      tone = 'bg-[var(--color-coral)] text-white font-extrabold shadow-sm';
      if (isStart) { badge = countLabel; badgeTone = 'text-white/90'; }
    } else if (inRange) {
      tone = 'bg-[var(--color-coral)]/12 text-[var(--color-coral-hover)] font-bold';
      badge = countLabel; badgeTone = 'text-[var(--color-coral-hover)]';
    } else if (checkoutCandidate && isShort) {
      // Đêm kín nhưng vẫn trả phòng được vào sáng hôm đó.
      tone = 'border border-dashed border-rose-300 text-slate-800 hover:bg-[var(--color-primary-50)]';
      badge = 'Trả phòng'; badgeTone = 'text-rose-500';
    } else if (isFull) {
      tone = 'bg-rose-50 text-rose-300 line-through';
      badge = 'Kín'; badgeTone = 'text-rose-500';
    } else if (isShort) {
      tone = 'bg-amber-50 text-amber-700';
      badge = `Còn ${available}`; badgeTone = 'text-amber-700';
    } else {
      if (beyondLimit) tone = 'text-slate-400 hover:bg-slate-50 hover:text-slate-600';
      badge = countLabel; badgeTone = available === 1 ? 'text-amber-600' : 'text-emerald-700';
    }

    const dateObj = parseDateKey(key);
    const label = `${WEEKDAY_LONG[dateObj.getDay()]}, ${d} tháng ${month + 1}`;
    const title = isPast ? 'Ngày đã qua'
      : isStart ? (selectingCheckout ? 'Ngày nhận phòng · bấm lần nữa để bỏ chọn' : 'Ngày nhận phòng')
      : key === checkOut ? 'Ngày trả phòng'
      : checkoutCandidate ? (isShort ? 'Trả phòng sáng ngày này (đêm này đã kín)' : `Trả phòng ngày này · ${nightsBetween(checkIn, key)} đêm`)
      : beyondLimit && !isShort ? 'Không ở liền được qua đêm đã kín · bấm để chọn làm ngày nhận phòng mới'
      : isFull ? `${multiRoom ? `${night.name}: đ` : 'Đ'}ã kín toàn bộ ${totalRooms} phòng`
      : isShort ? `${multiRoom ? `${night.name}: c` : 'C'}hỉ còn ${available} phòng, không đủ ${neededRooms} phòng bạn chọn`
      : multiRoom ? rooms.map((room) => `${room.name} còn ${availableOn(room.occupancy, room.total, key)}/${room.total}`).join(' · ')
      : `Còn ${available}/${totalRooms} phòng trống`;
    const isToday = key === today;

    cells.push(
      <button
        key={key}
        type="button"
        disabled={!selectable}
        onClick={() => handleDateClick(key)}
        onMouseEnter={() => setHoverKey(key)}
        onMouseLeave={() => setHoverKey((current) => (current === key ? null : current))}
        title={title}
        aria-label={`${label}. ${title}`}
        aria-pressed={isStart || key === checkOut}
        className={`relative flex h-11 w-full flex-col items-center justify-center ${inRange ? 'rounded-none' : 'rounded-md'} text-sm font-semibold transition-colors md:h-12 md:text-[15px] disabled:cursor-not-allowed ${selectable ? 'cursor-pointer' : ''} ${tone} ${isToday && !isStart && !isEnd ? 'ring-2 ring-inset ring-[var(--color-primary)]/60' : ''}`}
      >
        <span className={`leading-none ${badge ? '-mt-2' : ''}`}>{d}</span>
        {badge &&<span className={`absolute bottom-0.5 text-[10px] font-bold leading-none md:text-[11px] ${badgeTone}`}>{badge}</span>}
      </button>,
    );
  }

  const fieldBase = 'flex min-w-0 flex-1 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors cursor-pointer';
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Ô ngày nhận / ngày trả: ô đang chờ chọn được viền nổi bật — khách biết bước tiếp theo phải làm gì */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className={`${fieldBase} ${!checkIn ? 'border-[var(--color-coral)] ring-2 ring-[var(--color-coral)]/20 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          aria-label="Chọn lại ngày nhận phòng"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Nhận phòng</span>
          <span className={`truncate text-sm font-bold ${checkIn ? 'text-[var(--color-ink-deep)]' : 'text-[var(--color-coral-hover)]'}`}>
            {checkIn ? formatVnDayShort(checkIn) : 'Chọn ngày'}
          </span>
        </button>
        <button
          type="button"
          disabled={!checkIn}
          onClick={() => checkIn && onChange(checkIn, null)}
          className={`${fieldBase} disabled:cursor-default ${selectingCheckout ? 'border-[var(--color-coral)] ring-2 ring-[var(--color-coral)]/20 bg-white' : 'border-slate-200 bg-white enabled:hover:border-slate-300'}`}
          aria-label="Chọn lại ngày trả phòng"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Trả phòng</span>
          <span className={`truncate text-sm font-bold ${checkOut ? 'text-[var(--color-ink-deep)]' : selectingCheckout ? 'text-[var(--color-coral-hover)]' : 'text-slate-400'}`}>
            {checkOut ? formatVnDayShort(checkOut) : 'Chọn ngày'}
          </span>
        </button>
        {(checkIn || checkOut) && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 cursor-pointer"
            aria-label="Xóa ngày đã chọn"
            title="Xóa ngày đã chọn"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Xóa
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 md:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" disabled={isPrevDisabled} onClick={() => setMonthDate(new Date(year, month - 1, 1))} aria-label="Tháng trước"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <h5 className="text-base font-bold text-[var(--color-ink-deep)] md:text-lg">Tháng {month + 1}, {year}</h5>
            {/* Bước tiếp theo, ngay trên lưới ngày */}
            <p className="text-xs font-semibold text-[var(--color-muted)]" aria-live="polite">
              {!checkIn ? 'Bấm chọn ngày nhận phòng'
                : selectingCheckout ? (checkoutLimit === checkIn ? 'Ngày nhận này không còn đủ phòng — chọn ngày khác'
                  : checkoutLimit ? `Chọn ngày trả phòng · muộn nhất ${formatVnDayShort(checkoutLimit)}` : 'Chọn ngày trả phòng')
                : `${nights} đêm · bấm ngày khác để chọn lại`}
            </p>
          </div>
          <button type="button" onClick={() => setMonthDate(new Date(year, month + 1, 1))} aria-label="Tháng tiếp theo"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold text-[var(--color-muted)] md:text-[13px]">
          {WEEKDAY_SHORT.map((w) => <span key={w} className={w === 'CN' || w === 'T7' ? 'text-[var(--color-coral-hover)]/80' : ''}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHoverKey(null)}>{cells}</div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm border border-slate-300 bg-white" />Còn trống (ghi số phòng còn lại)</span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-rose-300 bg-rose-50 text-rose-500"><Ban className="h-2.5 w-2.5" /></span>Đã kín
        </span>
        {(multiRoom || (rooms[0]?.needed ?? 1) > 1) && (
          <span className="flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-amber-300 bg-amber-50 text-[9px] font-bold text-amber-700">!</span>
            {multiRoom ? 'Không đủ phòng bạn chọn' : `Không đủ ${rooms[0]?.needed ?? 1} phòng`}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-[var(--color-coral)] text-white"><Check className="h-2.5 w-2.5" /></span>Ngày bạn chọn
        </span>
      </div>
    </div>
  );
}

