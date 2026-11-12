import { qrSvgMarkup } from '@/lib/qrSvg';

/**
 * Vẽ QR code ngay trong trình duyệt bằng lib QR nội bộ (lib/qrSvg.ts — qrcode-generator, ~10KB,
 * đồng bộ, không mạng). Thay cho api.qrserver.com (service ngoài có rate limit, chặn khi mạng yếu).
 * Cùng giao diện: một thẻ nền trắng đúng khung.
 */
export default function ClientQrCode({ value, alt }: { value: string; alt: string; size?: number }) {
  const markup = qrSvgMarkup(value);
  return (
    <div
      role="img"
      aria-label={alt}
      title={alt}
      className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
