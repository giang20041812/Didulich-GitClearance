import { Navigate } from 'react-router-dom';
import { portalServiceType } from '@/lib/partnerServiceType';
import PartnerCalendarPage from './PartnerCalendarPage';

/**
 * Trang mặc định sau khi NCC đăng nhập: chủ homestay vào thẳng Lịch phòng (việc làm hằng ngày); nhà xe / nhà cung cấp
 * trải nghiệm không có phòng nên vào Tổng quan dịch vụ.
 */
export default function PartnerHome() {
  return portalServiceType() === 'HOMESTAY' ? <PartnerCalendarPage /> : <Navigate to="/partner/services" replace />;
}
