-- Bước 3 / 3 chuyển sang schema v2: xóa schema "legacy" (dữ liệu schema cũ) khi backend v2 đã chạy ổn định trên dữ
-- liệu đã chuyển (bước 2) và đã kiểm tra trang khách / cổng NCC / cổng Admin.
--
-- KHÔNG hoàn tác được. Chỉ chạy khi đã có bản sao lưu đầy đủ lấy TRƯỚC bước 1 (ops/backup/backup-postgres.sh) và đã
-- xem bảng "Ghi chú chuyển đổi" của bước 2 (thuộc tính JSON không có chỗ ở schema mới, tài khoản đã gộp...).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 03-drop-legacy-schema.sql
-- hoặc dán TOÀN BỘ file vào Supabase → SQL Editor → Run (cả file cũng là một giao dịch). Xem docs/db-v2.md mục 6.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy') THEN
        RAISE EXCEPTION 'Không có schema "legacy" — đã xóa rồi, hoặc chưa chạy bước 1.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'databasechangelog') THEN
        RAISE EXCEPTION '"public" chưa có schema v2 (backend v2 chưa khởi động lần nào) — không xóa dữ liệu cũ.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.databasechangelog WHERE id = 'v2-000-guard-legacy-schema') THEN
        RAISE EXCEPTION '"public" không phải schema v2 (thiếu changeset v2-000-guard-legacy-schema) — không xóa dữ liệu cũ.';
    END IF;
    -- Bước 2 giữ nguyên id: mọi địa điểm (trừ món ăn) và tài khoản cổng của schema cũ phải có trong schema v2.
    IF EXISTS (SELECT 1 FROM legacy.place p WHERE p.kind <> 'CUISINE' AND NOT p.is_deleted
               AND NOT EXISTS (SELECT 1 FROM public.place n WHERE n.id = p.id))
       OR EXISTS (SELECT 1 FROM legacy.place p WHERE p.kind = 'CUISINE' AND NOT p.is_deleted
                  AND NOT EXISTS (SELECT 1 FROM public.dish d WHERE d.id = p.id))
       OR EXISTS (SELECT 1 FROM legacy.account a WHERE NOT EXISTS (SELECT 1 FROM public.account n WHERE n.id = a.id)) THEN
        RAISE EXCEPTION 'Schema v2 thiếu địa điểm / món ăn / tài khoản của schema cũ — bước 2 chưa chạy hoặc dữ liệu đã bị xóa sau đó. Kiểm tra trước khi xóa.';
    END IF;
END $$;

SELECT 'Xóa schema legacy: ' || count(*) || ' bảng' AS ket_qua FROM pg_tables WHERE schemaname = 'legacy';

DROP SCHEMA legacy CASCADE;
