import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Gửi email: qua HTTPS API của Resend khi có RESEND_API_KEY (một request ngắn, hợp với container serverless), ngược lại
 * qua SMTP (MAIL_HOST / MAIL_PORT / MAIL_USERNAME / MAIL_PASSWORD).
 *
 * Gửi ĐỒNG BỘ trong request: trên nền tảng serverless container bị tạm dừng ngay khi request trả về, nên tác vụ nền có thể
 * không bao giờ chạy xong và OTP không tới. Bên gọi tự chịu trách nhiệm không giữ transaction DB trong lúc gửi. Timeout
 * ngắn (kết nối 2 giây, đọc 5 giây). Lỗi gửi chỉ ghi log, không ném ra ngoài.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Email đã soạn xong, chờ gửi (service soạn trong transaction, route gửi sau khi transaction kết thúc). */
export interface OutgoingMail {
  to: string;
  subject: string;
  body: string;
}

function resendConfigured(): boolean {
  const m = config().mail;
  return m.resendApiKey.trim() !== '' && m.from.trim() !== '';
}

function smtpConfigured(): boolean {
  const m = config().mail;
  return m.host.trim() !== '' && m.username.trim() !== '';
}

export function isConfigured(): boolean {
  return resendConfigured() || smtpConfigured();
}

/** Cảnh báo MỘT lần khi khởi động, để thiếu cấu hình lộ ra ngay lúc deploy. */
export function warnIfUnconfigured(): void {
  const m = config().mail;
  if (m.resendApiKey.trim() !== '' && m.from.trim() === '') {
    logger.warn('[Mail] Đã đặt RESEND_API_KEY nhưng thiếu MAIL_FROM (địa chỉ gửi thuộc domain đã xác minh ở Resend) — không dùng được Resend.');
  }
  if (!isConfigured()) {
    logger.warn(
      '[Mail] Chưa cấu hình gửi email (RESEND_API_KEY + MAIL_FROM, hoặc MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD): OTP quên mật khẩu sẽ KHÔNG được gửi.',
    );
  } else {
    logger.info(`[Mail] Gửi email qua ${resendConfigured() ? 'Resend API' : `SMTP ${m.host}`}`);
  }
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at <= 1) return `***${at >= 0 ? email.slice(at) : ''}`;
  return `${email[0]}***${email.slice(at)}`;
}

let transporter: Transporter | undefined;

function smtp(): Transporter {
  if (!transporter) {
    const m = config().mail;
    transporter = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.port === 465,
      requireTLS: m.port !== 465,
      auth: { user: m.username, pass: m.password },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }
  return transporter;
}

/** Gửi email đã soạn; null thì bỏ qua. Không ném lỗi. */
export async function send(mail: OutgoingMail | null | undefined): Promise<void> {
  if (mail) await sendText(mail.to, mail.subject, mail.body);
}

export async function sendText(to: string, subject: string, body: string): Promise<void> {
  const m = config().mail;
  if (resendConfigured()) {
    await sendViaResend(to, subject, body);
    return;
  }
  if (!smtpConfigured()) {
    logger.warn('Chưa cấu hình gửi email — bỏ qua gửi email', { to: maskEmail(to) });
    return;
  }
  try {
    await smtp().sendMail({ from: m.from.trim() !== '' ? m.from : m.username, to, subject, text: body });
    logger.info('Đã gửi email', { subject, to: maskEmail(to) });
  } catch (err) {
    logger.error('Gửi email thất bại', { to: maskEmail(to), error: (err as Error).message });
  }
}

async function sendViaResend(to: string, subject: string, body: string): Promise<void> {
  const m = config().mail;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), m.timeoutMs);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${m.resendApiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: m.from, to: [to], subject, text: body }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    logger.info('Đã gửi email (Resend)', { subject, to: maskEmail(to) });
  } catch (err) {
    // Không ghi nội dung email (chứa OTP) hay API key; chỉ lý do lỗi.
    logger.error('Gửi email qua Resend thất bại', { to: maskEmail(to), error: (err as Error).message });
  } finally {
    clearTimeout(timer);
  }
}
