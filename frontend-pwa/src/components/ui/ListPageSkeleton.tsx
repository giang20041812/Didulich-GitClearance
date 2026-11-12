import { Skeleton } from './skeleton';
import { COMPACT_GRID_FULL, COMPACT_GRID_WITH_SIDEBAR } from '@/lib/compactCard';

const bar = 'bg-slate-200 opacity-100';

type ToolbarSpec = { chips?: number; actions?: number; search?: boolean };
type FilterSpec = { groups?: number[]; hasBudget?: boolean };

/**
 * Hình khung chờ của từng trang danh sách — trang (lần tải đầu) và khung chờ lúc tải mã trang (AppRoutes) dùng chung,
 * để hai lớp chờ trông như một. groups = số dòng ô chọn của từng nhóm trong cột bộ lọc thật.
 */
export const LIST_SKELETON_SPECS = {
  homestays: { toolbar: { chips: 6, search: true }, filter: { groups: [6] }, count: 12 },
  destinations: { toolbar: { chips: 3 }, filter: { groups: [2, 6, 1], hasBudget: false }, count: 9 },
  restaurants: { toolbar: { chips: 5 }, filter: { groups: [5, 4] }, count: 6 },
  transport: { toolbar: { chips: 6, actions: 1 }, filter: { groups: [5], hasBudget: false }, count: 8 },
  services: { toolbar: { chips: 0 }, count: 8 },
  specialties: { count: 8 },
  culture: { count: 8 },
} satisfies Record<string, { toolbar?: ToolbarSpec; filter?: FilterSpec; count: number }>;

/** Khung chờ một thẻ gọn (CompactPlaceCard): ảnh 16:10 + tên + địa điểm + giá, cùng bo góc / khoảng đệm với thẻ thật. */
export function CompactCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-slate-900/10 ring-1 ring-slate-200/80 shadow-xs aspect-square relative p-3.5 sm:p-4 justify-between">
      <div className="flex justify-between items-center">
        <Skeleton className={`${bar} h-5 w-20 rounded-full`} />
        <Skeleton className={`${bar} h-5 w-16 rounded-full`} />
      </div>
      <div className="space-y-2 mt-auto">
        <Skeleton className={`${bar} h-4 w-3/4`} />
        <Skeleton className={`${bar} h-3 w-full opacity-70`} />
        <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
          <Skeleton className={`${bar} h-3.5 w-16`} />
          <Skeleton className={`${bar} h-3.5 w-20`} />
        </div>
      </div>
    </div>
  );
}

/** Lưới thẻ chờ — cùng lưới với trang thật (có cột bộ lọc: 2 cột; toàn chiều ngang: 2/3/4 cột). */
export function CardGridSkeleton({ count = 6, withSidebar = false }: { count?: number; withSidebar?: boolean }) {
  return (
    <div role="status" aria-busy="true" className={withSidebar ? COMPACT_GRID_WITH_SIDEBAR : COMPACT_GRID_FULL}>
      <span className="sr-only">Đang tải danh sách</span>
      {Array.from({ length: count }, (_, i) => <CompactCardSkeleton key={i} />)}
    </div>
  );
}

function Chip({ w }: { w: string }) {
  return <Skeleton className={`${bar} h-8 shrink-0 rounded-full ${w}`} />;
}

/**
 * Khung chờ thanh công cụ phía trên danh sách: tiêu đề + số kết quả, các nút bên phải (sắp xếp, bản đồ),
 * hàng chip lọc nhanh (chips = 0: trang không có hàng này) và ô tìm kiếm (search: trang Lưu trú).
 */
export function ToolbarSkeleton({ chips = 5, actions = 2, search = false }: { chips?: number; actions?: number; search?: boolean }) {
  const widths = ['w-24', 'w-28', 'w-20', 'w-32', 'w-24', 'w-28', 'w-20'];
  const actionWidths = ['w-40', 'w-32'];
  return (
    <div
      role="status"
      aria-busy="true"
      className="relative mb-6 overflow-hidden rounded-2xl bg-white p-4 shadow-xs ring-1 ring-slate-900/[0.06] md:p-5"
    >
      <span className="sr-only">Đang tải bộ lọc</span>
      <div aria-hidden="true">
        <div className={`flex flex-col justify-between gap-3 sm:flex-row sm:items-center ${chips > 0 || search ? 'border-b border-slate-100 pb-3.5' : ''}`}>
          <div className="flex items-center gap-2">
            <Skeleton className={`${bar} h-6 w-36`} />
            <Skeleton className={`${bar} h-6 w-24 rounded-full`} />
          </div>
          {actions > 0 && (
            <div className="flex items-center gap-2.5">
              {Array.from({ length: actions }, (_, i) => (
                <Skeleton key={i} className={`${bar} h-9 rounded-xl ${actionWidths[i % actionWidths.length]}`} />
              ))}
            </div>
          )}
        </div>
        {chips > 0 && (
          <div className="flex items-center gap-2 overflow-hidden pt-3.5">
            <Skeleton className={`${bar} h-4 w-20 shrink-0`} />
            {Array.from({ length: chips }, (_, i) => <Chip key={i} w={widths[i % widths.length]!} />)}
          </div>
        )}
        {search && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <Skeleton className={`${bar} mb-3 h-4 w-36`} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Skeleton className={`${bar} h-11 flex-1 rounded-md`} />
              <Skeleton className={`${bar} h-11 w-full rounded-md sm:w-32`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Khung chờ cột bộ lọc bên trái: tiêu đề + các nhóm ô chọn (groups = số dòng của từng nhóm, theo đúng bộ lọc thật)
 * + thanh ngân sách ở cuối (hasBudget).
 */
export function FilterPanelSkeleton({ groups = [4, 4], hasBudget = true, className }: { groups?: number[]; hasBudget?: boolean; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-900/[0.06] ${className ?? ''}`}
    >
      <span className="sr-only">Đang tải bộ lọc</span>
      <div aria-hidden="true">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <Skeleton className={`${bar} h-4 w-4 rounded`} />
          <Skeleton className={`${bar} h-5 w-36`} />
        </div>
        {groups.map((rows, g) => (
          <div key={g} className="space-y-3 border-b border-slate-100 p-4 last:border-b-0">
            <Skeleton className={`${bar} h-4 w-28`} />
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center gap-2.5">
                <Skeleton className={`${bar} h-4 w-4 shrink-0 rounded`} />
                <Skeleton className={`${bar} h-3.5 ${r % 2 ? 'w-2/5' : 'w-3/5'}`} />
              </div>
            ))}
          </div>
        ))}
        {hasBudget && (
          <div className="space-y-3 p-4">
            <Skeleton className={`${bar} h-4 w-32`} />
            <Skeleton className={`${bar} h-2 w-full rounded-full`} />
            <div className="flex justify-between">
              <Skeleton className={`${bar} h-3 w-14`} />
              <Skeleton className={`${bar} h-3 w-14`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Hàng tab / chip ngang (mùa lễ hội, loại dịch vụ…). */
export function TabsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  const widths = ['w-36', 'w-40', 'w-48', 'w-48'];
  return (
    <div role="status" aria-busy="true" className={`flex items-center gap-2 overflow-hidden ${className ?? ''}`}>
      <span className="sr-only">Đang tải bộ lọc</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className={`${bar} h-9 shrink-0 rounded-full ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}
