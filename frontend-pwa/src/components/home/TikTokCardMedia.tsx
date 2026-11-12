import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Play, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import { TikTokLogoIcon } from '@/components/homestay/TikTokEmbedPlayer';
import { mediaUrl } from '@/lib/mediaUrl';
import {
  fetchTikTokOembed,
  normalizeTikTokUrl,
  peekTikTokOembed,
  postTikTokCommand,
  tiktokPlayerSrc,
  tiktokPostId,
  type TikTokOembed,
} from '@/lib/tiktok';

interface TikTokCardMediaProps {
  tiktokUrl?: string | null;
  /** Ảnh bìa địa điểm — chỉ dùng khi không có video (hoặc TikTok không trả ảnh bìa video). */
  coverUrl?: string | null;
  title: string;
  /** Thẻ đang nằm giữa carousel: chỉ thẻ này phát; rời vị trí giữa thì gỡ trình phát (video dừng). */
  active: boolean;
  FallbackIcon: LucideIcon;
  /**
   * Lớp chữ ở đáy khung (tên, nhãn, nút) nằm trên video; nhận nút loa (null khi không phát) để đặt cạnh các nút khác —
   * góc trên để trống cho tên kênh TikTok hiện trong video. Phần trống của lớp nên để pointer-events-none để chạm xuyên
   * xuống video (tạm dừng / phát).
   */
  overlay?: (muteButton: ReactNode) => ReactNode;
}

/** Thẻ giữa đứng yên chừng này mới nạp trình phát — vuốt nhanh qua nhiều thẻ không tải hàng loạt video. */
const AUTOPLAY_DELAY_MS = 700;

/** Khách bật "Tiết kiệm dữ liệu" hoặc giảm chuyển động: không tự phát, bấm mới phát. */
function prefersNoAutoplay(): boolean {
  if (typeof window === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** true khi khung đang hiện trên màn hình (ít nhất một nửa) — cuộn đi chỗ khác thì video dừng. */
function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/**
 * Khung media dọc 9:16 của thẻ trang chủ. Có video TikTok: thẻ giữa (đang hiện trên màn hình) TỰ PHÁT TẮT TIẾNG bằng
 * trình phát chính thức, nút loa để bật tiếng (trong lớp chữ ở đáy, không có lớp chữ thì góc trên trái); một lớp trong
 * suốt phủ lên trình phát để vuốt thẻ vẫn mượt (khung iframe nuốt thao tác vuốt), chạm vào video thì tạm dừng / phát
 * tiếp. Không bao giờ hiện thanh điều khiển của TikTok (lớp chữ ở đáy khung che mất) — bấm phát tay cũng dùng đúng các
 * nút trên, chỉ khác là có tiếng. Nhãn "TikTok" chỉ hiện trên ảnh bìa (video đang phát đã có tên kênh của TikTok). Thẻ
 * hai bên hiện ảnh bìa của chính video. Không có video: ảnh bìa địa điểm. Tiết kiệm dữ liệu / giảm chuyển động: bấm mới
 * phát.
 */
export default function TikTokCardMedia({ tiktokUrl, coverUrl, title, active, FallbackIcon, overlay }: TikTokCardMediaProps) {
  const url = normalizeTikTokUrl(tiktokUrl);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onScreen = useOnScreen(boxRef);
  const [oembed, setOembed] = useState<{ url: string; info: TikTokOembed } | null>(null);
  const [manualPlay, setManualPlay] = useState(false);
  const [settled, setSettled] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [autoplayAllowed] = useState(() => !prefersNoAutoplay());

  // Rời vị trí giữa → gỡ trình phát; quay lại thì phát lại từ đầu, tắt tiếng.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setManualPlay(false);
      setSettled(false);
      setFrameReady(false);
      setMuted(true);
      setPaused(false);
    }
  }

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    void fetchTikTokOembed(url).then((info) => {
      if (alive) setOembed({ url, info });
    });
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (!active || !autoplayAllowed) return undefined;
    const timer = window.setTimeout(() => setSettled(true), AUTOPLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, autoplayAllowed]);

  const info = oembed?.url === url ? oembed.info : (url ? peekTikTokOembed(url) : undefined);
  const postId = url ? tiktokPostId(url) ?? info?.postId ?? null : null;
  const waitingForPoster = !!url && !info;
  const images = [url ? info?.thumbnailUrl : null, mediaUrl(coverUrl)]
    .filter((src): src is string => !!src && !failedImages.includes(src));
  const poster = images[0];

  const autoPlaying = !!postId && active && settled && onScreen;
  const playing = !!postId && active && (manualPlay || autoPlaying);

  // Trình phát báo sẵn sàng → ép tắt tiếng (một số trình duyệt bỏ qua tham số muted).
  useEffect(() => {
    if (!playing) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; value?: unknown } | null;
      if (data?.type === 'onPlayerReady') {
        setFrameReady(true);
        if (!manualPlay) postTikTokCommand(frameRef.current, 'mute');
      } else if (data?.type === 'onMute') {
        setMuted(data.value === true);
      } else if (data?.type === 'onStateChange') {
        setPaused(data.value === 2);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [playing, manualPlay]);

  const toggleMute = () => {
    const next = !muted;
    postTikTokCommand(frameRef.current, next ? 'mute' : 'unMute');
    setMuted(next);
  };
  const togglePause = () => {
    postTikTokCommand(frameRef.current, paused ? 'play' : 'pause');
    setPaused(!paused);
  };

  const muteButton = (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
      aria-pressed={!muted}
      className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-sm transition-colors hover:bg-black/60 cursor-pointer"
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );

  const posterLayer = (
    <>
      {waitingForPoster ? (
        <div className="absolute inset-0 animate-pulse bg-slate-800" />
      ) : poster ? (
        <img
          src={poster}
          alt={title}
          loading="lazy"
          draggable={false}
          onError={() => setFailedImages((list) => [...list, poster])}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <ImagePlaceholder Icon={FallbackIcon} label="Ảnh đang cập nhật" />
      )}
    </>
  );

  return (
    <div ref={boxRef} className="relative aspect-[9/16] w-full overflow-hidden bg-slate-900">
      {posterLayer}
      {playing && postId ? (
        <>
          <iframe
            ref={frameRef}
            src={tiktokPlayerSrc(postId, { autoplay: true, muted: !manualPlay, controls: false, loop: true })}
            title={`Video TikTok về ${title}`}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => window.setTimeout(() => setFrameReady(true), 400)}
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${frameReady ? 'opacity-100' : 'opacity-0'}`}
          />
          {/* Lớp phủ: giữ thao tác vuốt carousel; chạm = tạm dừng / phát tiếp */}
          <button
            type="button"
            onClick={togglePause}
            aria-label={paused ? `Phát tiếp video về ${title}` : `Tạm dừng video về ${title}`}
            className="absolute inset-0 cursor-pointer bg-transparent"
          >
            {paused && (
              <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" />
              </span>
            )}
          </button>
          {!overlay && <div className="absolute left-2.5 top-2.5">{muteButton}</div>}
        </>
      ) : (
        postId && (
          <button
            type="button"
            // Bấm phát tay: phát có tiếng ngay (trình duyệt cho phép vì khách vừa chạm).
            onClick={() => { setManualPlay(true); setMuted(false); }}
            aria-label={`Phát video về ${title}`}
            className="group/play absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/0 to-black/15 cursor-pointer"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition-transform duration-200 group-hover/play:scale-110">
              <Play className="h-6 w-6 translate-x-0.5 fill-current" />
            </span>
          </button>
        )
      )}
      {url && !(playing && frameReady) && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
          <TikTokLogoIcon className="h-3 w-3" /> TikTok
        </span>
      )}
      {overlay?.(playing && postId ? muteButton : null)}
    </div>
  );
}
