import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Nút nổi "về đầu trang" — hiện sau khi cuộn xuống quá 600px, cuộn lên đầu bằng mượt.
 * React tự bỏ render khi giá trị không đổi nên listener scroll rẻ.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Về đầu trang"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`back-to-top fixed bottom-6 max-md:[html[data-pwa-bar]_&]:bottom-24 right-5 md:bottom-8 md:right-8 z-[9999] flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-[#0a2e26]/90 text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-[#0a7d64] hover:border-[#0a7d64] hover:shadow-xl active:scale-90 cursor-pointer mb-[var(--safe-bottom)] ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
    </button>
  );
}
