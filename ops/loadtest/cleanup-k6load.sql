-- Dọn dữ liệu do kiểm thử tải k6 (ops/loadtest/viettrek-fullflow.js) tạo trên PostgreSQL / Supabase (schema v2).
--
-- Đơn test nhận biết bằng HAI dấu cùng lúc: tên khách bắt đầu "K6LOAD-" VÀ SĐT "+999…" (mã quốc gia chưa cấp,
-- không thể là khách thật). Tài khoản khách test: email "k6load-…@example.com" (account.role = 'TRAVELER').
--
-- Bước 1: chạy riêng khối XEM TRƯỚC để kiểm tra số lượng.
-- Bước 2: chạy cả khối DỌN (một giao dịch; lỗi giữa chừng thì không có gì thay đổi).

-- ======================= XEM TRƯỚC =======================
SELECT status, count(*) AS so_don, min(created_at) AS tu, max(created_at) AS den
FROM booking
WHERE guest_name LIKE 'K6LOAD-%' AND guest_phone LIKE '+999%'
GROUP BY status;

SELECT count(*) AS tai_khoan_khach_test FROM account WHERE role = 'TRAVELER' AND lower(email) LIKE 'k6load-%@example.com';

-- ======================= DỌN =======================
BEGIN;

CREATE TEMP TABLE k6_booking ON COMMIT DROP AS
SELECT id, status
FROM booking
WHERE guest_name LIKE 'K6LOAD-%' AND guest_phone LIKE '+999%';

CREATE TEMP TABLE k6_account ON COMMIT DROP AS
SELECT id FROM account WHERE role = 'TRAVELER' AND lower(email) LIKE 'k6load-%@example.com';

-- 1. Trả phòng về lịch bán theo từng loại phòng của đơn. Đơn chờ giữ held_rooms; đã xác nhận / đã thanh toán giữ
--    confirmed_rooms (đơn đã hủy không giữ).
UPDATE room_inventory_day d
SET held_rooms      = GREATEST(0, d.held_rooms - x.held),
    confirmed_rooms = GREATEST(0, d.confirmed_rooms - x.confirmed),
    updated_at      = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM (
    SELECT n.room_type_id, n.stay_date,
           sum(CASE WHEN b.status = 'PENDING' THEN r.room_count ELSE 0 END)               AS held,
           sum(CASE WHEN b.status IN ('CONFIRMED', 'PAID') THEN r.room_count ELSE 0 END) AS confirmed
    FROM k6_booking b
    JOIN booking_room r ON r.booking_id = b.id
    JOIN booking_night n ON n.booking_id = r.booking_id AND n.room_type_id = r.room_type_id
    GROUP BY n.room_type_id, n.stay_date
) x
WHERE d.room_type_id = x.room_type_id AND d.stay_date = x.stay_date;

-- 2. Thông báo liên quan (chuông Admin / NCC / khách) và thông báo "khách mới đăng ký" của tài khoản test.
--    Thông báo gửi tới chính tài khoản test tự xóa theo tài khoản (ON DELETE CASCADE).
DELETE FROM notification
WHERE (lower(related_entity_type) = 'booking' AND related_entity_id IN (SELECT id FROM k6_booking))
   OR recipient_phone LIKE '+999%'
   OR lower(recipient_email) LIKE 'k6load-%@example.com'
   OR (related_entity_type = 'Traveler' AND payload::text LIKE '%k6load-%@example.com%');

-- 3. Dữ liệu con của đơn không tự xóa theo đơn (booking_room / booking_night / lịch sử / ghi chú Admin xóa theo
--    ON DELETE CASCADE; review_image theo review).
DELETE FROM payment_transaction WHERE booking_id IN (SELECT id FROM k6_booking);
DELETE FROM refund              WHERE booking_id IN (SELECT id FROM k6_booking);
DELETE FROM commission_ledger   WHERE booking_id IN (SELECT id FROM k6_booking);
DELETE FROM review              WHERE booking_id IN (SELECT id FROM k6_booking);

-- 4. Nhật ký thao tác gắn với đơn / tài khoản test.
DELETE FROM audit_log
WHERE (entity_type = 'Booking' AND entity_id IN (SELECT id FROM k6_booking))
   OR (entity_type = 'Traveler' AND entity_id IN (SELECT id FROM k6_account));

-- 5. Đơn và tài khoản khách test (teardown của k6 đã thử xóa tài khoản qua API; dòng này dọn phần còn sót —
--    lịch trình, phiên, push của tài khoản xóa theo ON DELETE CASCADE).
DELETE FROM booking WHERE id IN (SELECT id FROM k6_booking);
DELETE FROM account WHERE id IN (SELECT id FROM k6_account);

COMMIT;

-- Kiểm tra lại: cả hai phải bằng 0.
SELECT count(*) AS don_test_con_lai FROM booking WHERE guest_name LIKE 'K6LOAD-%' AND guest_phone LIKE '+999%';
SELECT count(*) AS khach_test_con_lai FROM account WHERE role = 'TRAVELER' AND lower(email) LIKE 'k6load-%@example.com';
