import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/distance';

export type PositionState =
  | { status: 'locating' }
  | { status: 'ready'; position: LatLng }
  | { status: 'error'; reason: 'denied' | 'unavailable' };

/** Vị trí lấy được gần nhất trong tab: mở "Gần tôi" ở mục khác không hỏi lại trình duyệt. */
let lastFix: { position: LatLng; at: number } | null = null;
const FIX_TTL_MS = 5 * 60_000;

const freshFix = () => (lastFix && Date.now() - lastFix.at < FIX_TTL_MS ? lastFix.position : null);

/**
 * Vị trí hiện tại của khách — chỉ dùng trên máy, không gửi lên máy chủ. Gọi khi khách đã bấm "Gần tôi" (trình duyệt
 * hỏi quyền ngay lúc đó); retry() để hỏi lại sau khi khách bật quyền vị trí.
 */
export function useCurrentPosition() {
  const [state, setState] = useState<PositionState>(() => {
    const position = freshFix();
    return position ? { status: 'ready', position } : { status: 'locating' };
  });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', reason: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastFix = { position, at: Date.now() };
        setState({ status: 'ready', position });
      },
      (error) => setState({ status: 'error', reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: FIX_TTL_MS },
    );
  }, []);

  // Lần đầu (chưa có vị trí trong tab): hỏi ngay — kết quả về bất đồng bộ qua callback.
  const asked = useRef(freshFix() !== null);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    request();
  }, [request]);

  const retry = useCallback(() => {
    setState({ status: 'locating' });
    request();
  }, [request]);

  return { state, retry };
}
