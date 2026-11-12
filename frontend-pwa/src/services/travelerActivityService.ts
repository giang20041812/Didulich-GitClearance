import { apiOrigin } from '@/lib/apiBase';

// Chặn request trùng do render lại; backend cũng gộp lượt xem cùng homestay trong một phút.
const recentViews = new Map<string, number>();
const pendingViews = new Set<string>();

/** Chỉ gọi khi khách đang nhìn trang chi tiết đã tải xong; lỗi ghi nhận không làm gián đoạn xem phòng. */
export async function recordHomestayView(placeId: number): Promise<void> {
  let key: string | undefined;
  let ownsPending = false;
  try {
    const token = localStorage.getItem('traveler_token');
    if (!token || document.visibilityState !== 'visible') return;
    const user = JSON.parse(localStorage.getItem('traveler_user') || 'null') as { email?: string } | null;
    if (!user?.email) return;
    key = `${user.email}:${placeId}`;
    if (pendingViews.has(key) || Date.now() - (recentViews.get(key) ?? 0) < 60_000) return;
    pendingViews.add(key);
    ownsPending = true;
    const response = await fetch(new URL(`/api/v1/traveler/activity/homestays/${placeId}/view`, apiOrigin()), {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      recentViews.set(key, Date.now());
      if (recentViews.size > 100) recentViews.delete(recentViews.keys().next().value!);
    }
  } catch { /* Ghi nhận hoạt động không ảnh hưởng thao tác của khách. */ }
  finally { if (key && ownsPending) pendingViews.delete(key); }
}
