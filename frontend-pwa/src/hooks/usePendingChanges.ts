import { useEffect, useState } from 'react';
import { fetchPartnerChangeRequests } from '@/services/changeRequestService';
import { indexPending, NO_PENDING, type PendingIndex } from '@/lib/pendingChanges';

/**
 * Các thay đổi đang chờ Admin duyệt của NCC (một lần tải cho mọi Homestay). Truyền {@code reloadKey} đổi giá trị
 * sau mỗi lần lưu để tag "Chờ duyệt" hiện ngay. Lỗi tải thì coi như không có gì chờ (tag chỉ là thông tin thêm).
 */
export function usePendingChanges(reloadKey: unknown = 0): PendingIndex {
  const [index, setIndex] = useState<PendingIndex>(NO_PENDING);
  useEffect(() => {
    let active = true;
    // Nhãn "đang chờ duyệt" là thông tin phụ: ưu tiên thấp, không chặn dữ liệu chính của trang.
    fetchPartnerChangeRequests('PENDING', 0, 100, 'low')
      .then((page) => { if (active) setIndex(indexPending(page.content)); })
      .catch(() => { /* tag là thông tin phụ: lỗi thì giữ trạng thái cũ */ });
    return () => { active = false; };
  }, [reloadKey]);
  return index;
}
