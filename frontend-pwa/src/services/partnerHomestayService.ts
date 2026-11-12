import { partnerGet } from '@/lib/partnerGet';
import { invalidatePartnerCache, partnerCached, peekPartner, primePartner } from '@/lib/partnerCache';
import axios from 'axios';
import type { HomestayName } from '@/types/room';
import type { SubmittedChange } from '@/types/changeRequest';
import type { GeocodeResult, HomestayOptionsDto, OnboardRequest, OnboardResult, PartnerHomestayPageResponse, PartnerHomestaySummaryDto, PartnerHomestayDetailDto, UpdateStatusRequest } from '@/types/partner';

const API = '/api/v1/partner/homestays';
const config = () => {
  const token = localStorage.getItem('portal_token');
  // ≥ 30s: request rơi vào container backend đang khởi động phải chờ ~15s.
  return { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 30000 };
};

export async function fetchPartnerHomestays(keyword?: string, visibility?: string, operationStatus?: string): Promise<PartnerHomestayPageResponse> {
  return partnerGet<PartnerHomestayPageResponse>(API, { ...config(), params: { keyword, visibility, operationStatus } });
}
/**
 * Chỉ id + tên Homestay (bộ chọn Homestay). Giữ trong cache của tab: chuyển giữa Lịch phòng / Loại phòng / Đánh giá /
 * Tổng quan không gọi lại. low = dữ liệu phụ (vd bộ lọc), nhường request chính của trang.
 */
export function fetchPartnerHomestayNames(priority: 'high' | 'low' = 'high'): Promise<HomestayName[]> {
  return partnerCached('homestay-names', () => partnerGet<HomestayName[]>(`${API}/names`, { ...config(), apiPriority: priority }));
}
export const peekPartnerHomestayNames = () => peekPartner<HomestayName[]>('homestay-names');
export const primePartnerHomestayNames = (names: HomestayName[]) => primePartner('homestay-names', names);

export async function fetchPartnerHomestayDetail(id: number): Promise<PartnerHomestayDetailDto> {
  return (await axios.get<PartnerHomestayDetailDto>(`${API}/${id}`, config())).data;
}
/** Danh mục khu vực / tiện ích / loại hình: gần như không đổi — giữ trong cache của tab. */
export async function fetchHomestayOptions(): Promise<HomestayOptionsDto> {
  return partnerCached('homestay-options', async () => (await axios.get<HomestayOptionsDto>(`${API}/options`, config())).data, 30 * 60_000);
}
export async function createPartnerHomestay(detail: PartnerHomestayDetailDto): Promise<PartnerHomestayDetailDto> {
  const res = (await axios.post<PartnerHomestayDetailDto>(API, detail, config())).data;
  invalidatePartnerCache();
  return res;
}
/** Homestay đang công khai: backend trả 202 + SubmittedChange (chờ Admin duyệt), dữ liệu chính thức chưa đổi. */
export async function savePartnerHomestayDetail(id: number, detail: PartnerHomestayDetailDto): Promise<PartnerHomestayDetailDto | SubmittedChange> {
  const res = (await axios.put<PartnerHomestayDetailDto | SubmittedChange>(`${API}/${id}`, detail, config())).data;
  invalidatePartnerCache();
  return res;
}
/** HOM-MGT-BR-04: lần đầu xuất bản trả 202 + SubmittedChange (chờ Admin duyệt), các trạng thái khác ghi trực tiếp. */
export async function updateHomestayStatus(id: number, request: UpdateStatusRequest): Promise<PartnerHomestaySummaryDto | SubmittedChange> {
  const res = (await axios.patch<PartnerHomestaySummaryDto | SubmittedChange>(`${API}/${id}/status`, request, config())).data;
  invalidatePartnerCache();
  return res;
}
/** Đăng Homestay: kiểm tra dữ liệu, không ghi gì — gọi trước khi tải ảnh lên để nhập sai không để lại ảnh thừa. */
export async function checkOnboard(request: OnboardRequest): Promise<void> {
  await axios.post(`${API}/onboard/check`, request, config());
}
/** Đăng Homestay một lần: thông tin + ảnh + loại phòng; submit=true gửi luôn cho quản trị viên duyệt. */
export async function onboardHomestay(request: OnboardRequest): Promise<OnboardResult> {
  const res = (await axios.post<OnboardResult>(`${API}/onboard`, request, { ...config(), timeout: 60000 })).data;
  invalidatePartnerCache();
  return res;
}
/** Gợi ý tọa độ từ địa chỉ (backend gọi OpenStreetMap Nominatim). */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  // Không gửi bản sao: backend gọi OpenStreetMap Nominatim (giới hạn 1 request/giây).
  return (await axios.get<GeocodeResult>('/api/v1/partner/geocode', { ...config(), apiHedge: false, params: { address } })).data;
}
export function homestayError(error: unknown): string {
  if (axios.isAxiosError<unknown>(error)) {
    const body = error.response?.data;
    if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') return body.message;
    if (error.response?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.response?.status === 404) return 'Không tìm thấy Homestay của bạn.';
  }
  return 'Không thể kết nối hoặc lưu dữ liệu. Vui lòng thử lại.';
}
