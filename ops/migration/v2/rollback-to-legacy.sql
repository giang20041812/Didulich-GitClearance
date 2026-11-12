-- Quay về schema cũ SAU KHI backend v2 đã dựng schema trong "public" (đã hoặc chưa chạy bước 2), khi schema "legacy"
-- vẫn còn (CHƯA chạy bước 3). Không xóa gì:
--   - mọi bảng / sequence / view của "public" (schema v2, kể cả databasechangelog v2 và dữ liệu phát sinh trong lúc chạy
--     v2) dời sang schema "v2_rejected" để tra cứu / chép tay sau;
--   - schema "legacy" dời về "public" như trước bước 1.
-- Sau đó deploy lại backend cũ (revert nhánh main về commit trước DB v2) — Liquibase cũ thấy lịch sử cũ, không đổi gì.
-- Chưa deploy backend v2 (public còn trống) thì dùng 01-undo-move.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f rollback-to-legacy.sql
-- hoặc dán TOÀN BỘ file vào Supabase → SQL Editor → Run (cả file cũng là một giao dịch). Xem docs/db-v2.md mục 6.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy') THEN
        RAISE EXCEPTION 'Không còn schema "legacy" (đã chạy bước 3?) — chỉ phục hồi được từ bản sao lưu.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'v2_rejected') THEN
        RAISE EXCEPTION 'Schema "v2_rejected" đã tồn tại — xem lại / xóa schema đó trước khi chạy.';
    END IF;
END $$;

CREATE SCHEMA v2_rejected;

DO $$
DECLARE
    r record;
BEGIN
    -- 1. public (v2) → v2_rejected. Bảng mang theo index, ràng buộc và sequence identity của nó.
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA v2_rejected', r.tablename);
    END LOOP;
    FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'S' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA v2_rejected', r.relname);
    END LOOP;
    FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER VIEW public.%I SET SCHEMA v2_rejected', r.viewname);
    END LOOP;

    -- 2. legacy → public (như 01-undo-move.sql).
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'legacy' LOOP
        EXECUTE format('ALTER TABLE legacy.%I SET SCHEMA public', r.tablename);
    END LOOP;
    FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'legacy' AND c.relkind = 'S' LOOP
        EXECUTE format('ALTER SEQUENCE legacy.%I SET SCHEMA public', r.relname);
    END LOOP;
    FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'legacy' LOOP
        EXECUTE format('ALTER VIEW legacy.%I SET SCHEMA public', r.viewname);
    END LOOP;
END $$;

DROP SCHEMA legacy;
-- Không ai (kể cả Data API của Supabase) đọc được schema v2_rejected ngoài chủ sở hữu.
REVOKE ALL ON SCHEMA v2_rejected FROM PUBLIC;

SELECT 'public: ' || count(*) || ' bảng (schema cũ)' AS ket_qua FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'v2_rejected: ' || count(*) || ' bảng (schema v2)' FROM pg_tables WHERE schemaname = 'v2_rejected';
