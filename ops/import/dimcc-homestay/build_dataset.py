"""Dựng dataset.json cho đợt nhập "ĐiMCC homestay" từ 'Tổng hợp thông tin ĐiMCC.xlsx' (tab "Homestay") + thư mục 'ẢNH HOMESTAY MCC'.

Chạy:  python -X utf8 ops/import/dimcc-homestay/build_dataset.py
Chỉ dùng thư viện chuẩn (không cần openpyxl). Kết quả: ops/import/dimcc-homestay/dataset.json

Quy ước:
  - Mỗi dòng Excel ↔ một địa điểm. Ánh xạ sang địa điểm ĐÃ CÓ trong DB ghi ở EXISTING (slug DB). Dòng nào không có
    trong EXISTING sẽ được TẠO MỚI (kind HOMESTAY, cờ "chưa xác thực").
  - Không đưa vào dataset: SĐT / tên chủ nhà, người đặt phòng, giá nhập, hoa hồng, đặt cọc... (thông tin nội bộ).
  - "Trạng thái trên web" = Chưa đăng → holdBack (địa điểm mới ở DRAFT, trừ khi chạy với --publish-held).
"""
import glob
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'dataset.json')
PHOTO_ROOT = 'ẢNH HOMESTAY MCC'
SOURCE = 'Tổng hợp thông tin ĐiMCC.xlsx'

# Dòng Excel (tên) → slug địa điểm đã có trong DB. Chỉ nearby (khoảng cách) được thêm cho các địa điểm này.
EXISTING = {
    'Homestay Cường Tú': 'homestay-cuong-tu',
    'Win Homestay': 'winds-homestay',
    'Pú Nhu House': 'pu-nhu-homestay',
    'Chải Eco House': 'chai-eco-house',
    'Hạnh Phúc Creek Homestay': 'hanh-phuc-creek',
    'Nắng Hotel': 'nang-hotel',
    'Nhà nghỉ Ngủ': 'nha-nghi-ngu',
    'Chiba Ecolodge': 'chiba-ecolodge',
    'Hà Châu 2 Homestay': 'ha-chau-2-homestay',
    'Sky Motel': 'sky-motel',
    'Hotel Nhất Phượng': 'nhat-phuong-homestay',
}
# Tên hiển thị trong DB của các địa điểm đã có cần gắn ảnh (name_norm so khớp theo tên này).
EXISTING_DB_NAME = {'homestay-cuong-tu': 'Homestay Cường Tú', 'pu-nhu-homestay': 'Pú Nhu Homestay'}

# Thư mục ảnh → dòng Excel (tên). Thư mục không liệt kê ở đây bị bỏ qua.
FOLDER_TO_ROW = {
    'Chely Hotel': 'Chelly Hotel',
    'Hoa sơn tra': 'Hoa Sơn Tra Hotel',
    'Homestay Hiền Quang': 'Homestay Hiền Quang',
    'Mai Linh Hotel': 'Mai Linh Hotel',
    'Newhightland hotel': 'New Highland Hotel',
    'ẢNH BAAN MA LÍ HOMESTAY': 'Baan Mali Homestay',
    'ẢNH HOMESTAY BẢO LAN': 'Homestay Bảo Lan',
    'ẢNH HOMESTAY CƯỜNG TÚ': 'Homestay Cường Tú',
    'ẢNH HOMESTAY MÙA VÀNG': 'Homestay Mùa Vàng',
    'ẢNH MỘC HOMESTAY': 'Mộc Homestay',
    'ẢNH PÚ NHU HOUSE': 'Pú Nhu House',
    '🍀Đồi đổi gió homestay': 'Đồi Đổi Gió',
    '🍀ẢNH BULGALOW XUÂN GIANG': 'Bungalow Xuân Giang',
    '🍀ẢNH CÔ GÁI THÁI HOMESTAY': 'Cô Gái Thái Homestay',
    '🍀ẢNH HOMESTAY ANH TÚC': 'Homestay Anh Túc',
    '🍀ẢNH HOMESTAY HOÀ THẢO': 'Homestay Hoà Thảo',
    '🍀ẢNH TRAI BẢN HOMESTAY': 'Trai Bản Homestay',
}
# Chỉ gắn ảnh cho địa điểm ĐÃ CÓ khi nó chưa có ảnh nào (các thư mục còn lại đã được nhập ở đợt trước).
ATTACH_TO_EXISTING = {'Homestay Cường Tú', 'Pú Nhu House'}

IMG = ('.jpg', '.jpeg', '.png', '.webp')
VID = ('.mp4', '.mov', '.m4v', '.avi', '.mkv')
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_homestay_rows(xlsx):
    z = zipfile.ZipFile(xlsx)
    ss = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.find('m:sheets', NS)]
    idx = names.index('Homestay') + 1
    d = ET.fromstring(z.read(f'xl/worksheets/sheet{idx}.xml'))
    out = []
    for r in d.find('m:sheetData', NS).findall('m:row', NS):
        row = {}
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
                row[n] = val
        if row:
            out.append((int(r.get('r')), row))
    return out


def slugify(s):
    s = unicodedata.normalize('NFD', s.replace('đ', 'd').replace('Đ', 'D'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def scrub(s):
    """Bỏ số điện thoại lẫn trong văn bản."""
    return re.sub(r'(\+?84|0)[\d .-]{8,12}', '', s or '').strip()


def nearby_text(raw):
    parts = [re.sub(r'\s+', ' ', p).strip() for p in re.split(r',|\n', raw) if p.strip()]
    fixed = []
    for p in parts:
        p = re.sub(r'(\d)\s*m$', r'\1km', p)  # cột này toàn đơn vị km; "13m" / "4m" là gõ thiếu k
        p = re.sub(r'^Kim\s+nọi', 'Kim Nọi', p, flags=re.I)
        p = p[:1].upper() + p[1:]
        fixed.append(p)
    return ' · '.join(fixed)


def region_of(address):
    a = address.lower()
    if 'khim nọi' in a or 'kim nọi' in a:
        return 'MCC_KIM_NOI'
    if 'púng luông' in a:
        return 'MCC_PUNG_LUONG'
    return 'MCC_THI_TRAN'


def folder_files(folder):
    base = os.path.join(REPO, PHOTO_ROOT, folder)
    imgs, vids = [], []
    for root, _, files in os.walk(base):
        for f in sorted(files):
            rel = os.path.relpath(os.path.join(root, f), REPO).replace(os.sep, '/')
            ext = os.path.splitext(f)[1].lower()
            if ext in IMG:
                imgs.append(rel)
            elif ext in VID:
                vids.append(rel)
    return sorted(imgs), sorted(vids)


def main():
    xlsx = glob.glob(os.path.join(REPO, 'Tổng hợp*.xlsx'))[0]
    rows = [(rn, r) for rn, r in read_homestay_rows(xlsx) if rn >= 4 and 2 in r]
    folder_of_row = {v: k for k, v in FOLDER_TO_ROW.items()}

    places, nearby, folders = [], [], []
    for rn, r in rows:
        name = r[2]
        existing_slug = EXISTING.get(name)
        slug = existing_slug or slugify(name)
        near = nearby_text(r.get(23, ''))
        if near:
            nearby.append({'slug': slug, 'name': name, 'content': near, 'existing': bool(existing_slug), 'row': rn})
        folder = folder_of_row.get(name)
        if name in ATTACH_TO_EXISTING and folder:
            imgs, vids = folder_files(folder)
            folders.append({'folder': f'{PHOTO_ROOT}/{folder}', 'images': imgs, 'videos': vids, 'target': None,
                            'targetKind': 'existing', 'existingName': EXISTING_DB_NAME[existing_slug]})
            continue
        if existing_slug:
            continue

        # ---- Địa điểm mới ----
        kind_txt, seg, addr = r.get(3, 'Homestay'), r.get(4, ''), re.sub(r'\s+', ' ', r.get(5, ''))
        center = r.get(7, '')
        desc = [f'{kind_txt}{" – phân khúc " + seg.lower() if seg else ""}.']
        if addr:
            desc.append(f'Địa chỉ: {addr}' + (f' (cách trung tâm thị trấn {center})' if center else '') + '.')
        if r.get(26):
            desc.append('Loại phòng: ' + scrub(r[26]).replace('\n', '; '))
        if r.get(27):
            desc.append('Sức chứa tối đa: ' + r[27] + ' khách')
        if r.get(24):
            desc.append('Ăn uống gần đó: ' + scrub(r[24]).replace('\n', '; '))
        # Tiện ích 1/0 (cột 39–59). Chỉ 8 mã có trong DB; các mục còn lại ghi dạng chữ ở otherAmenities.
        flag = {c: r.get(c) == '1' for c in range(39, 60)}
        amen = []
        for col, code in ((39, 'FREE_PARKING'), (45, 'FREE_WIFI'), (49, 'BBQ_AREA'), (54, 'MEAL_ON_DEMAND'), (56, 'MOTORBIKE_RENTAL'), (57, 'BUS_PICKUP')):
            if flag[col]:
                amen.append(code)
        other_cols = {40: 'xe lớn (29–45 chỗ) vào tận nơi', 41: 'WC riêng từng phòng', 42: 'nước nóng', 43: 'sưởi / chăn điện', 44: 'điều hòa',
                      48: 'sân chung', 50: 'lửa trại', 51: 'giao lưu văn nghệ', 52: 'góc check-in', 53: 'trải nghiệm bản địa',
                      55: 'nhận cơm đoàn', 58: 'hướng dẫn viên', 59: 'cho bay flycam'}
        other = ', '.join(t for c, t in other_cols.items() if flag[c])
        view = ', '.join(t for c, t in ((46, 'ban công / view lúa'), (47, 'view núi / săn mây')) if flag[c])
        highlights = []
        if r.get(62):
            highlights.append({'type': 'PRO', 'content': scrub(r[62])[:500]})
        if r.get(63):
            highlights.append({'type': 'CON', 'content': scrub(r[63])[:500]})
        # "Chưa đăng" trong Excel nghĩa là CẦN đăng lên web → không giữ ẩn (holdBack = None) để địa điểm mới được công khai.
        hold = None
        photo_folders = []
        if folder:
            imgs, vids = folder_files(folder)
            folders.append({'folder': f'{PHOTO_ROOT}/{folder}', 'images': imgs, 'videos': vids, 'target': slug, 'targetKind': 'new'})
            photo_folders.append(f'{PHOTO_ROOT}/{folder}')
        places.append({
            'key': f'hs:{slug}', 'kind': 'HOMESTAY', 'name': name, 'slug': slug, 'regionCode': region_of(addr), 'address': addr or None,
            'description': '\n'.join(desc), 'accessNote': None, 'latitude': None, 'longitude': None, 'altitudeM': None,
            'priceRefMin': None, 'priceRefMax': None, 'priceUnitNote': None, 'googleRating': None,
            'sourceName': f'DATA CHÍNH THỐNG – {SOURCE} › Homestay (hàng {rn})', 'sourceUrl': r.get(6), 'operationNote': None,
            'contacts': [], 'highlights': highlights, 'amenities': amen,
            'homestayProfile': {'viewHighlight': view or None, 'suitability': seg or None, 'otherAmenities': other or None},
            'attractionProfile': None, 'serviceProfile': None,
            'photoFolders': photo_folders, 'origins': [{'sheet': 'Homestay', 'row': rn}], 'notes': [], 'holdBack': hold,
        })

    ds = {
        'meta': {'source': SOURCE, 'builtAt': '2026-11-04', 'sheets': ['Homestay']},
        'places': places, 'festivals': [], 'existingRefs': [], 'folders': folders, 'unmapped': [],
        'nearby': nearby,
    }
    with open(OUT, 'w', encoding='utf8') as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
    print(f'Dòng Excel: {len(rows)} | địa điểm mới: {len(places)} | gắn nearby: {len(nearby)} | thư mục ảnh: {len(folders)}'
          f' | ảnh: {sum(len(x["images"]) for x in folders)} | video bỏ qua: {sum(len(x["videos"]) for x in folders)}')
    unused = set(os.listdir(os.path.join(REPO, PHOTO_ROOT))) - set(FOLDER_TO_ROW) - {'Chiba Ecolodge', 'Hà Châu 2 Homestay', 'Hạnh Phúc Creek',
        'Nhà Nghỉ Ngủ', 'Nắng Hotel', 'Sky Motel', 'Wind Homestay'}
    if unused:
        print('Thư mục chưa ánh xạ:', sorted(unused))


if __name__ == '__main__':
    sys.exit(main())
