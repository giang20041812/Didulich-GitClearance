"""Dựng verified.json từ 'DATA ĐÃ XÁC THỰC.xlsx' (tab "Homestay") — dữ liệu homestay đã được đội xác thực.

Chạy:  python -X utf8 ops/import/dimcc-homestay/build_verified.py
Kết quả: ops/import/dimcc-homestay/verified.json (do backend-api/scripts/import-dimcc.ts áp vào DB, bước 4).

Nguyên tắc:
  - GIÁ công khai = cột "Giá trên web" (giá bán). Cột "Giá tham khảo" là giá thu về (nội bộ) → KHÔNG dùng.
  - Văn bản giá là chữ tự do nên hạng phòng + giá được cấu trúc tay ở ROOMS bên dưới, đối chiếu từng dòng với Excel.
  - Sức chứa mỗi phòng (occupancy) không có số liệu trực tiếp → quy ước: phòng đơn = 2, phòng đôi = 2, trừ khi Excel nói khác
    (Mùa Vàng: đôi 2 giường = 4; Xuân Giang: 2 / 4 / 6 người; phòng 3 giường = 3–6). Quy ước này khớp tổng sức chứa Excel
    (New Highland 46 ∈ 45–55; Đồi Đổi Gió 21 ∈ 20–30). Admin chỉnh lại nếu khác thực tế.
  - Các dòng chưa có thông tin (Pú Nhu, Win, Hà Châu 2, Mộc, Chelly, Thuật Hòa, Cường Tú, Bảo Lan) bị bỏ qua.
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
XLSX = os.path.join(REPO, 'DATA ĐÃ XÁC THỰC.xlsx')
OUT = os.path.join(os.path.dirname(__file__), 'verified.json')
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

# Dòng Excel (số hàng) → slug địa điểm trong DB.
ROW_SLUG = {
    2: 'homestay-anh-tuc', 3: 'new-highland-hotel', 4: 'homestay-mua-vang', 5: 'trai-ban-homestay', 6: 'hoa-son-tra-hotel',
    7: 'nha-nghi-duy-vu', 8: 'baan-mali-homestay', 9: 'homestay-hoa-thao', 10: 'co-gai-thai-homestay', 11: 'bungalow-xuan-giang',
    12: 'doi-doi-gio', 13: 'mai-linh-hotel',
}

# (tên hạng phòng, số phòng, sức chứa/phòng, giá ngày thường, giá cuối tuần/lễ — None = như ngày thường, ghi chú)
ROOMS = {
    'homestay-anh-tuc': [
        ('Phòng đơn', 3, 2, 600000, 1000000, None),
        ('Phòng đôi', 4, 2, 800000, 1200000, None),
    ],
    'new-highland-hotel': [
        ('Phòng đơn', 9, 2, 830000, 880000, None),
        ('Phòng đôi', 12, 2, 830000, 880000, None),
        ('Phòng 4 giường', 1, 4, 1400000, 1700000, None),
    ],
    'homestay-mua-vang': [
        ('Phòng đơn (1 giường đôi)', 8, 2, 550000, 650000, None),
        ('Phòng đôi (2 giường)', 7, 4, 800000, 1000000, 'Giá thứ 7 / cuối tuần: 1.000.000đ.'),
    ],
    'trai-ban-homestay': [
        ('Bungalow 1 giường', 3, 2, 800000, 1100000, None),
        ('Bungalow 2 giường', 2, 4, 1100000, 1600000, None),
        ('Bungalow 3 giường', 2, 6, 1600000, 2000000, None),
        ('Phòng homestay', 3, 2, 600000, 700000, None),
    ],
    'hoa-son-tra-hotel': [
        ('Phòng 1 giường to', 6, 2, 500000, 700000, None),
        ('Phòng 2 giường nhỏ', 3, 2, 500000, 700000, 'Excel ghi thêm "đơn 2 giường + 750k / phòng" (cột giá tham khảo ghi +50k) — cần xác nhận phụ thu.'),
        ('Phòng đôi 2 giường lớn', 3, 2, 600000, 900000, None),
    ],
    'nha-nghi-duy-vu': [
        ('Phòng đơn', 2, 2, 600000, 900000, 'Giường 1m8.'),
        ('Phòng đôi', 14, 2, 700000, 1100000, 'Giường 1m6.'),
    ],
    'baan-mali-homestay': [
        ('Phòng đơn', 3, 2, 800000, 900000, None),
        ('Phòng đôi', 4, 2, 1100000, 1200000, None),
    ],
    'homestay-hoa-thao': [
        ('Phòng đơn', 4, 2, 900000, 1000000, None),
        ('Phòng đôi', 4, 2, 1000000, 1200000, None),
        ('Phòng cheap', 1, 2, 650000, None, None),
    ],
    'co-gai-thai-homestay': [
        ('Phòng đơn', 2, 2, 550000, None, None),
        ('Phòng đôi', 2, 2, 750000, None, None),
        ('Phòng 3 giường (kê đệm)', 2, 3, 900000, None, None),
    ],
    'bungalow-xuan-giang': [
        ('Bungalow đơn 1 giường', 6, 2, 800000, None, 'Sức chứa 2 người.'),
        ('Bungalow đơn 2 giường', 4, 4, 1000000, None, 'Sức chứa 4 người.'),
        ('Bungalow 3 giường', 1, 6, 1400000, None, 'Sức chứa 6 người.'),
    ],
    'doi-doi-gio': [
        ('Phòng đơn', 4, 2, 600000, 800000, 'Cuối tuần áp dụng thứ 6, 7, chủ nhật.'),
        ('Phòng đôi', 2, 2, 900000, 1100000, None),
        ('Bungalow', 3, 2, 1300000, 1500000, None),
        ('Phòng triple (3 giường)', 1, 3, 1400000, 1600000, None),
    ],
    'mai-linh-hotel': [
        ('Phòng đơn', 7, 2, 500000, 700000, 'Cuối tuần: thứ 7, chủ nhật.'),
        ('Phòng đôi', 13, 2, 700000, 1200000, 'Có thêm hạng VIP 800.000đ (ngày thường) / 1.400.000đ (cuối tuần) nhưng Excel chưa ghi số phòng.'),
    ],
}


def read_sheet(xlsx, sheet_index=1):
    z = zipfile.ZipFile(xlsx)
    ss = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    d = ET.fromstring(z.read(f'xl/worksheets/sheet{sheet_index}.xml'))
    rows = {}
    for r in d.find('m:sheetData', NS).findall('m:row', NS):
        o = {}
        for c in r.findall('m:c', NS):
            v = c.find('m:v', NS)
            if v is None:
                t = c.find('m:is', NS)
                val = ''.join(x.text or '' for x in t.iter('{%s}t' % NS['m'])) if t is not None else ''
            else:
                val = ss[int(v.text)] if c.get('t') == 's' else v.text
            val = (val or '').strip()
            if val:
                n = 0
                for ch in re.match(r'[A-Z]+', c.get('r')).group(0):
                    n = n * 26 + ord(ch) - 64
                o[n] = val
        rows[int(r.get('r'))] = o
    return rows


def bullets(text, limit=8):
    out = []
    for line in re.split(r'\n+', text or ''):
        line = re.sub(r'^[\s\-•·*+]+', '', line).strip()
        if len(line) >= 3:
            out.append(line[:500])
    return out[:limit]


def phones(text):
    seen, out = set(), []
    squeezed = re.sub(r'(?<=\d)[\s.](?=\d)', '', text or '')  # "0915 505 599" → "0915505599"
    for m in re.finditer(r'0\d{9,10}', squeezed):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def main():
    rows = read_sheet(XLSX, 1)
    out = []
    for rn, slug in ROW_SLUG.items():
        r = rows[rn]
        rooms = ROOMS[slug]
        prices = [p for _, _, _, b, w, _ in rooms for p in (b, w) if p]
        desc = []
        if r.get(11):
            desc.append(re.sub(r'^[\s\-•]+', '', r[11].replace('\n', ' ')).strip()[:700])
        summary = '; '.join(f'{c} {n.lower()}' for n, c, *_ in rooms)
        desc.append('Loại phòng: ' + summary + '.')
        if r.get(9) and re.search(r'khách|người|ng\b', r[9], re.I) and not r[9].lower().startswith('số phòng'):
            desc.append('Sức chứa: ' + r[9].replace('\n', ' ').strip())
        contacts = [{'channel': 'PHONE', 'value': p} for p in phones(r.get(16))]
        fb = re.search(r'https?://\S+', r.get(17, ''))
        if fb:
            url = fb.group(0).rstrip('.,)')
            contacts.append({'channel': 'TIKTOK' if 'tiktok' in url else 'FACEBOOK', 'value': url})
        rating = re.match(r'(\d(?:\.\d+)?)\s*/', r.get(19, ''))
        addr = re.sub(r'\s+', ' ', r.get(4, ''))
        out.append({
            'slug': slug, 'row': rn, 'name': r[3].replace('\n', ' ').strip(),
            'address': addr if 0 < len(addr) <= 160 else None,
            'description': '\n'.join(desc),
            'priceRefMin': min(prices) if prices else None, 'priceRefMax': max(prices) if prices else None,
            'rating': float(rating.group(1)) if rating else None,
            'view': (r.get(12) or '').replace('\n', ' ')[:500] or None,
            'suitability': (r.get(13) or '').replace('\n', ' ')[:800] or None,
            'otherAmenities': (r.get(10) or '').strip() or None,
            'contacts': contacts, 'pros': bullets(r.get(14)), 'cons': bullets(r.get(15)),
            'rooms': [{'name': n, 'count': c, 'occupancy': o, 'basePrice': b, 'weekendPrice': w, 'note': note}
                      for n, c, o, b, w, note in rooms],
        })
    with open(OUT, 'w', encoding='utf8') as f:
        json.dump({'meta': {'source': 'DATA ĐÃ XÁC THỰC.xlsx › Homestay', 'builtAt': '2026-11-04'}, 'places': out}, f, ensure_ascii=False, indent=1)
    print(f'{len(out)} homestay xác thực | {sum(len(p["rooms"]) for p in out)} hạng phòng | '
          f'{sum(len(p["contacts"]) for p in out)} liên hệ | {sum(len(p["pros"]) + len(p["cons"]) for p in out)} ưu/nhược điểm')


if __name__ == '__main__':
    sys.exit(main())
