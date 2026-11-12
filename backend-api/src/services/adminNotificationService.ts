import * as repo from '../repositories/notificationRepo.js';
import type { NotificationRow } from '../repositories/notificationRepo.js';
import { tx } from '../db/pool.js';

/**
 * Thông báo của chính tài khoản cổng đang đăng nhập — Admin và NCC; mỗi tài khoản có bản ghi riêng nên đánh dấu đã đọc độc lập
 * nhau. Trạng thái đã đọc lưu trong payload.isRead, cùng quy ước với thông báo của khách.
 */

export interface NotificationItemDto {
  id: number;
  title: string | null;
  message: string | null;
  target: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationFeedDto {
  items: NotificationItemDto[];
  unread: number;
}

const text = (o: unknown): string | null => (o == null ? null : String(o));

function toDto(n: NotificationRow): NotificationItemDto {
  const p = n.payload ?? {};
  return {
    id: n.id,
    title: text(p.title),
    message: text(p.message),
    target: text(p.target),
    entityType: n.relatedEntityType,
    entityId: n.relatedEntityId,
    read: p.isRead === true,
    createdAt: n.createdAt,
  };
}

export async function feed(accountId: number | null | undefined): Promise<NotificationFeedDto> {
  if (accountId == null) return { items: [], unread: 0 };
  const items = (await repo.findTop50ByAccount(accountId)).map(toDto);
  return { items, unread: items.filter((i) => !i.read).length };
}

async function setRead(n: NotificationRow, read: boolean): Promise<void> {
  await repo.updatePayload(n.id, { ...(n.payload ?? {}), isRead: read });
}

export function markRead(accountId: number | null | undefined, id: number): Promise<void> {
  return tx(async () => {
    if (accountId == null) return;
    const n = await repo.findByIdAndAccount(id, accountId);
    if (n) await setRead(n, true);
  });
}

export function markAllRead(accountId: number | null | undefined): Promise<void> {
  return tx(async () => {
    if (accountId == null) return;
    for (const n of await repo.findTop50ByAccount(accountId)) await setRead(n, true);
  });
}
