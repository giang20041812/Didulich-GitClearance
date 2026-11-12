-- Bước 1 / 3 chuyển sang schema v2: dời TOÀN BỘ bảng của schema cũ từ "public" sang schema "legacy" (giữ nguyên dữ
-- liệu, ràng buộc, index, sequence) để "public" trống cho backend v2 dựng schema mới bằng Liquibase.
--
-- Chạy SAU khi đã sao lưu (ops/backup/backup-postgres.sh) và đã tắt backend cũ:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 01-move-legacy-to-schema.sql
-- hoặc dán TOÀN BỘ file vào Supabase → SQL Editor → Run (cả file cũng là một giao dịch). Xem docs/db-v2.md mục 6.
-- Hoàn tác: trước khi deploy backend v2 chạy 01-undo-move.sql; sau khi đã deploy (chưa chạy bước 3) chạy
-- rollback-to-legacy.sql. Quy trình đầy đủ: docs/db-v2.md.
--
-- Bảng databasechangelog / databasechangeloglock cũ cũng dời sang "legacy": Liquibase của backend v2 thấy "public"
-- chưa có lịch sử → dựng schema v2 từ đầu. Changeset v2-000 dừng khởi động nếu "public" vẫn còn bảng cũ.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy') THEN
        RAISE EXCEPTION 'Schema "legacy" đã tồn tại — đã chạy bước 1 rồi? Kiểm tra lại trước khi chạy tiếp.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'traveler') THEN
        RAISE EXCEPTION 'Không thấy bảng public.traveler — DB này không phải schema cũ.';
    END IF;
END $$;

CREATE SCHEMA legacy;

DO $$
DECLARE
    r record;
BEGIN
    -- Bảng (kèm index, ràng buộc, sequence thuộc cột của bảng).
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy', r.tablename);
    END LOOP;
    -- Sequence còn lại không thuộc cột nào.
    FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'S' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA legacy', r.relname);
    END LOOP;
    -- View (schema cũ không có, phòng khi tạo tay).
    FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER VIEW public.%I SET SCHEMA legacy', r.viewname);
    END LOOP;
END $$;

-- Không ai (kể cả Data API của Supabase) đọc được schema legacy ngoài chủ sở hữu.
REVOKE ALL ON SCHEMA legacy FROM PUBLIC;

SELECT 'Đã dời ' || count(*) || ' bảng sang schema legacy' AS ket_qua
FROM pg_tables WHERE schemaname = 'legacy';
SELECT 'CÒN LẠI trong public (phải trống): ' || coalesce(string_agg(relname, ', '), '(không có)') AS kiem_tra
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S', 'v', 'm');
