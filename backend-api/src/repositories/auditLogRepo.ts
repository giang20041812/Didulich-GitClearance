import { exec, one, query, scalar } from '../db/pool.js';
import type { ActorType } from '../domain/enums.js';

export interface AuditLogRow {
  id: number;
  actor: ActorType;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  reason: string | null;
  result: string | null;
  ip: string | null;
  beforeData: Record<string, any> | null;
  afterData: Record<string, any> | null;
  createdAt: string;
}

export const findById = (id: number) => one<AuditLogRow>('SELECT * FROM audit_log WHERE id = $1', [id]);

/** Các bản ghi gần nhất (mới nhất trước); `excludeActions` bỏ những hành động chỉ định (vd: sự kiện đăng nhập dày đặc). */
export async function findRecent(limit: number, excludeActions: readonly string[] = []): Promise<AuditLogRow[]> {
  return query<AuditLogRow>(
    `SELECT * FROM audit_log WHERE ($2::text[] IS NULL OR action <> ALL($2::text[])) ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit, excludeActions.length ? excludeActions : null],
  );
}

export async function pageByActorActions(
  actor: ActorType,
  actorId: number,
  actions: readonly string[],
  result: string,
  limit: number,
  offset: number,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const where = 'actor = $1 AND actor_id = $2 AND action = ANY($3) AND result = $4';
  const total = (await scalar<number>(`SELECT count(*) FROM audit_log WHERE ${where}`, [actor, actorId, actions, result])) ?? 0;
  const rows = await query<AuditLogRow>(
    `SELECT * FROM audit_log WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
    [actor, actorId, actions, result, limit, offset],
  );
  return { rows, total };
}

export async function existsSince(actor: ActorType, actorId: number, action: string, entityType: string, entityId: number, since: string): Promise<boolean> {
  return (
    (await scalar<boolean>(
      `SELECT count(*) > 0 FROM audit_log WHERE actor = $1 AND actor_id = $2 AND action = $3 AND entity_type = $4 AND entity_id = $5 AND created_at >= $6`,
      [actor, actorId, action, entityType, entityId, since],
    )) === true
  );
}

export async function deleteOlderThan(cutoff: string): Promise<number> {
  return exec('DELETE FROM audit_log WHERE created_at < $1', [cutoff]);
}
