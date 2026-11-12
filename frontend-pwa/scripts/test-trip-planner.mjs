import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Nạp một module TS trong src/ (CommonJS trong vm); `deps` = các module '@/…' nó import lúc chạy. */
function load(path, deps = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, URLSearchParams, Intl, Date, Math, Number, String, JSON, Map, Set,
    require: (name) => {
      if (!(name in deps)) throw new Error(`${path}: thiếu module giả cho ${name}`);
      return deps[name];
    },
    ...globals,
  });
  new vm.Script(compiled).runInContext(context);
  return module.exports;
}

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const dates = load('lib/roomAvailability.ts');
const planner = load('lib/tripPlanner.ts', { '@/lib/roomAvailability': dates }, { localStorage });
const links = load('lib/tripLinks.ts');
const journeyLib = load('lib/journey.ts');
const rows = load('components/trip/timelineRows.ts', { '@/lib/journey': journeyLib, '@/lib/tripPlanner': planner });

// ─── Hai gói Mù Cang Chải (rút gọn từ db/changelog/v2/008-trip-planner.sql) ──────────────

const TAGS = [
  { slug: 'trip-dac-san-dia-phuong', group: 'TRIP_DINING', name: 'Đặc sản địa phương' },
  { slug: 'trip-bua-sang-ngam-binh-minh', group: 'TRIP_DINING', name: 'Bữa sáng ngắm bình minh' },
  { slug: 'trip-san-may-binh-minh', group: 'TRIP_GOAL', name: 'Săn mây, bình minh' },
  { slug: 'trip-san-anh-flycam', group: 'TRIP_GOAL', name: 'Săn ảnh, flycam' },
  { slug: 'trip-nhe-nhang-chill', group: 'TRIP_GOAL', name: 'Nhẹ nhàng, chill' },
  { slug: 'trip-phieu-luu-du-luon', group: 'TRIP_GOAL', name: 'Phiêu lưu, dù lượn' },
];
// MCC_2N1D đọc từ lịch trình gợi ý (máy chủ mới: id gói, id mục); MCC_3N2D kiểu cũ (bảng trip_template, chỉ có slug).
const MCC_2N1D = {
  id: 77, code: 'MCC_2N1D', title: 'Mù Cang Chải 2 ngày 1 đêm', summary: null, days: 2, nights: 1, priceFrom: 999000,
  tags: ['trip-dac-san-dia-phuong', 'trip-san-may-binh-minh', 'trip-san-anh-flycam', 'trip-nhe-nhang-chill'],
  content: {
    dayTitles: ['Tú Lệ – Khau Phạ', 'Mâm Xôi – Kim Nọi'],
    dayNotes: [null, 'Dậy sớm săn mây'],
    items: [
      { id: 105, day: 2, start: '08:00', end: '10:00', kind: 'PLACE', title: 'Kim Nọi', place: 'doi-kim-noi-hang-dang-de', addons: ['FLYCAM', 'KHONG_CO'], alternatives: ['song-lung-khung-long-de-xu-phinh'] },
      { id: 101, day: 1, start: '05:30', end: '06:00', kind: 'TRANSPORT', title: 'Khởi hành từ Hà Nội', addons: ['TRANSFER_HN_MCC'] },
      { id: 102, day: 1, start: '11:00', end: '12:00', kind: 'MEAL', title: 'Ăn trưa tại Tú Lệ', note: 'Cá suối, lợn bản', dishes: ['ca-suoi-nuong-mu-cang-chai', 'mon-khong-co'] },
      { id: 103, day: 1, start: '12:00', end: '13:30', kind: 'PLACE', title: 'Check-in đèo Khau Phạ', place: 'deo-khau-pha' },
      { day: 1, start: '20:30', kind: 'PLACE', title: 'Bản chưa công khai', place: 'khong-co-tren-he-thong' },
    ],
  },
};
const MCC_3N2D = {
  code: 'MCC_3N2D', title: 'Mù Cang Chải 3 ngày 2 đêm', summary: null, days: 3, nights: 2, priceFrom: 1499000,
  tags: ['trip-dac-san-dia-phuong', 'trip-bua-sang-ngam-binh-minh', 'trip-san-may-binh-minh', 'trip-san-anh-flycam', 'trip-phieu-luu-du-luon'],
  content: {
    items: [
      { day: 1, start: '14:00', end: '15:30', kind: 'PLACE', title: 'Đèo Khau Phạ – Lìm Mông', place: 'deo-khau-pha', addons: ['FLYCAM', 'PARAGLIDING'] },
      { day: 2, start: '06:30', end: '08:30', kind: 'PLACE', title: 'Đồi Mâm Xôi', placeId: 25, addons: ['FLYCAM'] },
    ],
  },
};
const TEMPLATES = [MCC_3N2D, MCC_2N1D];
const CATALOG = {
  region: { id: 1, name: 'Yên Bái', areas: ['Mù Cang Chải', 'Văn Chấn'] },
  places: [
    { id: 19, slug: 'deo-khau-pha', name: 'Đèo Khau Phạ' },
    { id: 23, slug: 'doi-kim-noi-hang-dang-de', name: 'Đồi Kim Nọi' },
    { id: 24, slug: 'song-lung-khung-long-de-xu-phinh', name: 'Sống Lưng Khủng Long' },
  ],
  addons: [{ code: 'FLYCAM' }, { code: 'TRANSFER_HN_MCC' }, { code: 'PARAGLIDING' }],
  dishes: [{ id: 7, slug: 'ca-suoi-nuong-mu-cang-chai', name: 'Cá suối nướng', coverImageUrl: null }],
};
const plain = (value) => JSON.parse(JSON.stringify(value));

// ─── Thời gian: tag gọn "2N1Đ", chọn sẵn theo ngày đi / về có sẵn ─────────

assert.deepEqual(plain(planner.durationOptions(TEMPLATES)), [
  { value: '2-1', label: '2N1Đ', count: 1 },
  { value: '3-2', label: '3N2Đ', count: 1 },
], 'Thời lượng ngắn trước, nhãn gọn');
assert.equal(planner.durationForStay(TEMPLATES, '2026-10-17', '2026-10-18'), '2-1', 'T7 → CN (1 đêm) chọn sẵn 2N1Đ');
assert.equal(planner.durationForStay(TEMPLATES, '2026-10-16', '2026-10-19'), '3-2', '3 đêm: lịch trình dài nhất không vượt số đêm');
assert.equal(planner.durationForStay(TEMPLATES, null, null), null, 'Chưa chọn ngày: không chọn sẵn');
assert.equal(planner.durationForStay(TEMPLATES, '2026-10-17', '2026-10-17'), null);
assert.equal(planner.durationForStay(TEMPLATES, '2026-10-11', '2026-10-17'), '3-2', '1 tuần (6 đêm): lịch trình dài nhất vừa chuyến');
assert.equal(planner.durationForStay([MCC_3N2D], '2026-10-17', '2026-10-18'), null, 'Lịch trình dài hơn chuyến không được chọn sẵn');
assert.equal(planner.tripDaysBetween('2026-10-17', '2026-10-18'), 2, '1 đêm = 2 ngày');
assert.equal(planner.tripDaysBetween('2026-10-11', '2026-10-17'), 7, '1 tuần = 6 đêm = 7 ngày');
assert.equal(planner.tripDaysBetween('2026-10-17', '2026-10-17'), null, 'Đi về trong ngày: coi như chưa chọn ngày');
assert.equal(planner.tripDaysBetween('2026-10-18', '2026-10-17'), null);
assert.equal(planner.tripDaysBetween('17/10', '2026-10-18'), null, 'Ngày lạ');
assert.equal(planner.tripDaysBetween(null, null), null);

// ─── Ăn uống + trải nghiệm: chỉ tag còn khớp, trải nghiệm là AND ─────────

const dining = plain(planner.tagOptions(TEMPLATES, TAGS, { duration: '2-1' }, planner.DINING_GROUP));
assert.deepEqual(dining.map((o) => o.value), ['trip-dac-san-dia-phuong'], '2N1Đ không có "Bữa sáng ngắm bình minh"');
const goals2 = plain(planner.tagOptions(TEMPLATES, TAGS, { duration: '2-1', goals: [] }, planner.GOAL_GROUP));
assert.ok(!goals2.some((o) => o.value === 'trip-phieu-luu-du-luon'), '2N1Đ không có "Phiêu lưu, dù lượn"');
assert.ok(goals2.every((o) => o.count === 1));
const goalsAll = plain(planner.tagOptions(TEMPLATES, TAGS, { goals: ['trip-nhe-nhang-chill'] }, planner.GOAL_GROUP));
assert.equal(goalsAll.find((o) => o.value === 'trip-phieu-luu-du-luon').count, 0, 'Thêm tag làm kết quả về 0 thì đếm 0 (giao diện làm mờ)');
assert.deepEqual(plain(planner.matchTemplates(TEMPLATES, { goals: ['trip-san-anh-flycam', 'trip-phieu-luu-du-luon'] })).map((t) => t.code), ['MCC_3N2D']);
assert.deepEqual(plain(planner.matchTemplates(TEMPLATES, {})).map((t) => t.code), ['MCC_3N2D', 'MCC_2N1D'], 'Chưa chọn tag: mọi lịch trình');

// ─── Tiêu chí đẩy vào tuần tự: thời gian → ăn uống → trải nghiệm ─────────

const E = plain(planner.EMPTY_FILTERS);
assert.deepEqual(E, { duration: null, dining: null, goals: [] }, 'Tiêu chí không có giá / mã gói');
const rowsOf = (filters) => plain(planner.criteriaRows(TEMPLATES, TAGS, filters));
assert.deepEqual(rowsOf(E).map((r) => [r.key, r.label, r.options.map((o) => o.label)]), [['duration', 'Thời gian', ['2N1Đ', '3N2Đ']]],
  'Lúc đầu chỉ hiện hàng thời gian');
assert.deepEqual(rowsOf({ ...E, duration: '3-2' }).map((r) => r.key), ['duration', 'dining'], 'Chọn thời gian → hàng ăn uống trượt vào');
assert.deepEqual(rowsOf({ ...E, duration: '3-2' })[1].options.map((o) => o.value), ['trip-dac-san-dia-phuong', 'trip-bua-sang-ngam-binh-minh']);
const allRows = rowsOf({ duration: '3-2', dining: 'trip-bua-sang-ngam-binh-minh', goals: ['trip-san-anh-flycam'] });
assert.deepEqual(allRows.map((r) => [r.key, r.selected]), [
  ['duration', ['3-2']], ['dining', ['trip-bua-sang-ngam-binh-minh']], ['goals', ['trip-san-anh-flycam']],
], 'Chọn ăn uống → hàng trải nghiệm');
assert.deepEqual(allRows[2].options.map((o) => o.value), ['trip-san-may-binh-minh', 'trip-san-anh-flycam', 'trip-phieu-luu-du-luon'],
  'Trải nghiệm: chỉ tag của lịch trình khớp thời gian + ăn uống, theo thứ tự danh mục tag');
assert.equal(allRows[2].multi, true);
assert.deepEqual(rowsOf({ ...E, duration: '2-1', goals: ['trip-san-anh-flycam'] }).map((r) => r.key), ['duration', 'dining'],
  'Chưa chọn ăn uống thì chưa hiện trải nghiệm (tag trải nghiệm cũ coi như chưa chọn)');
assert.deepEqual(rowsOf({ ...E, duration: '9-8' }).map((r) => r.selected), [[]], 'Thời gian không có trong danh mục: coi như chưa chọn');
const noDining = TAGS.filter((t) => t.group !== 'TRIP_DINING');
assert.deepEqual(plain(planner.criteriaRows(TEMPLATES, noDining, { ...E, duration: '2-1' })).map((r) => r.key), ['duration', 'goals'],
  'Tiêu chí không có tag nào thì bỏ qua, hàng sau hiện luôn');
assert.deepEqual(plain(planner.criteriaRows([], TAGS, E)), [], 'Tỉnh chưa có lịch trình gợi ý: không có tiêu chí');

const pick = (filters, key, value) => plain(planner.cleanFilters(TEMPLATES, TAGS, planner.toggleCriterion(filters, key, value)));
const step1 = pick(E, 'duration', '3-2');
assert.deepEqual(step1, { duration: '3-2', dining: null, goals: [] });
assert.deepEqual(pick(step1, 'duration', '3-2'), step1, 'Bấm lại thời gian đang chọn: vẫn chọn (bắt buộc)');
const step2 = pick(step1, 'dining', 'trip-bua-sang-ngam-binh-minh');
const step3 = pick(pick(step2, 'goals', 'trip-san-anh-flycam'), 'goals', 'trip-phieu-luu-du-luon');
assert.deepEqual(step3.goals, ['trip-san-anh-flycam', 'trip-phieu-luu-du-luon'], 'Trải nghiệm chọn nhiều');
assert.deepEqual(pick(step3, 'goals', 'trip-san-anh-flycam').goals, ['trip-phieu-luu-du-luon'], 'Bấm lại thì bỏ');
assert.deepEqual(pick(step3, 'dining', 'trip-bua-sang-ngam-binh-minh'), { duration: '3-2', dining: null, goals: [] },
  'Bỏ chọn ăn uống → trải nghiệm bỏ theo (hàng đã ẩn)');
assert.deepEqual(pick(step3, 'duration', '2-1'), { duration: '2-1', dining: null, goals: [] },
  'Đổi sang 2N1Đ: "Bữa sáng ngắm bình minh" không còn → ăn uống, trải nghiệm bỏ theo');
const kept = pick({ duration: '3-2', dining: 'trip-dac-san-dia-phuong', goals: ['trip-san-anh-flycam'] }, 'duration', '2-1');
assert.deepEqual(kept, { duration: '2-1', dining: 'trip-dac-san-dia-phuong', goals: ['trip-san-anh-flycam'] }, 'Đổi thời gian: tag còn hợp lệ được giữ');

assert.equal(planner.suggestTemplate(TEMPLATES, E), null, 'Chưa chọn thời gian: chưa gợi ý');
assert.equal(planner.suggestTemplate(TEMPLATES, step1).code, 'MCC_3N2D');
assert.equal(planner.suggestTemplate(TEMPLATES, kept).code, 'MCC_2N1D');
assert.equal(planner.suggestTemplate(TEMPLATES, { duration: '2-1', dining: null, goals: ['trip-phieu-luu-du-luon'] }).code, 'MCC_2N1D',
  'Không lịch trình nào khớp đủ tag: nới tiêu chí, vẫn theo thời gian');
assert.equal(planner.suggestTemplate(TEMPLATES, { ...E, duration: '9-8' }), null);
const second3 = { ...MCC_3N2D, code: 'MCC_3N2D_CHILL', tags: [...MCC_3N2D.tags, 'trip-nhe-nhang-chill'] };
assert.equal(planner.suggestTemplate([MCC_3N2D, second3], { ...step1, goals: ['trip-nhe-nhang-chill'] }).code, 'MCC_3N2D_CHILL',
  'Nhiều lịch trình cùng thời gian: tag trải nghiệm chọn đúng lịch trình');

const params = (query) => new URLSearchParams(query);
assert.deepEqual(plain(planner.filtersFromParams(params('d=2-1&an=trip-dac-san-dia-phuong&mt=a,,b&p=999000'))),
  { duration: '2-1', dining: 'trip-dac-san-dia-phuong', goals: ['a', 'b'] }, 'Tiêu chí trên đường dẫn (bỏ giá cũ ?p=)');
assert.equal(planner.filtersFromParams(params('p=999000')), null);
assert.equal(planner.filtersFromParams(params('d=2ngay')), null, 'Thời gian lạ bị bỏ');

// ─── Giờ ↔ buổi, thứ tự ─────────────────────────────────────────

assert.equal(planner.normalizeTime('5:30'), '05:30');
assert.equal(planner.normalizeTime('05:30:00'), '05:30', 'Giờ từ API (HH:mm:ss) về HH:mm');
assert.equal(planner.normalizeTime('24:00'), null);
assert.equal(planner.sessionOfTime('10:59'), 'MORNING');
assert.equal(planner.sessionOfTime('11:00'), 'NOON');
assert.equal(planner.sessionOfTime('13:59'), 'NOON');
assert.equal(planner.sessionOfTime('14:00'), 'AFTERNOON');
assert.equal(planner.sessionOfTime('18:00'), 'EVENING');
assert.equal(planner.sessionOfTime(null), null);
const sorted = planner.sortItems([
  { id: 'chiều N1', dayIndex: 1, startTime: null, session: 'AFTERNOON' },
  { id: 'sáng N2', dayIndex: 2, startTime: '05:00', session: null },
  { id: '13h N1', dayIndex: 1, startTime: '13:00', session: null },
  { id: '13h N1 sau', dayIndex: 1, startTime: '13:00', session: null },
]);
assert.deepEqual(sorted.map((i) => i.id), ['13h N1', '13h N1 sau', 'chiều N1', 'sáng N2'], 'Ngày → giờ (buổi = giờ mặc định) → thứ tự thêm');
assert.equal(planner.timeToMinutes('08:30'), 510);
assert.equal(planner.minutesToTime(450), '07:30');
assert.equal(planner.minutesToTime(-5), '00:00');
assert.equal(planner.minutesToTime(24 * 60 + 30), '23:59', 'Kẹp trong ngày');
assert.equal(planner.suggestedStart([]), '08:00');
assert.equal(planner.suggestedStart(['AFTERNOON']), '14:00');
assert.equal(planner.itemEndMinutes({ startTime: '06:30', endTime: '07:30', session: null }), 450);
assert.equal(planner.itemEndMinutes({ startTime: '08:30', endTime: null, session: null }), 570, 'Không có giờ kết thúc: +1 tiếng');
assert.equal(planner.itemEndMinutes({ startTime: '10:00', endTime: '09:00', session: null }), 660, 'Giờ kết thúc lệch: +1 tiếng');
assert.equal(planner.itemEndMinutes({ startTime: null, endTime: null, session: 'AFTERNOON' }), 900, 'Mục cũ theo buổi: 14:00 + 1 tiếng');

// ─── Sheet thêm mục: khung giờ trống, trùng giờ, loại + tên chọn sẵn ─────

const DAY2 = [
  { uid: 'an-trua', dayIndex: 2, startTime: '10:30', endTime: '11:30', session: null, kind: 'MEAL', title: 'Ăn trưa' },
  { uid: 'an-sang', dayIndex: 2, startTime: '06:30', endTime: '07:30', session: null, kind: 'MEAL', title: 'Ăn sáng tại chỗ ở' },
  { uid: 'kim-noi', dayIndex: 2, startTime: '08:30', endTime: '10:00', session: null, kind: 'PLACE', title: 'Kim Nọi' },
  { uid: 'ngay-1', dayIndex: 1, startTime: '07:30', endTime: '12:00', session: null, kind: 'TRANSPORT', title: 'Ngày khác' },
];
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, 'an-sang')), { startTime: '07:30', endTime: '08:30' },
  'Ngay sau bữa sáng 06:30–07:30, vừa kịp trước Kim Nọi 08:30');
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, 'an-sang', 90)), { startTime: '07:30', endTime: '08:30' }, 'Dài hơn khoảng trống: cắt tới giờ mục kế tiếp');
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, 'an-sang', 30)), { startTime: '07:30', endTime: '08:00' });
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, 'kim-noi')), { startTime: '10:00', endTime: '10:30' }, 'Còn đúng 30 phút trước bữa trưa');
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, null)), { startTime: '11:30', endTime: '12:30' }, 'Cuối ngày: sau mục kết thúc muộn nhất');
assert.deepEqual(plain(planner.slotAfter(DAY2, 3, null)), { startTime: '07:00', endTime: '08:00' }, 'Ngày trống: 07:00');
assert.deepEqual(plain(planner.slotAfter(DAY2, 2, 'khong-co')), { startTime: '11:30', endTime: '12:30' }, 'Không thấy mục đứng trước: như cuối ngày');
const tight = [
  { uid: 'a', dayIndex: 1, startTime: '07:00', endTime: '08:00', session: null },
  { uid: 'b', dayIndex: 1, startTime: '08:15', endTime: '09:00', session: null },
  { uid: 'c', dayIndex: 1, startTime: '08:45', endTime: '09:30', session: null },
];
assert.deepEqual(plain(planner.slotAfter(tight, 1, 'a')), { startTime: '09:30', endTime: '10:30' },
  'Khoảng trống dưới 30 phút: tìm khoảng kế tiếp (bỏ qua mục chồng nhau)');
assert.equal(planner.slotAfter([{ uid: 'x', dayIndex: 1, startTime: '22:30', endTime: '23:30', session: null }], 1, 'x'), null, 'Hết chỗ trước 23:00');
assert.equal(planner.findOverlap(DAY2, 2, '07:30', '08:30'), null, 'Chạm mép không tính trùng');
assert.equal(planner.findOverlap(DAY2, 2, '07:30', '09:00').uid, 'kim-noi', '1,5 giờ trùng Kim Nọi (08:30)');
assert.equal(planner.findOverlap(DAY2, 2, '06:00', null).uid, 'an-sang', 'Không có giờ kết thúc: tính 1 tiếng');
assert.equal(planner.findOverlap(DAY2, 2, '08:45', '09:15', 'kim-noi'), null, 'Bỏ qua chính mục đang sửa');
assert.equal(planner.findOverlap(DAY2, 1, '08:00', '09:00').uid, 'ngay-1', 'Chỉ xét cùng ngày');
assert.equal(planner.findOverlap(DAY2, 2, '', null), null);
assert.equal(planner.kindForTime('07:30', 'MEAL').kind, 'PLACE', 'Vừa ăn sáng xong → chọn sẵn Tham quan');
assert.equal(planner.kindForTime('07:30', 'MEAL').reason, 'Vừa ăn sáng xong, trời còn mát');
assert.equal(planner.kindForTime('06:30').kind, 'MEAL', 'Giờ ăn sáng');
assert.equal(planner.kindForTime('12:00', 'MEAL').kind, 'PLACE', 'Đang giờ ăn nhưng vừa ăn xong');
assert.equal(planner.kindForTime('12:00', 'PLACE').kind, 'MEAL');
assert.equal(planner.kindForTime('19:00').kind, 'MEAL');
assert.equal(planner.kindForTime('20:00').kind, 'ACTIVITY', 'Từ 20:00: hoạt động');
assert.equal(planner.kindForTime('20:30', 'MEAL').kind, 'ACTIVITY');
assert.equal(planner.kindForTime('22:00').kind, 'FREE', 'Từ 22:00: nghỉ ngơi');
assert.equal(planner.kindForTime('15:00').kind, 'PLACE');
assert.ok(planner.kindForTime('15:00').reason.length > 0);
assert.equal(planner.kindForTime(null).kind, 'PLACE');
assert.equal(planner.defaultTitleFor('MEAL', '06:30'), 'Ăn sáng');
assert.equal(planner.defaultTitleFor('MEAL', '11:30'), 'Ăn trưa');
assert.equal(planner.defaultTitleFor('MEAL', '15:30'), 'Cà phê, ăn nhẹ');
assert.equal(planner.defaultTitleFor('MEAL', '19:00'), 'Ăn tối');
assert.equal(planner.defaultTitleFor('MEAL', null), 'Ăn uống');
assert.equal(planner.defaultTitleFor('TRANSPORT', '10:00'), 'Di chuyển');
assert.equal(planner.defaultTitleFor('FREE', '12:00'), 'Nghỉ trưa');
assert.equal(planner.defaultTitleFor('FREE', '18:00'), 'Nghỉ ngơi');
assert.equal(planner.defaultTitleFor('ACTIVITY', '20:30'), 'Hoạt động buổi tối');
assert.equal(planner.defaultTitleFor('ACTIVITY', '15:00'), 'Hoạt động');
assert.equal(planner.defaultTitleFor('STAY', '11:30'), 'Trả phòng');
assert.equal(planner.defaultTitleFor('STAY', '14:00'), 'Nhận phòng');
assert.equal(planner.defaultTitleFor('PLACE', '08:00'), 'Điểm tham quan');

// Dịch vụ chọn sẵn theo điểm, điểm gợi ý theo khung giờ
const ADD_CATALOG = {
  ...CATALOG,
  templates: TEMPLATES,
  places: [
    { id: 19, slug: 'deo-khau-pha', name: 'Đèo Khau Phạ', suitableSessions: ['AFTERNOON'] },
    { id: 23, slug: 'doi-kim-noi-hang-dang-de', name: 'Đồi Kim Nọi', suitableSessions: ['MORNING'], suggestedAddons: ['FLYCAM', 'KHONG_CO'] },
    { id: 24, slug: 'song-lung-khung-long-de-xu-phinh', name: 'Sống Lưng Khủng Long', suitableSessions: ['MORNING'] },
    { id: 25, slug: 'doi-mam-xoi-la-pan-tan', name: 'Đồi Mâm Xôi', suitableSessions: ['MORNING'] },
    { id: 31, slug: 'doi-mong-ngua', name: 'Đồi Móng Ngựa', suitableSessions: ['AFTERNOON'], scenicType: 'Ruộng bậc thang di sản', suggestedAddons: [] },
    { id: 32, slug: 'ban-lim-mong', name: 'Bản Lìm Mông', suitableSessions: [], scenicType: null },
  ],
};
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, 19)), { codes: ['FLYCAM', 'PARAGLIDING'], reason: 'Chọn sẵn: hay đi kèm Đèo Khau Phạ' },
  'Dịch vụ các gói dùng ở điểm (theo slug), theo thứ tự danh mục');
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, 25)).codes, ['FLYCAM'], 'Mục gói theo id điểm');
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, 23)).codes, ['FLYCAM'], 'suggestedAddons của máy chủ; mã không còn cung cấp bị bỏ');
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, 31)), { codes: ['FLYCAM'], reason: 'Chọn sẵn: Đồi Móng Ngựa là điểm ngắm cảnh' },
  'Điểm ngắm cảnh chưa có gói nào: flycam');
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, 32)), { codes: [], reason: null });
assert.deepEqual(plain(planner.addonsForPlace(ADD_CATALOG, null)), { codes: [], reason: null });
assert.deepEqual(plain(planner.addonPlaces(ADD_CATALOG, 'PARAGLIDING')).map((p) => p.id), [19]);
assert.equal(planner.addonUnavailableReason(ADD_CATALOG, 'PARAGLIDING', 31), 'Chỉ có ở Đèo Khau Phạ', 'Dù lượn chỉ ở Khau Phạ');
assert.equal(planner.addonUnavailableReason(ADD_CATALOG, 'PARAGLIDING', 19), null);
assert.equal(planner.addonUnavailableReason(ADD_CATALOG, 'FLYCAM', 32), null, 'Flycam đi kèm điểm nào cũng được');
const tripItems = [{ dayIndex: 2, placeId: 23 }, { dayIndex: 1, placeId: 19 }, { dayIndex: 2, placeId: null }];
assert.deepEqual(plain(planner.suggestPlaces(ADD_CATALOG, tripItems, 2, '07:30')).map((p) => p.id), [24, 25, 32, 31, 19, 23],
  'Chưa có trong chuyến + hợp buổi sáng + có trong gói trước; điểm đã có trong chính ngày đó cuối cùng');
assert.deepEqual(plain(planner.suggestPlaces(ADD_CATALOG, [], 1, null)).map((p) => p.id), [19, 23, 24, 25, 31, 32], 'Chưa có giờ: gói trước, giữ thứ tự');

// ─── Gói → lịch trình thường (chép nguyên, sửa được) ─────────────────

const filters = { duration: '2-1', dining: 'trip-dac-san-dia-phuong', goals: ['trip-san-anh-flycam'] };
const draft = planner.instantiateTemplate(MCC_2N1D, CATALOG, { startDate: '2026-10-17', guests: 4, province: 'Yên Bái', filters, stayPlaceId: 5 });
assert.equal(draft.templateCode, 'MCC_2N1D');
assert.equal(draft.regionId, 1);
assert.equal(draft.days, 2);
assert.equal(draft.guests, 4);
assert.deepEqual(draft.items.map((i) => `${i.dayIndex} ${i.startTime} ${i.kind} ${i.title}`), [
  '1 05:30 TRANSPORT Khởi hành từ Hà Nội',
  '1 11:00 MEAL Ăn trưa tại Tú Lệ',
  '1 12:00 PLACE Check-in đèo Khau Phạ',
  '1 20:30 ACTIVITY Bản chưa công khai',
  '2 08:00 PLACE Kim Nọi',
], 'Đúng mốc giờ của gói; điểm chưa có trên hệ thống thành hoạt động có tên');
const kimNoi = draft.items.find((i) => i.title === 'Kim Nọi');
assert.equal(kimNoi.placeId, 23);
assert.deepEqual(plain(kimNoi.addons), ['FLYCAM'], 'Flycam gắn ở Kim Nọi; mã dịch vụ không còn cung cấp bị bỏ');
assert.equal(draft.items.find((i) => i.kind === 'MEAL').note, 'Cá suối, lợn bản');
assert.equal(planner.instantiateTemplate(MCC_2N1D, CATALOG, { startDate: '17/10', guests: 2, province: null, filters: null }).startDate, null,
  'Ngày đi lạ trong URL bị bỏ qua');
assert.ok(draft.items.every((i) => i.origin === 'SUGGESTED'), 'Mục chép từ gói: nguồn Gợi ý');
assert.equal(draft.templateId, 77, 'Id lịch trình gợi ý (gửi kèm làm templateId)');
assert.equal(kimNoi.sourceStopId, 105, 'Mục nhớ mục gốc của gói');
assert.deepEqual(plain(kimNoi.alternativeIds), [24], 'Phương án đổi điểm: slug → id');
assert.deepEqual(plain(kimNoi.dishIds), []);
const meal = draft.items.find((i) => i.kind === 'MEAL');
assert.deepEqual(plain(meal.dishIds), [7], 'Món của mục: slug → id, món không có trên hệ thống bị bỏ');
assert.equal(draft.items.find((i) => i.title === 'Bản chưa công khai').sourceStopId, null, 'Gói cũ chưa có id mục');
assert.deepEqual(plain(draft.dayInfo), [
  { dayIndex: 1, title: 'Tú Lệ – Khau Phạ', note: null },
  { dayIndex: 2, title: 'Mâm Xôi – Kim Nọi', note: 'Dậy sớm săn mây' },
], 'Tên + lời dặn từng ngày của gói');
assert.equal(planner.instantiateTemplate(MCC_3N2D, CATALOG, { startDate: null, guests: 2, province: null, filters: null }).templateId, null,
  'Máy chủ cũ (gói chưa có id)');

// Còn y như lịch trình gợi ý → đổi tiêu chí thay luôn; đã sửa → hỏi trước
assert.equal(planner.sameAsTemplate(draft.items, MCC_2N1D, CATALOG), true, 'Vừa dựng từ lịch trình gợi ý');
assert.equal(planner.sameAsTemplate([...draft.items].reverse(), MCC_2N1D, CATALOG), true, 'Không phụ thuộc thứ tự');
assert.equal(planner.sameAsTemplate(draft.items.slice(1), MCC_2N1D, CATALOG), false, 'Bỏ một mục');
assert.equal(planner.sameAsTemplate(draft.items.map((i, n) => (n === 0 ? { ...i, startTime: '06:00' } : i)), MCC_2N1D, CATALOG), false, 'Đổi giờ');
assert.equal(planner.sameAsTemplate([...draft.items.slice(1), planner.newCustomItem({ kind: 'MEAL', dayIndex: 1, startTime: '15:00' })], MCC_2N1D, CATALOG), false,
  'Bỏ một mục, thêm một mục');
assert.equal(planner.sameAsTemplate([], null, CATALOG), true, 'Lịch trình trống, chưa có gợi ý');
assert.equal(planner.sameAsTemplate(draft.items, null, CATALOG), false);
assert.equal(planner.sameAsTemplate(draft.items, MCC_3N2D, CATALOG), false, 'Khác lịch trình gợi ý');
assert.equal(planner.instantiateTemplate(MCC_2N1D, { ...CATALOG, dishes: undefined }, { startDate: null, guests: 2, province: null, filters: null })
  .items.find((i) => i.kind === 'MEAL').dishIds, null, 'Danh mục không kèm món: chưa biết (dò theo gói khi hiển thị)');
const idTemplate = {
  ...MCC_2N1D, code: 'MOI',
  content: { items: [{ id: 201, day: 1, start: '08:00', kind: 'PLACE', title: 'Theo id', place: 'slug-cu', placeId: 23, dishIds: [9], alternativePlaceIds: [23, 24] }] },
};
const byId = planner.instantiateTemplate(idTemplate, CATALOG, { startDate: null, guests: 2, province: null, filters: null }).items[0];
assert.equal(byId.placeId, 23, 'Điểm theo id của gói (slug cũ không còn)');
assert.equal(byId.kind, 'PLACE');
assert.deepEqual(plain(byId.dishIds), [9]);
assert.deepEqual(plain(byId.alternativeIds), [24], 'Phương án không gồm điểm hiện tại');
assert.equal(planner.instantiateTemplate(idTemplate, CATALOG, { startDate: null, guests: 2, province: null, filters: null }).dayInfo, null);

// Chuyến dài hơn gói: thêm ngày trống ở cuối
const week = planner.instantiateTemplate(MCC_2N1D, CATALOG, { startDate: '2026-10-11', guests: 2, province: null, filters: null, tripDays: 7 });
assert.equal(week.days, 7, 'Chuyến 1 tuần với gói 2 ngày: 7 ngày, ngày 3 → 7 trống');
assert.equal(planner.draftDays(week), 7);
assert.equal(planner.draftToInput(week).endDate, '2026-10-17');
assert.equal(planner.instantiateTemplate(MCC_2N1D, CATALOG, { startDate: null, guests: 2, province: null, filters: null, tripDays: 1 }).days, 2,
  'Không ngắn hơn gói');

// Mục khách tự thêm, đổi nhanh phương án, "Khôi phục" theo mục gốc, tên ngày
const custom = planner.newCustomItem({ kind: 'MEAL', dayIndex: 2, startTime: '06:30', endTime: '07:30' });
assert.equal(custom.origin, 'CUSTOM', 'Khách thêm: nhãn "Bạn thêm"');
assert.equal(custom.title, 'Ăn sáng', 'Tên theo loại + giờ');
assert.equal(custom.id, null);
assert.ok(custom.uid);
assert.equal(custom.sourceStopId, null);
assert.deepEqual(plain(custom.dishIds), [], 'Rỗng (không phải null): không dò nhầm mục gốc trùng giờ');
assert.deepEqual(plain(custom.alternativeIds), []);
const customPlace = planner.newCustomItem({ kind: 'PLACE', dayIndex: 0, title: 'Đồi Móng Ngựa', placeId: 31, addons: ['FLYCAM'] });
assert.equal(customPlace.dayIndex, 1);
assert.equal(customPlace.title, 'Đồi Móng Ngựa');
assert.equal(customPlace.startTime, null);
assert.deepEqual(plain(customPlace.addons), ['FLYCAM']);
const swapped = planner.swapToPlace(kimNoi, { id: 24, name: 'Sống Lưng Khủng Long' });
assert.equal(swapped.placeId, 24);
assert.equal(swapped.title, 'Sống Lưng Khủng Long');
assert.deepEqual(plain(swapped.alternativeIds), [23], 'Điểm cũ thành phương án để đổi lại');
assert.deepEqual(plain(planner.swapToPlace(swapped, { id: 23, name: 'Đồi Kim Nọi' }).alternativeIds), [24]);
assert.equal(planner.swapToPlace({ ...kimNoi, alternativeIds: null }, { id: 24, name: 'X' }).alternativeIds, null, 'Mục cũ: để dò theo gói');
assert.equal(planner.templateFor(TEMPLATES, { templateId: 77 }).code, 'MCC_2N1D');
assert.equal(planner.templateFor(TEMPLATES, { templateId: 999, templateCode: 'MCC_3N2D' }).code, 'MCC_3N2D', 'Không thấy id: theo mã gói');
assert.equal(planner.templateFor(TEMPLATES, {}), null);
assert.equal(planner.templateFor(null, { templateCode: 'MCC_2N1D' }), null);
const kimNoiSource = planner.templateItemById(MCC_2N1D, 105);
assert.equal(kimNoiSource.title, 'Kim Nọi');
assert.equal(planner.templateItemById(MCC_2N1D, null), undefined);
assert.equal(planner.templateItemById(MCC_3N2D, 105), undefined);
assert.equal(planner.differsFromSource(kimNoi, kimNoiSource, CATALOG), false, 'Chưa sửa');
const editedKimNoi = { ...kimNoi, id: 55, uid: '55', startTime: '09:00', endTime: '10:30', addons: [] };
assert.equal(planner.differsFromSource(editedKimNoi, kimNoiSource, CATALOG), true, 'Đổi giờ → hiện "Gợi ý gốc … · Khôi phục"');
assert.equal(planner.differsFromSource({ ...kimNoi, addons: ['FLYCAM'] }, kimNoiSource, CATALOG), false);
const restoredKimNoi = planner.restoreFromSource(editedKimNoi, kimNoiSource, CATALOG);
assert.equal(restoredKimNoi.startTime, '08:00');
assert.deepEqual(plain(restoredKimNoi.addons), ['FLYCAM']);
assert.equal(restoredKimNoi.id, 55, 'Khôi phục giữ bản ghi');
assert.equal(restoredKimNoi.uid, '55');
assert.equal(restoredKimNoi.origin, 'SUGGESTED');
assert.equal(restoredKimNoi.sourceStopId, 105);
assert.deepEqual(plain(planner.dayTexts([{ dayIndex: 2, title: ' Mâm Xôi ', note: null }], MCC_2N1D)), { titles: [null, 'Mâm Xôi'], notes: [null, null] },
  'Tên ngày của lịch trình (ngày không đặt tên = null)');
assert.deepEqual(plain(planner.dayTexts(null, MCC_2N1D)).titles, ['Tú Lệ – Khau Phạ', 'Mâm Xôi – Kim Nọi'], 'Chưa có: theo gói');
assert.deepEqual(plain(planner.dayTexts([], MCC_2N1D)).notes, [null, 'Dậy sớm săn mây']);
assert.deepEqual(plain(planner.dayTexts(undefined, null)), { titles: [], notes: [] });

// ─── Nháp → API (format 2) ──────────────────────────────────────

const input = planner.draftToInput(draft);
assert.equal(input.format, 2);
assert.equal(input.startDate, '2026-10-17');
assert.equal(input.endDate, '2026-10-18');
assert.equal(input.guestCount, 4);
assert.equal(input.regionId, 1);
assert.deepEqual(plain(input.preferences), { ...filters, stay: 5 }, 'Tag đã chọn + homestay đang xem');
const kimNoiInput = input.stops.find((s) => s.title === 'Kim Nọi');
assert.equal(kimNoiInput.visitDate, '2026-10-18', 'Ngày 2 = ngày đi + 1');
assert.equal(kimNoiInput.session, 'MORNING', 'Buổi suy từ giờ bắt đầu');
assert.equal(kimNoiInput.endTime, '10:00');
const undated = planner.draftToInput({ ...draft, startDate: null, stayPlaceId: null, filters: null });
assert.equal(undated.endDate, null);
assert.ok(undated.stops.every((s) => s.visitDate === null && s.dayIndex >= 1), 'Chưa chọn ngày: chỉ có "Ngày N"');
assert.equal(undated.preferences, null);
const backwards = planner.draftToInput({ ...draft, items: [{ ...draft.items[0], startTime: '10:00', endTime: '09:00' }] });
assert.equal(backwards.stops[0].endTime, null, 'Giờ kết thúc trước giờ bắt đầu thì bỏ (backend từ chối)');
assert.equal(input.templateId, 77, 'Gửi kèm gói đã chép');
assert.deepEqual(plain(input.days), plain(draft.dayInfo), 'Gửi tên + lời dặn từng ngày');
assert.equal(kimNoiInput.sourceStopId, 105);
assert.deepEqual(plain(kimNoiInput.alternativePlaceIds), [24]);
assert.deepEqual(plain(input.stops.find((s) => s.kind === 'MEAL').dishIds), [7]);
assert.equal(planner.draftToInput({ ...draft, dayInfo: null }).days, null, 'Chưa có tên ngày: máy chủ giữ nguyên / chép theo gói');
assert.deepEqual(plain(planner.draftToInput({ ...draft, dayInfo: [...draft.dayInfo, { dayIndex: 5, title: 'Thừa', note: null }] }).days).map((d) => d.dayIndex), [1, 2],
  'Bỏ tên ngày ngoài số ngày của chuyến');

// Mục đã lưu ↔ mục sửa được (sửa tại chỗ trên /journeys/:id)
const savedStop = {
  id: 41, placeId: 23, placeName: 'Đồi Kim Nọi', visitDate: '2026-10-18', session: 'MORNING', kind: 'PLACE', title: 'Kim Nọi', dayIndex: 2,
  startTime: '08:00', endTime: '10:00', note: 'Mang áo khoác', addons: ['FLYCAM'], origin: 'SUGGESTED', sourceStopId: 105, dishIds: [], alternativePlaceIds: [24],
};
const savedItem = planner.itemOfStop(savedStop, '2026-10-17');
assert.equal(savedItem.uid, '41', 'Khóa = id mục (trùng khóa dòng của rowsFromJourney)');
assert.equal(savedItem.origin, 'SUGGESTED');
assert.equal(savedItem.sourceStopId, 105);
assert.deepEqual(plain(savedItem.dishIds), []);
assert.deepEqual(plain(savedItem.alternativeIds), [24]);
assert.deepEqual(plain(planner.stopInputOf(savedItem, '2026-10-17')), {
  id: 41, placeId: 23, kind: 'PLACE', title: 'Kim Nọi', dayIndex: 2, startTime: '08:00', endTime: '10:00', note: 'Mang áo khoác', addons: ['FLYCAM'],
  session: 'MORNING', visitDate: '2026-10-18', sourceStopId: 105, dishIds: [], alternativePlaceIds: [24],
}, 'Mục đã lưu → sửa → gửi lại giữ đủ trường');
const movedInput = planner.stopInputOf({ ...savedItem, dayIndex: 1, startTime: '15:00', endTime: '16:00' }, '2026-10-17');
assert.equal(movedInput.session, 'AFTERNOON', 'Đổi giờ: buổi tính lại (máy chủ ưu tiên buổi gửi lên)');
assert.equal(movedInput.visitDate, '2026-10-17', 'Đổi "Ngày N": ngày tham quan tính lại');
const oldServerItem = planner.itemOfStop({ id: 3, placeId: 19, placeName: 'Đèo Khau Phạ', visitDate: '2026-10-18', session: 'AFTERNOON' }, '2026-10-17');
assert.deepEqual([oldServerItem.kind, oldServerItem.dayIndex, oldServerItem.session, oldServerItem.title, oldServerItem.origin], ['PLACE', 2, 'AFTERNOON', 'Đèo Khau Phạ', 'CUSTOM'],
  'Máy chủ cũ: Ngày N theo ngày tham quan, giữ buổi');
assert.equal(oldServerItem.dishIds, null, 'Máy chủ cũ: chưa biết món → dò theo gói');
assert.equal(oldServerItem.alternativeIds, null);
const oldServerInput = planner.stopInputOf(oldServerItem, null);
assert.deepEqual([oldServerInput.visitDate, oldServerInput.session, oldServerInput.sourceStopId, oldServerInput.dishIds, oldServerInput.alternativePlaceIds],
  [null, 'AFTERNOON', null, null, null], 'Chưa có ngày đi; null = máy chủ giữ nguyên');
assert.equal(planner.itemOfStop({ ...savedStop, origin: undefined }, null).origin, 'SUGGESTED', 'Thiếu nguồn mà có mục gốc: Gợi ý');

// ─── Lịch trình đã lưu → nháp (sửa ở /lich-trinh/:id) ───────────────

const legacy = planner.draftFromJourney({
  id: 9, title: 'Chuyến cũ', startDate: null, endDate: null, basePlaceId: 20, regionId: null, regionName: null, guestCount: null,
  templateCode: null, preferences: { duration: '2-1', goals: ['trip-san-anh-flycam', 7], stay: 5 },
  stops: [
    { id: 2, placeId: 19, placeName: 'Đèo Khau Phạ', visitDate: '2026-10-18', session: 'AFTERNOON' },
    { id: 1, placeId: 23, placeName: 'Đồi Kim Nọi', visitDate: '2026-10-17', session: 'MORNING' },
  ],
}, CATALOG);
assert.deepEqual(legacy.items.map((i) => `${i.id} ${i.kind} N${i.dayIndex} ${i.session} ${i.title}`), [
  '1 PLACE N1 MORNING Đồi Kim Nọi',
  '2 PLACE N2 AFTERNOON Đèo Khau Phạ',
], 'Lịch trình cũ (chỉ điểm tham quan theo buổi) vẫn sửa được');
assert.equal(legacy.startDate, '2026-10-17');
assert.equal(legacy.days, 2);
assert.equal(legacy.regionId, 1, 'Thiếu tỉnh: lấy theo danh mục');
assert.equal(legacy.guests, 2);
assert.equal(legacy.stayPlaceId, 5);
assert.deepEqual(plain(legacy.filters), { duration: '2-1', dining: null, goals: ['trip-san-anh-flycam'] }, 'Tiêu chí của lịch trình đã lưu (bỏ khóa lạ)');
assert.equal(planner.draftToInput(legacy).preferences.stay, 5, 'Sửa rồi lưu vẫn giữ homestay đang xem');
assert.equal(legacy.templateId, null);
assert.equal(legacy.dayInfo, null);
assert.equal(planner.draftToInput(legacy).days, null, 'Lịch trình cũ: không đụng tên ngày');
assert.ok(legacy.items.every((i) => i.dishIds === null && i.alternativeIds === null && i.sourceStopId === null));
const savedDraft = planner.draftFromJourney({
  id: 12, title: 'MCC', startDate: '2026-10-17', endDate: '2026-10-18', basePlaceId: null, regionId: 1, regionName: 'Yên Bái', guestCount: 3,
  templateCode: 'MCC_2N1D', templateId: 77, preferences: null, days: [{ dayIndex: 1, title: 'Ngày đầu', note: null }], stops: [savedStop],
}, CATALOG);
assert.equal(savedDraft.templateId, 77);
assert.deepEqual(plain(savedDraft.dayInfo), [{ dayIndex: 1, title: 'Ngày đầu', note: null }]);
assert.equal(savedDraft.items[0].uid, '41');
const savedDraftInput = planner.draftToInput(savedDraft);
assert.equal(savedDraftInput.templateId, 77, 'Sửa ở /lich-trinh/:id rồi lưu không mất gói đã chép');
assert.deepEqual(plain(savedDraftInput.days), [{ dayIndex: 1, title: 'Ngày đầu', note: null }], '… tên ngày');
assert.deepEqual(plain(savedDraftInput.stops[0].alternativePlaceIds), [24], '… phương án của mục');
assert.equal(savedDraftInput.stops[0].sourceStopId, 105);
assert.equal(planner.preferredStayOf({ preferences: { stay: '5' } }), null);
assert.equal(planner.preferredStayOf({ preferences: null }), null);

// ─── Tag đã chọn → nhãn trên trang lịch trình ────────────────────

assert.deepEqual(plain(planner.preferenceLabels({ ...filters, price: 999000, stay: 5 }, TAGS)),
  ['2N1Đ', 'Đặc sản địa phương', 'Săn ảnh, flycam'], 'Chỉ tiêu chí (lịch trình cũ còn "price": bỏ qua)');
assert.deepEqual(plain(planner.preferenceLabels(null, TAGS)), []);

// ─── Nháp trên máy (giữ qua lần đăng nhập giữa chừng) ─────────────────

planner.saveTripDraft(draft);
assert.equal(planner.loadTripDraft().templateCode, 'MCC_2N1D');
planner.saveTripDraft(null);
assert.equal(planner.loadTripDraft(), null);
const draftBeforeUpgrade = {
  version: 1, journeyId: null, province: 'Yên Bái', regionId: 1, regionName: 'Yên Bái', templateCode: 'MCC_2N1D', title: 'Nháp cũ', startDate: null,
  days: 2, guests: 2, basePlaceId: null, filters: null, stayPlaceId: null, forBooking: null,
  items: [{ uid: 'a', id: null, kind: 'PLACE', dayIndex: 2, startTime: '08:00', endTime: '10:00', session: null, title: 'Kim Nọi', note: null, placeId: 23, addons: ['FLYCAM'] }],
};
storage.set('trip_draft_v1', JSON.stringify(draftBeforeUpgrade));
const upgraded = planner.loadTripDraft();
assert.ok(upgraded, 'Nháp lưu từ bản trước (thiếu trường mới) vẫn mở được');
assert.equal(upgraded.items.length, 1, 'Không mất mục');
assert.deepEqual([upgraded.templateId, upgraded.dayInfo], [null, null]);
assert.deepEqual([upgraded.items[0].origin, upgraded.items[0].sourceStopId, upgraded.items[0].dishIds, upgraded.items[0].alternativeIds], ['SUGGESTED', null, null, null],
  'Trường thiếu = chưa biết (dò theo gói như trước)');
assert.equal(planner.normalizeTripDraft({ ...draftBeforeUpgrade, templateCode: null }).items[0].origin, 'CUSTOM');
assert.deepEqual(plain(planner.normalizeTripDraft({ ...draftBeforeUpgrade, filters: { duration: '2-1', price: 999000, dining: null, goals: ['x', 3] } }).filters),
  { duration: '2-1', dining: null, goals: ['x'] }, 'Nháp bản trước còn "price": chỉ giữ tiêu chí');
assert.equal(planner.draftToInput(upgraded).stops[0].dishIds, null);
storage.set('trip_draft_v1', JSON.stringify({ version: 0, items: [] }));
assert.equal(planner.loadTripDraft(), null, 'Nháp bản khác bị bỏ qua');
storage.set('trip_draft_v1', '{hỏng');
assert.equal(planner.loadTripDraft(), null);

// ─── Link trang tạo lịch trình /lich-trinh/tao ──────────────────

const query = (path) => new URL(path, 'https://viettrek.test').searchParams;
assert.equal(links.tripPlannerPath(), '/lich-trinh/tao');
assert.equal(links.tripPlannerPath({ province: '  ' }), '/lich-trinh/tao');
const full = query(links.tripPlannerPath({ province: 'Yên Bái', checkIn: '2026-10-17', checkOut: '2026-10-18', guests: 4, stay: 5, forBooking: 'DL1' }));
assert.equal(full.get('province'), 'Yên Bái');
assert.equal(full.get('checkIn'), '2026-10-17');
assert.equal(full.get('checkOut'), '2026-10-18');
assert.equal(full.get('guests'), '4');
assert.equal(full.get('stay'), '5');
assert.equal(full.get('forBooking'), 'DL1');
const half = query(links.tripPlannerPath({ province: 'Yên Bái', checkIn: '2026-10-17', guests: 0 }));
assert.equal(half.get('checkIn'), null, 'Thiếu ngày về thì không gửi ngày');
assert.equal(half.get('guests'), null);
const edit = query(links.tripPlannerPath({
  province: 'Yên Bái', checkIn: '2026-10-11', checkOut: '2026-10-12', guests: 2, stay: 5, template: 'MCC_2N1D',
  duration: '2-1', price: 999000, dining: 'trip-dac-san-dia-phuong', goals: ['trip-san-may-binh-minh', '', 'trip-san-anh-flycam'],
}));
assert.equal(edit.get('tpl'), 'MCC_2N1D', 'Lịch trình gợi ý chọn kèm đơn: mở thẳng lịch trình đó');
assert.equal(edit.get('step'), null, 'Trang tạo lịch trình không có các bước lọc');
assert.equal(edit.get('d'), '2-1');
assert.equal(edit.get('p'), null, 'Không gửi giá — giá không phải tiêu chí');
assert.equal(edit.get('an'), 'trip-dac-san-dia-phuong');
assert.equal(edit.get('mt'), 'trip-san-may-binh-minh,trip-san-anh-flycam', 'Trải nghiệm cách nhau dấu phẩy, bỏ ô trống');
const bare = query(links.tripPlannerPath({ province: 'Yên Bái', goals: [], template: null, step: null }));
assert.deepEqual([bare.get('d'), bare.get('mt'), bare.get('tpl'), bare.get('step')], [null, null, null, null], 'Không chọn thì không gửi');
assert.equal(query(links.tripPlannerPath({ stay: 5, template: 'blank' })).get('tpl'), null, '"blank" = lịch trình trống, không gửi gói');

// ─── Dòng thời gian: món / phương án của chính mục, đánh số điểm theo ngày ──────

const lookups = {
  places: [...CATALOG.places, { id: 25, slug: 'doi-mam-xoi-la-pan-tan', name: 'Đồi Mâm Xôi', coverImageUrl: null, regionName: null }],
  dishes: [...CATALOG.dishes, { id: 9, slug: 'ga-den', name: 'Gà đen', coverImageUrl: null }],
};
const draftRows = plain(rows.rowsFromDraft(draft.items, lookups, MCC_2N1D));
const rowOf = (list, title) => list.find((r) => r.title === title);
assert.deepEqual(rowOf(draftRows, 'Ăn trưa tại Tú Lệ').dishes.map((d) => d.id), [7], 'Ảnh món theo món của mục');
assert.deepEqual(rowOf(draftRows, 'Kim Nọi').alternative, { id: 24, name: 'Sống Lưng Khủng Long' }, 'Phương án theo mục');
assert.deepEqual(draftRows.map((r) => r.order ?? null), [null, null, 1, null, 1], 'Điểm tham quan đánh số 1..n theo từng ngày');
assert.equal(rowOf(draftRows, 'Kim Nọi').origin, 'SUGGESTED');
assert.equal(rowOf(draftRows, 'Kim Nọi').sourceStopId, 105);
assert.equal(rowOf(draftRows, 'Kim Nọi').placeLinkId, 23, 'Link /destinations/:id');
assert.equal(rowOf(draftRows, 'Bản chưa công khai').placeLinkId, null);
// Đổi giờ mục của gói: vẫn giữ món / phương án (trước đây dò theo giờ nên mất)
const retimed = draft.items.map((i) => (i.title === 'Kim Nọi' ? { ...i, startTime: '09:15' } : i.kind === 'MEAL' ? { ...i, startTime: '11:45' } : i));
const retimedRows = plain(rows.rowsFromDraft(retimed, lookups, MCC_2N1D));
assert.deepEqual(rowOf(retimedRows, 'Kim Nọi').alternative, { id: 24, name: 'Sống Lưng Khủng Long' }, 'Đổi giờ không mất phương án');
assert.deepEqual(rowOf(retimedRows, 'Ăn trưa tại Tú Lệ').dishes.map((d) => d.id), [7], 'Đổi giờ không mất ảnh món');
// Mục khách thêm trùng giờ mục của gói: không nhận nhầm món / phương án
const clash = plain(rows.rowsFromDraft([planner.newCustomItem({ kind: 'PLACE', dayIndex: 2, startTime: '08:00', title: 'Điểm mới', placeId: 25 })], lookups, MCC_2N1D));
assert.equal(clash[0].alternative, null, 'Mục mới 08:00 Ngày 2 không nhận "Đổi sang" của Kim Nọi');
assert.equal(clash[0].origin, 'CUSTOM');
// Mục cũ (chưa có món / phương án riêng): dò theo gói như trước
const legacyRows = plain(rows.rowsFromDraft(upgraded.items, lookups, MCC_2N1D));
assert.deepEqual(legacyRows[0].alternative, { id: 24, name: 'Sống Lưng Khủng Long' }, 'Nháp cũ: phương án dò theo ngày + giờ của gói');
// Sau khi đổi sang phương án: đổi lại được
const swappedRows = plain(rows.rowsFromDraft([swapped], lookups, MCC_2N1D));
assert.deepEqual(swappedRows[0].alternative, { id: 23, name: 'Đồi Kim Nọi' });
// Lịch trình đã lưu
const journeyRows = plain(rows.rowsFromJourney({
  id: 12, title: 'MCC', startDate: '2026-10-17', endDate: '2026-10-18', basePlaceId: null, stops: [
    savedStop,
    { id: 40, placeId: null, placeName: null, visitDate: '2026-10-17', session: 'NOON', kind: 'MEAL', title: 'Ăn trưa', startTime: '11:00', endTime: '12:00', origin: 'CUSTOM', dishIds: [9, 404] },
    { id: 42, placeId: 25, placeName: 'Đồi Mâm Xôi', visitDate: '2026-10-18', session: 'MORNING', kind: 'PLACE', dayIndex: 2, startTime: '06:00' },
  ],
}, lookups, MCC_2N1D, 42));
assert.deepEqual(journeyRows.map((r) => `${r.key} N${r.dayIndex} ${r.order ?? '-'}`), ['40 N1 -', '42 N2 1', '41 N2 2'], 'Đánh số theo ngày, theo giờ');
assert.deepEqual(journeyRows[0].dishes.map((d) => d.name), ['Gà đen'], 'Món của mục (bỏ món không còn trong danh mục)');
assert.equal(journeyRows[0].origin, 'CUSTOM');
assert.equal(journeyRows[1].status, 'next');
assert.equal(journeyRows[1].origin, undefined, 'Máy chủ cũ: không có nhãn nguồn');
assert.equal(journeyRows[2].alternative.id, 24);
assert.equal(journeyRows[2].placeLinkId, 23);
const sharedRows = plain(rows.rowsFromShared([
  { kind: 'PLACE', title: 'Kim Nọi', placeId: 23, placeName: 'Đồi Kim Nọi', dayNumber: 2, visitDate: null, session: 'MORNING', startTime: '08:00', sourceStopId: 105, dishIds: [], alternativePlaceIds: [24] },
  { kind: 'MEAL', title: 'Ăn sáng', placeId: null, placeName: null, dayNumber: 2, visitDate: null, session: 'MORNING', startTime: '06:00' },
], lookups, MCC_2N1D));
assert.equal(sharedRows[0].order, 1);
assert.equal(sharedRows[0].alternative.id, 24);
assert.equal(sharedRows[0].sourceStopId, 105);
assert.equal(sharedRows[1].placeLinkId, null);

// "Gợi ý gốc … · Khôi phục": chỉ khi mục gợi ý đã sửa khác mục gốc (theo sourceStopId).
const lunch = planner.newCustomItem({ kind: 'MEAL', dayIndex: 1, startTime: '11:00', endTime: '12:00', title: 'Ăn trưa tại Tú Lệ', note: 'Cá suối, lợn bản' });
const suggestedLunch = { ...lunch, origin: 'SUGGESTED', sourceStopId: 102 };
assert.equal(planner.sourceRestore(suggestedLunch, MCC_2N1D, CATALOG), null, 'Chưa sửa: không hiện Khôi phục');
const movedLunch = planner.sourceRestore({ ...suggestedLunch, startTime: '12:30', endTime: '13:30' }, MCC_2N1D, CATALOG);
assert.equal(movedLunch.label, '11:00–12:00 Ăn trưa tại Tú Lệ');
assert.equal(movedLunch.restored.startTime, '11:00');
assert.equal(movedLunch.restored.uid, lunch.uid, 'Khôi phục giữ uid của mục');
assert.equal(planner.sourceRestore({ ...suggestedLunch, dayIndex: 2 }, MCC_2N1D, CATALOG).label, 'Ngày 1 · 11:00–12:00 Ăn trưa tại Tú Lệ');
assert.equal(planner.sourceRestore({ ...lunch, startTime: '12:30', sourceStopId: 102 }, MCC_2N1D, CATALOG), null, 'Mục khách thêm: không khôi phục');

console.log('test-trip-planner: OK');
