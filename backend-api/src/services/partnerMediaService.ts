import { tx } from '../db/pool.js';
import type { MediaRole } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import type { AccountWithProvider } from '../repositories/accountRepo.js';
import * as partner from '../repositories/partnerRepo.js';
import type { MediaLink } from '../repositories/partnerRepo.js';
import type { UserPrincipal } from '../security/principal.js';
import * as storage from './mediaStorage.js';
import { actor as actorOf, bad, owned } from './partnerHomestayService.js';
import { ownedByPrincipal, type PhotoRef } from './partnerRoomService.js';

/**
 * Ảnh Homestay (place_media) và ảnh loại phòng (room_type_media). Mỗi chủ thể tối đa 1 ảnh COVER (uq_place_media_cover /
 * uq_room_type_media_cover). Ảnh chỉ được gắn khi kho lưu trữ xác nhận đã upload xong.
 */

export const MAX_IMAGES_PER_OWNER = 30;

export interface AttachInput {
  imageId: string;
  url: string;
  caption?: string | null;
}

export interface MediaDto {
  mediaId: number;
  url: string | null;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
}

const toDto = (m: MediaLink): MediaDto => ({ mediaId: m.mediaId, url: m.publicUrl, role: m.role, caption: m.caption, sortOrder: m.sortOrder });
const notFound = () => new HttpError(404, 'Không tìm thấy ảnh.');
const trim = (s: string | null | undefined): string | null => (s == null || s.trim() === '' ? null : s.trim());
const nextOrder = (orders: Array<number | null>): number => orders.reduce<number>((max, o) => Math.max(max, o ?? 0), -1) + 1;

/** Lấy cấu hình upload của nhà cung cấp lưu trữ đang bật (Cloudinary: chữ ký; Supabase: upload qua backend). */
export async function directUpload(principal: UserPrincipal | undefined): Promise<Record<string, unknown>> {
  await actorOf(principal, true);
  return storage.getActiveUploadConfig();
}

/** Upload ảnh qua backend cho nhà cung cấp lưu trữ kiểu proxy (Supabase Storage). */
export async function uploadThroughBackend(principal: UserPrincipal | undefined, file: { buffer: Buffer; mimetype: string }): Promise<storage.StoredObject> {
  await actorOf(principal, true); // chỉ NCC đang hoạt động được upload
  return storage.uploadImage(file.buffer, file.mimetype, 'partner-media');
}

// ---- Homestay ----------------------------------------------------------------------------------------------------------------

export async function placeMedia(principal: UserPrincipal | undefined, placeId: number): Promise<MediaDto[]> {
  await owned(placeId, await actorOf(principal, false), false);
  return (await partner.placeMediaLinks(placeId)).map(toDto);
}

export function attachToPlace(principal: UserPrincipal | undefined, placeId: number, input: AttachInput): Promise<MediaDto[]> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    await owned(placeId, account, true);
    const links = await partner.placeMediaLinks(placeId);
    if (links.length >= MAX_IMAGES_PER_OWNER) throw bad(`Mỗi Homestay tối đa ${MAX_IMAGES_PER_OWNER} ảnh.`);
    const mediaId = await verifiedAsset(input, account);
    const hasCover = links.some((m) => m.role === 'COVER');
    await partner.insertPlaceMedia(placeId, mediaId, hasCover ? 'GALLERY' : 'COVER', trim(input.caption), nextOrder(links.map((m) => m.sortOrder)));
    return (await partner.placeMediaLinks(placeId)).map(toDto);
  });
}

export function setPlaceCover(principal: UserPrincipal | undefined, placeId: number, mediaId: number): Promise<MediaDto[]> {
  return tx(async () => {
    await owned(placeId, await actorOf(principal, true), true);
    const links = await partner.placeMediaLinks(placeId);
    if (!links.some((m) => m.mediaId === mediaId)) throw notFound();
    await partner.setPlaceMediaRole(placeId, null, 'GALLERY'); // gỡ COVER cũ trước để không vướng ràng buộc duy nhất
    await partner.setPlaceMediaRole(placeId, mediaId, 'COVER');
    return (await partner.placeMediaLinks(placeId)).map(toDto);
  });
}

export function removeFromPlace(principal: UserPrincipal | undefined, placeId: number, mediaId: number): Promise<MediaDto[]> {
  return tx(async () => {
    await owned(placeId, await actorOf(principal, true), true);
    const links = await partner.placeMediaLinks(placeId);
    const target = links.find((m) => m.mediaId === mediaId);
    if (!target) throw notFound();
    await partner.deletePlaceMedia(placeId, mediaId);
    if (target.role === 'COVER') {
      const next = links.find((m) => m.mediaId !== mediaId);
      if (next) await partner.setPlaceMediaRole(placeId, next.mediaId, 'COVER');
    }
    await partner.deleteAssetIfOrphan(mediaId);
    return (await partner.placeMediaLinks(placeId)).map(toDto);
  });
}

// ---- Loại phòng --------------------------------------------------------------------------------------------------------------

export async function roomMedia(principal: UserPrincipal | undefined, placeId: number, roomId: number): Promise<MediaDto[]> {
  await ownedByPrincipal(principal, placeId, roomId, false);
  return (await partner.roomMediaLinks(roomId)).map(toDto);
}

export function attachToRoom(principal: UserPrincipal | undefined, placeId: number, roomId: number, input: AttachInput): Promise<MediaDto[]> {
  return tx(async () => {
    const account = await actorOf(principal, true);
    await ownedByPrincipal(principal, placeId, roomId, true);
    const links = await partner.roomMediaLinks(roomId);
    if (links.length >= MAX_IMAGES_PER_OWNER) throw bad(`Mỗi loại phòng tối đa ${MAX_IMAGES_PER_OWNER} ảnh.`);
    const mediaId = await verifiedAsset(input, account);
    const hasCover = links.some((m) => m.role === 'COVER');
    await partner.insertRoomMedia(roomId, mediaId, hasCover ? 'GALLERY' : 'COVER', trim(input.caption), nextOrder(links.map((m) => m.sortOrder)));
    return (await partner.roomMediaLinks(roomId)).map(toDto);
  });
}

export function setRoomCover(principal: UserPrincipal | undefined, placeId: number, roomId: number, mediaId: number): Promise<MediaDto[]> {
  return tx(async () => {
    await ownedByPrincipal(principal, placeId, roomId, true);
    const links = await partner.roomMediaLinks(roomId);
    if (!links.some((m) => m.mediaId === mediaId)) throw notFound();
    await partner.setRoomMediaRole(roomId, null, 'GALLERY');
    await partner.setRoomMediaRole(roomId, mediaId, 'COVER');
    return (await partner.roomMediaLinks(roomId)).map(toDto);
  });
}

export function removeFromRoom(principal: UserPrincipal | undefined, placeId: number, roomId: number, mediaId: number): Promise<MediaDto[]> {
  return tx(async () => {
    await ownedByPrincipal(principal, placeId, roomId, true);
    const links = await partner.roomMediaLinks(roomId);
    const target = links.find((m) => m.mediaId === mediaId);
    if (!target) throw notFound();
    await partner.deleteRoomMedia(roomId, mediaId);
    if (target.role === 'COVER') {
      const next = links.find((m) => m.mediaId !== mediaId);
      if (next) await partner.setRoomMediaRole(roomId, next.mediaId, 'COVER');
    }
    await partner.deleteAssetIfOrphan(mediaId);
    return (await partner.roomMediaLinks(roomId)).map(toDto);
  });
}

/**
 * Gắn các ảnh đã tải lên kho lưu trữ vào loại phòng vừa tạo (ảnh đầu tiên thành ảnh đại diện) — dùng khi lưu loại phòng mới và
 * khi Admin duyệt yêu cầu tạo loại phòng. Ảnh thiếu mã/đường dẫn hoặc đã được dùng thì bỏ qua thay vì ném lỗi, để không làm hỏng
 * cả lần lưu / lần duyệt chỉ vì một ảnh.
 * @returns số ảnh đã gắn
 */
export function attachPhotosToRoom(account: AccountWithProvider, roomId: number, photos: PhotoRef[] | null | undefined): Promise<number> {
  return tx(async () => {
    if (!photos || photos.length === 0) return 0;
    const links = await partner.roomMediaLinks(roomId);
    let hasCover = links.some((m) => m.role === 'COVER');
    let order = nextOrder(links.map((m) => m.sortOrder));
    let count = links.length;
    let attached = 0;
    const seen = new Set<string>();
    for (const photo of photos) {
      if (count >= MAX_IMAGES_PER_OWNER) break;
      if (!photo || !photo.imageId || photo.imageId.trim() === '' || !photo.url || photo.url.trim() === '') continue;
      const key = `cloudinary:${photo.imageId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (await partner.assetExists(key)) continue;
      const mediaId = await partner.insertAsset(key, photo.url, 'image/jpeg', account.id);
      await partner.insertRoomMedia(roomId, mediaId, hasCover ? 'GALLERY' : 'COVER', null, order++);
      hasCover = true;
      count++;
      attached++;
    }
    return attached;
  });
}

async function verifiedAsset(input: AttachInput, account: AccountWithProvider): Promise<number> {
  const imageId = input.imageId;
  if (!imageId || imageId.trim() === '') throw bad('Mã ảnh không hợp lệ.');
  const key = `cloudinary:${imageId}`;
  if (await partner.assetExists(key)) throw bad('Ảnh này đã được sử dụng.');
  const url = input.url;
  if (!url || url.trim() === '') throw bad('Không lấy được đường dẫn ảnh.');
  return partner.insertAsset(key, url, 'image/jpeg', account.id);
}
