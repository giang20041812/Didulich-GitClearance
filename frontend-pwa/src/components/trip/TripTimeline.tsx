import { createElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, Compass, Flag, Home, MapPin, Moon, Mountain, Pencil, Plus, Repeat, Sun, X } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import PlaceSheet from '@/components/journey/planner/PlaceSheet';
import type { ItemKind, TripAddon, TripDish } from '@/types/trip';
import { SESSION_LABEL, sessionTimeLabel } from '@/lib/journey';
import { mediaUrl } from '@/lib/mediaUrl';
import { KIND_META, ORIGIN_BADGE, addonIcon, dayDateLabel, tagClass } from './tripUi';
import TripDayPager, { type DayPagerOptions } from './TripDayPager';
import type { TimelineRow } from './timelineTypes';

export type { TimelineRow } from './timelineTypes';
export type { DayPagerOptions } from './TripDayPager';

/** Thao tác trên các điểm dừng. Không truyền gì = chỉ xem: chạm một điểm mở khung chi tiết (giờ, ghi chú, món, dịch vụ). */
export interface RouteActions {
  /** Chạm điểm dừng để sửa (có cả onOpenPlace thì điểm tham quan mở cẩm nang, nút bút chì để sửa). */
  onEdit?: (key: string) => void;
  /** Chèn mục: nút "+" trên đường giữa hai điểm dừng (afterKey = điểm đứng trước) và "Thêm mục sau HH:mm" cuối ngày. */
  onAdd?: (dayIndex: number, afterKey: string | null) => void;
  /** Nút × trên góc nút tròn (luôn hiện) để bỏ mục — cha hiện "Hoàn tác". */
  onRemove?: (key: string) => void;
  /** Đổi nhanh sang phương án khác của điểm ("Kim Nọi / Sống Lưng Khủng Long"). */
  onSwap?: (key: string) => void;
  /** Lịch trình đã lưu: mở cẩm nang / check-in điểm tham quan. */
  onOpenPlace?: (key: string) => void;
  onCheckin?: (key: string) => void;
  /** Nhãn "Bạn thêm" trên mục khách tự thêm vào lịch trình gợi ý. */
  showOrigin?: boolean;
}

interface TripTimelineProps extends RouteActions {
  rows: TimelineRow[];
  days: number;
  startDate: string | null;
  dayTitles?: (string | null | undefined)[];
  dayNotes?: (string | null | undefined)[];
  addons: TripAddon[];
  /** Chỗ ở của lịch trình (homestay đã đặt); null = chưa chọn. */
  stayName?: string | null;
  /** Hiện thay cho tên chỗ ở khi chưa chọn (vd "Lưu lịch trình để chọn homestay phù hợp"). */
  stayHint?: string;
  /** "YYYY-MM-DD" hôm nay — ngày trùng được tô nổi. */
  today?: string | null;
  /** Chỉ vẽ một ngày (1-based) — hình xem trước lịch trình mẫu. Bỏ trống = cả lịch trình. */
  onlyDay?: number;
  /** Mỗi ngày một trang: tab ngày (dính khi cuộn), vuốt ngang, nút sang ngày trước / sau. Bỏ trống = các ngày xếp dọc. */
  paged?: DayPagerOptions;
  /** Nội dung riêng của từng ngày, ngay dưới chặng đường của ngày đó (vd ảnh check-in trên trang chia sẻ). */
  dayFooter?: (day: number) => ReactNode;
}

// ─── Hình học con đường (Nằm ngang trái → phải) ─────────────────

/** Tung độ (px) của nút trên / dưới / giữa trên dải lộ trình nằm ngang. */
const ROUTE_Y = { top: 118, bottom: 162, center: 140 } as const;
const ROUTE_HEIGHT = 284;
/** Cỡ nút (px): điểm dừng (ghim ảnh / nút tròn), điểm đầu / cuối ngày. */
const NODE = { stop: 54, edge: 40 } as const;
/** Khoảng cách ngang tối thiểu (px) giữa tâm hai nút: đầu ngày → điểm đầu, hai điểm liền nhau, điểm cuối → cuối ngày. */
const GAP_X = { first: 115, stop: 175, last: 125 } as const;
/** Lề trái tới tâm nút đầu ngày; lề phải sau tâm nút cuối ngày (chừa nhãn "Về đích / Nghỉ đêm"). */
const PAD_X = { left: 44, right: 86 } as const;
/** Bề rộng tối đa của thẻ nhãn tại mỗi điểm dừng (px). */
const LABEL_MAX_W = 168;
/** Dấu chân: bước (px) giữa hai bàn chân liền nhau, độ lệch hai bên đường, khoảng hở với nút. */
const FOOT_STEP = 28;
const FOOT_SPREAD = 6.5;
const FOOT_CLEAR = 8;

interface Pt { x: number; y: number }

interface StopNode extends Pt {
  kind: 'stop';
  row: TimelineRow;
  side: 'top' | 'bottom';
}

type RouteNode = (Pt & { kind: 'start' }) | (Pt & { kind: 'end' }) | (Pt & { kind: 'free' }) | StopNode;

/**
 * Cung bezier giữa hai nút liên tiếp theo phương ngang (trái → phải): tiếp tuyến ngang ở hai đầu tạo đường cong chữ S mềm.
 * Cả x và y đều tính bằng px.
 */
function segment(a: Pt, b: Pt, i: number): [Pt, Pt, Pt, Pt] {
  const dx = b.x - a.x;
  const same = a.y === b.y;
  const bend = (same ? 0.35 : 0.55) * dx;
  const sway = same ? (i % 2 === 0 ? 14 : -14) : 0;
  return [a, { x: a.x + bend, y: a.y + sway }, { x: b.x - bend, y: b.y + sway }, b];
}

function bezierAt([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Đường nối các nút theo px (cùng các cung bezier với dấu chân). */
function trailPath(nodes: RouteNode[]): string {
  const [first] = nodes;
  if (!first) return '';
  const px = (p: Pt) => `${p.x} ${p.y}`;
  let d = `M ${px(first)}`;
  for (let i = 1; i < nodes.length; i += 1) {
    const [, c1, c2, end] = segment(nodes[i - 1] as RouteNode, nodes[i] as RouteNode, i);
    d += ` C ${px(c1)}, ${px(c2)}, ${px(end)}`;
  }
  return d;
}

interface Footprint { x: number; y: number; rot: number; flip: boolean; t: number }

/**
 * Dấu chân dọc con đường ngang: lấy mẫu các cung bezier, cứ mỗi STEP px dọc đường đặt một bàn chân
 * quay theo hướng đi, chân trái / phải lệch nhau hai bên. Bỏ các dấu chân nằm dưới nút.
 */
function footprints(nodes: RouteNode[]): Footprint[] {
  if (nodes.length < 2) return [];
  const pts: Pt[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const curve = segment(nodes[i - 1] as RouteNode, nodes[i] as RouteNode, i);
    for (let n = i === 1 ? 0 : 1; n <= 60; n += 1) pts.push(bezierAt(curve, n / 60));
  }
  const total = pts.reduce((sum, p, k) => (k === 0 ? 0 : sum + Math.hypot(p.x - (pts[k - 1] as Pt).x, p.y - (pts[k - 1] as Pt).y)), 0);
  const centers = nodes.map((n) => ({ x: n.x, y: n.y, r: (n.kind === 'stop' ? NODE.stop : NODE.edge) / 2 + FOOT_CLEAR }));
  const out: Footprint[] = [];
  let acc = 0;
  let next = FOOT_STEP / 2;
  for (let k = 1; k < pts.length; k += 1) {
    const a = pts[k - 1] as Pt;
    const b = pts[k] as Pt;
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    if (acc < next) continue;
    next += FOOT_STEP;
    if (centers.some((c) => Math.hypot(b.x - c.x, b.y - c.y) < c.r)) continue;
    const flip = out.length % 2 === 1;
    const rot = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
    // lệch vuông góc với hướng đi: chân phải bên phải, chân trái bên trái
    const rad = (rot * Math.PI) / 180;
    const off = flip ? -FOOT_SPREAD : FOOT_SPREAD;
    out.push({ x: b.x + Math.cos(rad) * off, y: b.y + Math.sin(rad) * off, rot, flip, t: acc / (total || 1) });
  }
  return out;
}

/**
 * Chỗ đặt nút "+" giữa nút a và nút b — nằm chính giữa cung bezier nối hai điểm dừng.
 */
function addPoint(a: StopNode, b: RouteNode, i: number): Pt {
  const curve = segment(a, b, i);
  return bezierAt(curve, 0.5);
}

// ─── Giao diện điểm dừng ────────────────────────────────────────

/** Nút tròn trên đường theo loại mục (điểm tham quan có ảnh là ghim ảnh, không dùng bảng này). */
const MARKER: Record<ItemKind, string> = {
  TRANSPORT: 'bg-[var(--color-secondary-700)] text-white',
  MEAL: 'bg-[var(--color-coral)] text-white',
  PLACE: 'bg-[var(--color-primary)] text-white',
  ACTIVITY: 'bg-[var(--color-sun)] text-amber-950',
  STAY: 'bg-[var(--color-primary)] text-white',
  FREE: 'bg-[#e4eadf] text-[#3d5a52]',
};

/** Nền khung đường: sáng sớm (trên) → trưa → đêm (dưới), vân ruộng bậc thang mờ. */
const SKY: CSSProperties = {
  backgroundImage: [
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='26'%3E%3Cpath d='M0 14 Q30 4 60 14 T120 14' fill='none' stroke='%230a7d64' stroke-opacity='0.055' stroke-width='1.2'/%3E%3C/svg%3E\")",
    'linear-gradient(180deg, #fff8e3 0%, #f5f9ee 30%, #eef6f1 66%, #e8ecf8 100%)',
  ].join(', '),
};

const isPinned = (row: TimelineRow) => row.kind === 'PLACE' && !!row.place;

/** "11:30 – 12:30" (đủ khoảng giờ), "11:30" (chưa có giờ kết thúc), "Sáng" (lịch trình cũ chỉ có buổi). */
function timeRange(row: TimelineRow): string {
  if (row.startTime) return row.endTime && row.endTime !== row.startTime ? `${row.startTime} – ${row.endTime}` : row.startTime;
  return row.session ? SESSION_LABEL[row.session] : '';
}

/** "11:30 – 12:30" hoặc "Sáng · 7:00" — khung chi tiết. */
function timeDetail(row: TimelineRow): string {
  if (row.startTime) return timeRange(row);
  return row.session ? `${SESSION_LABEL[row.session]} · ${sessionTimeLabel(row.session)}` : '';
}

/** Ghim ảnh điểm tham quan cắm trên đường: ảnh tròn viền trắng, số thứ tự trong ngày, dấu đã check-in, nhấp nháy khi là điểm tiếp theo. */
function PhotoPin({ row }: { row: TimelineRow }) {
  return (
    <span className="relative flex flex-col items-center transition-transform duration-200 group-hover/stop:-translate-y-0.5">
      {row.status === 'next' && <span className="absolute left-1/2 top-0 h-[54px] w-[54px] -translate-x-1/2 animate-ping rounded-full bg-amber-300/60" />}
      <span className="relative block h-[54px] w-[54px] rounded-full bg-white p-[3px] shadow-[0_10px_18px_-8px_rgba(10,46,38,0.7)]">
        <span className="block h-full w-full overflow-hidden rounded-full bg-slate-100">
          {row.place?.cover ? <img src={mediaUrl(row.place.cover, 160)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImagePlaceholder Icon={Mountain} />}
        </span>
        {row.order != null && (
          <span className="absolute -left-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white bg-[var(--color-primary)] px-1 text-[11px] font-black text-white">
            {row.order}
          </span>
        )}
        {row.status === 'done' && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
            <CheckCircle2 className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="-mt-[2px] h-0 w-0 border-x-[7px] border-t-[10px] border-x-transparent border-t-white drop-shadow-[0_2px_1px_rgba(10,46,38,0.25)]" />
    </span>
  );
}

/** Nút tròn của mục không phải điểm tham quan — cùng khung 54px với ghim ảnh (PhotoPin) để tâm trùng điểm trên đường. */
function RoadMarker({ row, stayName }: { row: TimelineRow; stayName: string | null }) {
  const meta = KIND_META[row.kind];
  // Ô chỗ ở chưa chọn homestay: viền đứt (ô còn trống), đã chọn: nền xanh.
  const tone = row.kind === 'STAY' && !stayName
    ? 'border-2 border-dashed border-[var(--color-primary)] bg-white text-[var(--color-primary)]'
    : `border-[3px] border-white ${MARKER[row.kind]}`;
  return (
    <span className="relative flex shrink-0 items-center justify-center transition-transform duration-200 group-hover/stop:-translate-y-0.5" style={{ width: NODE.stop, height: NODE.stop }}>
      {row.status === 'next' && <span className="absolute inset-0 animate-ping rounded-full bg-amber-300/60" />}
      <span className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-full shadow-[0_10px_18px_-8px_rgba(10,46,38,0.7)] ${tone}`}>
        <meta.Icon className="h-5 w-5" strokeWidth={2.4} aria-hidden />
      </span>
    </span>
  );
}

/** Mục có dòng phụ dưới tên (chỗ ở, món, dịch vụ, nhãn) — dùng cả khi ước lượng chiều cao nhãn. */
const hasMeta = (row: TimelineRow, showOrigin: boolean) =>
  row.kind === 'STAY' || row.dishes.length > 0 || row.addons.length > 0 || (showOrigin && row.origin === 'CUSTOM') || row.status === 'next';

/** Dòng phụ nhỏ dưới tên: ảnh món, icon dịch vụ thêm, chỗ ở, nhãn "Bạn thêm" / "Tiếp theo". */
function StopMeta({ row, addons, stayName, stayHint, showOrigin, align }: {
  row: TimelineRow; addons: Map<string, TripAddon>; stayName: string | null; stayHint: string; showOrigin: boolean; align: 'start' | 'end' | 'center';
}) {
  if (!hasMeta(row, showOrigin)) return null;
  if (row.kind === 'STAY') {
    return (
      <span className={`line-clamp-2 text-[11px] font-bold leading-snug ${stayName ? 'text-[#06604a]' : 'text-slate-500'}`}>
        {stayName ?? stayHint}
      </span>
    );
  }
  const custom = showOrigin && row.origin === 'CUSTOM';
  const addonNames = row.addons.map((code) => addons.get(code)?.name ?? code).join(', ');
  const firstAddon = row.addons[0];
  const justifyClass = align === 'center' ? 'justify-center' : align === 'start' ? 'justify-start' : 'justify-end';
  return (
    <span className={`mt-0.5 flex max-w-full flex-wrap items-center gap-1 ${justifyClass}`}>
      {row.status === 'next' && <span className="rounded-[3px] bg-amber-100 px-1.5 py-px text-[10px] font-extrabold uppercase text-amber-800">Tiếp theo</span>}
      {row.dishes.length > 0 && <DishFaces dishes={row.dishes} />}
      {firstAddon && (
        <span title={addonNames} className="inline-flex h-5 max-w-full items-center gap-1 rounded-[4px] bg-sky-50 px-1.5 text-[10.5px] font-bold text-sky-800">
          {createElement(addonIcon(firstAddon), { className: 'h-3 w-3 shrink-0', 'aria-hidden': true })}
          <span className="truncate">{addons.get(firstAddon)?.name ?? firstAddon}</span>
          {row.addons.length > 1 && <span className="shrink-0 text-sky-600">+{row.addons.length - 1}</span>}
          <span className="sr-only">{row.addons.length > 1 ? ` — dịch vụ thêm: ${addonNames}` : ''}</span>
        </span>
      )}
      {custom && <span className={ORIGIN_BADGE.CUSTOM.className}>{ORIGIN_BADGE.CUSTOM.label}</span>}
    </span>
  );
}

function DishFaces({ dishes }: { dishes: TripDish[] }) {
  return (
    <span className="flex -space-x-1.5" title={dishes.map((d) => d.name).join(' · ')}>
      {dishes.slice(0, 3).map((dish) => (
        <span key={dish.slug} className="block h-5 w-5 overflow-hidden rounded-full border-2 border-white bg-orange-50">
          {dish.coverImageUrl ? <img src={mediaUrl(dish.coverImageUrl, 64)} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
        </span>
      ))}
    </span>
  );
}

const chipBase = 'relative inline-flex h-7 max-w-full items-center gap-1 rounded-md px-2 text-[11px] font-extrabold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]';

// ─── Một ngày: con đường qua các điểm dừng ──────────────────────

interface DayRouteProps extends RouteActions {
  day: number;
  /** Các mục của ngày, đã xếp theo giờ. */
  rows: TimelineRow[];
  addons: TripAddon[];
  /** Ngày đầu: đường bắt đầu từ điểm xuất phát; ngày sau: từ chỗ ở. */
  first: boolean;
  /** Ngày cuối: đường về đích; ngày khác: dừng ở "Nghỉ đêm". */
  last: boolean;
  stayName?: string | null;
  stayHint?: string;
}

/**
 * Lộ trình một ngày dạng con đường nằm ngang (trái sang phải) uốn lượn trên/dưới xen kẽ: mỗi mục là một điểm dừng (điểm tham
 * quan cắm ghim ảnh, mục khác là nút tròn màu theo loại) — tâm nút nằm đúng trên đường, thẻ nhãn (khoảng giờ · tên · dòng phụ)
 * đặt xen kẽ phía trên / phía dưới nút để không đè nhau; chạm nút hoặc thẻ đều mở chi tiết / sửa.
 */
function DayRoute({
  day, rows, addons, first, last, stayName = null, stayHint = 'Chưa chọn chỗ ở',
  onEdit, onAdd, onRemove, onSwap, onOpenPlace, onCheckin, showOrigin = false,
}: DayRouteProps) {
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const addonMap = new Map(addons.map((a) => [a.code, a]));
  const detail = detailKey ? rows.find((r) => r.key === detailKey) : undefined;

  const routeRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (routeRef.current) setContainerWidth(routeRef.current.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    if (routeRef.current) observer.observe(routeRef.current);
    return () => observer.disconnect();
  }, []);

  const actionsOf = (row: TimelineRow) => {
    const sight = isPinned(row);
    return !!((row.alternative && onSwap) || (sight && onCheckin) || (sight && onOpenPlace && onEdit));
  };

  const minWidth = rows.length === 0
    ? 360
    : PAD_X.left + GAP_X.first + Math.max(0, rows.length - 1) * GAP_X.stop + GAP_X.last + PAD_X.right;
  const width = Math.max(containerWidth || 720, minWidth);

  const nodes: RouteNode[] = [];
  const startX = PAD_X.left;
  const endX = width - PAD_X.right;
  nodes.push({ kind: 'start', x: startX, y: ROUTE_Y.center });
  if (rows.length === 0) {
    nodes.push({ kind: 'free', x: Math.round((startX + endX) / 2), y: ROUTE_Y.center });
  } else {
    const usableSpan = Math.max(1, endX - startX);
    rows.forEach((row, index) => {
      const side: 'top' | 'bottom' = index % 2 === 0 ? 'top' : 'bottom';
      const ratio = (index + 1) / (rows.length + 1);
      const x = Math.round(startX + usableSpan * ratio);
      nodes.push({ kind: 'stop', x, y: ROUTE_Y[side], row, side });
    });
  }
  nodes.push({ kind: 'end', x: endX, y: ROUTE_Y.center });
  const height = ROUTE_HEIGHT;
  const feet = footprints(nodes);
  const path = trailPath(nodes);

  return (
    <>
      <div ref={routeRef} className="w-full overflow-x-auto pb-2 scrollbar-thin">
        <div className="relative" style={{ width, height }}>
          {/* Đường nhạt + dấu chân nối các điểm: hai hình bầu dục (bàn + gót), tô chuyển từ xanh ngọc sang xanh đậm theo đường đi */}
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" width={width} height={height}>
            <path d={path} fill="none" stroke="#0a7d64" strokeOpacity={0.07} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
            <path d={path} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={28} strokeLinecap="round" strokeLinejoin="round" />
            {feet.map((f, i) => (
              <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})${f.flip ? ' scale(-1 1)' : ''}`}
                fill={`rgb(${Math.round(94 - 84 * f.t)}, ${Math.round(205 - 80 * f.t)}, ${Math.round(185 - 85 * f.t)})`}>
                <ellipse cx="0" cy="-4" rx="4.6" ry="7" />
                <ellipse cx="0" cy="7.5" rx="3.3" ry="3.8" />
              </g>
            ))}
          </svg>

          {nodes.map((n) => {
            if (n.kind === 'start' || n.kind === 'end') {
              const isStart = n.kind === 'start';
              return (
                <div key={n.kind} className="absolute" style={{ left: n.x, top: n.y }}>
                  <span
                    className={`absolute left-0 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white shadow-[0_8px_16px_-6px_rgba(29,45,79,0.75)] ${
                      isStart ? 'bg-[var(--color-cham)] text-[var(--color-sun)]' : last ? 'bg-[var(--color-sun)] text-amber-950' : 'bg-[var(--color-cham)] text-[var(--color-sun)]'
                    }`}
                    style={{ width: NODE.edge, height: NODE.edge }}
                  >
                    {isStart ? (first ? <span className="h-2 w-2 rounded-full bg-current" /> : <Home className="h-[18px] w-[18px]" strokeWidth={2.5} />)
                      : last ? <Flag className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                  </span>
                  {!isStart && (
                    <span className="absolute right-0 translate-x-3 whitespace-nowrap text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-cham)]" style={{ top: NODE.edge / 2 + 6 }}>
                      {last ? 'Về đích' : 'Nghỉ đêm'}
                    </span>
                  )}
                </div>
              );
            }
            if (n.kind === 'free') {
              const Tag = onAdd ? 'button' : 'span';
              return (
                <div key="free" className="group/stop absolute" style={{ left: n.x, top: n.y }}>
                  <span className={`absolute left-0 top-0 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_10px_18px_-8px_rgba(10,46,38,0.7)] ${
                    onAdd ? 'border-2 border-dashed border-[var(--color-primary)] bg-white text-[var(--color-primary)]' : `border-[3px] border-white ${MARKER.FREE}`
                  }`}
                  >
                    {onAdd ? <Plus className="h-5 w-5" strokeWidth={3} /> : <Compass className="h-5 w-5" />}
                  </span>
                  <Tag
                    {...(onAdd ? { type: 'button' as const, onClick: () => onAdd(day, null) } : {})}
                    className={`absolute left-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-white/90 px-2.5 py-1 text-[13px] font-extrabold leading-snug text-[var(--color-ink-deep)] ring-1 ring-black/5 ${onAdd ? 'outline-none hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] cursor-pointer' : ''}`}
                    style={{ top: 29 }}
                  >
                    {onAdd ? 'Thêm hoạt động' : 'Tự do khám phá'}
                  </Tag>
                </div>
              );
            }

            const { row, side } = n;
            const isTop = side === 'top';
            const sight = isPinned(row);
            const guide = sight && onOpenPlace ? () => onOpenPlace(row.key) : undefined;
            const edit = onEdit ? () => onEdit(row.key) : undefined;
            const open = guide ?? edit ?? (() => setDetailKey(row.key));
            const time = timeRange(row);
            const actions = actionsOf(row);
            return (
              <div key={row.key} className="group/stop absolute" style={{ left: n.x, top: n.y }}>
                {/* Nút trên đường: tâm đúng điểm của đường */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={open}
                  className="absolute left-0 -translate-x-1/2 cursor-pointer outline-none"
                  style={{ top: -NODE.stop / 2 }}
                >
                  {sight ? <PhotoPin row={row} /> : <RoadMarker row={row} stayName={stayName} />}
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(row.key)}
                    aria-label={`Bỏ mục ${row.title}`}
                    title="Bỏ mục này"
                    className="absolute z-[2] flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-[0_2px_6px_rgba(10,46,38,0.25)] ring-1 ring-slate-200 transition-colors before:absolute before:-inset-2 hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500 cursor-pointer"
                    style={sight ? { left: 19 - 12, top: -19 - 12 } : { left: 16 - 12, top: -16 - 12 }}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                  </button>
                )}
                <div
                  className="pointer-events-none absolute left-0 -translate-x-1/2 flex flex-col items-center gap-1"
                  style={{
                    width: LABEL_MAX_W,
                    ...(isTop
                      ? { bottom: NODE.stop / 2 + 8 }
                      : { top: (sight ? NODE.stop / 2 + 12 : NODE.stop / 2 + 6) }),
                  }}
                >
                  <button
                    type="button"
                    onClick={open}
                    className="pointer-events-auto flex w-full flex-col items-center text-center gap-0.5 rounded-lg bg-white/95 px-2.5 py-1.5 shadow-[0_2px_6px_rgba(10,46,38,0.12)] ring-1 ring-black/[0.06] backdrop-blur-[2px] transition-[box-shadow,background-color] duration-150 group-hover/stop:bg-white group-hover/stop:shadow-[0_6px_16px_-6px_rgba(10,46,38,0.35)] group-hover/stop:ring-[var(--color-primary)]/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] cursor-pointer"
                  >
                    {time && <span className="text-[11px] font-extrabold leading-4 tabular-nums text-[#59766e]">{time}</span>}
                    <span className="sr-only">{KIND_META[row.kind].label}: </span>
                    <span className="line-clamp-2 text-[12.5px] font-extrabold leading-snug text-[var(--color-ink-deep)]">{row.title}</span>
                    <StopMeta row={row} addons={addonMap} stayName={stayName} stayHint={stayHint} showOrigin={showOrigin} align="center" />
                  </button>
                  {actions && (
                    <span className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1">
                      {row.alternative && onSwap && (
                        <button
                          type="button"
                          onClick={() => onSwap(row.key)}
                          title={`Đổi sang ${row.alternative.name}`}
                          className={`${chipBase} bg-white text-[#06604a] ring-1 ring-teal-200 hover:ring-[var(--color-primary)]`}
                        >
                          <Repeat className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">Đổi: {row.alternative.name}</span>
                        </button>
                      )}
                      {sight && onCheckin && (
                        <button
                          type="button"
                          onClick={() => onCheckin(row.key)}
                          className={`${chipBase} ${row.status === 'done' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-xs'}`}
                        >
                          {row.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Camera className="h-3.5 w-3.5" aria-hidden />}
                          {row.status === 'done' ? 'Đã check-in' : 'Check-in'}
                        </button>
                      )}
                      {guide && edit && (
                        <button type="button" onClick={edit} aria-label={`Sửa giờ, ghi chú: ${row.title}`} className={`${chipBase} w-7 justify-center bg-white px-0 text-slate-600 ring-1 ring-slate-200 hover:text-[#06604a] hover:ring-[var(--color-primary)]`}>
                          <Pencil className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {onAdd && nodes.slice(0, -1).map((n, index) => {
            const next = nodes[index + 1];
            if (n.kind !== 'stop' || !next) return null;
            const at = addPoint(n, next, index + 1);
            return (
              <button
                key={`add-${n.row.key}`}
                type="button"
                onClick={() => onAdd(day, n.row.key)}
                aria-label={`Chèn mục sau ${n.row.endTime ?? n.row.startTime ?? n.row.title}`}
                title="Chèn mục vào đây"
                className="absolute z-[3] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[var(--color-primary)] shadow-[0_1px_4px_rgba(10,46,38,0.45)] transition-transform before:absolute before:-inset-2.5 hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] cursor-pointer"
                style={{ left: at.x, top: at.y }}
              >
                <Plus className="h-3 w-3" strokeWidth={3.5} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      {detail && (
        <StopDetailSheet row={detail} addons={addonMap} stayName={stayName} stayHint={stayHint} onClose={() => setDetailKey(null)} />
      )}
    </>
  );
}

/** Khung chi tiết một điểm dừng (lịch trình chỉ xem): ảnh, loại · giờ, tên, ghi chú, món nên thử, dịch vụ thêm. */
function StopDetailSheet({ row, addons, stayName, stayHint, onClose }: {
  row: TimelineRow; addons: Map<string, TripAddon>; stayName: string | null; stayHint: string; onClose: () => void;
}) {
  const meta = KIND_META[row.kind];
  const time = timeDetail(row);
  return (
    <PlaceSheet label={row.title} onClose={onClose}>
      {isPinned(row) && row.place?.cover && (
        <img src={mediaUrl(row.place.cover, 720)} alt="" className="mb-3.5 aspect-[16/9] w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${MARKER[row.kind]}`}>
          <meta.Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{meta.label}{time ? ` · ${time}` : ''}</p>
          <p className="text-lg font-extrabold leading-snug text-slate-900">{row.title}</p>
          {row.kind === 'STAY' ? (
            <p className={`mt-0.5 text-sm font-bold ${stayName ? 'text-[#06604a]' : 'text-slate-500'}`}>{stayName ?? stayHint}</p>
          ) : row.place && row.placeLinkId != null ? (
            <Link to={`/destinations/${row.placeLinkId}`} className="mt-0.5 inline-flex max-w-full items-center gap-1 text-sm font-bold text-[#06604a] hover:underline">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{row.place.name}</span>
            </Link>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>
      {row.note && <p className="mt-3 text-sm leading-relaxed text-slate-700">{row.note}</p>}
      {row.dishes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Món nên thử</p>
          <ul className="grid grid-cols-2 gap-2">
            {row.dishes.map((dish) => (
              <li key={dish.slug} className="flex items-center gap-2 rounded-md bg-orange-50/70 p-1.5 pr-2 ring-1 ring-orange-100">
                <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-md bg-orange-100">
                  {dish.coverImageUrl ? <img src={mediaUrl(dish.coverImageUrl, 96)} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                </span>
                <span className="line-clamp-2 text-xs font-bold leading-snug text-orange-950">{dish.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.addons.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Dịch vụ thêm</p>
          <ul className="space-y-1.5">
            {row.addons.map((code) => {
              const addon = addons.get(code);
              const Icon = addonIcon(code);
              return (
                <li key={code} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                  <span><strong className="font-bold text-slate-900">{addon?.name ?? code}</strong>{addon?.note ? <span className="text-slate-500"> · {addon.note}</span> : null}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PlaceSheet>
  );
}

// ─── Cả lịch trình: mỗi ngày một chặng ─────────────────────────

/** Tóm tắt các điểm của ngày làm tên chặng khi gói không đặt tên: "Khau Phạ → Móng Ngựa". */
function daySummary(rows: TimelineRow[]): string {
  return rows.filter(isPinned).map((r) => r.place?.name ?? r.title).join(' → ');
}

/** Dãy núi mờ ở góc tiêu đề ngày. */
function Ridges() {
  return (
    <svg aria-hidden viewBox="0 0 160 48" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 h-14 w-44 sm:w-56">
      <path d="M0 48 C18 30 30 26 46 34 C60 16 76 8 94 24 C106 14 120 10 136 26 C146 20 154 20 160 23 L160 48 Z" className="fill-[var(--color-primary)]" opacity="0.1" />
      <path d="M0 48 C22 38 42 33 62 40 C82 29 100 29 120 38 C136 32 150 34 160 36 L160 48 Z" className="fill-[var(--color-cham)]" opacity="0.08" />
    </svg>
  );
}

/**
 * Lịch trình dạng lộ trình, chia theo ngày: mỗi ngày một chặng (tên chặng, số điểm, giờ bắt đầu → kết thúc) với con đường
 * uốn khúc qua các điểm dừng. paged: mỗi ngày một trang (tab ngày thay cho ô "Ngày N" + ngày ở đầu chặng — không lặp lại).
 */
export default function TripTimeline({
  rows,
  days,
  startDate,
  dayTitles = [],
  dayNotes = [],
  addons,
  stayName = null,
  stayHint = 'Chưa chọn chỗ ở',
  today = null,
  onlyDay,
  paged,
  dayFooter,
  ...actions
}: TripTimelineProps) {
  const allDays = Array.from({ length: Math.max(1, days, ...rows.map((r) => r.dayIndex)) }, (_, i) => i + 1);
  const lastDay = allDays[allDays.length - 1];
  const { onAdd } = actions;
  const isTodayOf = (day: number) => !!today && !!startDate && dayDateKey(startDate, day) === today;

  const renderDay = (day: number, inPager: boolean) => {
    const dayRows = rows.filter((r) => r.dayIndex === day);
    const dateLabel = dayDateLabel(startDate, day);
    const isToday = isTodayOf(day);
    // Ngày chưa có mục: trình sửa thì "chưa có mục" (chờ thêm), chỉ xem thì là ngày tự do khám phá.
    const title = dayTitles[day - 1] || daySummary(dayRows) || (dayRows.length === 0 ? (onAdd ? 'Chưa có mục nào' : 'Ngày tự do') : `Ngày ${day}`);
    const sights = dayRows.filter(isPinned).length;
    const start = dayRows.find((r) => r.startTime)?.startTime;
    const lastTimed = [...dayRows].reverse().find((r) => r.endTime ?? r.startTime);
    const end = lastTimed?.endTime ?? lastTimed?.startTime;
    const lastRow = dayRows[dayRows.length - 1];
    const lastAt = lastRow?.endTime ?? lastRow?.startTime;
    const footer = dayFooter?.(day);
    const card = (
      <section key={day} aria-label={`Ngày ${day}`} className="overflow-hidden rounded-lg bg-white shadow-[0_14px_34px_-26px_rgba(10,46,38,0.55)] ring-1 ring-[#e3e8dc]" style={SKY}>
        <header className="relative flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
          <Ridges />
          {!inPager && (
            <span className={`relative flex h-[54px] w-[50px] shrink-0 flex-col items-center justify-center rounded-md text-white shadow-[0_10px_18px_-10px_rgba(29,45,79,0.9)] ${isToday ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-cham)]'}`}>
              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/70">Ngày</span>
              <span className="text-[22px] font-black leading-none tabular-nums">{day}</span>
            </span>
          )}
          <div className="relative min-w-0 flex-1">
            {/* Hình xem trước một ngày (onlyDay) chưa có ngày đi thì không ghi "Chưa chọn ngày" */}
            {!inPager && (dateLabel || onlyDay == null) && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500">
                {dateLabel ?? 'Chưa chọn ngày'}
                {isToday && <span className="rounded-[3px] bg-amber-300 px-1.5 py-px text-[10px] font-extrabold uppercase text-amber-950">Hôm nay</span>}
              </p>
            )}
            <h3 className={`${inPager || (!dateLabel && onlyDay != null) ? '' : 'mt-0.5 '}text-[15px] font-extrabold leading-snug text-[var(--color-ink-deep)] sm:text-base`}>{title}</h3>
            {dayNotes[day - 1] && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{dayNotes[day - 1]}</p>}
            {(sights > 0 || start || (inPager && isToday)) && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {inPager && isToday && <span className="inline-flex h-[22px] items-center rounded bg-amber-300 px-[7px] text-[11px] font-extrabold uppercase text-amber-950">Hôm nay</span>}
                {sights > 0 && <span className={tagClass('green')}><MapPin className="h-3 w-3" aria-hidden /> {sights} điểm tham quan</span>}
                {start && (
                  <span className={tagClass('outline')}>
                    <Sun className="h-3 w-3 text-amber-500" aria-hidden /> {start}{end && end !== start ? <> → {end}</> : null}
                  </span>
                )}
              </p>
            )}
          </div>
        </header>

        <DayRoute
          day={day}
          rows={dayRows}
          addons={addons}
          first={day === 1}
          last={day === lastDay}
          stayName={stayName}
          stayHint={stayHint}
          {...actions}
        />

        {onAdd && dayRows.length > 0 && (
          <div className="px-4 pb-4 sm:px-5">
            <button
              type="button"
              onClick={() => onAdd(day, lastRow?.key ?? null)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white/80 px-3 text-xs font-bold text-slate-600 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              {lastAt ? `Thêm mục sau ${lastAt}` : `Thêm mục vào ngày ${day}`}
            </button>
          </div>
        )}
      </section>
    );
    return footer ? <div key={day} className="space-y-3">{card}{footer}</div> : card;
  };

  if (paged && onlyDay == null) {
    return (
      <TripDayPager
        {...paged}
        days={allDays.length}
        startDate={startDate}
        todayDay={allDays.find(isTodayOf) ?? null}
        renderDay={(day) => renderDay(day, true)}
      />
    );
  }
  const dayList = onlyDay != null ? allDays.filter((d) => d === onlyDay) : allDays;
  return <div className="space-y-5">{dayList.map((day) => renderDay(day, false))}</div>;
}

/** "YYYY-MM-DD" của Ngày N (so với hôm nay). */
function dayDateKey(startDate: string, day: number): string {
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + day - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
