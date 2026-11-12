import { useState, useEffect, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchTikTokOembed, normalizeTikTokUrl, peekTikTokOembed, tiktokHandle, tiktokPlayerSrc, tiktokPostId, type TikTokOembed } from '@/lib/tiktok';

export function TikTokLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.48 6.34 6.34 0 0 0 1.86-4.48V8.71a8.16 8.16 0 0 0 4.71 1.48V6.74a4.85 4.85 0 0 1-.8-.05z" />
    </svg>
  );
}

interface TikTokEmbedPlayerProps {
  url: string;
  /** Tên địa điểm — tiêu đề khung video cho trình đọc màn hình. */
  placeName: string;
  className?: string;
}

/**
 * Video TikTok gọn: khung dọc 9:16 rộng tối đa 300px, dùng trình phát nhúng chính thức (tiktok.com/player/v1 — chỉ
 * video và nút điều khiển, không kèm mô tả / thông tin nhạc), bên dưới là tên kênh + nút mở TikTok. Iframe chỉ tải khi
 * khách cuộn gần tới. Link rút gọn (vt.tiktok.com...) được đổi ra mã bài qua oEmbed; link không phát được (trang
 * kênh...) chỉ hiện thẻ mở TikTok, không chiếm cả khung video trống.
 */
export default function TikTokEmbedPlayer({ url, placeName, className = '' }: TikTokEmbedPlayerProps) {
  const cleanUrl = useMemo(() => normalizeTikTokUrl(url), [url]);
  const directId = tiktokPostId(cleanUrl);
  const [resolved, setResolved] = useState<{ url: string; info: TikTokOembed } | null>(null);

  useEffect(() => {
    if (!cleanUrl || directId) return undefined;
    let alive = true;
    void fetchTikTokOembed(cleanUrl).then((info) => {
      if (alive) setResolved({ url: cleanUrl, info });
    });
    return () => { alive = false; };
  }, [cleanUrl, directId]);

  if (!cleanUrl) return null;

  const oembed = resolved?.url === cleanUrl ? resolved.info : peekTikTokOembed(cleanUrl);
  const postId = directId ?? oembed?.postId ?? null;
  const resolving = !directId && !oembed;
  const handle = tiktokHandle(cleanUrl) ?? oembed?.handle ?? null;

  if (!postId && !resolving) {
    return (
      <a
        href={cleanUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex w-full max-w-[300px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 ${className}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black text-white">
          <TikTokLogoIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Xem video trên TikTok</span>
          <span className="block truncate text-xs text-slate-500">{handle ? `@${handle}` : placeName}</span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
      </a>
    );
  }

  return (
    <figure className={`w-full max-w-[300px] ${className}`}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-black/5">
        {postId ? (
          <iframe
            src={tiktokPlayerSrc(postId)}
            title={`Video TikTok về ${placeName}`}
            loading="lazy"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-slate-800" />
        )}
      </div>
      <figcaption className="mt-2 flex items-center gap-2 text-xs">
        <TikTokLogoIcon className="h-3.5 w-3.5 shrink-0 text-slate-900" />
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{handle ? `@${handle}` : 'TikTok'}</span>
        <a
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--color-primary)] hover:underline"
        >
          Mở TikTok <ExternalLink className="h-3 w-3" />
        </a>
      </figcaption>
    </figure>
  );
}
