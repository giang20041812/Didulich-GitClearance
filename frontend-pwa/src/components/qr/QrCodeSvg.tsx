import { useMemo } from 'react';
import { qrSvgMarkup } from '@/lib/qrSvg';

/** Mã QR dạng SVG co giãn theo khung chứa. */
export default function QrCodeSvg({ text, className = '', label }: { text: string; className?: string; label: string }) {
  const markup = useMemo(() => qrSvgMarkup(text), [text]);
  return (
    <div
      role="img"
      aria-label={label}
      className={`[&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
      // Chuỗi SVG do chính hàm trên dựng từ ma trận số — không chứa dữ liệu người dùng dạng HTML.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
