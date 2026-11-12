import { useSyncExternalStore } from 'react';

/**
 * Khách bật / tắt "Gợi ý khi tôi ở gần điểm đến" (lưu trên máy này). Mặc định TẮT: ứng dụng không xin vị trí khi khách
 * chưa tự bật. Vị trí chỉ dùng trên máy để tính khoảng cách, không gửi lên máy chủ.
 */
const KEY = 'nearby_suggestions';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

let enabled = typeof window === 'undefined' ? false : read();

export function setNearbySuggestions(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn bật trong phiên này.
  }
  listeners.forEach((l) => l());
}

export function useNearbySuggestions() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => enabled,
    () => false,
  );
}

/** Mỗi điểm mốc chỉ nhắc một lần mỗi ngày (theo giờ Việt Nam). */
const SHOWN_KEY = 'nearby_shown';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export function wasShownToday(landmarkId: number): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as { day?: string; ids?: number[] };
    return raw.day === today() && (raw.ids ?? []).includes(landmarkId);
  } catch {
    return false;
  }
}

export function markShown(landmarkId: number) {
  try {
    const raw = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as { day?: string; ids?: number[] };
    const ids = raw.day === today() ? raw.ids ?? [] : [];
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ day: today(), ids: [...new Set([...ids, landmarkId])] }));
  } catch {
    // bỏ qua
  }
}
