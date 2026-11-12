# ĐÃ CHẠY 02/10/2026: tạo + upload 13 ảnh bìa branded cho điểm đến/đặc sản lên Cloudinary,
# gắn vào place qua media_asset + place_media. Tài khoản upload: NCC nội bộ xem DEPLOY.md 0.3.
# Script lịch sử của schema CŨ (place kind CUISINE): KHÔNG chạy lại trên schema v2 — món đặc sản nằm ở bảng dish /
# dish_media (docs/db-v2.md). Thông tin kết nối DB lấy từ biến môi trường, không ghi vào file.
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tạo ảnh bìa có thương hiệu cho 13 điểm đến/đặc sản (2 mẫu thiết kế),
upload lên Cloudinary của dự án rồi gắn vào place qua media_asset + place_media."""
import json, subprocess, os, urllib.request, urllib.error

API = "https://viettrek-api.vercel.app"
DB = dict(host=os.environ.get('DB_HOST', 'aws-0-ap-southeast-1.pooler.supabase.com'), port=int(os.environ.get('DB_PORT', '5432')),
          dbname=os.environ.get('DB_NAME', 'postgres'), user=os.environ['DB_USERNAME'], password=os.environ['DB_PASSWORD'])

def http(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b'null')

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def svg_attraction(name):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0f5f4c"/><stop offset="1" stop-color="#062d24"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="980" cy="170" r="80" fill="#facc15" opacity="0.28"/>
  <circle cx="980" cy="170" r="46" fill="#facc15" opacity="0.45"/>
  <path d="M0,640 L200,470 L360,600 L560,420 L760,600 L940,460 L1200,620 L1200,800 L0,800 Z" fill="#0a2e26" opacity="0.75"/>
  <path d="M0,700 L240,560 L460,680 L700,540 L940,670 L1200,600 L1200,800 L0,800 Z" fill="#06604a" opacity="0.7"/>
  <path d="M0,760 L300,660 L600,740 L900,650 L1200,720 L1200,800 L0,800 Z" fill="#0a7d64" opacity="0.5"/>
  <text x="600" y="330" font-family="Helvetica, Arial, sans-serif" font-size="24" letter-spacing="6" fill="#a7f3d0" text-anchor="middle" opacity="0.9">ĐIỂM ĐẾN · MÙ CANG CHẢI</text>
  <text x="600" y="415" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="bold" fill="#ffffff" text-anchor="middle">{esc(name)}</text>
  <text x="600" y="480" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#d1fae5" text-anchor="middle" opacity="0.85">Ảnh đang được cập nhật</text>
</svg>'''

def svg_cuisine(name, price):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#92400e"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="1050" cy="150" r="90" fill="#fff7ed" opacity="0.2"/>
  <ellipse cx="600" cy="560" rx="240" ry="42" fill="#78350f" opacity="0.35"/>
  <path d="M470,470 a130,90 0 0,1 260,0 z" fill="#fff7ed" opacity="0.9"/>
  <rect x="452" y="466" width="296" height="18" rx="9" fill="#fde68a"/>
  <path d="M555,405 q22,-34 45,-10 q18,20 40,2" stroke="#92400e" stroke-width="7" fill="none" opacity="0.4"/>
  <text x="600" y="270" font-family="Helvetica, Arial, sans-serif" font-size="24" letter-spacing="6" fill="#fff7ed" text-anchor="middle" opacity="0.95">ĐẶC SẢN · MÙ CANG CHẢI</text>
  <text x="600" y="350" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="bold" fill="#ffffff" text-anchor="middle">{esc(name)}</text>
  <text x="600" y="408" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#fef3c7" text-anchor="middle">{esc(price)}</text>
  <text x="600" y="640" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#fff7ed" text-anchor="middle" opacity="0.85">Ảnh đang được cập nhật</text>
</svg>'''

# 1. Đăng nhập NCC để lấy cấu hình upload Cloudinary
import json as _j; _acc = _j.load(open('/tmp/internal_ncc.json')); tok = http('POST', '/api/v1/auth/portal/login', _acc)['token']
cfg = http('POST', '/api/v1/partner/media/direct-upload', {}, tok)
print(f"[OK] cấu hình Cloudinary: cloud={cfg['cloudName']}")

# 2. Danh sách place cần ảnh
import psycopg2
conn = psycopg2.connect(**DB, sslmode='require')
cur = conn.cursor()
cur.execute("""select id, name, kind, coalesce(price_ref_min,0), coalesce(price_unit_note,'') from place
               where kind in ('ATTRACTION','CUISINE') and not exists (select 1 from place_media pm where pm.place_id = place.id)
               order by id""")
rows = cur.fetchall()
print(f"Cần tạo ảnh cho {len(rows)} place")
os.makedirs('/tmp/place_img', exist_ok=True)

uploaded = []
for pid, name, kind, pmin, unit in rows:
    if kind == 'CUISINE':
        price = f"Giá tham khảo: {pmin:,}đ/{unit}" if pmin else "Giá tham khảo"
        svg = svg_cuisine(name, price.replace(',', '.'))
        style = 'dac-san'
    else:
        svg = svg_attraction(name)
        style = 'diem-den'
    slug = f"p{pid}-{style}"
    svg_path = f'/tmp/place_img/{slug}.svg'
    open(svg_path, 'w').write(svg)
    subprocess.run(['qlmanage', '-t', '-s', '1200', '-o', '/tmp/place_img', svg_path], capture_output=True, timeout=60)
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78',
                    svg_path + '.png', '--out', f'/tmp/place_img/{slug}.jpg'], capture_output=True, timeout=60)
    jpg = f'/tmp/place_img/{slug}.jpg'
    assert os.path.exists(jpg), jpg
    # upload
    r = subprocess.run(['curl', '-s', '--max-time', '120',
        '-F', f'file=@{jpg}', '-F', f"api_key={cfg['apiKey']}",
        '-F', f"timestamp={cfg['timestamp']}", '-F', f"signature={cfg['signature']}",
        f"https://api.cloudinary.com/v1_1/{cfg['cloudName']}/image/upload"], capture_output=True, text=True, timeout=150)
    d = json.loads(r.stdout)
    assert 'secure_url' in d, r.stdout[:200]
    uploaded.append((pid, name, d['public_id'], d['secure_url']))
    print(f"  [OK] {name}: đã upload")

# 3. Gắn vào DB
cur.execute("select coalesce(max(id),0)+1 from media_asset")
next_id = cur.fetchone()[0]
for i, (pid, name, pub_id, url) in enumerate(uploaded):
    cur.execute("""insert into media_asset (id, storage_key, public_url, mime_type, uploaded_by, created_at, alt_text)
                   values (%s, %s, %s, 'image/jpeg', NULL, now(), %s)""", (next_id + i, 'cloudinary:' + pub_id, url, name))
    mid = next_id + i
    cur.execute("""insert into place_media (place_id, media_id, role, caption, sort_order)
                   values (%s, %s, 'COVER', %s, 0)""", (pid, mid, name))
conn.commit()
print(f"[OK] Đã gắn {len(uploaded)} ảnh bìa vào DB")
conn.close()
