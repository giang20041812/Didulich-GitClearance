/**
 * Chuyển URL ảnh media (Supabase Storage) sang đường dẫn proxy cùng origin của Vercel.
 *
 * Supabase trả ảnh với `cache-control: no-cache` — trình duyệt phải hỏi lại TỪNG ảnh mỗi lần vào
 * (mỗi lần hỏi tốn một vòng mạng dù được trả 304). Đi qua rewrite của vercel.json thì:
 * - ảnh được phục vụ từ edge toàn cầu của Vercel và CACHE TẠI EDGE (CDN-Cache-Control s-maxage=1 ngày):
 *   15 ảnh cùng lúc cũng chỉ có 1 request xuống Supabase, còn lại lấy ở edge;
 * - cùng origin với app nên tái dùng kết nối HTTP/2 sẵn có, không tốn DNS+TLS mới;
 * - vercel.json gắn `cache-control: immutable 1 năm` — an toàn vì mỗi lần upload là tên file UUID mới
 *   (SupabaseStorageService), URL cũ không bao giờ đổi nội dung.
 *
 * Hai đường dẫn:
 * - `/media/...`  → bản gốc byte-đúng (object endpoint).
 * - `/imgc/...?width=&quality=&format=webp` → biến thể nén/resize tại Supabase Image Transformation
 *   (render endpoint) cho thumbnail card / srcset — tránh tải bản 1920px cho ô ảnh nhỏ.
 *
 * Ảnh có giấy phép mở lấy từ Wikimedia Commons / Flickr (dữ liệu mẫu, xem trang /nguon-anh):
 * - Commons chỉ phục vụ ảnh thu nhỏ ở vài bề rộng chuẩn (330, 500, 960, 1280, 1920) — chọn bậc nhỏ nhất
 *   đủ rộng nhưng không vượt bản đã lưu (bản lưu là bản lớn nhất có sẵn).
 * - Flickr có các cỡ cố định theo hậu tố (_n 320, _z 640, _b 1024) dùng chung một mã bí mật.
 *
 * URL khác (Cloudinary cũ, ảnh cùng origin...) trả về nguyên văn.
 */

const SUPABASE_MEDIA = /^https:\/\/mbmliqykqjufvngjvdjx\.supabase\.co\/storage\/v1\/object\/public\/viettrek-media\/(.+)$/;
const COMMONS_THUMB = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)(\d+)px-([^/]+)$/;
const COMMONS_STEPS = [330, 500, 960, 1280, 1920];
const FLICKR = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_[nzb])?\.jpg$/;
const FLICKR_SIZES: [number, string][] = [[320, '_n'], [640, '_z'], [1024, '_b']];
const FLICKR_LARGEST = FLICKR_SIZES[FLICKR_SIZES.length - 1]!;

function commonsAt(match: RegExpMatchArray, width: number): string {
  const stored = Number(match[2]);
  const step = COMMONS_STEPS.find((s) => s >= width && s <= stored) ?? stored;
  return `${match[1]}${step}px-${match[3]}`;
}

function flickrAt(match: RegExpMatchArray, width: number): string {
  const size = FLICKR_SIZES.find(([w]) => w >= width) ?? FLICKR_LARGEST;
  return `${match[1]}${size[1]}.jpg`;
}

export function mediaUrl(url?: string | null, width?: number): string | undefined {
  if (!url) return url ?? undefined;
  const commons = url.match(COMMONS_THUMB);
  if (commons) return width ? commonsAt(commons, width) : url;
  const flickr = url.match(FLICKR);
  if (flickr) return width ? flickrAt(flickr, width) : url;
  const match = url.match(SUPABASE_MEDIA);
  if (!match) return url;
  if (!width) return `/media/${match[1]}`;
  const params = new URLSearchParams({ width: String(width), quality: '60', format: 'webp' });
  return `/imgc/${match[1]}?${params}`;
}

/** Bộ biến thể cho srcset của thẻ ảnh: trình duyệt tự chọn theo mật độ màn hình / bề rộng thực. */
export function mediaSrcSet(url?: string | null): string | undefined {
  if (!url) return undefined;
  const commons = url.match(COMMONS_THUMB);
  if (commons) {
    const stored = Number(commons[2]);
    return [500, 960, 1280]
      .filter((w) => w <= stored)
      .map((w) => `${commonsAt(commons, w)} ${w}w`)
      .join(', ') || undefined;
  }
  const flickr = url.match(FLICKR);
  if (flickr) return FLICKR_SIZES.map(([w]) => `${flickrAt(flickr, w)} ${w}w`).join(', ');
  if (!url.match(SUPABASE_MEDIA)) return undefined;
  return [420, 640]
    .map((w) => `${mediaUrl(url, w)} ${w}w`)
    .join(', ');
}
