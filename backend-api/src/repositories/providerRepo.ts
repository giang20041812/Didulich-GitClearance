import { exec, one, query, scalar } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type { ProviderServiceType, ProviderStatus } from '../domain/enums.js';

export interface ProviderRow {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  note: string | null;
  status: ProviderStatus;
  serviceType: ProviderServiceType;
  createdAt: string;
  updatedAt: string;
}

export async function findById(id: number): Promise<ProviderRow | null> {
  return one<ProviderRow>('SELECT * FROM provider WHERE id = $1', [id]);
}

export async function findAllByCreatedAtDesc(): Promise<ProviderRow[]> {
  return query<ProviderRow>('SELECT * FROM provider ORDER BY created_at DESC');
}

export async function findByStatusOrderByCreatedAtDesc(status: ProviderStatus): Promise<ProviderRow[]> {
  return query<ProviderRow>('SELECT * FROM provider WHERE status = $1 ORDER BY created_at DESC', [status]);
}

export async function countByStatus(status: ProviderStatus): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM provider WHERE status = $1', [status])) ?? 0;
}

export async function countCreatedBetween(from: string, to: string): Promise<number> {
  return (await scalar<number>('SELECT count(*) FROM provider WHERE created_at >= $1 AND created_at < $2', [from, to])) ?? 0;
}

/** [providerId, số địa điểm chưa xóa]. */
export async function countPlacesByProvider(): Promise<Map<number, number>> {
  const rows = await query<{ providerId: number; n: number }>(
    'SELECT provider_id, count(*) AS n FROM place WHERE provider_id IS NOT NULL AND is_deleted = FALSE GROUP BY provider_id',
  );
  return new Map(rows.map((r) => [r.providerId, r.n]));
}

/** [providerId, số tài khoản]. */
export async function countAccountsByProvider(): Promise<Map<number, number>> {
  const rows = await query<{ providerId: number; n: number }>(
    'SELECT provider_id, count(*) AS n FROM account WHERE provider_id IS NOT NULL GROUP BY provider_id',
  );
  return new Map(rows.map((r) => [r.providerId, r.n]));
}

export async function insert(data: Partial<ProviderRow> & { name: string; createdAt: string; updatedAt: string }): Promise<ProviderRow> {
  return insertRow<ProviderRow>('provider', { status: 'ACTIVE', serviceType: 'HOMESTAY', ...data });
}

export async function update(id: number, patch: Partial<Omit<ProviderRow, 'id'>>): Promise<ProviderRow | null> {
  return updateRow<ProviderRow>('provider', id, patch);
}

export async function remove(id: number): Promise<number> {
  return exec('DELETE FROM provider WHERE id = $1', [id]);
}
