import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { partnerRoomService } from '@/services/partnerRoomService';
import { homestayError } from '@/services/partnerHomestayService';
import type { HomestayChangeLog } from '@/types/room';

const ACTION_LABEL: Record<string, string> = {
  ROOM_CREATE: 'Tạo loại phòng',
  ROOM_UPDATE: 'Sửa loại phòng',
  SPECIAL_PRICE_CREATE: 'Thêm giá theo thời điểm',
  SPECIAL_PRICE_UPDATE: 'Sửa giá theo thời điểm',
  SPECIAL_PRICE_DELETE: 'Xóa giá theo thời điểm',
  INVENTORY_UPDATE: 'Cập nhật lịch phòng',
  UNIT_LOCK: 'Khóa phòng',
  UNIT_UNLOCK: 'Mở phòng',
  HOMESTAY_CLOSE_DAYS: 'Ngừng phục vụ Homestay',
  HOMESTAY_OPEN_DAYS: 'Mở lại nhận khách',
};
const FIELD_LABEL: Record<string, string> = {
  name: 'Tên', status: 'Trạng thái', totalRoomCount: 'Số phòng', maxOccupancy: 'Sức chứa', basePrice: 'Giá cơ bản',
  weekendPrice: 'Giá cuối tuần', price: 'Giá', periodStart: 'Từ ngày', periodEnd: 'Đến ngày', startDate: 'Từ ngày',
  endDate: 'Đến ngày (không gồm)', totalRooms: 'Số phòng mở bán', stopSell: 'Ngừng bán', roomTypes: 'Số loại phòng', stayDate: 'Ngày', unitNo: 'Phòng số',
};
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : String(v));

/** NFR-AUD-02: 100 thay đổi gần nhất về giá, số phòng, lịch bán của Homestay. */
export default function HomestayChangeLogPanel({ placeId, refreshKey = 0 }: { placeId: number; refreshKey?: number }) {
  const [items, setItems] = useState<HomestayChangeLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    partnerRoomService.changeLog(placeId)
      .then((data) => { if (active) { setItems(data); setError(''); } })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [placeId, refreshKey]);

  if (loading) return <p role="status" className="text-sm text-muted">Đang tải lịch sử...</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!items.length) return <p className="text-sm text-muted">Chưa có thay đổi nào được ghi nhận.</p>;
  return (
    <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto border-l border-border pl-4">
      {items.map((item) => {
        const keys = [...new Set([...Object.keys(item.before ?? {}), ...Object.keys(item.after ?? {})])]
          .filter((k) => show(item.before?.[k]) !== show(item.after?.[k]));
        return (
          <li key={item.id} className="text-sm">
            <p className="flex items-center gap-2 font-semibold text-ink-deep"><History className="h-3.5 w-3.5 text-muted" />{ACTION_LABEL[item.action] ?? item.action}</p>
            <p className="text-xs text-muted">{new Date(item.createdAt).toLocaleString('vi-VN')}{item.reason ? ` · Lý do: ${item.reason}` : ''}</p>
            {keys.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink">
                {keys.map((k) => (
                  <li key={k}>{FIELD_LABEL[k] ?? k}: {item.before ? <><span className="text-muted line-through">{show(item.before[k])}</span> → </> : null}<b>{show(item.after?.[k])}</b></li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
