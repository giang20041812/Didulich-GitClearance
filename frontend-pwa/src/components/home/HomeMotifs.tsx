import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MOTIFS, type MotifName } from '@/components/home/motifShapes';

/**
 * Họa tiết minh họa nền cho từng phần trang chủ, vẽ nét mảnh, bo tròn và mờ ở hai mép: mỗi phần một bộ riêng theo nội dung
 * (điểm đến → núi / ruộng bậc thang, homestay → nhà sàn / đèn lồng / lửa trại, đặc sản → bát phở / bông lúa / cá nướng, hành
 * trình → la bàn / đường đi / ba lô). Hình nằm trong motifShapes.tsx; trong cùng một phần / trang không có hai hình trùng nhau. Khi cuộn tới, cả hình mờ dần vào và trồi nhẹ lên (xem .motif trong globals.css);
 * hiện xong thì đứng yên nên không tốn công vẽ lại khi cuộn.
 *
 * Các trang danh sách (homestay, điểm đến, ẩm thực...) dùng lại cùng lớp này làm nền dưới hero (`className` đặt vùng phủ).
 *
 * Phần chứa phải có `isolate` (tạo stacking context): lớp này nằm ở -z-10 — trên nền của phần, dưới nội dung.
 */

export type MotifVariant =
  | 'destinations' | 'homestay' | 'specialty' | 'journey'
  | 'explore' | 'stay' | 'gift' | 'restaurant' | 'utility' | 'culture' | 'transport';


type Placement = { motif: MotifName; side: 'left' | 'right'; at: string; mirror?: boolean };

/** Họa tiết so le hai mép cho mỗi phần; hình vẽ neo vào mép trái (ruộng, dây đèn, đường đi) được lật khi nằm bên phải. */
const LAYOUT: Record<MotifVariant, { tone: string; items: Placement[] }> = {
  // ---- Trang chủ ----
  destinations: {
    tone: '#0a7d64',
    items: [
      { motif: 'mountains', side: 'left', at: 'top-[3%]' },
      { motif: 'waterfall', side: 'right', at: 'top-[28%]' },
      { motif: 'terraces', side: 'left', at: 'top-[60%]' },
      { motif: 'pass', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  homestay: {
    tone: '#1d4f6b',
    items: [
      { motif: 'house', side: 'left', at: 'top-[3%]' },
      { motif: 'lanterns', side: 'right', at: 'top-[27%]', mirror: true },
      { motif: 'bamboo', side: 'left', at: 'top-[58%]' },
      { motif: 'campfire', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  specialty: {
    tone: '#a8641a',
    items: [
      { motif: 'bowl', side: 'left', at: 'top-[3%]' },
      { motif: 'rice', side: 'right', at: 'top-[26%]' },
      { motif: 'chili', side: 'left', at: 'top-[58%]' },
      { motif: 'fish', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  journey: {
    tone: '#0a7d64',
    items: [
      { motif: 'compass', side: 'left', at: 'top-[3%]' },
      { motif: 'route', side: 'right', at: 'top-[28%]', mirror: true },
      { motif: 'tent', side: 'left', at: 'top-[60%]' },
      { motif: 'backpack', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  // ---- Trang danh sách: mỗi trang một bộ riêng, không trùng hình với nhau hay với trang chủ ----
  explore: {
    tone: '#2b7a6b',
    items: [
      { motif: 'cloudSea', side: 'left', at: 'top-[3%]' },
      { motif: 'paraglider', side: 'right', at: 'top-[27%]' },
      { motif: 'pine', side: 'left', at: 'top-[58%]' },
      { motif: 'birds', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  stay: {
    tone: '#3f5d80',
    items: [
      { motif: 'window', side: 'left', at: 'top-[3%]' },
      { motif: 'teapot', side: 'right', at: 'top-[27%]' },
      { motif: 'bed', side: 'left', at: 'top-[58%]' },
      { motif: 'lamp', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  gift: {
    tone: '#a06a2c',
    items: [
      { motif: 'wineJar', side: 'left', at: 'top-[3%]' },
      { motif: 'corn', side: 'right', at: 'top-[26%]' },
      { motif: 'teaLeaf', side: 'left', at: 'top-[58%]' },
      { motif: 'basket', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  restaurant: {
    tone: '#b5532e',
    items: [
      { motif: 'comLam', side: 'left', at: 'top-[3%]' },
      { motif: 'skewers', side: 'right', at: 'top-[27%]' },
      { motif: 'pot', side: 'left', at: 'top-[58%]' },
      { motif: 'banhChung', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  utility: {
    tone: '#4a5d8a',
    items: [
      { motif: 'signpost', side: 'left', at: 'top-[3%]' },
      { motif: 'phone', side: 'right', at: 'top-[27%]' },
      { motif: 'suitcase', side: 'left', at: 'top-[58%]' },
      { motif: 'firstAid', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  culture: {
    tone: '#8a3f5e',
    items: [
      { motif: 'khen', side: 'left', at: 'top-[3%]' },
      { motif: 'brocade', side: 'right', at: 'top-[27%]' },
      { motif: 'flower', side: 'left', at: 'top-[58%]' },
      { motif: 'parasol', side: 'right', at: 'bottom-[2%]' },
    ],
  },
  transport: {
    tone: '#2c6e8f',
    items: [
      { motif: 'motorbike', side: 'left', at: 'top-[3%]' },
      { motif: 'bus', side: 'right', at: 'top-[27%]' },
      { motif: 'bridge', side: 'left', at: 'top-[58%]' },
      { motif: 'pass', side: 'right', at: 'bottom-[2%]' },
    ],
  },
};

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Một họa tiết: ẩn đi trước lần vẽ đầu (data-ink), rồi thêm data-drawn khi cuộn tới — CSS (.motif) cho cả hình hiện dần và
 * trồi nhẹ lên. Chỉ animate opacity + translate của cả khung SVG (chạy trên GPU): trước đây từng nét được "vẽ" bằng
 * stroke-dashoffset, mỗi khung hình luồng chính phải tính lại style + vẽ lại hàng chục nét đúng lúc khách đang cuộn → giật.
 * Khi `together`: cả bộ họa tiết của phần hiện cùng lúc khi phần đó tới (`sectionDrawn`), họa tiết sau trễ hơn họa tiết
 * trước 220ms. Ngược lại: từng họa tiết tự hiện khi lên tới 65% phía trên màn hình. Không có IntersectionObserver / bật giảm
 * chuyển động thì hiện sẵn.
 */
function Motif({ children, className, together, sectionDrawn, order }: { children: ReactNode; className: string; together: boolean; sectionDrawn: boolean; order: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [inked, setInked] = useState(false);
  const [seenDrawn, setSeenDrawn] = useState(false);
  const drawn = together ? sectionDrawn : seenDrawn;

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg || reduceMotion() || !('IntersectionObserver' in window)) return;
    if (together) svg.style.setProperty('--motif-delay', `${order * 220}ms`);
    setInked(true);
  }, [together, order]);

  useEffect(() => {
    const svg = ref.current;
    if (!inked || !svg || together) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setSeenDrawn(true);
      observer.disconnect();
    }, { threshold: 0.3, rootMargin: '0px 0px -35% 0px' }); // chỉ vẽ khi đã lên 65% phía trên màn hình
    observer.observe(svg);
    return () => observer.disconnect();
  }, [inked, together]);

  return (
    <svg ref={ref} viewBox="0 0 260 220" fill="none" className={`motif ${className}`} data-ink={inked ? '' : undefined} data-drawn={drawn ? '' : undefined}>
      <g stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function HomeMotifs({ variant, className = 'inset-0' }: { variant: MotifVariant; className?: string }) {
  const { tone, items } = LAYOUT[variant];

  // Mỗi phần cao theo nội dung (không còn một phần = một màn hình), nên từng họa tiết tự vẽ khi lướt tới nó.
  return (
    <div aria-hidden className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`} style={{ color: tone }}>
      {items.map(({ motif, side, at, mirror }, i) => (
        <Motif
          key={i}
          order={i}
          together={false}
          sectionDrawn={false}
          className={`absolute h-[127px] w-[150px] md:h-[220px] md:w-[260px] ${side === 'left' ? 'left-0' : 'right-0'} ${at} ${mirror ? '-scale-x-100' : ''}`}
        >
          {MOTIFS[motif]()}
        </Motif>
      ))}
    </div>
  );
}
