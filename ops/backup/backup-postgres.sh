#!/usr/bin/env bash
# NFR-BKP-01: sao lưu toàn bộ CSDL Viettrek (booking, tài khoản, homestay, giá, tình trạng phòng, đánh giá, audit log).
# Chạy hằng ngày (RPO <= 24 giờ). Thông tin đăng nhập lấy từ biến môi trường, KHÔNG ghi vào file này.
#
#   DB_USERNAME, DB_PASSWORD   bắt buộc (Supabase: postgres.<project-ref>)
#   DB_HOST (localhost), DB_PORT (5432), DB_NAME (viettrek; Supabase: postgres)
#   BACKUP_DIR (./backups), BACKUP_RETAIN_DAYS (14)
# Supabase: dùng Session pooler (cổng 5432), không dùng Transaction pooler (6543).
set -euo pipefail

: "${DB_USERNAME:?Thiếu DB_USERNAME}"
: "${DB_PASSWORD:?Thiếu DB_PASSWORD}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-viettrek}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
file="$BACKUP_DIR/${DB_NAME}-${stamp}.dump"

# PGPASSWORD để mật khẩu không xuất hiện trong danh sách tiến trình.
# -Fc: định dạng custom (nén sẵn, phục hồi chọn lọc được bằng pg_restore). Chỉ schema public (schema của ứng dụng).
PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USERNAME" --dbname="$DB_NAME" \
  --schema=public --format=custom --no-owner --no-privileges \
  --file="$file.partial"

# Chỉ công nhận bản sao lưu khi pg_restore đọc được mục lục của file.
pg_restore --list "$file.partial" > /dev/null
mv "$file.partial" "$file"
sha256sum "$file" > "$file.sha256"

# Xóa bản sao lưu cũ hơn số ngày giữ lại.
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.dump*" -mtime +"$RETAIN_DAYS" -delete

echo "OK: $file ($(du -h "$file" | cut -f1))"
