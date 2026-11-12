import axios from 'axios';
import type {
  AdminFeedItem,
  BookingJourneyView,
  CheckinView,
  FeedPage,
  HelpfulState,
  HelpfulView,
  JourneyInput,
  JourneyView,
  SharedJourneyView,
  VisitedPlaceView,
} from '@/types/journey';
import type { PushApi } from '@/lib/webPush';
import { dayNumberOf, journeyRange } from '@/lib/journey';
import { addDaysKey } from '@/lib/roomAvailability';

const BASE = '/api/v1/traveler/journeys';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('traveler_token') ?? ''}` });

/** Mọi lịch trình của khách đang đăng nhập (mới sửa trước). */
export const fetchMyJourneys = async (): Promise<JourneyView[]> => {
  const { data } = await axios.get<JourneyView[]>(BASE, { headers: authHeaders() });
  return data ?? [];
};

/** Lịch trình của khách đang đăng nhập lên từ một chỗ nghỉ (mới sửa trước). */
export const fetchMyJourneysForPlace = async (basePlaceId: number): Promise<JourneyView[]> => {
  const { data } = await axios.get<JourneyView[]>(BASE, { params: { basePlaceId }, headers: authHeaders(), apiPriority: 'low' });
  return data ?? [];
};

export const fetchJourney = async (id: number): Promise<JourneyView> => {
  const { data } = await axios.get<JourneyView>(`${BASE}/${id}`, { headers: authHeaders() });
  return data;
};

export const createJourney = async (input: JourneyInput): Promise<JourneyView> => {
  const { data } = await axios.post<JourneyView>(BASE, input, { headers: authHeaders() });
  return data;
};

export const updateJourney = async (id: number, input: JourneyInput): Promise<JourneyView> => {
  const { data } = await axios.put<JourneyView>(`${BASE}/${id}`, input, { headers: authHeaders() });
  return data;
};

export const deleteJourney = async (id: number): Promise<void> => {
  await axios.delete(`${BASE}/${id}`, { headers: authHeaders() });
};

/**
 * Dữ liệu gửi lại khi chỉ đổi thông tin (đổi tên, ngày đi...): gửi đủ mọi mục kèm trường mới (format 2) — backend ghi đè
 * toàn bộ nên thiếu mục nào là mất mục đó (bữa ăn, hoạt động của lịch trình lên từ gói mẫu); thiếu gói đã chép, tên ngày,
 * mục gốc / món / phương án của mục là mất các trường đó. Mục giữ nguyên buổi + ngày tham quan đã lưu — sửa giờ / "Ngày N"
 * của mục thì dựng mục bằng stopInputOf (lib/tripPlanner) để buổi + ngày tính lại.
 */
export const journeyInputOf = (journey: JourneyView, patch: Partial<JourneyInput> = {}): JourneyInput => ({
  basePlaceId: journey.basePlaceId,
  title: journey.title,
  startDate: journey.startDate,
  endDate: journey.endDate,
  format: 2,
  regionId: journey.regionId ?? null,
  guestCount: journey.guestCount ?? null,
  templateCode: journey.templateCode ?? null,
  preferences: journey.preferences ?? null,
  templateId: journey.templateId ?? null,
  // Máy chủ cũ không trả days: null = giữ nguyên.
  days: journey.days ?? null,
  stops: journey.stops.map((s) => ({
    id: s.id,
    placeId: s.placeId,
    visitDate: s.visitDate,
    session: s.session,
    kind: s.kind ?? 'PLACE',
    title: s.title ?? null,
    dayIndex: s.dayIndex ?? null,
    startTime: s.startTime ?? null,
    endTime: s.endTime ?? null,
    note: s.note ?? null,
    addons: s.addons ?? [],
    sourceStopId: s.sourceStopId ?? null,
    // null = máy chủ giữ nguyên (máy chủ cũ chưa trả các trường này).
    dishIds: s.dishIds ?? null,
    alternativePlaceIds: s.alternativePlaceIds ?? null,
  })),
  ...patch,
});

/**
 * Đặt ngày đi cho lịch trình (ô "Chỗ ở" khi chưa chọn ngày, hoặc đổi ngày): mọi mục chuyển về "Ngày N" để backend xếp
 * lại đúng ngày thật theo ngày đi mới; ngày về = ngày cuối của lịch trình.
 */
export const journeyInputOnDates = (journey: JourneyView, startDate: string): JourneyInput => {
  const { first, last } = journeyRange(journey);
  const stops = journey.stops.map((s) => {
    const day = s.dayIndex ?? dayNumberOf(first, s.visitDate);
    return day && day >= 1 ? { ...s, dayIndex: day, visitDate: null } : s;
  });
  const days = Math.max(1, dayNumberOf(first, last) ?? 1, ...stops.map((s) => s.dayIndex ?? 1));
  return journeyInputOf({ ...journey, stops }, { startDate, endDate: addDaysKey(startDate, days - 1) });
};

// ─── Gắn với đơn đặt phòng ───────────────────────────────────────

export const fetchJourneyForBooking = async (bookingCode: string): Promise<BookingJourneyView> => {
  const { data } = await axios.get<BookingJourneyView>(`${BASE}/for-booking/${encodeURIComponent(bookingCode)}`, { headers: authHeaders() });
  return data;
};

export const linkJourneyBooking = async (journeyId: number, bookingCode: string): Promise<JourneyView> => {
  const { data } = await axios.put<JourneyView>(`${BASE}/${journeyId}/booking`, { bookingCode }, { headers: authHeaders() });
  return data;
};

export const unlinkJourneyBooking = async (journeyId: number): Promise<JourneyView> => {
  const { data } = await axios.delete<JourneyView>(`${BASE}/${journeyId}/booking`, { headers: authHeaders() });
  return data;
};

// ─── Chia sẻ + sao chép ───────────────────────────────────────────

export const shareJourney = async (journeyId: number): Promise<string> => {
  const { data } = await axios.post<{ shareToken: string }>(`${BASE}/${journeyId}/share`, null, { headers: authHeaders() });
  return data.shareToken;
};

export const unshareJourney = async (journeyId: number): Promise<void> => {
  await axios.delete(`${BASE}/${journeyId}/share`, { headers: authHeaders() });
};

/** Trang chia sẻ công khai — không cần đăng nhập. */
export const fetchSharedJourney = async (token: string): Promise<SharedJourneyView> => {
  const { data } = await axios.get<SharedJourneyView>(`/api/public/journeys/shared/${encodeURIComponent(token)}`);
  return data;
};

/** Chép trọn lịch trình được chia sẻ (mọi mục, giờ, ghi chú, dịch vụ) thành lịch trình của khách. */
export const copySharedJourney = async (shareToken: string, startDate: string | null, guestCount: number | null = null): Promise<JourneyView> => {
  const { data } = await axios.post<JourneyView>(`${BASE}/copy`, { shareToken, startDate, guestCount }, { headers: authHeaders() });
  return data;
};

export const journeyShareUrl = (token: string) => `${window.location.origin}/j/${token}`;

// ─── Trang "Trải nghiệm" ─────────────────────────────────────────

/** Đăng lịch trình lên trang "Trải nghiệm" (tự tạo link chia sẻ nếu chưa có). */
export const publishJourney = async (journeyId: number): Promise<{ shareToken: string; publishedAt: string }> => {
  const { data } = await axios.post<{ shareToken: string; publishedAt: string }>(`${BASE}/${journeyId}/publish`, null, { headers: authHeaders() });
  return data;
};

export const unpublishJourney = async (journeyId: number): Promise<void> => {
  await axios.delete(`${BASE}/${journeyId}/publish`, { headers: authHeaders() });
};

/** Bảng tin công khai của trang "Trải nghiệm" — không cần đăng nhập. */
export const fetchJourneyFeed = async (page = 0, size = 12): Promise<FeedPage> => {
  const { data } = await axios.get<FeedPage>('/api/public/journeys/feed', { params: { page, size } });
  return data;
};

// ─── Nút "Hữu ích" (tim) trên bài Trải nghiệm — cần đăng nhập du khách ──

/** Bài nào (theo mã chia sẻ) khách đang đăng nhập đã bấm "Hữu ích", bài nào là của chính khách. */
export const fetchHelpfulState = async (tokens: string[]): Promise<HelpfulState> => {
  if (tokens.length === 0) return { helpful: [], own: [] };
  const { data } = await axios.get<HelpfulState>(`${BASE}/helpful`, { params: { tokens: tokens.join(',') }, headers: authHeaders(), apiPriority: 'low' });
  return { helpful: data?.helpful ?? [], own: data?.own ?? [] };
};

export const markHelpful = async (token: string): Promise<HelpfulView> => {
  const { data } = await axios.put<HelpfulView>(`${BASE}/helpful/${encodeURIComponent(token)}`, null, { headers: authHeaders() });
  return data;
};

export const unmarkHelpful = async (token: string): Promise<HelpfulView> => {
  const { data } = await axios.delete<HelpfulView>(`${BASE}/helpful/${encodeURIComponent(token)}`, { headers: authHeaders() });
  return data;
};

// Admin kiểm duyệt (token cổng)
const adminHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` });

export const fetchAdminJourneyFeed = async (params: { hidden?: boolean; page?: number; size?: number }) => {
  const { data } = await axios.get<{ content: AdminFeedItem[]; totalElements: number; totalPages: number; number: number; size: number }>(
    '/api/v1/admin/journey-feed', { params, headers: adminHeaders() });
  return data;
};

export const hideFeedJourney = async (id: number, reason: string): Promise<AdminFeedItem> => {
  const { data } = await axios.post<AdminFeedItem>(`/api/v1/admin/journey-feed/${id}/hide`, { reason }, { headers: adminHeaders() });
  return data;
};

export const unhideFeedJourney = async (id: number): Promise<AdminFeedItem> => {
  const { data } = await axios.post<AdminFeedItem>(`/api/v1/admin/journey-feed/${id}/unhide`, null, { headers: adminHeaders() });
  return data;
};

// ─── Check-in địa điểm + hồ sơ ────────────────────────────────────

/** Check-in một điểm: ảnh (đã nén trên máy) + lưu bút, đều tùy chọn. */
export const saveCheckin = async (
  journeyId: number,
  placeId: number,
  input: { photo?: File | null; note: string; removePhoto?: boolean },
): Promise<CheckinView> => {
  const form = new FormData();
  if (input.photo) form.append('photo', input.photo);
  form.append('note', input.note);
  if (input.removePhoto) form.append('removePhoto', 'true');
  const { data } = await axios.post<CheckinView>(`${BASE}/${journeyId}/stops/${placeId}/checkin`, form, { headers: authHeaders() });
  return data;
};

export const removeCheckin = async (journeyId: number, placeId: number): Promise<void> => {
  await axios.delete(`${BASE}/${journeyId}/stops/${placeId}/checkin`, { headers: authHeaders() });
};

export const fetchVisitedPlaces = async (): Promise<VisitedPlaceView[]> => {
  const { data } = await axios.get<VisitedPlaceView[]>(`${BASE}/visited-places`, { headers: authHeaders() });
  return data ?? [];
};

// ─── Nhắc giờ (Web Push) ──────────────────────────────────────────

const PUSH = '/api/v1/traveler/push';

/** API đăng ký đẩy của khách du lịch — dùng chung lib/adminPush (enablePush / disablePush). */
export const travelerPushApi: PushApi = {
  async getPushPublicKey() {
    const { data } = await axios.get<{ publicKey: string }>(`${PUSH}/public-key`, { headers: authHeaders() });
    return data.publicKey;
  },
  async subscribePush(subscription) {
    await axios.post(`${PUSH}/subscribe`, subscription, { headers: authHeaders() });
  },
  async unsubscribePush(endpoint) {
    await axios.post(`${PUSH}/unsubscribe`, { endpoint }, { headers: authHeaders() });
  },
};

export const sendTestReminder = async (): Promise<number> => {
  const { data } = await axios.post<{ delivered: number }>(`${PUSH}/test`, null, { headers: authHeaders() });
  return data.delivered ?? 0;
};
