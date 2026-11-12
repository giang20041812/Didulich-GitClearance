-- ══════════════════════════════════════════════════════════════════════════════
-- Cập nhật bản đồ hành chính tỉnh Lào Cai theo thời điểm hiện tại
-- 1. Cấp 1: Tỉnh Lào Cai
-- 2. Cấp 2: 9 đơn vị hành chính cấp huyện (TX Sa Pa, TP Lào Cai, 7 huyện)
-- 3. Cấp 3: Toàn bộ Phường, Xã, Thị trấn theo Nghị quyết mới nhất của UBTVQH
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Cấp 1: Tỉnh Lào Cai
INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active)
SELECT 'LAO_CAI', 'Lào Cai', 'lao cai', 1, NULL, 'Lào Cai', TRUE
WHERE NOT EXISTS (SELECT 1 FROM region WHERE code = 'LAO_CAI');

-- 2. Cấp 2: Các Huyện / Thị xã / Thành phố trực thuộc tỉnh Lào Cai (9 đơn vị hành chính)
INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active)
SELECT v.code, v.name, v.name_norm, 2, p.id, 'Lào Cai/' || v.name, TRUE
FROM (VALUES
  ('TX_SA_PA',         'Thị xã Sa Pa',          'thi xa sa pa'),
  ('TP_LAO_CAI',      'Thành phố Lào Cai',     'thanh pho lao cai'),
  ('H_BAC_HA',        'Huyện Bắc Hà',          'huyen bac ha'),
  ('H_BAT_XAT',       'Huyện Bát Xát',         'huyen bat xat'),
  ('H_BAO_YEN',       'Huyện Bảo Yên',         'huyen bao yen'),
  ('H_BAO_THANG',     'Huyện Bảo Thắng',       'huyen bao thang'),
  ('H_MUONG_KHUONG',  'Huyện Mường Khương',    'huyen muong khuong'),
  ('H_SI_MA_CAI',     'Huyện Si Ma Cai',       'huyen si ma cai'),
  ('H_VAN_BAN',       'Huyện Văn Bàn',         'huyen van ban')
) AS v(code, name, name_norm)
CROSS JOIN region p
WHERE p.code = 'LAO_CAI'
  AND NOT EXISTS (SELECT 1 FROM region r WHERE r.code = v.code);

-- 3. Cấp 3: Các Phường / Xã / Thị trấn theo địa giới hành chính hiện hành
INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active)
SELECT v.code, v.name, v.name_norm, 3, p.id, p.path || '/' || v.name, TRUE
FROM (VALUES
  -- Thị xã Sa Pa (6 phường + 10 xã theo NQ 767/NQ-UBTVQH14)
  ('SP_P_SA_PA',          'Phường Sa Pa',          'phuong sa pa',          'TX_SA_PA'),
  ('SP_P_SA_PA_2',        'Phường Sa Pả',          'phuong sa pa',          'TX_SA_PA'),
  ('SP_P_CAU_MAY',        'Phường Cầu Mây',        'phuong cau may',        'TX_SA_PA'),
  ('SP_P_FANSIPAN',       'Phường Fansipan',       'phuong fansipan',       'TX_SA_PA'),
  ('SP_P_HAM_RONG',       'Phường Hàm Rồng',       'phuong ham rong',       'TX_SA_PA'),
  ('SP_P_O_QUY_HO',       'Phường Ô Quý Hồ',       'phuong o quy ho',       'TX_SA_PA'),
  ('SP_X_TA_VAN',         'Xã Tả Van',             'xa ta van',             'TX_SA_PA'),
  ('SP_X_MUONG_HOA',      'Xã Mường Hoa',          'xa muong hoa',          'TX_SA_PA'),
  ('SP_X_TA_PHIN',        'Xã Tả Phìn',            'xa ta phin',            'TX_SA_PA'),
  ('SP_X_BAN_HO',         'Xã Bản Hồ',             'xa ban ho',             'TX_SA_PA'),
  ('SP_X_LIEN_MINH',      'Xã Liên Minh',          'xa lien minh',          'TX_SA_PA'),
  ('SP_X_HOANG_LIEN',     'Xã Hoàng Liên',         'xa hoang lien',         'TX_SA_PA'),
  ('SP_X_THANH_BINH',     'Xã Thanh Bình',         'xa thanh binh',         'TX_SA_PA'),
  ('SP_X_TRUNG_CHAI',     'Xã Trung Chải',         'xa trung chai',         'TX_SA_PA'),
  ('SP_X_NGU_CHI_SON',    'Xã Ngũ Chỉ Sơn',        'xa ngu chi son',        'TX_SA_PA'),

  -- Huyện Bắc Hà
  ('BH_TT_BAC_HA',        'Thị trấn Bắc Hà',       'thi tran bac ha',       'H_BAC_HA'),
  ('BH_X_TA_CHAI',        'Xã Tà Chải',            'xa ta chai',            'H_BAC_HA'),
  ('BH_X_BAN_PHO',        'Xã Bản Phố',            'xa ban pho',            'H_BAC_HA'),
  ('BH_X_NA_HOI',         'Xã Na Hối',             'xa na hoi',             'H_BAC_HA'),
  ('BH_X_THAI_GIANG_PHO', 'Xã Thải Giàng Phố',     'xa thai giang pho',     'H_BAC_HA'),
  ('BH_X_BAO_NHAI',       'Xã Bảo Nhai',           'xa bao nhai',           'H_BAC_HA'),
  ('BH_X_NAM_MON',        'Xã Nậm Mòn',            'xa nam mon',            'H_BAC_HA'),
  ('BH_X_COC_LY',         'Xã Cốc Ly',             'xa coc ly',             'H_BAC_HA'),
  ('BH_X_LUNG_PHINH',     'Xã Lùng Phình',         'xa lung phinh',         'H_BAC_HA'),
  ('BH_X_TA_VAN_CHU',     'Xã Tả Van Chư',         'xa ta van chu',         'H_BAC_HA'),
  ('BH_X_BAN_LIEN',       'Xã Bản Liền',           'xa ban lien',           'H_BAC_HA'),
  ('BH_X_HOANG_THU_PHO',  'Xã Hoàng Thu Phố',      'xa hoang thu pho',      'H_BAC_HA'),
  ('BH_X_NAM_DET',        'Xã Nậm Đét',            'xa nam det',            'H_BAC_HA'),
  ('BH_X_NAM_KHANH',      'Xã Nậm Khánh',          'xa nam khanh',          'H_BAC_HA'),
  ('BH_X_BAN_CAI',        'Xã Bản Cái',            'xa ban cai',            'H_BAC_HA'),
  ('BH_X_COC_LAU',        'Xã Cốc Lầu',            'xa coc lau',            'H_BAC_HA'),
  ('BH_X_LUNG_CAI',       'Xã Lùng Cải',           'xa lung cai',           'H_BAC_HA'),

  -- Huyện Bát Xát (Y Tý, Mường Hum...)
  ('BX_TT_BAT_XAT',       'Thị trấn Bát Xát',      'thi tran bat xat',      'H_BAT_XAT'),
  ('BX_X_Y_TY',           'Xã Y Tý',               'xa y ty',               'H_BAT_XAT'),
  ('BX_X_MUONG_HUM',      'Xã Mường Hum',          'xa muong hum',          'H_BAT_XAT'),
  ('BX_X_SANG_MA_SAO',    'Xã Sàng Ma Sáo',        'xa sang ma sao',        'H_BAT_XAT'),
  ('BX_X_DEN_SANG',       'Xã Dền Sáng',           'xa den sang',           'H_BAT_XAT'),
  ('BX_X_A_LU',           'Xã A Lù',               'xa a lu',               'H_BAT_XAT'),
  ('BX_X_TRINH_TUONG',    'Xã Trịnh Tường',        'xa trinh tuong',        'H_BAT_XAT'),
  ('BX_X_BAN_VUOK',       'Xã Bản Vược',           'xa ban vuoc',           'H_BAT_XAT'),
  ('BX_X_QUANG_KIM',      'Xã Quang Kim',          'xa quang kim',          'H_BAT_XAT'),
  ('BX_X_COC_MY',         'Xã Cốc Mỳ',             'xa coc my',             'H_BAT_XAT'),
  ('BX_X_DEN_THANG',      'Xã Dền Thàng',          'xa den thang',          'H_BAT_XAT'),
  ('BX_X_NAM_PUNG',       'Xã Nậm Pung',           'xa nam pung',           'H_BAT_XAT'),
  ('BX_X_BAN_QUA',        'Xã Bản Qua',            'xa ban qua',            'H_BAT_XAT'),
  ('BX_X_MUONG_VI',       'Xã Mường Vi',           'xa muong vi',           'H_BAT_XAT'),
  ('BX_X_PHIN_NGAN',      'Xã Phìn Ngan',          'xa phin ngan',          'H_BAT_XAT'),
  ('BX_X_TONG_SANH',      'Xã Tòng Sành',          'xa tong sanh',          'H_BAT_XAT'),
  ('BX_X_A_MU_SUNG',      'Xã A Mú Sung',          'xa a mu sung',          'H_BAT_XAT'),
  ('BX_X_NAM_CHAC',       'Xã Nậm Chạc',           'xa nam chac',           'H_BAT_XAT'),
  ('BX_X_PA_CHEO',        'Xã Pa Cheo',            'xa pa cheo',            'H_BAT_XAT'),
  ('BX_X_TRUNG_LENG_HO',  'Xã Trung Lèng Hồ',      'xa trung leng ho',      'H_BAT_XAT'),

  -- Thành phố Lào Cai (10 phường + 7 xã)
  ('LC_P_COC_LEU',        'Phường Cốc Lếu',        'phuong coc leu',        'TP_LAO_CAI'),
  ('LC_P_KIM_TAN',        'Phường Kim Tân',        'phuong kim tan',        'TP_LAO_CAI'),
  ('LC_P_BAC_CUONG',      'Phường Bắc Cường',      'phuong bac cuong',      'TP_LAO_CAI'),
  ('LC_P_NAM_CUONG',      'Phường Nam Cường',      'phuong nam cuong',      'TP_LAO_CAI'),
  ('LC_P_DUYEN_HAI',      'Phường Duyên Hải',      'phuong duyen hai',      'TP_LAO_CAI'),
  ('LC_P_LAO_CAI',        'Phường Lào Cai',        'phuong lao cai',        'TP_LAO_CAI'),
  ('LC_P_POM_HAN',        'Phường Pom Hán',        'phuong pom han',        'TP_LAO_CAI'),
  ('LC_P_BAC_LENH',       'Phường Bắc Lệnh',       'phuong bac lenh',       'TP_LAO_CAI'),
  ('LC_P_BINH_MINH',      'Phường Bình Minh',      'phuong binh minh',      'TP_LAO_CAI'),
  ('LC_P_XUAN_TANG',      'Phường Xuân Tăng',      'phuong xuan tang',      'TP_LAO_CAI'),
  ('LC_X_VAN_HOA',        'Xã Vạn Hòa',            'xa van hoa',            'TP_LAO_CAI'),
  ('LC_X_CAM_DUONG',      'Xã Cam Đường',          'xa cam duong',          'TP_LAO_CAI'),
  ('LC_X_COC_SAN',        'Xã Cốc San',            'xa coc san',            'TP_LAO_CAI'),
  ('LC_X_DONG_TUYEN',     'Xã Đồng Tuyển',         'xa dong tuyen',         'TP_LAO_CAI'),
  ('LC_X_TA_PHOI',        'Xã Tả Phời',            'xa ta phoi',            'TP_LAO_CAI'),
  ('LC_X_HOP_THANH',      'Xã Hợp Thành',          'xa hop thanh',          'TP_LAO_CAI'),
  ('LC_X_THONG_NHAT',     'Xã Thống Nhất',         'xa thong nhat',         'TP_LAO_CAI'),

  -- Huyện Bảo Yên
  ('BY_TT_PHO_RANG',      'Thị trấn Phố Ràng',     'thi tran pho rang',     'H_BAO_YEN'),
  ('BY_X_NGHIA_DO',       'Xã Nghĩa Đô',           'xa nghia do',           'H_BAO_YEN'),
  ('BY_X_BAO_HA',         'Xã Bảo Hà',             'xa bao ha',             'H_BAO_YEN'),
  ('BY_X_VINH_YEN',       'Xã Vĩnh Yên',           'xa vinh yen',           'H_BAO_YEN'),
  ('BY_X_XUAN_HOA',       'Xã Xuân Hòa',           'xa xuan hoa',           'H_BAO_YEN'),
  ('BY_X_TAN_DUONG',      'Xã Tân Dương',          'xa tan duong',          'H_BAO_YEN'),
  ('BY_X_THUONG_HA',      'Xã Thượng Hà',          'xa thuong ha',          'H_BAO_YEN'),
  ('BY_X_KIM_SON',        'Xã Kim Sơn',            'xa kim son',            'H_BAO_YEN'),
  ('BY_X_CAM_CON',        'Xã Cam Cọn',            'xa cam con',            'H_BAO_YEN'),
  ('BY_X_DIEN_QUAN',      'Xã Điện Quan',          'xa dien quan',          'H_BAO_YEN'),
  ('BY_X_PHUC_KHANH',     'Xã Phúc Khánh',         'xa phuc khanh',         'H_BAO_YEN'),
  ('BY_X_YEN_SON',        'Xã Yên Sơn',            'xa yen son',            'H_BAO_YEN'),
  ('BY_X_VIET_TIEN',      'Xã Việt Tiến',          'xa viet tien',          'H_BAO_YEN'),
  ('BY_X_LUONG_SON',      'Xã Lương Sơn',          'xa luong son',          'H_BAO_YEN'),

  -- Huyện Bảo Thắng
  ('BT_TT_PHO_LU',        'Thị trấn Phố Lu',       'thi tran pho lu',       'H_BAO_THANG'),
  ('BT_TT_TANG_LOONG',    'Thị trấn Tằng Loỏng',   'thi tran tang loong',   'H_BAO_THANG'),
  ('BT_TT_PHONG_HAI',     'Thị trấn Phong Hải',    'thi tran phong hai',    'H_BAO_THANG'),
  ('BT_X_BAN_PHIET',      'Xã Bản Phiệt',          'xa ban phiet',          'H_BAO_THANG'),
  ('BT_X_BAN_CAM',        'Xã Bản Cầm',            'xa ban cam',            'H_BAO_THANG'),
  ('BT_X_THAI_NIEN',      'Xã Thái Niên',          'xa thai nien',          'H_BAO_THANG'),
  ('BT_X_PHONG_NIEN',     'Xã Phong Niên',         'xa phong nien',         'H_BAO_THANG'),
  ('BT_X_GIA_PHU',        'Xã Gia Phú',            'xa gia phu',            'H_BAO_THANG'),
  ('BT_X_XUAN_GIAO',      'Xã Xuân Giao',          'xa xuan giao',          'H_BAO_THANG'),
  ('BT_X_TRI_QUANG',      'Xã Trì Quang',          'xa tri quang',          'H_BAO_THANG'),
  ('BT_X_SON_HAI',        'Xã Sơn Hải',            'xa son hai',            'H_BAO_THANG'),
  ('BT_X_SON_HA',         'Xã Sơn Hà',             'xa son ha',             'H_BAO_THANG'),
  ('BT_X_PHU_NHUAN',      'Xã Phú Nhuận',          'xa phu nhuan',          'H_BAO_THANG'),

  -- Huyện Mường Khương
  ('MK_TT_MUONG_KHUONG',  'Thị trấn Mường Khương', 'thi tran muong khuong', 'H_MUONG_KHUONG'),
  ('MK_X_PHA_LONG',       'Xã Pha Long',           'xa pha long',           'H_MUONG_KHUONG'),
  ('MK_X_CAO_SON',        'Xã Cao Sơn',            'xa cao son',            'H_MUONG_KHUONG'),
  ('MK_X_LUNG_KHAU_NHIN', 'Xã Lùng Khấu Nhin',     'xa lung khau nhin',     'H_MUONG_KHUONG'),
  ('MK_X_TA_NGAI_CHO',    'Xã Tả Ngải Chồ',        'xa ta ngai cho',        'H_MUONG_KHUONG'),
  ('MK_X_DIN_CHIN',       'Xã Dìn Chin',           'xa din chin',           'H_MUONG_KHUONG'),
  ('MK_X_TA_GIA_KHAU',    'Xã Tả Gia Khâu',        'xa ta gia khau',        'H_MUONG_KHUONG'),
  ('MK_X_TUNG_CHUNG_PHO', 'Xã Tung Chung Phố',     'xa tung chung pho',     'H_MUONG_KHUONG'),
  ('MK_X_NAM_LU',         'Xã Nấm Lư',             'xa nam lu',             'H_MUONG_KHUONG'),
  ('MK_X_LUNG_VAI',       'Xã Lùng Vai',           'xa lung vai',           'H_MUONG_KHUONG'),
  ('MK_X_BAN_SEN',        'Xã Bản Sen',            'xa ban sen',            'H_MUONG_KHUONG'),
  ('MK_X_BAN_LAU',        'Xã Bản Lầu',            'xa ban lau',            'H_MUONG_KHUONG'),
  ('MK_X_THANH_BINH',     'Xã Thanh Bình',         'xa thanh binh',         'H_MUONG_KHUONG'),
  ('MK_X_LA_PAN_TAN',     'Xã La Pan Tẩn',         'xa la pan tan',         'H_MUONG_KHUONG'),
  ('MK_X_NAM_CHAY',       'Xã Nậm Chảy',           'xa nam chay',           'H_MUONG_KHUONG'),

  -- Huyện Si Ma Cai
  ('SMC_TT_SI_MA_CAI',    'Thị trấn Si Ma Cai',    'thi tran si ma cai',    'H_SI_MA_CAI'),
  ('SMC_X_CAN_CAU',       'Xã Cán Cấu',            'xa can cau',            'H_SI_MA_CAI'),
  ('SMC_X_SAN_CHAI',      'Xã Sán Chải',           'xa san chai',           'H_SI_MA_CAI'),
  ('SMC_X_LU_THAN',       'Xã Lử Thẩn',            'xa lu than',            'H_SI_MA_CAI'),
  ('SMC_X_QUAN_HO_THAN',  'Xã Quan Hồ Thẩn',       'xa quan ho than',       'H_SI_MA_CAI'),
  ('SMC_X_NAN_SAN',       'Xã Nàn Sán',            'xa nan san',            'H_SI_MA_CAI'),
  ('SMC_X_THAO_CHU_PHIN', 'Xã Thào Chư Phìn',      'xa thao chu phin',      'H_SI_MA_CAI'),
  ('SMC_X_BAN_ME',        'Xã Bản Mế',             'xa ban me',             'H_SI_MA_CAI'),
  ('SMC_X_SIN_CHENG',     'Xã Sín Chéng',          'xa sin cheng',          'H_SI_MA_CAI'),

  -- Huyện Văn Bàn
  ('VB_TT_KHANH_YEN',     'Thị trấn Khánh Yên',    'thi tran khanh yen',    'H_VAN_BAN'),
  ('VB_X_CHIENG_KEN',     'Xã Chiềng Ken',         'xa chieng ken',         'H_VAN_BAN'),
  ('VB_X_DAN_THANG',      'Xã Dần Thàng',          'xa dan thang',          'H_VAN_BAN'),
  ('VB_X_KHANH_YEN_HA',   'Xã Khánh Yên Hạ',       'xa khanh yen ha',       'H_VAN_BAN'),
  ('VB_X_KHANH_YEN_THUONG','Xã Khánh Yên Thượng',   'xa khanh yen thuong',   'H_VAN_BAN'),
  ('VB_X_KHANH_YEN_TRUNG', 'Xã Khánh Yên Trung',    'xa khanh yen trung',    'H_VAN_BAN'),
  ('VB_X_LANG_GIANG',     'Xã Làng Giàng',         'xa lang giang',         'H_VAN_BAN'),
  ('VB_X_LIEM_PHU',       'Xã Liêm Phú',           'xa liem phu',           'H_VAN_BAN'),
  ('VB_X_NAM_CHAY',       'Xã Nậm Chày',           'xa nam chay',           'H_VAN_BAN'),
  ('VB_X_NAM_MA',         'Xã Nậm Mả',             'xa nam ma',             'H_VAN_BAN'),
  ('VB_X_NAM_RANG',       'Xã Nậm Rạng',           'xa nam rang',           'H_VAN_BAN'),
  ('VB_X_NAM_THA',        'Xã Nậm Tha',            'xa nam tha',            'H_VAN_BAN'),
  ('VB_X_NAM_XAY',        'Xã Nậm Xây',            'xa nam xay',            'H_VAN_BAN'),
  ('VB_X_NAM_XE',         'Xã Nậm Xé',             'xa nam xe',             'H_VAN_BAN'),
  ('VB_X_SON_THUY',       'Xã Sơn Thủy',           'xa son thuy',           'H_VAN_BAN'),
  ('VB_X_TAN_AN',         'Xã Tân An',             'xa tan an',             'H_VAN_BAN'),
  ('VB_X_TAN_THUONG',     'Xã Tân Thượng',         'xa tan thuong',         'H_VAN_BAN'),
  ('VB_X_THAM_DUONG',     'Xã Thẩm Dương',         'xa tham duong',         'H_VAN_BAN'),
  ('VB_X_VO_LAO',         'Xã Võ Lao',             'xa vo lao',             'H_VAN_BAN'),
  ('VB_X_HOA_MAC',        'Xã Hòa Mạc',            'xa hoa mac',            'H_VAN_BAN')
) AS v(code, name, name_norm, parent_code)
JOIN region p ON p.code = v.parent_code
WHERE NOT EXISTS (SELECT 1 FROM region r WHERE r.code = v.code);

COMMIT;

-- Kiểm tra kết quả
SELECT level, count(*) AS so_luong
FROM region
WHERE path LIKE 'Lào Cai%'
GROUP BY level
ORDER BY level;
