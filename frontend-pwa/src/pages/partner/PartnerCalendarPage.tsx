import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, BedDouble, ChevronDown, ChevronLeft, ChevronRight, Clock, Home, Lock, Plus, User } from 'lucide-react';
import { homestayError, peekPartnerHomestayNames, primePartnerHomestayNames } from '@/services/partnerHomestayService';
import { peekPartnerStale, primePartner } from '@/lib/partnerCache';
import { partnerRoomService as api } from '@/services/partnerRoomService';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { attachCalendarTouchScroll } from '@/lib/calendarTouchScroll';
import { EmptyState, LoadingBlock } from '@/components/partner/PartnerUI';
import { ui } from '@/lib/partnerUi';
import { addDaysIso, dayMonth, daysBetween, isoDate, parseIso, todayIso, weekdayLong, weekdayShort } from '@/lib/partnerDates';
import type { HomestayName, HomestayUnits, UnitDay, UnitState } from '@/types/room';

const HOMESTAY_KEY = 'partner_calendar_homestay';
const ROOM_KEY = 'partner_calendar_room';
/** Lịch chạy từ hôm nay tới hết 12 tháng (đúng các tháng trong nút chọn tháng), tải mỗi lần 31 ngày quanh chỗ đang xem. */
const MONTHS = 12;
const CHUNK = 31;
const REFRESH_MS = 60_000;
/** Số ngày thấy cùng lúc: cố định 7 (một tuần) trên mọi bề rộng màn hình. */
const SPAN = 7;
const labelWidthFor = (width: number) => (width >= 560 ? 60 : 46);
const HEADER_H = 56;
/** Hàng phòng giãn theo chiều cao màn hình (ít phòng thì ô to hơn), trong khoảng này. */
const ROW_MIN = 64, ROW_MAX = 80;

const CELL: Record<UnitState, string> = {
  FREE: 'border-primary bg-primary-50 hover:bg-primary-100',
  HELD: 'border-sun bg-sun-light text-amber-700 hover:bg-sun/60',
  GUEST: 'border-danger bg-danger/15 text-red-700',
  LOCKED: 'border-danger bg-danger/15 text-red-700 hover:bg-danger/25',
};
const STATE_TEXT: Record<UnitState, string> = { FREE: 'còn trống', HELD: 'khách đang giữ phòng', GUEST: 'có khách đặt', LOCKED: 'đang khóa' };

interface RoomInfo { id: number; name: string; count: number; active: boolean }
/** roomId → ngày → trạng thái từng phòng. */
type Days = Record<number, Record<string, UnitState[]>>;
type Cell = { room: RoomInfo; unit: number; date: string };
type Ask = (Cell & { kind: 'lock' | 'unlock' | 'guest' | 'held' }) | { kind: 'error'; text: string };

const dayKey = (roomId: number, date: string) => `${roomId}|${date}`;
const withUnit = (all: Days, roomId: number, date: string, unit: number, state: UnitState): Days => {
  const units = all[roomId]?.[date];
  if (!units) return all;
  const next = [...units];
  next[unit - 1] = state;
  return { ...all, [roomId]: { ...all[roomId], [date]: next } };
};
/** Ngày đầu lịch (thứ Hai của tuần chứa hôm nay) và ngày kết thúc (hết tháng thứ 12). */
const calendarRange = (today: string) => {
  const d = parseIso(today);
  const day = d.getDay();
  const calendarStart = addDaysIso(today, day === 0 ? -6 : 1 - day);
  const end = isoDate(new Date(d.getFullYear(), d.getMonth() + MONTHS, 1));
  return { calendarStart, end, dayCount: daysBetween(calendarStart, end) };
};
/** Khoảng [start, stop) của đoạn tải thứ k. */
const chunkRange = (k: number, calendarStart: string, end: string, dayCount: number) => {
  const start = addDaysIso(calendarStart, k * CHUNK);
  return { start, stop: (k + 1) * CHUNK >= dayCount ? end : addDaysIso(start, CHUNK) };
};
/** Lịch của đoạn đầu tiên tải kèm danh sách Homestay khi mở trang (at = lúc nhận). */
type InitialUnits = { placeId: number; start: string; stop: string; data: HomestayUnits; at: number };
/** Lịch tải kèm lúc mở trang còn mới hơn khoảng này thì dùng luôn, không tải lại đoạn đầu. Cũ hơn (vd lịch lưu từ lần
 * xem trước trong tab) thì vẫn vẽ ngay cho khỏi chờ, đồng thời tải lại đoạn đầu. */
const INITIAL_MAX_AGE_MS = 30_000;
/** Lịch lần xem gần nhất trong tab (stale-while-revalidate khi mở lại trang Lịch). */
const LAST_KEY = 'calendar-last';
type LastCalendar = { homestays: HomestayName[]; placeId: number; start: string; stop: string; data: HomestayUnits };
/** Ghi lại lịch đoạn đầu vừa nhận để lần sau mở trang hiện ngay. */
const rememberCalendar = (placeId: number, start: string, stop: string, data: HomestayUnits) => {
  const homestays = peekPartnerHomestayNames();
  if (homestays) primePartner<LastCalendar>(LAST_KEY, { homestays, placeId, start, stop, data });
};
const toRooms = (res: HomestayUnits): RoomInfo[] =>
  res.rooms.map((r) => ({ id: r.id, name: r.name, count: r.totalRoomCount, active: r.status === 'ACTIVE' }));
const toDays = (res: HomestayUnits): Days =>
  Object.fromEntries(res.rooms.map((r) => [r.id, Object.fromEntries(r.days.map((d) => [d.stayDate, d.units]))]));

const cellText = ({ room, unit, date }: Cell) => `${room.name} · P.${unit} · ${weekdayLong(date)}, ${dayMonth(date)}`;

const readSaved = (key: string) => {
  try { return Number(localStorage.getItem(key)); } catch { return NaN; }
};
const save = (key: string, id: number) => {
  try { localStorage.setItem(key, String(id)); } catch { /* chỉ để nhớ lựa chọn, lỗi thì bỏ qua */ }
};

/**
 * Trang mặc định của cổng Nhà cung cấp: Lịch phòng — một trang duy nhất. Bộ lọc trên cùng chọn homestay, tháng và
 * loại phòng (mỗi lúc xem một loại phòng); bên dưới mỗi hàng là một phòng (P.1, P.2...).
 * Mở qua nửa đêm thì dựng lại lịch từ ngày mới.
 */
export default function PartnerCalendarPage() {
  const [params, setParams] = useSearchParams();
  // Mở lại trang trong tab: vẽ ngay lịch lần trước (đúng tuần hiện tại), HomestayCalendar tự tải lại đoạn đầu.
  const [last] = useState(() => {
    const saved = peekPartnerStale<LastCalendar>(LAST_KEY);
    const { calendarStart, end, dayCount } = calendarRange(todayIso());
    return saved && saved.start === chunkRange(0, calendarStart, end, dayCount).start ? saved : null;
  });
  const [homestays, setHomestays] = useState<HomestayName[] | null>(last?.homestays ?? null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [today, setToday] = useState(todayIso);
  useVisibleInterval(() => { const now = todayIso(); if (now !== today) setToday(now); }, REFRESH_MS);
  const [initial, setInitial] = useState<InitialUnits | null>(
    last ? { placeId: last.placeId, start: last.start, stop: last.stop, data: last.data, at: 0 } : null);

  // Homestay đang xem: theo đường dẫn (?homestay=), rồi lựa chọn lần trước trên máy này, rồi homestay đầu tiên.
  const paramId = Number(params.get('homestay'));

  // MỘT lượt gọi khi mở trang: danh sách Homestay + lịch đoạn đầu của Homestay sẽ xem (trước đây 2 lượt nối tiếp:
  // danh sách Homestay rồi mới tới lịch). Danh sách được ghi vào cache cho các trang khác của cổng.
  useEffect(() => {
    // Đã có lịch lần trước: không gọi bootstrap (danh sách Homestay lấy từ bản lưu, lịch do HomestayCalendar tải lại).
    if (last && reload === 0) return;
    let active = true;
    const prefer = [paramId, readSaved(HOMESTAY_KEY)].filter((id) => Number.isInteger(id) && id > 0);
    const { calendarStart, end, dayCount } = calendarRange(todayIso());
    const { start, stop } = chunkRange(0, calendarStart, end, dayCount);
    api.calendarBootstrap(prefer, start, stop)
      .then((res) => {
        if (!active) return;
        primePartnerHomestayNames(res.homestays);
        if (res.placeId != null && res.units) rememberCalendar(res.placeId, start, stop, res.units);
        setInitial(res.placeId != null && res.units ? { placeId: res.placeId, start, stop, data: res.units, at: Date.now() } : null);
        setHomestays(res.homestays);
        setError('');
      })
      .catch((e: unknown) => {
        if (!active) return;
        const cached = peekPartnerHomestayNames();
        if (cached) setHomestays(cached); // vẫn chọn được Homestay; lịch tự tải lại
        else setError(homestayError(e));
      });
    return () => { active = false; };
    // Chỉ chạy khi mở trang / bấm thử lại; đổi Homestay sau đó do HomestayCalendar tự tải.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  const placeId = useMemo(() => {
    if (!homestays?.length) return null;
    const ids = homestays.map((h) => h.id);
    if (ids.includes(paramId)) return paramId;
    const saved = readSaved(HOMESTAY_KEY);
    return ids.includes(saved) ? saved : (ids[0] ?? null);
  }, [homestays, paramId]);

  const chooseHomestay = (id: number) => {
    save(HOMESTAY_KEY, id);
    setParams((p) => { const next = new URLSearchParams(p); next.set('homestay', String(id)); next.delete('room'); return next; }, { replace: true });
  };

  if (placeId === null || !homestays) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-black text-ink-deep sm:text-3xl">Lịch phòng</h1>
        {error ? <ErrorBox text={error} onRetry={() => { setError(''); setReload((n) => n + 1); }} />
          : !homestays ? <LoadingBlock label="Đang tải lịch phòng..." rows={3} />
          : <EmptyState icon={Home} title="Bạn chưa có homestay nào" description="Tạo homestay và các loại phòng trước, sau đó quay lại đây."
              action={<Link to="/partner/homestay/create" className={ui.btnCoral}><Plus className="h-4 w-4" />Tạo homestay</Link>} />}
      </div>
    );
  }

  const picker = homestays.length > 1 ? (
    <div className="relative min-w-0 flex-1 lg:max-w-xs">
      <Home className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
      <select value={placeId} onChange={(e) => chooseHomestay(Number(e.target.value))} aria-label="Chọn homestay"
        className="h-11 w-full appearance-none truncate rounded-md border-2 border-border bg-white pl-10 pr-9 text-base font-bold text-ink-deep transition-colors duration-200 hover:border-primary focus:border-primary focus:outline-none">
        {homestays.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-deep" strokeWidth={3} />
    </div>
  ) : null;
  return <HomestayCalendar key={`${placeId}-${today}`} placeId={placeId} today={today} picker={picker} initial={initial?.placeId === placeId ? initial : null} />;
}

/**
 * Lịch một loại phòng của Homestay trong một khung cuộn: vuốt ngang để sang / lùi ngày, bấm "Tháng" để nhảy tháng,
 * bấm tên loại phòng để đổi loại. Xanh = còn trống; vàng = khách đang giữ phòng (đơn chờ xác nhận); đỏ = hết
 * (ổ khóa: chủ nhà khóa; hình người: có khách đặt). Ô vàng / ô có khách không khóa / mở được.
 * Bấm một ô trống / khóa: chỉ hỏi "Khóa phòng?" / "Mở phòng?" rồi đổi màu ngay, không cần lý do.
 */
function HomestayCalendar({ placeId, today, picker, initial }: {
  placeId: number; today: string; picker: ReactNode; initial: InitialUnits | null;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { calendarStart, end, dayCount } = useMemo(() => calendarRange(today), [today]);
  const dates = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDaysIso(calendarStart, i)), [calendarStart, dayCount]);

  // Đoạn đầu đã có sẵn (tải kèm danh sách Homestay lúc mở trang, hoặc lịch lần xem trước trong tab) và đúng khoảng ngày
  // của đoạn 0: dựng lịch ngay từ đó. Còn mới (fresh) thì không tải lại đoạn này; cũ thì vẫn tải lại ngay.
  const [boot] = useState<{ data: HomestayUnits; fresh: boolean } | null>(() => {
    if (!initial || initial.placeId !== placeId) return null;
    const first0 = chunkRange(0, calendarStart, end, dayCount);
    if (initial.start !== first0.start || initial.stop !== first0.stop) return null;
    return { data: initial.data, fresh: Date.now() - initial.at <= INITIAL_MAX_AGE_MS };
  });
  const [rooms, setRooms] = useState<RoomInfo[] | null>(() => (boot ? toRooms(boot.data) : null));
  const [days, setDays] = useState<Days>(() => (boot ? toDays(boot.data) : {}));
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  /** Bảng chọn ngày theo tháng (bấm "Tháng ... ▾"). */
  const [monthOpen, setMonthOpen] = useState(false);

  // Loại phòng đang xem: theo đường dẫn (?room=), rồi lựa chọn lần trước, rồi loại đang bán đầu tiên.
  const paramRoom = Number(params.get('room'));
  const room = useMemo(() => {
    if (!rooms?.length) return null;
    const saved = readSaved(ROOM_KEY);
    return rooms.find((r) => r.id === paramRoom) ?? rooms.find((r) => r.id === saved) ?? rooms.find((r) => r.active) ?? rooms[0] ?? null;
  }, [rooms, paramRoom]);
  const chooseRoom = (id: number) => {
    save(ROOM_KEY, id);
    setParams((p) => { const next = new URLSearchParams(p); next.set('room', String(id)); return next; }, { replace: true });
  };

  const scroller = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const detachTouchScroll = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);
  const [maxH, setMaxH] = useState(0);
  const span = SPAN, labelW = labelWidthFor(width);
  const colW = width > labelW ? (width - labelW) / span : 0;

  // ?date=yyyy-mm-dd (mở từ chi tiết đơn): bắt đầu xem từ ngày đó; khung cuộn tự cuộn tới khi đo xong bề rộng.
  const [first, setFirst] = useState(() => {
    const d = params.get('date');
    const target = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
    const diff = daysBetween(calendarStart, target);
    return Math.min(dayCount - span, Math.max(0, Math.floor(diff / span) * span));
  });
  const firstRef = useRef(first);
  const frame = useRef(0);

  // Chống số liệu cũ đè số liệu mới (theo từng loại phòng + ngày): mỗi lần tải / sửa lấy một số thứ tự; lần tải chỉ
  // ghi đè ngày không đang sửa và chưa bị sửa kể từ lúc bắt đầu tải; kết quả sửa chỉ áp dụng nếu là lần sửa mới nhất.
  const chunks = useRef(new Set<number>(boot?.fresh ? [0] : []));
  const seq = useRef(0);
  const touched = useRef(new Map<string, number>());
  const inflight = useRef(new Map<string, number>());
  const lastEdit = useRef(new Map<string, number>());

  const applyUnits = useCallback((res: HomestayUnits, mine: number) => {
    setRooms(toRooms(res));
    setDays((prev) => {
      const next = { ...prev };
      for (const r of res.rooms) {
        const own = { ...next[r.id] };
        for (const d of r.days) {
          const key = dayKey(r.id, d.stayDate);
          if ((touched.current.get(key) ?? 0) < mine && !inflight.current.get(key)) own[d.stayDate] = d.units;
        }
        next[r.id] = own;
      }
      return next;
    });
  }, []);

  // silent = tự làm mới nền: ưu tiên thấp, nhường request chủ nhà vừa bấm.
  const loadChunk = useCallback(async (k: number, silent: boolean) => {
    const { start, stop } = chunkRange(k, calendarStart, end, dayCount);
    const mine = ++seq.current;
    try {
      const res = await api.units(placeId, start, stop, silent ? 'low' : 'high');
      applyUnits(res, mine);
      if (k === 0) rememberCalendar(placeId, start, stop, res);
      if (!silent) setError('');
    } catch (e: unknown) {
      if (!silent) { chunks.current.delete(k); setError(homestayError(e)); }
    }
  }, [placeId, calendarStart, end, dayCount, applyUnits]);

  // Tải các đoạn 31 ngày phủ chỗ đang xem (kèm một trang trước / hai trang sau để vuốt không phải chờ).
  useEffect(() => {
    const from = colW ? Math.max(0, first - span) : 0, to = colW ? Math.min(dayCount - 1, first + 2 * span) : 0;
    for (let k = Math.floor(from / CHUNK); k <= Math.floor(to / CHUNK); k++) {
      if (chunks.current.has(k)) continue;
      chunks.current.add(k);
      void loadChunk(k, false);
    }
  }, [first, span, colW, dayCount, loadChunk, retry]);

  // Tự làm mới mỗi phút (khách mới đặt / giữ phòng) khi không có hộp thoại đang mở.
  useVisibleInterval(() => {
    if (ask) return;
    const last = Math.min(dayCount - 1, first + span - 1);
    for (let k = Math.floor(first / CHUNK); k <= Math.floor(last / CHUNK); k++) void loadChunk(k, true);
  }, REFRESH_MS);

  // Khung lịch chỉ có sau lần tải đầu (và ẩn khi chọn loại phòng đang tắt bán): đo bề rộng bằng callback ref để bắt
  // đúng lúc nó xuất hiện; gỡ ra thì đặt bề rộng về 0 để lần gắn lại cuộn về đúng ngày đang xem.
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    detachTouchScroll.current?.();
    detachTouchScroll.current = null;
    observer.current?.disconnect();
    observer.current = null;
    scroller.current = el;
    if (!el) { setWidth(0); return; }
    detachTouchScroll.current = attachCalendarTouchScroll(el);
    setWidth(el.clientWidth);
    observer.current = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.current.observe(el);
  }, []);
  // Đổi cỡ màn hình (xoay ngang...): giữ nguyên ngày đầu tiên đang xem.
  useLayoutEffect(() => {
    if (scroller.current && colW) scroller.current.scrollLeft = firstRef.current * colW;
  }, [colW]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); observer.current?.disconnect(); detachTouchScroll.current?.(); }, []);

  // Khung lịch cao vừa tới đáy màn hình (chừa thanh điều hướng dưới trên điện thoại) để các ô được to nhất có thể.
  const hasError = error !== '';
  useLayoutEffect(() => {
    const fit = () => {
      const el = scroller.current;
      if (!el) return;
      const bottom = window.matchMedia('(min-width: 1024px)').matches ? 32 : 96;
      setMaxH(Math.max(320, Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - bottom)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [width, hasError, rooms, picker, monthOpen]);

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (!el || !colW) return;
      const idx = Math.min(dayCount - span, Math.max(0, Math.round(el.scrollLeft / colW)));
      if (idx !== firstRef.current) {
        firstRef.current = idx;
        setFirst(idx);
      }
    });
  };
  // Lưới chỉ dựng các ngày quanh tuần đang xem, nên nhảy xa phải dựng tuần đích trước rồi mới cuộn — cuộn ngay thì
  // trình duyệt "hít" (snap) vào thứ Hai gần nhất còn trên lưới chứ không tới đúng tuần đã chọn.
  const pendingScroll = useRef<{ left: number; smooth: boolean } | null>(null);
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target || !scroller.current) return;
    pendingScroll.current = null;
    scroller.current.scrollTo({ left: target.left, behavior: target.smooth ? 'smooth' : 'auto' });
  }, [first]);
  const goTo = (idx: number, smooth: boolean) => {
    if (!scroller.current || !colW) return;
    const targetIdx = Math.max(0, Math.min(dayCount - span, idx));
    firstRef.current = targetIdx;
    if (targetIdx === first) {
      scroller.current.scrollTo({ left: targetIdx * colW, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    pendingScroll.current = { left: targetIdx * colW, smooth };
    setFirst(targetIdx);
  };

  // Tuần đang xem có ngày mùng 1 thì hiện tháng đó, không thì lấy ngày giữa tuần.
  const labelDate = dates.slice(first, first + span).find((d) => d.endsWith('-01')) ?? dates[first + 3] ?? today;
  const month = Number(labelDate.slice(5, 7)), year = Number(labelDate.slice(0, 4));

  /** moveTo: khóa ô có khách thì khách sang phòng trống này (máy chủ chọn cùng phòng: phòng trống số nhỏ nhất). */
  async function saveUnit({ room: r, unit, date }: Cell, lock: boolean, moveTo?: number) {
    setAsk(null);
    const key = dayKey(r.id, date), cellKey = `${key}|${unit}`;
    const mine = ++seq.current;
    const before = days[r.id]?.[date]?.[unit - 1];
    touched.current.set(key, mine);
    lastEdit.current.set(key, mine);
    inflight.current.set(key, (inflight.current.get(key) ?? 0) + 1);
    setDays((d) => {
      const next = withUnit(d, r.id, date, unit, lock ? 'LOCKED' : 'FREE');
      return moveTo && before ? withUnit(next, r.id, date, moveTo, before) : next;
    });
    setPending((p) => new Set(p).add(cellKey));

    let result: UnitDay | null = null;
    let failure: unknown = null;
    try { result = await api.setUnit(placeId, r.id, unit, date, lock); } catch (e: unknown) { failure = e; }

    touched.current.set(key, ++seq.current);
    inflight.current.set(key, (inflight.current.get(key) ?? 1) - 1);
    setPending((p) => { const next = new Set(p); next.delete(cellKey); return next; });
    const latest = lastEdit.current.get(key) === mine;
    if (result) {
      const saved = result;
      if (latest) setDays((d) => ({ ...d, [r.id]: { ...d[r.id], [saved.stayDate]: saved.units } }));
      return;
    }
    if (latest && before) setDays((d) => {
      const back = withUnit(d, r.id, date, unit, before);
      return moveTo ? withUnit(back, r.id, date, moveTo, 'FREE') : back;
    });
    setAsk({ kind: 'error', text: homestayError(failure) });
    // Có thể khách vừa đặt / giữ đúng ngày đó: tải lại để thấy đúng tình trạng.
    void loadChunk(Math.floor(daysBetween(calendarStart, date) / CHUNK), true);
  }

  const showGrid = room !== null && room.active;
  const count = showGrid ? room.count : 0;
  const rowH = maxH && count ? Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((maxH - HEADER_H - 4) / count))) : ROW_MIN;
  const lo = Math.max(0, first - 2 * span), hi = Math.min(dayCount, first + 3 * span);
  const visible = dates.slice(lo, hi);
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${labelW}px repeat(${dayCount}, ${colW}px)`,
    gridTemplateRows: `${HEADER_H}px repeat(${count}, ${rowH}px)`,
    width: labelW + dayCount * colW,
  };

  let body: ReactNode;
  if (!rooms) {
    body = error ? null : <LoadingBlock label="Đang tải lịch phòng..." rows={3} />;
  } else if (!room) {
    body = (
      <EmptyState icon={BedDouble} title="Homestay này chưa có loại phòng" description="Thêm loại phòng trước, sau đó lịch phòng sẽ hiện ở đây."
        action={<Link to={`/partner/homestay/${placeId}/rooms`} className={ui.btnCoral}><Plus className="h-4 w-4" />Thêm loại phòng</Link>} />
    );
  } else if (!room.active) {
    body = (
      <EmptyState icon={BedDouble} title={`${room.name} đang tắt bán`} description="Khách không đặt được loại phòng này nên không có lịch."
        action={<Link to={`/partner/homestay/${placeId}/rooms`} className={ui.btnOutline}>Bật lại trong Phòng & giá</Link>} />
    );
  } else {
    body = (
      <div className="flex flex-col overflow-hidden rounded-lg border-2 border-border bg-ink-deep/[0.04]">
        {/* Scrolling Calendar Grid */}
        <div ref={attachScroller} onScroll={onScroll} style={{ scrollPaddingLeft: labelW, maxHeight: maxH || undefined, touchAction: 'pan-y pinch-zoom' }}
          className="relative z-0 snap-x snap-mandatory overflow-auto overscroll-x-contain bg-white">
          
          {/* Fixed Weekday Overlay */}
          <div className="sticky left-0 top-0 z-40 h-0 w-full pointer-events-none">
            <div className="flex" style={{ width: width || '100%' }}>
              <div style={{ width: labelW, flexShrink: 0 }} />
              {Array.from({ length: span }, (_, i) => {
                const dObj = parseIso(addDaysIso(calendarStart, i));
                return (
                  <div key={`weekday-${i}`} style={{ width: colW, flexShrink: 0 }} className="flex h-7 items-end justify-center pb-0.5 text-xs font-black uppercase tracking-wider text-ink-deep sm:text-sm">
                    {weekdayShort(isoDate(dObj))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid min-w-full" style={gridStyle}>
            <div style={{ gridColumn: 1, gridRow: 1 }} className="sticky left-0 top-0 z-30 bg-white" />
            {visible.map((date, j) => {
              const day = Number(date.slice(8));
              const isPast = date < today;
              const dObj = parseIso(date);
              const isMonday = dObj.getDay() === 1;
              return (
                <div key={`header-${date}`} style={{ gridColumn: lo + j + 2, gridRow: 1 }}
                  className={`sticky top-0 z-10 flex items-end justify-center bg-white pb-1.5 ${isPast ? 'opacity-60' : ''} ${isMonday ? 'snap-start' : ''}`}>
                  <span className={`flex h-7 min-w-[2.5rem] items-center justify-center rounded-full px-1.5 text-sm font-black tabular-nums sm:text-base ${date === today ? 'bg-primary text-white' : 'text-ink-deep'}`}>
                    {`${day}/${Number(date.slice(5, 7))}`}
                  </span>
                </div>
              );
            })}
          {Array.from({ length: count }, (_, i) => i + 1).map((unit) => [
            <div key={`unit-${unit}`} style={{ gridColumn: 1, gridRow: unit + 1 }} className="sticky left-0 z-20 flex w-[46px] bg-white py-0.5 pl-0.5 sm:w-[60px] sm:py-1 sm:pl-1">
              <span className="flex w-full items-center justify-center rounded-md bg-ink-deep/[0.06] text-sm font-black tabular-nums text-ink-deep sm:text-base">P.{unit}</span>
            </div>,
            ...visible.map((date, j) => {
              const state = days[room.id]?.[date]?.[unit - 1];
              const busy = pending.has(`${dayKey(room.id, date)}|${unit}`);
              const kind = state === 'GUEST' ? 'guest' : state === 'HELD' ? 'held' : state === 'LOCKED' ? 'unlock' : 'lock';
              const isPast = date < today;
              return (
                <div key={`${unit}-${date}`} style={{ gridColumn: lo + j + 2, gridRow: unit + 1 }} className="p-0.5 sm:p-1">
                  {state ? (
                    <button type="button" disabled={busy || isPast} onClick={() => setAsk({ kind, room, unit, date })}
                      aria-label={`${room.name}, P.${unit}, ${weekdayLong(date)} ${dayMonth(date)}: ${STATE_TEXT[state]}`}
                      className={`flex h-full w-full items-center justify-center rounded-md border-2 transition-colors duration-150 active:scale-95 ${
                        isPast ? 'border-border bg-ink-deep/[0.04] text-muted opacity-70' : CELL[state]
                      } ${busy && !isPast ? 'animate-pulse' : ''}`}>
                      {state === 'LOCKED' && <Lock className="h-6 w-6" />}
                      {state === 'GUEST' && <User className="h-6 w-6" />}
                      {state === 'HELD' && <Clock className="h-6 w-6" strokeWidth={2.5} />}
                    </button>
                  ) : <div aria-hidden="true" className={`h-full w-full rounded-md ${isPast ? 'bg-ink-deep/[0.04] opacity-70' : 'animate-pulse bg-ink/5'}`} />}
                </div>
              );
            }),
          ])}
        </div>
      </div>
      </div>
    );
  }

  const ready = rooms !== null && rooms.length > 0;
  // Loại phòng có khách đang giữ phòng trong phần lịch đã tải: tab hiện chấm vàng để chủ nhà không phải dò từng loại.
  const holding = useMemo(() => new Set(Object.entries(days)
    .filter(([, byDate]) => Object.values(byDate).some((units) => units.includes('HELD')))
    .map(([id]) => Number(id))), [days]);
  return (
    <div className="flex flex-col gap-3">
      {/* Tiêu đề & Chọn homestay */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h1 className="shrink-0 text-xl font-black text-ink-deep sm:text-2xl lg:text-3xl">Lịch phòng</h1>
        {picker}
      </div>

      {ready && room && (
        <RoomTabs rooms={rooms} selected={room.id} holding={holding} onSelect={chooseRoom} />
      )}

      {/* Điều hướng lịch */}
      {ready && showGrid && (
        <div className="flex min-w-0 items-center justify-between gap-1 rounded-lg bg-ink-deep/[0.04] p-1.5 sm:p-2">
          <button type="button" aria-label={`Xem ${span} ngày trước`} disabled={first === 0} onClick={() => goTo(first - span, true)}
            className="flex h-10 shrink-0 items-center gap-1 rounded-md border-2 border-transparent bg-white px-2 text-xs font-bold text-ink-deep shadow-sm transition-all duration-200 hover:border-primary hover:text-primary disabled:opacity-40 sm:gap-1.5 sm:px-3 sm:text-sm">
            <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span className="whitespace-nowrap"><span className="hidden min-[400px]:inline">Tuần </span>trước</span>
          </button>

          <button type="button" aria-expanded={monthOpen} onClick={() => setMonthOpen((o) => !o)}
            className="flex h-10 min-w-0 items-center gap-1 rounded-md px-2 text-sm font-black text-ink-deep transition-colors duration-200 hover:bg-white hover:text-primary sm:px-3 sm:text-base">
            <span className="truncate whitespace-nowrap">Tháng {month}<span className="hidden min-[360px]:inline"> {year}</span></span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${monthOpen ? 'rotate-180' : ''}`} strokeWidth={3} />
          </button>

          <button type="button" aria-label={`Xem ${span} ngày sau`} disabled={first >= dayCount - span} onClick={() => goTo(first + span, true)}
            className="flex h-10 shrink-0 items-center gap-1 rounded-md border-2 border-transparent bg-white px-2 text-xs font-bold text-ink-deep shadow-sm transition-all duration-200 hover:border-primary hover:text-primary disabled:opacity-40 sm:gap-1.5 sm:px-3 sm:text-sm">
            <span className="whitespace-nowrap"><span className="hidden min-[400px]:inline">Tuần </span>sau</span>
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {ready && showGrid && monthOpen && (
        <MonthPicker key={`${year}-${month}`} initialMonth={`${labelDate.slice(0, 7)}-01`} today={today}
          min={calendarStart} max={addDaysIso(end, -1)} weekStart={dates[first] ?? calendarStart}
          onPick={(date) => {
            const monday = addDaysIso(date, -((parseIso(date).getDay() + 6) % 7));
            // Nhảy thẳng (không cuộn mượt): cuộn mượt qua nhiều tuần bị sự kiện cuộn giữa chừng ghi đè ngày đang xem.
            goTo(daysBetween(calendarStart, monday), false);
          }} />
      )}

      {error && <ErrorBox text={error} onRetry={() => { setError(''); setRetry((n) => n + 1); }} />}
      {body}

      <Popup open={ask !== null} onClose={() => setAsk(null)}>
        {ask?.kind === 'lock' && (
          <Question title="Khóa phòng?" detail={cellText(ask)}>
            <PopupButton tone="plain" close>Không</PopupButton>
            <PopupButton tone="danger" onClick={() => void saveUnit(ask, true)}>Khóa</PopupButton>
          </Question>
        )}
        {ask?.kind === 'unlock' && (
          <Question title="Mở phòng?" detail={cellText(ask)}>
            <PopupButton tone="plain" close>Không</PopupButton>
            <PopupButton tone="primary" onClick={() => void saveUnit(ask, false)}>Mở</PopupButton>
          </Question>
        )}
        {(ask?.kind === 'held' || ask?.kind === 'guest') && (() => {
          // Khách chỉ tính theo số lượng của loại phòng: khóa ô này thì khách sang phòng trống số nhỏ nhất cùng ngày.
          const free = (days[ask.room.id]?.[ask.date]?.indexOf('FREE') ?? -1) + 1;
          const who = ask.kind === 'held' ? 'đơn đang chờ bạn xác nhận' : 'đã có khách đặt';
          return (
            <Question title={ask.kind === 'held' ? 'Khách đang giữ phòng' : 'Phòng đã có khách đặt'}
              detail={free > 0
                ? `${cellText(ask)} — ${who}. Khóa phòng này thì khách được chuyển sang P.${free} (đơn không đổi).`
                : `${cellText(ask)} — ${who}. Ngày này hết phòng trống nên không khóa được; muốn khóa, hãy xử lý đơn trước (đổi ngày hoặc hủy đơn).`}>
              <PopupButton tone="plain" onClick={() => { setAsk(null); navigate('/partner/bookings'); }}>Xem đơn</PopupButton>
              {free > 0
                ? <PopupButton tone="danger" onClick={() => void saveUnit(ask, true, free)}>Khóa</PopupButton>
                : <PopupButton tone="primary" close>Đóng</PopupButton>}
            </Question>
          );
        })()}
        {ask?.kind === 'error' && (
          <Question title="Chưa lưu được" detail={ask.text} single>
            <PopupButton tone="primary" close>Đóng</PopupButton>
          </Question>
        )}
      </Popup>
    </div>
  );
}

/**
 * Chọn loại phòng: điện thoại là một dải vuốt ngang (loại đang chọn tự cuộn vào giữa tầm nhìn), máy tính xuống dòng
 * nếu nhiều. Số nhỏ bên cạnh tên là số phòng của loại đó; chấm vàng ở góc = có khách đang giữ phòng (đơn chờ xác nhận).
 */
function RoomTabs({ rooms, selected, holding, onSelect }: { rooms: RoomInfo[]; selected: number; holding: ReadonlySet<number>; onSelect: (id: number) => void }) {
  const current = useRef<HTMLButtonElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  // Chỉ cuộn dải tab (không dùng scrollIntoView: nó cuộn cả trang theo chiều ngang / dọc, làm lệch bố cục trên điện thoại).
  useEffect(() => {
    const btn = current.current, box = container.current;
    if (!btn || !box || box.scrollWidth <= box.clientWidth) return;
    const b = btn.getBoundingClientRect(), c = box.getBoundingClientRect();
    box.scrollBy({ left: b.left - c.left - (c.width - b.width) / 2, behavior: 'smooth' });
  }, [selected]);
  
  return (
    <div className="relative -mx-4 min-w-0 sm:-mx-6 lg:mx-0">
      <div ref={container} role="group" aria-label="Loại phòng"
        className="flex gap-2 overflow-x-auto px-4 pb-1 pt-1.5 sm:px-6 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {rooms.map((r) => {
          const active = r.id === selected;
          return (
            <button key={r.id} ref={active ? current : undefined} type="button" aria-pressed={active} onClick={() => onSelect(r.id)}
              aria-label={holding.has(r.id) ? `${r.name}: có khách đang giữ phòng` : undefined}
              className={`relative flex h-11 shrink-0 items-center gap-2 rounded-md border-2 px-3 text-base font-bold transition-colors duration-200 ${
                active ? 'border-primary bg-primary text-white' : r.active ? 'border-border bg-white text-ink-deep hover:border-primary' : 'border-dashed border-border bg-white text-muted hover:border-primary'}`}>
              <span className="max-w-[9rem] truncate sm:max-w-[11rem]">{r.name}</span>
              <span className={`rounded-sm px-1.5 py-0.5 text-xs font-black tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-ink-deep/[0.06] text-muted'}`}>
                {r.active ? r.count : 'Tắt'}
              </span>
              {holding.has(r.id) && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-sun" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PICKER_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Bảng chọn ngày theo tháng (mở từ nút "Tháng ... ▾"): ‹ › đổi tháng, bấm một ngày để lịch nhảy tới tuần chứa ngày đó.
 * Tuần đang xem được tô nền, hôm nay là chấm tròn đậm. Ngày ngoài phạm vi lịch (min..max) bị mờ, không bấm được.
 */
function MonthPicker({ initialMonth, today, min, max, weekStart, onPick }: {
  initialMonth: string; today: string; min: string; max: string; weekStart: string; onPick: (date: string) => void;
}) {
  const [shown, setShown] = useState(initialMonth);
  const d = parseIso(shown);
  const y = d.getFullYear(), m = d.getMonth();
  const monthOf = (offset: number) => isoDate(new Date(y, m + offset, 1));
  const lead = (d.getDay() + 6) % 7; // số ô trống trước mùng 1 (tuần bắt đầu thứ Hai)
  const total = new Date(y, m + 1, 0).getDate();
  const weekEnd = addDaysIso(weekStart, SPAN - 1);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => isoDate(new Date(y, m, i + 1))),
  ];
  const canPrev = shown.slice(0, 7) > min.slice(0, 7);
  const canNext = shown.slice(0, 7) < max.slice(0, 7);

  return (
    <div className="rounded-lg border-2 border-border bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Tháng trước" disabled={!canPrev} onClick={() => setShown(monthOf(-1))}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-primary-50 hover:text-primary disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <span className="text-base font-black text-ink-deep sm:text-lg">Tháng {m + 1} {y}</span>
        <button type="button" aria-label="Tháng sau" disabled={!canNext} onClick={() => setShown(monthOf(1))}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-primary-50 hover:text-primary disabled:opacity-30">
          <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {PICKER_WEEKDAYS.map((w, i) => (
          <div key={w} className={`pb-1 text-xs font-black sm:text-sm ${i === 0 ? 'text-primary' : 'text-muted'}`}>{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const disabled = date < min || date > max;
          const inWeek = date >= weekStart && date <= weekEnd;
          const isToday = date === today;
          return (
            <div key={date} className={`flex justify-center py-0.5 ${inWeek ? 'bg-primary-50' : ''} ${inWeek && date === weekStart ? 'rounded-l-full' : ''} ${inWeek && date === weekEnd ? 'rounded-r-full' : ''}`}>
              <button type="button" disabled={disabled} onClick={() => onPick(date)}
                aria-label={`${weekdayLong(date)}, ${dayMonth(date)}`} aria-current={isToday ? 'date' : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors sm:text-base ${
                  isToday ? 'bg-primary text-white' : 'text-ink-deep hover:bg-primary-100'} disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent`}>
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


/** Hộp hỏi nhanh: trượt lên từ đáy trên điện thoại (ngón cái với tới), giữa màn hình từ 640px. */
function Popup({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[9999] bg-ink-deep/50" />
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-end justify-center pt-[calc(var(--safe-top)+0.5rem)] sm:items-center sm:p-4">
          <Dialog.Content aria-describedby={undefined}
            className="sheet-in pointer-events-auto flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-t-lg bg-white px-5 pb-[max(20px,var(--safe-bottom))] pt-5 shadow-[var(--shadow-lg)] sm:max-w-sm sm:rounded-lg sm:pb-5">
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Question({ title, detail, single = false, children }: { title: string; detail: string; single?: boolean; children: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Dialog.Title className="text-xl font-black text-ink-deep">{title}</Dialog.Title>
        <p className="text-base font-semibold text-muted">{detail}</p>
      </div>
      <div className={`grid gap-2 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>{children}</div>
    </>
  );
}

const BUTTON_TONE = {
  plain: 'border-2 border-border bg-white text-ink-deep hover:bg-canvas',
  primary: 'bg-primary text-white hover:bg-primary-700',
  danger: 'bg-danger text-white hover:opacity-90',
} as const;

function PopupButton({ tone, close = false, onClick, children }: { tone: keyof typeof BUTTON_TONE; close?: boolean; onClick?: () => void; children: ReactNode }) {
  const className = `h-14 rounded-md text-lg font-black transition-colors duration-200 ${BUTTON_TONE[tone]}`;
  return close
    ? <Dialog.Close className={className}>{children}</Dialog.Close>
    : <button type="button" onClick={onClick} className={className}>{children}</button>;
}
