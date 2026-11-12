import PartnerBookingList from '@/components/partner/PartnerBookingList';
import { PageHeader } from '@/components/partner/PartnerUI';

export default function PartnerBookingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Bảng điều khiển', to: '/partner/overview' }, { label: 'Đơn đặt phòng' }]}
        title="Đơn đặt phòng"
        description="Đơn mới: Xác nhận hoặc Từ chối. Đơn đã xác nhận: bấm Đã thanh toán khi nhận được tiền, hoặc Hủy đơn."
      />
      <PartnerBookingList />
    </div>
  );
}
