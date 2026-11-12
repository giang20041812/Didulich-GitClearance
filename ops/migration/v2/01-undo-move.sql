-- Hoàn tác bước 1 (CHỈ dùng khi CHƯA deploy backend v2 — "public" chưa có bảng nào): dời mọi bảng / sequence của
-- schema "legacy" về "public" rồi xóa schema "legacy".
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 01-undo-move.sql
-- hoặc dán TOÀN BỘ file vào Supabase → SQL Editor → Run (cả file cũng là một giao dịch). Xem docs/db-v2.md mục 6.

DO $$
DECLARE
    r record;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S', 'v')) THEN
        RAISE EXCEPTION '"public" đã có bảng (backend v2 đã dựng schema?) — không hoàn tác tự động được, phục hồi từ bản sao lưu.';
    END IF;
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
