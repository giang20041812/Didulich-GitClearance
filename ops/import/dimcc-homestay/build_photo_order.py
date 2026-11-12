"""Sinh organize-homestay-photos.sql + bao-cao-phan-loai-anh.md: sắp xếp lại ảnh homestay theo loại (tổng quan → khuôn viên → phòng theo hạng → khác),
đặt ảnh bìa đúng, gắn ảnh vào hạng phòng (room_type_media).

Phân loại do người (Claude) xem từng ảnh thu nhỏ, KHÔNG suy từ tên thư mục (thư mục nhiều khi ghi sai: "Ảnh phòng" nhưng là nhà hàng / sảnh).
Chạy lại: python -X utf8 ops/import/dimcc-homestay/build_photo_order.py ops/import/dimcc-homestay  (đọc photo-manifest.json)
  - manifest.json: {slug: [{n, mediaId, role, sort, file}]}  (n = số thứ tự ảnh trong bảng xem thử; mediaId = media_asset.id)
"""
import json
import os
import sys

SC = sys.argv[1]
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(f'{SC}/photo-manifest.json', encoding='utf8'))

# (n, nhãn hiển thị, hạng phòng gắn kèm | None, độ chắc chắn: 'cao' | 'vừa' | 'thấp')
# Thứ tự trong danh sách = thứ tự hiển thị. 'cover' = n của ảnh bìa.
SPEC = {
    'co-gai-thai-homestay': {
        'cover': 8,
        'items': [
            (8, 'Ảnh thẻ – toàn cảnh khu nhà', None, 'vừa'),
            (5, 'Khuôn viên – mặt tiền & bãi đỗ xe (buổi tối)', None, 'cao'),
            (6, 'Khuôn viên – bãi đỗ xe nhìn ra ruộng lúa', None, 'cao'),
            (7, 'Khuôn viên – sân chung nhìn ra ruộng lúa', None, 'cao'),
            (1, 'Giao lưu văn nghệ – sân trước nhà (buổi tối)', None, 'cao'),
            (2, 'Giao lưu văn nghệ – sân trước nhà (buổi tối)', None, 'cao'),
            (3, 'Giao lưu văn nghệ – múa xòe', None, 'cao'),
            (4, 'Giao lưu văn nghệ – múa xòe (cận)', None, 'cao'),
            (10, 'Sảnh ăn uống chung', None, 'cao'),
            (9, 'Hành lang gỗ tầng nhà sàn', None, 'cao'),
            (12, 'Phòng kê đệm (3 giường)', 'Phòng 3 giường (kê đệm)', 'vừa'),
            (11, 'Sàn nằm chung kê đệm, ngăn rèm', 'Phòng 3 giường (kê đệm)', 'thấp'),
        ],
    },
    'trai-ban-homestay': {
        'cover': 8,
        'items': [
            (8, 'Ảnh thẻ – cổng vào & sân', None, 'cao'),
            (7, 'Khuôn viên – sân chung (buổi tối)', None, 'cao'),
            (1, 'Phòng homestay – giường đôi', 'Phòng homestay', 'cao'),
            (2, 'Phòng homestay – giường đôi', 'Phòng homestay', 'cao'),
            (6, 'Bungalow 1 giường – mái chóp, ban công', 'Bungalow 1 giường', 'cao'),
            (5, 'Bungalow 1 giường – view ruộng', 'Bungalow 1 giường', 'vừa'),
            (4, 'Bungalow 2 giường – view ruộng', 'Bungalow 2 giường', 'cao'),
            (3, 'Bungalow 3 giường – kèm ghế sofa', 'Bungalow 3 giường', 'cao'),
        ],
    },
    'homestay-hoa-thao': {
        'cover': 1,
        'items': [
            (1, 'Mặt tiền nhà sàn', None, 'cao'),
            (2, 'Phòng có ban công nhìn ruộng', 'Phòng đơn', 'thấp'),
            (5, 'Phòng 2 giường (1 giường lớn + 1 giường nhỏ)', 'Phòng đôi', 'vừa'),
            (3, 'Phòng 2 giường nhìn ruộng', 'Phòng đôi', 'cao'),
            (6, 'Phòng 2 giường nhìn ruộng', 'Phòng đôi', 'cao'),
            (4, 'Nhà vệ sinh khép kín', None, 'cao'),
        ],
    },
    'bungalow-xuan-giang': {
        'cover': 3,
        'items': [
            (3, 'Dãy bungalow nhìn từ trên cao, giữa ruộng bậc thang', None, 'cao'),
            (4, 'Bungalow nhìn ruộng bậc thang', None, 'cao'),
            (2, 'Khu ăn uống ngoài trời có mái che', None, 'cao'),
            (1, 'Phòng ăn trong nhà', None, 'cao'),
        ],
    },
    'new-highland-hotel': {
        'cover': 4,
        'items': [
            (4, 'Toàn cảnh khách sạn nhìn từ trên cao', None, 'cao'),
            (3, 'Sảnh tiếp khách', None, 'cao'),
            (1, 'Phòng 2 giường', 'Phòng đôi', 'vừa'),
            (2, 'Phòng 4 giường', 'Phòng 4 giường', 'cao'),
        ],
    },
    'homestay-mua-vang': {
        'cover': 2,
        'items': [
            (2, 'Toàn cảnh tòa nhà (buổi tối)', None, 'cao'),
            (1, 'Phòng 1 giường, có ban công', 'Phòng đơn (1 giường đôi)', 'vừa'),
        ],
    },
    'hoa-son-tra-hotel': {
        'cover': 2,
        'items': [
            (2, 'Phòng 1 giường lớn', 'Phòng 1 giường to', 'cao'),
        ],
        'exclude': [(1, 'Bảng niêm yết giá phòng chụp từ tường (có SĐT + giá khác giá trên web)')],
    },
    'baan-mali-homestay': {
        'cover': 2,
        'items': [
            (2, 'Nhà sàn gỗ – sân trước', None, 'cao'),
            (1, 'Sân thượng có mái che', None, 'cao'),
            (3, 'Phòng 1 giường', 'Phòng đơn', 'vừa'),
        ],
    },
    'doi-doi-gio': {
        'cover': 1,
        'items': [
            (1, 'Toàn cảnh khu homestay trên đồi', None, 'cao'),
            (2, 'Phòng 3 giường', 'Phòng triple (3 giường)', 'cao'),
        ],
    },
    'mai-linh-hotel': {
        'cover': 3,
        'items': [
            (3, 'Phòng 1 giường, nhìn ra thị trấn', 'Phòng đơn', 'cao'),
            (2, 'Phòng 2 giường', 'Phòng đôi', 'cao'),
        ],
        'exclude': [(1, 'Bảng quy định mức thu tiền phòng chụp từ tường (có SĐT + giá khác giá trên web)')],
    },
    'homestay-anh-tuc': {
        'cover': 1,
        'items': [
            (1, 'Dãy nhà tre nhìn từ ngoài', None, 'cao'),
            (2, 'Phòng nhà tre – 2 giường (1 lớn + 1 nhỏ)', 'Phòng đôi', 'vừa'),
        ],
    },
}


def esc(s):
    return s.replace("'", "''")


sql = [
    '-- Sắp xếp lại ảnh homestay theo loại + gắn ảnh vào hạng phòng. Sinh bởi build_photo_order.py (phân loại bằng cách xem từng ảnh).',
    '-- Chạy trong Supabase → SQL Editor. Chỉ sửa place_media (thứ tự, ảnh bìa, chú thích) và thêm room_type_media; KHÔNG xóa ảnh nào.',
    '-- Chạy lại nhiều lần an toàn. Cuối file có khối TÙY CHỌN (đang comment) để gỡ 2 ảnh bảng giá khỏi thư viện ảnh khách.',
    'BEGIN;',
    '',
]
rep = [
    '# Báo cáo phân loại ảnh homestay', '',
    'Phân loại bằng cách xem từng ảnh. Cột "Chắc" = độ chắc chắn (cao / vừa / thấp). Mục "vừa" và "thấp" cần người xác nhận.', '',
]
review = []
for slug, spec in SPEC.items():
    by_n = {x['n']: x for x in man[slug]}
    pid = f"(SELECT id FROM place WHERE slug = '{slug}')"
    sql.append(f'-- ===== {slug} =====')
    sql.append(f"UPDATE place_media SET role = 'GALLERY' WHERE place_id = {pid};")
    order = 0
    rep += [f'## {slug}', '', '| # | Ảnh | Nhãn | Hạng phòng | Chắc |', '|---:|---|---|---|---|']
    for n, label, room, conf in spec['items']:
        mid = by_n[n]['mediaId']
        role = 'COVER' if n == spec['cover'] else 'GALLERY'
        sql.append(f"UPDATE place_media SET sort_order = {order}, role = '{role}', caption = '{esc(label)}' WHERE place_id = {pid} AND media_id = {mid};")
        if room:
            rt = f"(SELECT id FROM room_type WHERE place_id = {pid} AND name = '{esc(room)}')"
            sql.append(
                f"INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT {rt}, {mid}, 'GALLERY', '{esc(label)}', {order} "
                f"WHERE {rt} IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;"
            )
        rep.append(f"| {n} | media {mid} | {label}{' (ảnh bìa)' if role == 'COVER' else ''} | {room or '—'} | {conf} |")
        if conf != 'cao':
            review.append(f'- **{slug}** ảnh #{n} ({label}) → {room or "—"} (chắc: {conf})')
        order += 1
    for n, why in spec.get('exclude', []):
        mid = by_n[n]['mediaId']
        sql.append(f"UPDATE place_media SET sort_order = {order + 50}, role = 'GALLERY', caption = 'KHÔNG HIỂN THỊ: {esc(why)}' WHERE place_id = {pid} AND media_id = {mid};")
        review.append(f'- **{slug}** ảnh #{n}: {why}')
        rep.append(f"| {n} | media {mid} | **Loại khỏi ảnh khách:** {why} | — | cao |")
        order += 1
    rep.append('')
    sql.append('')

sql.append('-- Mỗi hạng phòng có ảnh: chọn ảnh có thứ tự nhỏ nhất làm ảnh bìa hạng phòng (nếu chưa có ảnh bìa)')
sql.append(
    "UPDATE room_type_media rm SET role = 'COVER'\n"
    "FROM (SELECT DISTINCT ON (room_type_id) room_type_id, media_id FROM room_type_media ORDER BY room_type_id, sort_order, media_id) f\n"
    "WHERE rm.room_type_id = f.room_type_id AND rm.media_id = f.media_id\n"
    "  AND NOT EXISTS (SELECT 1 FROM room_type_media x WHERE x.room_type_id = rm.room_type_id AND x.role = 'COVER');"
)
sql += ['', 'COMMIT;', '', '-- TÙY CHỌN: gỡ 2 ảnh bảng giá khỏi thư viện ảnh khách (bỏ comment nếu đồng ý). Ảnh gốc trong Storage vẫn còn.']
for slug, spec in SPEC.items():
    for n, why in spec.get('exclude', []):
        mid = {x['n']: x for x in man[slug]}[n]['mediaId']
        sql.append(f"-- DELETE FROM place_media WHERE place_id = (SELECT id FROM place WHERE slug = '{slug}') AND media_id = {mid};")

rep += ['## Cần người xác nhận', ''] + review
open(os.path.join(OUT_DIR, 'organize-homestay-photos.sql'), 'w', encoding='utf8').write('\n'.join(sql) + '\n')
open(os.path.join(OUT_DIR, 'bao-cao-phan-loai-anh.md'), 'w', encoding='utf8').write('\n'.join(rep) + '\n')
print(len(SPEC), 'homestay |', sum(len(s['items']) for s in SPEC.values()), 'ảnh phân loại |', len(review), 'mục cần xác nhận')
