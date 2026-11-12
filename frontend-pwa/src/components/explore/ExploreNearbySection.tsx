import { useEffect, useMemo, useState } from 'react';
import { Compass, Loader2, MapPin, Star } from 'lucide-react';
import DetailSection from '@/components/common/DetailSection';
import ExploreMap, { type ExploreMarker } from '@/components/explore/ExploreMap';
import ExplorePlaceSheet from '@/components/explore/ExplorePlaceSheet';
import { EXPLORE_CATEGORY_UI } from '@/components/explore/exploreCategoryUi';
import { fetchExplore } from '@/services/exploreService';
import type { CategoryCount, ExploreCard, ExploreCategory, ExploreHomestay } from '@/types/explore';

/** Danh mục mới backend thêm sau mà giao diện chưa biết: dùng nhãn backend, biểu tượng ghim. */
const categoryUi = (code: ExploreCategory, fallbackLabel: string) => EXPLORE_CATEGORY_UI[code] ?? { label: fallbackLabel, Icon: MapPin };

/**
 * KH-01 — mục "Khám phá quanh đây" trên trang chi tiết homestay (US02.03).
 * <ul>
 *   <li>BR-02.06 / BR-02.07: thứ tự và 10 thẻ mỗi lần do backend trả; "Xem thêm" nối trang tiếp theo.</li>
 *   <li>AC-02.17: chip lọc danh mục (chỉ danh mục có dữ liệu); danh sách và bản đồ cùng lọc.</li>
 *   <li>AC-02.18: không có địa điểm đủ điều kiện (hoặc API lỗi) → không render gì, báo trang cha bỏ liên kết điều hướng.</li>
 *   <li>AC-02.19: bản đồ lỗi chỉ ảnh hưởng vùng bản đồ, danh sách vẫn hiện.</li>
 * </ul>
 */
export default function ExploreNearbySection({ homestayId, onAvailabilityChange, className = '', embedded = false, active = true }: {
  homestayId: number;
  /** true khi mục có dữ liệu để hiển thị (trang cha thêm liên kết vào thanh điều hướng mục). */
  onAvailabilityChange?: (available: boolean) => void;
  className?: string;
  /** Nằm trong khung "Gợi ý cho chuyến đi" của trang cha (đã có tiêu đề): bỏ tiêu đề mục riêng. */
  embedded?: boolean;
  /**
   * Đang hiển thị. Trang cha giữ mục này trong DOM cả khi ẩn (để vẫn tải dữ liệu và báo có / không có địa điểm), nhưng
   * Leaflet dựng trong khung bị ẩn (0×0) sẽ vỡ ô bản đồ — nên chỉ dựng bản đồ khi mục đang hiện.
   */
  active?: boolean;
}) {
  const [category, setCategory] = useState<ExploreCategory | null>(null);
  const [items, setItems] = useState<ExploreCard[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [homestay, setHomestay] = useState<ExploreHomestay | null>(null);
  const [radiusKm, setRadiusKm] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // Báo trang cha mục có hiện hay không (để thêm / bỏ liên kết trong thanh điều hướng mục).
  useEffect(() => { onAvailabilityChange?.(available); }, [available, onAvailabilityChange]);

  // Trang đầu (và mỗi lần đổi danh mục). Lần tải không lọc quyết định mục có hiện hay không.
  useEffect(() => {
    let alive = true;
    fetchExplore(homestayId, category, 0)
      .then((res) => {
        if (!alive) return;
        setItems(res.items);
        setPage(0);
        setHasMore(res.hasMore);
        setHomestay(res.homestay);
        setRadiusKm(res.radiusKm);
        if (category === null) {
          setCategories(res.categories);
          setAvailable(res.totalElements > 0);
        }
      })
      .catch(() => {
        if (!alive || category !== null) return;
        setAvailable(false);
      });
    return () => { alive = false; };
  }, [homestayId, category]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetchExplore(homestayId, category, page + 1);
      setItems((current) => [...current, ...res.items.filter((i) => !current.some((c) => c.id === i.id))]);
      setPage(res.page);
      setHasMore(res.hasMore);
    } catch {
      /* giữ danh sách hiện có; khách bấm lại "Xem thêm" */
    } finally {
      setLoadingMore(false);
    }
  };

  const markers = useMemo<ExploreMarker[]>(() => {
    const list: ExploreMarker[] = [];
    if (homestay?.latitude != null && homestay.longitude != null) {
      list.push({ id: homestay.id, lat: homestay.latitude, lng: homestay.longitude, label: homestay.name, kind: 'homestay' });
    }
    for (const item of items) {
      if (item.latitude != null && item.longitude != null) {
        list.push({ id: item.id, lat: item.latitude, lng: item.longitude, label: item.name, kind: 'place' });
      }
    }
    return list;
  }, [homestay, items]);

  if (!available) return null;

  const chip = (selectedChip: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition-colors min-h-9 ${
      selectedChip ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[var(--color-primary)]'
    }`;

  const content = (
    <>
      {embedded && <p className="mb-3 text-sm text-slate-500">Địa điểm trong khoảng {radiusKm} km quanh chỗ nghỉ.</p>}
      <div role="group" aria-label="Lọc theo danh mục" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)} className={chip(category === null)}>Tất cả</button>
        {categories.map((c) => {
          const ui = categoryUi(c.code, c.label);
          return (
            <button key={c.code} type="button" aria-pressed={category === c.code} onClick={() => setCategory(c.code)} className={chip(category === c.code)}>
              <ui.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {ui.label} <span className="opacity-70">({c.count})</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="lg:order-2">
          {active && (
            <ExploreMap markers={markers} onMarkerClick={setSelected}
              className="h-[240px] overflow-hidden rounded-2xl lg:sticky lg:top-[calc(var(--app-header-offset,72px)+20px)] lg:h-[480px]" />
          )}
        </div>

        <div className="min-w-0 lg:order-1">
          <ul className="flex flex-col gap-2.5">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setSelected(item.id)}
                  className={`flex w-full gap-3 rounded-xl border bg-white p-2.5 text-left transition-all hover:border-[var(--color-primary)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${
                    selected === item.id ? 'border-[var(--color-primary)] shadow-md' : 'border-slate-200'
                  }`}>
                  <div className="relative h-[84px] w-[112px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                      : <span className="flex h-full items-center justify-center text-slate-300"><MapPin className="h-7 w-7" aria-hidden /></span>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[15px] font-bold text-[var(--color-ink-deep)]">{item.name}</p>
                      <span className="shrink-0 text-xs font-bold text-slate-700">{item.distanceText}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-primary-700)]">
                        {categoryUi(item.category, item.categoryLabel).label}
                      </span>
                      {item.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden /> Nổi bật
                        </span>
                      )}
                    </div>
                    {item.summary && <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{item.summary}</p>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Khoảng cách tính theo đường chim bay, chỉ để tham khảo.</p>
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => { void loadMore(); }} disabled={loadingMore}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </div>
      </div>

      {selected !== null && <ExplorePlaceSheet placeId={selected} homestayId={homestayId} onClose={() => setSelected(null)} />}
    </>
  );

  if (embedded) return <div className={className}>{content}</div>;
  return (
    <DetailSection
      id="explore"
      icon={Compass}
      eyebrow="Quanh homestay"
      title="Khám phá quanh đây"
      subtitle={`Nhà hàng, tham quan, check-in, trải nghiệm trong khoảng ${radiusKm} km`}
      borderless
      className={className}
    >
      {content}
    </DetailSection>
  );
}
