import { ExternalLink } from 'lucide-react';
import { BRAND_NAME } from '@/components/ui/logo';
import { mediaUrl } from '@/lib/mediaUrl';
import { PHOTO_CREDITS, PHOTO_FIT_LABEL, type PhotoFit } from '@/lib/photoCredits';

const GROUPS: { fit: PhotoFit; title: string; note: string }[] = [
  { fit: 'exact', title: 'Ảnh đúng địa điểm, món ăn, lễ hội', note: 'Ảnh chụp tại chính nơi đó hoặc đúng món đó.' },
  {
    fit: 'area',
    title: 'Ảnh khu vực',
    note: 'Chưa tìm được ảnh có giấy phép mở chụp đúng địa điểm nên dùng ảnh cùng xã / huyện, có ghi rõ trong chú thích.',
  },
  {
    fit: 'illustration',
    title: 'Ảnh minh họa',
    note: 'Minh họa món ăn hoặc dịch vụ (ví dụ món gà đen, xe ôm), không phải ảnh của một quán hay nhà xe cụ thể.',
  },
];

/** Trang "Nguồn ảnh": tác giả, giấy phép và nơi dùng của từng ảnh thật trong dữ liệu mẫu và giao diện. */
export default function PhotoCreditsPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-14 pt-6 md:px-8">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-extrabold text-ink-deep sm:text-3xl">Nguồn ảnh</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Ảnh phong cảnh, món ăn và lễ hội trên {BRAND_NAME} là ảnh thật lấy từ Wikimedia Commons và Flickr, theo giấy phép mở
          (CC0, phạm vi công cộng, CC BY, CC BY-SA). Dưới đây là tác giả, giấy phép và đường dẫn gốc của từng ảnh. Ảnh do chủ
          homestay, nhà xe tự tải lên thuộc về họ và không nằm trong danh sách này.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Một số điểm như Rừng trúc Mồ Dề, Đồi Kim Nọi chưa có ảnh với giấy phép mở nên tạm hiện ô trống thay vì dùng ảnh nơi khác.
        </p>
      </header>

      {GROUPS.map((group) => {
        const items = PHOTO_CREDITS.filter((c) => c.fit === group.fit);
        if (items.length === 0) return null;
        return (
          <section key={group.fit} className="mt-8" aria-labelledby={`nhom-${group.fit}`}>
            <h2 id={`nhom-${group.fit}`} className="text-lg font-bold text-ink-deep">
              {group.title} <span className="text-sm font-medium text-slate-500">({items.length})</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">{group.note}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {items.map((c) => (
                <li key={c.key} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <img
                    src={mediaUrl(c.thumb, 330)}
                    alt={c.subject}
                    loading="lazy"
                    className="h-20 w-28 shrink-0 rounded-lg bg-slate-100 object-cover"
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold leading-snug text-slate-900">{c.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Dùng cho: {c.usedFor.join(', ')}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                      Tác giả: {c.author} ·{' '}
                      <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer license" className="font-medium text-primary underline-offset-2 hover:underline">
                        {c.license}
                      </a>{' '}
                      ·{' '}
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline">
                        {c.source}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </p>
                    <p className="sr-only">Mức khớp: {PHOTO_FIT_LABEL[c.fit]}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
