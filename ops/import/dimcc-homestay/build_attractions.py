"""Dựng dataset-attractions.json: mỗi thư mục ảnh điểm đến ở gốc repo (Móng Ngựa, Rừng Trúc, Mâm Xôi Lớn...) → một địa điểm ATTRACTION.

Chạy:  python -X utf8 ops/import/dimcc-homestay/build_attractions.py
Kết quả được backend-api/scripts/import-dimcc.ts (bước 3) đưa vào DB cùng ảnh, qua import-data-chinh-thong.ts --only=ATTRACTION.

Chỉ nhập JPG / PNG / WebP. Ảnh HEIC (iPhone) và video (MOV, MP4) bị bỏ qua — in ra ở cuối để đội dữ liệu xuất lại sang JPG.
Thư mục không có ảnh nhập được (hiện chỉ Móng Ngựa: toàn video) không tạo địa điểm.
"""
import json
import os
import re
import sys
import unicodedata

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'dataset-attractions.json')

# thư mục → (tên hiển thị, mã khu vực). Tên giữ sát tên thư mục; khu vực chỉ gán khi chắc chắn, còn lại là Mù Cang Chải.
FOLDERS = {
    'Hoa Đào Rừng La Pán Tẩn': ('Hoa đào rừng La Pán Tẩn', 'MCC_LA_PAN_TAN'),
    'Hoa đào rừng Móng Ngựa': ('Hoa đào rừng Móng Ngựa', 'MU_CANG_CHAI'),
    'Hú Chù Lìn': ('Hú Chù Lìn', 'MU_CANG_CHAI'),
    'Mâm Xôi Lớn': ('Mâm Xôi Lớn', 'MCC_LA_PAN_TAN'),
    'Móng Ngựa': ('Đồi Móng Ngựa', 'MU_CANG_CHAI'),
    'Nhà Ngô': ('Nhà Ngô', 'MU_CANG_CHAI'),
    'Rừng Trúc': ('Rừng Trúc', 'MU_CANG_CHAI'),
    'Sống Lưng Khủng Long': ('Sống Lưng Khủng Long', 'MU_CANG_CHAI'),
    'Thác 7 Tầng': ('Thác 7 Tầng', 'MU_CANG_CHAI'),
    'Võng Lúa Lao Chải': ('Võng Lúa Lao Chải', 'MCC_LAO_CHAI'),
    'Đèo Khau Phạ': ('Đèo Khau Phạ', 'MCC_CAO_PHA'),
}
IMG = ('.jpg', '.jpeg', '.png', '.webp')
VID = ('.mp4', '.mov', '.m4v', '.avi', '.mkv')


def slugify(s):
    s = unicodedata.normalize('NFD', s.replace('đ', 'd').replace('Đ', 'D'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main():
    places, folders, skipped = [], [], []
    for folder, (name, region) in FOLDERS.items():
        base = os.path.join(REPO, folder)
        imgs, vids, other = [], [], []
        for root, _, files in os.walk(base):
            for f in sorted(files):
                rel = os.path.relpath(os.path.join(root, f), REPO).replace(os.sep, '/')
                ext = os.path.splitext(f)[1].lower()
                (imgs if ext in IMG else vids if ext in VID else other).append(rel)
        if other or vids:
            skipped.append((folder, len(other), len(vids)))
        if not imgs:
            print(f'BỎ QUA "{folder}": không có ảnh JPG/PNG/WebP (HEIC/video: {len(other)}/{len(vids)})')
            continue
        slug = slugify(name)
        folders.append({'folder': folder, 'images': sorted(imgs), 'videos': sorted(vids), 'target': slug, 'targetKind': 'new'})
        places.append({
            'key': f'at:{slug}', 'kind': 'ATTRACTION', 'name': name, 'slug': slug, 'regionCode': region, 'address': None,
            'description': f'{name} — điểm tham quan tại Mù Cang Chải. Mô tả chi tiết đang được cập nhật.',
            'accessNote': None, 'latitude': None, 'longitude': None, 'altitudeM': None, 'priceRefMin': None, 'priceRefMax': None,
            'priceUnitNote': None, 'googleRating': None, 'sourceName': f'DATA CHÍNH THỐNG – ảnh điểm đến "{folder}"', 'sourceUrl': None,
            'operationNote': None, 'contacts': [], 'highlights': [], 'amenities': [], 'homestayProfile': None,
            'attractionProfile': {'needs': None, 'suitableSessions': None}, 'serviceProfile': None,
            'photoFolders': [folder], 'origins': [], 'notes': [], 'holdBack': None,
        })
    ds = {'meta': {'source': 'Thư mục ảnh điểm đến', 'builtAt': '2026-11-04'}, 'places': places, 'festivals': [],
          'existingRefs': [], 'folders': folders, 'unmapped': []}
    with open(OUT, 'w', encoding='utf8') as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
    print(f'{len(places)} điểm đến | {sum(len(x["images"]) for x in folders)} ảnh nhập được')
    for folder, heic, vid in skipped:
        print(f'  chưa nhập được ở "{folder}": {heic} ảnh HEIC/khác, {vid} video')


if __name__ == '__main__':
    sys.exit(main())
