import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Home, Plus } from 'lucide-react';
import { fetchPartnerHomestayNames } from '@/services/partnerHomestayService';
import RoomTypesManager from '@/components/partner/RoomTypesManager';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/partner/PartnerUI';
import { ui } from '@/lib/partnerUi';

/** Loại phòng & giá của một Homestay (chọn Homestay ở tiêu đề). Số phòng trống theo ngày nằm ở trang Lịch phòng. */
export default function PartnerRoomsPage() {
  const { id } = useParams<{ id?: string }>();
  const routePlaceId = id ? Number(id) : null;
  const navigate = useNavigate();
  const [placeId, setPlaceId] = useState<number | null>(routePlaceId != null && Number.isFinite(routePlaceId) ? routePlaceId : null);
  const [homestays, setHomestays] = useState<{ id: number; name: string }[] | null>(null);

  useEffect(() => {
    let active = true;
    // Chỉ cần id + tên cho bộ chọn: lấy từ cache của tab (Lịch phòng đã nạp sẵn) hoặc /names (1 câu SQL).
    // Đã có Homestay trên đường dẫn thì danh sách chỉ để chuyển nhanh: ưu tiên thấp, nhường danh sách loại phòng.
    fetchPartnerHomestayNames(routePlaceId != null ? 'low' : 'high')
      .then(items => {
        if (!active) return;
        setHomestays(items);
        setPlaceId(current => current && items.some(h => h.id === current) ? current : items[0]?.id ?? null);
      })
      .catch(() => { if (active) setHomestays([]); /* Bộ chọn Homestay chỉ để chuyển nhanh; lỗi thì ẩn đi. */ });
    return () => { active = false; };
    // Chỉ tải một lần khi mở trang; đổi Homestay trên đường dẫn không cần tải lại danh sách.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (routePlaceId !== null && Number.isFinite(routePlaceId)) setPlaceId(routePlaceId);
  }, [routePlaceId]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        breadcrumbs={[{ label: 'Bảng điều khiển', to: '/partner/overview' }, { label: 'Cơ sở lưu trú', to: '/partner/homestays' }, { label: 'Phòng & giá' }]}
        title={<span className="flex flex-wrap items-center gap-3">
          <span>Loại phòng & giá</span>
          {homestays && homestays.length > 0 && (
            <select aria-label="Chọn Homestay" className={`${ui.select} w-full min-w-0 text-sm font-semibold sm:w-auto sm:max-w-[240px]`} value={placeId ?? ''}
              onChange={(e) => navigate(`/partner/homestay/${e.target.value}/rooms`)}>
              {homestays.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
        </span>}
        description="Khai báo từng loại phòng, khóa / mở nhanh và đặt giá. Số phòng trống và khóa phòng theo từng ngày nằm ở trang Lịch phòng."
        actions={placeId !== null ? <Link to={`/partner?homestay=${placeId}`} className={ui.btnOutline}><CalendarDays className="h-4 w-4" />Xem lịch phòng</Link> : undefined} />

      {homestays === null && placeId === null ? <LoadingBlock label="Đang tải..." rows={2} />
        : placeId === null ? (
          <EmptyState icon={Home} title="Chưa có Homestay nên chưa có phòng" description="Đăng Homestay trước — bạn khai báo luôn loại phòng và giá ngay trong lúc đăng."
            action={<Link to="/partner/homestay/create" className={ui.btnCoral}><Plus className="h-4 w-4" />Đăng Homestay</Link>} />
        ) : <RoomTypesManager key={placeId} placeId={placeId} showAvailability />}
    </div>
  );
}
