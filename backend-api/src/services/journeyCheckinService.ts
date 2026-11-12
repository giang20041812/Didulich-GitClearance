import { tx } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { pageOf } from '../lib/page.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as journeys from '../repositories/journeyRepo.js';
import type { CheckinRow, CheckinWithPlace } from '../repositories/journeyRepo.js';
import * as audit from './auditLogService.js';
import { checkinView, coversOf, isSight, traveler } from './journeyService.js';
import * as storage from './mediaStorage.js';

/**
 * Check-in ĐỊA ĐIỂM trong lịch trình: khách đánh dấu đã đến một điểm, kèm ảnh (nén trên máy rồi tải qua backend vào
 * Supabase Storage như ảnh đánh giá) và lưu bút — đều tùy chọn, không bắt khách đứng tại địa điểm. Hồ sơ "Địa điểm đã đi"
 * lấy từ đây. Admin ẩn ảnh / lưu bút không phù hợp: chủ lịch trình vẫn thấy (kèm lý do), trang chia sẻ thì không.
 */

const MAX_NOTE_LENGTH = 1000;
const MAX_REASON_LENGTH = 500;

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Tạo / sửa check-in của một điểm trong lịch trình. `photo` mới thay ảnh cũ; `removePhoto` bỏ ảnh; lưu bút rỗng = không có. */
export async function checkin(
  identifier: string,
  journeyId: number,
  placeId: number,
  photo: UploadedPhoto | null | undefined,
  note: string | null | undefined,
  removePhoto: boolean,
) {
  const account = await traveler(identifier);
  const journey = await journeys.findOwned(journeyId, account.id);
  if (!journey) throw new HttpError(404, 'Không tìm thấy lịch trình.');
  // Chỉ điểm tham quan check-in được (mục ăn uống / hoạt động có thể không gắn địa điểm).
  const place = journey.stops.filter(isSight).map((s) => s.place!).find((p) => p.id === placeId);
  if (!place) throw new HttpError(404, 'Điểm này không có trong lịch trình.');
  let cleanNote = note == null ? null : note.trim();
  if (cleanNote === '') cleanNote = null;
  if (cleanNote != null && cleanNote.length > MAX_NOTE_LENGTH) throw new HttpError(400, `Lưu bút tối đa ${MAX_NOTE_LENGTH} ký tự.`);

  let photoUrl: string | null | undefined;
  if (photo && photo.size > 0) {
    photoUrl = (await storage.uploadImage(photo.buffer, photo.mimetype, `checkins/${account.id}`)).url;
  } else if (removePhoto) {
    photoUrl = null;
  }
  return tx(async () => {
    const existing = await journeys.findCheckin(journeyId, placeId);
    const saved = await journeys.saveCheckin({
      ...(existing ?? { travelerId: account.id, journeyId, placeId: place.id }),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      note: cleanNote,
    } as Partial<CheckinRow> & Pick<CheckinRow, 'travelerId' | 'placeId'>);
    return checkinView(saved);
  });
}

/** Bỏ check-in của một điểm (ảnh trên kho lưu trữ giữ nguyên — không ai còn link tới). */
export async function remove(identifier: string, journeyId: number, placeId: number): Promise<void> {
  const account = await traveler(identifier);
  if (!(await journeys.findOwned(journeyId, account.id))) throw new HttpError(404, 'Không tìm thấy lịch trình.');
  const existing = await journeys.findCheckin(journeyId, placeId);
  if (existing) await journeys.deleteCheckin(existing.id);
}

/** Hồ sơ "Địa điểm đã đi": mỗi địa điểm một dòng (lần check-in mới nhất), mới nhất trước. */
export async function visited(identifier: string) {
  const account = await traveler(identifier);
  const latest = new Map<number, CheckinWithPlace>();
  for (const c of await journeys.checkinsForTraveler(account.id)) if (!latest.has(c.placeId)) latest.set(c.placeId, c);
  const covers = await coversOf([...latest.keys()]);
  return [...latest.values()].map((c) => ({
    checkinId: c.id,
    placeId: c.placeId,
    placeName: c.placeName,
    placeSlug: c.placeSlug,
    coverImageUrl: covers.get(c.placeId) ?? null,
    photoUrl: c.photoUrl,
    note: c.note,
    hidden: c.hiddenAt != null,
    journeyId: c.journeyId,
    checkedInAt: c.createdAt,
  }));
}

// ---- Admin: kiểm duyệt -------------------------------------------------------------------------------------------

async function adminView(c: CheckinRow, placeName: string) {
  const owner = await accounts.findById(c.travelerId);
  return {
    id: c.id,
    travelerId: c.travelerId,
    travelerName: owner ? owner.fullName : null,
    travelerEmail: owner ? owner.email : null,
    placeId: c.placeId,
    placeName,
    photoUrl: c.photoUrl,
    note: c.note,
    createdAt: c.createdAt,
    hiddenAt: c.hiddenAt,
    hiddenReason: c.hiddenReason,
  };
}

export async function moderation(hidden: boolean | null, page: number, size: number) {
  const p = Math.max(0, page);
  const s = Math.max(1, Math.min(size, 50));
  const { rows, total } = await journeys.checkinsForModeration(hidden, s, p * s);
  const content = [];
  for (const c of rows) content.push(await adminView(c, c.placeName));
  return pageOf(content, p, s, total);
}

async function found(id: number): Promise<CheckinWithPlace> {
  const c = await journeys.findCheckinById(id);
  if (!c) throw new HttpError(404, 'Không tìm thấy check-in.');
  const rows = await journeys.checkinsForTraveler(c.travelerId);
  const withPlace = rows.find((r) => r.id === id);
  if (!withPlace) throw new HttpError(404, 'Không tìm thấy check-in.');
  return withPlace;
}

export async function hide(id: number, reason: string | null | undefined, adminAccountId: number | null) {
  const c = await found(id);
  let why = !reason || !reason.trim() ? 'Nội dung không phù hợp' : reason.trim();
  if (why.length > MAX_REASON_LENGTH) why = why.slice(0, MAX_REASON_LENGTH);
  const saved = await tx(async () => {
    return journeys.saveCheckin({ ...c, hiddenAt: nowLocal(), hiddenReason: why, hiddenByAccountId: adminAccountId });
  });
  await audit.record(adminAccountId, 'JOURNEY_CHECKIN_HIDDEN', 'JourneyCheckin', id, why, { hidden: false }, { hidden: true });
  return adminView(saved, c.placeName);
}

export async function unhide(id: number, adminAccountId: number | null) {
  const c = await found(id);
  const saved = await journeys.saveCheckin({ ...c, hiddenAt: null, hiddenReason: null, hiddenByAccountId: null });
  await audit.record(adminAccountId, 'JOURNEY_CHECKIN_UNHIDDEN', 'JourneyCheckin', id, null, { hidden: true }, { hidden: false });
  return adminView(saved, c.placeName);
}
