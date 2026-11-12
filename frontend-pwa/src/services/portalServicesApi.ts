import axios from 'axios';
import type { PageResponse } from '@/types/admin';
import type { ComboFormData, ComboInput, ComboRequestRow, ComboRequestStatus, ComboRow, PlaceRef } from '@/types/combo';
import type { ExploreCategory, PlaceForm, PlaceInput, PlaceRow, ServiceGroup, ServiceProfile } from '@/types/explore';
import type { AdminOfferRow, OfferInput, PartnerOffer, PartnerOffers } from '@/types/nearby';
import type { ProviderServiceType } from '@/types/partner';

/**
 * API cổng NCC / Admin cho dịch vụ nhà xe – trải nghiệm, "Gợi ý quanh đây" và combo. Chỉ nạp trong chunk cổng (axios
 * đã cấu hình bởi axiosBoot), trang khách dùng publicServicesApi (fetch).
 */
function auth() {
  const token = localStorage.getItem('portal_token');
  return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

// ------------------------------------------------------------------ dịch vụ của NCC (nhà xe / trải nghiệm)

export interface ListingConfig {
  serviceType: ProviderServiceType;
  serviceTypeLabel: string;
  category: ExploreCategory;
  categoryLabel: string;
  groups: { code: ServiceGroup; label: string }[];
}

export interface ListingRow {
  place: PlaceRow;
  serviceGroup: ServiceGroup | null;
  serviceGroupLabel: string | null;
  priceFrom: number | null;
  priceUnit: string | null;
  route: string | null;
  /** Thông tin dịch vụ đầy đủ (giờ chạy, số chỗ, thời lượng, ngôn ngữ…); null = chưa khai báo. */
  service: ServiceProfile | null;
}

const LISTINGS = '/api/v1/partner/listings';

export const listingApi = {
  config: async () => (await axios.get<ListingConfig>(`${LISTINGS}/config`, auth())).data,
  list: async (keyword = '', page = 0) =>
    (await axios.get<PageResponse<ListingRow>>(LISTINGS, { ...auth(), params: { keyword: keyword || undefined, page, size: 50 } })).data,
  get: async (id: number) => (await axios.get<PlaceForm>(`${LISTINGS}/${id}`, auth())).data,
  create: async (input: PlaceInput) => (await axios.post<PlaceForm>(LISTINGS, input, auth())).data,
  update: async (id: number, input: PlaceInput) => (await axios.put<PlaceForm>(`${LISTINGS}/${id}`, input, auth())).data,
};

// ------------------------------------------------------------------ gợi ý quanh đây

export const nearbyPartnerApi = {
  list: async () => (await axios.get<PartnerOffers>('/api/v1/partner/nearby-offers', auth())).data,
  save: async (placeId: number, input: OfferInput) =>
    (await axios.put<PartnerOffer>(`/api/v1/partner/nearby-offers/${placeId}`, input, auth())).data,
};

export const nearbyAdminApi = {
  list: async (params: { hidden?: boolean; keyword?: string; page?: number; size?: number }) =>
    (await axios.get<PageResponse<AdminOfferRow>>('/api/v1/admin/nearby-offers', { ...auth(), params })).data,
  hide: async (placeId: number, reason: string) =>
    (await axios.post<AdminOfferRow>(`/api/v1/admin/nearby-offers/${placeId}/hide`, { reason }, auth())).data,
  show: async (placeId: number) =>
    (await axios.post<AdminOfferRow>(`/api/v1/admin/nearby-offers/${placeId}/show`, null, auth())).data,
};

// ------------------------------------------------------------------ combo

export type ComboScope = 'admin' | 'partner';
export type ComboAdminFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
export type ComboSourceFilter = 'OFFICIAL' | 'PROVIDER';

/** Các thao tác Admin và NCC dùng chung (cùng form combo, cùng ô chọn địa điểm). */
export function comboApi(scope: ComboScope) {
  const base = scope === 'admin' ? '/api/v1/admin/combos' : '/api/v1/partner/combos';
  return {
    get: async (id: number) => (await axios.get<ComboFormData>(`${base}/${id}`, auth())).data,
    create: async (input: ComboInput) => (await axios.post<ComboFormData>(base, input, auth())).data,
    update: async (id: number, input: ComboInput) => (await axios.put<ComboFormData>(`${base}/${id}`, input, auth())).data,
    placeOptions: async (keyword: string, kind?: string) =>
      (await axios.get<PlaceRef[]>(`${base}/place-options`, { ...auth(), params: { keyword: keyword || undefined, kind } })).data,
    requests: async (params: { comboId?: number; status?: ComboRequestStatus; page?: number; size?: number }) =>
      (await axios.get<PageResponse<ComboRequestRow>>(`${base}/requests`, { ...auth(), params })).data,
    setRequestStatus: async (requestId: number, status: ComboRequestStatus) =>
      (await axios.patch<ComboRequestRow>(`${base}/requests/${requestId}`, { status }, auth())).data,
  };
}

export const comboPartnerApi = {
  list: async (page = 0) =>
    (await axios.get<PageResponse<ComboRow>>('/api/v1/partner/combos', { ...auth(), params: { page, size: 50 } })).data,
  pause: async (id: number, paused: boolean) =>
    (await axios.post<ComboFormData>(`/api/v1/partner/combos/${id}/pause`, { paused }, auth())).data,
};

export const comboAdminApi = {
  list: async (params: { status?: ComboAdminFilter; source?: ComboSourceFilter; keyword?: string; page?: number; size?: number }) =>
    (await axios.get<PageResponse<ComboRow>>('/api/v1/admin/combos', { ...auth(), params })).data,
  approve: async (id: number) => (await axios.post<ComboFormData>(`/api/v1/admin/combos/${id}/approve`, null, auth())).data,
  reject: async (id: number, reason: string) =>
    (await axios.post<ComboFormData>(`/api/v1/admin/combos/${id}/reject`, { reason }, auth())).data,
  approveEdit: async (id: number) => (await axios.post<ComboFormData>(`/api/v1/admin/combos/${id}/approve-edit`, null, auth())).data,
  rejectEdit: async (id: number, reason: string) =>
    (await axios.post<ComboFormData>(`/api/v1/admin/combos/${id}/reject-edit`, { reason }, auth())).data,
  setVisible: async (id: number, visible: boolean) =>
    (await axios.post<ComboFormData>(`/api/v1/admin/combos/${id}/visibility`, { visible }, auth())).data,
  remove: async (id: number) => { await axios.delete(`/api/v1/admin/combos/${id}`, auth()); },
};
