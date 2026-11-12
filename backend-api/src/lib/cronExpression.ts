/**
 * Biểu thức cron 6 trường của Spring (giây phút giờ ngày-trong-tháng tháng thứ), tính theo giờ địa phương dạng chuỗi
 * "YYYY-MM-DDTHH:mm:ss" (không múi giờ). Hỗ trợ `*`, `?`, số, khoảng `a-b`, bước `x/n`, danh sách, tên tháng / thứ. Không hỗ trợ
 * L, W, # (các cron của dự án không dùng).
 */

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseField(spec: string, min: number, max: number, names?: string[], nameBase = 0): Set<number> {
  const out = new Set<number>();
  const value = (token: string): number => {
    const upper = token.toUpperCase();
    if (names) {
      const i = names.indexOf(upper);
      if (i >= 0) return i + nameBase;
    }
    const n = Number(token);
    if (!Number.isInteger(n)) throw new Error(`Giá trị cron không hợp lệ: ${token}`);
    return n;
  };
  for (const part of spec.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bước cron không hợp lệ: ${part}`);
    let from: number;
    let to: number;
    if (range === '*' || range === '?') {
      from = min;
      to = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      from = value(a);
      to = value(b);
    } else {
      from = value(range);
      to = stepText === undefined ? from : max;
    }
    if (from < min || to > max || from > to) throw new Error(`Giá trị cron ngoài phạm vi: ${part}`);
    for (let n = from; n <= to; n += step) out.add(n);
  }
  return out;
}

export class CronExpression {
  private readonly seconds: Set<number>;
  private readonly minutes: Set<number>;
  private readonly hours: Set<number>;
  private readonly days: Set<number>;
  private readonly months: Set<number>;
  private readonly weekdays: Set<number>;
  private readonly anyDay: boolean;
  private readonly anyWeekday: boolean;

  constructor(expression: string) {
    const f = expression.trim().split(/\s+/);
    if (f.length !== 6) throw new Error(`Biểu thức cron cần 6 trường: "${expression}"`);
    this.seconds = parseField(f[0], 0, 59);
    this.minutes = parseField(f[1], 0, 59);
    this.hours = parseField(f[2], 0, 23);
    this.days = parseField(f[3], 1, 31);
    this.months = parseField(f[4], 1, 12, MONTH_NAMES, 1);
    const weekdays = parseField(f[5], 0, 7, DAY_NAMES, 0);
    if (weekdays.has(7)) weekdays.add(0);
    this.weekdays = weekdays;
    this.anyDay = f[3] === '*' || f[3] === '?';
    this.anyWeekday = f[5] === '*' || f[5] === '?';
  }

  private dayMatches(y: number, m: number, d: number): boolean {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dom = this.days.has(d);
    const wd = this.weekdays.has(dow);
    if (this.anyDay && this.anyWeekday) return true;
    if (this.anyDay) return wd;
    if (this.anyWeekday) return dom;
    return dom || wd;
  }

  /** Thời điểm khớp đầu tiên SAU `after` (đúng như CronExpression.next của Spring), hoặc null nếu không có trong 5 năm tới. */
  next(after: string): string | null {
    const t = new Date(`${after.slice(0, 19)}Z`);
    t.setUTCMilliseconds(0);
    t.setUTCSeconds(t.getUTCSeconds() + 1);
    const limit = t.getTime() + 5 * 366 * 86400000;
    while (t.getTime() < limit) {
      const y = t.getUTCFullYear();
      const mo = t.getUTCMonth() + 1;
      if (!this.months.has(mo)) {
        t.setTime(Date.UTC(y, mo, 1));
        continue;
      }
      if (!this.dayMatches(y, mo, t.getUTCDate())) {
        t.setTime(Date.UTC(y, mo - 1, t.getUTCDate() + 1));
        continue;
      }
      if (!this.hours.has(t.getUTCHours())) {
        t.setTime(Date.UTC(y, mo - 1, t.getUTCDate(), t.getUTCHours() + 1));
        continue;
      }
      if (!this.minutes.has(t.getUTCMinutes())) {
        t.setTime(Date.UTC(y, mo - 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes() + 1));
        continue;
      }
      if (!this.seconds.has(t.getUTCSeconds())) {
        t.setUTCSeconds(t.getUTCSeconds() + 1);
        continue;
      }
      return t.toISOString().slice(0, 19);
    }
    return null;
  }
}

/** Thời điểm chạy theo lịch `cron` nằm trong (now - window, now]; null nếu lúc này không thuộc khung nào. */
export function dueSlot(cron: CronExpression, windowMinutes: number, now: string): string | null {
  const start = new Date(`${now.slice(0, 19)}Z`);
  start.setUTCMinutes(start.getUTCMinutes() - windowMinutes);
  const slot = cron.next(start.toISOString().slice(0, 19));
  return slot !== null && slot <= now.slice(0, 19) ? slot : null;
}
