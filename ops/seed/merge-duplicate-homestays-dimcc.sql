-- ══════════════════════════════════════════════════════════════════════════════
-- GỘP 9 HOMESTAY BỊ TRÙNG (bản cũ slug UUID  +  bản mới do seed ĐiMCC tạo)
-- Bản CŨ giữ nguyên danh tính (id, chủ đối tác, phòng, giá, đặt phòng, đánh giá) và được bổ sung dữ liệu từ bản MỚI:
--   tiện ích, liên hệ, điểm nổi bật + NEARBY, ảnh, hồ sơ homestay (chỉ điền ô còn trống), tọa độ.
-- Bản MỚI bị ẩn + xóa mềm (is_deleted = TRUE) — không xóa cứng, có thể hoàn tác (xem cuối file).
-- Chạy SAU: insert-photos-dimcc-supabase.sql và nearby-attractions-dimcc.sql (để bản mới đã có ảnh/NEARBY mà chuyển sang).
-- ══════════════════════════════════════════════════════════════════════════════

-- Toàn bộ phần gộp nằm trong MỘT khối DO: chạy như một lệnh/giao dịch duy nhất (SQL Editor của Supabase không giữ
-- BEGIN...COMMIT giữa các câu lệnh), nên hoặc gộp xong hết hoặc không đổi gì.
DO $merge$
DECLARE n_pairs int; u_old int; u_new int;
BEGIN

CREATE TEMP TABLE dup_map ON COMMIT DROP AS
SELECT o.id AS old_id, n.id AS new_id, o.name
FROM place o
JOIN place n ON n.name_norm = o.name_norm AND n.kind = 'HOMESTAY' AND n.is_deleted = FALSE
WHERE o.kind = 'HOMESTAY' AND o.is_deleted = FALSE
  AND o.slug ~ '^homestay-[0-9a-f]{8}-[0-9a-f]{4}-'
  AND n.slug !~ '^homestay-[0-9a-f]{8}-[0-9a-f]{4}-';

-- Chốt an toàn: phải đúng 9 cặp, mỗi bản cũ / mới chỉ xuất hiện 1 lần
SELECT count(*), count(DISTINCT old_id), count(DISTINCT new_id) INTO n_pairs, u_old, u_new FROM dup_map;
IF n_pairs <> 9 OR u_old <> 9 OR u_new <> 9 THEN
  RAISE EXCEPTION 'Kỳ vọng 9 cặp trùng, thực tế % (cũ %, mới %) — dừng, không gộp.', n_pairs, u_old, u_new;
END IF;

-- 1. Tiện ích
INSERT INTO place_amenity (place_id, amenity_id, value, note)
SELECT m.old_id, pa.amenity_id, pa.value, pa.note
FROM place_amenity pa JOIN dup_map m ON pa.place_id = m.new_id
ON CONFLICT (place_id, amenity_id) DO NOTHING;

-- 2. Liên hệ (bỏ qua nếu bản cũ đã có cùng kênh + giá trị)
INSERT INTO place_contact (place_id, channel, value, is_public, sort_order)
SELECT m.old_id, pc.channel, pc.value, pc.is_public, pc.sort_order
FROM place_contact pc JOIN dup_map m ON pc.place_id = m.new_id
WHERE NOT EXISTS (
  SELECT 1 FROM place_contact x WHERE x.place_id = m.old_id AND x.channel = pc.channel AND x.value = pc.value
);

-- 3. Điểm nổi bật / hạn chế / NEARBY (bỏ qua nếu trùng nguyên văn)
INSERT INTO place_highlight (place_id, type, content, is_public, sort_order)
SELECT m.old_id, h.type, h.content, h.is_public, h.sort_order
FROM place_highlight h JOIN dup_map m ON h.place_id = m.new_id
WHERE NOT EXISTS (
  SELECT 1 FROM place_highlight x WHERE x.place_id = m.old_id AND x.type = h.type AND x.content = h.content
);

-- 4. Ảnh: thêm vào sau ảnh cũ; chỉ làm ảnh bìa nếu bản cũ chưa có bìa
INSERT INTO place_media (place_id, media_id, role, caption, sort_order)
SELECT m.old_id, pm.media_id,
  CASE WHEN pm.role = 'COVER' AND NOT EXISTS (SELECT 1 FROM place_media c WHERE c.place_id = m.old_id AND c.role = 'COVER')
       THEN 'COVER' ELSE 'GALLERY' END,
  pm.caption,
  100 + pm.sort_order
FROM place_media pm JOIN dup_map m ON pm.place_id = m.new_id
ON CONFLICT (place_id, media_id) DO NOTHING;

-- 5a. Hồ sơ homestay: bản cũ đã có → chỉ điền ô còn trống
UPDATE homestay_profile o SET
  check_in_from   = COALESCE(o.check_in_from,   n.check_in_from),
  check_out_until = COALESCE(o.check_out_until, n.check_out_until),
  house_rules     = COALESCE(NULLIF(btrim(o.house_rules), ''),     n.house_rules),
  surcharge_note  = COALESCE(NULLIF(btrim(o.surcharge_note), ''),  n.surcharge_note),
  children_policy = COALESCE(NULLIF(btrim(o.children_policy), ''), n.children_policy),
  pets_policy     = COALESCE(NULLIF(btrim(o.pets_policy), ''),     n.pets_policy),
  view_highlight  = COALESCE(NULLIF(btrim(o.view_highlight), ''),  n.view_highlight),
  suitability     = COALESCE(NULLIF(btrim(o.suitability), ''),     n.suitability),
  other_amenities = COALESCE(NULLIF(btrim(o.other_amenities), ''), n.other_amenities),
  updated_at      = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM dup_map m
JOIN homestay_profile n ON n.place_id = m.new_id
WHERE o.place_id = m.old_id;

-- 5b. Hồ sơ homestay: bản cũ chưa có → sao chép (mã check-in để NULL vì phải duy nhất)
INSERT INTO homestay_profile (place_id, check_in_from, check_out_until, house_rules, surcharge_note, children_policy,
                              pets_policy, view_highlight, suitability, other_amenities, checkin_code, updated_at)
SELECT m.old_id, n.check_in_from, n.check_out_until, n.house_rules, n.surcharge_note, n.children_policy,
       n.pets_policy, n.view_highlight, n.suitability, n.other_amenities, NULL, now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM dup_map m JOIN homestay_profile n ON n.place_id = m.new_id
WHERE NOT EXISTS (SELECT 1 FROM homestay_profile o WHERE o.place_id = m.old_id);

-- 6. Tọa độ nếu bản cũ chưa có
UPDATE place o SET
  latitude  = COALESCE(o.latitude,  n.latitude),
  longitude = COALESCE(o.longitude, n.longitude),
  updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM dup_map m JOIN place n ON n.id = m.new_id
WHERE o.id = m.old_id;

-- 7. Ẩn + xóa mềm bản mới (đã chuyển hết dữ liệu sang bản cũ)
UPDATE place SET is_deleted = TRUE, visibility = 'UNPUBLISHED', updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
WHERE id IN (SELECT new_id FROM dup_map);

END
$merge$;

-- Kết quả (chạy riêng sau khối trên): mỗi homestay cũ giờ có bao nhiêu ảnh / tiện ích / NEARBY
SELECT p.id, p.name, p.slug,
  (SELECT count(*) FROM place_media WHERE place_id = p.id)                         AS so_anh,
  (SELECT count(*) FROM place_amenity WHERE place_id = p.id)                       AS so_tien_ich,
  (SELECT count(*) FROM place_highlight WHERE place_id = p.id AND type = 'NEARBY') AS nearby
FROM place p
WHERE p.kind = 'HOMESTAY' AND p.slug ~ '^homestay-[0-9a-f]{8}-[0-9a-f]{4}-'
  AND EXISTS (SELECT 1 FROM place n WHERE n.name_norm = p.name_norm AND n.id <> p.id AND n.is_deleted = TRUE)
ORDER BY p.name;

-- HOÀN TÁC phần ẩn bản mới (nếu cần): UPDATE place SET is_deleted = FALSE, visibility = 'PUBLISHED'
--   WHERE slug IN ('baan-mali-homestay','co-gai-thai-homestay','hoa-son-tra-hotel','homestay-anh-tuc','homestay-hoa-thao',
--                  'homestay-mua-vang','new-highland-hotel','nha-nghi-duy-vu','trai-ban-homestay');
