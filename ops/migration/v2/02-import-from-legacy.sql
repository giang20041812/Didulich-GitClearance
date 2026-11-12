-- Bước 2 / 3 chuyển sang schema v2: chép dữ liệu từ schema "legacy" (schema cũ, dời bằng bước 1) sang schema v2
-- trong "public" (do backend v2 dựng bằng Liquibase khi khởi động).
--
-- Chạy MỘT lần, trong MỘT giao dịch (lỗi ở đâu thì không đổi gì):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 02-import-from-legacy.sql
-- hoặc dán TOÀN BỘ file vào Supabase → SQL Editor → Run (cả file cũng là một giao dịch). Xem docs/db-v2.md mục 6.
--
-- Giữ lại: khu vực, nhà cung cấp, tài khoản (gộp account + traveler), địa điểm và dữ liệu con, món đặc sản (từ
-- place kind CUISINE), homestay (hồ sơ, chính sách hủy, loại phòng, giá, dịch vụ, lịch khóa phòng tương lai), ảnh,
-- lễ hội, đầu mối khẩn cấp + yêu cầu SOS, hồ sơ đăng ký NCC, link affiliate, nhật ký thao tác, cấu hình hệ thống.
-- Bỏ (dữ liệu thử nghiệm): đơn đặt phòng và mọi thứ gắn với đơn (đêm, lịch sử, thanh toán, hoàn tiền, hoa hồng,
-- đánh giá), lịch trình, check-in, thông báo, phiên đăng nhập, thông báo đẩy, OTP, yêu cầu thay đổi của NCC.
-- Giữ nguyên id của địa điểm, loại phòng, ảnh, tài khoản cổng — đường dẫn /homestays/{id}, /specialties/{id} vẫn đúng.

-- ─── 0. Kiểm tra trước ──────────────────────────────────────────────────────────────────────────────────────────
-- Backend v2 khởi động lần đầu khi còn biến APP_SEED_INITIAL_PASSWORD thì tạo một admin khởi tạo trên schema trống
-- (SeedAccountPasswordInitializer). Chỉ khi schema v2 chưa có gì khác: bỏ tài khoản đó — admin thật chép từ legacy.
DELETE FROM public.account a
WHERE a.role = 'ADMIN' AND a.full_name = 'Quản trị viên'
  AND (SELECT count(*) FROM public.account) = 1
  AND NOT EXISTS (SELECT 1 FROM public.place) AND NOT EXISTS (SELECT 1 FROM public.dish)
  AND NOT EXISTS (SELECT 1 FROM public.provider);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy' AND table_name = 'place') THEN
        RAISE EXCEPTION 'Không thấy schema legacy (chạy bước 1 trước).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dish') THEN
        RAISE EXCEPTION 'Chưa có schema v2 trong public (khởi động backend v2 một lần để Liquibase dựng schema).';
    END IF;
    IF EXISTS (SELECT 1 FROM public.account) OR EXISTS (SELECT 1 FROM public.place) OR EXISTS (SELECT 1 FROM public.dish) THEN
        RAISE EXCEPTION 'Schema v2 đã có dữ liệu — script chỉ chạy một lần trên schema vừa dựng.';
    END IF;
    IF EXISTS (SELECT 1 FROM legacy.place WHERE kind IS NULL
               OR kind NOT IN ('HOMESTAY', 'ATTRACTION', 'RESTAURANT', 'CULTURE', 'PHOTO', 'RENTAL', 'TRANSPORT', 'SERVICE', 'CUISINE')) THEN
        RAISE EXCEPTION 'legacy.place có loại địa điểm lạ: %',
            (SELECT string_agg(DISTINCT coalesce(kind, 'NULL'), ', ') FROM legacy.place
             WHERE kind IS NULL OR kind NOT IN ('HOMESTAY', 'ATTRACTION', 'RESTAURANT', 'CULTURE', 'PHOTO', 'RENTAL', 'TRANSPORT', 'SERVICE', 'CUISINE'));
    END IF;
    IF EXISTS (SELECT lower(trim(email)) FROM legacy.account WHERE nullif(trim(email), '') IS NOT NULL
               GROUP BY lower(trim(email)) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'legacy.account có email trùng nhau khi không phân biệt hoa/thường — gộp tay trước.';
    END IF;
END $$;

-- Hàm tạm: bỏ dấu tiếng Việt + chữ thường (tạo slug nhãn).
CREATE FUNCTION pg_temp.vn_slug(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT trim(both '-' FROM regexp_replace(lower(translate(value,
        'àáảãạăằắẳẵặâầấẩẫậÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬèéẻẽẹêềếểễệÈÉẺẼẸÊỀẾỂỄỆìíỉĩịÌÍỈĨỊòóỏõọôồốổỗộơờớởỡợÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢùúủũụưừứửữựÙÚỦŨỤƯỪỨỬỮỰỳýỷỹỵỲÝỶỸỴđĐ',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiioooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyydd')),
        '[^a-z0-9]+', '-', 'g'))
$$;

-- "2-3 giờ" → 120, "45 phút" → 45, "1,5 tiếng" → 90: thời gian tham quan gợi ý (lấy cận dưới); không đọc được → NULL.
CREATE FUNCTION pg_temp.visit_minutes(value text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN hours IS NOT NULL THEN round(replace(hours[1], ',', '.')::numeric * 60)::int
        WHEN minutes IS NOT NULL THEN minutes[1]::int
        END
    FROM (SELECT regexp_match(value, '^\s*(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:giờ|gio|tiếng|tieng|h)(?:\s|$)', 'i') AS hours,
                 regexp_match(value, '^\s*(\d+)\s*(?:[-–]\s*\d+)?\s*(?:phút|phut|p)(?:\s|$)', 'i') AS minutes) parsed
$$;

CREATE TEMP TABLE import_issue (area text, detail text) ON COMMIT DROP;

-- ─── 1. Khu vực ────────────────────────────────────────────────────────────────────────────────────────────────
-- Khu vực khởi tạo đã có (Liquibase); khu vực thêm tay ở schema cũ được thêm theo cấp, ánh xạ theo mã.
INSERT INTO public.region (code, name, name_norm, level, parent_id, path, is_active)
SELECT r.code, r.name, r.name_norm, r.level, NULL, r.path, r.is_active FROM legacy.region r
WHERE r.level = 1 AND NOT EXISTS (SELECT 1 FROM public.region n WHERE n.code = r.code);
INSERT INTO public.region (code, name, name_norm, level, parent_id, path, is_active)
SELECT r.code, r.name, r.name_norm, r.level, np.id, r.path, r.is_active
FROM legacy.region r JOIN legacy.region lp ON lp.id = r.parent_id JOIN public.region np ON np.code = lp.code
WHERE r.level = 2 AND NOT EXISTS (SELECT 1 FROM public.region n WHERE n.code = r.code);
INSERT INTO public.region (code, name, name_norm, level, parent_id, path, is_active)
SELECT r.code, r.name, r.name_norm, r.level, np.id, r.path, r.is_active
FROM legacy.region r JOIN legacy.region lp ON lp.id = r.parent_id JOIN public.region np ON np.code = lp.code
WHERE r.level = 3 AND NOT EXISTS (SELECT 1 FROM public.region n WHERE n.code = r.code);

CREATE TEMP TABLE region_map ON COMMIT DROP AS
SELECT r.id AS legacy_id, n.id AS new_id FROM legacy.region r JOIN public.region n ON n.code = r.code;
INSERT INTO import_issue SELECT 'region', 'Không ánh xạ được khu vực ' || r.code FROM legacy.region r
WHERE NOT EXISTS (SELECT 1 FROM region_map m WHERE m.legacy_id = r.id);

-- ─── 2. Nhà cung cấp, tài khoản (gộp account + traveler) ───────────────────────────────────────────────────────
INSERT INTO public.provider (id, name, contact_name, contact_phone, contact_email, address, note, status, created_at, updated_at)
SELECT id, name, contact_name, contact_phone, contact_email, address, note, status, created_at, updated_at FROM legacy.provider;

INSERT INTO public.account (id, email, phone, password_hash, full_name, role, status, admin_level, provider_id,
                            token_version, last_login_at, last_activity_at, created_at)
SELECT id, lower(nullif(trim(email), '')), nullif(trim(phone), ''), password_hash, full_name, role, status,
       -- ADMIN cũ chưa gán cấp từng được coi là cấp 1; schema v2 bắt buộc ADMIN có cấp (changeset v2-010).
       CASE WHEN role = 'ADMIN' THEN COALESCE(admin_level, 1) END, provider_id, token_version, last_login_at, last_activity_at, created_at
FROM legacy.account;

-- Khách trùng email với tài khoản cổng: gộp vào tài khoản đó (giữ mật khẩu cổng; thêm ảnh đại diện, xác minh email).
CREATE TEMP TABLE traveler_map (traveler_id bigint PRIMARY KEY, account_id bigint NOT NULL, merged boolean NOT NULL) ON COMMIT DROP;
INSERT INTO traveler_map
SELECT t.id, a.id, TRUE FROM legacy.traveler t JOIN public.account a ON a.email = lower(trim(t.email));
UPDATE public.account a
SET avatar_url = coalesce(a.avatar_url, t.picture_url),
    email_verified_at = coalesce(a.email_verified_at, t.email_verified_at),
    full_name = coalesce(a.full_name, t.full_name),
    last_login_at = greatest(a.last_login_at, t.last_login_at)
FROM traveler_map m JOIN legacy.traveler t ON t.id = m.traveler_id
WHERE m.merged AND a.id = m.account_id;
INSERT INTO import_issue
SELECT 'account', 'Gộp khách #' || t.id || ' (' || t.email || ') vào tài khoản cổng #' || m.account_id
       || ' — đăng nhập trang khách bằng mật khẩu của tài khoản cổng'
FROM traveler_map m JOIN legacy.traveler t ON t.id = m.traveler_id WHERE m.merged;

-- Khách còn lại: tài khoản mới vai trò TRAVELER, id nối tiếp.
INSERT INTO traveler_map
SELECT t.id, (SELECT coalesce(max(id), 0) FROM public.account) + row_number() OVER (ORDER BY t.id), FALSE
FROM legacy.traveler t WHERE NOT EXISTS (SELECT 1 FROM traveler_map m WHERE m.traveler_id = t.id);
INSERT INTO import_issue
SELECT 'account', 'Bỏ SĐT ' || t.phone || ' của khách #' || t.id || ' (' || t.email || ') — trùng SĐT tài khoản #' || a.id
FROM traveler_map m JOIN legacy.traveler t ON t.id = m.traveler_id JOIN public.account a ON a.phone = t.phone
WHERE NOT m.merged;
INSERT INTO public.account (id, email, phone, password_hash, full_name, avatar_url, role, status, email_verified_at,
                            token_version, last_login_at, created_at)
SELECT m.account_id, lower(trim(t.email)),
       CASE WHEN EXISTS (SELECT 1 FROM public.account a WHERE a.phone = t.phone) THEN NULL ELSE nullif(trim(t.phone), '') END,
       t.password_hash, t.full_name, t.picture_url, 'TRAVELER', t.status, t.email_verified_at, 0, t.last_login_at, t.created_at
FROM traveler_map m JOIN legacy.traveler t ON t.id = m.traveler_id
WHERE NOT m.merged;

INSERT INTO public.provider_application (id, business_name, contact_name, contact_phone, contact_email, address,
                                         business_license_no, description, password_hash, status, review_note,
                                         reviewed_by, reviewed_at, provider_id, created_at)
SELECT id, business_name, contact_name, contact_phone, contact_email, address, business_license_no, description,
       password_hash, status, review_note,
       CASE WHEN EXISTS (SELECT 1 FROM public.account a WHERE a.id = reviewed_by) THEN reviewed_by END,
       reviewed_at, provider_id, created_at
FROM legacy.provider_application;

INSERT INTO public.affiliate_link (id, account_id, code, commission_rate, is_active, created_at)
SELECT id, account_id, code, commission_rate, is_active, created_at FROM legacy.affiliate_link;

-- ─── 3. Ảnh, tiện nghi, nhãn ───────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.media_asset (id, storage_key, public_url, mime_type, width_px, height_px, size_bytes, checksum_sha256,
                                alt_text, credit, source_url, license_note, uploaded_by, created_at)
SELECT id, storage_key, public_url, mime_type, width_px, height_px, size_bytes, checksum_sha256, alt_text, credit,
       source_url, license_note,
       CASE WHEN EXISTS (SELECT 1 FROM public.account a WHERE a.id = uploaded_by) THEN uploaded_by END, created_at
FROM legacy.media_asset;

INSERT INTO public.amenity (code, name, scope, is_essential, sort_order, is_active)
SELECT code, name, scope, is_essential, sort_order, is_active FROM legacy.amenity l
WHERE NOT EXISTS (SELECT 1 FROM public.amenity n WHERE n.code = l.code);
CREATE TEMP TABLE amenity_map ON COMMIT DROP AS
SELECT l.id AS legacy_id, n.id AS new_id FROM legacy.amenity l JOIN public.amenity n ON n.code = l.code;

INSERT INTO public.tag (id, group_code, slug, name, is_active)
SELECT id, group_code, slug, name, is_active FROM legacy.tag;
-- Loại cảnh quan (attributes.scenicType của điểm tham quan) → nhãn nhóm SCENIC.
INSERT INTO public.tag (group_code, slug, name, is_active)
SELECT DISTINCT 'SCENIC', 'scenic-' || pg_temp.vn_slug(trim(p.attributes ->> 'scenicType')), trim(p.attributes ->> 'scenicType'), TRUE
FROM legacy.place p
WHERE p.kind = 'ATTRACTION' AND nullif(trim(p.attributes ->> 'scenicType'), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tag t WHERE t.slug = 'scenic-' || pg_temp.vn_slug(trim(p.attributes ->> 'scenicType')));

-- ─── 4. Địa điểm (trừ món ăn CUISINE) ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.place (id, slug, kind, name, name_norm, description, badge, provider_id, region_id, address,
                          latitude, longitude, altitude_m, access_note, price_ref_min, price_ref_max, price_unit_note,
                          visibility, operation_status, operation_note, is_deleted, google_rating, rating_avg,
                          rating_count, source_type, source_name, source_url, verification, last_verified_at,
                          created_by, updated_by, created_at, updated_at)
SELECT p.id, p.slug, p.kind, p.name, p.name_norm, p.description,
       nullif(left(trim(p.attributes ->> 'tagBadge'), 64), ''),
       p.provider_id, rm.new_id, p.address, p.latitude, p.longitude,
       CASE WHEN (p.attributes ->> 'altitudeMeters') ~ '^\s*\d+(\.\d+)?\s*$' THEN round((p.attributes ->> 'altitudeMeters')::numeric)::int END,
       p.access_note,
       CASE WHEN p.price_ref_max IS NOT NULL AND p.price_ref_min > p.price_ref_max THEN p.price_ref_max ELSE p.price_ref_min END,
       CASE WHEN p.price_ref_max IS NOT NULL AND p.price_ref_min > p.price_ref_max THEN p.price_ref_min ELSE p.price_ref_max END,
       p.price_unit_note, p.visibility, p.operation_status,
       nullif(left(trim(p.attributes ->> 'operationStatusReason'), 500), ''),
       p.is_deleted, p.google_rating, p.rating_avg, p.rating_count, p.source_type, p.source_name, p.source_url,
       p.verification, p.last_verified_at, p.created_by, p.updated_by, p.created_at, p.updated_at
FROM legacy.place p LEFT JOIN region_map rm ON rm.legacy_id = p.region_id
WHERE p.kind <> 'CUISINE';

-- Hồ sơ điểm tham quan: nhu cầu, buổi, mùa đẹp (ngày → MMDD lặp hằng năm), thời gian tham quan.
INSERT INTO public.attraction_profile (place_id, needs, suitable_sessions, season_start_md, season_end_md, visit_minutes)
SELECT p.id,
       CASE WHEN lower(trim(p.needs)) IN ('enjoy', 'adventure') THEN lower(trim(p.needs)) END,
       CASE WHEN p.suitable_sessions ~ '^(MORNING|NOON|AFTERNOON|EVENING)(,(MORNING|NOON|AFTERNOON|EVENING))*$' THEN p.suitable_sessions END,
       CASE WHEN p.suitable_date_start IS NOT NULL AND p.suitable_date_end IS NOT NULL
            THEN extract(month FROM p.suitable_date_start)::int * 100 + extract(day FROM p.suitable_date_start)::int END,
       CASE WHEN p.suitable_date_start IS NOT NULL AND p.suitable_date_end IS NOT NULL
            THEN extract(month FROM p.suitable_date_end)::int * 100 + extract(day FROM p.suitable_date_end)::int END,
       pg_temp.visit_minutes(p.attributes ->> 'duration')
FROM legacy.place p WHERE p.kind = 'ATTRACTION';

INSERT INTO public.place_tag (place_id, tag_id)
SELECT p.id, t.id FROM legacy.place p
JOIN public.tag t ON t.slug = 'scenic-' || pg_temp.vn_slug(trim(p.attributes ->> 'scenicType'))
WHERE p.kind = 'ATTRACTION' AND nullif(trim(p.attributes ->> 'scenicType'), '') IS NOT NULL;
INSERT INTO public.place_tag (place_id, tag_id)
SELECT pt.place_id, pt.tag_id FROM legacy.place_tag pt JOIN public.place p ON p.id = pt.place_id
ON CONFLICT DO NOTHING;

INSERT INTO public.place_contact (id, place_id, channel, value, is_public, sort_order)
SELECT c.id, c.place_id, c.channel, c.value, c.is_public, c.sort_order
FROM legacy.place_contact c JOIN public.place p ON p.id = c.place_id;
INSERT INTO public.place_highlight (id, place_id, type, content, is_public, sort_order)
SELECT h.id, h.place_id, h.type, h.content, h.is_public, h.sort_order
FROM legacy.place_highlight h JOIN public.place p ON p.id = h.place_id;
INSERT INTO public.place_media (place_id, media_id, role, caption, sort_order)
SELECT m.place_id, m.media_id, m.role, m.caption, m.sort_order
FROM legacy.place_media m JOIN public.place p ON p.id = m.place_id;
INSERT INTO public.place_amenity (place_id, amenity_id, value, note)
SELECT a.place_id, am.new_id, a.value, a.note
FROM legacy.place_amenity a JOIN public.place p ON p.id = a.place_id JOIN amenity_map am ON am.legacy_id = a.amenity_id;
INSERT INTO public.place_opening_hour (id, place_id, day_of_week, open_time, close_time, is_closed)
SELECT o.id, o.place_id, CASE WHEN o.day_of_week = 0 THEN 7 ELSE o.day_of_week END, o.open_time, o.close_time,
       o.is_closed OR o.open_time IS NULL OR o.close_time IS NULL
FROM legacy.place_opening_hour o JOIN public.place p ON p.id = o.place_id
WHERE o.day_of_week BETWEEN 0 AND 7;

-- Ảnh bìa chỉ nằm trong attributes.coverImageUrl (chưa có ảnh COVER): tạo media_asset + place_media COVER.
CREATE TEMP TABLE cover_url ON COMMIT DROP AS
SELECT p.id AS owner_id, p.kind, trim(p.attributes ->> 'coverImageUrl') AS url,
       (SELECT coalesce(max(id), 0) FROM public.media_asset) + row_number() OVER (ORDER BY p.id) AS media_id
FROM legacy.place p
WHERE nullif(trim(p.attributes ->> 'coverImageUrl'), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM legacy.place_media m WHERE m.place_id = p.id AND m.role = 'COVER');
INSERT INTO public.media_asset (id, storage_key, public_url, mime_type, created_at)
SELECT media_id, left(url, 500), left(url, 1000), 'image/jpeg', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') FROM cover_url;
INSERT INTO public.place_media (place_id, media_id, role, caption, sort_order)
SELECT c.owner_id, c.media_id, 'COVER', NULL, 0 FROM cover_url c WHERE c.kind <> 'CUISINE';

-- ─── 5. Homestay: chính sách hủy, hồ sơ (kèm mã QR nhận phòng), dịch vụ ────────────────────────────────────────
INSERT INTO public.cancellation_policy (id, place_id, version, name, free_cancel_cutoff_hours, refund_on_late_cancel,
                                        content_text, effective_from, created_by)
SELECT c.id, c.place_id, c.version, c.name, c.free_cancel_cutoff_hours, c.refund_on_late_cancel, c.content_text,
       c.effective_from, c.created_by
FROM legacy.cancellation_policy c JOIN public.place p ON p.id = c.place_id;

INSERT INTO public.homestay_profile (place_id, check_in_from, check_out_until, processing_start_time, processing_end_time,
                                     house_rules, surcharge_note, children_policy, pets_policy, view_highlight,
                                     suitability, other_amenities, current_policy_id, checkin_code, updated_at)
SELECT h.place_id, h.check_in_from, h.check_out_until, h.processing_start_time, h.processing_end_time, h.house_rules,
       h.surcharge_note, h.children_policy, h.pets_policy, h.view_highlight, h.suitability, h.other_amenities,
       h.current_policy_id, lp.checkin_code, h.updated_at
FROM legacy.homestay_profile h JOIN legacy.place lp ON lp.id = h.place_id JOIN public.place p ON p.id = h.place_id;
-- Homestay chưa có hồ sơ: tạo hồ sơ trống (mã QR nhận phòng nằm ở hồ sơ).
INSERT INTO public.homestay_profile (place_id, checkin_code, updated_at)
SELECT p.id, lp.checkin_code, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
FROM public.place p JOIN legacy.place lp ON lp.id = p.id
WHERE p.kind = 'HOMESTAY' AND NOT EXISTS (SELECT 1 FROM public.homestay_profile h WHERE h.place_id = p.id);
-- Homestay chưa có mã QR: cấp mã 8 ký tự ngẫu nhiên (bảng 31 ký tự dễ đọc, như BookingStayService).
WITH r AS MATERIALIZED (
    SELECT place_id, uuid_send(gen_random_uuid()) AS b FROM public.homestay_profile WHERE checkin_code IS NULL
)
UPDATE public.homestay_profile h SET checkin_code =
       substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 0) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 1) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 2) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 3) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 4) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 5) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 10) % 31, 1)
    || substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, 11) % 31, 1)
FROM r WHERE h.place_id = r.place_id;

INSERT INTO public.homestay_service_offer (id, place_id, name, description, price, price_unit, active)
SELECT s.id, s.place_id, s.name, s.description, s.price, s.price_unit, s.active
FROM legacy.homestay_service_offer s JOIN public.place p ON p.id = s.place_id;

-- ─── 6. Loại phòng, giá, lịch khóa phòng (từ hôm nay; đơn cũ đã bỏ nên phòng giữ / đã xác nhận về 0) ──────────
INSERT INTO public.room_type (id, place_id, name, description, view_description, other_amenities, max_occupancy,
                              total_room_count, private_bathroom, area_sqm, base_price, weekend_price, status,
                              created_at, updated_at)
SELECT r.id, r.place_id, r.name, r.description, r.view_description, r.other_amenities, r.max_occupancy,
       r.total_room_count, r.private_bathroom, r.area_sqm,
       CASE WHEN r.base_price > 0 THEN r.base_price END, CASE WHEN r.weekend_price > 0 THEN r.weekend_price END,
       r.status, r.created_at, r.updated_at
FROM legacy.room_type r JOIN public.place p ON p.id = r.place_id;
INSERT INTO import_issue SELECT 'room_type', 'Bỏ giá <= 0 của loại phòng #' || id FROM legacy.room_type
WHERE base_price <= 0 OR weekend_price <= 0;

INSERT INTO public.room_bed (id, room_type_id, bed_type, quantity)
SELECT b.id, b.room_type_id, b.bed_type, b.quantity FROM legacy.room_bed b JOIN public.room_type r ON r.id = b.room_type_id
WHERE b.quantity > 0;
INSERT INTO public.room_amenity (room_type_id, amenity_id, value)
SELECT a.room_type_id, am.new_id, a.value FROM legacy.room_amenity a
JOIN public.room_type r ON r.id = a.room_type_id JOIN amenity_map am ON am.legacy_id = a.amenity_id;
INSERT INTO public.room_type_media (room_type_id, media_id, role, caption, sort_order)
SELECT m.room_type_id, m.media_id, m.role, m.caption, m.sort_order
FROM legacy.room_type_media m JOIN public.room_type r ON r.id = m.room_type_id;
INSERT INTO public.room_special_price (id, room_type_id, name, period_start, period_end, price, created_at, created_by)
SELECT s.id, s.room_type_id, s.name, s.period_start, s.period_end, s.price, s.created_at, s.created_by
FROM legacy.room_special_price s JOIN public.room_type r ON r.id = s.room_type_id
WHERE s.price > 0 AND s.period_start <= s.period_end;
INSERT INTO public.room_inventory_day (room_type_id, stay_date, total_rooms, held_rooms, confirmed_rooms, stop_sell,
                                       block_reason, updated_at)
SELECT d.room_type_id, d.stay_date, greatest(d.total_rooms, 0), 0, 0, d.stop_sell, d.block_reason, d.updated_at
FROM legacy.room_inventory_day d JOIN public.room_type r ON r.id = d.room_type_id
WHERE d.stay_date >= current_date;
INSERT INTO public.room_unit_day (room_type_id, stay_date, unit_no, state)
SELECT u.room_type_id, u.stay_date, u.unit_no, u.state
FROM legacy.room_unit_day u JOIN public.room_type r ON r.id = u.room_type_id
WHERE u.state = 'LOCKED' AND u.stay_date >= current_date AND u.unit_no >= 1;

-- ─── 7. Món ăn đặc sản (place kind CUISINE → dish), giữ nguyên id ──────────────────────────────────────────────
INSERT INTO public.dish (id, slug, name, name_norm, description, badge, region_id, origin, where_to_eat, ingredients,
                         cultural_meaning, serving_note, price_min, price_max, price_unit, video_url, visibility,
                         sort_order, created_at, updated_at)
SELECT p.id, p.slug, p.name, p.name_norm, p.description,
       nullif(left(trim(p.attributes ->> 'tagBadge'), 64), ''),
       rm.new_id, p.address, p.access_note,
       nullif(trim(p.attributes ->> 'ingredients'), ''),
       nullif(trim(p.attributes ->> 'culturalMeaning'), ''),
       nullif(left(trim(p.attributes ->> 'usage'), 255), ''),
       CASE WHEN p.price_ref_max IS NOT NULL AND p.price_ref_min > p.price_ref_max THEN p.price_ref_max ELSE p.price_ref_min END,
       CASE WHEN p.price_ref_max IS NOT NULL AND p.price_ref_min > p.price_ref_max THEN p.price_ref_min ELSE p.price_ref_max END,
       p.price_unit_note,
       (SELECT c.value FROM legacy.place_contact c WHERE c.place_id = p.id AND c.channel IN ('TIKTOK', 'YOUTUBE')
        ORDER BY c.sort_order, c.id LIMIT 1),
       CASE WHEN p.is_deleted THEN 'UNPUBLISHED' ELSE p.visibility END,
       0, p.created_at, p.updated_at
FROM legacy.place p LEFT JOIN region_map rm ON rm.legacy_id = p.region_id
WHERE p.kind = 'CUISINE';
INSERT INTO public.dish_media (dish_id, media_id, role, caption, sort_order)
SELECT m.place_id, m.media_id, m.role, m.caption, m.sort_order
FROM legacy.place_media m JOIN public.dish d ON d.id = m.place_id;
INSERT INTO public.dish_media (dish_id, media_id, role, caption, sort_order)
SELECT c.owner_id, c.media_id, 'COVER', NULL, 0 FROM cover_url c WHERE c.kind = 'CUISINE';
INSERT INTO public.dish_highlight (dish_id, type, content, sort_order)
SELECT h.place_id, h.type, h.content, h.sort_order
FROM legacy.place_highlight h JOIN public.dish d ON d.id = h.place_id WHERE h.is_public;
INSERT INTO import_issue
SELECT 'dish', 'Món #' || c.place_id || ': bỏ liên hệ ' || c.channel || ' (' || left(c.value, 60) || ') — món ăn không có liên hệ'
FROM legacy.place_contact c JOIN public.dish d ON d.id = c.place_id WHERE c.channel NOT IN ('TIKTOK', 'YOUTUBE');

-- ─── 8. Lễ hội, khẩn cấp, nhật ký, cấu hình ────────────────────────────────────────────────────────────────────
INSERT INTO public.festival (id, slug, name, name_norm, season_note, core_value, suitable_experience, etiquette_dont,
                             cover_image_url, location, region_id, visibility, is_deleted, suitable_date_start, suitable_date_end)
SELECT f.id, f.slug, f.name, f.name_norm, f.season_note, f.core_value, f.suitable_experience, f.etiquette_dont,
       f.cover_image_url, f.location, rm.new_id, f.visibility, f.is_deleted,
       f.suitable_date_start, CASE WHEN f.suitable_date_end >= f.suitable_date_start THEN f.suitable_date_end END
FROM legacy.festival f LEFT JOIN region_map rm ON rm.legacy_id = f.region_id;
INSERT INTO public.festival_occurrence (id, festival_id, period_start, period_end, is_estimated, note)
SELECT o.id, o.festival_id, o.period_start, greatest(o.period_end, o.period_start), o.is_estimated, o.note
FROM legacy.festival_occurrence o;

INSERT INTO public.emergency_contact (id, region_id, type, name, phone, address, is_active)
SELECT e.id, rm.new_id, e.type, e.name, e.phone, e.address, e.is_active
FROM legacy.emergency_contact e LEFT JOIN region_map rm ON rm.legacy_id = e.region_id;
INSERT INTO public.sos_request (id, requester_name, requester_phone, latitude, longitude, type, description, status,
                                assigned_contact_id, dispatch_note, created_at, resolved_at)
SELECT id, requester_name, requester_phone, latitude, longitude, type, description, status, assigned_contact_id,
       dispatch_note, created_at, resolved_at
FROM legacy.sos_request;

-- Nhật ký: người thao tác CUSTOMER trước đây là id bảng traveler → id tài khoản mới.
INSERT INTO public.audit_log (id, actor, actor_id, action, entity_type, entity_id, reason, result, ip, before_data,
                              after_data, created_at)
SELECT l.id, l.actor,
       CASE WHEN l.actor = 'CUSTOMER' THEN (SELECT m.account_id FROM traveler_map m WHERE m.traveler_id = l.actor_id)
            ELSE l.actor_id END,
       l.action, l.entity_type,
       CASE WHEN l.entity_type = 'Traveler' THEN (SELECT m.account_id FROM traveler_map m WHERE m.traveler_id = l.entity_id)
            ELSE l.entity_id END,
       l.reason, l.result, l.ip, l.before_data, l.after_data, l.created_at
FROM legacy.audit_log l;

INSERT INTO public.app_setting (setting_key, setting_value, updated_at)
SELECT setting_key, setting_value, updated_at FROM legacy.app_setting
ON CONFLICT (setting_key) DO NOTHING;
-- Đổi phiên bản danh mục: mọi container backend bỏ cache danh mục công khai (đã nạp lúc khởi động, trước khi có
-- dữ liệu) trong vòng vài giây — xem CatalogVersion.
INSERT INTO public.app_setting (setting_key, setting_value, updated_at)
VALUES ('catalog_version', 'v2-import-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at;

-- ─── 9. Đặt lại sequence id sau khi chèn id tường minh ─────────────────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT table_name, column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND is_identity = 'YES' LOOP
        EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), greatest((SELECT coalesce(max(%I), 0) FROM public.%I), 1), '
                       || '(SELECT count(*) > 0 FROM public.%I))',
                       'public.' || r.table_name, r.column_name, r.column_name, r.table_name, r.table_name);
    END LOOP;
END $$;

-- ─── 10. Báo cáo ───────────────────────────────────────────────────────────────────────────────────────────────
-- Thuộc tính JSON của schema cũ không có chỗ ở schema mới (kiểm tra trước khi xóa schema legacy).
INSERT INTO import_issue
SELECT 'attributes', 'Khóa "' || k || '" (' || count(*) || ' địa điểm, loại ' || string_agg(DISTINCT p.kind, '/') || ') không được chuyển'
FROM legacy.place p, jsonb_object_keys(coalesce(p.attributes, '{}'::jsonb)) k
WHERE k NOT IN ('tagBadge', 'scenicType', 'coverImageUrl', 'operationStatusReason', 'altitudeMeters', 'duration')
  AND NOT (p.kind = 'CUISINE' AND k IN ('ingredients', 'culturalMeaning', 'usage'))
GROUP BY k;
INSERT INTO import_issue
SELECT 'attributes', 'Không đọc được thời gian tham quan "' || (p.attributes ->> 'duration') || '" của #' || p.id
FROM legacy.place p
WHERE p.kind = 'ATTRACTION' AND nullif(trim(p.attributes ->> 'duration'), '') IS NOT NULL
  AND pg_temp.visit_minutes(p.attributes ->> 'duration') IS NULL;

-- MỘT bảng kết quả (SQL Editor của Supabase chỉ hiện kết quả của câu lệnh cuối): số bản ghi cũ / mới từng bảng, rồi
-- các ghi chú chuyển đổi (tài khoản đã gộp, SĐT bỏ vì trùng, thuộc tính không chuyển...). Lưu lại bảng này.
WITH so_luong (thu_tu, muc, cu, moi, ghi_chu) AS (
    VALUES (1, 'account', (SELECT count(*) FROM legacy.account) + (SELECT count(*) FROM legacy.traveler),
               (SELECT count(*) FROM public.account), 'cũ = account + traveler; mới ít hơn = số khách đã gộp'),
           (2, 'place (không gồm món ăn)', (SELECT count(*) FROM legacy.place WHERE kind <> 'CUISINE'), (SELECT count(*) FROM public.place), ''),
           (3, 'dish (từ place CUISINE)', (SELECT count(*) FROM legacy.place WHERE kind = 'CUISINE'), (SELECT count(*) FROM public.dish), ''),
           (4, 'media_asset', (SELECT count(*) FROM legacy.media_asset), (SELECT count(*) FROM public.media_asset),
               'mới nhiều hơn = ảnh bìa tách từ attributes'),
           (5, 'place_media + dish_media', (SELECT count(*) FROM legacy.place_media),
               (SELECT count(*) FROM public.place_media) + (SELECT count(*) FROM public.dish_media), ''),
           (6, 'room_type', (SELECT count(*) FROM legacy.room_type), (SELECT count(*) FROM public.room_type), ''),
           (7, 'homestay_profile', (SELECT count(*) FROM legacy.homestay_profile), (SELECT count(*) FROM public.homestay_profile),
               'mới có thể nhiều hơn = homestay chưa có hồ sơ'),
           (8, 'attraction_profile', (SELECT count(*) FROM legacy.place WHERE kind = 'ATTRACTION'), (SELECT count(*) FROM public.attraction_profile), ''),
           (9, 'booking (bỏ)', (SELECT count(*) FROM legacy.booking), (SELECT count(*) FROM public.booking), 'dữ liệu thử nghiệm'),
           (10, 'journey (bỏ)', (SELECT count(*) FROM legacy.journey), (SELECT count(*) FROM public.journey WHERE source = 'TRAVELER'),
                'dữ liệu thử nghiệm (không tính lịch trình gợi ý)'),
           (11, 'review (bỏ)', (SELECT count(*) FROM legacy.review), (SELECT count(*) FROM public.review), 'gắn với đơn thử nghiệm'),
           (12, 'partner_change_request (bỏ)', (SELECT count(*) FROM legacy.partner_change_request),
                (SELECT count(*) FROM public.partner_change_request), 'bản chụp theo cột cũ')
)
SELECT muc AS "Mục", cu AS "Cũ", moi AS "Mới", ghi_chu AS "Ghi chú"
FROM (SELECT thu_tu, muc, cu, moi, ghi_chu FROM so_luong
      UNION ALL
      SELECT 100, 'Ghi chú: ' || area, NULL, NULL, detail FROM import_issue) bao_cao
ORDER BY thu_tu, muc, ghi_chu;
