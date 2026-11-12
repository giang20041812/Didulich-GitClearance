import { config } from '../config/env.js';
import { CronExpression, dueSlot } from '../lib/cronExpression.js';
import { logger } from '../lib/logger.js';
import { nowInstant, nowLocal } from '../lib/time.js';
import * as stays from './bookingStayService.js';
import * as retention from './dataRetentionService.js';
import * as reminders from './journeyReminderService.js';

/**
 * Các việc định kỳ. Chế độ `external` (Vercel Cron, systemd timer, cron hệ thống): gọi GET /api/internal/cron/tick mỗi phút — mỗi
 * lượt chạy đồng bộ trong request. Chế độ `in-process` (VPS / Docker chạy liên tục): scheduler.ts gọi {@link tick} mỗi phút và
 * autoCheckout theo chu kỳ riêng.
 */

/** Chặn hai lượt tick chồng nhau trong cùng tiến trình (lượt trước chưa xong). */
let running = false;
/** Khung dọn dữ liệu gần nhất tiến trình này đã chạy. */
let lastRetentionSlot: string | null = null;
let retentionCron: CronExpression | null = null;

function cronOf(): CronExpression {
  retentionCron ??= new CronExpression(config().retention.cron);
  return retentionCron;
}

export interface TickResult {
  busy: boolean;
  failed: boolean;
  body: Record<string, unknown>;
}

export async function tick(now: string = nowLocal()): Promise<TickResult> {
  if (running) return { busy: true, failed: false, body: { status: 'BUSY', time: nowInstant() } };
  running = true;
  try {
    const body: Record<string, unknown> = {};
    let failed = false;
    const cfg = config().retention;
    const slot = cfg.enabled ? dueSlot(cronOf(), Math.max(1, cfg.windowMinutes), now) : null;
    if (!cfg.enabled) body.retention = 'DISABLED';
    else if (slot === null) body.retention = 'NOT_DUE';
    else if (slot === lastRetentionSlot) body.retention = 'ALREADY_DONE';
    else {
      try {
        body.retention = await retention.purge(now);
        lastRetentionSlot = slot;
      } catch (err) {
        failed = true;
        body.retention = 'FAILED';
        logger.error('[Cron] Dọn dữ liệu theo chính sách lưu giữ thất bại', { error: (err as Error).message });
      }
    }
    try {
      body.journeyReminders = await reminders.sendDue(now);
    } catch (err) {
      failed = true;
      body.journeyReminders = 'FAILED';
      logger.error('[Cron] Nhắc giờ lịch trình thất bại', { error: (err as Error).message });
    }
    try {
      body.stayCheckout = await stays.autoCheckout(now);
    } catch (err) {
      failed = true;
      body.stayCheckout = 'FAILED';
      logger.error('[Cron] Tự trả phòng thất bại', { error: (err as Error).message });
    }
    body.status = failed ? 'FAILED' : 'OK';
    body.time = nowInstant();
    return { busy: false, failed, body };
  } finally {
    running = false;
  }
}

/** Chỉ dùng trong test. */
export function resetCronState(): void {
  running = false;
  lastRetentionSlot = null;
  retentionCron = null;
}
