import { AlertTriangle, Lightbulb, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { PlaceHighlightItem } from '@/types/homestay';
import DetailSection from '@/components/common/DetailSection';

const GROUPS: { key: 'pro' | 'con' | 'tip'; label: string; Icon: LucideIcon; box: string; head: string; icon: string; text: string; dot: string }[] = [
  { key: 'pro', label: 'Ưu điểm (Pro)', Icon: ThumbsUp, box: 'bg-emerald-50/70 border-emerald-200/80', head: 'text-emerald-800', icon: 'text-emerald-600', text: 'text-emerald-900', dot: 'text-emerald-600' },
  { key: 'con', label: 'Lưu ý (Con)', Icon: AlertTriangle, box: 'bg-rose-50/70 border-rose-200/80', head: 'text-rose-800', icon: 'text-rose-600', text: 'text-rose-900', dot: 'text-rose-600' },
  { key: 'tip', label: 'Mẹo hay (Pro Tip)', Icon: Lightbulb, box: 'bg-amber-50/70 border-amber-200/80', head: 'text-amber-800', icon: 'text-amber-600', text: 'text-amber-900', dot: 'text-amber-600' },
];

/**
 * Kinh nghiệm thực tế của một địa điểm / món đặc sản (ưu điểm • lưu ý • mẹo hay), lấy từ bảng highlight qua API.
 * Không có mục nào thì không hiện gì.
 */
export default function PlaceHighlights({ highlights, variant = 'card', id }: { highlights: PlaceHighlightItem[] | null | undefined; variant?: 'card' | 'flat'; id?: string }) {
  const lists = { pro: [] as string[], con: [] as string[], tip: [] as string[] };
  for (const h of highlights ?? []) {
    if (h.type === 'PRO') lists.pro.push(h.content);
    else if (h.type === 'CON' || h.type === 'PAIN_POINT') lists.con.push(h.content);
    else if (h.type === 'TIP') lists.tip.push(h.content);
  }
  if (lists.pro.length + lists.con.length + lists.tip.length === 0) return null;

  return (
    <DetailSection
      id={id}
      variant={variant}
      icon={Lightbulb}
      eyebrow="Kinh nghiệm thực tế"
      title="Ưu điểm • Mẹo hay • Lưu ý"
      subtitle="Tổng hợp từ phản hồi của du khách và người bản địa"
      tone="sand"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.filter((group) => lists[group.key].length > 0).map(({ key, label, Icon, box, head, icon, text, dot }) => (
          <div key={key} className={`flex flex-col justify-between rounded-xl border bg-white/80 p-4 ${box}`}>
            <div>
              <div className={`flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-2.5 ${head}`}>
                <Icon className={`w-4 h-4 ${icon}`} />
                <span>{label}</span>
              </div>
              <ul className={`space-y-2 text-[13px] leading-relaxed md:text-sm ${text}`}>
                {lists[key].map((item, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className={`font-bold ${dot}`}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
