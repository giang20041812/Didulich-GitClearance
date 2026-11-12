import { useEffect, useRef } from 'react';
import { HERO_FALLBACK_SRC, HERO_SIZES, HERO_SRCSET } from '@/lib/heroImages';

/**
 * Nền hero trang chủ: ảnh ruộng bậc thang cũ, thêm chuyển động bám theo chính các chi tiết trong ảnh.
 *
 * Mọi lớp hiệu ứng nằm trong một "khung" cùng tỉ lệ 16:9 với ảnh và phủ kín vùng hero (như object-fit: cover),
 * nên vị trí theo % luôn trùng với ảnh ở mọi kích thước màn hình:
 * - cả khung trôi chậm (Ken Burns). Không còn parallax khi cuộn: transform đặt bằng JS theo từng sự kiện cuộn luôn trễ
 *   một nhịp so với luồng cuộn của trình duyệt nên ảnh nền rung, cuộn lên xuống qua hero bị giật;
 * - mặt trời ở góc phải (88%, 28,5%) sáng lên rồi dịu xuống, các tia nắng xoay rất chậm;
 * - hai dải mây trong thung lũng (cao 29–38%) lững lờ trôi ngang;
 * - một vệt nắng lướt qua ruộng lúa như gió thổi; khóm lúa cao góc phải đung đưa từ gốc.
 * Người dùng chọn giảm chuyển động: tất cả đứng yên (xem globals.css). Hero cuộn khuất thì dừng mọi chuyển động nền (data-paused) cho phần dưới trang cuộn mượt.
 */
export default function HeroBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Dừng animation ngay khi người dùng bắt đầu cuộn (không đợi hero khuất hẳn): đang cuộn mà 7 lớp nền còn chạy thì
    // tranh luồng vẽ với việc cuộn → giật. Về lại đầu trang thì chạy tiếp.
    // Không ẩn hero (visibility: hidden) khi cuộn khuất: trình duyệt bỏ luôn ảnh đã vẽ, cuộn lại lên thì ảnh nền phải giải
    // mã + vẽ lại → thấy như ảnh "tải lại". Dừng animation là đủ nhẹ.
    let visible = true;
    const update = () => {
      root.toggleAttribute('data-paused', !visible || window.scrollY > 24);
    };
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; update(); })
      : null;
    io?.observe(root);
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => { io?.disconnect(); window.removeEventListener('scroll', update); };
  }, []);


  return (
    <div ref={rootRef} className="hero-backdrop absolute inset-0 z-0 overflow-hidden bg-[#07362c]">
      <div className="absolute inset-0">
        <div className="hero-stage">
          <img
            src={HERO_FALLBACK_SRC}
            srcSet={HERO_SRCSET}
            sizes={HERO_SIZES}
            alt="Ruộng bậc thang mùa lúa chín giữa núi rừng Tây Bắc"
            fetchPriority="high"
            decoding="async"
            data-no-skeleton
            className="absolute inset-0 h-full w-full"
          />
          <img src={HERO_FALLBACK_SRC} srcSet={HERO_SRCSET} sizes={HERO_SIZES} alt="" aria-hidden data-no-skeleton className="hero-grass" />
          <div className="hero-sun" aria-hidden />
          <div className="hero-rays" aria-hidden />
          <div className="hero-cloud hero-cloud-a" aria-hidden />
          <div className="hero-cloud hero-cloud-b" aria-hidden />
          <div className="hero-breeze" aria-hidden>
            <span />
          </div>
        </div>
      </div>
      {/* Phủ tối: bên trái cho chữ dễ đọc, đỉnh cho header trong suốt, đáy chuyển dần sang xanh rừng đậm để khối tìm kiếm nổi
          lên và mép cong của phần nội dung bên dưới không bị gắt. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#04241d]/70 via-[#04241d]/25 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-[#062a22]/85" aria-hidden />
    </div>
  );
}
