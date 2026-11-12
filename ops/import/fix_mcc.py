#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vá các lệch dữ liệu phát hiện từ audit:
 1. HS005: mô tả về đúng nguyên văn Excel (bỏ chữ "với" thừa).
 2. HS003: bổ sung beds cho Bungalow 1 giường (1) và Bungalow 2 giường (2).
 3. HS006: ngừng bán "Phòng dom (giường chung)" (Excel giá theo người, hệ thống bán
    theo phòng) -> giá thấp nhất hiển thị trở lại 350.000đ đúng cột L của Excel.
Phòng của homestay đã publish đi qua 202 chờ duyệt -> admin duyệt ngay sau đó.
"""
import json, time, urllib.request, urllib.error

API = "https://viettrek-api.vercel.app"
ADMIN_PW = open('/tmp/admin_pw.txt').read().strip()
state = json.load(open('/tmp/import_state.json'))

def http(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json'} if data else {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except Exception:
            return e.code, raw.decode('utf-8', 'replace')[:300]

def must(cond, msg):
    if not cond:
        raise RuntimeError(msg)

# ---- login admin + các NCC liên quan
st, r = http('POST', '/api/v1/auth/portal/login', body={'identifier': 'admin@dulichso.vn', 'password': ADMIN_PW})
must(st == 200, f'admin login {st}')
admin = r['token']

def ncc_token(code, phone):
    st, r = http('POST', '/api/v1/auth/portal/login', body={'identifier': phone, 'password': state[code]['password'] if 'password' in state.get(code, {}) else PW[code]})
    must(st == 200, f'login {code} {st}: {str(r)[:200]}')
    return r['token']

PW = {'HS003': 'Ncc@Mcc03!', 'HS005': 'Ncc@Mcc05!', 'HS006': 'Ncc@Mcc06!'}

# ---- 1. HS005: mô tả đúng nguyên văn Excel
t5 = ncc_token('HS005', '0983994669')
st, d = http('GET', '/api/v1/partner/homestays/15', token=t5)
must(st == 200, f'lấy detail HS005 {st}')
EXCEL_DESC = '- Homestay mộc mạc, gần gũi thiên nhiên, kết hợp không gian lưu trú tiện nghi với nét giản dị của vùng núi Mù Cang Chải.'
d['description'] = EXCEL_DESC
st, r = http('PUT', '/api/v1/partner/homestays/15', body=d, token=t5)
must(st == 200, f'PUT HS005 {st}: {str(r)[:300]}')
print('[OK] HS005 mô tả đã về đúng nguyên văn Excel')

# ---- 2 & 3. Sửa phòng (PUT -> 202 -> admin duyệt)
def fix_room(code, phone, place_id, room_id, mutate):
    tk = ncc_token(code, phone)
    st, rooms = http('GET', f'/api/v1/partner/homestays/{place_id}/rooms', token=tk)
    must(st == 200, f'list rooms {code} {st}')
    room = next((x for x in rooms if x['id'] == room_id), None)
    must(room, f'không tìm thấy phòng {room_id} của {code}')
    payload = {
        'name': room['name'], 'description': room.get('description'),
        'maxOccupancy': room['maxOccupancy'], 'totalRoomCount': room['totalRoomCount'],
        'privateBathroom': room.get('privateBathroom') or 'UNVERIFIED',
        'areaSqm': room.get('areaSqm'), 'basePrice': int(room['basePrice']),
        'weekendPrice': int(room['weekendPrice']) if room.get('weekendPrice') is not None else None,
        'status': room['status'],
        'viewDescription': room.get('viewDescription'),
        'beds': room.get('beds') or [], 'amenityIds': room.get('amenityIds') or [],
    }
    mutate(payload)
    st, r = http('PUT', f'/api/v1/partner/homestays/{place_id}/rooms/{room_id}', body=payload, token=tk)
    must(st == 202 and isinstance(r, dict) and r.get('changeRequestId'),
         f'PUT phòng {code}#{room_id} {st}: {str(r)[:300]}')
    cr = r['changeRequestId']
    st, r = http('POST', f'/api/v1/admin/change-requests/{cr}/approve',
                 body={'note': 'Chuẩn hóa dữ liệu theo file Excel (02/10/2026)'}, token=admin)
    must(st == 200, f'admin duyệt phòng {code} {st}: {str(r)[:300]}')
    print(f'[OK] {code} phòng #{room_id} đã cập nhật & duyệt (changeRequest {cr})')

# HS003: beds theo tên phòng (1 giường / 2 giường)
fix_room('HS003', '0979929101', 13, 25, lambda p: p.update(beds=[{'bedType': 'Giường', 'quantity': 1}]))
fix_room('HS003', '0979929101', 13, 26, lambda p: p.update(beds=[{'bedType': 'Giường', 'quantity': 2}]))
# HS006: ngừng bán phòng dom (giá Excel tính theo người, không bán theo phòng được)
fix_room('HS006', '0974503699', 16, 36, lambda p: p.update(status='INACTIVE'))

print('\nKiểm tra sau khi vá:')
st, d = http('GET', '/api/public/places/' + state['HS006']['slug'])
print('  HS006 priceRefMin =', d.get('priceRefMin'), '(Excel: 350000)')
st, d = http('GET', '/api/public/places/' + state['HS005']['slug'])
print('  HS005 mô tả khớp Excel:', (d.get('description') or '') == EXCEL_DESC)
