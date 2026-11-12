import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Info,
  Leaf,
  MapPin,
  Soup,
  Sparkles,
  Store,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DetailSection from '@/components/common/DetailSection';
import DetailPageShell, { DetailAsideCard, DetailFact } from '@/components/common/DetailPageShell';
import TikTokEmbedPlayer from '@/components/homestay/TikTokEmbedPlayer';
import PlaceHighlights from '@/components/common/PlaceHighlights';
import { fetchDishDetail, peekDishDetail, type DishDetailDto } from '@/services/specialtyService';
import { placeDetailPath } from '@/lib/placeRoutes';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** Giá tham khảo của món ("50.000 – 80.000đ /phần"); null khi chưa có giá. */
function priceText(dish: DishDetailDto): string | null {
  if (dish.priceRefMin == null || dish.priceRefMin <= 0) return null;
  const max = dish.priceRefMax != null && dish.priceRefMax > dish.priceRefMin ? ` – ${vnd(dish.priceRefMax)}` : '';
  return `${vnd(dish.priceRefMin)}${max}đ${dish.priceUnitNote ? ` /${dish.priceUnitNote}` : ''}`;
}

/** Trang chi tiết món đặc sản (/specialties/:identifier — id hoặc slug). Đổi sang món khác thì dựng lại trang từ đầu. */
export default function DishDetailPage() {
  const { identifier } = useParams<{ identifier?: string }>();
  return <DishDetailContent key={identifier} identifier={identifier} />;
}

function DishDetailContent({ identifier }: { identifier?: string }) {
  const navigate = useNavigate();
  // Đã xem trước đó (quay lại từ trang khác) thì vẽ ngay từ bộ nhớ, làm mới ở nền.
  const [dish, setDish] = useState<DishDetailDto | null>(() => (identifier ? peekDishDetail(identifier) ?? null : null));
  const [loading, setLoading] = useState(() => !(identifier && peekDishDetail(identifier)));

  useEffect(() => {
    if (!identifier) return undefined;
    let alive = true;
    fetchDishDetail(identifier)
      .then((data) => {
        if (!alive) return;
        setDish(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [identifier]);

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] bg-[var(--color-canvas)]"><DetailSkeleton label="Đang tải thông tin đặc sản" /></div>
    );
  }

  if (!dish) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center bg-[var(--color-canvas)] px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-600">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-ink-deep)] mb-2">Không tìm thấy đặc sản</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-md mb-6">
          Món đặc sản bạn đang tìm có thể đã được gỡ hoặc không còn tồn tại trên hệ thống.
        </p>
        <Button variant="primary" onClick={() => navigate('/specialties')} className="rounded-md font-bold px-5">
          Quay lại danh sách đặc sản
        </Button>
      </div>
    );
  }

  const images = dish.images?.length ? dish.images.filter(Boolean) : dish.coverImageUrl ? [dish.coverImageUrl] : [];
  const region = dish.regionName || 'Mù Cang Chải';
  const price = priceText(dish);
  const tiktokVideo = dish.videoUrl && /tiktok\.com/i.test(dish.videoUrl) ? dish.videoUrl : null;
  const otherVideo = dish.videoUrl && !tiktokVideo ? dish.videoUrl : null;
  const facts = ([
    { label: 'Nguồn gốc', value: dish.origin, Icon: MapPin },
    { label: 'Nguyên liệu', value: dish.ingredients, Icon: Leaf },
    { label: 'Ý nghĩa văn hóa', value: dish.culturalMeaning, Icon: BookOpen },
    { label: 'Cách thưởng thức', value: dish.servingNote, Icon: Soup },
  ] as { label: string; value?: string | null; Icon: LucideIcon }[]).filter((fact) => fact.value?.trim());
  const servedAt = dish.servedAt ?? [];

  const hasHighlights = (dish.highlights ?? []).some((h) => ['PRO', 'CON', 'PAIN_POINT', 'TIP'].includes(h.type));
  const hasWhere = Boolean(dish.whereToEat) || servedAt.length > 0;
  const tabs = [
    { id: 'about', label: 'Giới thiệu' },
    ...(tiktokVideo ? [{ id: 'video', label: 'Video' }] : []),
    ...(hasHighlights ? [{ id: 'experience', label: 'Kinh nghiệm' }] : []),
    ...(hasWhere ? [{ id: 'where', label: 'Nơi thưởng thức' }] : []),
  ];

  const badges = (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-2xs">
        <UtensilsCrossed className="h-3.5 w-3.5 text-emerald-600" />
        Đặc sản địa phương
      </span>
      {dish.tagBadge && (
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {dish.tagBadge}
        </span>
      )}
    </>
  );

  const meta = (
    <span className="inline-flex items-center gap-1.5 text-slate-700">
      <MapPin className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
      Đặc sản vùng {region}
    </span>
  );

  const goToWhere = () => document.getElementById('where')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const aside = (
    <DetailAsideCard>
      <div className="mb-4">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Giá tham khảo</span>
        <p className="mt-0.5 text-2xl font-extrabold text-slate-900">{price ?? 'Chưa có giá'}</p>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4 text-sm">
        <DetailFact label="Danh mục">Đặc sản địa phương</DetailFact>
        <DetailFact label="Khu vực">{region}</DetailFact>
        {dish.origin?.trim() && <DetailFact label="Nguồn gốc">{dish.origin}</DetailFact>}
      </div>

      {hasWhere && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={goToWhere}
          className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl cta cta-primary font-bold text-white shadow-sm transition "
        >
          <Store className="h-4 w-4" />
          <span>Xem nơi thưởng thức</span>
        </motion.button>
      )}
      {otherVideo && (
        <a
          href={otherVideo}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/50 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100/70"
        >
          <ExternalLink className="h-4 w-4 text-emerald-600" />
          Xem video về món này
        </a>
      )}
      <Link
        to="/specialties"
        onClick={(e) => {
          if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
            e.preventDefault();
            navigate(-1);
          }
        }}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4 text-[var(--color-primary)]" />
        Quay lại danh sách đặc sản
      </Link>
    </DetailAsideCard>
  );

  return (
    <DetailPageShell
      breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: 'Đặc sản địa phương', to: '/specialties' }, { label: dish.name }]}
      badges={badges}
      title={dish.name}
      meta={meta}
      images={images}
      tabs={tabs}
      cta={
        hasWhere
          ? {
              label: 'Nơi thưởng thức',
              onClick: goToWhere,
              hint: price ? (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Giá tham khảo</span>
                  <p className="text-sm font-black leading-tight text-slate-900">{price}</p>
                </>
              ) : undefined,
            }
          : undefined
      }
      shareText={dish.description ?? undefined}
      aside={aside}
    >
      <DetailSection id="about" variant="flat" icon={Sparkles} title="Về món đặc sản này">
        <p className="whitespace-pre-line text-[15px] leading-[1.8] text-slate-700">
          {dish.description || `Đặc sản của đồng bào vùng cao ${region} — thông tin chi tiết đang được cập nhật.`}
        </p>
        {facts.length > 0 && (
          <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            {facts.map(({ label, value, Icon }) => (
              <div key={label} className="flex gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="whitespace-pre-line text-sm text-slate-800">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </DetailSection>

      {tiktokVideo && (
        <DetailSection id="video" variant="flat" icon={Video} title="Video review">
          <TikTokEmbedPlayer url={tiktokVideo} placeName={dish.name} className="mx-auto" />
        </DetailSection>
      )}

      <PlaceHighlights id="experience" variant="flat" highlights={dish.highlights} />

      {hasWhere && (
        <DetailSection id="where" variant="flat" icon={Store} title="Nơi thưởng thức & mua" subtitle="Gợi ý nơi ăn hoặc mua món này làm quà">
          {dish.whereToEat && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{dish.whereToEat}</p>
          )}
          {servedAt.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {servedAt.map((place) => (
                <li key={place.id}>
                  <Link
                    to={placeDetailPath(place.kind, place.id)}
                    className="flex h-full items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-[var(--color-primary)] hover:bg-[#edfbf7]"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
                        {place.name}
                        {place.signature && (
                          <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">Món tủ</span>
                        )}
                      </span>
                      {place.address && <span className="mt-0.5 block text-xs text-slate-500">{place.address}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}
    </DetailPageShell>
  );
}
