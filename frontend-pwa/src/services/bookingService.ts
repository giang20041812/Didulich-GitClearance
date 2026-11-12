import { CreateBookingRequest, BookingResponseDto } from '../types/booking';
import { apiOrigin } from '@/lib/apiBase';
import { endTravelerSession, TravelerSessionExpiredError } from '@/lib/travelerSession';
import { getBookingRestriction } from '@/lib/currentCustomer';
import { bookingRanges } from '@/lib/roomSelection';

const BOOKING_REQUEST_TIMEOUT_MS = 30000;

async function fetchBookingRequest(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BOOKING_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Máy chủ phản hồi quá lâu. Vui lòng kiểm tra kết nối rồi thử lại.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** URL tuyệt đối tới API đặt phòng (frontend và backend có thể khác domain). */
function bookingApiUrl(path: string): string {
  return new URL(`/api/public/bookings${path}`, apiOrigin()).toString();
}

function bookingPath(bookingCode: string, suffix = ''): string {
  return bookingApiUrl(`/${encodeURIComponent(bookingCode)}${suffix}`);
}

/**
 * Mã truy cập của từng đơn (backend trả MỘT lần lúc tạo đơn). Lưu riêng theo mã đơn — không nằm chung danh sách
 * đơn gần đây — để thao tác dọn cache danh sách không làm mất quyền xem / hủy / sửa / đánh giá đơn trên thiết bị này.
 */
const BOOKING_TOKENS_KEY = 'booking_access_tokens';
const BOOKING_TOKEN_HEADER = 'X-Booking-Token';

function readBookingTokens(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BOOKING_TOKENS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveBookingAccessToken(bookingCode: string, token: string) {
  if (typeof window === 'undefined' || !bookingCode || !token) return;
  try {
    const tokens = readBookingTokens();
    delete tokens[bookingCode];
    tokens[bookingCode] = token;
    // Giữ tối đa 50 đơn gần nhất (thứ tự chèn của object với key chuỗi).
    const entries = Object.entries(tokens).slice(-50);
    localStorage.setItem(BOOKING_TOKENS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (err) {
    console.warn('Lỗi lưu mã truy cập đơn:', err);
  }
}

export function getBookingAccessToken(bookingCode: string): string | null {
  return readBookingTokens()[bookingCode] ?? null;
}

function travelerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('traveler_token');
  } catch {
    return null;
  }
}

/**
 * Header chứng minh quyền với một đơn: mã truy cập của đơn (nếu thiết bị này đã đặt đơn) và JWT khách du lịch
 * đang đăng nhập (backend chấp nhận một trong hai).
 */
export function bookingAuthHeaders(bookingCode?: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = bookingCode ? getBookingAccessToken(bookingCode) : null;
  if (token) headers[BOOKING_TOKEN_HEADER] = token;
  const jwt = travelerToken();
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return headers;
}

export async function createBooking(request: CreateBookingRequest): Promise<BookingResponseDto> {
  const restriction = getBookingRestriction();
  if (restriction) throw new Error(restriction);

  const response = await fetchBookingRequest(bookingApiUrl(''), {
    method: 'POST',
    headers: bookingAuthHeaders(undefined, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Lỗi đặt phòng: HTTP ${response.status}`;
    try {
      const errorBody = await response.json() as { message?: string; error?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const created = (await response.json()) as BookingResponseDto;
  if (created.bookingCode && created.accessToken) {
    saveBookingAccessToken(created.bookingCode, created.accessToken);
  }
  return created;
}

export async function getBookingByCode(bookingCode: string, phone?: string): Promise<BookingResponseDto> {
  try {
    const url = new URL(bookingPath(bookingCode));
    // Tra cứu chỉ-đọc bằng mã đơn + SĐT (khi mở từ liên kết có ?phone=); bình thường dùng mã truy cập / đăng nhập.
    if (phone && phone.trim()) url.searchParams.set('phone', phone.trim());
    const response = await fetch(url.toString(), { headers: bookingAuthHeaders(bookingCode) });
    if (response.ok) {
      return (await response.json()) as BookingResponseDto;
    }
  } catch {
    // Fallback sang local
  }

  const local = getUserSavedBookings().find((b) => b.bookingCode === bookingCode);
  if (local) return local;

  throw new Error(`Không tìm thấy đơn đặt phòng với mã: ${bookingCode}`);
}

export async function fetchBookedDatesByRoom(roomTypeId: number, startDate?: string, endDate?: string): Promise<import('../types/booking').BookedDateRangeDto[]> {
  try {
    const url = new URL(`/api/public/bookings/rooms/${roomTypeId}/booked-dates`, apiOrigin());
    if (startDate) url.searchParams.append('startDate', startDate);
    if (endDate) url.searchParams.append('endDate', endDate);

    const response = await fetch(url.toString());
    if (!response.ok) return [];
    return (await response.json()) as import('../types/booking').BookedDateRangeDto[];
  } catch (error) {
    console.warn("fetchBookedDatesByRoom failed, fallback to empty list:", error);
    return [];
  }
}

export async function fetchBookedDatesByPlace(placeId: number, startDate?: string, endDate?: string): Promise<import('../types/booking').BookedDateRangeDto[]> {
  let serverList: import('../types/booking').BookedDateRangeDto[] = [];
  try {
    const url = new URL(`/api/public/bookings/places/${placeId}/booked-dates`, apiOrigin());
    if (startDate) url.searchParams.append('startDate', startDate);
    if (endDate) url.searchParams.append('endDate', endDate);

    const response = await fetch(url.toString());
    if (response.ok) {
      serverList = (await response.json()) as import('../types/booking').BookedDateRangeDto[];
    }
  } catch (error) {
    console.warn("fetchBookedDatesByPlace failed, fallback to empty list:", error);
  }

  const localBookings = getUserSavedBookings().filter(
    (b) => b.placeId === placeId && b.status !== 'CANCELLED'
  );
  // Mỗi loại phòng của đơn là một khoảng ngày riêng (giống danh sách máy chủ trả về).
  const localDateRanges: import('../types/booking').BookedDateRangeDto[] = localBookings.flatMap(bookingRanges);

  const combined = [...serverList];
  for (const loc of localDateRanges) {
    const exists = combined.some(
      (s) => s.roomTypeId === loc.roomTypeId && s.checkIn === loc.checkIn && s.checkOut === loc.checkOut
    );
    if (!exists) {
      combined.push(loc);
    }
  }

  return combined;
}

const LOCAL_BOOKINGS_KEY = 'user_recent_bookings';
const REVIEWED_CODES_KEY = 'user_reviewed_booking_codes';

export function getReviewedBookingCodes(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(REVIEWED_CODES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markBookingAsReviewed(bookingCode: string) {
  if (typeof window === 'undefined' || !bookingCode) return;
  try {
    const set = getReviewedBookingCodes();
    set.add(bookingCode);
    localStorage.setItem(REVIEWED_CODES_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Lỗi lưu trạng thái review:', err);
  }
}

export function saveUserBooking(booking: BookingResponseDto) {
  if (typeof window === 'undefined' || !booking?.bookingCode) return;
  const { accessToken, ...rest } = booking;
  if (accessToken) saveBookingAccessToken(booking.bookingCode, accessToken);
  try {
    const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
    const list: BookingResponseDto[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((b) => b.bookingCode !== booking.bookingCode);
    filtered.unshift(rest);
    localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(filtered.slice(0, 50)));
  } catch (err) {
    console.warn('Lỗi lưu lịch sử đặt phòng:', err);
  }
}

export function getUserSavedBookings(): BookingResponseDto[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
    return raw ? (JSON.parse(raw) as BookingResponseDto[]) : [];
  } catch {
    return [];
  }
}

export async function cancelBooking(
  bookingCode: string,
  reason: string,
  note?: string
): Promise<BookingResponseDto> {
  const response = await fetch(bookingPath(bookingCode, '/cancel'), {
    method: 'POST',
    headers: bookingAuthHeaders(bookingCode, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason, note }),
  });

  if (!response.ok) {
    let message = `Lỗi hủy đặt phòng: HTTP ${response.status}`;
    try {
      const err = await response.json() as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const updated = (await response.json()) as BookingResponseDto;
  return updated;
}

/**
 * Danh sách đơn của người dùng hiện tại.
 * - Khách du lịch đã đăng nhập: backend lấy danh tính từ JWT (không gửi email/SĐT). Backend từ chối JWT (401)
 *   thì xóa phiên và ném TravelerSessionExpiredError — trang chuyển về đăng nhập thay vì
 *   hiện danh sách rỗng như thể khách chưa từng đặt đơn.
 * - Chưa đăng nhập: nạp lại các đơn đã đặt trên thiết bị này bằng cặp {mã đơn, mã truy cập} đã lưu.
 */
export async function fetchMyBookings(): Promise<BookingResponseDto[]> {
  const jwt = travelerToken();
  if (jwt) {
    const response = await fetch(bookingApiUrl('/my-bookings'), {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (response.status === 401) {
      endTravelerSession(jwt);
      throw new TravelerSessionExpiredError();
    }
    if (!response.ok) {
      throw new Error(`Không thể nạp danh sách đặt phòng (HTTP ${response.status})`);
    }
    return (await response.json()) as BookingResponseDto[];
  }

  const bookings = Object.entries(readBookingTokens()).map(([code, token]) => ({ code, token }));
  if (bookings.length === 0) return [];
  const response = await fetch(bookingApiUrl('/lookup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookings: bookings.slice(-50) }),
  });
  if (!response.ok) {
    throw new Error(`Không thể nạp danh sách đặt phòng (HTTP ${response.status})`);
  }
  return (await response.json()) as BookingResponseDto[];
}

export interface BookingStatusRow {
  bookingCode: string;
  status: BookingResponseDto['status'];
}

/**
 * Mã đơn + trạng thái các đơn của khách đang đăng nhập — gọn nhẹ (1 truy vấn 2 cột) cho bộ theo dõi đơn realtime.
 * Backend chưa có endpoint này (404, vd frontend deploy trước) thì lấy từ /my-bookings. null = chưa đăng nhập / lỗi mạng.
 */
export async function fetchMyBookingStatuses(): Promise<BookingStatusRow[] | null> {
  const jwt = travelerToken();
  if (!jwt) return null;
  try {
    const response = await fetch(bookingApiUrl('/my-bookings/statuses'), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
      // Hỏi định kỳ ở nền: ưu tiên thấp, không chen trước nội dung trang (lib/requestQueue).
      priority: 'low',
    });
    if (response.status === 404) {
      return (await fetchMyBookings()).map((b) => ({ bookingCode: b.bookingCode, status: b.status }));
    }
    if (response.status === 401) {
      endTravelerSession(jwt);
      return null;
    }
    if (!response.ok) return null;
    return (await response.json()) as BookingStatusRow[];
  } catch {
    return null;
  }
}

export async function submitBookingReview(
  bookingCode: string,
  request: import('../types/review').CreateReviewRequest
): Promise<import('../types/review').ReviewDto> {
  const response = await fetch(
    bookingPath(bookingCode, '/review'),
    {
      method: 'POST',
      headers: bookingAuthHeaders(bookingCode, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    let message = `Gửi đánh giá thất bại (HTTP ${response.status})`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  markBookingAsReviewed(bookingCode);
  return response.json() as Promise<import('../types/review').ReviewDto>;
}

export async function updateBookingReview(
  bookingCode: string,
  request: import('../types/review').CreateReviewRequest
): Promise<import('../types/review').ReviewDto> {
  const response = await fetch(
    bookingPath(bookingCode, '/review'),
    {
      method: 'PUT',
      headers: bookingAuthHeaders(bookingCode, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    let message = `Cập nhật đánh giá thất bại (HTTP ${response.status})`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<import('../types/review').ReviewDto>;
}

export async function deleteBookingReview(bookingCode: string): Promise<void> {
  const response = await fetch(
    bookingPath(bookingCode, '/review'),
    {
      method: 'DELETE',
      headers: bookingAuthHeaders(bookingCode),
    }
  );

  if (!response.ok) {
    let message = `Xóa đánh giá thất bại (HTTP ${response.status})`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (typeof window !== 'undefined') {
    try {
      const set = getReviewedBookingCodes();
      set.delete(bookingCode);
      localStorage.setItem('user_reviewed_booking_codes', JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }
}

export async function fetchBookingReview(
  bookingCode: string
): Promise<import('../types/review').ReviewDto | null> {
  try {
    const response = await fetch(bookingPath(bookingCode, '/review'), {
      headers: bookingAuthHeaders(bookingCode),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text) as import('../types/review').ReviewDto;
  } catch {
    return null;
  }
}

export async function updateBookingDetails(
  bookingCode: string,
  request: import('../types/booking').UpdateBookingDetailsRequest
): Promise<BookingResponseDto> {
  const response = await fetch(bookingPath(bookingCode), {
    method: 'PUT',
    headers: bookingAuthHeaders(bookingCode, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Lỗi cập nhật đặt phòng: HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as BookingResponseDto;
}

export async function checkRoomAvailability(
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  roomCount: number = 1,
  excludeBookingCode?: string
): Promise<import('../types/booking').CheckAvailabilityResponse> {
  const url = new URL(`/api/public/bookings/rooms/${roomTypeId}/check-availability`, apiOrigin());
  url.searchParams.append('checkIn', checkIn);
  url.searchParams.append('checkOut', checkOut);
  url.searchParams.append('roomCount', String(roomCount));
  if (excludeBookingCode) {
    url.searchParams.append('excludeBookingCode', excludeBookingCode);
  }

  // Backend chỉ trừ phòng của đơn đang sửa khi người gọi chứng minh được quyền với đơn đó.
  const response = await fetch(url.toString(), {
    headers: excludeBookingCode ? bookingAuthHeaders(excludeBookingCode) : undefined,
  });
  if (!response.ok) {
    let msg = `Lỗi kiểm tra lịch phòng: HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      msg = err.message ?? err.error ?? msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return (await response.json()) as import('../types/booking').CheckAvailabilityResponse;
}

export async function quoteRoom(
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  roomCount: number,
  guestCount: number
): Promise<import('../types/booking').BookingQuoteResponse> {
  const url = new URL(`/api/public/bookings/rooms/${roomTypeId}/quote`, apiOrigin());
  url.searchParams.set('checkIn', checkIn);
  url.searchParams.set('checkOut', checkOut);
  url.searchParams.set('roomCount', String(roomCount));
  url.searchParams.set('guestCount', String(guestCount));
  const response = await fetchBookingRequest(url.toString(), {});
  if (!response.ok) throw new Error(`Không thể kiểm tra lại giá (HTTP ${response.status})`);
  return (await response.json()) as import('../types/booking').BookingQuoteResponse;
}

