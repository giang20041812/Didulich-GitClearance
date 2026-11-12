import { exec, query } from '../db/pool.js';
import type { DaySession } from '../domain/enums.js';
import { logger } from '../lib/logger.js';
import { minutesOfDay, nowLocal } from '../lib/time.js';
import * as notifications from '../repositories/notificationRepo.js';
import * as webPush from './webPushService.js';

/**
 * Nhắc giờ tham quan theo lịch trình — chạy trong cron mỗi phút, giờ Việt Nam.
 *
 * Giờ bắt đầu đề xuất của từng buổi: Sáng 7:00, Trưa 11:00, Chiều 14:00, Tối 18:00; nhắc trước 30 phút. Cron lỡ vài phút
 * (container nguội) vẫn nhắc cho tới 30 phút sau giờ bắt đầu; quá nữa thì thôi. Các điểm cùng lịch trình, cùng ngày, cùng
 * buổi gộp thành MỘT thông báo (tên điểm đầu tiên).
 *
 * Không gửi trùng khi nhiều instance chạy cùng lúc: nhận việc bằng UPDATE journey_stop SET reminder_sent_at ... WHERE id = ?
 * AND reminder_sent_at IS NULL — chỉ instance cập nhật được 1 dòng mới gửi. Mỗi lần nhắc: thông báo đẩy tới các thiết bị
 * khách đã bật nhắc giờ + một thông báo trong chuông của ứng dụng (dự phòng cho iPhone chưa cài ứng dụng).
 */

export const SESSION_START: Record<DaySession, number> = {
  MORNING: 7 * 60,
  NOON: 11 * 60,
  AFTERNOON: 14 * 60,
  EVENING: 18 * 60,
};
const SESSION_ORDER: DaySession[] = ['MORNING', 'NOON', 'AFTERNOON', 'EVENING'];
const LEAD_MINUTES = 30;
const GRACE_AFTER_START_MINUTES = 30;
const MAX_ROWS_PER_TICK = 500;
const TEMPLATE = 'JOURNEY_REMINDER';
const LABEL: Record<DaySession, string> = { MORNING: 'Sáng', NOON: 'Trưa', AFTERNOON: 'Chiều', EVENING: 'Tối' };

/** "7:00", "14:00" (định dạng H:mm). */
const hourText = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** Buổi đang tới giờ nhắc lúc `nowTime` ("HH:mm[:ss]"): từ 30 phút trước giờ bắt đầu tới 30 phút sau. */
export function dueSessions(nowTime: string): DaySession[] {
  const now = minutesOfDay(nowTime);
  return SESSION_ORDER.filter((s) => {
    const start = SESSION_START[s];
    return now >= start - LEAD_MINUTES && now < start + GRACE_AFTER_START_MINUTES;
  });
}

interface Due {
  stopId: number;
  journeyId: number;
  session: DaySession;
  placeName: string;
  travelerId: number;
  email: string | null;
  bookingCode: string | null;
}

export function message(placeName: string): string {
  return `Có vẻ đã đến lúc tham quan ${placeName} rồi, hãy bấm vào để xem cẩm nang địa điểm nhé`;
}

/** Tab lịch trình của đơn (lịch trình gắn đơn) hoặc trang lịch trình, mở sẵn cẩm nang của điểm. */
export function link(due: Pick<Due, 'bookingCode' | 'stopId' | 'journeyId'>): string {
  if (due.bookingCode && due.bookingCode.trim()) {
    return `/bookings/${encodeURIComponent(due.bookingCode)}?tab=journey&stop=${due.stopId}`;
  }
  return `/journeys/${due.journeyId}?stop=${due.stopId}`;
}

/** Gửi các nhắc giờ tới hạn lúc `now` (LocalDateTime giờ Việt Nam). Trả về tóm tắt cho phản hồi cron. */
export async function sendDue(now: string): Promise<Record<string, unknown>> {
  const due = dueSessions(now.slice(11, 19));
  const result: Record<string, unknown> = {};
  if (due.length === 0) {
    result.due = 'NONE';
    return result;
  }
  const rows = await query<Due>(
    `SELECT s.id AS stop_id, s.journey_id, s.day_session AS session, p.name AS place_name, j.traveler_id, t.email, b.booking_code
       FROM journey_stop s
       JOIN journey j ON j.id = s.journey_id
       JOIN place p ON p.id = s.place_id
       JOIN account t ON t.id = j.traveler_id
       LEFT JOIN booking b ON b.id = j.booking_id
      WHERE j.source = 'TRAVELER' AND s.visit_date = $1 AND s.reminder_sent_at IS NULL AND s.day_session = ANY($2)
        AND t.status = 'ACTIVE'
      ORDER BY s.journey_id, s.day_session, s.sort_order, s.id
      LIMIT ${MAX_ROWS_PER_TICK}`,
    [now.slice(0, 10), due],
  );

  const groups = new Map<string, Due[]>();
  for (const row of rows) {
    const key = `${row.journeyId}:${row.session}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let reminded = 0;
  let pushed = 0;
  const today = now.slice(0, 10);
  for (const group of groups.values()) {
    const first = group[0];
    if (!(await claim(group))) continue;
    reminded++;
    try {
      pushed += await remind(first, group.length, today);
    } catch (err) {
      logger.warn('[Nhắc giờ] Không gửi được nhắc giờ lịch trình', { journeyId: first.journeyId, error: (err as Error).message });
    }
  }
  result.due = due;
  result.reminded = reminded;
  result.pushed = pushed;
  return result;
}

/** Nhận việc: chỉ instance cập nhật được điểm đầu nhóm mới gửi; các điểm còn lại của nhóm đánh dấu theo. */
async function claim(group: Due[]): Promise<boolean> {
  const now = nowLocal();
  const claimed = await exec('UPDATE journey_stop SET reminder_sent_at = $1 WHERE id = $2 AND reminder_sent_at IS NULL', [now, group[0].stopId]);
  if (claimed === 0) return false;
  for (const rest of group.slice(1)) {
    await exec('UPDATE journey_stop SET reminder_sent_at = $1 WHERE id = $2 AND reminder_sent_at IS NULL', [now, rest.stopId]);
  }
  return true;
}

async function remind(first: Due, count: number, today: string): Promise<number> {
  const places = count > 1 ? `${first.placeName} và ${count - 1} điểm khác` : first.placeName;
  const title = `Lịch trình hôm nay · ${LABEL[first.session]} ${hourText(SESSION_START[first.session])}`;
  const body = message(places);
  const url = link(first);
  await saveInApp(first, title, body, url);
  return webPush.sendToTravelerNow(first.travelerId, title, body, url, `journey-${first.journeyId}-${today}-${first.session}`);
}

/** Thông báo trong chuông của ứng dụng (khách thấy khi mở app — iPhone chưa cài ứng dụng không nhận được đẩy). */
async function saveInApp(due: Due, title: string, body: string, url: string): Promise<void> {
  const template = await notifications.findTemplate(TEMPLATE);
  if (!template || due.email == null) return;
  const created = nowLocal();
  await notifications.insert({
    templateCode: template.code,
    channel: 'IN_APP',
    recipientType: 'CUSTOMER',
    recipientEmail: due.email,
    relatedEntityType: 'journey',
    relatedEntityId: due.journeyId,
    payload: { title, message: body, url, journeyId: due.journeyId, stopId: due.stopId, placeName: due.placeName, isRead: false },
    status: 'SENT',
    createdAt: created,
    sentAt: created,
  });
}
