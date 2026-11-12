import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysKey, parseDateKey, toDateKey, todayKey } from '@/lib/roomAvailability';

interface SearchCalendarProps {
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  /** Nhãn hai đầu: "Ngày đi" / "Ngày về" (lên lịch trình) hoặc "Nhận phòng" / "Trả phòng" (tìm chỗ ở). */
  fromLabel: string;
  toLabel: string;
  /**
   * Đang chọn một thời lượng cố định (2N1Đ, 3N2Đ, 1 tuần): đổi ngày đi thì ngày về tự dời theo đúng số đêm này. null /
   * không truyền = giữ ngày về nếu vẫn sau ngày đi (chọn tùy ý).
   */
  keepNights?: number | null;
  /** Hiện nút "Bỏ chọn ngày" (mặc định có). SearchHub luôn có ngày nên tắt. */
  allowClear?: boolean;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const longLabel = (key: string) => {
  const d = parseDateKey(key);
  return `${d.getDate()} Th${d.getMonth() + 1}, ${d.getFullYear()}`;
};

/** Ngày gần nhất (kể cả hôm nay) rơi vào thứ {@code weekday} (0 = CN … 6 = T7). */
const nextWeekday = (weekday: number) => {
  const today = new Date();
  return addDaysKey(toDateKey(today), (weekday - today.getDay() + 7) % 7);
};

/**
 * Lịch chọn ngày đi – về của SearchHub: hai tháng cạnh nhau (điện thoại một tháng), chọn ngày đầu rồi ngày cuối, nút chọn
 * nhanh khớp các gói lịch trình (T7 – CN = 2 ngày 1 đêm, T6 – CN = 3 ngày 2 đêm). Ngày dạng "YYYY-MM-DD" giờ địa phương.
 */
export default function SearchCalendar({ checkIn, checkOut, onChange, fromLabel, toLabel, keepNights = null, allowClear = true }: SearchCalendarProps) {
  const today = todayKey();
  const [target, setTarget] = useState<'checkIn' | 'checkOut'>(checkIn && !checkOut ? 'checkOut' : 'checkIn');
  const [view, setView] = useState(() => {
    const base = parseDateKey(checkIn && checkIn >= today ? checkIn : today);
    return { year: base.getFullYear(), month: base.getMonth() + 1 };
  });
  const nowDate = parseDateKey(today);
  const atFirstMonth = view.year === nowDate.getFullYear() && view.month <= nowDate.getMonth() + 1;
  const second = view.month === 12 ? { year: view.year + 1, month: 1 } : { year: view.year, month: view.month + 1 };

  const shift = (delta: number) => setView(({ year, month }) => {
    const index = year * 12 + (month - 1) + delta;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });

  const showMonthOf = (key: string) => {
    const d = parseDateKey(key);
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  /**
   * Ngày đầu mới: đang theo thời lượng cố định thì ngày cuối dời theo đủ số đêm; không thì giữ ngày cuối nếu vẫn sau ngày
   * đầu, không nữa thì tạm lấy hôm sau (1 đêm) — khách chọn tiếp ngày cuối.
   */
  const pick = (key: string) => {
    if (target === 'checkIn' || !checkIn || key <= checkIn) {
      const out = keepNights && keepNights > 0 ? addDaysKey(key, keepNights) : checkOut && checkOut > key ? checkOut : addDaysKey(key, 1);
      onChange(key, out);
      setTarget('checkOut');
      return;
    }
    onChange(checkIn, key);
    setTarget('checkIn');
  };

  const quick = (start: string, nights: number) => {
    onChange(start, addDaysKey(start, nights));
    setTarget('checkIn');
    showMonthOf(start);
  };

  const month = (year: number, mon: number) => {
    const daysInMonth = new Date(year, mon, 0).getDate();
    const lead = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="py-0.5 text-center text-sm font-bold text-[#0a2e26]">Tháng {mon}, {year}</div>
        <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400">
          {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {Array.from({ length: lead }).map((_, i) => <div key={`lead-${i}`} className="py-1.5" />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const key = toDateKey(new Date(year, mon - 1, day));
            const past = key < today;
            const edge = key === checkIn || key === checkOut;
            const between = !!checkIn && !!checkOut && key > checkIn && key < checkOut;
            return (
              <button
                key={key}
                type="button"
                disabled={past}
                onClick={() => pick(key)}
                aria-pressed={edge}
                aria-label={longLabel(key)}
                className={`rounded-md border py-1.5 text-xs font-bold tabular-nums transition-all sm:text-sm ${
                  past
                    ? 'pointer-events-none cursor-not-allowed border-transparent text-slate-300 line-through opacity-40'
                    : edge
                      ? 'scale-105 cursor-pointer border-[#06604a] bg-[#0a7d64] text-white shadow-xs'
                      : between
                        ? 'cursor-pointer border-transparent bg-[#edfbf7] font-semibold text-[#0a7d64]'
                        : key === today
                          ? 'cursor-pointer border-2 border-[#0a7d64] text-[#0a7d64] hover:bg-[#edfbf7]'
                          : 'cursor-pointer border-transparent text-slate-700 hover:border-slate-200 hover:bg-[#edfbf7]'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const edgeButton = (which: 'checkIn' | 'checkOut', label: string, value: string | null) => (
    <button
      type="button"
      onClick={() => {
        setTarget(which);
        if (value) showMonthOf(value);
      }}
      aria-pressed={target === which}
      className={`flex flex-1 flex-col items-center justify-center rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer sm:text-sm ${
        target === which ? 'border border-slate-200 bg-white text-[#0a7d64] shadow-xs' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <span className="text-[11px] font-semibold uppercase text-slate-400">{label}</span>
      <span>{value ? longLabel(value) : 'Chọn ngày'}</span>
    </button>
  );

  const chip = 'inline-flex min-h-9 shrink-0 items-center rounded-md border px-3 text-xs font-bold transition-colors cursor-pointer';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1">
        {edgeButton('checkIn', fromLabel, checkIn)}
        {edgeButton('checkOut', toLabel, checkOut)}
      </div>

      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-2 scrollbar-hide">
        <button type="button" onClick={() => quick(nextWeekday(6), 1)} className={`${chip} border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400`}>
          Cuối tuần này · T7 – CN
        </button>
        <button type="button" onClick={() => quick(nextWeekday(5), 2)} className={`${chip} border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400`}>
          T6 – CN · 3 ngày
        </button>
        <button type="button" onClick={() => quick(addDaysKey(today, 1), 1)} className={`${chip} border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0a7d64] hover:text-[#0a7d64]`}>
          Ngày mai
        </button>
        {allowClear && (checkIn || checkOut) && (
          <button type="button" onClick={() => { onChange(null, null); setTarget('checkIn'); }} className={`${chip} border-transparent text-slate-400 hover:text-rose-600`}>
            Bỏ chọn ngày
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atFirstMonth}
          aria-label="Tháng trước"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-[#0a7d64] hover:text-[#0a7d64] disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-slate-500">
          <span className="md:hidden">Tháng {view.month}/{view.year}</span>
          <span className="hidden md:inline">Tháng {view.month}/{view.year} – Tháng {second.month}/{second.year}</span>
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Tháng sau"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-[#0a7d64] hover:text-[#0a7d64] cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 md:divide-x md:divide-slate-100">
        <div>{month(view.year, view.month)}</div>
        <div className="hidden md:block md:pl-4">{month(second.year, second.month)}</div>
      </div>
    </div>
  );
}
