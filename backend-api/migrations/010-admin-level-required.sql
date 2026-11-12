--liquibase formatted sql

--changeset viettrek:v2-010-admin-level-required
--comment: Mọi tài khoản ADMIN phải có cấp quản trị (1–3), tài khoản khác không có cấp. Trước đây ADMIN có admin_level NULL (vd chép từ dữ liệu cũ) được backend coi là cấp 1 — toàn quyền; nay giá trị dự phòng trong code là cấp thấp nhất. Gán cấp 1 cho các ADMIN đang NULL để giữ đúng quyền họ đang có, rồi chặn NULL bằng CHECK. Điều kiện viết "admin_level IS NOT NULL AND ..." vì CHECK coi kết quả NULL là đạt.
UPDATE account SET admin_level = 1 WHERE role = 'ADMIN' AND admin_level IS NULL;
ALTER TABLE account DROP CONSTRAINT ck_account_admin_level;
ALTER TABLE account ADD CONSTRAINT ck_account_admin_level CHECK (
    (role = 'ADMIN' AND admin_level IS NOT NULL AND admin_level BETWEEN 1 AND 3)
    OR (role <> 'ADMIN' AND admin_level IS NULL));
--rollback ALTER TABLE account DROP CONSTRAINT ck_account_admin_level;
--rollback ALTER TABLE account ADD CONSTRAINT ck_account_admin_level CHECK (admin_level IS NULL OR (role = 'ADMIN' AND admin_level BETWEEN 1 AND 3));
