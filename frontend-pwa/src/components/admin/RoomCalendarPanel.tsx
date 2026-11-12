import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, BedDouble, ChevronDown, ChevronLeft, ChevronRight, Clock, Home, Lock, User } from 'lucide-react';
import { adminService, type AdminCalendarHomestay } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { addDaysIso, dayMonth, isoDate, parseIso, todayIso, weekdayLong, weekdayShort } from '@/lib/partnerDates';
import type { HomestayUnits, UnitState } from '@/types/room';

const SPAN = 7;
const REFRESH_MS = 60_000;
const HOMESTAY_KEY = 'admin_calendar_homestay';
/** Bảng giống Lịch phòng của NCC: cột tên phòng 60px, hàng tiêu đề 56px, mỗi hàng phòng 72px. */
const LABEL_W = 60, HEADER_H = 56, ROW_H = 72;

/** Cùng màu với Lịch phòng của NCC: xanh còn trống · vàng khách đang giữ · đỏ có khách / khóa. */
const CELL: Record<UnitState, string> = {
  FREE: 'border-primary bg-primary-50',
  HELD: 'border-sun bg-sun-light text-amber-700',
  GUEST: 'border-danger bg-danger/15 text-red-700',
  LOCKED: 'border-danger bg-danger/15 text-red-700',
};
const STATE_TEXT: Record<UnitState, string> = { FREE: 'còn trống', HELD: 'khách đang giữ phòng', GUEST: 'có khách đặt', LOCKED: 'chủ nhà khóa' };
const PICKER_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Thứ Hai của tuần chứa ngày này. */
const mondayOf = (iso: string) => addDaysIso(iso, -((parseIso(iso).getDay() + 6) % 7));

const readSaved = () => {
  try { return Number(localStorage.getItem(HOMESTAY_KEY)); } catch { return NaN; }
};
const save = (id: number) => {
  try { localStorage.setItem(HOMESTAY_KEY, String(id)); } catch { /* chỉ để nhớ lựa chọn */ }
};

/**
 * Lịch phòng (chỉ xem) y như màn hình Lịch phòng của NCC, chỉ thêm bộ chọn homestay cạnh tiêu đề (Admin xem được mọi
 * homestay): mọi phòng của homestay (gom theo loại phòng, P.1, P.2...) là các hàng, mỗi cột là một ngày của tuần đang xem.
 */
export default function RoomCalendarPanel() {
  const [homestays, setHomestays] = useState<AdminCalendarHomestay[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [today, setToday] = useState(todayIso);

  useVisibleInterval(() => { const now = todayIso(); if (now !== today) setToday(now); }, REFRESH_MS);

  useEffect(() => {
    let active = true;
    adminService.getCalendarHomestays()
      .then((list) => {
        if (!active) return;
        setHomestays(list);
        setError('');
        setPlaceId((cur) => {
          const ids = list.map((h) => h.id);
          if (cur !== null && ids.includes(cur)) return cur;
          const saved = readSaved();
          return ids.includes(saved) ? saved : (ids[0] ?? null);
        });
      })
      .catch((e: unknown) => { if (active) setError(getApiErrorMessage(e, 'Không tải được danh sách homestay.')); });
    return () => { active = false; };
  }, [reload]);

  const choose = (id: number) => { save(id); setPlaceId(id); };

  const picker = homestays && homestays.length > 0 && placeId !== null ? (
    <div className="relative min-w-0 flex-1 lg:max-w-sm">
      <Home className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
      <select value={placeId} onChange={(e) => choose(Number(e.target.value))} aria-label="Chọn homestay"
        className="h-11 w-full appearance-none truncate rounded-md border-2 border-border bg-white pl-10 pr-9 text-base font-bold text-ink-deep transition-colors duration-200 hover:border-primary focus:border-primary focus:outline-none">
        {homestays.map((h) => (
          <option key={h.id} value={h.id}>{h.name}{h.providerName ? ` — ${h.providerName}` : ''}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-deep" strokeWidth={3} />
    </div>
  ) : null;

  if (placeId === null || !homestays) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-black text-ink-deep sm:text-3xl">Lịch phòng</h1>
        {error ? <ErrorBox text={error} onRetry={() => { setError(''); setReload((n) => n + 1); }} />
          : !homestays ? <div className="h-64 animate-pulse rounded-lg bg-ink/5" />
          : <Empty text="Chưa có homestay nào." />}
      </div>
    );
  }
  return <HomestayCalendar key={`${placeId}-${today}`} placeId={placeId} today={today} picker={picker} />;
}

function HomestayCalendar({ placeId, today, picker }: { placeId: number; today: string; picker: ReactNode }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [data, setData] = useState<HomestayUnits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [monthOpen, setMonthOpen] = useState(false);

  const dates = useMemo(() => Array.from({ length: SPAN }, (_, i) => addDaysIso(weekStart, i)), [weekStart]);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      setData(await adminService.getHomestayUnits(placeId, weekStart, addDaysIso(weekStart, SPAN)));
      setError('');
    } catch (e: unknown) {
      if (!silent) setError(getApiErrorMessage(e, 'Không tải được lịch phòng. Vui lòng thử lại.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [placeId, weekStart]);

  useEffect(() => { void load(false); }, [load, reload]);
  // Tự làm mới mỗi phút (khách mới đặt / giữ phòng, chủ nhà khóa / mở).
  useVisibleInterval(() => { void load(true); }, REFRESH_MS);

  const rooms = data?.rooms ?? [];
  /** roomId → ngày → trạng thái từng phòng. */
  const byRoom = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, Object.fromEntries(r.days.map((d) => [d.stayDate, d.units]))])), [rooms]);

  // Khung bảng cao vừa tới đáy màn hình, nhiều phòng thì cuộn dọc (hàng ngày và cột P.x đứng yên).
  const scroller = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState(0);
  useLayoutEffect(() => {
    const fit = () => {
      const el = scroller.current;
      if (!el) return;
      const bottom = window.matchMedia('(min-width: 1024px)').matches ? 32 : 96;
      setMaxH(Math.max(320, Math.floor(window.innerHeight - el.getBoundingClientRect().top - bottom)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rooms.length, monthOpen, error, data === null]);

  // Tuần đang xem có ngày mùng 1 thì hiện tháng đó, không thì lấy ngày giữa tuần.
  const labelDate = dates.find((d) => d.endsWith('-01')) ?? addDaysIso(weekStart, 3);
  const month = Number(labelDate.slice(5, 7)), year = Number(labelDate.slice(0, 4));

  let body: ReactNode;
  if (!data) {
    body = error ? null : <div className="h-64 animate-pulse rounded-lg bg-ink/5" />;
  } else if (rooms.length === 0) {
    body = <Empty text="Homestay này chưa có loại phòng nào." />;
  } else {
    // Danh sách mọi phòng của homestay (gom theo loại phòng) × từng ngày của tuần đang xem.
    body = (
      <div className={`flex flex-col overflow-hidden rounded-lg border-2 border-border bg-ink-deep/[0.04] transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
        <div ref={scroller} className="overflow-auto bg-white" style={{ maxHeight: maxH || undefined }}>
          <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `${LABEL_W}px repeat(${SPAN}, minmax(0, 1fr))` }}>
            <div className="sticky left-0 top-0 z-30 bg-white" style={{ height: HEADER_H }} />
            {dates.map((date) => (
              <div key={date} style={{ height: HEADER_H }}
                className={`sticky top-0 z-10 flex flex-col items-center justify-end bg-white pb-1.5 ${date < today ? 'opacity-60' : ''}`}>
                <span className="text-xs font-black uppercase tracking-wider text-ink-deep sm:text-sm">{weekdayShort(date)}</span>
                <span className={`flex h-7 min-w-[2.5rem] items-center justify-center rounded-full px-1.5 text-sm font-black tabular-nums sm:text-base ${date === today ? 'bg-primary text-white' : 'text-ink-deep'}`}>
                  {Number(date.slice(8))}/{Number(date.slice(5, 7))}
                </span>
              </div>
            ))}
            {rooms.map((r) => {
              const on = r.status === 'ACTIVE';
              return [
                // Dòng tên loại phòng
                <div key={`room-${r.id}`} style={{ gridColumn: '1 / -1' }} className="border-t-2 border-border bg-ink-deep/[0.04]">
                  <div className="sticky left-0 flex w-fit items-center gap-2 px-2 py-2">
                    <BedDouble className="h-4 w-4 text-primary" />
                    <span className="text-base font-bold text-ink-deep">{r.name}</span>
                    <span className="rounded-sm bg-white px-1.5 py-0.5 text-xs font-black tabular-nums text-muted">{on ? `${r.totalRoomCount} phòng` : 'Tắt bán'}</span>
                  </div>
                </div>,
                ...(on ? Array.from({ length: r.totalRoomCount }, (_, i) => i + 1) : []).map((unit) => [
                  <div key={`unit-${r.id}-${unit}`} style={{ height: ROW_H }} className="sticky left-0 z-20 flex bg-white py-1 pl-1">
                    <span className="flex w-full items-center justify-center rounded-md bg-ink-deep/[0.06] text-sm font-black tabular-nums text-ink-deep sm:text-base">P.{unit}</span>
                  </div>,
                  ...dates.map((date) => {
                    const state = byRoom[r.id]?.[date]?.[unit - 1];
                    const past = date < today;
                    return (
                      <div key={`${r.id}-${unit}-${date}`} style={{ height: ROW_H }} className="p-1">
                        {state ? (
                          <div title={`${r.name} · P.${unit} · ${weekdayLong(date)}, ${dayMonth(date)}: ${STATE_TEXT[state]}`}
                            className={`flex h-full w-full items-center justify-center rounded-md border-2 ${past ? 'border-border bg-ink-deep/[0.04] text-muted opacity-70' : CELL[state]}`}>
                            {state === 'LOCKED' && <Lock className="h-6 w-6" />}
                            {state === 'GUEST' && <User className="h-6 w-6" />}
                            {state === 'HELD' && <Clock className="h-6 w-6" strokeWidth={2.5} />}
                          </div>
                        ) : <div aria-hidden="true" className={`h-full w-full rounded-md ${past ? 'bg-ink-deep/[0.04] opacity-70' : 'animate-pulse bg-ink/5'}`} />}
                      </div>
                    );
                  }),
                ]),
              ];
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tiêu đề & chọn homestay */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="shrink-0 text-xl font-black text-ink-deep sm:text-2xl lg:text-3xl">Lịch phòng</h1>
        {picker}
      </div>

      {/* Điều hướng lịch */}
      {rooms.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-ink-deep/[0.04] p-1.5 sm:p-2">
          <button type="button" aria-label={`Xem ${SPAN} ngày trước`} onClick={() => setWeekStart((w) => addDaysIso(w, -SPAN))}
            className="flex h-10 items-center gap-1 rounded-md border-2 border-transparent bg-white px-2 text-xs font-bold text-ink-deep shadow-sm transition-all duration-200 hover:border-primary hover:text-primary sm:gap-1.5 sm:px-3 sm:text-sm">
            <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span>Tuần trước</span>
          </button>

          <button type="button" aria-expanded={monthOpen} onClick={() => setMonthOpen((o) => !o)}
            className="flex h-10 items-center gap-1 rounded-md px-3 text-sm font-black text-ink-deep transition-colors duration-200 hover:bg-white hover:text-primary sm:text-base">
            <span className="whitespace-nowrap">Tháng {month} {year}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${monthOpen ? 'rotate-180' : ''}`} strokeWidth={3} />
          </button>

          <button type="button" aria-label={`Xem ${SPAN} ngày sau`} onClick={() => setWeekStart((w) => addDaysIso(w, SPAN))}
            className="flex h-10 items-center gap-1 rounded-md border-2 border-transparent bg-white px-2 text-xs font-bold text-ink-deep shadow-sm transition-all duration-200 hover:border-primary hover:text-primary sm:gap-1.5 sm:px-3 sm:text-sm">
            <span>Tuần sau</span>
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {rooms.length > 0 && monthOpen && (
        <MonthPicker key={`${year}-${month}`} initialMonth={`${labelDate.slice(0, 7)}-01`} today={today} weekStart={weekStart}
          onPick={(date) => { setWeekStart(mondayOf(date)); setMonthOpen(false); }} />
      )}

      {/* Chú thích ký hiệu */}
      {rooms.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-deep">
          <Legend tone={CELL.FREE} label="Còn trống" />
          <Legend tone={CELL.HELD} label="Khách đang giữ phòng (chờ chủ nhà xác nhận)" icon={<Clock className="h-3.5 w-3.5" strokeWidth={2.5} />} />
          <Legend tone={CELL.GUEST} label="Có khách đặt" icon={<User className="h-3.5 w-3.5" />} />
          <Legend tone={CELL.LOCKED} label="Chủ nhà khóa" icon={<Lock className="h-3.5 w-3.5" />} />
          <Legend tone="border-border bg-ink-deep/[0.04] opacity-70" label="Ngày đã qua" />
        </div>
      )}

      {error && <ErrorBox text={error} onRetry={() => { setError(''); setReload((n) => n + 1); }} />}
      {body}
    </div>
  );
}

/** Bảng chọn ngày theo tháng (mở từ nút "Tháng ... ▾"): ‹ › đổi tháng, bấm một ngày để nhảy tới tuần chứa ngày đó. */
function MonthPicker({ initialMonth, today, weekStart, onPick }: {
  initialMonth: string; today: string; weekStart: string; onPick: (date: string) => void;
}) {
  const [shown, setShown] = useState(initialMonth);
  const d = parseIso(shown);
  const y = d.getFullYear(), m = d.getMonth();
  const monthOf = (offset: number) => isoDate(new Date(y, m + offset, 1));
  const lead = (d.getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const weekEnd = addDaysIso(weekStart, SPAN - 1);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => isoDate(new Date(y, m, i + 1))),
  ];

  return (
    <div className="rounded-lg border-2 border-border bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Tháng trước" onClick={() => setShown(monthOf(-1))}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-primary-50 hover:text-primary">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <span className="text-base font-black text-ink-deep sm:text-lg">Tháng {m + 1} {y}</span>
        <button type="button" aria-label="Tháng sau" onClick={() => setShown(monthOf(1))}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-primary-50 hover:text-primary">
          <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {PICKER_WEEKDAYS.map((w, i) => (
          <div key={w} className={`pb-1 text-xs font-black sm:text-sm ${i === 0 ? 'text-primary' : 'text-muted'}`}>{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const inWeek = date >= weekStart && date <= weekEnd;
          return (
            <div key={date} className={`flex justify-center py-0.5 ${inWeek ? 'bg-primary-50' : ''} ${inWeek && date === weekStart ? 'rounded-l-full' : ''} ${inWeek && date === weekEnd ? 'rounded-r-full' : ''}`}>
              <button type="button" onClick={() => onPick(date)} aria-label={`${weekdayLong(date)}, ${dayMonth(date)}`}
                aria-current={date === today ? 'date' : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors sm:text-base ${
                  date === today ? 'bg-primary text-white' : 'text-ink-deep hover:bg-primary-100'}`}>
                {Number(date.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-danger/40 bg-danger/10 p-3">
      <p className="flex items-start gap-2 text-base font-semibold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{text}</p>
      <button type="button" onClick={onRetry} className="h-11 rounded-md bg-primary px-4 text-base font-bold text-white hover:bg-primary-700">Thử lại</button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-12 text-center text-base text-muted">
      <BedDouble className="h-8 w-8 text-primary/60" />
      {text}
    </div>
  );
}

/** Một ký hiệu trong dòng chú thích: ô nhỏ cùng màu / biểu tượng với ô trong bảng. */
function Legend({ tone, label, icon }: { tone: string; label: string; icon?: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`flex h-6 w-8 items-center justify-center rounded-md border-2 ${tone}`}>{icon}</span>
      {label}
    </span>
  );
}
