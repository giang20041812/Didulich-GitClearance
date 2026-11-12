import { tx } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import type { UserPrincipal } from '../security/principal.js';
import * as changeRequests from './changeRequestService.js';
import * as homestays from './partnerHomestayService.js';
import type { HomestayDto } from './partnerHomestayService.js';
import * as media from './partnerMediaService.js';
import * as rooms from './partnerRoomService.js';
import type { PhotoRef, RoomInput } from './partnerRoomService.js';

/**
 * Đăng Homestay trong một lần (Cổng NCC → "Đăng Homestay"): thông tin, ảnh chung, loại phòng và ảnh phòng được ghi trong CÙNG một
 * giao dịch, rồi (nếu chủ nhà chọn) gửi luôn yêu cầu xuất bản cho Admin duyệt. Ảnh được tải lên kho lưu trữ ngay trước khi gọi
 * {@link onboard}; {@link check} cho phép kiểm tra dữ liệu trước bước tải ảnh để lỗi nhập liệu không để lại ảnh mồ côi.
 */

const SUBMITTED_MESSAGE = 'Đã gửi Homestay cho quản trị viên duyệt. Homestay sẽ hiển thị và nhận đặt phòng ngay sau khi được duyệt.';
const DRAFT_MESSAGE = 'Đã lưu bản nháp. Bạn có thể bổ sung và gửi duyệt bất cứ lúc nào.';

export interface OnboardRoom {
  room: RoomInput;
  photos?: PhotoRef[] | null;
}

export interface OnboardRequest {
  homestay: HomestayDto;
  photos?: PhotoRef[] | null;
  rooms?: OnboardRoom[] | null;
  submit: boolean;
}

/** Tên loại phòng không được trùng nhau trong cùng Homestay (cùng quy tắc với partnerRoomService). */
function checkRooms(request: OnboardRequest): void {
  const names = new Set<string>();
  for (const room of request.rooms ?? []) {
    const name = room.room.name == null ? '' : room.room.name.trim().toLowerCase();
    if (names.has(name)) throw new HttpError(400, `Tên loại phòng "${room.room.name.trim()}" bị trùng — mỗi loại phòng cần một tên riêng.`);
    names.add(name);
  }
}

/** prepareNew điền giá trị mặc định vào DTO; bước kiểm tra không được làm thay đổi dữ liệu người dùng gửi lên. */
function copyOf(dto: HomestayDto | null | undefined): HomestayDto {
  if (!dto) throw new HttpError(400, 'Thiếu thông tin Homestay.');
  return { ...dto };
}

/** Kiểm tra dữ liệu (không ghi gì) — gọi trước khi tải ảnh lên kho lưu trữ. */
export async function check(principal: UserPrincipal | undefined, request: OnboardRequest): Promise<void> {
  const account = await homestays.actor(principal, true);
  homestays.prepareNew(account, copyOf(request.homestay));
  checkRooms(request);
}

export function onboard(principal: UserPrincipal | undefined, request: OnboardRequest) {
  return tx(async () => {
    checkRooms(request);
    const placeId = (await homestays.createHomestay(principal, request.homestay)).id!;
    for (const photo of request.photos ?? []) await media.attachToPlace(principal, placeId, { imageId: photo.imageId, url: photo.url, caption: null });
    for (const room of request.rooms ?? []) {
      const saved = await rooms.save(principal, placeId, null, room.room);
      for (const photo of room.photos ?? []) await media.attachToRoom(principal, placeId, saved.id, { imageId: photo.imageId, url: photo.url, caption: null });
    }
    const place = await homestays.owned(placeId, await homestays.actor(principal, false), false);
    const missing = await homestays.missingForPublish(place);
    if (!request.submit) return { id: placeId, submitted: false, message: DRAFT_MESSAGE, missingForPublish: missing };
    if (missing.length > 0) {
      // Không ném lỗi: ném sẽ hủy cả Homestay vừa tạo. Lưu nháp và chỉ rõ còn thiếu gì để chủ nhà bổ sung rồi gửi lại.
      return { id: placeId, submitted: false, message: `Đã lưu bản nháp nhưng chưa gửi duyệt được, còn thiếu: ${missing.join(', ')}.`, missingForPublish: missing };
    }
    await changeRequests.updateStatus(principal, placeId, { visibility: 'PUBLISHED' });
    return { id: placeId, submitted: true, message: SUBMITTED_MESSAGE, missingForPublish: [] as string[] };
  });
}
