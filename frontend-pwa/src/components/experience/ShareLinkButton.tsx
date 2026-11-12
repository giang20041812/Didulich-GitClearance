import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { journeyShareUrl } from '@/services/journeyService';

interface ShareLinkButtonProps {
  token: string;
  title: string;
  /** row: dòng thao tác của bài · large: nút lớn cuối bài. */
  variant?: 'row' | 'large';
  className?: string;
}

/** "Chia sẻ" một lịch trình công khai: điện thoại mở bảng chia sẻ của máy, máy tính chép link vào bộ nhớ tạm. */
export default function ShareLinkButton({ token, title, variant = 'row', className = '' }: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const share = async () => {
    const url = journeyShareUrl(token);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: 'Hành trình Mù Cang Chải đáng tham khảo — xem lộ trình và ảnh check-in nhé!', url });
        return;
      } catch (err) {
        // Khách tự đóng bảng chia sẻ: thôi. Lỗi khác (trình duyệt chặn): chép link.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Sao chép link hành trình:', url);
    }
  };

  const icon = copied ? <Check className="h-[18px] w-[18px] text-[#0a7d64]" aria-hidden /> : <Share2 className="h-[18px] w-[18px]" aria-hidden />;
  const text = copied ? 'Đã chép link' : 'Chia sẻ';
  return variant === 'large' ? (
    <button
      type="button"
      onClick={() => { void share(); }}
      className={`inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-300 transition-colors hover:text-[#0a7d64] hover:ring-[#0a7d64]/50 cursor-pointer ${className}`}
    >
      {icon} {text}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => { void share(); }}
      className={`-mx-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full px-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-[#0a7d64] cursor-pointer ${className}`}
    >
      {icon} {text}
    </button>
  );
}
