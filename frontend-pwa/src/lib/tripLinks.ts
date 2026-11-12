/**
 * Link mở trang tạo lịch trình (/lich-trinh/tao) kèm bối cảnh chuyến đi: tỉnh / thành, ngày đi – về, số người, homestay
 * khách đang xem (ô "Chỗ ở" đưa lên đầu gợi ý), đơn cần gắn khi lưu; tùy chọn tiêu chí đã chọn (thời gian, ăn uống, trải
 * nghiệm) và lịch trình gợi ý mở sẵn. Dùng ở SearchHub, trang homestay, đơn đặt phòng — tách khỏi lib/tripPlanner để các
 * trang này không kéo theo phần chọn tiêu chí (không import lúc chạy).
 */
export interface TripLinkContext {
  province?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
  /** Homestay khách đang xem. */
  stay?: number | string | null;
  /** Mã đơn: lưu lịch trình xong tự gắn vào đơn này. */
  forBooking?: string | null;
  /** Mã lịch trình gợi ý mở sẵn (?tpl=); bỏ trống = theo tiêu chí. */
  template?: string | null;
  /** Thời gian đã chọn (?d=), vd "2-1" = 2N1Đ. */
  duration?: string | null;
  /** Tag ăn uống đã chọn (?an=). */
  dining?: string | null;
  /** Tag trải nghiệm đã chọn (?mt=, cách nhau dấu phẩy). */
  goals?: string[] | null;
}

export function tripPlannerPath(context: TripLinkContext = {}): string {
  const params = new URLSearchParams();
  const province = context.province?.trim();
  if (province) params.set('province', province);
  if (context.checkIn && context.checkOut) {
    params.set('checkIn', context.checkIn);
    params.set('checkOut', context.checkOut);
  }
  if (context.guests && context.guests > 0) params.set('guests', String(Math.round(context.guests)));
  if (context.stay) params.set('stay', String(context.stay));
  if (context.forBooking) params.set('forBooking', context.forBooking);
  if (context.duration) params.set('d', context.duration);
  if (context.dining) params.set('an', context.dining);
  const goals = (context.goals ?? []).filter(Boolean);
  if (goals.length > 0) params.set('mt', goals.join(','));
  if (context.template && context.template !== 'blank') params.set('tpl', context.template);
  const query = params.toString();
  return query ? `/lich-trinh/tao?${query}` : '/lich-trinh/tao';
}
