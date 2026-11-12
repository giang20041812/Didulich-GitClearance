import axios from 'axios';
import type { CheckinQrView, QrPlaceView, QrStaysView, StayView } from '@/types/booking';

/**
 * Nhận phòng bằng mã QR tĩnh dán tại homestay. Khách: xem homestay của mã (công khai), xem đơn của mình ở đó, bấm
 * "Nhận phòng". Admin / NCC: lấy mã QR của homestay để in.
 */
const travelerHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('traveler_token') ?? ''}` });
const portalHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` });

/** Mã in dưới QR: 8 ký tự, hiện thành "K7M2-PX9Q" cho dễ đọc. */
export const formatCheckinCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/**
 * Đường dẫn trong mã QR: luôn là trang chính thức (VITE_PUBLIC_SITE_URL trong .env.production — dùng cho cả bản
 * production lẫn Preview), nên mở trang mã QR từ đâu thì mã in ra vẫn như nhau. Chạy dev không đặt biến thì dùng địa
 * chỉ đang mở.
 */
export const PUBLIC_SITE_ORIGIN = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;
export const checkinUrl = (code: string) => `${PUBLIC_SITE_ORIGIN}/qr/${code}`;

export const fetchQrPlace = async (code: string): Promise<QrPlaceView> => {
  const { data } = await axios.get<QrPlaceView>(`/api/public/qr/${encodeURIComponent(code)}`);
  return data;
};

export const fetchMyStaysAt = async (code: string): Promise<QrStaysView> => {
  const { data } = await axios.get<QrStaysView>(`/api/v1/traveler/stays/qr/${encodeURIComponent(code)}`, { headers: travelerHeaders() });
  return data;
};

/** Khách nhận phòng một đơn bằng mã QR / mã in dưới QR. */
export const checkInStay = async (code: string, bookingCode: string): Promise<StayView> => {
  const { data } = await axios.post<StayView>(`/api/v1/traveler/stays/qr/${encodeURIComponent(code.replace(/[\s-]/g, '').toUpperCase())}/check-in`,
    { bookingCode }, { headers: travelerHeaders() });
  return data;
};

/** Mã QR nhận phòng để in: NCC (homestay của mình) hoặc Admin (mọi homestay). */
export const fetchCheckinQr = async (placeId: number, portal: 'partner' | 'admin'): Promise<CheckinQrView> => {
  const url = portal === 'partner' ? `/api/v1/partner/homestays/${placeId}/checkin-qr` : `/api/v1/admin/places/${placeId}/checkin-qr`;
  const { data } = await axios.get<CheckinQrView>(url, { headers: portalHeaders() });
  return data;
};
