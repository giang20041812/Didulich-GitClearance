import { one, tx } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import * as partner from '../repositories/partnerRepo.js';
import * as storage from './mediaStorage.js';

/** Quản lý ảnh điểm đến từ phía Admin — không kiểm tra quyền sở hữu NCC. */

export interface AdminMediaDto {
  mediaId: number;
  url: string | null;
  role: string;
  caption: string | null;
  sortOrder: number;
}

const toDto = (m: partner.MediaLink): AdminMediaDto => ({
  mediaId: m.mediaId,
  url: m.publicUrl,
  role: m.role,
  caption: m.caption,
  sortOrder: m.sortOrder,
});

const notFound = () => new HttpError(404, 'Không tìm thấy ảnh.');
const nextOrder = (orders: Array<number | null>): number =>
  orders.reduce<number>((max, o) => Math.max(max, o ?? 0), -1) + 1;

async function findAssetId(storageKey: string): Promise<number> {
  const row = await one<{ id: number }>('SELECT id FROM media_asset WHERE storage_key = $1', [storageKey]);
  if (!row) throw new HttpError(404, 'Không tìm thấy asset.');
  return row.id;
}

export async function listMedia(placeId: number): Promise<AdminMediaDto[]> {
  return (await partner.placeMediaLinks(placeId)).map(toDto);
}

export function attachMedia(placeId: number, imageId: string, url: string, caption?: string | null): Promise<AdminMediaDto[]> {
  return tx(async () => {
    const storageKey = imageId.startsWith('cloudinary:') ? imageId : `cloudinary:${imageId}`;
    const links = await partner.placeMediaLinks(placeId);
    const exists = await partner.assetExists(storageKey);
    const mediaId = exists ? await findAssetId(storageKey) : await partner.insertAsset(storageKey, url, 'image/jpeg', null);
    if (links.some((m) => m.mediaId === mediaId)) throw new HttpError(409, 'Ảnh này đã được gắn vào điểm đến.');
    const hasCover = links.some((m) => m.role === 'COVER');
    await partner.insertPlaceMedia(placeId, mediaId, hasCover ? 'GALLERY' : 'COVER', caption?.trim() || null, nextOrder(links.map((m) => m.sortOrder)));
    return (await partner.placeMediaLinks(placeId)).map(toDto);
  });
}

export function removeMedia(placeId: number, mediaId: number): Promise<AdminMediaDto[]> {
  return tx(async () => {
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

export function setCover(placeId: number, mediaId: number): Promise<AdminMediaDto[]> {
  return tx(async () => {
    const links = await partner.placeMediaLinks(placeId);
    if (!links.some((m) => m.mediaId === mediaId)) throw notFound();
    await partner.setPlaceMediaRole(placeId, null, 'GALLERY');
    await partner.setPlaceMediaRole(placeId, mediaId, 'COVER');
    return (await partner.placeMediaLinks(placeId)).map(toDto);
  });
}

export function uploadConfig(): Record<string, unknown> {
  return storage.getActiveUploadConfig();
}
