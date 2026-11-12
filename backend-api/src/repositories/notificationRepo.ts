import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, json } from '../db/sql.js';
import type { NotificationChannel, NotificationStatus, RecipientType } from '../domain/enums.js';

export interface NotificationTemplateRow {
  id: number;
  code: string;
  channel: NotificationChannel;
  subject: string | null;
  bodyTemplate: string;
  isActive: boolean;
}

export interface NotificationRow {
  id: number;
  templateCode: string;
  channel: NotificationChannel;
  recipientType: RecipientType;
  recipientAccountId: number | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  payload: Record<string, any>;
  status: NotificationStatus;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export async function findActiveTemplate(code: string): Promise<NotificationTemplateRow | null> {
  return one<NotificationTemplateRow>('SELECT * FROM notification_template WHERE code = $1 AND is_active = TRUE', [code]);
}

export async function findTemplate(code: string): Promise<NotificationTemplateRow | null> {
  return one<NotificationTemplateRow>('SELECT * FROM notification_template WHERE code = $1', [code]);
}

export interface NewNotification {
  templateCode: string;
  channel: NotificationChannel;
  recipientType: RecipientType;
  recipientAccountId?: number | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  sentAt?: string | null;
  createdAt: string;
}

export async function insert(n: NewNotification): Promise<NotificationRow> {
  return insertRow<NotificationRow>('notification', {
    templateCode: n.templateCode,
    channel: n.channel,
    recipientType: n.recipientType,
    recipientAccountId: n.recipientAccountId ?? null,
    recipientPhone: n.recipientPhone ?? null,
    recipientEmail: n.recipientEmail ?? null,
    relatedEntityType: n.relatedEntityType ?? null,
    relatedEntityId: n.relatedEntityId ?? null,
    payload: json(n.payload),
    status: n.status,
    sentAt: n.sentAt ?? null,
    createdAt: n.createdAt,
  });
}

/** Thông báo của khách (endpoint công khai): chỉ loại CUSTOMER, khớp email / SĐT / accountId. */
export async function findForCustomer(email: string | null, phone: string | null, accountId: number | null): Promise<Array<NotificationRow & { templateSubject: string | null; templateBody: string }>> {
  return query(
    `SELECT n.*, t.subject AS template_subject, t.body_template AS template_body
       FROM notification n JOIN notification_template t ON t.code = n.template_code
      WHERE n.recipient_type = 'CUSTOMER' AND (
            ($1::text IS NOT NULL AND lower(n.recipient_email) = lower($1::text)) OR
            ($2::text IS NOT NULL AND n.recipient_phone = $2::text) OR
            ($3::bigint IS NOT NULL AND n.recipient_account_id = $3::bigint))
      ORDER BY n.created_at DESC`,
    [email, phone, accountId],
  );
}

export async function findByRelatedEntity(entityType: string, entityId: number): Promise<NotificationRow[]> {
  return query<NotificationRow>('SELECT * FROM notification WHERE related_entity_type = $1 AND related_entity_id = $2', [entityType, entityId]);
}

/** 50 thông báo gần nhất của một tài khoản. */
export async function findTop50ByAccount(accountId: number): Promise<Array<NotificationRow & { templateSubject: string | null }>> {
  return query(
    `SELECT n.*, t.subject AS template_subject FROM notification n JOIN notification_template t ON t.code = n.template_code
      WHERE n.recipient_account_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 50`,
    [accountId],
  );
}

export async function findByIdAndAccount(id: number, accountId: number): Promise<NotificationRow | null> {
  return one<NotificationRow>('SELECT * FROM notification WHERE id = $1 AND recipient_account_id = $2', [id, accountId]);
}

export async function updatePayload(id: number, payload: Record<string, unknown>): Promise<void> {
  await exec('UPDATE notification SET payload = $2::jsonb WHERE id = $1', [id, JSON.stringify(payload)]);
}

export async function countUnreadForAccount(accountId: number): Promise<number> {
  return (
    (await scalar<number>(
      `SELECT count(*) FROM notification WHERE recipient_account_id = $1 AND coalesce(payload ->> 'isRead', 'false') <> 'true'`,
      [accountId],
    )) ?? 0
  );
}
