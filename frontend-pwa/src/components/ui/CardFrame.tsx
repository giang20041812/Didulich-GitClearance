import type { ReactNode } from 'react';

/** Loại khung (giữ để các nơi gọi không phải sửa). Đã bỏ toàn bộ họa tiết trang trí: chỉ còn bọc thẻ. */
export type CardFrameKind = 'house' | 'mountain' | 'food' | 'specialty' | 'transport' | 'service' | 'culture';

export default function CardFrame({ children }: { kind?: CardFrameKind; children: ReactNode }) {
  return <div className="relative flex h-full flex-col"><div className="flex min-h-0 flex-1 flex-col *:flex-1">{children}</div></div>;
}
