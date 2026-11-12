import { useEffect, useRef, useState } from 'react';

interface TypeTextProps {
  text: string;
  /** Chờ bao lâu (ms) sau khi vào khung nhìn mới bắt đầu gõ. */
  delay?: number;
  /** Thời gian gõ mỗi ký tự (ms). */
  speed?: number;
  /** Cuộn ra khỏi khung nhìn thì xóa, cuộn tới lại thì gõ lại. */
  repeat?: boolean;
  className?: string;
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Chữ được "gõ" ra từng ký tự khi cuộn tới, kèm con trỏ nhấp nháy. Bản đầy đủ nằm ẩn bên dưới để giữ chỗ (không đẩy bố
 * cục khi chữ dài ra) và cho trình đọc màn hình đọc trọn câu. Giảm chuyển động / không có IntersectionObserver: hiện ngay.
 */
export default function TypeText({ text, delay = 0, speed = 28, repeat = true, className = '' }: TypeTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const [inView, setInView] = useState(false);
  const [instant] = useState(() => typeof window === 'undefined' || !('IntersectionObserver' in window) || reduceMotion());

  useEffect(() => {
    const el = ref.current;
    if (!el || instant) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          // Chỉ gõ một lần: thôi theo dõi, khỏi tính giao cắt cho phần tử này ở mỗi khung hình cuộn.
          if (!repeat) io.disconnect();
        } else if (repeat) {
          setInView(false);
          setShown(0);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [instant, repeat]);

  useEffect(() => {
    if (instant) return undefined;
    if (!inView) return undefined;
    let timer = 0;
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(i);
      if (i < text.length) timer = window.setTimeout(tick, speed);
    };
    timer = window.setTimeout(tick, delay);
    return () => window.clearTimeout(timer);
  }, [inView, instant, text, delay, speed]);

  const count = instant ? text.length : shown;
  const typing = !instant && inView && count < text.length;
  const done = !instant && count >= text.length;

  return (
    <span ref={ref} className={`relative block ${className}`}>
      <span aria-hidden className="invisible">{text}</span>
      <span aria-hidden className="absolute inset-0">
        {text.slice(0, count)}
        {!instant && <span className={`type-caret ${typing ? 'is-typing' : ''} ${done ? 'is-done' : ''}`} />}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
