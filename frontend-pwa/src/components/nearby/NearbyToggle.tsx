import { useState } from 'react';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { setNearbySuggestions, useNearbySuggestions } from '@/lib/nearbyPrefs';
import nearbyImage from '@/assets/fluent/nearby.webp';

/**
 * Công tắc "Gợi ý khi tôi ở gần điểm đến" (menu ☰). Bật thì trình duyệt hỏi quyền vị trí ngay lúc đó; khách từ chối thì
 * công tắc tự tắt và báo cách bật lại. Vị trí chỉ dùng trên máy, không gửi lên máy chủ.
 */
export default function NearbyToggle() {
  const on = useNearbySuggestions();
  const [message, setMessage] = useState('');

  const change = (next: boolean) => {
    setMessage('');
    if (!next) { setNearbySuggestions(false); return; }
    if (!('geolocation' in navigator)) { setMessage('Trình duyệt này không hỗ trợ lấy vị trí.'); return; }
    navigator.geolocation.getCurrentPosition(
      () => setNearbySuggestions(true),
      () => setMessage('Bạn chưa cho phép vị trí. Hãy cho phép trong cài đặt trình duyệt rồi bật lại.'),
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="mx-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex items-center gap-3">
        <img src={nearbyImage} alt="" aria-hidden width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
        <span id="nearby-toggle-label" className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-slate-800 sm:text-[13px]">Gợi ý quanh đây</span>
          <span className="block text-[11px] text-slate-500">Báo khi bạn tới gần điểm nổi tiếng. Vị trí chỉ dùng trên máy bạn.</span>
        </span>
        <ToggleSwitch checked={on} onChange={change} labelledBy="nearby-toggle-label" showState={false} />
      </div>
      {message && <p role="alert" className="mt-2 text-[11px] text-danger">{message}</p>}
    </div>
  );
}
