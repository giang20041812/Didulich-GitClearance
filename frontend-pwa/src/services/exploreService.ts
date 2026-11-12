import axios from 'axios';
import { compressImage } from '@/lib/imageCompress';
import { imageProblem } from '@/lib/exploreRules';
import { partnerMediaService } from '@/services/partnerMediaService';
import type {
  AdminExploreItem,
  AdminHomestayExplore,
  CoordFilter,
  ExploreCategory,
  ExplorePage,
  ExplorePlaceDetail,
  ExploreSettings,
  HomestayOption,
  PlaceForm,
  PlaceInput,
  PlaceRow,
  StatusFilter,
} from '@/types/explore';
import type { PageResponse } from '@/types/admin';

const PUBLIC = '/api/public/explore';
const ADMIN = '/api/v1/admin/explore';
const PARTNER = '/api/v1/partner/explore-places';

function auth() {
  const token = localStorage.getItem('portal_token');
  return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

// ─────────────────────────────────────────────
// Phía khách (không cần đăng nhập)
// ─────────────────────────────────────────────

/** US02.03: một trang "Khám phá quanh đây"; page 0 = 10 địa điểm đầu (BR-02.07). */
export async function fetchExplore(homestayId: number, category: ExploreCategory | null, page: number): Promise<ExplorePage> {
  const res = await axios.get<ExplorePage>(`${PUBLIC}/homestays/${homestayId}`, {
    params: { category: category ?? undefined, page },
  });
  return res.data;
}

/** US02.04: chi tiết địa điểm, homestayId = điểm xuất phát của Chỉ đường. */
export async function fetchExplorePlace(placeId: number, homestayId?: number): Promise<ExplorePlaceDetail> {
  const res = await axios.get<ExplorePlaceDetail>(`${PUBLIC}/places/${placeId}`, { params: { homestayId } });
  return res.data;
}

// ─────────────────────────────────────────────
// Tải ảnh (BR-02.01: ảnh gốc ≤ 5 MB, JPG / PNG / WebP → nén ≤ 4 MB)
// ─────────────────────────────────────────────

interface UploadConfig {
  provider: string;
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  uploadUrl?: string;
}

async function adminUpload(file: File): Promise<{ imageId: string; url: string }> {
  const cfg = (await axios.post<UploadConfig>(`${ADMIN}/media/direct-upload`, null, auth())).data;
  if (cfg.provider === 'SUPABASE') {
    const form = new FormData();
    form.append('file', file);
    const res = await axios.post<{ imageId: string; url: string }>(`${ADMIN}/media/upload-image`, form, auth());
    return res.data;
  }
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', cfg.apiKey ?? '');
  form.append('timestamp', String(cfg.timestamp ?? ''));
  form.append('signature', cfg.signature ?? '');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: form });
  if (!response.ok) throw new Error('Không tải được ảnh lên dịch vụ lưu trữ.');
  const result = (await response.json()) as { public_id: string; secure_url: string };
  return { imageId: result.public_id, url: result.secure_url };
}

/** Kiểm ảnh gốc, nén, rồi tải lên kho theo vai trò (Admin dùng đường riêng; NCC dùng đường tải ảnh sẵn có). */
export async function uploadExploreImage(file: File, scope: 'admin' | 'partner'): Promise<{ imageId: string; url: string }> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const compressed = await compressImage(file);
  return scope === 'admin' ? adminUpload(compressed) : partnerMediaService.uploadToStorage(compressed);
}

// ─────────────────────────────────────────────
// Admin — địa điểm (US02.01)
// ─────────────────────────────────────────────

export interface PlaceListParams {
  category?: ExploreCategory;
  status?: StatusFilter;
  coord?: CoordFilter;
  keyword?: string;
  page?: number;
  size?: number;
}

export async function adminListPlaces(params: PlaceListParams): Promise<PageResponse<PlaceRow>> {
  return (await axios.get<PageResponse<PlaceRow>>(`${ADMIN}/places`, { ...auth(), params })).data;
}

export async function adminGetPlace(id: number): Promise<PlaceForm> {
  return (await axios.get<PlaceForm>(`${ADMIN}/places/${id}`, auth())).data;
}

export async function adminCreatePlace(input: PlaceInput): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(`${ADMIN}/places`, input, auth())).data;
}

export async function adminUpdatePlace(id: number, input: PlaceInput): Promise<PlaceForm> {
  return (await axios.put<PlaceForm>(`${ADMIN}/places/${id}`, input, auth())).data;
}

export async function adminSetVisible(id: number, visible: boolean): Promise<PlaceForm> {
  return (await axios.patch<PlaceForm>(`${ADMIN}/places/${id}/visibility`, { visible }, auth())).data;
}

export async function adminSetCoordVerified(id: number, verified: boolean): Promise<PlaceForm> {
  return (await axios.patch<PlaceForm>(`${ADMIN}/places/${id}/coord-verified`, { verified }, auth())).data;
}

export async function adminBulkVerify(ids: number[]): Promise<{ updated: number; skipped: string[] }> {
  return (await axios.post<{ updated: number; skipped: string[] }>(`${ADMIN}/places/coord-verified/bulk`, { ids }, auth())).data;
}

export async function adminApprovePlace(id: number): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(`${ADMIN}/places/${id}/approve`, null, auth())).data;
}

export async function adminRejectPlace(id: number, reason: string): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(`${ADMIN}/places/${id}/reject`, { reason }, auth())).data;
}

export async function adminApproveEdit(id: number): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(`${ADMIN}/places/${id}/edit/approve`, null, auth())).data;
}

export async function adminRejectEdit(id: number, reason: string): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(`${ADMIN}/places/${id}/edit/reject`, { reason }, auth())).data;
}

// ─────────────────────────────────────────────
// Admin — quanh homestay (US02.02)
// ─────────────────────────────────────────────

export async function fetchExploreSettings(): Promise<ExploreSettings> {
  return (await axios.get<ExploreSettings>(`${ADMIN}/settings`, auth())).data;
}

export async function updateExploreRadius(radiusKm: number): Promise<ExploreSettings> {
  return (await axios.put<ExploreSettings>(`${ADMIN}/settings`, { radiusKm }, auth())).data;
}

export async function searchHomestays(keyword: string): Promise<HomestayOption[]> {
  return (await axios.get<HomestayOption[]>(`${ADMIN}/homestays`, { ...auth(), params: { keyword } })).data;
}

export async function fetchHomestayExplore(homestayId: number): Promise<AdminHomestayExplore> {
  return (await axios.get<AdminHomestayExplore>(`${ADMIN}/homestays/${homestayId}`, auth())).data;
}

export async function searchPlacesToPin(homestayId: number, keyword: string): Promise<AdminExploreItem[]> {
  return (await axios.get<AdminExploreItem[]>(`${ADMIN}/homestays/${homestayId}/search`, { ...auth(), params: { keyword } })).data;
}

export async function pinPlace(homestayId: number, placeId: number): Promise<AdminHomestayExplore> {
  return (await axios.post<AdminHomestayExplore>(`${ADMIN}/homestays/${homestayId}/pins`, { placeId }, auth())).data;
}

export async function unpinPlace(homestayId: number, placeId: number): Promise<AdminHomestayExplore> {
  return (await axios.delete<AdminHomestayExplore>(`${ADMIN}/homestays/${homestayId}/pins/${placeId}`, auth())).data;
}

export async function reorderPins(homestayId: number, placeIds: number[]): Promise<AdminHomestayExplore> {
  return (await axios.put<AdminHomestayExplore>(`${ADMIN}/homestays/${homestayId}/pins/order`, { placeIds }, auth())).data;
}

// ─────────────────────────────────────────────
// NCC (NCC-01)
// ─────────────────────────────────────────────

export async function partnerListPlaces(page = 0): Promise<PageResponse<PlaceRow>> {
  return (await axios.get<PageResponse<PlaceRow>>(PARTNER, { ...auth(), params: { page, size: 20 } })).data;
}

export async function partnerGetPlace(id: number): Promise<PlaceForm> {
  return (await axios.get<PlaceForm>(`${PARTNER}/${id}`, auth())).data;
}

export async function partnerCreatePlace(input: PlaceInput): Promise<PlaceForm> {
  return (await axios.post<PlaceForm>(PARTNER, input, auth())).data;
}

export async function partnerUpdatePlace(id: number, input: PlaceInput): Promise<PlaceForm> {
  return (await axios.put<PlaceForm>(`${PARTNER}/${id}`, input, auth())).data;
}
