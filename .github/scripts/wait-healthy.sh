#!/usr/bin/env bash
# Đợi URL trả 200 trong tối đa $2 giây (mặc định 180). Container "api" thoát giữa chừng thì dừng ngay và in log.
set -u
url="$1"
limit="${2:-180}"
start=$(date +%s)
while true; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)
  if [ "$code" = "200" ]; then
    echo "OK: $url -> 200 sau $(( $(date +%s) - start )) giây"
    exit 0
  fi
  if command -v docker >/dev/null 2>&1 && docker inspect api >/dev/null 2>&1 \
      && [ "$(docker inspect -f '{{.State.Running}}' api)" != "true" ]; then
    echo "::error::Container api đã dừng trước khi $url sẵn sàng"
    docker logs api 2>&1 | tail -n 120
    exit 1
  fi
  if [ $(( $(date +%s) - start )) -ge "$limit" ]; then
    echo "::error::$url chưa trả 200 sau $limit giây (mã cuối: $code)"
    docker logs api 2>&1 | tail -n 120 || true
    exit 1
  fi
  sleep 3
done
