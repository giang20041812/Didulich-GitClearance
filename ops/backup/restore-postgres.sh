#!/usr/bin/env bash
# NFR-BKP-01: phục hồi CSDL từ bản sao lưu do backup-postgres.sh tạo (RTO mục tiêu <= 4 giờ).
# CẢNH BÁO: ghi đè dữ liệu trong CSDL đích. Nên phục hồi vào CSDL kiểm thử (TARGET_DB) trước để xác nhận bản sao lưu dùng được.
#
#   Cách dùng:  CONFIRM_RESTORE=yes DB_USERNAME=... DB_PASSWORD=... ./restore-postgres.sh <file.dump> [TARGET_DB]
#   DB_HOST (localhost), DB_PORT (5432); TARGET_DB mặc định là viettrek_restore_test (an toàn), muốn ghi đè CSDL thật phải chỉ định rõ.
set -euo pipefail

file="${1:?Cách dùng: $0 <file.dump> [TARGET_DB]}"
target="${2:-viettrek_restore_test}"
: "${DB_USERNAME:?Thiếu DB_USERNAME}"
: "${DB_PASSWORD:?Thiếu DB_PASSWORD}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Từ chối: đặt CONFIRM_RESTORE=yes để xác nhận phục hồi vào CSDL '$target'." >&2
  exit 1
fi
[ -f "$file" ] || { echo "Không thấy file: $file" >&2; exit 1; }

# Kiểm tra toàn vẹn trước khi động vào CSDL.
if [ -f "$file.sha256" ]; then
  sha256sum -c "$file.sha256"
fi
pg_restore --list "$file" > /dev/null

export PGPASSWORD="$DB_PASSWORD"
if ! psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USERNAME" --dbname=postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1; then
  createdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USERNAME" --encoding=UTF8 "$target"
fi
# --clean --if-exists: xóa đối tượng cũ trong schema public trước khi tạo lại; --single-transaction: lỗi thì không đổi gì.
pg_restore --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USERNAME" --dbname="$target" \
  --clean --if-exists --no-owner --no-privileges --single-transaction "$file"

echo "OK: đã phục hồi $file vào CSDL '$target'. Kiểm tra nhanh số bản ghi booking/account trước khi chuyển ứng dụng sang CSDL này."
