# ĐÃ CHẠY THÀNH CÔNG LÊN PRODUCTION NGÀY 02/10/2026 (6 homestay, placeId 11-16).
# Đây là script dùng 1 lần, giữ lại làm tài liệu/tái sử dụng cho đợt nhập sau.
# LƯU Ý trước khi chạy lại: nó TẠO TÀI KHOẢN NCC + HỒ SƠ + HOMESTAY MỚI trên môi trường chỉ định
# (biến API). Cần mật khẩu admin trong /tmp/admin_pw.txt (hoặc sửa ADMIN_PW).
# Mật khẩu NCC ban đầu của 6 homestay đã ghi trong DEPLOY.md mục 0.3.
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Import 6 homestay thật (file Mo_ta_Homestay_BA_da_dien.xlsx) lên production Viettrek
qua đúng luồng nghiệp vụ: đăng ký NCC -> admin duyệt -> tạo homestay + phòng + giá +
ảnh placeholder -> gửi xuất bản -> admin duyệt xuất bản.
Chạy: python3 /tmp/import_mcc.py
"""
import json, subprocess, sys, time, ssl, urllib.request, urllib.parse, urllib.error, os

API = "https://viettrek-api.vercel.app"
ADMIN_ID = "admin@dulichso.vn"
ADMIN_PW = open('/tmp/admin_pw.txt').read().strip()
STATE_FILE = '/tmp/import_state.json'
REPORT = []

# ---------------------------------------------------------------- HTTP helper
def http(method, path, body=None, token=None, raw=False):
    url = API + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        payload = e.read()
        status = e.code
    if raw:
        return status, payload
    try:
        return status, json.loads(payload) if payload else None
    except Exception:
        return status, payload.decode('utf-8', 'replace')[:500]

def must(cond, msg):
    if not cond:
        raise RuntimeError(msg)

def load_state():
    if os.path.exists(STATE_FILE):
        return json.load(open(STATE_FILE))
    return {}

def save_state(s):
    json.dump(s, open(STATE_FILE, 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- dữ liệu (đã rà từ Excel + ghi chú)
def num(x):
    try:
        return int(float(x))
    except Exception:
        return None

HOMESTAYS = [
    dict(code='HS001', name='Homestay Anh Túc',
         desc="- Mộc mạc, gần gũi thiên nhiên: Homestay mang đậm phong cách nhà sàn vùng cao Tây Bắc với vật liệu chủ đạo là gỗ, tre và mái lá.\n- Sự kết hợp truyền thống & hiện đại: Tuy giữ nét thô mộc truyền thống ở vỏ bọc bên ngoài để hòa hợp với cảnh quan, bên trong phòng ngủ vẫn được cải tiến với hệ thống cửa kính lớn kịch trần để tối ưu ánh sáng và trải nghiệm ngắm cảnh của du khách.",
         address='Tổ 5, TT Mù Cang Chải, Huyện Mù Cang Chải, Yên Bái (Cách chợ trung tâm Mù Cang Chải 500 mét)',
         lat=21.8448016, lng=104.0924852, phone='0963000708',
         fb='https://www.facebook.com/homestayanhtucMCC/?locale=vi_VN',
         gmaps='https://maps.app.goo.gl/evizD41qYUSaJU7c8',
         capacity_note='Sức chứa toàn homestay: 25-40 khách cùng 1 thời điểm.',
         password='Ncc@Mcc01!',
         rooms=[
             dict(name='Phòng đơn', count=3, beds=[('Giường đơn',1)], occ=2, base=400000, weekend=800000),
             dict(name='Phòng đôi', count=4, beds=[('Giường đôi',2)], occ=4, base=600000, weekend=1000000),
         ],
         skipped_rooms='Sàn (1 phòng), nhà gỗ (1 phòng) — file Excel không có giá, chưa tạo để tránh bán sai giá.'),
    dict(code='HS002', name='New Highland Hotel',
         desc="- Khách sạn boutique hiện đại, thanh lịch với thiết kế tối giản, nội thất gỗ ấm cúng và sở hữu không gian mở đón trọn tầm nhìn ra thung lũng ruộng bậc thang kỳ vĩ.",
         address='Tổ 2 thị trấn Mù Cang Chải, Yên Bái (Cách đồi Móng Ngựa 2km)',
         lat=21.846154, lng=104.0979897, phone='0966242337',
         fb='https://www.facebook.com/p/New-Highland-Hotel-100083042035145/',
         gmaps='https://maps.app.goo.gl/E4CBTnUHFsgaKDFfA',
         capacity_note='Sức chứa toàn khách sạn: 45-55 khách cùng 1 thời điểm. Hệ thống phòng khép kín, điều hòa 2 chiều, nước nóng ổn định, wifi tốc độ cao; bãi đỗ xe miễn phí.',
         password='Ncc@Mcc02!',
         rooms=[
             dict(name='Phòng đơn', count=9, beds=[('Giường đơn',1)], occ=2, base=630000, weekend=680000),
             dict(name='Phòng đôi', count=12, beds=[('Giường đôi',2)], occ=4, base=630000, weekend=680000),
         ],
         skipped_rooms='phòng 4 giường (1 phòng) — file Excel không có giá, chưa tạo để tránh bán sai giá.'),
    dict(code='HS003', name='Trai Bản Homestay',
         desc="- Thiết kế dạng các căn bungalow riêng biệt sử dụng chất liệu mộc mạc, gần gũi với thiên nhiên, kết hợp hài hòa giữa nét hoang sơ vùng cao và sự tiện nghi hiện đại.",
         address='Nằm ngay mặt đường Quốc lộ 32 (QL32), Mù Cang Chải, Yên Bái (Khu vực giáp ranh thị trấn, hệ thống bản đồ đôi khi hiển thị định vị hành chính thuộc Lào Cai nhưng thực tế đây là tuyến đường chính đi qua thủ phủ Mù Cang Chải).',
         lat=21.8460774, lng=104.098437, phone='0979929101',
         fb='https://www.facebook.com/p/Homestay-Bungalow-Trai-B%E1%BA%A3n-61551259703214/',
         gmaps='https://maps.app.goo.gl/ZRttdE6t48nii3G16',
         capacity_note='Các căn bungalow tiêu chuẩn phục vụ từ 2 – 4 người/phòng; toàn khu có thể đón các đoàn khách trung bình. Có thể có thêm không gian phòng cộng đồng (tùy thời điểm vận hành nâng cấp).',
         password='Ncc@Mcc03!',
         rooms=[
             dict(name='Bungalow 1 giường', count=3, beds=[], occ=3, base=600000, weekend=900000),
             dict(name='Bungalow 2 giường', count=2, beds=[('Giường đôi',2)], occ=4, base=900000, weekend=1400000),
             dict(name='Phòng homestay', count=3, beds=[], occ=4, base=400000, weekend=500000),
             dict(name='Bungalow 3 giường', count=2, beds=[('Giường đôi',3)], occ=6, base=1400000, weekend=1800000),
         ],
         skipped_rooms=None),
    dict(code='HS004', name='Hoa Sơn Trà Hotel',
         desc="- Nhà nghỉ nằm ngay trung tâm thị trấn Mù Cang Chải (Tổ 2), tổng 12 phòng gồm phòng thường (1 giường lớn hoặc 2 giường nhỏ) và phòng đôi 2 giường lớn. Giá phải chăng, thuận tiện làm điểm nghỉ khi khám phá thị trấn và các điểm ngắm lúa chín lân cận.",
         address='Tổ 2, thị trấn Mù Cang Chải, huyện Mù Cang Chải, Yên Bái',
         lat=None, lng=None, phone='0974664911',
         fb='https://www.facebook.com/p/Nh%C3%A0-Ngh%E1%BB%89-HOA-S%C6%A0N-TRA-100083395147812/',
         gmaps='https://www.google.com/maps/place/h%C3%B2a+s%C6%A1n+tr%C3%A0+hotel+m%C3%B9+cang+ch%E1%BA%A3i',
         capacity_note='Số phòng theo data: 6 phòng 1 giường to, 3 phòng 2 giường nhỏ, 3 phòng 2 giường lớn.',
         password='Ncc@Mcc04!',
         rooms=[
             dict(name='Phòng thường', count=9, beds=[('Giường lớn',1)], occ=3, base=300000, weekend=500000),
             dict(name='Phòng đôi', count=3, beds=[('Giường lớn',2)], occ=4, base=400000, weekend=700000),
         ],
         skipped_rooms='Số lượng "Phòng thường" gộp 6 phòng 1-giường-to + 3 phòng 2-giường-nhỏ theo ghi chú file Excel (12 phòng tổng) — cần NCC xác nhận lại.'),
    dict(code='HS005', name='Baan Mali Homestay',
         desc="- Homestay mộc mạc, gần gũi với thiên nhiên, kết hợp không gian lưu trú tiện nghi với nét giản dị của vùng núi Mù Cang Chải.",
         address='QL 32, tổ 2, Trung tâm Mù Cang Chải',
         lat=None, lng=None, phone='0983994669',
         fb=None,
         gmaps='https://maps.app.goo.gl/MHbrjLv5Pduk2mPD9',
         capacity_note='7 phòng khép kín (3 đơn, 4 đôi) và 1 phòng cộng đồng.',
         password='Ncc@Mcc05!',
         rooms=[
             dict(name='Phòng đơn', count=3, beds=[('Giường đơn',1)], occ=2, base=600000, weekend=700000),
             dict(name='Phòng đôi', count=4, beds=[('Giường đôi',2)], occ=4, base=900000, weekend=1000000),
         ],
         skipped_rooms='phòng cộng đồng (1) — chưa có giá theo ghi chú file Excel.'),
    dict(code='HS006', name='Homestay Hoà Thảo',
         desc="- Homestay mộc mạc, gần gũi thiên nhiên, thiên về trải nghiệm địa phương và du lịch khám phá.\n- Có phòng gia đình, sân hiên, vườn và khu vực sinh hoạt chung.",
         address='QL 32, Trung tâm Mù Cang Chải',
         lat=21.842688, lng=104.102437, phone='0974503699',
         fb=None,
         gmaps='https://maps.app.goo.gl/zVzRZohebyyyQ1GQA',
         capacity_note='Phòng cheap (1 phòng): 350.000–450.000đ/đêm; phòng dom (3-4 phòng): 150.000–200.000đ/người.',
         password='Ncc@Mcc06!',
         rooms=[
             dict(name='Phòng đơn', count=1, beds=[('Giường đơn',1)], occ=2, base=700000, weekend=800000),
             dict(name='Phòng đôi', count=1, beds=[('Giường đôi',2)], occ=4, base=800000, weekend=1000000),
             dict(name='Phòng cheap', count=1, beds=[('Giường đơn',1)], occ=2, base=350000, weekend=450000),
             dict(name='Phòng dom (giường chung)', count=3, beds=[('Giường đơn',4)], occ=8, base=200000, weekend=None),
         ],
         skipped_rooms='Số lượng phòng đơn/đôi file Excel không ghi rõ — tạm đặt 1 phòng mỗi loại để tránh bán quá sức chứa; NCC cập nhật lại sau. Phòng dom giá theo người, tạm nhập 200.000đ/đêm theo ghi chú.'),
]

CHECKIN, CHECKOUT = '14:00', '12:00'
POLICY_NAME = 'Hủy miễn phí trước 24 giờ'
POLICY_TEXT = ('Hủy đơn miễn phí hoàn toàn trước 24 giờ kể từ thời điểm nhận phòng. '
               'Sau thời điểm trên hoặc không đến nhận phòng, tiền không được hoàn lại.')
CUTOFF_HOURS = 24
REFUND_LATE = 'NO_REFUND'
GEO_FALLBACK = (21.84580, 104.09810)  # cụm Tổ 2 thị trấn MCC (4 homestay quanh tọa độ này)

# ---------------------------------------------------------------- ảnh placeholder
def make_svg(kind, title, subtitle):
    if kind == 'cover':
        bg1, bg2, fg, sub = '#0a7d64', '#0a2e26', '#facc15', '#ffffff'
        mountain = ('<path d="M0,660 L180,540 L330,640 L520,470 L700,640 L860,520 L1080,650 L1200,580 L1200,800 L0,800 Z" '
                    'fill="#0a2e26" opacity="0.55"/>'
                    '<path d="M0,720 L220,610 L420,700 L640,580 L880,700 L1050,620 L1200,690 L1200,800 L0,800 Z" '
                    'fill="#06604a" opacity="0.6"/>')
    else:
        bg1, bg2, fg, sub = '#f0fdf4', '#dcfce7', '#0a7d64', '#166534'
        mountain = ('<path d="M0,660 L200,530 L360,650 L560,460 L760,650 L940,510 L1200,660 L1200,800 L0,800 Z" '
                    'fill="#86efac" opacity="0.5"/>')
    esc = lambda s: s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  {mountain}
  <circle cx="1050" cy="150" r="70" fill="{fg}" opacity="0.25"/>
  <text x="600" y="330" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="6" fill="{sub}" text-anchor="middle" opacity="0.85">MÙ CANG CHẢI · ĐI MÙ CANG CHẢI</text>
  <text x="600" y="420" font-family="Helvetica, Arial, sans-serif" font-size="58" font-weight="bold" fill="{fg}" text-anchor="middle">{esc(title)}</text>
  <text x="600" y="490" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="{sub}" text-anchor="middle">{esc(subtitle)}</text>
  <text x="600" y="560" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="{sub}" text-anchor="middle" opacity="0.8">Ảnh đang được chủ nhà cập nhật</text>
</svg>'''

def render_img(name, kind, title, subtitle):
    svg_path = f'/tmp/import_img/{name}.svg'
    open(svg_path, 'w').write(make_svg(kind, title, subtitle))
    subprocess.run(['qlmanage', '-t', '-s', '1200', '-o', '/tmp/import_img', svg_path],
                   capture_output=True, timeout=60)
    png = svg_path + '.png'
    must(os.path.exists(png), f'qlmanage không render được {name}')
    jpg = f'/tmp/import_img/{name}.jpg'
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78',
                    png, '--out', jpg], capture_output=True, timeout=60)
    return jpg

# ---------------------------------------------------------------- Cloudinary
def cloudinary_upload(token, jpg_path, public_id):
    st, cfg = http('POST', '/api/v1/partner/media/direct-upload', body={}, token=token)
    must(st == 200 and isinstance(cfg, dict), f'không lấy được cấu hình upload ({st}): {str(cfg)[:200]}')
    cmd = ['curl', '-s', '--max-time', '120',
           '-F', f"file=@{jpg_path}",
           '-F', f"api_key={cfg['apiKey']}",
           '-F', f"timestamp={cfg['timestamp']}",
           '-F', f"signature={cfg['signature']}",
           f"https://api.cloudinary.com/v1_1/{cfg['cloudName']}/image/upload"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
    d = json.loads(r.stdout)
    must('secure_url' in d, f'Cloudinary upload lỗi: {r.stdout[:300]}')
    return d['secure_url'], d.get('public_id') or public_id

# ---------------------------------------------------------------- luồng chính
def main():
    state = load_state()
    only = sys.argv[1] if len(sys.argv) > 1 else None

    # admin login
    st, r = http('POST', '/api/v1/auth/portal/login', body={'identifier': ADMIN_ID, 'password': ADMIN_PW})
    must(st == 200 and r.get('token'), f'admin login lỗi {st}: {str(r)[:200]}')
    admin_token = r['token']
    print('[OK] admin login')

    region_id_cache = None

    for hs in HOMESTAYS:
        if only and hs['code'] != only:
            continue
        code = hs['code']
        if state.get(code, {}).get('done'):
            print(f"[SKIP] {code} đã xong (placeId={state[code].get('placeId')})")
            continue
        print(f"\n{'='*70}\n[{code}] {hs['name']}")
        st_state = state.setdefault(code, {})

        # 1. Đăng ký NCC
        if 'applicationId' not in st_state:
            st, r = http('POST', '/api/v1/auth/provider/register', body={
                'businessName': hs['name'], 'contactName': hs['name'],
                'contactPhone': hs['phone'], 'password': hs['password'],
                'address': hs['address'], 'businessLicenseNo': f"Đang bổ sung ({code})",
                'description': f"Nhập liệu từ file Excel Mo_ta_Homestay_BA_da_dien.xlsx. {hs['capacity_note']}"})
            must(st in (200, 201) and isinstance(r, dict) and r.get('applicationId'),
                 f'đăng ký NCC lỗi {st}: {str(r)[:300]}')
            st_state['applicationId'] = r['applicationId']
            save_state(state)
            print(f"  [OK] đăng ký NCC, applicationId={r['applicationId']} ({r.get('status')})")

        # 2. Admin duyệt hồ sơ
        if 'providerId' not in st_state:
            st, r = http('POST', f"/api/v1/admin/provider-applications/{st_state['applicationId']}/approve",
                         body={'note': 'Nhập liệu 6 homestay thật từ file Excel (02/10/2026)'},
                         token=admin_token)
            must(st == 200, f'admin duyệt NCC lỗi {st}: {str(r)[:300]}')
            st_state['providerId'] = r.get('providerId')
            save_state(state)
            print(f"  [OK] admin duyệt hồ sơ, providerId={st_state['providerId']}")

        # 3. Login NCC (theo SĐT)
        if 'nccToken' not in st_state:
            time.sleep(1)
            st, r = http('POST', '/api/v1/auth/portal/login', body={'identifier': hs['phone'], 'password': hs['password']})
            must(st == 200 and r.get('token'), f'login NCC lỗi {st}: {str(r)[:300]}')
            st_state['nccToken'] = r['token']
            save_state(state)
            print('  [OK] login NCC')

        token = st_state['nccToken']

        # 4. Lấy regionId "Thị trấn Mù Cang Chải" (cache)
        nonlocal_region = None
        if region_id_cache is None:
            st, r = http('GET', '/api/v1/partner/homestays/options', token=token)
            must(st == 200, f'options lỗi {st}: {str(r)[:300]}')
            region = next((o for o in r['regions'] if 'hị trấn' in o['name']), None)
            must(region, f"không tìm thấy region Thị trấn: {[o['name'] for o in r['regions']]}")
            region_id_cache = region['id']
            print(f"  [OK] regionId={region['id']} ({region['name']})")

        # 5. Tọa độ: geocode nếu thiếu
        lat, lng = hs['lat'], hs['lng']
        if lat is None:
            st, r = http('GET', '/api/v1/partner/geocode?address=' + urllib.parse.quote(hs['address']), token=token)
            if st == 200 and r:
                lat, lng = float(r.get('latitude')), float(r.get('longitude'))
                print(f'  [OK] geocode backend: {lat},{lng}')
            else:
                lat, lng = GEO_FALLBACK
                print(f'  [WARN] geocode thất bại ({st}) — dùng tọa độ cụm Tổ 2 thị trấn: {lat},{lng}')
            st_state['geocoded'] = [lat, lng]

        # 6. Tạo homestay (bản nháp)
        if 'placeId' not in st_state:
            body = {
                'name': hs['name'], 'description': hs['desc'], 'address': hs['address'],
                'regionId': region_id_cache, 'latitude': lat, 'longitude': lng,
                'contactPhone': hs['phone'], 'facebookUrl': hs.get('fb'), 'googleMapLink': hs.get('gmaps'),
                'checkInFrom': CHECKIN, 'checkOutUntil': CHECKOUT,
                'viewHighlight': hs['capacity_note'],
                'policyName': POLICY_NAME, 'cancellationPolicy': POLICY_TEXT,
                'freeCancelCutoffHours': CUTOFF_HOURS, 'refundOnLateCancel': REFUND_LATE,
            }
            st, r = http('POST', '/api/v1/partner/homestays', body=body, token=token)
            must(st == 201 and isinstance(r, dict) and r.get('id'), f'tạo homestay lỗi {st}: {str(r)[:300]}')
            st_state['placeId'] = r['id']
            st_state['slug'] = r.get('slug')
            save_state(state)
            print(f"  [OK] tạo homestay placeId={r['id']} missing={r.get('missingForPublish')}")

        place_id = st_state['placeId']

        # 7. Ảnh placeholder: bìa + từng phòng
        if 'coverUrl' not in st_state:
            jpg = render_img(f"{code}_cover", 'cover', hs['name'], 'Homestay · Thị trấn Mù Cang Chải')
            url, pub_id = cloudinary_upload(token, jpg, f"import/{code}_cover")
            st, r = http('POST', f'/api/v1/partner/homestays/{place_id}/media',
                         body={'imageId': pub_id, 'url': url, 'caption': 'Ảnh đang được chủ nhà cập nhật'}, token=token)
            must(st == 200, f'gắn ảnh bìa lỗi {st}: {str(r)[:300]}')
            st_state['coverUrl'] = url
            save_state(state)
            print('  [OK] ảnh bìa placeholder')

        # 8. Tạo phòng + giá + ảnh phòng
        for idx, room in enumerate(hs['rooms']):
            key = f"room{idx}"
            if key in st_state:
                continue
            body = {
                'name': room['name'], 'maxOccupancy': room['occ'], 'totalRoomCount': room['count'],
                'privateBathroom': 'UNVERIFIED',
                'basePrice': room['base'], 'weekendPrice': room.get('weekend'),
                'status': 'ACTIVE',
                'beds': [{'bedType': b, 'quantity': q} for b, q in room['beds']],
                'amenityIds': [],
            }
            st, r = http('POST', f'/api/v1/partner/homestays/{place_id}/rooms', body=body, token=token)
            must(st == 200 and r.get('id'), f'tạo phòng {room["name"]} lỗi {st}: {str(r)[:300]}')
            room_id = r['id']
            jpg = render_img(f"{code}_room{idx}", 'room', room['name'],
                             f'{room["count"]} phòng · từ {room["base"]:,}đ/đêm'.replace(',', '.'))
            url, pub_id = cloudinary_upload(token, jpg, f"import/{code}_room{idx}")
            st, r = http('POST', f'/api/v1/partner/homestays/{place_id}/rooms/{room_id}/media',
                         body={'imageId': pub_id, 'url': url, 'caption': f'{room["name"]} — ảnh đang cập nhật'}, token=token)
            must(st == 200, f'gắn ảnh phòng lỗi {st}: {str(r)[:300]}')
            st_state[key] = room_id
            save_state(state)
            print(f"  [OK] phòng {room['name']} (id={room_id}, {room['count']} phòng, {room['base']:,}đ)".replace(',', '.'))

        # 9. Gửi xuất bản
        if 'changeRequestId' not in st_state:
            st, r = http('PATCH', f'/api/v1/partner/homestays/{place_id}/status',
                         body={'visibility': 'PUBLISHED', 'operationStatus': 'OPERATING'}, token=token)
            if st == 202 and isinstance(r, dict) and r.get('changeRequestId'):
                st_state['changeRequestId'] = r['changeRequestId']
                save_state(state)
                print(f"  [OK] gửi xuất bản, changeRequestId={r['changeRequestId']}")
            else:
                # Có thể admin duyệt tự động? Kiểm tra đã PUBLISHED
                st2, r2 = http('GET', f'/api/v1/partner/homestays/{place_id}', token=token)
                must(st2 == 200 and r2.get('visibility') == 'PUBLISHED',
                     f'gửi xuất bản lỗi {st}: {str(r)[:300]} / {str(r2)[:200]}')
                st_state['published'] = True
                save_state(state)
                print('  [OK] homestay đã PUBLISHED')

        # 10. Admin duyệt xuất bản
        if not st_state.get('published'):
            st, r = http('POST', f"/api/v1/admin/change-requests/{st_state['changeRequestId']}/approve",
                         body={'note': 'Duyệt xuất bản homestay nhập từ Excel (02/10/2026)'}, token=admin_token)
            must(st == 200, f'admin duyệt xuất bản lỗi {st}: {str(r)[:300]}')
            st_state['published'] = True
            save_state(state)
            print('  [OK] admin duyệt xuất bản → PUBLISHED')

        # 11. Kiểm chứng API công khai
        st, r = http('GET', f"/api/public/places/{st_state['slug']}")
        ok = st == 200 and r.get('name') == hs['name']
        print(f"  [VERIFY] public API: {st} | {r.get('name') if isinstance(r, dict) else r} | "
              f"rooms={len(r.get('rooms', [])) if isinstance(r, dict) else '-'}")
        st_state['done'] = True
        save_state(state)
        REPORT.append(dict(code=code, name=hs['name'], placeId=place_id, slug=st_state.get('slug'),
                           phone=hs['phone'], password=hs['password'],
                           skipped=hs.get('skipped_rooms'), verify=ok))

    # Tổng kết
    print('\n' + '=' * 70)
    print(json.dumps(REPORT, ensure_ascii=False, indent=1))
    json.dump(REPORT, open('/tmp/import_report.json', 'w'), ensure_ascii=False, indent=1)
    print('\nHoàn tất. Báo cáo: /tmp/import_report.json | Trạng thái: ' + STATE_FILE)

if __name__ == '__main__':
    main()
