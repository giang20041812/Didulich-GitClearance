-- ══════════════════════════════════════════════════════════════════════════════
-- SEED: 30 Homestay ĐiMCC – Mù Cang Chải
-- Nguồn: khảo sát thực địa (Google Sheet "Tổng hợp thông tin ĐiMCC")
-- Chạy trên Supabase SQL Editor hoặc:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/seed/seed-homestay-dimcc.sql
-- An toàn khi chạy lại: dùng ON CONFLICT DO UPDATE SET cho place;
--   DELETE + re-INSERT cho các bảng con để đảm bảo đồng bộ.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PLACE – 30 homestay
-- ─────────────────────────────────────────────────────────────────────────────
-- Lookup region ids cần dùng
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM region WHERE code = 'MCC_THI_TRAN') THEN
    RAISE EXCEPTION 'Region MCC_THI_TRAN chưa có — chạy migration 007 trước.';
  END IF;
END $$;

WITH home_data (slug, name, name_norm, badge, address, region_code, maps_url,
                phone, visibility, source_type, summary, data_verified) AS (VALUES
  ('homestay-anh-tuc',        'Homestay Anh Túc',            'homestay anh tuc',          'Homestay',  'Thôn Khim Nọi, TT Mù Cang Chải',       'MCC_THI_TRAN', 'https://maps.app.goo.gl/kNEzaYwbscE7dBni8',  '0963000708', 'PUBLISHED', 'PROVIDER',       'Không gian chung rộng, xanh mát, view cánh đồng lúa. Có phục vụ ăn uống tại chỗ.', FALSE),
  ('new-highland-hotel',      'New Highland Hotel',           'new highland hotel',         'Khách sạn', 'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/xdCor2hxA9UNpT1J9',  '0966242337', 'PUBLISHED', 'PROVIDER',       'Phòng sang trọng lịch sự, gần các quán ăn ngon, lễ tân chu đáo, thang máy.', FALSE),
  ('homestay-mua-vang',       'Homestay Mùa Vàng',            'homestay mua vang',          'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/JihXMRmHxkM8a11RA',  '0915505599', 'PUBLISHED', 'PROVIDER',       'Phòng rộng sạch sẽ, bãi đỗ xe từ 4–45 chỗ, gần nhà hàng Quyền Hường.', FALSE),
  ('trai-ban-homestay',       'Trai Bản Homestay',            'trai ban homestay',          'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/Z7oCRgZoPHDhikZs5',  '0979929101', 'PUBLISHED', 'PROVIDER',       'Bungalow riêng tư, giao lưu văn nghệ, ẩm thực đặc sắc, view cánh đồng lúa, sân vườn đẹp.', FALSE),
  ('hoa-son-tra-hotel',       'Hoa Sơn Tra Hotel',            'hoa son tra hotel',          'Khách sạn', 'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/vr2g7Fv9dAx4Cssx7',  '0974664911', 'PUBLISHED', 'PROVIDER',       'Mặt đường QL 32, phòng mới sang trọng, gần trung tâm thị trấn.', FALSE),
  ('nha-nghi-duy-vu',         'Nhà nghỉ Duy Vũ',              'nha nghi duy vu',            'Nhà nghỉ', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/xx94RwHdgQa9rLHq9',  '0964966648', 'PUBLISHED', 'PROVIDER',       'Số lượng phòng lớn, mặt đường QL 32. Phù hợp khách đoàn.', FALSE),
  ('baan-mali-homestay',      'Baan Mali Homestay',           'baan mali homestay',         'Homestay',  'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/N1aSWRo1P5SFhx9bA',  '0983994669', 'PUBLISHED', 'PROVIDER',       'Đầu tư bài bản, không gian chung rộng, phòng cộng đồng sang trọng, khu WC chung sạch.', FALSE),
  ('homestay-hoa-thao',       'Homestay Hoà Thảo',            'homestay hoa thao',          'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/8xr2FzvdQbNYjQTA9',  '0974508699', 'PUBLISHED', 'PROVIDER',       'Nhà sàn phong cách bản địa, phòng tầng âm view lúa, chủ thân thiện, gần QL 32.', FALSE),
  ('homestay-cuong-tu',       'Homestay Cường Tú',            'homestay cuong tu',          'Homestay',  'Thôn Khim Nọi, TT Mù Cang Chải',       'MCC_THI_TRAN', 'https://maps.app.goo.gl/7uSqAvDkTT7pxxP89',  '0385179642', 'DRAFT',     'PUBLIC_TRUSTED', 'View cánh đồng lúa, ẩm thực dân tộc, thuận tiện đỗ xe.', FALSE),
  ('homestay-bao-lan',        'Homestay Bảo Lan',             'homestay bao lan',           'Homestay',  'Thôn Khim Nọi, TT Mù Cang Chải',       'MCC_THI_TRAN', 'https://maps.app.goo.gl/PRfKszUReXakHuvG7',  '0399529540', 'DRAFT',     'PUBLIC_TRUSTED', 'Nhà sàn kết hợp phòng đơn và đôi, không gian xanh mát.', FALSE),
  ('win-homestay',            'Win Homestay',                 'win homestay',               'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/XNEdzmc9eBAdjqZMA',  '0889347991', 'DRAFT',     'PUBLIC_TRUSTED', 'Nhà sàn rộng, view toàn bộ khu vực trung tâm MCC, sân vườn cảnh quan đẹp.', FALSE),
  ('pu-nhu-house',            'Pú Nhu House',                 'pu nhu house',               'Homestay',  'Thôn 3 Nhà xa, Púng Luông',             'MCC_PUNG_LUONG','https://maps.app.goo.gl/c7VUvHXcWF2eA2Yb6', '0966108555', 'DRAFT',     'PUBLIC_TRUSTED', 'Nhiều hạng phòng độc đáo (phòng tổ chim, phòng ven suối), bể bơi, nhà hàng rộng, gần đồi Mâm Xôi.', FALSE),
  ('co-gai-thai-homestay',    'Cô Gái Thái Homestay',         'co gai thai homestay',       'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/GjdobF5UVooik5z16',  '0392922050', 'PUBLISHED', 'PROVIDER',       'Giao lưu văn nghệ, ẩm thực đặc sắc, view cánh đồng lúa, sân vườn đẹp.', FALSE),
  ('moc-homestay',            'Mộc Homestay',                 'moc homestay',               'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/GcUpj9Y5DRAC4BE99',  '0975481009', 'DRAFT',     'PUBLIC_TRUSTED', 'Phong cách tối giản, view lúa thoáng mát.', FALSE),
  ('bungalow-xuan-giang',     'Bungalow Xuân Giang',          'bungalow xuan giang',        'Bungalow',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/1F62FAwmAU69yJzP8',  '0988869363', 'PUBLISHED', 'PROVIDER',       'Bungalow khép kín riêng tư, không gian chung mát mẻ, có ăn uống, bãi đỗ xe.', FALSE),
  ('hotel-thuat-hoa',         'Hotel Thuật Hòa',              'hotel thuat hoa',            'Khách sạn', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/4tBKooFQ9GHr1JUY6',  '0917166569', 'DRAFT',     'PUBLIC_TRUSTED', 'Gần trung tâm thị trấn, thuận tiện đi lại.', FALSE),
  ('chelly-hotel',            'Chelly Hotel',                 'chelly hotel',               'Khách sạn', 'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/LALfNvN1rDFnAeFNA',  '0964656633', 'DRAFT',     'PUBLIC_TRUSTED', 'Phòng sang trọng lịch sự, bãi đỗ xe riêng.', FALSE),
  ('hanh-phuc-creek-homestay','Hạnh Phúc Creek Homestay',     'hanh phuc creek homestay',   'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/6zZPMKn8oXjqTMSW8',  '0865918722', 'DRAFT',     'PUBLIC_TRUSTED', 'Giá rẻ, gần đường lên Rừng Trúc.', FALSE),
  ('doi-doi-gio',             'Đồi Đổi Gió',                  'doi doi gio',                'Homestay',  'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/vYKGVhZDMGwMnVaw7',  '0387927468', 'DRAFT',     'PROVIDER',       'Sân vườn trang trí độc đáo, phòng bungalow sang trọng tiện nghi, có ăn uống.', FALSE),
  ('mcc-lu-tre',              'Mù Cang Chải Lu Trế',          'mu cang chai lu tre',        'Bungalow',  'Thôn Khim Nọi, TT Mù Cang Chải',       'MCC_THI_TRAN', 'https://maps.app.goo.gl/jNDjU5UMEwFNeexD8',  '0352032000', 'DRAFT',     'PUBLIC_TRUSTED', 'Bungalow rộng, giá phải chăng, sân vườn rộng rãi.', FALSE),
  ('mai-linh-hotel',          'Mai Linh Hotel',               'mai linh hotel',             'Khách sạn', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/Mx1Ryi3sTXU44UDo7',  '0387927468', 'DRAFT',     'PROVIDER',       'Số lượng phòng lớn (20 phòng), vị trí trung tâm, bể bơi.', FALSE),
  ('sky-motel',               'Sky Motel',                    'sky motel',                  'Nhà nghỉ', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/DLGtF3c1BF9kjZ91A',  '0396249733', 'DRAFT',     'PUBLIC_TRUSTED', NULL, FALSE),
  ('nang-hotel',              'Nắng Hotel',                   'nang hotel',                 'Nhà nghỉ', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/MfGsvrRN1Hoa7d2Y7',  '0825768999', 'DRAFT',     'PUBLIC_TRUSTED', 'Phòng sang trọng, vị trí đắc địa, phục vụ café và đồ ăn nhanh.', FALSE),
  ('nha-nghi-ngu',            'Nhà nghỉ Ngủ',                 'nha nghi ngu',               'Nhà nghỉ', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/jR7KQuze9dozVf318',  NULL,         'DRAFT',     'PROVIDER',       'Gần trung tâm, thuận tiện đi lại.', FALSE),
  ('chiba-ecolodge',          'Chiba Ecolodge',               'chiba ecolodge',             'Ecolodge',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/QrVCVgDj55zUuHPz6',  '0867071985', 'DRAFT',     'PUBLIC_TRUSTED', 'Nhiều hạng phòng (Standard/Deluxe/Family/Glamping), bể bơi, trang trí độc đáo, thang máy ngoài trời.', FALSE),
  ('ha-chau-2-homestay',      'Hà Châu 2 Homestay',           'ha chau 2 homestay',         'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', NULL,                                          '0379805480', 'DRAFT',     'PUBLIC_TRUSTED', NULL, FALSE),
  ('homestay-hien-quang',     'Homestay Hiền Quang',          'homestay hien quang',        'Homestay',  'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/eh6bKEGMLTEAWMg96',  '0396483968', 'DRAFT',     'PROVIDER',       'Giao lưu văn nghệ, ẩm thực đặc sắc, view cánh đồng lúa, sân vườn rộng.', FALSE),
  ('chai-eco-house',          'Chải Eco House',               'chai eco house',             'Khách sạn', 'Thôn Hoàng Liên, TT Mù Cang Chải',     'MCC_THI_TRAN', 'https://maps.app.goo.gl/v1K5bYJXNuJ3gotY7',  '0975727510', 'DRAFT',     'PROVIDER',       'Phòng trang trí bài bản, không gian chung rộng.', FALSE),
  ('hotel-moon-2',            'Hotel Moon 2',                 'hotel moon 2',               'Khách sạn', 'Trung tâm, TT Mù Cang Chải',           'MCC_THI_TRAN', 'https://maps.app.goo.gl/bgNd6qNYHmSnNoCk8',  '0972789569', 'DRAFT',     'PROVIDER',       'Sân đỗ xe rộng, nhiều phòng và hạng phòng, gần QL 32.', FALSE),
  ('hotel-nhat-phuong',       'Hotel Nhất Phượng',            'hotel nhat phuong',          'Khách sạn', 'Thôn Khim Nọi, TT Mù Cang Chải',       'MCC_THI_TRAN', 'https://maps.app.goo.gl/bgNd6qNYHmSnNoCk8',  NULL,         'DRAFT',     'PROVIDER',       'Không gian thoáng mát, thuận tiện đi lại và đỗ xe.', FALSE)
)
INSERT INTO place (
  slug, kind, name, name_norm, badge, summary, address, region_id,
  visibility, operation_status, is_deleted, source_type,
  verification, approval_status, coord_verified, data_verified,
  rating_count, created_at, updated_at
)
SELECT
  h.slug, 'HOMESTAY', h.name, h.name_norm, h.badge, h.summary, h.address,
  r.id,
  h.visibility::varchar, 'OPERATING', FALSE, h.source_type::varchar,
  'UNVERIFIED', CASE WHEN h.visibility = 'PUBLISHED' THEN 'APPROVED' ELSE 'PENDING' END,
  FALSE, TRUE,
  0, now() AT TIME ZONE 'Asia/Ho_Chi_Minh', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM home_data h
JOIN region r ON r.code = h.region_code
ON CONFLICT (slug) DO UPDATE SET
  name         = EXCLUDED.name,
  name_norm    = EXCLUDED.name_norm,
  badge        = EXCLUDED.badge,
  summary      = EXCLUDED.summary,
  address      = EXCLUDED.address,
  region_id    = EXCLUDED.region_id,
  visibility   = EXCLUDED.visibility,
  source_type  = EXCLUDED.source_type,
  updated_at   = now() AT TIME ZONE 'Asia/Ho_Chi_Minh';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HOMESTAY_PROFILE
-- ─────────────────────────────────────────────────────────────────────────────
-- Xóa profile cũ rồi insert lại để đảm bảo đồng bộ
DELETE FROM homestay_profile
WHERE place_id IN (SELECT id FROM place WHERE slug IN (
  'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
  'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
  'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
  'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
  'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
  'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
  'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
  'hotel-moon-2','hotel-nhat-phuong'
));

WITH profile_data (slug, view_highlight, suitability, other_amenities, house_rules) AS (VALUES
  ('homestay-anh-tuc',
   'View cánh đồng lúa, không gian xanh mát',
   'Phù hợp: cặp đôi, nhóm bạn, gia đình nhỏ. Phân khúc tầm trung.',
   'Xe lớn vào được; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Nhận cơm đoàn',
   NULL),
  ('new-highland-hotel',
   'View ruộng bậc thang, gần trung tâm thị trấn',
   'Phù hợp: khách doanh nhân, gia đình, cao cấp. Có thang máy.',
   'Bãi đỗ ô tô; Xe lớn vào được; WC riêng từng phòng; Sân chung',
   NULL),
  ('homestay-mua-vang',
   'View ruộng bậc thang, gần nhà hàng Quyền Hường',
   'Phù hợp: gia đình, nhóm đông, khách cần đỗ xe lớn. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung',
   NULL),
  ('trai-ban-homestay',
   'View cánh đồng lúa, sân vườn trang trí đẹp',
   'Phù hợp: cặp đôi lãng mạn, nhóm nhỏ thích trải nghiệm bản địa. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn',
   NULL),
  ('hoa-son-tra-hotel',
   'Mặt đường QL 32, gần trung tâm',
   'Phù hợp: khách công tác, gia đình muốn tiện lợi. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng',
   NULL),
  ('nha-nghi-duy-vu',
   'Mặt đường QL 32, trung tâm thị trấn',
   'Phù hợp: đoàn khách đông, khách không kỹ tính. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng',
   'Phòng đơn giản phù hợp khách đoàn.'),
  ('baan-mali-homestay',
   'Không gian trước và sau rộng rãi',
   'Phù hợp: nhóm bạn, gia đình. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung',
   NULL),
  ('homestay-hoa-thao',
   'Nhà sàn phong cách bản địa, phòng tầng âm view lúa',
   'Phù hợp: khách muốn trải nghiệm văn hóa bản địa. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; View núi/săn mây; Sân chung',
   NULL),
  ('homestay-cuong-tu',
   'View cánh đồng lúa, ẩm thực dân tộc',
   'Phù hợp: nhóm bạn, khách thích văn hóa bản địa. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sưởi/chăn điện; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Ăn uống tại home; Nhận cơm đoàn',
   NULL),
  ('homestay-bao-lan',
   'Nhà sàn, không gian xanh mát',
   'Phù hợp: nhóm bạn, khách bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sưởi/chăn điện; BBQ; Lửa trại; Giao lưu văn nghệ; Ăn uống tại home',
   NULL),
  ('win-homestay',
   'View toàn bộ khu vực trung tâm MCC từ nhà sàn',
   'Phù hợp: nhóm lớn, gia đình thích nhà sàn truyền thống. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sưởi/chăn điện; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn',
   NULL),
  ('pu-nhu-house',
   'Bể bơi, phòng tổ chim, phòng ven suối — gần đồi Mâm Xôi 1km',
   'Phù hợp: gia đình, cặp đôi muốn trải nghiệm độc đáo. Tầm trung. Lưu ý: cách trung tâm 10km.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Thuê xe máy; Cho bay flycam',
   'Lưu ý: cách trung tâm thị trấn 10km.'),
  ('co-gai-thai-homestay',
   'View cánh đồng lúa, sân vườn đẹp',
   'Phù hợp: nhóm bạn trẻ, cặp đôi. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Cho bay flycam',
   'Cách âm kém — cần báo khách.'),
  ('moc-homestay',
   'Không gian chung view lúa thoáng mát, phong cách tối giản',
   'Phù hợp: khách muốn yên tĩnh, đơn giản. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; Ăn uống tại home',
   'Không có điều hòa. Cách âm kém.'),
  ('bungalow-xuan-giang',
   'Bungalow khép kín riêng tư, không gian chung mát, bãi đỗ xe',
   'Phù hợp: cặp đôi, gia đình nhỏ muốn riêng tư. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Cho bay flycam',
   NULL),
  ('hotel-thuat-hoa',
   'Gần trung tâm thị trấn',
   'Phù hợp: khách transit, khách công tác. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Ăn uống tại home; Nhận cơm đoàn',
   NULL),
  ('chelly-hotel',
   'Phòng sang trọng, bãi đỗ xe riêng',
   'Phù hợp: gia đình, khách muốn tiện nghi. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng',
   NULL),
  ('hanh-phuc-creek-homestay',
   'Gần đường lên Rừng Trúc, giá rẻ',
   'Phù hợp: khách đơn, cặp đôi tiết kiệm. Bình dân.',
   NULL,
   'Phòng nhỏ. Cách âm kém.'),
  ('doi-doi-gio',
   'Sân vườn độc đáo, có bể bơi',
   'Phù hợp: cặp đôi, gia đình muốn nghỉ sang trọng ngay trung tâm. Tầm trung.',
   'Xe lớn không vào được; WC riêng từng phòng; View núi/săn mây; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Ăn uống tại home; Nhận cơm đoàn; Thuê xe máy; Cho bay flycam',
   NULL),
  ('mcc-lu-tre',
   'Bungalow rộng, giá phải chăng',
   'Phù hợp: nhóm bạn, gia đình thích bungalow. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Trải nghiệm bản địa; Ăn uống tại home; Cho bay flycam',
   NULL),
  ('mai-linh-hotel',
   'Vị trí trung tâm thị trấn, bể bơi, 20 phòng',
   'Phù hợp: đoàn đông, gia đình. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Thuê xe máy; Cho bay flycam',
   NULL),
  ('sky-motel',
   NULL,
   'Nhà nghỉ đơn giản gần trung tâm. Tầm trung.',
   'Cho bay flycam',
   NULL),
  ('nang-hotel',
   'Vị trí đắc địa trung tâm, phục vụ café',
   'Phù hợp: khách muốn ở vị trí trung tâm. Cao cấp. Lưu ý: không có bãi đỗ xe.',
   'WC riêng từng phòng; Sân chung',
   'Không có bãi đỗ xe — cần báo khách.'),
  ('nha-nghi-ngu',
   'Gần trung tâm thị trấn',
   'Phù hợp: khách transit, bình dân.',
   'WC riêng từng phòng',
   'Phòng cũ, đơn giản. Không có chỗ đỗ xe.'),
  ('chiba-ecolodge',
   'Nhiều hạng phòng, bể bơi, thang máy ngoài trời',
   'Phù hợp: gia đình, nhóm muốn nhiều lựa chọn loại phòng. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Cho bay flycam',
   NULL),
  ('ha-chau-2-homestay',
   'Khu vực Hoàng Liên, gần các nhà hàng',
   'Phù hợp: nhóm bạn, gia đình. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ',
   NULL),
  ('homestay-hien-quang',
   'View cánh đồng lúa, giao lưu văn nghệ, sân rộng',
   'Phù hợp: nhóm bạn, đoàn muốn trải nghiệm văn hóa. Bình dân.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Trải nghiệm bản địa; Ăn uống tại home; Nhận cơm đoàn; Cho bay flycam',
   NULL),
  ('chai-eco-house',
   'Phòng trang trí bài bản, không gian rộng',
   'Phù hợp: cặp đôi, gia đình thích thiết kế. Cao cấp.',
   'Xe lớn vào được; WC riêng từng phòng; View núi/săn mây; Sân chung; BBQ; Lửa trại; Góc check-in',
   NULL),
  ('hotel-moon-2',
   'Sân đỗ xe rộng, nhiều phòng và hạng phòng',
   'Phù hợp: đoàn đông, gia đình. Tầm trung.',
   'Xe lớn vào được; WC riêng từng phòng; Sân chung; Ăn uống tại home',
   NULL),
  ('hotel-nhat-phuong',
   'Không gian thoáng mát, thuận tiện đỗ xe',
   'Phù hợp: gia đình, nhóm bạn. Tầm trung.',
   'Xe lớn vào được; Sân chung; BBQ; Lửa trại; Giao lưu văn nghệ; Góc check-in; Ăn uống tại home',
   NULL)
)
INSERT INTO homestay_profile (place_id, check_in_from, check_out_until, view_highlight, suitability, other_amenities, house_rules, updated_at)
SELECT p.id,
       TIME '14:00', TIME '12:00',
       d.view_highlight, d.suitability, d.other_amenities, d.house_rules,
       now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM profile_data d
JOIN place p ON p.slug = d.slug;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PLACE_CONTACT – SĐT + Google Maps
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM place_contact
WHERE place_id IN (SELECT id FROM place WHERE slug IN (
  'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
  'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
  'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
  'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
  'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
  'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
  'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
  'hotel-moon-2','hotel-nhat-phuong'
));

WITH contact_data (slug, phone, maps_url) AS (VALUES
  ('homestay-anh-tuc',         '0963000708', 'https://maps.app.goo.gl/kNEzaYwbscE7dBni8'),
  ('new-highland-hotel',       '0966242337', 'https://maps.app.goo.gl/xdCor2hxA9UNpT1J9'),
  ('homestay-mua-vang',        '0915505599', 'https://maps.app.goo.gl/JihXMRmHxkM8a11RA'),
  ('trai-ban-homestay',        '0979929101', 'https://maps.app.goo.gl/Z7oCRgZoPHDhikZs5'),
  ('hoa-son-tra-hotel',        '0974664911', 'https://maps.app.goo.gl/vr2g7Fv9dAx4Cssx7'),
  ('nha-nghi-duy-vu',          '0964966648', 'https://maps.app.goo.gl/xx94RwHdgQa9rLHq9'),
  ('baan-mali-homestay',       '0983994669', 'https://maps.app.goo.gl/N1aSWRo1P5SFhx9bA'),
  ('homestay-hoa-thao',        '0974508699', 'https://maps.app.goo.gl/8xr2FzvdQbNYjQTA9'),
  ('homestay-cuong-tu',        '0385179642', 'https://maps.app.goo.gl/7uSqAvDkTT7pxxP89'),
  ('homestay-bao-lan',         '0399529540', 'https://maps.app.goo.gl/PRfKszUReXakHuvG7'),
  ('win-homestay',             '0889347991', 'https://maps.app.goo.gl/XNEdzmc9eBAdjqZMA'),
  ('pu-nhu-house',             '0966108555', 'https://maps.app.goo.gl/c7VUvHXcWF2eA2Yb6'),
  ('co-gai-thai-homestay',     '0392922050', 'https://maps.app.goo.gl/GjdobF5UVooik5z16'),
  ('moc-homestay',             '0975481009', 'https://maps.app.goo.gl/GcUpj9Y5DRAC4BE99'),
  ('bungalow-xuan-giang',      '0988869363', 'https://maps.app.goo.gl/1F62FAwmAU69yJzP8'),
  ('hotel-thuat-hoa',          '0917166569', 'https://maps.app.goo.gl/4tBKooFQ9GHr1JUY6'),
  ('chelly-hotel',             '0964656633', 'https://maps.app.goo.gl/LALfNvN1rDFnAeFNA'),
  ('hanh-phuc-creek-homestay', '0865918722', 'https://maps.app.goo.gl/6zZPMKn8oXjqTMSW8'),
  ('doi-doi-gio',              '0387927468', 'https://maps.app.goo.gl/vYKGVhZDMGwMnVaw7'),
  ('mcc-lu-tre',               '0352032000', 'https://maps.app.goo.gl/jNDjU5UMEwFNeexD8'),
  ('mai-linh-hotel',           '0387927468', 'https://maps.app.goo.gl/Mx1Ryi3sTXU44UDo7'),
  ('sky-motel',                '0396249733', 'https://maps.app.goo.gl/DLGtF3c1BF9kjZ91A'),
  ('nang-hotel',               '0825768999', 'https://maps.app.goo.gl/MfGsvrRN1Hoa7d2Y7'),
  ('nha-nghi-ngu',             NULL,         'https://maps.app.goo.gl/jR7KQuze9dozVf318'),
  ('chiba-ecolodge',           '0867071985', 'https://maps.app.goo.gl/QrVCVgDj55zUuHPz6'),
  ('ha-chau-2-homestay',       '0379805480', NULL),
  ('homestay-hien-quang',      '0396483968', 'https://maps.app.goo.gl/eh6bKEGMLTEAWMg96'),
  ('chai-eco-house',           '0975727510', 'https://maps.app.goo.gl/v1K5bYJXNuJ3gotY7'),
  ('hotel-moon-2',             '0972789569', 'https://maps.app.goo.gl/bgNd6qNYHmSnNoCk8'),
  ('hotel-nhat-phuong',        NULL,         'https://maps.app.goo.gl/bgNd6qNYHmSnNoCk8')
)
INSERT INTO place_contact (place_id, channel, value, is_public, sort_order)
SELECT p.id, 'PHONE', c.phone, TRUE, 0
FROM contact_data c JOIN place p ON p.slug = c.slug
WHERE c.phone IS NOT NULL
UNION ALL
SELECT p.id, 'ZALO', c.phone, TRUE, 1
FROM contact_data c JOIN place p ON p.slug = c.slug
WHERE c.phone IS NOT NULL
UNION ALL
SELECT p.id, 'GOOGLE_MAPS', c.maps_url, TRUE, 2
FROM contact_data c JOIN place p ON p.slug = c.slug
WHERE c.maps_url IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PLACE_AMENITY – map từ sheet sang DB amenity codes
-- Codes có sẵn: FREE_WIFI, FREE_PARKING, MEAL_ON_DEMAND, BUS_PICKUP,
--               MOTORBIKE_RENTAL, BBQ_AREA, FIREPLACE (PLACE scope)
--               HOT_WATER, AIR_CONDITIONING, BALCONY (ROOM scope — gắn vào place cho tổng quan)
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM place_amenity
WHERE place_id IN (SELECT id FROM place WHERE slug IN (
  'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
  'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
  'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
  'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
  'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
  'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
  'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
  'hotel-moon-2','hotel-nhat-phuong'
));

-- slug | wifi | parking | meal | pickup | bike | bbq | fireplace | hot_water | ac | balcony
WITH amenity_data (slug, wifi, parking, meal, pickup, bike, bbq, fireplace, hot_water, ac, balcony) AS (VALUES
  ('homestay-anh-tuc',         TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('new-highland-hotel',       TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('homestay-mua-vang',        TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('trai-ban-homestay',        TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('hoa-son-tra-hotel',        TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('nha-nghi-duy-vu',          TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('baan-mali-homestay',       TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('homestay-hoa-thao',        FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('homestay-cuong-tu',        TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  FALSE, FALSE, TRUE),
  ('homestay-bao-lan',         TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  FALSE, FALSE, TRUE),
  ('win-homestay',             TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  FALSE, TRUE,  FALSE),
  ('pu-nhu-house',             TRUE,  TRUE,  TRUE,  FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('co-gai-thai-homestay',     TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('moc-homestay',             TRUE,  TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE),
  ('bungalow-xuan-giang',      TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  FALSE),
  ('hotel-thuat-hoa',          TRUE,  TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('chelly-hotel',             TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('hanh-phuc-creek-homestay', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('doi-doi-gio',              TRUE,  FALSE, TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('mcc-lu-tre',               TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('mai-linh-hotel',           TRUE,  TRUE,  TRUE,  FALSE, TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE),
  ('sky-motel',                FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('nang-hotel',               TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('nha-nghi-ngu',             TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('chiba-ecolodge',           TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('ha-chau-2-homestay',       TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE,  TRUE),
  ('homestay-hien-quang',      TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('chai-eco-house',           TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE, TRUE,  TRUE),
  ('hotel-moon-2',             TRUE,  TRUE,  TRUE,  FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('hotel-nhat-phuong',        TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  TRUE,  FALSE, TRUE,  TRUE)
)
INSERT INTO place_amenity (place_id, amenity_id, value)
SELECT p.id, a.id,
  CASE a.code
    WHEN 'FREE_WIFI'        THEN CASE WHEN d.wifi        THEN 'YES' ELSE 'NO' END
    WHEN 'FREE_PARKING'     THEN CASE WHEN d.parking     THEN 'YES' ELSE 'NO' END
    WHEN 'MEAL_ON_DEMAND'   THEN CASE WHEN d.meal        THEN 'YES' ELSE 'NO' END
    WHEN 'BUS_PICKUP'       THEN CASE WHEN d.pickup      THEN 'YES' ELSE 'NO' END
    WHEN 'MOTORBIKE_RENTAL' THEN CASE WHEN d.bike        THEN 'YES' ELSE 'NO' END
    WHEN 'BBQ_AREA'         THEN CASE WHEN d.bbq         THEN 'YES' ELSE 'NO' END
    WHEN 'FIREPLACE'        THEN CASE WHEN d.fireplace   THEN 'YES' ELSE 'NO' END
    WHEN 'HOT_WATER'        THEN CASE WHEN d.hot_water   THEN 'YES' ELSE 'NO' END
    WHEN 'AIR_CONDITIONING' THEN CASE WHEN d.ac          THEN 'YES' ELSE 'NO' END
    WHEN 'BALCONY'          THEN CASE WHEN d.balcony     THEN 'YES' ELSE 'NO' END
  END
FROM amenity_data d
JOIN place p ON p.slug = d.slug
CROSS JOIN amenity a
WHERE a.code IN ('FREE_WIFI','FREE_PARKING','MEAL_ON_DEMAND','BUS_PICKUP',
                  'MOTORBIKE_RENTAL','BBQ_AREA','FIREPLACE','HOT_WATER','AIR_CONDITIONING','BALCONY');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PLACE_HIGHLIGHT – điểm nổi bật và hạn chế
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM place_highlight
WHERE place_id IN (SELECT id FROM place WHERE slug IN (
  'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
  'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
  'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
  'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
  'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
  'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
  'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
  'hotel-moon-2','hotel-nhat-phuong'
));

WITH highlight_data (slug, type, content, sort_order) AS (VALUES
  ('homestay-anh-tuc',         'PRO',        'Không gian chung rộng, xanh mát, các phòng tách biệt riêng tư', 0),
  ('homestay-anh-tuc',         'PRO',        'View cánh đồng lúa, có ăn uống tại chỗ', 1),
  ('new-highland-hotel',       'PRO',        'Phòng sang trọng lịch sự, có thang máy', 0),
  ('new-highland-hotel',       'PRO',        'Gần các quán ăn ngon (Quyền Hường, Trâm Pa Pỉnh Tộp)', 1),
  ('new-highland-hotel',       'CON',        'Ít tiện ích trải nghiệm văn hóa bản địa', 0),
  ('homestay-mua-vang',        'PRO',        'Phòng rộng rãi, bãi đỗ xe từ 4–45 chỗ', 0),
  ('homestay-mua-vang',        'PRO',        'Gần nhà hàng Quyền Hường và Trâm Pa Pỉnh Tộp', 1),
  ('trai-ban-homestay',        'PRO',        'Sân vườn trang trí đẹp, view lúa', 0),
  ('trai-ban-homestay',        'PRO',        'Tổ chức giao lưu văn nghệ, ẩm thực đặc sắc', 1),
  ('hoa-son-tra-hotel',        'PRO',        'Mặt đường QL 32, phòng mới sang trọng', 0),
  ('nha-nghi-duy-vu',          'PRO',        'Số lượng phòng lớn, phù hợp đoàn đông', 0),
  ('nha-nghi-duy-vu',          'CON',        'Phòng đơn giản, phù hợp khách không kỹ tính', 0),
  ('baan-mali-homestay',       'PRO',        'Đầu tư bài bản, không gian rộng rãi', 0),
  ('baan-mali-homestay',       'PRO',        'Phòng cộng đồng rộng, khu WC chung sạch', 1),
  ('homestay-hoa-thao',        'PRO',        'Nhà sàn phong cách bản địa, phòng âm view lúa', 0),
  ('homestay-hoa-thao',        'PRO',        'Chủ nhà thân thiện, có sân đỗ xe riêng', 1),
  ('homestay-cuong-tu',        'PRO',        'View cánh đồng lúa, ẩm thực dân tộc', 0),
  ('homestay-cuong-tu',        'TIP',        'Kiểu nhà nghỉ đơn giản, phù hợp khách tiết kiệm', 0),
  ('win-homestay',             'PRO',        'Nhà sàn rộng, view toàn khu vực MCC', 0),
  ('win-homestay',             'PRO',        'Không gian sân vườn, cảnh quan đẹp', 1),
  ('pu-nhu-house',             'PRO',        'Phòng tổ chim và phòng ven suối độc đáo, bể bơi', 0),
  ('pu-nhu-house',             'PRO',        'Nhà hàng rộng phục vụ nhiều khách, gần đồi Mâm Xôi 1km', 1),
  ('pu-nhu-house',             'PAIN_POINT', 'Cách trung tâm thị trấn 10km — cần báo khách', 0),
  ('co-gai-thai-homestay',     'PRO',        'Giao lưu văn nghệ, ẩm thực đặc sắc', 0),
  ('co-gai-thai-homestay',     'PRO',        'Sân vườn trang trí đẹp, view lúa', 1),
  ('co-gai-thai-homestay',     'PAIN_POINT', 'Cách âm kém — cần báo khách', 0),
  ('moc-homestay',             'PRO',        'Phong cách tối giản, view lúa thoáng mát', 0),
  ('moc-homestay',             'PAIN_POINT', 'Không có điều hòa, cách âm kém', 0),
  ('bungalow-xuan-giang',      'PRO',        'Bungalow khép kín riêng tư, có ăn uống', 0),
  ('bungalow-xuan-giang',      'PRO',        'Không gian chung mát, bãi đỗ xe thuận tiện', 1),
  ('hanh-phuc-creek-homestay', 'PRO',        'Giá rẻ, gần đường lên Rừng Trúc', 0),
  ('hanh-phuc-creek-homestay', 'PAIN_POINT', 'Phòng nhỏ, cách âm kém', 0),
  ('doi-doi-gio',              'PRO',        'Sân vườn độc đáo, bungalow sang trọng, có bể bơi', 0),
  ('doi-doi-gio',              'PRO',        'Có ăn uống, vị trí trung tâm', 1),
  ('mcc-lu-tre',               'PRO',        'Bungalow rộng, giá phải chăng, sân vườn rộng', 0),
  ('mai-linh-hotel',           'PRO',        'Số lượng phòng lớn (20 phòng), có bể bơi', 0),
  ('mai-linh-hotel',           'PRO',        'Vị trí trung tâm, thuận tiện đi lại', 1),
  ('nang-hotel',               'PRO',        'Vị trí đắc địa, phòng sang trọng', 0),
  ('nang-hotel',               'PRO',        'Phục vụ café và đồ ăn nhanh tại chỗ', 1),
  ('nang-hotel',               'PAIN_POINT', 'Không có bãi đỗ xe, số lượng phòng ít', 0),
  ('nha-nghi-ngu',             'PRO',        'Gần trung tâm, thuận tiện đi lại', 0),
  ('nha-nghi-ngu',             'PAIN_POINT', 'Phòng cũ, đơn giản, không có chỗ đỗ xe', 0),
  ('chiba-ecolodge',           'PRO',        'Nhiều hạng phòng (Standard/Deluxe/Family/Glamping)', 0),
  ('chiba-ecolodge',           'PRO',        'Bể bơi, thang máy ngoài trời, trang trí độc đáo', 1),
  ('homestay-hien-quang',      'PRO',        'Giao lưu văn nghệ, ẩm thực, view lúa', 0),
  ('homestay-hien-quang',      'PRO',        'Không gian chung rộng, sân vườn đẹp', 1),
  ('chai-eco-house',           'PRO',        'Phòng trang trí bài bản, không gian rộng', 0),
  ('hotel-moon-2',             'PRO',        'Sân đỗ xe rộng, nhiều hạng phòng, gần QL 32', 0),
  ('hotel-nhat-phuong',        'PRO',        'Không gian thoáng mát, thuận tiện đỗ xe', 0)
)
INSERT INTO place_highlight (place_id, type, content, is_public, sort_order)
SELECT p.id, h.type::varchar, h.content, TRUE, h.sort_order
FROM highlight_data h
JOIN place p ON p.slug = h.slug;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROOM_TYPE – 1 loại phòng tổng hợp / homestay (các home có đủ thông tin)
--    Giá để NULL vì đa số chưa nhập vào sheet — cập nhật sau khi có giá chính thức
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM room_type
WHERE place_id IN (SELECT id FROM place WHERE slug IN (
  'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
  'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
  'homestay-cuong-tu','bungalow-xuan-giang','win-homestay','pu-nhu-house',
  'co-gai-thai-homestay','bungalow-xuan-giang','mai-linh-hotel','hanh-phuc-creek-homestay',
  'doi-doi-gio','chiba-ecolodge'
))
AND name LIKE '%[ĐiMCC seed]%';

WITH room_data (slug, name, description, max_occupancy, total_room_count, private_bathroom, base_price, weekend_price) AS (VALUES
  ('homestay-anh-tuc',         'Phòng đơn [ĐiMCC seed]',     '3 phòng đơn',                                  2, 3, 'YES', NULL, NULL),
  ('homestay-anh-tuc',         'Phòng đôi [ĐiMCC seed]',     '4 phòng đôi',                                  2, 4, 'YES', NULL, NULL),
  ('homestay-anh-tuc',         'Phòng sàn [ĐiMCC seed]',     '1 phòng sàn',                                  8, 1, 'NO',  NULL, NULL),
  ('new-highland-hotel',       'Phòng đơn [ĐiMCC seed]',     '9 phòng đơn',                                  2, 9, 'YES', NULL, NULL),
  ('new-highland-hotel',       'Phòng đôi [ĐiMCC seed]',     '12 phòng đôi',                                 2,12, 'YES', NULL, NULL),
  ('new-highland-hotel',       'Phòng 4 giường [ĐiMCC seed]','1 phòng 4 giường',                              4, 1, 'YES', NULL, NULL),
  ('homestay-mua-vang',        'Phòng đơn [ĐiMCC seed]',     '8 phòng đơn (1 giường đôi)',                   2, 8, 'YES', NULL, NULL),
  ('homestay-mua-vang',        'Phòng đôi [ĐiMCC seed]',     '7 phòng đôi (2 giường)',                       2, 7, 'YES', NULL, NULL),
  ('trai-ban-homestay',        'Bungalow đôi [ĐiMCC seed]',  'Bungalow riêng tư cho cặp đôi/gia đình',       2, 4, 'YES', NULL, NULL),
  ('hoa-son-tra-hotel',        'Phòng 1 giường đôi [ĐiMCC seed]','6 phòng 1 giường to',                      2, 6, 'YES', NULL, NULL),
  ('hoa-son-tra-hotel',        'Phòng 2 giường [ĐiMCC seed]','3 phòng 2 giường nhỏ + 3 phòng 2 giường lớn', 2, 6, 'YES', NULL, NULL),
  ('nha-nghi-duy-vu',          'Phòng đơn [ĐiMCC seed]',     '2 phòng đơn (giường 1m8)',                      2, 2, 'YES', NULL, NULL),
  ('nha-nghi-duy-vu',          'Phòng đôi [ĐiMCC seed]',     '14 phòng đôi (giường 1m6)',                     2,14, 'YES', NULL, NULL),
  ('baan-mali-homestay',       'Phòng đơn [ĐiMCC seed]',     '3 phòng đơn khép kín',                         2, 3, 'YES', NULL, NULL),
  ('baan-mali-homestay',       'Phòng đôi [ĐiMCC seed]',     '4 phòng đôi khép kín',                         2, 4, 'YES', NULL, NULL),
  ('baan-mali-homestay',       'Phòng cộng đồng [ĐiMCC seed]','1 phòng cộng đồng rộng',                      10, 1,'NO',  NULL, NULL),
  ('homestay-hoa-thao',        'Phòng đơn [ĐiMCC seed]',     '4 phòng đơn',                                  2, 4, 'YES', NULL, NULL),
  ('homestay-hoa-thao',        'Phòng đôi [ĐiMCC seed]',     '4 phòng đôi',                                  2, 4, 'YES', NULL, NULL),
  ('win-homestay',             'Nhà sàn tập thể [ĐiMCC seed]','1 sàn 25 người',                              25, 1,'NO',  NULL, NULL),
  ('win-homestay',             'Phòng đơn [ĐiMCC seed]',     '1 phòng đơn',                                  2, 1, 'YES', NULL, NULL),
  ('win-homestay',             'Phòng đôi [ĐiMCC seed]',     '1 phòng đôi',                                  2, 1, 'YES', NULL, NULL),
  ('pu-nhu-house',             'Phòng đôi [ĐiMCC seed]',     '1 phòng đôi',                                  2, 1, 'YES', NULL, NULL),
  ('pu-nhu-house',             'Phòng 3 người [ĐiMCC seed]', '2 phòng 3 người',                              3, 2, 'YES', NULL, NULL),
  ('pu-nhu-house',             'Phòng 4 người [ĐiMCC seed]', '2 phòng 4 người',                              4, 2, 'YES', NULL, NULL),
  ('pu-nhu-house',             'Phòng ven suối [ĐiMCC seed]','1 phòng ven suối 2 người',                     2, 1, 'YES', NULL, NULL),
  ('pu-nhu-house',             'Phòng tổ chim [ĐiMCC seed]', '2 phòng tổ chim',                              2, 2, 'YES', NULL, NULL),
  ('co-gai-thai-homestay',     'Phòng đơn [ĐiMCC seed]',     '2 phòng đơn',                                  2, 2, 'YES', NULL, NULL),
  ('co-gai-thai-homestay',     'Phòng đôi [ĐiMCC seed]',     '2 phòng đôi',                                  2, 2, 'YES', NULL, NULL),
  ('co-gai-thai-homestay',     'Phòng 3 giường [ĐiMCC seed]','2 phòng 3 giường kê đệm',                     3, 2, 'NO',  NULL, NULL),
  ('bungalow-xuan-giang',      'Bungalow 1 giường [ĐiMCC seed]','6 căn đơn 1 giường',                       2, 6, 'YES', NULL, NULL),
  ('bungalow-xuan-giang',      'Bungalow 2 giường [ĐiMCC seed]','4 căn 2 giường',                           2, 4, 'YES', NULL, NULL),
  ('hanh-phuc-creek-homestay', 'Phòng đơn [ĐiMCC seed]',     '6 phòng đơn (300k/350k)',                      1, 6, 'YES', 300000, 350000),
  ('hanh-phuc-creek-homestay', 'Phòng đôi [ĐiMCC seed]',     '1 phòng đôi (450k/500k)',                      2, 1, 'YES', 450000, 500000),
  ('doi-doi-gio',              'Phòng đơn [ĐiMCC seed]',     '2 phòng đơn',                                  2, 2, 'YES', NULL, NULL),
  ('doi-doi-gio',              'Phòng đôi [ĐiMCC seed]',     '4 phòng đôi',                                  2, 4, 'YES', NULL, NULL),
  ('doi-doi-gio',              'Bungalow [ĐiMCC seed]',      '4 bungalow',                                   2, 4, 'YES', NULL, NULL),
  ('mai-linh-hotel',           'Phòng đơn [ĐiMCC seed]',     '7 phòng đơn',                                  2, 7, 'YES', NULL, NULL),
  ('mai-linh-hotel',           'Phòng đôi [ĐiMCC seed]',     '13 phòng đôi',                                 2,13, 'YES', NULL, NULL),
  ('chiba-ecolodge',           'Standard [ĐiMCC seed]',      '4 phòng Standard',                             2, 4, 'YES', NULL, NULL),
  ('chiba-ecolodge',           'Deluxe [ĐiMCC seed]',        '4 phòng Deluxe',                               2, 4, 'YES', NULL, NULL),
  ('chiba-ecolodge',           'Chiba Family [ĐiMCC seed]',  '2 phòng Family',                               4, 2, 'YES', NULL, NULL),
  ('chiba-ecolodge',           'Glamping [ĐiMCC seed]',      '5 lều Glamping',                               2, 5, 'YES', NULL, NULL)
)
INSERT INTO room_type (place_id, name, description, max_occupancy, total_room_count, private_bathroom, base_price, weekend_price, status, created_at, updated_at)
SELECT p.id, r.name, r.description, r.max_occupancy, r.total_room_count,
       r.private_bathroom, r.base_price, r.weekend_price,
       'ACTIVE', now() AT TIME ZONE 'Asia/Ho_Chi_Minh', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM room_data r
JOIN place p ON p.slug = r.slug;

-- ─────────────────────────────────────────────────────────────────────────────
-- Kiểm tra nhanh
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.slug,
  p.name,
  p.visibility,
  p.badge,
  (SELECT count(*) FROM place_contact   c WHERE c.place_id = p.id) AS contacts,
  (SELECT count(*) FROM place_amenity   a WHERE a.place_id = p.id) AS amenities,
  (SELECT count(*) FROM place_highlight h WHERE h.place_id = p.id) AS highlights,
  (SELECT count(*) FROM room_type       r WHERE r.place_id = p.id) AS room_types
FROM place p
WHERE p.kind = 'HOMESTAY'
  AND p.slug IN (
    'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
    'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
    'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
    'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
    'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
    'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
    'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
    'hotel-moon-2','hotel-nhat-phuong'
  )
ORDER BY p.name;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- SAU KHI CHẠY — VIỆC CẦN LÀM TAY:
-- 1. CẬP NHẬT TỌA ĐỘ: Mở từng link Google Maps → lấy lat/lng → UPDATE place SET latitude=?, longitude=? WHERE slug='...';
-- 2. THÊM ẢNH: Upload ảnh từng home lên storage → INSERT INTO media_asset + place_media (role='COVER').
-- 3. NHẬP GIÁ PHÒNG: UPDATE room_type SET base_price=?, weekend_price=? WHERE place_id=(SELECT id FROM place WHERE slug='...') AND name LIKE 'Phòng đơn%';
-- 4. XUẤT BẢN: Sau khi có ảnh + giá → UPDATE place SET visibility='PUBLISHED', approval_status='APPROVED', updated_at=now() WHERE slug IN (...);
-- 5. CHÍNH SÁCH HỦY: INSERT INTO cancellation_policy (...) + UPDATE homestay_profile SET current_policy_id=...
-- ══════════════════════════════════════════════════════════════════════════════
