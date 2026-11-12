#!/usr/bin/env python3
"""Kiểm chứng production sau khi push lên main.

1. Đợi Vercel build xong ĐÚNG commit này cho cả hai project (đọc commit status / GitHub Deployment mà Vercel gắn lên
   commit). Vercel báo lỗi → dừng ngay, in link log build. Trước đây workflow chỉ gọi API nên có thể báo "OK" khi bản
   CŨ vẫn đang chạy, trước cả lúc bản mới build xong.
2. Khi cả hai đã xong: gọi API công khai — backend sống (khởi động xong nghĩa là Liquibase đã cập nhật schema
   Supabase), trang chủ, rewrite /api của frontend, danh mục homestay trả JSON hợp lệ.

Không đọc được trạng thái Vercel (chưa bật Git Integration / project bị bỏ qua vì không đổi file) thì sau
NO_STATUS_GRACE giây chỉ dựa vào bước 2.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

REPO = os.environ["GITHUB_REPOSITORY"]
SHA = os.environ["GITHUB_SHA"]
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = os.environ.get("API_URL", "https://viettrek-api.vercel.app")
APP = os.environ.get("APP_URL", "https://viettrek-app.vercel.app")
PROJECTS = {"viettrek-api": "backend", "viettrek-app": "frontend"}
DEADLINE = time.time() + int(os.environ.get("VERIFY_TIMEOUT_SECONDS", str(18 * 60)))
NO_STATUS_GRACE = int(os.environ.get("NO_STATUS_GRACE_SECONDS", str(6 * 60)))
POLL_SECONDS = 20
DONE = {"success", "inactive"}  # inactive: bản deploy đã bị bản mới hơn thay thế
FAILED = {"failure", "error"}


def github(path):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def vercel_state(project):
    """(trạng thái, link) mới nhất Vercel gắn lên commit cho project; (None, None) nếu chưa thấy."""
    try:
        for status in github(f"commits/{SHA}/statuses?per_page=100"):  # mới nhất trước
            if project in (status.get("context") or "").lower():
                return status.get("state"), status.get("target_url")
    except (urllib.error.URLError, OSError, ValueError) as ex:
        print(f"  (không đọc được commit status: {ex})")
    try:
        deployments = [d for d in github(f"deployments?sha={SHA}&per_page=100")
                       if project in (d.get("environment") or "").lower()]
        if deployments:
            statuses = github(f"deployments/{deployments[0]['id']}/statuses?per_page=1")
            if statuses:
                return statuses[0].get("state"), statuses[0].get("log_url") or statuses[0].get("target_url")
            return "pending", None
    except (urllib.error.URLError, OSError, ValueError) as ex:
        print(f"  (không đọc được GitHub Deployments: {ex})")
    return None, None


def http_get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-cache"}),
                                    timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as ex:
        return ex.code, b""
    except (urllib.error.URLError, OSError) as ex:
        return f"lỗi kết nối ({ex})", b""


def production_ok():
    api_code, _ = http_get(f"{API}/api/public/health")
    app_code, _ = http_get(f"{APP}/")
    rewrite_code, _ = http_get(f"{APP}/api/public/health")
    places_code, body = http_get(f"{API}/api/public/places?kind=HOMESTAY&page=0&size=1")
    try:
        homestays = json.loads(body).get("totalElements", -1) if places_code == 200 else -1
    except ValueError:
        homestays = -1
    print(f"  api={api_code} app={app_code} app/api={rewrite_code} places={places_code} homestays={homestays}")
    return api_code == 200 and app_code == 200 and rewrite_code == 200 and homestays >= 0


def main():
    started = time.time()
    warned = set()
    print(f"Đợi Vercel build commit {SHA[:7]} cho {', '.join(PROJECTS)} rồi kiểm chứng production...")
    while time.time() < DEADLINE:
        elapsed = int(time.time() - started)
        ready = True
        for project, label in PROJECTS.items():
            state, link = vercel_state(project)
            print(f"  [{elapsed:>4}s] {label} ({project}): {state or 'chưa thấy trạng thái'}")
            if state in FAILED:
                print(f"::error::Vercel build {label} ({project}) thất bại cho commit {SHA[:7]}: {link or 'xem Vercel dashboard'}")
                return 1
            if state in DONE:
                continue
            if state is None and elapsed >= NO_STATUS_GRACE:
                if project not in warned:
                    warned.add(project)
                    print(f"::warning::Không thấy trạng thái Vercel của {project} trên commit này sau {NO_STATUS_GRACE} giây "
                          "— chỉ kiểm tra API (có thể project không được build lại vì không đổi file).")
                continue
            ready = False
        if ready and production_ok():
            print(f"✅ Production OK sau ~{int(time.time() - started)} giây (commit {SHA[:7]}).")
            return 0
        time.sleep(POLL_SECONDS)
    print("::error::Chưa kiểm chứng được production trong thời gian chờ — xem build logs / runtime logs trên Vercel.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
