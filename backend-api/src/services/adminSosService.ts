import { exec, one, query, tx } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import { SOS_REQUEST_STATUSES, type EmergencyContactType, type SosRequestStatus, type SosRequestType } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { nowLocal } from '../lib/time.js';
import * as audit from './auditLogService.js';
import * as recorder from './notificationRecorder.js';

/** Admin quản lý SOS requests và EmergencyContacts. Mọi thay đổi trạng thái đều ghi audit log. */

export interface EmergencyContactDto {
  id: number;
  regionId: number | null;
  regionName: string | null;
  type: EmergencyContactType;
  name: string;
  phone: string;
  address: string | null;
  isActive: boolean;
}

interface SosRow {
  id: number;
  requesterName: string;
  requesterPhone: string;
  latitude: number | null;
  longitude: number | null;
  type: SosRequestType;
  description: string | null;
  status: SosRequestStatus;
  assignedContactId: number | null;
  dispatchNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const CONTACT_SELECT = `SELECT c.id, c.region_id, r.name AS region_name, c.type, c.name, c.phone, c.address, c.is_active
  FROM emergency_contact c LEFT JOIN region r ON r.id = c.region_id`;

const contactNotFound = (id: number) => new HttpError(404, `Không tìm thấy đầu mối liên hệ id=${id}`);
const sosNotFound = (id: number) => new HttpError(404, `Không tìm thấy SOS request id=${id}`);

async function contactById(id: number): Promise<EmergencyContactDto | null> {
  return one<EmergencyContactDto>(`${CONTACT_SELECT} WHERE c.id = $1`, [id]);
}

async function toDtos(rows: SosRow[]) {
  const contactIds = [...new Set(rows.map((r) => r.assignedContactId).filter((v): v is number => v != null))];
  const contacts = new Map<number, EmergencyContactDto>();
  if (contactIds.length > 0) for (const c of await query<EmergencyContactDto>(`${CONTACT_SELECT} WHERE c.id = ANY($1)`, [contactIds])) contacts.set(c.id, c);
  return rows.map((s) => ({
    id: s.id,
    requesterName: s.requesterName,
    requesterPhone: s.requesterPhone,
    latitude: s.latitude,
    longitude: s.longitude,
    type: s.type,
    description: s.description,
    status: s.status,
    assignedContact: s.assignedContactId == null ? null : (contacts.get(s.assignedContactId) ?? null),
    dispatchNote: s.dispatchNote,
    createdAt: s.createdAt,
    resolvedAt: s.resolvedAt,
  }));
}

async function sosDto(id: number) {
  const [row] = await query<SosRow>('SELECT * FROM sos_request WHERE id = $1', [id]);
  return (await toDtos([row]))[0];
}

// ---- SOS requests -------------------------------------------------------------------------------------------------------------

/** Danh sách SOS requests. Lọc theo status nếu cung cấp. */
export async function getSosRequests(statusFilter: string | undefined) {
  let rows: SosRow[];
  if (statusFilter != null && statusFilter.trim() !== '') {
    const status = statusFilter.toUpperCase();
    if (!(SOS_REQUEST_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, `Giá trị status không hợp lệ: ${statusFilter}`);
    rows = await query<SosRow>('SELECT * FROM sos_request WHERE status = $1 ORDER BY created_at DESC, id DESC', [status]);
  } else {
    rows = await query<SosRow>('SELECT * FROM sos_request ORDER BY created_at DESC, id DESC');
  }
  const items = await toDtos(rows);
  return { items, total: items.length };
}

export async function getSosRequest(id: number) {
  const [row] = await query<SosRow>('SELECT * FROM sos_request WHERE id = $1', [id]);
  if (!row) throw sosNotFound(id);
  return (await toDtos([row]))[0];
}

async function lockedSos(id: number): Promise<SosRow> {
  const [row] = await query<SosRow>('SELECT * FROM sos_request WHERE id = $1 FOR UPDATE', [id]);
  if (!row) throw sosNotFound(id);
  return row;
}

/** Gán EmergencyContact và chuyển status sang DISPATCHED. */
export function dispatch(id: number, request: { assignedContactId: number; note?: string | null }, actorAccountId: number | null) {
  return tx(async () => {
    const sos = await lockedSos(id);
    if (sos.status !== 'PENDING') throw new HttpError(409, `Chỉ có thể điều phối SOS request ở trạng thái PENDING. Trạng thái hiện tại: ${sos.status}`);
    const contact = await contactById(request.assignedContactId);
    if (!contact) throw contactNotFound(request.assignedContactId);
    if (contact.isActive !== true) throw new HttpError(400, 'Đầu mối liên hệ này đang không hoạt động');
    await updateRow('sos_request', id, { status: 'DISPATCHED', assignedContactId: contact.id, dispatchNote: request.note ?? null });
    await audit.record(actorAccountId, 'SOS_DISPATCHED', 'SosRequest', id, `Gán đầu mối: ${contact.name}`, { status: sos.status }, { status: 'DISPATCHED', assignedContactId: contact.id });
    return sosDto(id);
  });
}

/** Đánh dấu SOS request đã được xử lý xong (RESOLVED). */
export function resolve(id: number, actorAccountId: number | null) {
  return tx(async () => {
    const sos = await lockedSos(id);
    if (sos.status === 'RESOLVED' || sos.status === 'CANCELLED') throw new HttpError(409, `SOS request đã ở trạng thái cuối: ${sos.status}`);
    await updateRow('sos_request', id, { status: 'RESOLVED', resolvedAt: nowLocal() });
    await audit.record(actorAccountId, 'SOS_RESOLVED', 'SosRequest', id, null, { status: sos.status }, { status: 'RESOLVED' });
    return sosDto(id);
  });
}

/** Huỷ SOS request (CANCELLED). */
export function cancel(id: number, actorAccountId: number | null) {
  return tx(async () => {
    const sos = await lockedSos(id);
    if (sos.status === 'RESOLVED' || sos.status === 'CANCELLED') throw new HttpError(409, `SOS request đã ở trạng thái cuối: ${sos.status}`);
    await updateRow('sos_request', id, { status: 'CANCELLED' });
    await audit.record(actorAccountId, 'SOS_CANCELLED', 'SosRequest', id, null, { status: sos.status }, { status: 'CANCELLED' });
    return sosDto(id);
  });
}

export interface PublicSosInput {
  requesterName: string;
  requesterPhone: string;
  latitude?: number | null;
  longitude?: number | null;
  type: SosRequestType;
  description?: string | null;
}

/** Khách gửi SOS (public endpoint, không cần auth); báo ngay cho mọi Admin (trong ứng dụng + đẩy ra màn hình). */
export function submitPublicSos(request: PublicSosInput) {
  return tx(async () => {
    const sos = await insertRow<SosRow>('sos_request', {
      requesterName: request.requesterName,
      requesterPhone: request.requesterPhone,
      latitude: request.latitude ?? null,
      longitude: request.longitude ?? null,
      type: request.type,
      description: request.description ?? null,
      status: 'PENDING',
      createdAt: nowLocal(),
    });
    await recorder.toAdmins('ADMIN_NEW_SOS', 'SosRequest', sos.id, `${request.requesterName} (${request.requesterPhone}) cần hỗ trợ khẩn cấp.`, 'sos');
    return {
      sosRequestId: sos.id,
      message: 'Yêu cầu SOS của bạn đã được ghi nhận. Đội ngũ hỗ trợ sẽ liên hệ với bạn ngay.',
      createdAt: sos.createdAt,
    };
  });
}

// ---- Emergency contacts -------------------------------------------------------------------------------------------------------

export async function getEmergencyContacts(activeOnly: boolean): Promise<EmergencyContactDto[]> {
  return query<EmergencyContactDto>(`${CONTACT_SELECT} ${activeOnly ? 'WHERE c.is_active = TRUE' : ''} ORDER BY c.id`);
}

export async function getEmergencyContact(id: number): Promise<EmergencyContactDto> {
  const contact = await contactById(id);
  if (!contact) throw contactNotFound(id);
  return contact;
}

async function requireRegion(regionId: number): Promise<void> {
  if (!(await one('SELECT id FROM region WHERE id = $1', [regionId]))) throw new HttpError(404, `Không tìm thấy khu vực id=${regionId}`);
}

export function createEmergencyContact(
  request: { regionId?: number | null; type: EmergencyContactType; name: string; phone: string; address?: string | null },
  actorAccountId: number | null,
): Promise<EmergencyContactDto> {
  return tx(async () => {
    if (request.regionId != null) await requireRegion(request.regionId);
    const saved = await insertRow<{ id: number }>('emergency_contact', {
      regionId: request.regionId ?? null,
      type: request.type,
      name: request.name,
      phone: request.phone,
      address: request.address ?? null,
      isActive: true,
    });
    await audit.record(actorAccountId, 'EMERGENCY_CONTACT_CREATED', 'EmergencyContact', saved.id, null, null, { name: request.name, type: request.type });
    return (await contactById(saved.id))!;
  });
}

export function updateEmergencyContact(
  id: number,
  request: { regionId?: number | null; type?: EmergencyContactType | null; name?: string | null; phone?: string | null; address?: string | null; isActive?: boolean | null },
  actorAccountId: number | null,
): Promise<EmergencyContactDto> {
  return tx(async () => {
    const contact = await contactById(id);
    if (!contact) throw contactNotFound(id);
    const before = { name: contact.name, type: contact.type, isActive: String(contact.isActive) };
    if (request.regionId != null) await requireRegion(request.regionId);
    await updateRow('emergency_contact', id, {
      regionId: request.regionId ?? undefined,
      type: request.type ?? undefined,
      name: request.name ?? undefined,
      phone: request.phone ?? undefined,
      address: request.address ?? undefined,
      isActive: request.isActive ?? undefined,
    });
    const saved = (await contactById(id))!;
    await audit.record(actorAccountId, 'EMERGENCY_CONTACT_UPDATED', 'EmergencyContact', id, null, before, { name: saved.name, isActive: String(saved.isActive) });
    return saved;
  });
}

export function deleteEmergencyContact(id: number, actorAccountId: number | null): Promise<void> {
  return tx(async () => {
    const contact = await contactById(id);
    if (!contact) throw contactNotFound(id);
    await exec('DELETE FROM emergency_contact WHERE id = $1', [id]);
    await audit.record(actorAccountId, 'EMERGENCY_CONTACT_DELETED', 'EmergencyContact', id, null, { name: contact.name }, null);
  });
}
