import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Cấu hình ứng dụng đọc từ biến môi trường (thay cho application.yml của bản Spring Boot).
 *
 * Tên biến giữ nguyên như bản Java (DB_URL, JWT_SECRET, CORS_ALLOWED_ORIGINS...) nên cấu hình triển khai hiện có
 * dùng lại được; hồ sơ chạy lấy từ APP_PROFILE, nếu trống thì dùng SPRING_PROFILES_ACTIVE (tên cũ).
 */

/** Nạp file KEY=VALUE vào process.env (không đè biến đã có). Dùng cho .env / .env.local khi dev. */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  const candidates = [
    '.env.local',
    '.env',
    'backend-api/.env.local',
    'backend-api/.env',
    '../backend-api/.env',
    '../.env',
  ];
  for (const rel of candidates) {
    const file = path.resolve(cwd, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

const str = (name: string, fallback = ''): string => {
  const v = process.env[name];
  return v === undefined ? fallback : v;
};

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
};

const list = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean | { rejectUnauthorized: boolean };
  /** Transaction pooler (Supabase, cổng 6543) không giữ prepared statement giữa các transaction. */
  noPrepare: boolean;
  poolMax: number;
  poolMin: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeSeconds: number;
  keepAlive: boolean;
}

/**
 * Chuyển DB_URL dạng JDBC (jdbc:postgresql://host:port/db?sslmode=require&prepareThreshold=0) hoặc dạng
 * postgres://user:pass@host:port/db sang cấu hình kết nối của node-postgres.
 */
export function parseDbUrl(rawUrl: string, username: string, password: string): Omit<DbConfig, 'poolMax' | 'poolMin' | 'connectionTimeoutMs' | 'idleTimeoutMs' | 'maxLifetimeSeconds' | 'keepAlive'> {
  const normalized = rawUrl.trim().replace(/^jdbc:/i, '').replace(/^postgresql:/i, 'postgres:');
  const url = new URL(normalized);
  const params = url.searchParams;
  const sslmode = (params.get('sslmode') ?? '').toLowerCase();
  const ssl = params.get('ssl') === 'true' || ['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslmode);
  const prepareThreshold = params.get('prepareThreshold');
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    user: username || decodeURIComponent(url.username || '') || params.get('user') || 'postgres',
    password: password || decodeURIComponent(url.password || '') || params.get('password') || '',
    // Supabase pooler dùng chứng chỉ do chính nó cấp: bật TLS nhưng không ép xác minh chuỗi CA như JDBC "require".
    ssl: ssl ? { rejectUnauthorized: sslmode === 'verify-full' || sslmode === 'verify-ca' } : false,
    noPrepare: prepareThreshold === '0' || url.port === '6543',
  };
}

export interface AppConfig {
  profile: string;
  production: boolean;
  port: number;
  host: string;
  db: DbConfig;
  jwtSecret: string;
  cors: { allowedOrigins: string[]; originPatterns: string[]; devWildcards: boolean };
  seed: { initialPassword: string; adminEmail: string; demoData: boolean; demoPassword: string };
  scheduling: { mode: 'in-process' | 'external' };
  cronSecret: string;
  retention: {
    enabled: boolean;
    auditLogDays: number;
    passwordResetTokenDays: number;
    notificationDays: number;
    cron: string;
    windowMinutes: number;
  };
  stay: { autoCheckoutDelayMs: number; autoCheckoutInitialDelayMs: number };
  mail: {
    host: string;
    port: number;
    username: string;
    password: string;
    from: string;
    resendApiKey: string;
    timeoutMs: number;
    connectTimeoutMs: number;
  };
  passwordReset: {
    otpTtlMinutes: number;
    maxAttempts: number;
    cooldownSeconds: number;
    maxPerHour: number;
    minResponseMs: number;
    logOtp: boolean;
  };
  push: { vapidPublicKey: string; vapidPrivateKey: string; subject: string };
  media: { activeProvider: string };
  supabase: { url: string; serviceKey: string; storageBucket: string };
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string };
  geocoding: {
    provider: string;
    vietmapApiKey: string;
    vietmapUrl: string;
    vietmapPlaceUrl: string;
    nominatimUrl: string;
    nominatimUserAgent: string;
  };
  sepayWebhookSecret: string;
  googleClientId: string;
  firebaseProjectId: string;
  weatherEnabled: boolean;
  features: { onlinePayment: boolean; redirectBooking: boolean; carpool: boolean };
}

const PRODUCTION_PROFILES = new Set(['prod', 'supabase']);

export function loadConfig(): AppConfig {
  const profile = (str('APP_PROFILE') || str('SPRING_PROFILES_ACTIVE') || 'dev').split(',')[0].trim() || 'dev';
  const production = PRODUCTION_PROFILES.has(profile);
  const supabase = profile === 'supabase';

  const dbUrl = str('DB_URL') || str('DATABASE_URL') || 'postgres://localhost:5432/viettrek';
  const dbBase = parseDbUrl(dbUrl, str('DB_USERNAME'), str('DB_PASSWORD'));

  const jwtSecret = str('JWT_SECRET');

  return {
    profile,
    production,
    port: num('PORT', num('SERVER_PORT', 8080)),
    host: str('SERVER_ADDRESS', '0.0.0.0'),
    db: {
      ...dbBase,
      poolMax: num('HIKARI_MAX_POOL_SIZE', supabase ? 5 : 20),
      poolMin: num('HIKARI_MIN_IDLE', supabase ? 1 : 5),
      connectionTimeoutMs: num('HIKARI_CONN_TIMEOUT', 10000),
      idleTimeoutMs: num('HIKARI_IDLE_TIMEOUT', supabase ? 120000 : 600000),
      maxLifetimeSeconds: Math.floor(num('HIKARI_MAX_LIFETIME', supabase ? 300000 : 1800000) / 1000),
      keepAlive: true,
    },
    jwtSecret,
    cors: {
      allowedOrigins: list(str('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:3000')),
      originPatterns: list(str('CORS_ALLOWED_ORIGIN_PATTERNS')),
      devWildcards: bool('CORS_ALLOW_DEV_WILDCARDS', !production),
    },
    seed: {
      initialPassword: str('APP_SEED_INITIAL_PASSWORD'),
      adminEmail: str('APP_SEED_ADMIN_EMAIL', 'admin@dulichso.vn'),
      demoData: bool('APP_SEED_DEMO_DATA', false),
      demoPassword: str('APP_SEED_DEMO_PASSWORD'),
    },
    scheduling: {
      mode: (str('APP_SCHEDULING_MODE', supabase ? 'external' : 'in-process').trim().toLowerCase() === 'external'
        ? 'external'
        : 'in-process'),
    },
    cronSecret: str('CRON_SECRET').trim(),
    retention: {
      enabled: bool('RETENTION_ENABLED', true),
      auditLogDays: num('RETENTION_AUDIT_LOG_DAYS', 180),
      passwordResetTokenDays: num('RETENTION_RESET_TOKEN_DAYS', 7),
      notificationDays: num('RETENTION_NOTIFICATION_DAYS', 90),
      cron: str('RETENTION_CRON', '0 30 3 * * *'),
      windowMinutes: num('RETENTION_WINDOW_MINUTES', 15),
    },
    stay: {
      autoCheckoutDelayMs: num('APP_STAY_AUTO_CHECKOUT_DELAY_MS', 300000),
      autoCheckoutInitialDelayMs: num('APP_STAY_AUTO_CHECKOUT_INITIAL_DELAY_MS', 60000),
    },
    mail: {
      host: str('MAIL_HOST'),
      port: num('MAIL_PORT', 587),
      username: str('MAIL_USERNAME'),
      password: str('MAIL_PASSWORD'),
      from: str('MAIL_FROM'),
      resendApiKey: str('RESEND_API_KEY'),
      timeoutMs: num('MAIL_TIMEOUT_MS', 5000),
      connectTimeoutMs: num('MAIL_CONNECT_TIMEOUT_MS', 2000),
    },
    passwordReset: {
      otpTtlMinutes: num('PASSWORD_RESET_OTP_TTL_MINUTES', 10),
      maxAttempts: num('PASSWORD_RESET_MAX_ATTEMPTS', 5),
      cooldownSeconds: num('PASSWORD_RESET_COOLDOWN_SECONDS', 60),
      maxPerHour: num('PASSWORD_RESET_MAX_PER_HOUR', 5),
      minResponseMs: num('PASSWORD_RESET_MIN_RESPONSE_MS', 1500),
      // Chỉ in OTP ra log khi dev; profile prod/supabase luôn tắt (không đổi được qua biến môi trường).
      logOtp: production ? false : bool('PASSWORD_RESET_LOG_OTP', false),
    },
    push: {
      vapidPublicKey: str('PUSH_VAPID_PUBLIC_KEY'),
      vapidPrivateKey: str('PUSH_VAPID_PRIVATE_KEY'),
      subject: str('PUSH_SUBJECT', 'mailto:admin@viettrek.vn'),
    },
    media: { activeProvider: str('ACTIVE_MEDIA_PROVIDER', 'CLOUDINARY') },
    supabase: {
      url: str('SUPABASE_URL'),
      serviceKey: str('SUPABASE_SERVICE_KEY'),
      storageBucket: str('SUPABASE_STORAGE_BUCKET', 'viettrek-media'),
    },
    cloudinary: {
      cloudName: str('CLOUDINARY_CLOUD_NAME'),
      apiKey: str('CLOUDINARY_API_KEY'),
      apiSecret: str('CLOUDINARY_API_SECRET'),
    },
    geocoding: {
      provider: str('GEOCODING_PROVIDER', 'AUTO'),
      vietmapApiKey: str('VIETMAP_API_KEY'),
      vietmapUrl: str('VIETMAP_URL', 'https://maps.vietmap.vn/api/search/v3'),
      vietmapPlaceUrl: str('VIETMAP_PLACE_URL', 'https://maps.vietmap.vn/api/place/v3'),
      nominatimUrl: str('NOMINATIM_URL', 'https://nominatim.openstreetmap.org/search'),
      nominatimUserAgent: str(
        'NOMINATIM_USER_AGENT',
        'VietTrekBooking/1.0 (https://viettrek-app.vercel.app; contact: admin@dulichso.vn)',
      ),
    },
    sepayWebhookSecret: str('SEPAY_WEBHOOK_SECRET'),
    googleClientId: str('GOOGLE_OAUTH_CLIENT_ID'),
    firebaseProjectId: str('FIREBASE_PROJECT_ID', 'dulichso-6ac41'),
    weatherEnabled: bool('WEATHER_ENABLED', true),
    features: {
      onlinePayment: bool('ENABLE_ONLINE_PAYMENT', true),
      redirectBooking: bool('ENABLE_REDIRECT_BOOKING', true),
      carpool: bool('ENABLE_CARPOOL', false),
    },
  };
}

/** Secret JWT dùng cho dev khi JWT_SECRET trống: sinh ngẫu nhiên mỗi lần chạy (token cũ mất hiệu lực khi khởi động lại). */
export function ephemeralJwtSecret(): string {
  return crypto.randomBytes(48).toString('base64');
}

let current: AppConfig | undefined;

/** Cấu hình hiện hành (nạp lười, dùng chung toàn tiến trình). Test có thể gọi {@link resetConfig} sau khi đổi process.env. */
export function config(): AppConfig {
  if (!current) current = loadConfig();
  return current;
}

export function resetConfig(): void {
  current = undefined;
}
