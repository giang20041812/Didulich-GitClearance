-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- EP02 "Khám phá quanh Homestay" — DỮ LIỆU MẪU ĐỂ PHÁT TRIỂN / QA. KHÔNG CHẠY TRÊN PRODUCTION.
-- Không đặt trong Liquibase vì changeset chạy cả trên production (docs/FS_EP02_Kham_pha_quanh_Homestay.md §7 Q11).
--
-- Chạy sau khi backend đã khởi động một lần (Liquibase đã tạo changeset v2-011):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/seed/ep02-explore-sample.sql
-- Chạy lại nhiều lần được: xóa dữ liệu mẫu cũ (slug bắt đầu "ep02-sample-") rồi tạo lại.
--
-- Mốc: homestay mẫu tại trung tâm Mù Cang Chải (21.851, 104.088). 0,009 độ vĩ độ ≈ 1 km. Bán kính mặc định 10 km.
-- Trường hợp có trong dữ liệu:
--   • 5 danh mục: Ăn uống, Tham quan, Check-in, Trải nghiệm, Dịch vụ địa phương (gồm cả loại RENTAL / TRANSPORT)
--   • 11 địa điểm đủ điều kiện trong bán kính + 1 điểm ghim ở xa = 12 thẻ: trang đầu 10 (Đèo Khau Phạ, Thác Mơ ghim
--     đứng đầu, rồi 8 điểm gần nhất), "Xem thêm" ra 2 thẻ còn lại rồi nút biến mất
--   • 1 điểm ghim nằm ngoài bán kính (25 km), 1 điểm ngoài bán kính không ghim (không hiện)
--   • 1 điểm chưa có tọa độ, 1 điểm có tọa độ nhưng chưa xác minh, 1 điểm đang Ẩn, 1 điểm Chờ duyệt, 1 điểm Tạm ngừng
--   • 3 điểm trùng khoảng cách 1,2 km (Âu Cơ View, Bản Lìm Mông, Nhà hàng Thắng Cố Bản) để thấy sắp theo tên A–Z
--   • Giờ mở cửa 07:00–21:00 (AC-02.23), 1 điểm mở qua đêm, 1 điểm không có website (AC-02.20)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM place WHERE slug LIKE 'ep02-sample-%';
DELETE FROM media_asset WHERE storage_key LIKE 'ep02-sample:%';

-- Homestay mẫu (đang công khai, có tọa độ).
INSERT INTO place (slug, kind, name, name_norm, description, address, latitude, longitude, visibility, operation_status,
                   is_deleted, rating_count, source_type, verification, approval_status, coord_verified, created_at, updated_at)
VALUES ('ep02-sample-homestay', 'HOMESTAY', 'Homestay Mẫu Khám Phá', 'homestay mau kham pha',
        'Homestay mẫu để kiểm thử mục Khám phá quanh đây.', 'Thị trấn Mù Cang Chải', 21.851000, 104.088000,
        'PUBLISHED', 'OPERATING', FALSE, 0, 'OFFICIAL', 'VERIFIED', 'APPROVED', FALSE,
        now() AT TIME ZONE 'Asia/Ho_Chi_Minh', now() AT TIME ZONE 'Asia/Ho_Chi_Minh');

-- Địa điểm: (slug, kind, tên, tên không dấu, mô tả ngắn, độ lệch vĩ độ, độ lệch kinh độ, có tọa độ, xác minh, hiển thị, duyệt, vận hành)
WITH data (slug, kind, name, name_norm, summary, dlat, dlng, has_coord, verified, visibility, approval, op) AS (VALUES
  ('ep02-sample-01', 'RESTAURANT', 'Quán Lẩu Cá Suối',          'quan lau ca suoi',          'Lẩu cá suối tươi, cơm lam, gà đồi nướng.',       0.0040, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-02', 'RESTAURANT', 'Nhà hàng Thắng Cố Bản',     'nha hang thang co ban',     'Thắng cố, mèn mén, rượu ngô bản địa.',           0.0108, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-03', 'ATTRACTION', 'Đồi Mâm Xôi',               'doi mam xoi',               'Ruộng bậc thang hình mâm xôi nổi tiếng.',        0.0300, 0.0100, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-04', 'ATTRACTION', 'Thác Mơ',                   'thac mo',                   'Thác nước giữa rừng, đường đi bộ 15 phút.',      0.0000, 0.0450, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-05', 'PHOTO',      'Bản Lìm Mông',              'ban lim mong',              'Điểm ngắm ruộng bậc thang mùa lúa chín.',        0.0108, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-06', 'PHOTO',      'Âu Cơ View',                'au co view',                'Điểm check-in săn mây lúc bình minh.',           0.0108, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-07', 'CULTURE',    'Xưởng dệt thổ cẩm',         'xuong det tho cam',         'Trải nghiệm dệt vải lanh cùng người Mông.',     -0.0200, 0.0050, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-08', 'CULTURE',    'Bay dù lượn Khau Phạ',      'bay du luon khau pha',      'Bay dù lượn qua đèo Khau Phạ (mùa thu).',        0.0700, 0.0300, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-09', 'RENTAL',     'Thuê xe máy Mù Cang Chải',  'thue xe may mu cang chai',  'Xe số, xe ga, giao tận homestay.',              -0.0050, -0.0050, TRUE, TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-10', 'SERVICE',    'Cà phê đêm Bản Thái',       'ca phe dem ban thai',       'Mở qua đêm, cà phê và đồ nướng.',              -0.0150, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-11', 'ATTRACTION', 'Đèo Khau Phạ (ghim, 25 km)', 'deo khau pha (ghim, 25 km)', 'Một trong tứ đại đỉnh đèo — ghim dù ở xa.',  0.2250, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-12', 'ATTRACTION', 'Hồ Kim Nọi (ngoài bán kính)', 'ho kim noi (ngoai ban kinh)', 'Ngoài 10 km, không ghim → không hiện.',  0.1200, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-13', 'RESTAURANT', 'Quán chưa có tọa độ',       'quan chua co toa do',       'Chưa có tọa độ → không hiện.',                  0,      0,      FALSE, FALSE, 'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-14', 'RESTAURANT', 'Quán chưa xác minh tọa độ', 'quan chua xac minh toa do', 'Có tọa độ, chưa xác minh → không hiện.',        0.0060, 0.0060, TRUE,  FALSE, 'PUBLISHED',   'APPROVED', 'OPERATING'),
  ('ep02-sample-15', 'PHOTO',      'Điểm đang ẩn',              'diem dang an',              'Đang Ẩn → không hiện.',                          0.0070, 0.0000, TRUE,  TRUE,  'UNPUBLISHED', 'APPROVED', 'OPERATING'),
  ('ep02-sample-16', 'RESTAURANT', 'Quán NCC chờ duyệt',        'quan ncc cho duyet',        'NCC gửi, chờ duyệt → không hiện.',               0.0080, 0.0000, TRUE,  FALSE, 'DRAFT',       'PENDING',  'OPERATING'),
  ('ep02-sample-17', 'SERVICE',    'Dịch vụ tạm nghỉ',          'dich vu tam nghi',          'Tạm ngừng hoạt động → không hiện.',              0.0090, 0.0000, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'TEMP_CLOSED'),
  ('ep02-sample-18', 'TRANSPORT',  'Xe khách Mù Cang Chải – Hà Nội', 'xe khach mu cang chai - ha noi', 'Bến xe trung tâm, xe giường nằm.',  -0.0030, 0.0020, TRUE,  TRUE,  'PUBLISHED',   'APPROVED', 'OPERATING')
)
INSERT INTO place (slug, kind, name, name_norm, summary, address, latitude, longitude, visibility, operation_status, is_deleted,
                   rating_count, source_type, verification, approval_status, coord_verified, coord_verified_at, created_at, updated_at)
SELECT slug, kind, name, name_norm, summary, 'Mù Cang Chải',
       CASE WHEN has_coord THEN round(21.851000 + dlat, 6) END,
       CASE WHEN has_coord THEN round(104.088000 + dlng, 6) END,
       visibility, op, FALSE, 0, 'OFFICIAL', 'VERIFIED', approval, verified,
       CASE WHEN verified THEN now() AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       now() AT TIME ZONE 'Asia/Ho_Chi_Minh', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM data;

-- Ảnh bìa (ảnh minh họa bên ngoài, chỉ để xem giao diện).
INSERT INTO media_asset (storage_key, public_url, mime_type, created_at)
SELECT 'ep02-sample:' || p.slug, 'https://picsum.photos/seed/' || p.slug || '/640/360', 'image/jpeg', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM place p WHERE p.slug LIKE 'ep02-sample-__';
INSERT INTO place_media (place_id, media_id, role, sort_order)
SELECT p.id, m.id, 'COVER', 0 FROM place p JOIN media_asset m ON m.storage_key = 'ep02-sample:' || p.slug
WHERE p.slug LIKE 'ep02-sample-__';

-- Giờ mở cửa 07:00–21:00 cả tuần (AC-02.23) cho Quán Lẩu Cá Suối; Cà phê đêm mở 18:00–02:00, nghỉ thứ Hai.
INSERT INTO place_opening_hour (place_id, day_of_week, open_time, close_time, is_closed)
SELECT p.id, d, TIME '07:00', TIME '21:00', FALSE FROM place p CROSS JOIN generate_series(1, 7) d WHERE p.slug = 'ep02-sample-01';
INSERT INTO place_opening_hour (place_id, day_of_week, open_time, close_time, is_closed)
SELECT p.id, d, CASE WHEN d = 1 THEN NULL ELSE TIME '18:00' END, CASE WHEN d = 1 THEN NULL ELSE TIME '02:00' END, d = 1
FROM place p CROSS JOIN generate_series(1, 7) d WHERE p.slug = 'ep02-sample-10';

-- Liên hệ: Quán Lẩu Cá Suối có điện thoại, KHÔNG có website (AC-02.20); Nhà hàng Thắng Cố có cả website.
INSERT INTO place_contact (place_id, channel, value, is_public, sort_order)
SELECT id, 'PHONE', '0912345678', TRUE, 0 FROM place WHERE slug = 'ep02-sample-01';
INSERT INTO place_contact (place_id, channel, value, is_public, sort_order)
SELECT id, 'PHONE', '0987654321', TRUE, 0 FROM place WHERE slug = 'ep02-sample-02';
INSERT INTO place_contact (place_id, channel, value, is_public, sort_order)
SELECT id, 'WEBSITE', 'https://example.com/thang-co', TRUE, 1 FROM place WHERE slug = 'ep02-sample-02';

-- Ghim (BR-02.05, BR-02.06): Đèo Khau Phạ (25 km) đứng đầu, rồi Thác Mơ; điểm đang Ẩn vẫn giữ ghim nhưng không hiện.
INSERT INTO homestay_explore_pin (homestay_id, place_id, sort_order, created_at)
SELECT h.id, p.id, v.ord, now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM (VALUES ('ep02-sample-11', 0), ('ep02-sample-04', 1), ('ep02-sample-15', 2)) AS v(slug, ord)
JOIN place p ON p.slug = v.slug
JOIN place h ON h.slug = 'ep02-sample-homestay';

COMMIT;

-- Kiểm tra nhanh: GET /api/public/explore/homestays/{id homestay mẫu}
SELECT id AS homestay_id FROM place WHERE slug = 'ep02-sample-homestay';
