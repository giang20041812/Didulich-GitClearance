import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import CompactPlaceCard, { CompactCardBadge } from '@/components/ui/CompactPlaceCard';
import { COMPACT_GRID_FULL, formatVnd } from '@/lib/compactCard';
import { apiOrigin } from '@/lib/apiBase';
import { placeDetailPath } from '@/lib/placeRoutes';

interface ExperienceItem {
  id: number;
  name: string;
  coverImageUrl?: string | null;
  priceRefMin?: number | null;
  address?: string | null;
  attributes?: Record<string, unknown>;
}

/**
 * "Trải nghiệm bản địa" trên trang Văn hóa: trải nghiệm do nhà cung cấp đăng (trekking, làm nghề, ẩm thực…) đã được duyệt,
 * có thông tin dịch vụ. Chưa có trải nghiệm nào thì không hiện mục.
 */
export default function LocalExperiencesSection() {
  const [items, setItems] = useState<ExperienceItem[]>([]);

  useEffect(() => {
    let alive = true;
    const url = new URL('/api/public/places', apiOrigin());
    url.searchParams.set('kind', 'CULTURE');
    url.searchParams.set('size', '50');
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : { content: [] }))
      .then((data: { content?: ExperienceItem[] }) => {
        if (alive) setItems((data.content ?? []).filter((p) => typeof p.attributes?.categoryGroup === 'string'));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (items.length === 0) return null;
  const text = (p: ExperienceItem, key: string) => (typeof p.attributes?.[key] === 'string' ? (p.attributes[key] as string) : '');

  return (
    <section aria-labelledby="local-experiences" className="mb-8">
      <h2 id="local-experiences" className="mb-1 flex items-center gap-2 text-lg font-bold text-[var(--color-ink-deep)]">
        <Compass className="h-5 w-5 text-[var(--color-primary)]" /> Trải nghiệm bản địa
      </h2>
      <p className="mb-4 text-sm text-slate-600">Đi bộ qua bản, làm nghề, nấu món địa phương cùng người dân — do nhà cung cấp tại chỗ tổ chức.</p>
      <div className={COMPACT_GRID_FULL}>
        {items.map((p) => {
          const rawLanguages = p.attributes?.languages;
          const languages = Array.isArray(rawLanguages) ? rawLanguages.join(', ') : '';
          const unit = text(p, 'priceDetails').replace(/^\/\s*/, '');
          return (
            <CompactPlaceCard
              frame="culture"
              compact
              key={p.id}
              to={placeDetailPath('CULTURE', p.id)}
              name={p.name}
              imageUrl={p.coverImageUrl ?? ''}
              FallbackIcon={Compass}
              location={[text(p, 'duration'), languages].filter(Boolean).join(' · ') || p.address || ''}
              price={formatVnd(p.priceRefMin)}
              priceUnit={unit || 'khách'}
              badge={text(p, 'categoryGroupName') ? (
                <CompactCardBadge className="bg-[var(--color-primary)]"><span className="truncate">{text(p, 'categoryGroupName')}</span></CompactCardBadge>
              ) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
