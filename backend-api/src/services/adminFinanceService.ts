import { query, scalar, tx } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type { CommissionStatus, RefundStatus, RefundType } from '../domain/enums.js';
import { HttpError } from '../lib/errors.js';
import { nowLocal } from '../lib/time.js';
import * as accounts from '../repositories/accountRepo.js';
import * as audit from './auditLogService.js';

/**
 * Admin quản lý tài chính: doanh thu, hoàn tiền (refund), affiliate/hoa hồng. Kiểm tra trạng thái bằng code (409) khi duyệt hoàn
 * tiền, không dựa vào ràng buộc DB.
 */

export interface MonthlyRevenueItem {
  year: number;
  month: number;
  totalAmount: number;
  transactionCount: number;
}

export interface RevenueSummaryDto {
  grandTotal: number;
  totalTransactions: number;
  byMonth: MonthlyRevenueItem[];
}

/** Tổng hợp doanh thu từ giao dịch thanh toán thành công. */
export async function getRevenueSummary(): Promise<RevenueSummaryDto> {
  const grandTotal = (await scalar<number>(`SELECT sum(amount) FROM payment_transaction WHERE status = 'SUCCESS'`)) ?? 0;
  const rows = await query<{ year: number; month: number; total: number; count: number }>(
    `SELECT extract(year FROM paid_at)::int AS year, extract(month FROM paid_at)::int AS month, sum(amount) AS total, count(id) AS count
       FROM payment_transaction WHERE status = 'SUCCESS' AND paid_at IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC`,
  );
  const byMonth = rows.map((r) => ({ year: r.year, month: r.month, totalAmount: r.total ?? 0, transactionCount: Number(r.count) }));
  return { grandTotal, totalTransactions: byMonth.reduce((n, m) => n + m.transactionCount, 0), byMonth };
}

// ---- Hoàn tiền ---------------------------------------------------------------------------------------------------------------

export interface RefundDto {
  id: number;
  bookingId: number | null;
  bookingCode: string | null;
  paymentTransactionId: number | null;
  refundType: RefundType;
  amount: number;
  reason: string;
  status: RefundStatus;
  requestedAt: string;
  processedAt: string | null;
  processedByAccountId: number | null;
  processedByName: string | null;
}

const REFUND_SELECT = `SELECT r.id, r.booking_id, b.booking_code, r.payment_transaction_id, r.refund_type, r.amount, r.reason, r.status, r.requested_at,
       r.processed_at, r.processed_by AS processed_by_account_id, a.full_name AS processed_by_name
  FROM refund r LEFT JOIN booking b ON b.id = r.booking_id LEFT JOIN account a ON a.id = r.processed_by`;

export async function getPendingRefunds(): Promise<RefundDto[]> {
  return query<RefundDto>(`${REFUND_SELECT} WHERE r.status = 'PENDING' ORDER BY r.requested_at DESC, r.id DESC`);
}

export async function getAllRefunds(): Promise<RefundDto[]> {
  return query<RefundDto>(`${REFUND_SELECT} ORDER BY r.id`);
}

async function refundDto(id: number): Promise<RefundDto> {
  const [row] = await query<RefundDto>(`${REFUND_SELECT} WHERE r.id = $1`, [id]);
  return row;
}

interface RefundRow {
  id: number;
  status: RefundStatus;
  reason: string;
}

async function lockedRefund(id: number): Promise<RefundRow> {
  const [refund] = await query<RefundRow>('SELECT id, status, reason FROM refund WHERE id = $1 FOR UPDATE', [id]);
  if (!refund) throw new HttpError(404, `Không tìm thấy refund id=${id}`);
  return refund;
}

async function requireActor(actorAccountId: number): Promise<void> {
  if (!(await accounts.findById(actorAccountId))) throw new HttpError(404, `Không tìm thấy tài khoản actor id=${actorAccountId}`);
}

/** Duyệt refund (PENDING → PROCESSED). Đã xử lý rồi thì 409 để tránh duyệt trùng. */
export function approveRefund(id: number, actorAccountId: number): Promise<RefundDto> {
  return tx(async () => {
    const refund = await lockedRefund(id);
    if (refund.status !== 'PENDING') {
      throw new HttpError(409, `Refund đã được xử lý trước đó. Trạng thái hiện tại: ${refund.status} (activeGuard: phòng tránh duyệt trùng)`);
    }
    await requireActor(actorAccountId);
    await updateRow('refund', id, { status: 'PROCESSED', processedBy: actorAccountId, processedAt: nowLocal() });
    await audit.record(actorAccountId, 'REFUND_APPROVED', 'Refund', id, null, { status: refund.status }, { status: 'PROCESSED', processedById: actorAccountId });
    return refundDto(id);
  });
}

/** Từ chối refund (PENDING → REJECTED). */
export function rejectRefund(id: number, actorAccountId: number, reason: string | null | undefined): Promise<RefundDto> {
  return tx(async () => {
    const refund = await lockedRefund(id);
    if (refund.status !== 'PENDING') {
      throw new HttpError(409, `Refund đã được xử lý trước đó. Trạng thái hiện tại: ${refund.status} (activeGuard: phòng tránh xử lý trùng)`);
    }
    await requireActor(actorAccountId);
    await updateRow('refund', id, { status: 'REJECTED', processedBy: actorAccountId, processedAt: nowLocal(), reason: reason ?? refund.reason });
    await audit.record(actorAccountId, 'REFUND_REJECTED', 'Refund', id, reason, { status: refund.status }, { status: 'REJECTED' });
    return refundDto(id);
  });
}

// ---- Affiliate ---------------------------------------------------------------------------------------------------------------

export interface AffiliateLinkDto {
  id: number;
  accountId: number | null;
  accountName: string | null;
  code: string;
  commissionRate: number;
  isActive: boolean;
  createdAt: string;
}

const LINK_SELECT = `SELECT l.id, l.account_id, a.full_name AS account_name, l.code, l.commission_rate, l.is_active, l.created_at
  FROM affiliate_link l LEFT JOIN account a ON a.id = l.account_id`;

export async function getAffiliateLinks(): Promise<AffiliateLinkDto[]> {
  return query<AffiliateLinkDto>(`${LINK_SELECT} ORDER BY l.id`);
}

export function createAffiliateLink(request: { accountId: number; code: string; commissionRate: number }, actorAccountId: number | null): Promise<AffiliateLinkDto> {
  return tx(async () => {
    const existing = await scalar<boolean>('SELECT count(*) > 0 FROM affiliate_link WHERE code = $1', [request.code]);
    if (existing) throw new HttpError(409, `Code affiliate đã tồn tại: ${request.code}`);
    if (!(await accounts.findById(request.accountId))) throw new HttpError(404, `Không tìm thấy tài khoản id=${request.accountId}`);
    const link = await insertRow<{ id: number }>('affiliate_link', {
      accountId: request.accountId,
      code: request.code,
      commissionRate: request.commissionRate,
      isActive: true,
      createdAt: nowLocal(),
    });
    await audit.record(actorAccountId, 'AFFILIATE_LINK_CREATED', 'AffiliateLink', link.id, null, null, {
      code: request.code,
      commissionRate: String(request.commissionRate),
    });
    const [dto] = await query<AffiliateLinkDto>(`${LINK_SELECT} WHERE l.id = $1`, [link.id]);
    return dto;
  });
}

export function deactivateAffiliateLink(id: number, actorAccountId: number | null): Promise<void> {
  return tx(async () => {
    const updated = await updateRow('affiliate_link', id, { isActive: false });
    if (!updated) throw new HttpError(404, `Không tìm thấy affiliate link id=${id}`);
    await audit.record(actorAccountId, 'AFFILIATE_LINK_DEACTIVATED', 'AffiliateLink', id, null, { isActive: 'true' }, { isActive: 'false' });
  });
}

// ---- Hoa hồng ----------------------------------------------------------------------------------------------------------------

export interface CommissionLedgerDto {
  id: number;
  affiliateLinkId: number | null;
  affiliateCode: string | null;
  affiliateAccountId: number | null;
  affiliateAccountName: string | null;
  bookingId: number | null;
  bookingCode: string | null;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
  paidAt: string | null;
}

export async function getCommissionSummary() {
  const sums = async (status: CommissionStatus): Promise<number> =>
    (await scalar<number>('SELECT sum(amount) FROM commission_ledger WHERE status = $1', [status])) ?? 0;
  const items = await query<CommissionLedgerDto>(
    `SELECT cl.id, cl.affiliate_link_id, l.code AS affiliate_code, l.account_id AS affiliate_account_id, a.full_name AS affiliate_account_name,
            cl.booking_id, b.booking_code, cl.amount, cl.status, cl.created_at, cl.paid_at
       FROM commission_ledger cl LEFT JOIN affiliate_link l ON l.id = cl.affiliate_link_id LEFT JOIN account a ON a.id = l.account_id
       LEFT JOIN booking b ON b.id = cl.booking_id
      ORDER BY cl.created_at DESC, cl.id DESC`,
  );
  return {
    totalPending: await sums('PENDING'),
    totalApproved: await sums('APPROVED'),
    totalPaid: await sums('PAID'),
    totalRejected: await sums('REJECTED'),
    items,
  };
}
