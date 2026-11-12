#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bước 1/2 của đợt nhập "DATA CHÍNH THỐNG": đọc file Excel + quét các thư mục ảnh, đối chiếu và chuẩn hóa thành
`dataset.json` (dữ liệu sẽ đưa vào hệ thống) + `coverage.json` (chứng minh KHÔNG SÓT: mỗi dòng dữ liệu của mỗi sheet
đều có một "kết cục" — tạo mới / gộp vào mục khác / đã có sẵn trong hệ thống / không có chỗ chứa).

Bước 2 (ghi vào DB, tải ảnh) là `backend-api/scripts/import-data-chinh-thong.ts`.

Chạy:  python ops/import/data-chinh-thong/build_dataset.py [--no-maps]
Cần: openpyxl. Truy cập mạng chỉ để đổi link Google Maps rút gọn thành toạ độ (kết quả lưu ở maps_cache.json).
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
XLSX = os.path.join(REPO, 'DATA CHÍNH THỐNG.xlsx')
SOURCE_FILE = 'DATA CHÍNH THỐNG.xlsx'
IMAGE_ROOTS = ['ẢNH HOMESTAY MCC', 'ẢNH HOTEL - KHÁCH SẠN MCC', 'NHÀ HÀNG']
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
VIDEO_EXT = {'.mp4', '.mov'}
MAPS_CACHE = os.path.join(HERE, 'maps_cache.json')

# --------------------------------------------------------------------------------------------- tiện ích văn bản

EMPTY_MARKERS = {
    'chua co du lieu', 'thieu du lieu', 'khong co', 'khong tim thay', 'khong ap dung', 'chua xac dinh', 'free_text_none',
}


def nfc(s):
    return unicodedata.normalize('NFC', s)


def norm(s):
    """Chữ thường, không dấu, chỉ còn chữ-số cách nhau bằng một dấu cách."""
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('đ', 'd').replace('Đ', 'D').lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def slugify(s):
    return norm(re.sub(r"['’`]", '', s or '')).replace(' ', '-')


def clean(v):
    """Ô Excel -> chuỗi gọn; ô trống / ghi chú kiểu 'chưa có dữ liệu' -> ''."""
    if v is None:
        return ''
    if isinstance(v, float) and v == int(v):
        v = int(v)
    s = nfc(str(v)).replace('\xa0', ' ').replace('\t', ' ').replace('\r', '')
    s = re.sub(r'[ ]{2,}', ' ', s).strip()
    s = re.sub(r'\n{3,}', '\n\n', s)
    if norm(s) in EMPTY_MARKERS or norm(s).startswith('chua co thong tin'):
        return ''
    return s


def cell(ws, col, row):
    v = ws[f'{col}{row}'].value
    if isinstance(v, str) and v.startswith('='):
        # =IFERROR(__xludf.DUMMYFUNCTION("AI(...)"),"<giá trị thật>") -> lấy giá trị thật
        m = re.findall(r'"([^"]*)"', v)
        v = m[-1] if m else ''
    return clean(v)


def raw_cell(ws, col, row):
    v = ws[f'{col}{row}'].value
    return v


def split_items(text, seps=r'[;\n]'):
    out = []
    for part in re.split(seps, text or ''):
        p = part.strip(' -•\u2022\t')
        if p and norm(p) not in EMPTY_MARKERS and not norm(p).startswith('chua co thong tin'):
            out.append(p)
    return out


URL_RE = re.compile(r'https?://[^\s;,<>"\']+')


def urls_in(text):
    found = []
    # link bị dính liền nhau ("...BC-14820133https://...") -> tách ở mỗi "http"
    for chunk in re.split(r'(?=https?://)', text or ''):
        m = URL_RE.match(chunk.strip())
        if m:
            u = m.group(0).rstrip('.)')
            if u not in found:
                found.append(u)
    return found


def classify_url(u):
    h = u.lower()
    if 'maps.app.goo.gl' in h or 'google.com/maps' in h or 'goo.gl/maps' in h:
        return 'GOOGLE_MAPS'
    if 'facebook.com' in h or 'fb.watch' in h or 'fb.com' in h:
        return 'FACEBOOK'
    if 'tiktok.com' in h:
        return 'TIKTOK'
    if 'youtube.com' in h or 'youtu.be' in h:
        return 'YOUTUBE'
    return 'WEBSITE'


# SĐT: gom mọi chuỗi giống số điện thoại trong ô, bỏ dấu '*', khoảng trắng, dấu chấm.
PHONE_RE = re.compile(r'\+?\d[\d\s.\-]{6,}\d(?![\dA-Za-z])')


def phones_in(v, notes=None, label=''):
    if v is None or v == '':
        return []
    if isinstance(v, (int, float)):
        digits = str(int(v))
        return [('0' + digits) if len(digits) == 9 else digits]
    text = str(v)
    out = []
    for m in PHONE_RE.finditer(text):
        d = re.sub(r'\D', '', m.group(0))
        if len(d) == 9 and not d.startswith('0'):
            d = '0' + d
        hotline = re.fullmatch(r'1[89]00\d{4,6}', d) is not None
        if 9 <= len(d) <= 11 or hotline:
            if d not in out:
                out.append(d)
            standard = hotline or re.fullmatch(r'0[35789]\d{8}', d) or re.fullmatch(r'02\d{9}', d)
            if not standard and notes is not None:
                notes.append(f'{label}: số "{d}" không đúng định dạng số điện thoại hiện hành, cần gọi kiểm tra')
        elif notes is not None:
            notes.append(f'{label}: bỏ số không hợp lệ "{m.group(0).strip()}"')
    return out


def money_vnd(text):
    """Danh sách số tiền VND xuất hiện trong chuỗi (hiểu 30.000 / 30k / 2.000.000vnd / 1,2 triệu)."""
    t = (text or '').lower()
    t = re.sub(r'(?<=\d)\s*(vnd|vnđ|đồng|đ|₫)(?![a-zà-ỹ])', ' ', t)
    nums = []
    for m in re.finditer(r'(\d+)\s*[-–]\s*(\d+)\s*k\b', t):  # "40-45k"
        nums += [int(m.group(1)) * 1000, int(m.group(2)) * 1000]
        t = t.replace(m.group(0), ' ')
    for m in re.finditer(r'(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(k|triệu|tr)?\b', t):
        raw, suf = m.group(1), m.group(2)
        n = int(raw.replace('.', ''))
        if suf == 'k':
            n *= 1000
        elif suf in ('triệu', 'tr'):
            n *= 1_000_000
        elif n < 1000:  # "40-45" trong "~40-45k": số trần nhỏ, xử lý riêng bên dưới
            continue
        nums.append(n)
    return nums


def price_unit(text):
    t = (text or '').lower()
    has_person = bool(re.search(r'/\s*(người|khách)', t))
    has_room = bool(re.search(r'/\s*phòng', t))
    if has_person and has_room:
        return 'đêm (tùy loại phòng)'
    for pat, label in [
        (r'/\s*(người|khách)\s*/\s*đêm', 'người/đêm'), (r'/\s*phòng\s*/\s*đêm', 'phòng/đêm'), (r'/\s*đêm', 'đêm'),
        (r'/\s*suất', 'suất'), (r'/\s*ghế', 'ghế'), (r'/\s*vé', 'vé'), (r'/\s*khứ hồi', 'khứ hồi'),
        (r'/\s*ngày', 'ngày'), (r'/\s*chuyến', 'chuyến'), (r'/\s*lượt', 'lượt'), (r'/\s*gói', 'gói'),
        (r'/\s*bộ\s*/\s*tiếng', 'bộ/giờ'), (r'/\s*xe', 'xe'), (r'/\s*đôi', 'đôi'), (r'/\s*show', 'show'),
        (r'/\s*người', 'người'),
    ]:
        if re.search(pat, t):
            return label
    return None


def price_of(text, unit_default=None):
    """(min, max, unit) hoặc (None, None, None) khi không có số tiền VND (USD, 'Liên hệ'...)."""
    if not text or '$' in text:
        return None, None, None
    nums = money_vnd(text)
    if not nums:
        return None, None, None
    return min(nums), max(nums), (price_unit(text) or unit_default)


def rating_of(text):
    m = re.search(r'(\d(?:[.,]\d)?)\s*(?:/\s*5|sao)', text or '')
    if m:
        v = float(m.group(1).replace(',', '.'))
        if 0 <= v <= 5:
            return v
    return None


def minutes_of(text):
    """'~7,5 giờ' -> 450; '~7 giờ 25 phút' -> 445; '15-20 phút' -> 20 (lấy cận trên); '~7–8 giờ' -> 480."""
    t = (text or '').lower().replace(',', '.')
    h = re.search(r'(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*(?:giờ|tiếng)', t)
    m = re.search(r'(\d+)\s*(?:[-–]\s*(\d+))?\s*phút', t)
    total = None
    if h:
        total = float(h.group(2) or h.group(1)) * 60
        if m and not h.group(2):
            total += float(m.group(1))
    elif m:
        total = float(m.group(2) or m.group(1))
    return int(round(total)) if total else None


# --------------------------------------------------------------------------------------------- Google Maps

def load_cache():
    if os.path.exists(MAPS_CACHE):
        return json.load(open(MAPS_CACHE, encoding='utf-8'))
    return {}


def resolve_maps(url, cache, enabled):
    """Link rút gọn Google Maps -> {lat,lng,name,final}; không đổi được thì None (không làm hỏng cả quá trình)."""
    if url in cache and 'lat' in cache[url]:
        return cache[url]
    if not enabled:
        return None
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
            'Accept-Language': 'vi',
        })
        with urllib.request.urlopen(req, timeout=25) as r:
            final = r.geturl()
        time.sleep(0.7)
    except Exception as e:  # noqa: BLE001 - mạng lỗi chỉ làm thiếu toạ độ
        cache[url] = {'error': str(e)[:120]}
        return None
    m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', final) or re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', final)
    nm = re.search(r'/maps/place/([^/@]+)', final)
    if not m:
        cache[url] = {'error': 'không có toạ độ trong link', 'final': final[:200]}
        return None
    name = urllib.request.unquote(nm.group(1)).replace('+', ' ') if nm else None
    cache[url] = {'lat': float(m.group(1)), 'lng': float(m.group(2)), 'name': nfc(name) if name else None}
    return cache[url]


GENERIC_TOKENS = {'homestay', 'home', 'stay', 'mu', 'cang', 'chai', 'nha', 'nghi', 'hotel', 'house', 'khach', 'san', 'bungalow',
                  'quan', 'hang', 'restaurant', 'cafe', 'cf', 'coffee', 'and', 'the', 'ecolodge', 'lodge'}
BOX = (21.5, 22.3, 103.7, 104.7)  # lat min/max, lng min/max: vùng Mù Cang Chải - Tú Lệ - Cao Phạ


def name_tokens(s):
    return set(norm(s).split()) - GENERIC_TOKENS


def names_agree(a, b):
    """Tên Google trả về có liên quan tới tên cơ sở không (chung ít nhất một từ riêng, hoặc chứa nhau khi bỏ dấu cách)."""
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return True  # không đủ thông tin để kết luận khác nhau
    ca, cb = norm(a).replace(' ', ''), norm(b).replace(' ', '')
    return bool(ta & tb) or ca in cb or cb in ca


def km(a, b):
    import math
    p = math.pi / 180
    x = (b[1] - a[1]) * p * math.cos((a[0] + b[0]) / 2 * p)
    y = (b[0] - a[0]) * p
    return math.hypot(x, y) * 6371


# --------------------------------------------------------------------------------------------- bảng đối chiếu thủ công
# Mã khu vực (bảng region): xem migrations/007-reference-data.sql.
R = {
    'LPT': 'MCC_LA_PAN_TAN', 'CCN': 'MCC_CHE_CU_NHA', 'DXP': 'MCC_DE_XU_PHINH', 'NK': 'MCC_NAM_KHAT', 'TT': 'MCC_THI_TRAN',
    'CP': 'MCC_CAO_PHA', 'PL': 'MCC_PUNG_LUONG', 'MD': 'MCC_MO_DE', 'KN': 'MCC_KIM_NOI', 'TL': 'VC_TU_LE', 'HUYEN': 'MU_CANG_CHAI',
}

# Khu vực từng homestay (đọc từ cột "Khu vực" / "Vị trí"; ô không nêu xã thì dùng cấp huyện).
HOMESTAY_REGION = {
    'Hello Mu Cang Chai Homestay': 'LPT', 'Mu Cang Chai Eco Lodge': 'NK', 'Dò Gừ Homestay': 'LPT', 'Mù Cang Homestay': 'TT',
    'Ngọc Thúy Homestay': 'TT', 'Mong Ngua Homestay': 'MD', 'La Pan Tan Homestay': 'LPT', 'Homestay Cường Tú': 'KN',
    'Nhà nghỉ cộng đồng Lương Văn Bản': 'TT', 'Homestay Tùng Teng': 'KN', 'Homestay A De': 'LPT', 'Lượng Hường Homestay': 'TT',
    'Homestay Minh Ngọc': 'KN', 'Suối Kim 2 Homestay': 'PL', 'Nhà nghỉ cộng đồng Nông Văn Êm': 'TT', 'Homestay Tư Nguyệt': 'TT',
    'Homestay Quyết Đoản': 'CP', 'Hoai Phuong Homestay': 'KN', 'Home Stay Duy Cường': 'TT', 'Gà Tre Homestay': 'TT',
    'Mù Cang Chải Village Home': 'TT', 'Mù Cang Chải Big View Homestay': 'CCN', 'Chải Eco House': 'TT', 'A Su Homestay': 'LPT',
    "Wind's Homestay": 'LPT', 'Homestay Chù Chỏ': 'PL', 'Bamboo Homestay': 'LPT', 'Sùng A Hờ Homestay': 'HUYEN',
    'Suối Kim Homestay': 'HUYEN', 'Bluehome Homestay (Khau Phạ)': 'CP', 'Pú Nhu Homestay': 'LPT',
    'Dòng Suối Hmong Homestay & Bungalow': 'CCN', 'Mù Cang Chải Dream House': 'PL', 'Súa Su Homestay': 'CP',
    'Indigenous Homestay – Trek & Local Life': 'LPT', 'GARRYA Mù Cang Chải': 'PL',
}

# Thư mục ảnh -> thực thể trong file Excel (alias do tên thư mục khác tên trong sheet). Ghi rõ độ tin cậy.
FOLDER_ALIAS = {
    'ẢNH HOMESTAY MCC/Win Homestay': ("Wind's Homestay", 'tên gần giống ("Win" ~ "Wind\'s"), cần người xác nhận'),
    'ẢNH HOMESTAY MCC/ẢNH HOMESTAY CƯỜNG TÚ': ('Homestay Cường Tú', 'khớp tên'),
    'ẢNH HOMESTAY MCC/ẢNH PÚ NHU HOUSE': ('Pú Nhu Homestay', 'tên gần giống ("Pú Nhu House" ~ "Pú Nhu Homestay")'),
    'NHÀ HÀNG/🍀NHÀ HÀNG QUYỀN HƯỜNG': ('Nhà hàng Quyền Hường', 'khớp tên'),
    'NHÀ HÀNG/🍀NHÀ HÀNG THÀNH OANH': ('Nhà hàng Thành Oanh', 'khớp tên'),
    'NHÀ HÀNG/🍀NHÀ HÀNG TUẤN TUẤN THÚY': ('Nhà hàng Tuấn Thúy', 'khớp tên (thư mục viết "Tuấn Tuấn Thúy")'),
    'NHÀ HÀNG/🍀VƯỜN ĐÀO QUÁN': ('Nhà hàng Vườn Đào', 'khớp tên'),
    'NHÀ HÀNG/NHÀ HÀNG THUẬT HÒA': ('Quán Thuật Hà', 'tên gần giống ("Thuật Hòa" ~ "Thuật Hà")'),
}

# Thư mục ảnh của địa điểm ĐÃ CÓ trong hệ thống (không tạo mới; chỉ gắn ảnh khi chạy với --attach-existing).
EXISTING_FOLDERS = {
    'ẢNH HOMESTAY MCC/Duy Vũ hotel': 'Nhà nghỉ Duy Vũ',
    'ẢNH HOTEL - KHÁCH SẠN MCC/ẢNH NHÀ NGHỈ DUY VŨ': 'Nhà nghỉ Duy Vũ',
    'ẢNH HOMESTAY MCC/Hoa sơn tra': 'Hoa Sơn Trà Hotel',
    'ẢNH HOTEL - KHÁCH SẠN MCC/🍀ẢNH HOA SƠN TRÀ HOTEL': 'Hoa Sơn Trà Hotel',
    'ẢNH HOMESTAY MCC/Mai Linh Hotel': 'Mai Linh Hotel',
    'ẢNH HOTEL - KHÁCH SẠN MCC/🍀MAI LINH HOTEL': 'Mai Linh Hotel',
    'ẢNH HOMESTAY MCC/Newhightland hotel': 'New Highland Hotel',
    'ẢNH HOTEL - KHÁCH SẠN MCC/🍀ẢNH NEWHIGHLAND HOTEL': 'New Highland Hotel',
    'ẢNH HOMESTAY MCC/ẢNH BAAN MA LÍ HOMESTAY': 'Baan Mali Homestay',
    'ẢNH HOMESTAY MCC/ẢNH HOMESTAY MÙA VÀNG': 'Homestay Mùa Vàng',
    'ẢNH HOMESTAY MCC/🍀Đồi đổi gió homestay': 'Đồi Đổi Gió',
    'ẢNH HOMESTAY MCC/🍀ẢNH BULGALOW XUÂN GIANG': 'Bulgalow Xuân giang',
    'ẢNH HOMESTAY MCC/🍀ẢNH CÔ GÁI THÁI HOMESTAY': 'Cô Gái Thái Homestay',
    'ẢNH HOMESTAY MCC/🍀ẢNH HOMESTAY ANH TÚC': 'Homestay Anh Túc',
    'ẢNH HOMESTAY MCC/🍀ẢNH HOMESTAY HOÀ THẢO': 'Homestay Hoà Thảo',
    'ẢNH HOMESTAY MCC/🍀ẢNH TRAI BẢN HOMESTAY': 'Trai Bản Homestay',
}

# Thư mục ảnh có ảnh nhưng KHÔNG có dòng nào trong Excel -> tạo homestay "chỉ có tên + ảnh" để không mất ảnh.
FOLDER_STUBS = {
    'ẢNH HOMESTAY MCC/Chiba Ecolodge': 'Chiba Ecolodge',
    'ẢNH HOMESTAY MCC/Hà Châu 2 Homestay': 'Hà Châu 2 Homestay',
    'ẢNH HOMESTAY MCC/Hạnh Phúc Creek': 'Hạnh Phúc Creek',
    'ẢNH HOMESTAY MCC/Nhà Nghỉ Ngủ': 'Nhà Nghỉ Ngủ',
    'ẢNH HOMESTAY MCC/Nhất Phượng Homestay': 'Nhất Phượng Homestay',
    'ẢNH HOMESTAY MCC/Nắng Hotel': 'Nắng Hotel',
    'ẢNH HOMESTAY MCC/Sky Motel': 'Sky Motel',
    'ẢNH HOMESTAY MCC/Thuật Hà homestay': 'Thuật Hà Homestay',
}

# Cột bị lệch trong file nguồn (ghi chú Ưu/Nhược nằm sai cột) -> chỉ rõ cột nào là ưu / nhược / phù hợp.
REVIEWER_COLUMN_FIX = {
    "Wind's Homestay": {'pro': ['J'], 'con': ['K', 'L'], 'suit': []},
}

AMENITY_RULES = [
    ('FREE_WIFI', r'wi-?fi'),
    ('FREE_PARKING', r'(bãi|sân|chỗ)\s*(đỗ|để)\s*xe|đỗ xe'),
    ('FREE_KITCHEN', r'bếp (chung|đầy đủ|dùng chung)|dụng cụ bếp'),
    ('MEAL_ON_DEMAND', r'ăn uống|nhà hàng|bữa (sáng|tối|ăn)|món (ăn|ngon)|cơm (bản|gia đình|lam)|ẩm thực'),
    ('BUS_PICKUP', r'đưa đón|đón (khách|tiễn)'),
    ('MOTORBIKE_RENTAL', r'thuê xe máy|cho thuê xe'),
    ('BBQ_AREA', r'bbq|lửa trại'),
    ('FIREPLACE', r'lò sưởi|bếp lửa'),
]


def amenities_of(text):
    t = (text or '').lower()
    return [code for code, pat in AMENITY_RULES if re.search(pat, t)]


# --------------------------------------------------------------------------------------------- dựng dữ liệu

class Builder:
    def __init__(self, maps_enabled):
        self.wb = openpyxl.load_workbook(XLSX)
        self.maps_cache = load_cache()
        self.maps_enabled = maps_enabled
        self.places = {}          # key -> place dict
        self.order = []
        self.festivals = []
        self.coverage = []        # {sheet,row,name,outcome,ref,note}
        self.slugs = set()
        self.unmapped = []
        self.pending_moves = []   # (place, link, info) link Google Maps khớp tên một cơ sở khác
        self.expected_rows = {}   # sheet -> set(row) cần có kết cục

    # ---- coverage
    def expect(self, sheet, rows):
        self.expected_rows.setdefault(sheet, set()).update(rows)

    def cov(self, sheet, row, name, outcome, ref=None, note=None):
        self.coverage.append({'sheet': sheet, 'row': row, 'name': name, 'outcome': outcome, 'ref': ref, 'note': note})

    # ---- place
    def new_place(self, key, kind, name):
        base = slugify(name)
        slug, i = base, 2
        while slug in self.slugs:
            slug = f'{base}-{i}'
            i += 1
        self.slugs.add(slug)
        p = {
            'key': key, 'kind': kind, 'name': name, 'slug': slug, 'regionCode': None, 'address': None, 'description': None,
            'accessNote': None, 'latitude': None, 'longitude': None, 'altitudeM': None, 'priceRefMin': None, 'priceRefMax': None,
            'priceUnitNote': None, 'googleRating': None, 'sourceName': None, 'sourceUrl': None, 'operationNote': None,
            'contacts': [], 'highlights': [], 'amenities': [], 'homestayProfile': None, 'attractionProfile': None,
            'serviceProfile': None, 'photoFolders': [], 'origins': [], 'notes': [],
            # Lý do KHÔNG công khai ngay (importer giữ ở DRAFT trừ khi chạy với --publish-held); None = công khai như mặc định.
            'holdBack': None,
        }
        self.places[key] = p
        self.order.append(key)
        return p

    @staticmethod
    def add_contact(p, channel, value):
        value = value.strip()
        if value and not any(c['channel'] == channel and c['value'] == value for c in p['contacts']):
            p['contacts'].append({'channel': channel, 'value': value})

    @staticmethod
    def add_highlight(p, typ, content):
        content = (content or '').strip()
        if content and not any(h['type'] == typ and h['content'] == content for h in p['highlights']):
            p['highlights'].append({'type': typ, 'content': content})

    def add_links(self, p, text):
        """Link trong ô -> kênh liên hệ (Facebook / TikTok / Google Maps / website)."""
        for u in urls_in(text):
            self.add_contact(p, classify_url(u), u)

    @staticmethod
    def add_source(p, url):
        urls = [u for u in (p['sourceUrl'] or '').split(' ; ') if u]
        if url not in urls:
            urls.append(url)
        p['sourceUrl'] = ' ; '.join(urls) if urls else None

    def locate(self, p):
        """Đổi link Google Maps của địa điểm thành toạ độ; nhiều link lệch nhau > 300 m thì ghi chú."""
        pts = []
        for c in list(p['contacts']):
            if c['channel'] != 'GOOGLE_MAPS':
                continue
            info = resolve_maps(c['value'], self.maps_cache, self.maps_enabled)
            if not info:
                continue
            outside = not (BOX[0] <= info['lat'] <= BOX[1] and BOX[2] <= info['lng'] <= BOX[3])
            if outside:
                p['contacts'].remove(c)
                p['notes'].append(f'Link Google Maps {c["value"]} trỏ tới "{info.get("name")}" ({info["lat"]},{info["lng"]}) — NGOÀI vùng Mù Cang Chải, đã bỏ link và toạ độ này (link trong file nguồn có thể sai)')
                continue
            if info.get('name') and not names_agree(info['name'], p['name']):
                p['contacts'].remove(c)
                self.pending_moves.append((p, c['value'], info))
                continue
            pts.append((info['lat'], info['lng'], info.get('name')))
        if not pts:
            return
        p['latitude'], p['longitude'] = round(pts[0][0], 6), round(pts[0][1], 6)
        if pts[0][2]:
            p['notes'].append(f'Google Maps ghi tên cơ sở: "{pts[0][2]}"')
        for q in pts[1:]:
            d = km(pts[0][:2], q[:2])
            if d > 0.3:
                p['notes'].append(f'Hai link Google Maps lệch nhau {d:.1f} km (lấy link đầu tiên)')
        if not (21.5 <= p['latitude'] <= 22.3 and 103.7 <= p['longitude'] <= 104.7):
            p['notes'].append(f'Toạ độ {p["latitude"]},{p["longitude"]} nằm ngoài vùng Mù Cang Chải - Tú Lệ, cần kiểm tra')

    # ===================================================================== HOMESTAY
    def homestays(self):
        ws1 = self.wb['Homestay ']
        ws2 = self.wb['Homestay reviewer']
        S1, S2 = 'Homestay', 'Homestay reviewer'
        self.expect(S1, range(2, 22))
        self.expect(S2, range(3, 20))
        rows1 = {r: cell(ws1, 'B', r) for r in range(2, 22)}
        rows2 = {r: cell(ws2, 'B', r) for r in range(3, 20)}
        # tên canonical: sheet reviewer đặt tên đầy đủ hơn cho Big View
        canon2 = {'Mù Cang Chải Big View Homestay': 'Mù Cang Chải Big View Homestay'}

        merged = {}  # norm(name) -> (sheet1_row, sheet2_row)
        for r, n in rows1.items():
            merged.setdefault(norm(n), [None, None])[0] = r
        for r, n in rows2.items():
            merged.setdefault(norm(n), [None, None])[1] = r

        for nn, (r1, r2) in merged.items():
            name = rows2[r2] if r2 else rows1[r1]
            name = canon2.get(name, name)
            p = self.new_place(f'hs:{slugify(name)}', 'HOMESTAY', name)
            origins = []
            notes = p['notes']
            region = HOMESTAY_REGION[name]
            p['regionCode'] = R[region]
            pro, con, tips = [], [], []
            desc_lines, suit, view, amen_text, price_text = [], '', '', '', ''
            room_line = cap_line = ''
            src_names = []

            if r1:  # sheet "Homestay"
                origins.append({'sheet': S1, 'row': r1})
                p['address'] = cell(ws1, 'C', r1) or None
                price_text = cell(ws1, 'E', r1)
                room_line, cap_line = cell(ws1, 'F', r1), cell(ws1, 'G', r1)
                amen_text = cell(ws1, 'H', r1)
                style = cell(ws1, 'I', r1)
                view = cell(ws1, 'J', r1)
                suit = cell(ws1, 'K', r1)
                pro += split_items(cell(ws1, 'L', r1))
                con += split_items(cell(ws1, 'M', r1))
                p['_phones'] = phones_in(raw_cell(ws1, 'N', r1), notes, f'{S1} dòng {r1}')
                self.add_links(p, cell(ws1, 'O', r1))
                self.add_links(p, cell(ws1, 'P', r1))
                if style:
                    desc_lines.append(style)
                src_names.append(f'{S1} (hàng {r1})')
            if r2:  # sheet "Homestay reviewer" — bản đã kiểm tra thực tế, ưu tiên khi hai bên khác nhau
                origins.append({'sheet': S2, 'row': r2})
                addr2 = cell(ws2, 'C', r2)
                if addr2:
                    if p['address'] and norm(addr2) != norm(p['address']):
                        notes.append(f'Địa chỉ ở sheet "Homestay": "{p["address"]}" (khác sheet reviewer, lấy sheet reviewer)')
                    p['address'] = addr2
                price2 = cell(ws2, 'D', r2)
                if price2:
                    if price_text and norm(price_text) != norm(price2):
                        notes.append(f'Giá ở sheet "Homestay": "{price_text}"')
                    price_text = price2
                room2, cap2, amen2 = cell(ws2, 'E', r2), cell(ws2, 'F', r2), cell(ws2, 'G', r2)
                if room2 and room2 != room_line:
                    room_line = (room_line + ' | ' if room_line else '') + room2
                if cap2 and cap2 != cap_line:
                    cap_line = (cap_line + ' | ' if cap_line else '') + cap2
                if amen2 and amen2 != amen_text:
                    amen_text = (amen_text + ' ; ' if amen_text else '') + amen2
                style2 = cell(ws2, 'H', r2)
                if style2 and style2 not in desc_lines:
                    desc_lines.append(style2)
                view2 = cell(ws2, 'I', r2)
                if view2 and view2 != view:
                    view = (view + '\n' if view else '') + view2
                fix = REVIEWER_COLUMN_FIX.get(name)
                if fix:
                    notes.append('Cột Ưu điểm / Hạn chế / Phù hợp trong file nguồn bị lệch; đã sắp lại theo nội dung')
                    for col in fix['pro']:
                        pro += split_items(cell(ws2, col, r2), r'[;\n]')
                    for col in fix['con']:
                        con += split_items(cell(ws2, col, r2), r'[;\n]')
                else:
                    sj = cell(ws2, 'J', r2)
                    if sj and sj not in suit:
                        suit = (suit + '\n' if suit else '') + sj
                    pro += split_items(cell(ws2, 'K', r2))
                    con += split_items(cell(ws2, 'L', r2))
                self.add_contact(p, 'GOOGLE_MAPS', (urls_in(cell(ws2, 'M', r2)) or [''])[0])
                p['_phones'] = list(dict.fromkeys(p.get('_phones', []) + phones_in(raw_cell(ws2, 'N', r2), notes, f'{S2} dòng {r2}')))
                srcs = cell(ws2, 'O', r2)
                for u in urls_in(srcs):
                    if classify_url(u) in ('FACEBOOK', 'TIKTOK') and '/groups/' not in u:
                        self.add_contact(p, classify_url(u), u)
                    else:
                        self.add_source(p, u)
                chk = cell(ws2, 'P', r2)
                src_names.append(f'{S2} (hàng {r2}' + (f', kiểm tra {chk}' if chk else '') + ')')

            for ph in p.pop('_phones', []):
                self.add_contact(p, 'PHONE', ph)

            if view:
                p['homestayProfile'] = {'viewHighlight': view}
            p['homestayProfile'] = p['homestayProfile'] or {}
            if suit:
                p['homestayProfile']['suitability'] = suit
            if amen_text:
                p['homestayProfile']['otherAmenities'] = amen_text
            lines = list(desc_lines)
            if room_line:
                lines.append(f'Loại phòng: {room_line}')
            if cap_line:
                lines.append(f'Sức chứa: {cap_line}')
            if price_text:
                lines.append(f'Giá tham khảo: {price_text}')
            p['description'] = '\n'.join(lines) or None
            mn, mx, unit = price_of(price_text, 'đêm')
            p['priceRefMin'], p['priceRefMax'], p['priceUnitNote'] = mn, mx, unit
            if price_text and mn is None:
                notes.append(f'Giá "{price_text}" không phải VND nên chưa điền giá tham khảo (đã ghi trong mô tả)')
            for it in pro:
                self.add_highlight(p, 'PRO', it)
            for it in con:
                self.add_highlight(p, 'CON', it)
            p['amenities'] = amenities_of(amen_text)
            alt = re.search(r'độ cao\s*~?\s*([\d.]+)\s*m', p['address'] or '')
            if alt:
                p['altitudeM'] = int(alt.group(1).replace('.', ''))
            p['sourceName'] = f'{SOURCE_FILE} › ' + ' + '.join(src_names)
            p['origins'] = origins
            self.locate(p)
            if r1 and r2:
                notes.append('Có mặt ở cả hai sheet "Homestay" và "Homestay reviewer" — đã gộp thành một')
            for o in origins:
                self.cov(o['sheet'], o['row'], name, 'created' if len(origins) == 1 else 'merged', p['key'],
                         'gộp với dòng của sheet còn lại' if len(origins) > 1 else None)

    # ===================================================================== NHÀ HÀNG
    def restaurants(self):
        wsA, wsB = self.wb['Nhà hàng'], self.wb['Nhà hàng reviewer']
        SA, SB = 'Nhà hàng', 'Nhà hàng reviewer'
        self.expect(SA, range(2, 15))
        self.expect(SB, range(5, 15))
        # (canonical name, sheet A rows, sheet B row, vùng, ghi chú)
        spec = [
            ('Nhà hàng Quyền Hường', [2], 12, 'TT', None),
            ('Quán Mạnh Thơm', [3], 13, 'TT', 'Còn gọi: Nhà Sàn Quán Mạnh Thơm'),
            ('Nhà hàng Tuấn Thúy', [4, 13], None, 'TT', None),
            ('Nhà hàng Thắng Dung', [5], None, 'TT', None),
            ('Nhà hàng Hằng Béo', [6], None, 'TT', None),
            ('Nhà hàng A Tân Quán', [7], 7, 'TT', None),
            ('Nhà hàng Thùy Linh', [8], 9, 'TT', None),
            ('Nhà hàng Vườn Đào', [9], None, 'TT', None),
            ('Nhà hàng Thành Oanh', [10], 14, 'TT', 'Còn gọi: Nhà hàng Thành Oanh Thắng Cố Ngựa'),
            ('Nhà hàng Nguyệt Thắng', [11], None, 'TT', None),
            ('Quán Thuật Hà', [12], None, 'TT', None),
            ('Quán con khỉ', [14], None, 'HUYEN', None),
            ('Cơm Phở Lục Hường', [], 5, 'PL', None),
            ('Cafe Mâm Xôi', [], 6, 'LPT', 'Còn gọi: Cf Mâm Xôi (Café Mâm Xôi)'),
            ('Vua Xứ Mù Cafe', [], 8, 'TT', None),
            ('View Gió (Gió Quán)', [], 10, 'HUYEN', 'Quán cà phê có kèm homestay'),
            ('Nhà hàng Hương Ly', [], 11, 'TT', None),
        ]
        for name, ra, rb, region, alias in spec:
            p = self.new_place(f'rs:{slugify(name)}', 'RESTAURANT', name)
            p['regionCode'] = R[region]
            notes = p['notes']
            origins, srcs = [], []
            desc, price_text, phones, ratings = [], '', [], []
            if alias:
                desc.append(alias)
            for r in ra:
                origins.append({'sheet': SA, 'row': r})
                srcs.append(f'{SA} (hàng {r})')
                orig_name = cell(wsA, 'A', r)
                if norm(orig_name) != norm(name):
                    notes.append(f'Tên ở sheet "{SA}": "{orig_name}"')
                addr = cell(wsA, 'B', r)
                if addr and not p['address']:
                    p['address'] = addr
                phones += phones_in(raw_cell(wsA, 'C', r), notes, f'{SA} dòng {r}')
                pt = cell(wsA, 'D', r)
                if pt:
                    price_text = price_text or pt
                rt = cell(wsA, 'E', r)
                if rt:
                    ratings.append(rating_of(rt))
                note = cell(wsA, 'F', r)
                # Ghi chú của người rà soát chỉ đưa vào cảnh báo (báo cáo), KHÔNG vào mô tả / ghi chú vận hành vì hai trường đó có thể hiện công khai.
                if note and r == 6:
                    p['holdBack'] = 'Người rà soát ghi "Không có" — nghi cơ sở không còn / không tồn tại, cần xác minh trước khi cho khách thấy'
                    notes.append(f'Người rà soát ghi "{note}" — nghi cơ sở không còn / không tồn tại, cần xác minh trước khi dùng '
                                 '(Luận Còi, Cường Hạnh chỉ được nhắc tên, chưa có dữ liệu nên chưa tạo)')
                if note and r == 13:
                    notes.append(f'Dòng "Quán Ăn Mu Cang Chai" (QL32) được người rà soát ghi chú là "{note}" — gộp vào đây')
            if rb:
                origins.append({'sheet': SB, 'row': rb})
                srcs.append(f'{SB} (hàng {rb})')
                typ = cell(wsB, 'B', rb)
                addr = cell(wsB, 'D', rb)
                if addr:
                    if p['address'] and norm(addr) != norm(p['address']):
                        notes.append(f'Địa chỉ ở sheet "{SA}": "{p["address"]}"')
                    p['address'] = addr
                pt = cell(wsB, 'E', rb)
                if pt and pt.lower() != 'chưa xác minh':
                    if price_text and norm(price_text) != norm(pt):
                        notes.append(f'Khoảng giá ở sheet "{SA}": "{price_text}" (lấy sheet reviewer)')
                    price_text = pt
                hl = cell(wsB, 'F', rb)
                if typ:
                    desc.insert(0, f'Loại hình: {typ}.')
                if hl:
                    desc.append(hl)
                rt = cell(wsB, 'G', rb)
                if rt:
                    ratings.append(rating_of(rt))
                src = cell(wsB, 'H', rb)
                for u in urls_in(src):
                    self.add_source(p, u)
                phones += phones_in(raw_cell(wsB, 'I', rb), notes, f'{SB} dòng {rb}')
                g = urls_in(cell(wsB, 'J', rb))
                if g:
                    self.add_contact(p, 'GOOGLE_MAPS', g[0])
                for u in urls_in(cell(wsB, 'K', rb)):
                    self.add_contact(p, classify_url(u), u)
                if m := re.search(r'ĐT:\s*([\d. ]+)', addr or ''):
                    phones += phones_in(m.group(1), notes, f'{SB} dòng {rb}')
            for ph in dict.fromkeys(phones):
                self.add_contact(p, 'PHONE', ph)
            p['description'] = '\n'.join(desc) or None
            mn, mx, unit = price_of(price_text, 'người' if 'người' in price_text else None)
            p['priceRefMin'], p['priceRefMax'] = mn, mx
            p['priceUnitNote'] = unit
            vals = [x for x in ratings if x]
            p['googleRating'] = vals[-1] if vals else None
            p['sourceName'] = f'{SOURCE_FILE} › ' + ' + '.join(srcs)
            p['origins'] = origins
            self.locate(p)
            # địa chỉ có "(ĐT: ...)" -> bỏ phần điện thoại khỏi địa chỉ
            if p['address']:
                p['address'] = re.sub(r'\s*\(ĐT:[^)]*\)', '', p['address']).strip()
            for o in origins:
                self.cov(o['sheet'], o['row'], name, 'created' if len(origins) == 1 else 'merged', p['key'],
                         'gộp với dòng của sheet còn lại / dòng trùng' if len(origins) > 1 else None)

    # ===================================================================== DI CHUYỂN
    def transport(self):
        wsA, wsB = self.wb['Di chuyển'], self.wb['Di chuyển reviewer']
        SA, SB = 'Di chuyển', 'Di chuyển reviewer'
        self.expect(SA, range(2, 16))
        self.expect(SB, range(5, 14))

        def bus(name, rows, vehicle, seats=None, group='INTERCITY_BUS', region='HUYEN'):
            p = self.new_place(f'tr:{slugify(name)}', 'TRANSPORT', name)
            p['regionCode'] = R[region]
            p['origins'] = [{'sheet': SA, 'row': r} for r in rows]
            p['sourceName'] = f'{SOURCE_FILE} › ' + ' + '.join(f'{SA} (hàng {r})' for r in rows)
            desc, prices, times, phones, routes, dur = [], [], [], [], [], None
            for r in rows:
                price = cell(wsA, 'C', r)
                prices.append(price)
                t = cell(wsA, 'D', r)
                dur = dur or minutes_of(t)
                if t:
                    desc.append(f'Thời gian di chuyển: {t}')
                typ = cell(wsA, 'B', r)
                if typ:
                    desc.append(f'Loại hình: {typ}')
                route = cell(wsA, 'E', r)
                if route:
                    routes.append(route)
                    desc.append(f'Tuyến đường: {route}')
                phones += phones_in(raw_cell(wsA, 'F', r), p['notes'], f'{SA} dòng {r}')
                h = cell(wsA, 'H', r)
                if h:
                    times.append(h)
                if price:
                    desc.append(f'Giá vé: {price}')
            for ph in dict.fromkeys(phones):
                self.add_contact(p, 'PHONE', ph)
            nums = [n for pr in prices for n in money_vnd(pr)]
            if nums:
                p['priceRefMin'], p['priceRefMax'] = min(nums), max(nums)
                p['priceUnitNote'] = price_unit(' '.join(prices)) or 'vé'
            p['description'] = '\n'.join(dict.fromkeys(desc)) or None
            p['serviceProfile'] = {
                'serviceGroup': group, 'vehicleType': cell(wsA, 'B', rows[0]) or None, 'routeFrom': None, 'routeTo': None,
                'departureTimes': ' ; '.join(times) or None, 'durationMinutes': dur, 'seats': seats, 'groupSizeMax': None,
                'languages': None, 'includes': None,
            }
            if group == 'INTERCITY_BUS':
                p['serviceProfile'].update({'routeFrom': 'Hà Nội', 'routeTo': 'Mù Cang Chải'})
            for r in rows:
                self.cov(SA, r, cell(wsA, 'A', r), 'created' if len(rows) == 1 else 'merged', p['key'],
                         'cùng tên nhà xe, gộp thành một (nhiều số điện thoại)' if len(rows) > 1 else None)
            return p

        hn = bus('Hà Trang (Lai Châu)', [2], 'Giường nằm 42 phòng', seats=42)
        bus('Sơn Phương', [3], 'Giường nằm')
        bus('Hưng Thành (Lai Châu)', [4], 'Giường nằm')
        bus('Cường Lan', [5, 8], 'Giường nằm / Limousine')
        bus('Anh Khang Authentic', [6], 'Limousine 9 chỗ', seats=9)
        bus('Gia Khánh', [7], 'Có chuyến đêm')
        bus('Nam Thắng Limousine', [9], 'Ghế massage')
        bus('Golden Limousine', [10], 'Limousine')
        bus('An Bình Limousine', [11], 'Mức giá thấp hơn')
        for r, to in [(12, None), (13, 'Chế Cu Nha'), (14, 'Chế Tạo'), (15, 'Nậm Có')]:
            g = bus(cell(wsA, 'A', r), [r], '5–7 chỗ', seats=7, group='SHARED_CAR')
            g['serviceProfile'].update({'routeFrom': 'Hà Nội', 'routeTo': to or 'Mù Cang Chải'})
        # chuẩn hóa tên xe ghép cho đồng nhất
        # Dịch vụ đặt vé xe khách chiều về (sheet Dịch vụ reviewer) và SĐT Hà Trang (sheet Di chuyển reviewer) thuộc nhà xe Hà Trang
        wsS = self.wb['Dịch vụ reviewer']
        self.expect('Dịch vụ reviewer', range(5, 18))
        hn['origins'].append({'sheet': 'Dịch vụ reviewer', 'row': 14})
        hn['sourceName'] += ' + Dịch vụ reviewer (hàng 14) + Di chuyển reviewer (hàng 9)'
        self.add_contact(hn, 'PHONE', '1900888684')
        self.add_contact(hn, 'PHONE', '0967884582')
        hn['description'] += ('\nVăn phòng tại Mù Cang Chải: Ngân hàng Agribank, QL32, thị trấn Mù Cang Chải (hotline tổng đài 1900 888 684; '
                              'văn phòng 0967 884 582).\nCó dịch vụ giữ chỗ vé xe khách lượt về từ Mù Cang Chải / Ngã ba Kim về Hà Nội '
                              + f'(giá tham khảo {cell(wsS, "E", 14)}).')
        self.add_highlight(hn, 'PRO', cell(wsS, 'F', 14))
        self.add_highlight(hn, 'CON', cell(wsS, 'G', 14))
        self.add_highlight(hn, 'PAIN_POINT', cell(wsS, 'H', 14))
        self.add_source(hn, cell(wsS, 'I', 14))
        hn['notes'].append('Gộp dịch vụ "Đặt trước vé xe khách chiều về Hà Nội" (sheet Dịch vụ reviewer) và SĐT trong sheet Di chuyển reviewer')
        self.cov('Dịch vụ reviewer', 14, 'Đặt trước vé Xe khách chiều về Hà Nội', 'merged', hn['key'], 'là dịch vụ của nhà xe Hà Trang')

        def rev(row, name, group, region, kind='TRANSPORT'):
            p = self.new_place(f'tr:{slugify(name)}', kind, name)
            p['regionCode'] = R[region]
            p['origins'] = [{'sheet': SB, 'row': row}]
            p['sourceName'] = f'{SOURCE_FILE} › {SB} (hàng {row})'
            p['description'] = cell(wsB, 'D', row) or None
            price = cell(wsB, 'E', row)
            if price and 'Phụ thu' not in price:
                mn, mx, unit = price_of(price)
                p['priceRefMin'], p['priceRefMax'], p['priceUnitNote'] = mn, mx, unit
            elif price:
                p['description'] += f'\nGiá: {price}'
            self.add_highlight(p, 'PRO', cell(wsB, 'F', row))
            self.add_highlight(p, 'CON', cell(wsB, 'G', row))
            self.add_highlight(p, 'PAIN_POINT', cell(wsB, 'H', row))
            for col in 'IJ':
                v = cell(wsB, col, row)
                for u in urls_in(v):
                    self.add_source(p, u)
                if v and not urls_in(v):
                    p['sourceName'] += f' · nguồn: {v}'
            dist, time_txt, contact = cell(wsB, 'K', row), cell(wsB, 'L', row), cell(wsB, 'M', row)
            if dist and 'Không áp dụng' not in dist:
                p['description'] += f'\nQuãng đường: {dist}'
            if time_txt and 'Không áp dụng' not in time_txt:
                p['description'] += f'\nThời gian: {time_txt}'
            ph = phones_in(contact, p['notes'], f'{SB} dòng {row}') if re.search(r'\d{4}', contact or '') else []
            for x in ph:
                self.add_contact(p, 'PHONE', x)
            if contact:
                p['description'] += f'\nLiên hệ: {contact}'
            p['serviceProfile'] = {
                'serviceGroup': group, 'vehicleType': None, 'routeFrom': None, 'routeTo': None, 'departureTimes': None,
                'durationMinutes': minutes_of(time_txt), 'seats': None, 'groupSizeMax': None, 'languages': None, 'includes': None,
            }
            self.cov(SB, row, name, 'created', p['key'])
            return p

        rev(5, 'Xe ôm lên Đồi Móng Ngựa', 'LOCAL_MOTO', 'TT')
        rev(6, 'Xe ôm lên Đồi Mâm Xôi (La Pán Tẩn)', 'LOCAL_MOTO', 'LPT')
        rev(7, 'Xe ôm đi các điểm ruộng bậc thang qua homestay đặt hộ', 'TOUR_MOTO', 'HUYEN')
        h4 = rev(8, 'Thuê xe máy tự lái (Thị trấn / Ngã Ba Kim)', 'SELF_DRIVE', 'PL')
        h4['serviceProfile']['vehicleType'] = 'Xe số / xe tay ga (Wave, Sirius, Winner)'
        h5 = rev(9, 'Xe khách giường nằm Hà Nội – Mù Cang Chải (tổng hợp các nhà xe)', 'INTERCITY_BUS', 'HUYEN')
        h5['serviceProfile'].update({'routeFrom': 'Hà Nội', 'routeTo': 'Mù Cang Chải', 'vehicleType': 'Giường nằm'})
        h5['notes'].append('Dòng tổng hợp nhiều nhà xe (Khánh Thủy, Cường Lan, Hà Trang...). Khánh Thủy chỉ được nhắc tên, chưa có SĐT nên chưa tạo riêng')
        rev(10, 'Xe ôm vào Rừng trúc Nà Háng Tủa', 'LOCAL_MOTO', 'PL')
        rev(11, 'Xe trung chuyển Ngã 3 Kim – Ngã 3 Ba Nhà', 'LOCAL_MOTO', 'PL')
        rev(12, 'Thuê xe ô tô bán tải / 2 cầu có tài xế', 'SHARED_CAR', 'HUYEN')
        rev(13, 'Xe ôm ghép đoàn phượt đường dài', 'TOUR_MOTO', 'HUYEN')
        # Hà Trang trong sheet reviewer nêu SĐT -> đã gộp ở trên; ghi kết cục dòng 9 theo nhà xe
        for c in self.coverage:
            if c['sheet'] == SB and c['row'] == 9:
                c['note'] = 'dòng tổng hợp; SĐT Hà Trang đã gộp vào nhà xe Hà Trang'

    # ===================================================================== DỊCH VỤ / ĐIỂM ĐẾN NGOÀI
    def services(self):
        ws = self.wb['Dịch vụ reviewer']
        S = 'Dịch vụ reviewer'
        # (dòng, tên, kind, service_group|None, vùng)
        spec = [
            (5, 'Bay dù lượn "Bay trên mùa vàng" (Đèo Khau Phạ)', 'CULTURE', 'ADVENTURE', 'CP'),
            (6, 'Thuê thợ chụp ảnh & trang phục dân tộc', 'PHOTO', None, 'HUYEN'),
            (7, 'Quay / thuê flycam tại điểm ngắm lúa', 'PHOTO', None, 'HUYEN'),
            (8, 'Ngâm chân lá thuốc thảo mộc', 'SERVICE', None, 'TT'),
            (9, 'Gửi hành lý / xe máy tại chân dốc', 'SERVICE', None, 'HUYEN'),
            (10, 'Cứu hộ xe máy khẩn cấp trên đèo', 'SERVICE', None, 'CP'),
            (11, 'Thuê porter / hướng dẫn viên trekking', 'CULTURE', 'TREKKING', 'HUYEN'),
            (12, 'Đặt tiệc / đốt lửa trại & múa xòe', 'CULTURE', 'CULTURE', 'HUYEN'),
            (13, 'Dịch vụ rửa xe máy sau phượt', 'SERVICE', None, 'HUYEN'),
            (15, 'Thuê ủng đi mưa / áo mưa tại chân dốc', 'SERVICE', None, 'HUYEN'),
        ]
        for row, name, kind, group, region in spec:
            p = self.new_place(f'sv:{slugify(name)}', kind, name)
            p['regionCode'] = R[region]
            p['origins'] = [{'sheet': S, 'row': row}]
            p['sourceName'] = f'{SOURCE_FILE} › {S} (hàng {row})'
            p['description'] = cell(ws, 'D', row) or None
            price = cell(ws, 'E', row)
            mn, mx, unit = price_of(price)
            p['priceRefMin'], p['priceRefMax'], p['priceUnitNote'] = mn, mx, unit
            self.add_highlight(p, 'PRO', cell(ws, 'F', row))
            self.add_highlight(p, 'CON', cell(ws, 'G', row))
            self.add_highlight(p, 'PAIN_POINT', cell(ws, 'H', row))
            for u in urls_in(cell(ws, 'I', row)):
                self.add_source(p, u)
            provider = cell(ws, 'J', row)
            if provider:
                p['description'] = (p['description'] or '') + f'\nĐơn vị / cá nhân cung cấp: {provider}'
            if group:
                p['serviceProfile'] = {'serviceGroup': group, 'vehicleType': None, 'routeFrom': None, 'routeTo': None,
                                       'departureTimes': None, 'durationMinutes': None, 'seats': None, 'groupSizeMax': None,
                                       'languages': None, 'includes': provider or None}
            self.cov(S, row, name, 'created', p['key'])

        # Hai dòng thực chất là ĐIỂM ĐẾN (đặt nhầm nhóm "Dịch vụ"): Tà Xùa (Trạm Tấu) và bể khoáng Cường Hải
        a1 = self.new_place('at:da-xua-tram-tau', 'ATTRACTION', 'Đỉnh Tà Xùa (Trạm Tấu, Yên Bái)')
        a1['origins'] = [{'sheet': S, 'row': 16}]
        a1['sourceName'] = f'{SOURCE_FILE} › {S} (hàng 16, ghi trong nhóm "Dịch vụ" nhưng là điểm đến)'
        a1['description'] = cell(ws, 'D', 16)
        a1['address'] = 'Huyện Trạm Tấu, Yên Bái (ngoài địa bàn Mù Cang Chải)'
        a1['priceRefMin'], a1['priceRefMax'], a1['priceUnitNote'] = 50000, 1200000, 'gói porter'
        self.add_highlight(a1, 'PRO', cell(ws, 'F', 16))
        self.add_highlight(a1, 'CON', cell(ws, 'G', 16))
        self.add_highlight(a1, 'PAIN_POINT', cell(ws, 'H', 16))
        for u in urls_in(cell(ws, 'I', 16)):
            self.add_source(a1, u)
        a1['description'] += '\nĐơn vị / cá nhân cung cấp: ' + cell(ws, 'J', 16)
        a1['attractionProfile'] = {'needs': 'adventure', 'suitableSessions': 'MORNING'}
        a1['notes'].append('Giá "50.000đ - 1.200.000đ/gói porter" lấy nguyên từ file (khoảng rất rộng)')
        self.cov(S, 16, 'Trạm Tấu-Yên Bái (Tà Xùa)', 'created', a1['key'], 'thực chất là điểm đến')

        a2 = self.new_place('at:be-khoang-nong-cuong-hai', 'ATTRACTION', 'Bể khoáng nóng Cường Hải')
        a2['origins'] = [{'sheet': S, 'row': 17}]
        a2['sourceName'] = f'{SOURCE_FILE} › {S} (hàng 17, ghi trong nhóm "Dịch vụ" nhưng là điểm đến)'
        a2['description'] = cell(ws, 'D', 17) + '\nĐơn vị cung cấp: ' + cell(ws, 'J', 17)
        a2['address'] = 'Xã Hạnh Phúc, phường Yên Bái, Lào Cai'
        a2['priceRefMin'], a2['priceRefMax'], a2['priceUnitNote'] = 50000, 120000, 'vé (xem mô tả)'
        a2['description'] += '\nGiá vé: ' + cell(ws, 'E', 17).replace('\n', '; ')
        self.add_highlight(a2, 'PRO', cell(ws, 'F', 17))
        self.add_highlight(a2, 'CON', cell(ws, 'G', 17))
        for u in urls_in(cell(ws, 'I', 17)):
            self.add_source(a2, u)
        a2['attractionProfile'] = {'needs': 'enjoy', 'suitableSessions': None}
        self.cov(S, 17, 'Lào Cai (Bể khoáng nóng Cường Hải)', 'created', a2['key'], 'thực chất là điểm đến')

    # ===================================================================== VĂN HÓA
    def culture(self):
        ws = self.wb['Văn hóa']
        S = 'Văn hóa'
        self.expect(S, list(range(2, 7)) + list(range(10, 15)) + list(range(18, 23)) + list(range(26, 30)))
        minutes = {'1–2 giờ': 120, '2–3 giờ': 180, '1–3 giờ': 180, 'Nửa ngày–1 ngày': 480, '1–2 ngày': 2880,
                   '1 ngày': 480, 'Nửa ngày': 240, '2 ngày 1 đêm': 2880, '3 ngày 2 đêm': 4320}
        # --- lễ hội / sự kiện -> bảng festival
        for r in range(2, 7):
            name = cell(ws, 'A', r)
            exp = [f'Trải nghiệm du lịch phù hợp: {cell(ws, "D", r)}', f'Nhóm khách phù hợp: {cell(ws, "E", r)}',
                   f'Dịch vụ có thể bán: {cell(ws, "F", r)}']
            self.festivals.append({
                'key': f'fe:{slugify(name)}', 'slug': slugify(name), 'name': name, 'seasonNote': cell(ws, 'B', r),
                'coreValue': cell(ws, 'C', r), 'suitableExperience': '\n'.join(exp), 'etiquetteDont': cell(ws, 'G', r),
                'regionCode': R['HUYEN'], 'origins': [{'sheet': S, 'row': r}],
            })
            self.cov(S, r, name, 'created', f'fe:{slugify(name)}', 'bảng festival')
        # --- tài nguyên văn hóa -> trải nghiệm (place kind CULTURE)
        res_group = {'Khèn Mông': 'CULTURE', 'Thổ cẩm/vẽ sáp ong': 'CRAFT', 'Ruộng bậc thang': 'TREKKING',
                     'Ẩm thực vùng cao': 'CUISINE', 'Bản làng & sinh hoạt cộng đồng': 'CULTURE'}
        for r in range(10, 15):
            name = cell(ws, 'A', r)
            p = self.new_place(f'cu:{slugify(name)}', 'CULTURE', f'{name} (trải nghiệm văn hóa)')
            p['regionCode'] = R['HUYEN']
            p['origins'] = [{'sheet': S, 'row': r}]
            p['sourceName'] = f'{SOURCE_FILE} › {S} › Tài nguyên văn hóa (hàng {r})'
            p['description'] = '\n'.join([cell(ws, 'B', r), f'Hình thức du lịch: {cell(ws, "C", r)}',
                                          f'Chủ thể cung cấp: {cell(ws, "F", r)}'])
            self.add_highlight(p, 'TIP', f'Yêu cầu bảo tồn: {cell(ws, "G", r)}')
            self.add_highlight(p, 'TIP', f'Khả năng kết hợp: {cell(ws, "H", r)}')
            p['serviceProfile'] = {'serviceGroup': res_group[name], 'vehicleType': None, 'routeFrom': None, 'routeTo': None,
                                   'departureTimes': None, 'durationMinutes': minutes.get(cell(ws, 'D', r)),
                                   'seats': None, 'groupSizeMax': None, 'languages': None,
                                   'includes': cell(ws, 'E', r)[:1000] or None}
            self.cov(S, r, name, 'created', p['key'], 'trải nghiệm văn hóa (place kind CULTURE)')
        # --- sản phẩm gợi ý -> trải nghiệm
        prod_group = {'Một ngày cùng ruộng bậc thang': 'FARM', 'Khèn và sắc chàm': 'CRAFT', 'Mùa lễ hội bản địa': 'CULTURE',
                      'Mù Cang Chải sống chậm': 'CULTURE'}
        for r in range(26, 30):
            name = cell(ws, 'A', r)
            p = self.new_place(f'cu:{slugify(name)}', 'CULTURE', name)
            p['regionCode'] = R['HUYEN']
            p['origins'] = [{'sheet': S, 'row': r}]
            p['sourceName'] = f'{SOURCE_FILE} › {S} › Sản phẩm gợi ý (hàng {r})'
            p['description'] = '\n'.join([f'Thời lượng: {cell(ws, "B", r)}', f'Lịch trình lõi: {cell(ws, "C", r)}',
                                          f'Giá trị khác biệt: {cell(ws, "D", r)}', f'Đối tác / chủ thể: {cell(ws, "F", r)}'])
            self.add_highlight(p, 'CON', f'Rủi ro cần kiểm soát: {cell(ws, "G", r)}')
            p['serviceProfile'] = {'serviceGroup': prod_group[name], 'vehicleType': None, 'routeFrom': None, 'routeTo': None,
                                   'departureTimes': None, 'durationMinutes': minutes.get(cell(ws, 'B', r)),
                                   'seats': None, 'groupSizeMax': None, 'languages': None,
                                   'includes': cell(ws, 'E', r)[:1000] or None}
            self.cov(S, r, name, 'created', p['key'], 'sản phẩm trải nghiệm (place kind CULTURE)')
        # --- phân khúc khách: tài liệu marketing, không có bảng đích
        for r in range(18, 23):
            name = cell(ws, 'A', r)
            self.unmapped.append({'sheet': S, 'row': r, 'name': name, 'reason': 'Phân khúc khách hàng (tài liệu marketing) — hệ thống không có bảng tương ứng',
                                  'values': {h: cell(ws, c, r) for h, c in zip(['Phân khúc', 'Nhu cầu chính', 'Sản phẩm phù hợp', 'Thông điệp truyền thông', 'Kênh tiếp cận', 'Lưu ý'], 'ABCDEF')}})
            self.cov(S, r, name, 'unmapped', None, 'Phân khúc khách hàng (marketing) — không có bảng đích; giữ nguyên trong dataset.unmapped')

    # ===================================================================== ĐÃ CÓ SẴN
    def existing(self):
        """Dòng Excel trùng với dữ liệu đã có trong hệ thống: điểm đến (12) và đặc sản (15). Importer kiểm chứng với DB."""
        ws = self.wb['Điểm đến']
        S = 'Điểm đến'
        self.expect(S, range(2, 14))
        alias = {
            'Đồi Mâm Xôi': ['Đồi Mâm Xôi (La Pán Tẩn)'], 'Rừng Trúc': ['Rừng Trúc Mồ Dề (Nả Háng Tủa)'],
            'Sống Lưng Khủng Long': ['Sống Lưng Khủng Long (Dế Xu Phình)'],
            'Đồi Kim Nọi - Võng lúa Háng đăng dê': ['Đồi Kim Nọi - Võng lúa Háng Đăng Dê'],
            'Thác Hầu đề': ['Thác Hầu Đề'], 'Hoa đào rừng ( Hoa Tớ Dầy) La Pán Tẩn': ['Rừng hoa đào Tớ Dày La Pán Tẩn'],
        }
        self.existing_refs = []
        for r in range(2, 14):
            name = cell(ws, 'A', r)
            exp = alias.get(name, [name])
            self.existing_refs.append({'kind': 'ATTRACTION', 'sheet': S, 'row': r, 'name': name, 'expectNames': exp})
            self.cov(S, r, name, 'existing', None, 'điểm đến đã có sẵn trong hệ thống (importer kiểm chứng với DB)')
        wd = self.wb['Đặc sản ']
        SD = 'Đặc sản'
        self.expect(SD, range(2, 17))
        dish_alias = {
            'Xôi nếp Tú Lệ / xôi ngũ sắc': 'Xôi nếp Tú Lệ / Xôi ngũ sắc', 'Cá suối nướng': 'Cá suối nướng than hoa',
            'Pa pỉnh tộp': 'Pa pỉnh tộp (Cá gập nướng kiểu Thái)', 'Gà nướng lá mắc mật, nướng mắc khén': 'Gà nướng lá mắc mật & mắc khén',
            'Châu chấu rang': 'Châu chấu rang lá chanh', 'Nhộng ong rừng, sâu tre': 'Nhộng ong rừng, sâu tre xào măng',
            'Măng đắng, rau rừng/cải mèo': 'Măng đắng, rau rừng & Cải mèo', 'Bánh chưng đen': 'Bánh chưng đen Mù Cang Chải',
            'Cốm Tú Lệ': 'Cốm Tú Lệ (Ngọc xanh Tây Bắc)', 'Táo mèo / sơn tra và rượu táo mèo': 'Táo mèo (Sơn tra) & Rượu táo mèo',
            'Mật ong rừng; lạp xưởng; thịt hun khói/gác bếp; nếp Tú Lệ; măng khô': 'Thịt hun khói, Lạp xưởng & Mật ong rừng',
        }
        for r in range(2, 17):
            name = cell(wd, 'B', r)
            self.existing_refs.append({'kind': 'DISH', 'sheet': SD, 'row': r, 'name': name, 'expectNames': [dish_alias.get(name, name)]})
            self.cov(SD, r, name, 'existing', None, 'đặc sản đã có sẵn trong bảng dish (importer kiểm chứng với DB)')

    # ===================================================================== ẢNH
    def images(self):
        self.folders = []
        by_folder = {}
        for root in IMAGE_ROOTS:
            base = os.path.join(REPO, root)
            for folder in sorted(os.listdir(base)):
                fp = os.path.join(base, folder)
                if not os.path.isdir(fp):
                    continue
                imgs, vids = [], []
                for dp, _, fns in os.walk(fp):
                    for fn in fns:
                        ext = os.path.splitext(fn)[1].lower()
                        rel = os.path.relpath(os.path.join(dp, fn), REPO).replace(os.sep, '/')
                        (imgs if ext in IMAGE_EXT else vids if ext in VIDEO_EXT else []).append(rel)
                natural = lambda s: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]  # noqa: E731
                imgs.sort(key=natural)
                vids.sort(key=natural)
                rec = {'folder': f'{root}/{folder}', 'images': imgs, 'videos': vids}
                self.folders.append(rec)
                by_folder[rec['folder']] = rec

        name_to_key = {p['name']: k for k, p in self.places.items()}
        for rec in self.folders:
            f = rec['folder']
            if f in FOLDER_ALIAS:
                target, conf = FOLDER_ALIAS[f]
                p = self.places[name_to_key[target]]
                p['photoFolders'].append(f)
                p['notes'].append(f'Thư mục ảnh "{f}" gắn vào đây — {conf}')
                rec.update({'target': p['key'], 'targetKind': 'new', 'confidence': conf})
            elif f in FOLDER_STUBS:
                if not rec['images']:
                    rec.update({'target': None, 'targetKind': 'empty'})
                    continue
                name = FOLDER_STUBS[f]
                p = self.new_place(f'hs:{slugify(name)}', 'HOMESTAY', name)
                p['regionCode'] = R['HUYEN']
                p['sourceName'] = f'{SOURCE_FILE} (chỉ có thư mục ảnh "{f}", không có dòng dữ liệu)'
                p['photoFolders'].append(f)
                p['origins'] = []
                p['notes'].append('Chỉ có thư mục ảnh, chưa có thông tin nào khác (địa chỉ, giá, liên hệ...) — cần bổ sung')
                p['holdBack'] = 'Chỉ có tên + ảnh, chưa có địa chỉ / giá / liên hệ — bổ sung thông tin rồi mới công khai'
                rec.update({'target': p['key'], 'targetKind': 'stub'})
            elif f in EXISTING_FOLDERS:
                rec.update({'target': None, 'targetKind': 'existing', 'existingName': EXISTING_FOLDERS[f]})
            else:
                rec.update({'target': None, 'targetKind': 'empty' if not rec['images'] else 'unmatched'})

        # nhận xét: các nhà dùng chung ảnh
        # (tính trong importer theo sha256 vì cần đọc nội dung file)

    def reassign_maps(self):
        """Link Google Maps ghi ở dòng này nhưng thực chất là của cơ sở khác (lệch dòng trong file nguồn): chuyển sang đúng cơ sở."""
        for p, link, info in self.pending_moves:
            target = None
            for q in self.places.values():
                if q is not p and q['kind'] == p['kind'] and q['latitude'] is None and name_tokens(q['name']) \
                        and names_agree(info['name'], q['name']) and (name_tokens(info['name']) & name_tokens(q['name'])):
                    target = q
                    break
            if target:
                self.add_contact(target, 'GOOGLE_MAPS', link)
                target['latitude'], target['longitude'] = round(info['lat'], 6), round(info['lng'], 6)
                target['notes'].append(f'Toạ độ & link Google Maps lấy từ dòng "{p["name"]}" trong file nguồn (link ghi ở dòng đó thực chất là của cơ sở này: Google Maps gọi là "{info["name"]}")')
                p['notes'].append(f'Link Google Maps ghi ở dòng này ({link}) thực chất là của "{target["name"]}" (Google Maps: "{info["name"]}"); đã chuyển sang đó, dòng này chưa có toạ độ')
            else:
                p['notes'].append(f'Link Google Maps {link} trỏ tới "{info["name"]}" — không khớp tên cơ sở, đã bỏ link và toạ độ này')

    # ===================================================================== kiểm tra độ phủ
    HEADER_ROWS = {
        'Homestay ': {1}, 'Homestay reviewer': {1, 2}, 'Đặc sản ': {1}, 'Điểm đến': {1}, 'Di chuyển': {1}, 'Nhà hàng': {1},
        'Văn hóa': {1, 9, 17, 25}, 'Nhà hàng reviewer': {1, 4}, 'Dịch vụ reviewer': {1, 4}, 'Di chuyển reviewer': {1, 4},
    }
    SHEET_ALIAS = {'Homestay ': 'Homestay', 'Đặc sản ': 'Đặc sản'}

    def verify_coverage(self):
        problems = []
        seen = {}
        for c in self.coverage:
            seen.setdefault(c['sheet'], set()).add(c['row'])
        # đối chiếu độc lập với nội dung file: dòng nào có ô khác rỗng (ngoài dòng tiêu đề) mà chưa có kết cục thì báo
        for title, headers in self.HEADER_ROWS.items():
            ws = self.wb[title]
            sheet = self.SHEET_ALIAS.get(title, title)
            for row in ws.iter_rows():
                r = row[0].row
                if r in headers:
                    continue
                if any(c.value is not None and str(c.value).strip() != '' for c in row) and r not in seen.get(sheet, set()):
                    problems.append(f'{sheet}: dòng {r} có dữ liệu nhưng không có kết cục')
        # dòng thuộc bảng "Nhà hàng"/"Di chuyển" ... có ô dữ liệu nhưng chưa có kết cục
        for sheet, rows in self.expected_rows.items():
            missing = sorted(set(rows) - seen.get(sheet, set()))
            if missing:
                problems.append(f'{sheet}: dòng chưa có kết cục: {missing}')
        return problems

    def run(self):
        self.homestays()
        self.restaurants()
        self.transport()
        self.services()
        self.culture()
        self.existing()
        self.reassign_maps()
        self.images()
        for k in self.order:
            p = self.places[k]
            p['notes'] = list(dict.fromkeys(p['notes']))
        problems = self.verify_coverage()
        json.dump(self.maps_cache, open(MAPS_CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
        return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-maps', action='store_true', help='không gọi mạng để đổi link Google Maps thành toạ độ (chỉ dùng maps_cache.json)')
    args = ap.parse_args()
    b = Builder(maps_enabled=not args.no_maps)
    problems = b.run()
    ds = {
        'meta': {'source': SOURCE_FILE, 'builtAt': datetime.date.today().isoformat(), 'sheets': b.wb.sheetnames},
        'places': [b.places[k] for k in b.order],
        'festivals': b.festivals,
        'existingRefs': b.existing_refs,
        'folders': b.folders,
        'unmapped': b.unmapped,
    }
    with open(os.path.join(HERE, 'dataset.json'), 'w', encoding='utf-8') as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, 'coverage.json'), 'w', encoding='utf-8') as f:
        json.dump(sorted(b.coverage, key=lambda c: (c['sheet'], c['row'])), f, ensure_ascii=False, indent=1)
    kinds = {}
    for p in ds['places']:
        kinds[p['kind']] = kinds.get(p['kind'], 0) + 1
    print('places:', len(ds['places']), kinds, '| festivals:', len(b.festivals), '| existing refs:', len(b.existing_refs),
          '| unmapped:', len(b.unmapped))
    print('coverage rows:', len(b.coverage))
    if problems:
        print('!! THIẾU KẾT CỤC:')
        for x in problems:
            print('  ', x)
        sys.exit(1)
    print('OK: mọi dòng dữ liệu của mọi sheet đều có kết cục.')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
