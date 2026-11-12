// Kiểm thử tải: người dùng ẩn danh duyệt web Viettrek (chỉ GET công khai, không đăng nhập, không tạo booking).
//
//   k6 run ops/loadtest/viettrek-browse.js                       # 500 user, ~10 phút
//   k6 run -e PEAK=20 -e QUICK=1 ops/loadtest/viettrek-browse.js # chạy thử nhỏ
//   k6 run -e BASE_URL=https://... ops/loadtest/viettrek-browse.js
//
// Mỗi VU = một người dùng: lần đầu tải HTML + toàn bộ JS/CSS (như trình duyệt chưa có cache), các lần sau chỉ HTML.
// API gọi tuần tự từng cái một, giống requestQueue.ts của frontend (tối đa 1 request /api đang chạy).
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import exec from 'k6/execution';

const BASE_URL = (__ENV.BASE_URL || 'https://viettrek-app.vercel.app').replace(/\/$/, '');
const PEAK = Number(__ENV.PEAK || 500);
const QUICK = __ENV.QUICK === '1';

const apiDuration = new Trend('api_duration', true);
const pageDuration = new Trend('page_duration', true);
const slowApi = new Rate('api_slower_than_5s');

const stages = QUICK
  ? [
      { duration: '30s', target: PEAK },
      { duration: '30s', target: PEAK },
      { duration: '10s', target: 0 },
    ]
  : [
      { duration: '1m', target: Math.round(PEAK * 0.1) },
      { duration: '1m', target: Math.round(PEAK * 0.3) },
      { duration: '2m', target: Math.round(PEAK * 0.6) },
      { duration: '2m', target: PEAK },
      { duration: '3m', target: PEAK },
      { duration: '1m', target: 0 },
    ];

export const options = {
  scenarios: {
    browse: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s', gracefulStop: '30s' },
  },
  thresholds: {
    // Ngắt sớm nếu hệ thống đã sập hẳn (>30% request lỗi), tránh đốt container/kết nối Supabase vô ích.
    http_req_failed: [{ threshold: 'rate<0.30', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_duration{type:static}': ['p(95)<1000'],
    'http_req_duration{type:api}': ['p(95)<3000'],
    checks: ['rate>0.95'],
  },
  discardResponseBodies: true,
  userAgent: 'k6-loadtest-viettrek',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Lấy danh sách asset từ index.html và id thật từ /api/public/home một lần trước khi chạy.
export function setup() {
  const html = http.get(`${BASE_URL}/`, { responseType: 'text' });
  if (html.status !== 200) throw new Error(`Trang chủ trả ${html.status}`);
  const assets = [...new Set(html.body.match(/\/assets\/[^"'\s)]+\.(?:js|css)/g) || [])];

  const home = http.get(`${BASE_URL}/api/public/home`, { responseType: 'text' });
  if (home.status !== 200) throw new Error(`/api/public/home trả ${home.status}`);
  const data = home.json();
  const ids = (list) => (list || []).map((p) => p.id).filter((id) => id != null);
  const places = {
    homestays: ids(data.homestays),
    destinations: ids(data.featuredDestinations),
    specialties: ids(data.specialties),
  };
  if (!places.homestays.length || !places.destinations.length) throw new Error('Không lấy được id homestay/điểm đến');
  console.log(`assets=${assets.length} homestays=${places.homestays.length} destinations=${places.destinations.length}`);
  return { assets, places };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (min, max) => sleep(min + Math.random() * (max - min));

function api(path, name) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { type: 'api', name }, timeout: '30s' });
  check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  apiDuration.add(res.timings.duration, { name });
  slowApi.add(res.timings.duration > 5000);
  return res;
}

function openPage(path, assets) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { type: 'static', name: 'html' } });
  check(res, { 'html 200': (r) => r.status === 200 });
  let total = res.timings.duration;
  if (assets) {
    // Trình duyệt tải song song ~6 kết nối; batch của k6 cũng song song.
    const responses = http.batch(
      assets.map((a) => ['GET', `${BASE_URL}${a}`, null, { tags: { type: 'static', name: 'asset' } }]),
    );
    check(responses, { 'assets 200': (rs) => rs.every((r) => r.status === 200) });
    total += Math.max(...responses.map((r) => r.timings.duration));
  }
  pageDuration.add(total);
}

export default function ({ assets, places }) {
  group('trang chủ', () => {
    openPage('/', exec.vu.iterationInScenario === 0 ? assets : null);
    api('/api/public/home', 'home');
  });
  think(3, 8);

  const r = Math.random();
  if (r < 0.5) {
    group('homestay', () => {
      openPage('/homestays', null);
      api('/api/public/places/amenities', 'amenities');
      api('/api/public/places?kind=HOMESTAY&page=0&size=12&sort=ratingAvg,desc', 'list_homestay');
      think(3, 8);
      const id = pick(places.homestays);
      openPage(`/homestays/${id}`, null);
      api(`/api/public/places/${id}`, 'place_detail');
      api(`/api/public/places/${id}/nearby?radius=30`, 'nearby');
      api(`/api/public/bookings/places/${id}/booked-dates`, 'booked_dates');
    });
  } else if (r < 0.85) {
    group('điểm đến', () => {
      openPage('/destinations', null);
      api('/api/public/places?kind=ATTRACTION&size=50', 'list_attraction');
      think(3, 8);
      const id = pick(places.destinations);
      openPage(`/destinations/${id}`, null);
      api(`/api/public/places/${id}`, 'place_detail');
      api(`/api/public/places/${id}/nearby?radius=30`, 'nearby');
    });
  } else {
    group('đặc sản', () => {
      openPage('/specialties', null);
      api('/api/public/places?kind=CUISINE&page=0&size=12', 'list_cuisine');
      if (places.specialties.length) {
        think(2, 5);
        const id = pick(places.specialties);
        openPage(`/specialties/${id}`, null);
        api(`/api/public/places/${id}`, 'place_detail');
      }
    });
  }
  think(5, 15);
}

