/**
 * Logger gọn: một dòng JSON/sự kiện, ghi ra stdout (info/debug) hoặc stderr (warn/error). Không kéo thêm thư viện;
 * nền tảng triển khai (Docker, Vercel, systemd) tự thu stdout/stderr.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return ORDER[raw] ?? ORDER.info;
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...fields });
  if (level === 'warn' || level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
