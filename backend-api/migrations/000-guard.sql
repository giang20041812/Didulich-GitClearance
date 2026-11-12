--liquibase formatted sql

--changeset viettrek:v2-000-guard-legacy-schema
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('traveler', 'category', 'booking_service_item', 'admin_push_subscription')
--comment: Chốt an toàn: schema v2 chỉ được dựng trên DB TRỐNG. Còn bảng của schema cũ (traveler, category...) thì dừng khởi động thay vì chạy đè — vd bản deploy preview trỏ nhầm vào DB production chưa chuyển đổi. Quy trình chuyển đổi: docs/db-v2.md.
SELECT 1;
