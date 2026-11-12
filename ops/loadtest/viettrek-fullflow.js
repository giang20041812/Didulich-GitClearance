// Kiểm thử tải toàn luồng trên production: khách duyệt web → đặt phòng → chờ xác nhận → thanh toán (NCC/Admin ghi nhận),
// cùng lúc NCC và Admin làm việc trên cổng quản trị.
//
//   k6 run ops/loadtest/viettrek-fullflow.js                 # ~500 khách, ~300 đơn, 3 NCC, 2 Admin, ~13 phút
//   k6 run -e QUICK=1 ops/loadtest/viettrek-fullflow.js      # chạy thử: vài đơn, 1 NCC, 1 Admin, ~3 phút
//
// Tài khoản Admin/NCC đọc từ ACCOUNTS (mặc định D:/Viettrek/tools/loadtest-accounts.json, ngoài repo):
//   { "admin": {"identifier","password"}, "partner": {"identifier","password","placeId"?} }
//
// An toàn dữ liệu:
//  - Chỉ đặt vào homestay của NCC trong file tài khoản (placeId nếu có, không thì mọi homestay của NCC đó).
//  - Mọi đơn mang mã lượt chạy RUN (vd K6LOAD-10071530) trong tên khách; NCC/Admin chỉ xử lý đơn có mã này.
//  - Ngày nhận phòng 200-520 ngày tới (không giữ phòng của khách thật), SĐT +999… (mã quốc gia chưa cấp), email @example.com.
//  - teardown: hủy/từ chối mọi đơn chưa thanh toán của lượt chạy, xóa tài khoản khách test, đăng xuất các phiên cổng.
//    Đơn đã thanh toán (trạng thái cuối) chỉ xóa được bằng SQL: ops/loadtest/cleanup-k6load.sql.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://viettrek-app.vercel.app').replace(/\/$/, '');
const QUICK = __ENV.QUICK === '1';
const ACCOUNTS = JSON.parse(open(__ENV.ACCOUNTS || 'D:/Viettrek/tools/loadtest-accounts.json'));

const BROWSE_PEAK = Number(__ENV.BROWSE_PEAK || (QUICK ? 3 : 380));
const BOOK_PER_MIN = Number(__ENV.BOOK_PER_MIN || (QUICK ? 4 : 39));
const PARTNER_VUS = Number(__ENV.PARTNER_VUS || (QUICK ? 1 : 3));
const ADMIN_VUS = Number(__ENV.ADMIN_VUS || (QUICK ? 1 : 2));
const CONTENTION = Number(__ENV.CONTENTION || (QUICK ? 0 : 20));
const TRAVELER_POOL = Number(__ENV.TRAVELER_POOL || (QUICK ? 2 : 30));
/** Phần trăm đơn do Admin xử lý (theo id đơn), phần còn lại NCC xử lý — tránh Admin và NCC giành nhau cùng một đơn. */
const ADMIN_SHARE = 30;

const PORTAL_MINUTES = QUICK ? 3 : 13.5;

const bookingCreated = new Counter('booking_created');
const bookingConflict = new Counter('booking_conflict');
const bookingRateLimited = new Counter('booking_rate_limited');
const bookingError = new Counter('booking_error');
const guestCancelled = new Counter('guest_cancelled');
const timeToConfirm = new Trend('time_to_confirm', true);
const timeToPaid = new Trend('time_to_paid', true);
const workflowDone = new Counter('workflow_done');
const workflowConflict = new Counter('workflow_conflict');
const contentionSuccess = new Counter('contention_success');
const contentionRejected = new Counter('contention_rejected');
const slowApi = new Rate('api_slower_than_5s');

const OK_OR_EXPECTED = http.expectedStatuses({ min: 200, max: 299 }, 409, 429);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      startVUs: 0,
      stages: QUICK
        ? [{ duration: '30s', target: BROWSE_PEAK }, { duration: '1m', target: BROWSE_PEAK }, { duration: '10s', target: 0 }]
        : [
            { duration: '1m', target: Math.round(BROWSE_PEAK * 0.1) },
            { duration: '1m', target: Math.round(BROWSE_PEAK * 0.3) },
            { duration: '2m', target: Math.round(BROWSE_PEAK * 0.6) },
            { duration: '2m', target: BROWSE_PEAK },
            { duration: '3m', target: BROWSE_PEAK },
            { duration: '1m', target: 0 },
          ],
      gracefulRampDown: '30s',
    },
    booking: {
      executor: 'ramping-arrival-rate',
      exec: 'bookingJourney',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: QUICK ? 2 : 150,
      maxVUs: QUICK ? 4 : 250,
      stages: QUICK
        ? [{ duration: '30s', target: BOOK_PER_MIN }, { duration: '1m', target: BOOK_PER_MIN }, { duration: '10s', target: 0 }]
        : [
            { duration: '1m', target: Math.round(BOOK_PER_MIN * 0.55) },
            { duration: '1m', target: BOOK_PER_MIN },
            { duration: '6m', target: BOOK_PER_MIN },
            { duration: '1m', target: 0 },
          ],
      gracefulStop: '4m',
    },
    partner: {
      executor: 'constant-vus',
      exec: 'partnerPortal',
      vus: PARTNER_VUS,
      duration: `${PORTAL_MINUTES * 60}s`,
      gracefulStop: '1m',
    },
    admin: {
      executor: 'constant-vus',
      exec: 'adminPortal',
      vus: ADMIN_VUS,
      duration: `${PORTAL_MINUTES * 60}s`,
      gracefulStop: '1m',
    },
    ...(CONTENTION > 0
      ? {
          contention: {
            executor: 'per-vu-iterations',
            exec: 'contention',
            vus: CONTENTION,
            iterations: 1,
            startTime: '2m',
            maxDuration: '2m',
          },
        }
      : {}),
  },
  thresholds: {
    // Hệ thống sập hẳn thì dừng sớm, không đốt container / kết nối Supabase vô ích.
    http_req_failed: [{ threshold: 'rate<0.30', abortOnFail: true, delayAbortEval: '1m' }],
    checks: ['rate>0.95'],
    'http_req_duration{type:static}': ['p(95)<1000'],
    'http_req_duration{actor:guest,type:api}': ['p(95)<3000'],
    'http_req_duration{name:booking_create}': ['p(95)<5000'],
    'http_req_duration{actor:partner}': ['p(95)<3000'],
    'http_req_duration{actor:admin}': ['p(95)<3000'],
    booking_error: ['count<5'],
  },
  setupTimeout: '10m',
  teardownTimeout: '10m',
  discardResponseBodies: true,
  userAgent: 'k6-loadtest-viettrek',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------- tiện ích

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (min, max) => sleep(min + Math.random() * (max - min));
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (days) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + days); return d; };
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
/** +999 là mã quốc gia ITU chưa cấp: số này không thể là của người thật. */
const fakePhone = () => `+999${digits(9)}`;
/** Quyết định cố định theo id đơn (mọi VU cùng kết luận cho cùng một đơn). */
const bucket = (id) => (Number(id) * 7919) % 100;
/** Quyết định xử lý đơn — băm khác với {@link bucket} để cả NCC lẫn Admin đều có xác nhận, từ chối, thanh toán, hủy. */
const decision = (id) => (Number(id) * 104729 + 13) % 100;

function api(method, path, { body, token, bookingToken, name, actor, parse, expect } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (bookingToken) headers['X-Booking-Token'] = bookingToken;
  const params = {
    headers,
    tags: { type: 'api', name, actor },
    timeout: '60s',
    responseType: parse ? 'text' : 'none',
  };
  if (expect) params.responseCallback = expect;
  const res = http.request(method, `${BASE_URL}${path}`, body === undefined ? null : JSON.stringify(body), params);
  slowApi.add(res.timings.duration > 5000, { actor });
  return res;
}

function ok(res, name) {
  return check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
}

function json(res) {
  try { return res.json(); } catch (e) { return null; }
}

function page(path, assets, actor) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { type: 'static', name: 'html', actor } });
  check(res, { 'html 200': (r) => r.status === 200 });
  if (assets && assets.length) {
    const rs = http.batch(assets.map((a) => ['GET', `${BASE_URL}${a}`, null, { tags: { type: 'static', name: 'asset', actor } }]));
    check(rs, { 'assets 200': (all) => all.every((r) => r.status === 200) });
  }
}

const firstIteration = () => exec.vu.iterationInScenario === 0;

// ---------------------------------------------------------------- setup / teardown

function portalLogin(account, label) {
  const res = api('POST', '/api/v1/auth/portal/login', {
    body: { identifier: account.identifier, password: account.password }, name: 'portal_login', actor: label, parse: true,
  });
  const data = json(res);
  if (res.status !== 200 || !data || !data.token) {
    throw new Error(`Đăng nhập ${label} thất bại: HTTP ${res.status} ${res.body ? String(res.body).slice(0, 200) : ''}`);
  }
  return data.token;
}

export function setup() {
  for (const k of ['admin', 'partner']) {
    if (!ACCOUNTS[k] || !ACCOUNTS[k].identifier || !ACCOUNTS[k].password) {
      throw new Error(`Thiếu tài khoản ${k} trong file ACCOUNTS`);
    }
  }
  const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString(); // giờ Việt Nam
  const runId = `k6load-${stamp.slice(5, 7)}${stamp.slice(8, 10)}${stamp.slice(11, 13)}${stamp.slice(14, 16)}`;
  const mark = runId.toUpperCase();

  const home = json(http.get(`${BASE_URL}/api/public/home`, { responseType: 'text' })) || {};
  const browseHomestays = (home.homestays || []).map((h) => h.id).filter((id) => id != null);
  const html = http.get(`${BASE_URL}/`, { responseType: 'text' });
  if (html.status !== 200) throw new Error(`Trang chủ trả ${html.status}`);
  const assets = [...new Set(html.body.match(/\/assets\/[^"'\s)]+\.(?:js|css)/g) || [])];

  const partnerTokens = [];
  for (let i = 0; i < Math.max(1, PARTNER_VUS); i++) partnerTokens.push(portalLogin(ACCOUNTS.partner, 'partner'));
  const adminTokens = [];
  for (let i = 0; i < Math.max(1, ADMIN_VUS); i++) adminTokens.push(portalLogin(ACCOUNTS.admin, 'admin'));

  // Homestay của NCC → các loại phòng đang bán (lấy từ trang chi tiết công khai, như khách thấy).
  const namesRes = api('GET', '/api/v1/partner/homestays/names', { token: partnerTokens[0], name: 'partner_homestay_names', actor: 'partner', parse: true });
  const names = json(namesRes) || [];
  let placeIds = names.map((h) => h.id).filter((id) => id != null);
  if (ACCOUNTS.partner.placeId) placeIds = placeIds.filter((id) => Number(id) === Number(ACCOUNTS.partner.placeId));
  if (!placeIds.length) throw new Error(`NCC không có homestay phù hợp (names=${JSON.stringify(names).slice(0, 300)})`);

  const rooms = [];
  for (const placeId of placeIds) {
    const detail = json(api('GET', `/api/public/places/${placeId}`, { name: 'place_detail', actor: 'guest', parse: true }));
    for (const r of (detail && detail.rooms) || []) {
      if (r.status === 'ACTIVE' && (r.totalRoomCount || 0) > 0) {
        rooms.push({ placeId, roomTypeId: r.id, maxOcc: Math.max(1, r.maxOccupancy || 1), totalRooms: r.totalRoomCount, name: r.name });
      }
    }
  }
  if (!rooms.length) throw new Error(`Homestay ${placeIds.join(',')} không có loại phòng đang bán`);

  // Tài khoản khách test (đăng ký không cần OTP, không gửi email; mỗi lần đăng ký Admin nhận 1 thông báo).
  const travelers = [];
  for (let i = 1; i <= TRAVELER_POOL; i++) {
    const email = `${runId}.p${i}@example.com`;
    const password = `K6-${digits(10)}aA`;
    const res = api('POST', '/api/v1/auth/traveler/register', {
      body: { fullName: `${mark} Khách ${i}`, email, password, confirmPassword: password }, name: 'traveler_register', actor: 'guest',
    });
    if (res.status === 201) travelers.push({ email, password });
  }

  // Tranh phòng: loại phòng ít phòng nhất, một ngày rất xa riêng cho lượt chạy này.
  let contentionTarget = null;
  if (CONTENTION > 0) {
    const room = rooms.slice().sort((a, b) => a.totalRooms - b.totalRooms)[0];
    const checkIn = addDays(600 + (Number(stamp.slice(14, 16)) % 60));
    const checkOut = new Date(checkIn.getTime() + 86400000);
    const avail = json(api('GET', `/api/public/bookings/rooms/${room.roomTypeId}/check-availability?checkIn=${isoDate(checkIn)}&checkOut=${isoDate(checkOut)}&roomCount=1`,
      { name: 'check_availability', actor: 'guest', parse: true }));
    contentionTarget = { ...room, checkIn: isoDate(checkIn), checkOut: isoDate(checkOut), availableBefore: avail ? avail.minAvailableRooms : null };
  }

  console.log(`RUN=${runId} assets=${assets.length} homestays=${placeIds.join(',')} rooms=${rooms.map((r) => `${r.roomTypeId}(${r.totalRooms})`).join(',')} travelers=${travelers.length} contention=${JSON.stringify(contentionTarget)}`);
  return { runId, mark, assets, rooms, travelers, partnerTokens, adminTokens, contentionTarget,
    browseHomestays: [...new Set([...browseHomestays, ...rooms.map((r) => r.placeId)])] };
}

/** Trang của Spring Data: {content, totalPages} hoặc {content, page: {totalPages}}. */
function pageOf(res) {
  const body = json(res) || {};
  const content = body.content || [];
  const totalPages = body.totalPages != null ? body.totalPages : body.page && body.page.totalPages != null ? body.page.totalPages : 1;
  return { content, totalPages };
}

function listRunBookings(data, statuses, maxPages = 30) {
  const found = [];
  for (let pageNo = 0; pageNo < maxPages; pageNo++) {
    const { content, totalPages } = pageOf(api('GET', `/api/v1/admin/bookings?status=${statuses}&keyword=${encodeURIComponent(data.runId)}&size=100&page=${pageNo}&sortDir=asc`,
      { token: data.adminTokens[0], name: 'admin_bookings', actor: 'admin', parse: true }));
    found.push(...content);
    if (!content.length || pageNo + 1 >= totalPages) break;
  }
  return found;
}

export function teardown(data) {
  const tally = {};
  for (const b of listRunBookings(data, 'PENDING,CONFIRMED,PAID,CANCELLED')) tally[b.status] = (tally[b.status] || 0) + 1;
  console.log(`Trạng thái đơn của ${data.runId} trước khi dọn: ${JSON.stringify(tally)}`);

  if (data.contentionTarget) {
    const t = data.contentionTarget;
    const won = listRunBookings(data, 'PENDING,CONFIRMED,PAID,CANCELLED')
      .filter((b) => b.guestName && b.guestName.includes('TRANH'));
    const limit = t.availableBefore == null ? t.totalRooms : t.availableBefore;
    console.log(`Tranh phòng ${t.roomTypeId} ngày ${t.checkIn}: ${CONTENTION} khách cùng đặt, còn trống trước đó ${limit}, đơn tạo được ${won.length} → ${won.length <= limit ? 'ĐÚNG (không overbooking)' : 'SAI: OVERBOOKING'}`);
  }

  // Hủy làm danh sách dịch chuyển: mỗi vòng đọc lại trang đầu tới khi hết đơn chưa xử lý.
  let rejected = 0; let cancelled = 0; let failed = 0;
  for (let round = 0; round < 50; round++) {
    const batch = listRunBookings(data, 'PENDING,CONFIRMED', 1);
    if (!batch.length) break;
    let progress = false;
    for (const b of batch) {
      const action = b.status === 'PENDING' ? 'reject' : 'cancel';
      const res = api('POST', `/api/v1/admin/bookings/${b.id}/${action}`, {
        body: { note: `Dọn dữ liệu kiểm thử tải ${data.runId}` }, token: data.adminTokens[0], name: 'cleanup_action', actor: 'admin', expect: OK_OR_EXPECTED,
      });
      if (res.status === 200) { progress = true; if (action === 'reject') rejected++; else cancelled++; } else failed++;
    }
    if (!progress) break;
  }
  console.log(`Dọn đơn: từ chối ${rejected}, hủy ${cancelled}, lỗi ${failed}`);

  let deleted = 0; let deleteFailed = 0; let lastStatus = null;
  for (let round = 0; round < 10; round++) {
    const res = api('GET', `/api/v1/admin/travelers?keyword=${encodeURIComponent(data.runId)}&size=100`, { token: data.adminTokens[0], name: 'admin_travelers', actor: 'admin', parse: true });
    const body = json(res);
    const rows = ((body && body.content) || []).filter((t) => t.email && t.email.startsWith(`${data.runId}.`));
    if (!rows.length) break;
    let progress = false;
    for (const t of rows) {
      const del = api('DELETE', `/api/v1/admin/travelers/${t.id}?reason=${encodeURIComponent(`Tài khoản kiểm thử tải ${data.runId}`)}`, { token: data.adminTokens[0], name: 'cleanup_traveler', actor: 'admin' });
      lastStatus = del.status;
      if (del.status === 204) { deleted++; progress = true; } else deleteFailed++;
    }
    if (!progress) break;
  }
  console.log(`Xóa tài khoản khách test: ${deleted} xóa được, ${deleteFailed} lỗi${deleteFailed ? ` (HTTP ${lastStatus})` : ''}`);

  for (const token of [...data.partnerTokens, ...data.adminTokens]) {
    api('POST', '/api/v1/auth/portal/logout', { token, name: 'portal_logout', actor: 'portal' });
  }
  console.log(`Đã đăng xuất ${data.partnerTokens.length + data.adminTokens.length} phiên cổng. Đơn đã thanh toán còn lại: chạy ops/loadtest/cleanup-k6load.sql`);
}

// ---------------------------------------------------------------- khách duyệt web (không đặt)

export function browse(data) {
  const actor = 'guest';
  group('trang chủ', () => {
    page('/', firstIteration() ? data.assets : null, actor);
    ok(api('GET', '/api/public/home', { name: 'home', actor }), 'home');
  });
  think(3, 8);
  const r = Math.random();
  if (r < 0.5) {
    group('homestay', () => {
      page('/homestays', null, actor);
      ok(api('GET', '/api/public/places/amenities', { name: 'amenities', actor }), 'amenities');
      ok(api('GET', '/api/public/places?kind=HOMESTAY&page=0&size=12&sort=ratingAvg,desc', { name: 'list_homestay', actor }), 'list_homestay');
      think(3, 8);
      const placeId = pick(data.browseHomestays);
      page(`/homestays/${placeId}`, null, actor);
      ok(api('GET', `/api/public/places/${placeId}`, { name: 'place_detail', actor }), 'place_detail');
      ok(api('GET', `/api/public/bookings/places/${placeId}/booked-dates`, { name: 'booked_dates', actor }), 'booked_dates');
      ok(api('GET', `/api/public/places/${placeId}/nearby?radius=30`, { name: 'nearby', actor }), 'nearby');
    });
  } else {
    group('điểm đến', () => {
      page('/destinations', null, actor);
      ok(api('GET', '/api/public/places?kind=ATTRACTION&size=50', { name: 'list_attraction', actor }), 'list_attraction');
      think(3, 8);
      page('/specialties', null, actor);
      ok(api('GET', '/api/public/places?kind=CUISINE&page=0&size=12', { name: 'list_cuisine', actor }), 'list_cuisine');
    });
  }
  think(5, 15);
}

// ---------------------------------------------------------------- khách đặt phòng → chờ xác nhận → thanh toán

function travelerAuth(data) {
  const r = Math.random();
  if (r < 0.4 || !data.travelers.length) return { mode: 'guest' };
  if (r < 0.8) {
    const t = pick(data.travelers);
    page('/login', null, 'guest');
    const res = api('POST', '/api/v1/auth/traveler/login', { body: { identifier: t.email, password: t.password }, name: 'traveler_login', actor: 'guest', parse: true });
    ok(res, 'traveler_login');
    const body = json(res);
    return body && body.token ? { mode: 'login', token: body.token, email: t.email } : { mode: 'guest' };
  }
  const email = `${data.runId}.n${exec.vu.idInTest}-${exec.vu.iterationInScenario}@example.com`;
  const password = `K6-${digits(10)}aA`;
  page('/register', null, 'guest');
  const res = api('POST', '/api/v1/auth/traveler/register', {
    body: { fullName: `${data.mark} Khách mới`, email, password, confirmPassword: password }, name: 'traveler_register', actor: 'guest', parse: true,
  });
  check(res, { 'traveler_register 201': (x) => x.status === 201 });
  const body = json(res);
  return body && body.token ? { mode: 'register', token: body.token, email } : { mode: 'guest' };
}

function readStatus(res) {
  const body = json(res);
  return body && body.status ? body.status : null;
}

export function bookingJourney(data) {
  const actor = 'guest';
  const room = pick(data.rooms);

  group('1 duyệt tới homestay', () => {
    page('/', firstIteration() ? data.assets : null, actor);
    ok(api('GET', '/api/public/home', { name: 'home', actor }), 'home');
    think(2, 5);
    page('/homestays', null, actor);
    ok(api('GET', '/api/public/places/amenities', { name: 'amenities', actor }), 'amenities');
    ok(api('GET', '/api/public/places?kind=HOMESTAY&page=0&size=12&sort=ratingAvg,desc', { name: 'list_homestay', actor }), 'list_homestay');
    think(2, 6);
    page(`/homestays/${room.placeId}`, null, actor);
    ok(api('GET', `/api/public/places/${room.placeId}`, { name: 'place_detail', actor }), 'place_detail');
    ok(api('GET', `/api/public/bookings/places/${room.placeId}/booked-dates`, { name: 'booked_dates', actor }), 'booked_dates');
    ok(api('GET', `/api/public/places/${room.placeId}/nearby?radius=30`, { name: 'nearby', actor }), 'nearby');
    ok(api('GET', `/api/public/places/${room.placeId}/reviews`, { name: 'reviews', actor }), 'reviews');
  });
  think(3, 8);

  const auth = group('2 đăng nhập / đăng ký', () => travelerAuth(data));

  let created = null;
  group('3 đặt phòng', () => {
    page('/booking', null, actor);
    ok(api('GET', `/api/public/bookings/rooms/${room.roomTypeId}/booked-dates`, { name: 'booked_dates_room', actor }), 'booked_dates_room');
    think(5, 15); // điền form
    const nights = 1 + Math.floor(Math.random() * 2);
    const checkIn = addDays(200 + Math.floor(Math.random() * 320));
    const checkOut = new Date(checkIn.getTime() + nights * 86400000);
    const n = `${exec.vu.idInTest}-${exec.vu.iterationInScenario}`;
    const res = api('POST', '/api/public/bookings', {
      body: {
        placeId: room.placeId,
        roomTypeId: room.roomTypeId,
        checkIn: isoDate(checkIn),
        checkOut: isoDate(checkOut),
        roomCount: 1,
        guestCount: Math.min(room.maxOcc, 1 + Math.floor(Math.random() * 2)),
        guestName: `${data.mark} Khách ${n}`,
        guestPhone: fakePhone(),
        guestEmail: auth.email || `${data.runId}.g${n}@example.com`,
        guestNote: `Đơn kiểm thử tải k6 (${data.runId}) — sẽ tự hủy/xóa sau khi test.`,
      },
      token: auth.token, name: 'booking_create', actor, parse: true, expect: OK_OR_EXPECTED,
    });
    check(res, { 'booking_create không lỗi máy chủ': (r) => r.status === 201 || r.status === 409 || r.status === 429 });
    if (res.status === 201) {
      bookingCreated.add(1, { auth: auth.mode });
      created = json(res);
    } else if (res.status === 409) bookingConflict.add(1);
    else if (res.status === 429) bookingRateLimited.add(1);
    else bookingError.add(1, { status: String(res.status) });
  });
  if (!created || !created.bookingCode) return;

  const code = created.bookingCode;
  const creds = { token: auth.token, bookingToken: created.accessToken };
  const createdAt = Date.now();
  const detail = () => api('GET', `/api/public/bookings/${encodeURIComponent(code)}`, { ...creds, name: 'booking_detail', actor, parse: true });

  let status = 'PENDING';
  group('4 chờ xác nhận', () => {
    page(`/bookings/${encodeURIComponent(code)}`, null, actor);
    status = readStatus(detail()) || status;
    const deadline = Date.now() + 150000;
    // 8% khách đổi ý — quyết định một lần cho cả đơn (không tung lại mỗi lần hỏi trạng thái).
    const changesMind = Math.random() < 0.08;
    let polls = 0;
    while (status === 'PENDING' && Date.now() < deadline) {
      if (changesMind && polls++ >= 1) {
        // Khách đổi ý, tự hủy khi đang chờ.
        const res = api('POST', `/api/public/bookings/${encodeURIComponent(code)}/cancel`, {
          ...creds, body: { reason: 'Khách đổi kế hoạch (k6)' }, name: 'booking_cancel', actor, expect: OK_OR_EXPECTED,
        });
        if (res.status === 200) { guestCancelled.add(1); status = 'CANCELLED'; }
        break;
      }
      if (auth.token) {
        // Khách đăng nhập: BookingStatusWatcher hỏi 4 giây một lần.
        sleep(4);
        const res = api('GET', '/api/public/bookings/my-bookings/statuses', { token: auth.token, name: 'my_booking_statuses', actor, parse: true });
        ok(res, 'my_booking_statuses');
        const mine = (json(res) || []).find((s) => s.bookingCode === code);
        if (mine && mine.status) status = mine.status;
      } else {
        // Khách vãng lai: tự tải lại trang chi tiết đơn.
        sleep(12);
        status = readStatus(detail()) || status;
      }
    }
    if (status === 'CONFIRMED') timeToConfirm.add(Date.now() - createdAt);
  });

  if (status !== 'CONFIRMED') return;
  group('5 thanh toán', () => {
    // Màn hình chi tiết đơn đã xác nhận: hướng dẫn chuyển khoản qua Zalo, khách quay lại xem 12 giây một lần.
    status = readStatus(detail()) || status;
    const deadline = Date.now() + 120000;
    while (status === 'CONFIRMED' && Date.now() < deadline) {
      sleep(12);
      status = readStatus(detail()) || status;
    }
    if (status === 'PAID') timeToPaid.add(Date.now() - createdAt);
    if (auth.token) {
      page('/my-bookings', null, actor);
      ok(api('GET', '/api/public/bookings/my-bookings', { token: auth.token, name: 'my_bookings', actor }), 'my_bookings');
    }
  });
}

// ---------------------------------------------------------------- tranh phòng: nhiều khách đặt cùng phòng, cùng ngày, cùng lúc

export function contention(data) {
  const t = data.contentionTarget;
  const res = api('POST', '/api/public/bookings', {
    body: {
      placeId: t.placeId, roomTypeId: t.roomTypeId, checkIn: t.checkIn, checkOut: t.checkOut, roomCount: 1, guestCount: 1,
      guestName: `${data.mark} TRANH ${exec.vu.idInTest}`, guestPhone: fakePhone(),
      guestEmail: `${data.runId}.t${exec.vu.idInTest}@example.com`, guestNote: `Kiểm thử tranh phòng k6 (${data.runId})`,
    },
    name: 'booking_create_contention', actor: 'guest', expect: OK_OR_EXPECTED,
  });
  check(res, { 'contention không lỗi máy chủ': (r) => r.status === 201 || r.status === 409 || r.status === 429 });
  if (res.status === 201) contentionSuccess.add(1); else contentionRejected.add(1, { status: String(res.status) });
}

// ---------------------------------------------------------------- NCC và Admin xử lý đơn

/**
 * Xử lý các đơn của lượt chạy mà vai trò này phụ trách: chờ → xác nhận (10% từ chối); đã xác nhận ≥20 giây (khách đã kịp
 * chuyển khoản qua Zalo) → ghi nhận thanh toán (65%), hủy (10%), còn lại để nguyên tới teardown.
 */
function processBookings(data, portal) {
  const { base, token, actor, mine, perList } = portal;
  const list = (status) => {
    const res = api('GET', `${base}/bookings?status=${status}&keyword=${encodeURIComponent(data.runId)}&size=50&sortDir=asc`, { token, name: `${actor}_bookings_${status.toLowerCase()}`, actor, parse: true });
    ok(res, `${actor}_bookings_${status.toLowerCase()}`);
    return (((json(res) || {}).content) || []).filter((b) => mine(b.id) && b.guestName && b.guestName.startsWith(data.mark));
  };
  const act = (b, action) => {
    page(`/${actor === 'admin' ? 'admin' : 'partner'}/bookings/${b.id}`, null, actor);
    ok(api('GET', `${base}/bookings/${b.id}`, { token, name: `${actor}_booking_detail`, actor }), `${actor}_booking_detail`);
    think(1, 3);
    const res = api('POST', `${base}/bookings/${b.id}/${action}`, { token, body: { note: `k6 ${data.runId}` }, name: `${actor}_${action}`, actor, expect: OK_OR_EXPECTED });
    check(res, { [`${actor}_${action} không lỗi máy chủ`]: (r) => r.status === 200 || r.status === 409 });
    if (res.status === 200) workflowDone.add(1, { actor, action });
    else if (res.status === 409) workflowConflict.add(1, { actor, action });
  };

  for (const b of shuffle(list('PENDING')).slice(0, perList)) act(b, decision(b.id) < 10 ? 'reject' : 'confirm');
  const now = Date.now() + 7 * 3600 * 1000; // confirmedAt là giờ Việt Nam, không kèm múi giờ
  for (const b of shuffle(list('CONFIRMED')).slice(0, perList)) {
    const confirmedAt = b.confirmedAt ? Date.parse(`${String(b.confirmedAt).slice(0, 23)}Z`) : now;
    if (now - confirmedAt < 20000) continue;
    const roll = decision(b.id);
    if (roll < 75 && roll >= 10) act(b, 'pay');
    else if (roll >= 75 && roll < 85) act(b, 'cancel');
  }
}

export function partnerPortal(data) {
  const actor = 'partner';
  const token = data.partnerTokens[exec.vu.idInTest % data.partnerTokens.length];
  const base = '/api/v1/partner';
  if (firstIteration()) {
    page('/partner', data.assets, actor);
    ok(api('GET', `${base}/calendar?startDate=${isoDate(addDays(0))}&endDate=${isoDate(addDays(60))}`, { token, name: 'partner_calendar', actor }), 'partner_calendar');
  }
  ok(api('GET', `${base}/notifications/inbox`, { token, name: 'partner_inbox', actor }), 'partner_inbox');
  ok(api('GET', `${base}/bookings/summary`, { token, name: 'partner_bookings_summary', actor }), 'partner_bookings_summary');
  page('/partner/bookings', null, actor);
  processBookings(data, { base, token, actor, mine: (id) => bucket(id) >= ADMIN_SHARE, perList: 8 });
  if (exec.vu.iterationInScenario % 4 === 3) {
    // Thỉnh thoảng xem các trang khác của cổng NCC.
    const r = Math.random();
    if (r < 0.35) {
      page('/partner/overview', null, actor);
      ok(api('GET', `${base}/dashboard/summary`, { token, name: 'partner_dashboard', actor }), 'partner_dashboard');
    } else if (r < 0.7) {
      page('/partner', null, actor);
      ok(api('GET', `${base}/calendar?startDate=${isoDate(addDays(0))}&endDate=${isoDate(addDays(60))}`, { token, name: 'partner_calendar', actor }), 'partner_calendar');
    } else {
      ok(api('GET', `${base}/bookings?page=0&size=20`, { token, name: 'partner_bookings_all', actor }), 'partner_bookings_all');
      ok(api('GET', `${base}/homestays`, { token, name: 'partner_homestays', actor }), 'partner_homestays');
    }
  }
  think(3, 6);
}

export function adminPortal(data) {
  const actor = 'admin';
  const token = data.adminTokens[exec.vu.idInTest % data.adminTokens.length];
  const base = '/api/v1/admin';
  if (firstIteration()) {
    page('/admin', data.assets, actor);
    ok(api('GET', `${base}/dashboard/summary`, { token, name: 'admin_dashboard', actor }), 'admin_dashboard');
  }
  ok(api('GET', `${base}/notifications`, { token, name: 'admin_notifications', actor }), 'admin_notifications');
  ok(api('GET', `${base}/dashboard/nav-counts`, { token, name: 'admin_nav_counts', actor }), 'admin_nav_counts');
  ok(api('GET', `${base}/bookings/summary`, { token, name: 'admin_bookings_summary', actor }), 'admin_bookings_summary');
  processBookings(data, { base, token, actor, mine: (id) => bucket(id) < ADMIN_SHARE, perList: 5 });
  if (exec.vu.iterationInScenario % 3 === 2) {
    const views = [
      ['admin_activity', `${base}/dashboard/activity?limit=10`],
      ['admin_bookings_all', `${base}/bookings?page=0&size=20`],
      ['admin_reports', `${base}/reports/overview`],
      ['admin_revenue', `${base}/finance/revenue-summary`],
      ['admin_travelers', `${base}/travelers?page=0&size=20`],
      ['admin_providers', `${base}/providers`],
      ['admin_accounts', `${base}/accounts?page=0&size=20`],
      ['admin_audit_logs', `${base}/audit-logs?page=0&size=20`],
    ];
    const [name, path] = pick(views);
    page('/admin', null, actor);
    ok(api('GET', path, { token, name, actor }), name);
  }
  think(8, 15);
}
