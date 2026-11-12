import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * Load test "Đi Mù Cang Chải" — k6.
 *
 * CHẠY THẾ NÀO (đọc loadtest/README.md trước khi chạy lên production!):
 *   BASE_URL=https://staging-cua-ban.vercel.app k6 run k6-load-test.js          # ramp đầy đủ 1.000 VU
 *   BASE_URL=... k6 run --vus 50 --duration 2m k6-load-test.js                  #size nhỏ trước
 *   BASE_URL=... SMOKE=true k6 run k6-load-test.js                              # 1 VU chạy thử
 *
 * Tiêu chí nghiệm thu (thresholds, đúng theo đề bài):
 *   - http_req_failed < 1%
 *   - p(95) < 800ms cho API động (home/places/detail)
 *   - không request nào timeout
 */

const BASE = __ENV.BASE_URL || 'https://viettrek-app.vercel.app';
const SMOKE = (__ENV.SMOKE || 'false') === 'true';

const apiTrend = new Trend('api_req_duration', true);
const apiFailRate = new Rate('api_req_fail');

// Một slug địa điểm thật lấy từ môi trường (mặc định: điểm đến đang có trên production).
const PLACE_SLUG = __ENV.PLACE_SLUG || 'thung-lung-tu-le';

export const options = SMOKE
  ? { vus: 1, duration: '30s', thresholds: sharedThresholds() }
  : {
      scenarios: {
        // Ramp dần tới 1.000 VU, giữ 5 phút — đúng kịch bản nghiệm thu.
        ramp_to_1000: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '2m', target: 100 },
            { duration: '2m', target: 500 },
            { duration: '1m', target: 1000 },
            { duration: '5m', target: 1000 },
            { duration: '1m', target: 0 },
          ],
          gracefulRampDown: '30s',
        },
      },
      thresholds: sharedThresholds(),
      // Đánh dấu request treo quá 10s là timeout (đề bài: không request nào timeout).
      http_req_duration: ['p(95)<800', 'p(99)<2500', 'max<10000'],
    };

function sharedThresholds() {
  return {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{type:api}': ['p(95)<800'],
    'http_req_duration{type:media}': ['p(95)<800'],
    checks: ['rate>0.99'],
  };
}

function get(path, tags) {
  const res = http.get(`${BASE}${path}`, { tags: { type: tags?.type || 'api', ...tags } });
  const ok = check(res, {
    [`${path} → 200`]: (r) => r.status === 200,
    [`${path} không timeout`]: (r) => r.status !== 0 && r.timings.duration < 10000,
  });
  apiFailRate.add(!ok);
  apiTrend.add(res.timings.duration, tags);
  return res;
}

export default function () {
  group('API công khai', () => {
    get('/api/public/health', { name: 'health', type: 'api' });
    get('/api/public/home', { name: 'home', type: 'api' });
    get('/api/public/places?kind=HOMESTAY&page=0&size=12', { name: 'places-homestay', type: 'api' });
    get(`/api/public/places/${PLACE_SLUG}`, { name: 'place-detail', type: 'api' });
    get('/api/public/places/regions', { name: 'regions', type: 'api' });
    get('/api/public/festivals', { name: 'festivals', type: 'api' });
  });

  group('Static & ảnh', () => {
    const home = http.get(`${BASE}/`);
    check(home, { 'trang chủ 200': (r) => r.status === 200 });
    // Lấy một URL ảnh thật từ dữ liệu home để đo đúng đường dẫn /media (có cache edge).
    const imgMatch = home.body.match(/\/(media|mediac)\/[A-Za-z0-9_\/.-]+\.(jpg|png|webp)/);
    if (imgMatch) {
      get(imgMatch[0], { name: 'media-image', type: 'media' });
    }
  });
}

export function handleSummary(data) {
  const fmt = (obj) =>
    Object.entries(obj || {})
      .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
  return {
    stdout: `
==== TÓM TẮT LOAD TEST (${BASE}) ====
VUs tối đa      : ${SMOKE ? 1 : 1000}
http_req_failed : ${(data.metrics.http_req_failed ? (data.metrics.http_req_failed.value * 100).toFixed(2) : '?')}%   (tiêu chí < 1%)
p95 toàn bộ     : ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(0) : '?'}ms (tiêu chí API < 800ms)
max             : ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['max'].toFixed(0) : '?'}ms (tiêu chí < 10000ms = không timeout)
checks pass     : ${data.metrics.checks ? (data.metrics.checks.value * 100).toFixed(2) : '?'}%
`,
    [`summary-${Date.now()}.json`]: JSON.stringify(data, null, 2),
  };
}
