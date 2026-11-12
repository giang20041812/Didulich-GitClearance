#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit 6 homestay đã import so với file Excel (theo vị trí cột)."""
import json, urllib.request, openpyxl

API = "https://viettrek-api.vercel.app"

wb = openpyxl.load_workbook('/Users/lebahuy/Desktop/Mo_ta_Homestay_BA_da_dien.xlsx', data_only=True)
ws = wb['Nhập Homestay']
rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if r[0] and str(r[0]).startswith('HS')]

state = json.load(open('/tmp/import_state.json'))
slugs = {k: v.get('slug') for k, v in state.items()}

def fetch(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)

diffs = []
for r in rows:
    code, excel_name = r[0], r[1]
    d = fetch(f"/api/public/places/{slugs[code]}")
    rooms = {rm['name']: rm for rm in fetch(f"/api/public/places/{slugs[code]}/rooms")}

    def check(label, excel_val, api_val, ok=None):
        good = (excel_val == api_val) if ok is None else ok
        if not good:
            diffs.append(f"{code} | {label}: Excel={excel_val!r} ≠ API={api_val!r}")

    check('tên', excel_name, d['name'])
    check('mô tả', (r[2] or '').strip(), (d.get('description') or '').strip()) if r[2] else diffs.append(f"{code} | mô tả: Excel TRỐNG (đã tự viết)")
    check('địa chỉ', (r[5] or '').strip(), (d.get('address') or '').strip())
    phone_api = next((c['value'] for c in d.get('contacts', []) if c['channel'] == 'PHONE'), None)
    check('SĐT 1', str(r[11]).strip(), phone_api)
    if r[12]:
        diffs.append(f"{code} | SĐT 2 {r[12]}: CHƯA NHẬP (API portal chỉ hỗ trợ 1 SĐT chính)")
    fb_api = next((c['value'] for c in d.get('contacts', []) if c['channel'] == 'FACEBOOK'), None)
    if r[15]:
        check('Facebook', str(r[15]).strip(), fb_api)
    gm_api = next((c['value'] for c in d.get('contacts', []) if c['channel'] == 'GOOGLE_MAPS'), None)
    if r[17]:
        check('Google Maps (đã lưu link gốc)', True, gm_api is not None, ok=gm_api is not None)

    # Loại phòng theo vị trí: nhóm k tại cột 18+5k
    for k in range(4):
        ten = r[18 + 5*k]
        if not ten:
            continue
        so, giuong, gia_lt, gia_ct = r[19 + 5*k], r[20 + 5*k], r[21 + 5*k], r[22 + 5*k]
        rm = rooms.get(str(ten).strip())
        if rm is None:
            diffs.append(f"{code} | phòng '{ten}': CHƯA TẠO (Excel không có giá)" if not gia_lt else f"{code} | phòng '{ten}': THIẾU!")
            continue
        if so is not None and rm['totalRoomCount'] != int(so):
            diffs.append(f"{code} | phòng {ten} số lượng: Excel={so} ≠ API={rm['totalRoomCount']} (điều chỉnh theo ghi chú)" )
        if gia_lt and int(rm['basePrice']) != int(gia_lt):
            diffs.append(f"{code} | phòng {ten} giá LT: Excel={gia_lt} ≠ API={int(rm['basePrice'])}")
        if gia_ct and (rm.get('weekendPrice') is None or int(rm['weekendPrice']) != int(gia_ct)):
            diffs.append(f"{code} | phòng {ten} giá CT: Excel={gia_ct} ≠ API={rm.get('weekendPrice')}")

    # Giá hiển thị min theo Excel cột 8 (trừ HS006 loại dom theo ghi chú)
    gia_min_excel = int(r[8])
    gia_min_api = int(d.get('priceRefMin') or 0)
    if gia_min_excel != gia_min_api:
        diffs.append(f"{code} | giá thấp nhất hiển thị: Excel={gia_min_excel:,} ≠ API={gia_min_api:,}".replace(',', '.'))

print('SỐ KHÁC BIỆT PHÁT HIỆN:', len(diffs))
for x in diffs:
    print(' -', x)
