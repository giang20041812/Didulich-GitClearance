/**
 * Video TikTok của địa điểm: chuẩn hoá link, lấy mã bài, đổi link rút gọn (vt.tiktok.com...) ra mã bài + ảnh bìa dọc qua
 * oEmbed, dựng địa chỉ trình phát nhúng chính thức (tiktok.com/player/v1 — chỉ video và nút điều khiển).
 */

/** Mã bài TikTok (video hoặc ảnh) trong đường dẫn: /@kenh/video/123..., /@kenh/photo/123..., /v/123.html. */
const POST_ID = /\/(?:video|photo|v)\/(\d+)/i;
const HANDLE = /tiktok\.com\/@([\w.]+)/i;

export function normalizeTikTokUrl(raw?: string | null): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('@')) return `https://www.tiktok.com/${trimmed}`;
  return `https://${trimmed}`;
}

export const tiktokPostId = (url: string): string | null => url.match(POST_ID)?.[1] ?? null;
export const tiktokHandle = (url: string): string | null => url.match(HANDLE)?.[1] ?? null;

export interface TikTokOembed {
  postId: string | null;
  handle: string | null;
  /** Ảnh bìa dọc của video — link ký số của TikTok, hết hạn sau một thời gian nên chỉ giữ trong tab. */
  thumbnailUrl: string | null;
}

function readOembed(value: unknown): TikTokOembed {
  const data = typeof value === 'object' && value !== null
    ? value as { embed_product_id?: unknown; author_unique_id?: unknown; thumbnail_url?: unknown }
    : {};
  const text = (field: unknown) => (typeof field === 'string' && field ? field : null);
  const postId = text(data.embed_product_id);
  const thumbnailUrl = text(data.thumbnail_url);
  return {
    postId: postId && /^\d+$/.test(postId) ? postId : null,
    handle: text(data.author_unique_id),
    thumbnailUrl: thumbnailUrl?.startsWith('https://') ? thumbnailUrl : null,
  };
}

const pending = new Map<string, Promise<TikTokOembed>>();
const resolved = new Map<string, TikTokOembed>();
/** TikTok đôi khi treo / chặn yêu cầu: quá thời gian này thì thôi chờ, thẻ hiện ảnh bìa địa điểm. */
const OEMBED_TIMEOUT_MS = 4000;

/** Kết quả oEmbed đã có trong tab — vẽ ngay ảnh bìa khi thẻ dựng lại, không chớp. */
export const peekTikTokOembed = (url: string): TikTokOembed | undefined => resolved.get(url);

/**
 * oEmbed của TikTok (cho gọi thẳng từ trình duyệt). Mỗi link chỉ hỏi một lần mỗi tab; lỗi mạng hoặc TikTok báo quá tải
 * ("overload-protect", không phải JSON) trả kết quả rỗng và lần sau được hỏi lại.
 */
export function fetchTikTokOembed(url: string): Promise<TikTokOembed> {
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(OEMBED_TIMEOUT_MS) : undefined;
  const request = fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal })
    .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
    .catch(() => null)
    .then((data) => {
      const info = readOembed(data);
      if (info.postId || info.thumbnailUrl) resolved.set(url, info);
      else pending.delete(url);
      return info;
    });
  pending.set(url, request);
  return request;
}

export interface TikTokPlayerOptions {
  autoplay?: boolean;
  /** Tắt tiếng sẵn — trình duyệt chỉ cho tự phát khi tắt tiếng. */
  muted?: boolean;
  /** false = ẩn thanh điều khiển của TikTok (thẻ trang chủ tự vẽ nút loa). Mặc định hiện. */
  controls?: boolean;
  loop?: boolean;
}

/** Trình phát nhúng chính thức: chỉ video + nút điều khiển (ẩn mô tả, thông tin nhạc, video liên quan). */
export function tiktokPlayerSrc(postId: string, options: TikTokPlayerOptions = {}): string {
  const params = new URLSearchParams({ description: '0', music_info: '0', rel: '0' });
  if (options.autoplay) params.set('autoplay', '1');
  if (options.muted) params.set('muted', '1');
  if (options.controls === false) {
    params.set('controls', '0');
    params.set('progress_bar', '0');
    params.set('play_button', '0');
    params.set('volume_control', '0');
    params.set('fullscreen_button', '0');
    params.set('timestamp', '0');
  }
  if (options.loop) params.set('loop', '1');
  return `https://www.tiktok.com/player/v1/${postId}?${params.toString()}`;
}

/** Điều khiển trình phát TikTok qua postMessage (chuẩn của player/v1). Khung chưa sẵn sàng thì bỏ qua. */
export function postTikTokCommand(frame: HTMLIFrameElement | null, type: 'play' | 'pause' | 'mute' | 'unMute'): void {
  frame?.contentWindow?.postMessage({ 'x-tiktok-player': true, type, value: undefined }, 'https://www.tiktok.com');
}
