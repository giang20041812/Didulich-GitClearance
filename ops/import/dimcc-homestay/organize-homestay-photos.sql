-- Sắp xếp lại ảnh homestay theo loại + gắn ảnh vào hạng phòng. Sinh bởi build_photo_order.py (phân loại bằng cách xem từng ảnh).
-- Chạy trong Supabase → SQL Editor. Chỉ sửa place_media (thứ tự, ảnh bìa, chú thích) và thêm room_type_media; KHÔNG xóa ảnh nào.
-- Chạy lại nhiều lần an toàn. Cuối file có khối TÙY CHỌN (đang comment) để gỡ 2 ảnh bảng giá khỏi thư viện ảnh khách.
BEGIN;

-- ===== co-gai-thai-homestay =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Ảnh thẻ – toàn cảnh khu nhà' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 176;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Khuôn viên – mặt tiền & bãi đỗ xe (buổi tối)' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 173;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Khuôn viên – bãi đỗ xe nhìn ra ruộng lúa' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 174;
UPDATE place_media SET sort_order = 3, role = 'GALLERY', caption = 'Khuôn viên – sân chung nhìn ra ruộng lúa' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 175;
UPDATE place_media SET sort_order = 4, role = 'GALLERY', caption = 'Giao lưu văn nghệ – sân trước nhà (buổi tối)' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 169;
UPDATE place_media SET sort_order = 5, role = 'GALLERY', caption = 'Giao lưu văn nghệ – sân trước nhà (buổi tối)' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 170;
UPDATE place_media SET sort_order = 6, role = 'GALLERY', caption = 'Giao lưu văn nghệ – múa xòe' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 171;
UPDATE place_media SET sort_order = 7, role = 'GALLERY', caption = 'Giao lưu văn nghệ – múa xòe (cận)' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 172;
UPDATE place_media SET sort_order = 8, role = 'GALLERY', caption = 'Sảnh ăn uống chung' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 178;
UPDATE place_media SET sort_order = 9, role = 'GALLERY', caption = 'Hành lang gỗ tầng nhà sàn' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 177;
UPDATE place_media SET sort_order = 10, role = 'GALLERY', caption = 'Phòng kê đệm (3 giường)' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 180;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND name = 'Phòng 3 giường (kê đệm)'), 180, 'GALLERY', 'Phòng kê đệm (3 giường)', 10 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND name = 'Phòng 3 giường (kê đệm)') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 11, role = 'GALLERY', caption = 'Sàn nằm chung kê đệm, ngăn rèm' WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND media_id = 179;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND name = 'Phòng 3 giường (kê đệm)'), 179, 'GALLERY', 'Sàn nằm chung kê đệm, ngăn rèm', 11 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'co-gai-thai-homestay') AND name = 'Phòng 3 giường (kê đệm)') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== trai-ban-homestay =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Ảnh thẻ – cổng vào & sân' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 152;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Khuôn viên – sân chung (buổi tối)' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 151;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Phòng homestay – giường đôi' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 145;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Phòng homestay'), 145, 'GALLERY', 'Phòng homestay – giường đôi', 2 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Phòng homestay') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 3, role = 'GALLERY', caption = 'Phòng homestay – giường đôi' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 146;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Phòng homestay'), 146, 'GALLERY', 'Phòng homestay – giường đôi', 3 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Phòng homestay') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 4, role = 'GALLERY', caption = 'Bungalow 1 giường – mái chóp, ban công' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 150;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 1 giường'), 150, 'GALLERY', 'Bungalow 1 giường – mái chóp, ban công', 4 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 1 giường') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 5, role = 'GALLERY', caption = 'Bungalow 1 giường – view ruộng' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 149;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 1 giường'), 149, 'GALLERY', 'Bungalow 1 giường – view ruộng', 5 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 1 giường') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 6, role = 'GALLERY', caption = 'Bungalow 2 giường – view ruộng' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 148;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 2 giường'), 148, 'GALLERY', 'Bungalow 2 giường – view ruộng', 6 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 2 giường') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 7, role = 'GALLERY', caption = 'Bungalow 3 giường – kèm ghế sofa' WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND media_id = 147;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 3 giường'), 147, 'GALLERY', 'Bungalow 3 giường – kèm ghế sofa', 7 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'trai-ban-homestay') AND name = 'Bungalow 3 giường') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== homestay-hoa-thao =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Mặt tiền nhà sàn' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 158;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Phòng có ban công nhìn ruộng' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 159;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đơn'), 159, 'GALLERY', 'Phòng có ban công nhìn ruộng', 1 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đơn') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Phòng 2 giường (1 giường lớn + 1 giường nhỏ)' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 162;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi'), 162, 'GALLERY', 'Phòng 2 giường (1 giường lớn + 1 giường nhỏ)', 2 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 3, role = 'GALLERY', caption = 'Phòng 2 giường nhìn ruộng' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 160;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi'), 160, 'GALLERY', 'Phòng 2 giường nhìn ruộng', 3 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 4, role = 'GALLERY', caption = 'Phòng 2 giường nhìn ruộng' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 163;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi'), 163, 'GALLERY', 'Phòng 2 giường nhìn ruộng', 4 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 5, role = 'GALLERY', caption = 'Nhà vệ sinh khép kín' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-hoa-thao') AND media_id = 161;

-- ===== bungalow-xuan-giang =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'bungalow-xuan-giang');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Dãy bungalow nhìn từ trên cao, giữa ruộng bậc thang' WHERE place_id = (SELECT id FROM place WHERE slug = 'bungalow-xuan-giang') AND media_id = 186;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Bungalow nhìn ruộng bậc thang' WHERE place_id = (SELECT id FROM place WHERE slug = 'bungalow-xuan-giang') AND media_id = 187;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Khu ăn uống ngoài trời có mái che' WHERE place_id = (SELECT id FROM place WHERE slug = 'bungalow-xuan-giang') AND media_id = 185;
UPDATE place_media SET sort_order = 3, role = 'GALLERY', caption = 'Phòng ăn trong nhà' WHERE place_id = (SELECT id FROM place WHERE slug = 'bungalow-xuan-giang') AND media_id = 184;

-- ===== new-highland-hotel =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Toàn cảnh khách sạn nhìn từ trên cao' WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND media_id = 142;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Sảnh tiếp khách' WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND media_id = 141;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Phòng 2 giường' WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND media_id = 139;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND name = 'Phòng đôi'), 139, 'GALLERY', 'Phòng 2 giường', 2 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 3, role = 'GALLERY', caption = 'Phòng 4 giường' WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND media_id = 140;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND name = 'Phòng 4 giường'), 140, 'GALLERY', 'Phòng 4 giường', 3 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'new-highland-hotel') AND name = 'Phòng 4 giường') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== homestay-mua-vang =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-mua-vang');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Toàn cảnh tòa nhà (buổi tối)' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-mua-vang') AND media_id = 144;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Phòng 1 giường, có ban công' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-mua-vang') AND media_id = 143;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-mua-vang') AND name = 'Phòng đơn (1 giường đôi)'), 143, 'GALLERY', 'Phòng 1 giường, có ban công', 1 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-mua-vang') AND name = 'Phòng đơn (1 giường đôi)') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== hoa-son-tra-hotel =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Phòng 1 giường lớn' WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel') AND media_id = 154;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel') AND name = 'Phòng 1 giường to'), 154, 'GALLERY', 'Phòng 1 giường lớn', 0 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel') AND name = 'Phòng 1 giường to') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 51, role = 'GALLERY', caption = 'KHÔNG HIỂN THỊ: Bảng niêm yết giá phòng chụp từ tường (có SĐT + giá khác giá trên web)' WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel') AND media_id = 153;

-- ===== baan-mali-homestay =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Nhà sàn gỗ – sân trước' WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay') AND media_id = 156;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Sân thượng có mái che' WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay') AND media_id = 155;
UPDATE place_media SET sort_order = 2, role = 'GALLERY', caption = 'Phòng 1 giường' WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay') AND media_id = 157;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay') AND name = 'Phòng đơn'), 157, 'GALLERY', 'Phòng 1 giường', 2 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'baan-mali-homestay') AND name = 'Phòng đơn') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== doi-doi-gio =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'doi-doi-gio');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Toàn cảnh khu homestay trên đồi' WHERE place_id = (SELECT id FROM place WHERE slug = 'doi-doi-gio') AND media_id = 189;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Phòng 3 giường' WHERE place_id = (SELECT id FROM place WHERE slug = 'doi-doi-gio') AND media_id = 190;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'doi-doi-gio') AND name = 'Phòng triple (3 giường)'), 190, 'GALLERY', 'Phòng 3 giường', 1 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'doi-doi-gio') AND name = 'Phòng triple (3 giường)') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- ===== mai-linh-hotel =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Phòng 1 giường, nhìn ra thị trấn' WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND media_id = 193;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND name = 'Phòng đơn'), 193, 'GALLERY', 'Phòng 1 giường, nhìn ra thị trấn', 0 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND name = 'Phòng đơn') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Phòng 2 giường' WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND media_id = 192;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND name = 'Phòng đôi'), 192, 'GALLERY', 'Phòng 2 giường', 1 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;
UPDATE place_media SET sort_order = 52, role = 'GALLERY', caption = 'KHÔNG HIỂN THỊ: Bảng quy định mức thu tiền phòng chụp từ tường (có SĐT + giá khác giá trên web)' WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND media_id = 191;

-- ===== homestay-anh-tuc =====
UPDATE place_media SET role = 'GALLERY' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-anh-tuc');
UPDATE place_media SET sort_order = 0, role = 'COVER', caption = 'Dãy nhà tre nhìn từ ngoài' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-anh-tuc') AND media_id = 137;
UPDATE place_media SET sort_order = 1, role = 'GALLERY', caption = 'Phòng nhà tre – 2 giường (1 lớn + 1 nhỏ)' WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-anh-tuc') AND media_id = 138;
INSERT INTO room_type_media (room_type_id, media_id, role, caption, sort_order) SELECT (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-anh-tuc') AND name = 'Phòng đôi'), 138, 'GALLERY', 'Phòng nhà tre – 2 giường (1 lớn + 1 nhỏ)', 1 WHERE (SELECT id FROM room_type WHERE place_id = (SELECT id FROM place WHERE slug = 'homestay-anh-tuc') AND name = 'Phòng đôi') IS NOT NULL ON CONFLICT (room_type_id, media_id) DO UPDATE SET caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order;

-- Mỗi hạng phòng có ảnh: chọn ảnh có thứ tự nhỏ nhất làm ảnh bìa hạng phòng (nếu chưa có ảnh bìa)
UPDATE room_type_media rm SET role = 'COVER'
FROM (SELECT DISTINCT ON (room_type_id) room_type_id, media_id FROM room_type_media ORDER BY room_type_id, sort_order, media_id) f
WHERE rm.room_type_id = f.room_type_id AND rm.media_id = f.media_id
  AND NOT EXISTS (SELECT 1 FROM room_type_media x WHERE x.room_type_id = rm.room_type_id AND x.role = 'COVER');

COMMIT;

-- TÙY CHỌN: gỡ 2 ảnh bảng giá khỏi thư viện ảnh khách (bỏ comment nếu đồng ý). Ảnh gốc trong Storage vẫn còn.
-- DELETE FROM place_media WHERE place_id = (SELECT id FROM place WHERE slug = 'hoa-son-tra-hotel') AND media_id = 153;
-- DELETE FROM place_media WHERE place_id = (SELECT id FROM place WHERE slug = 'mai-linh-hotel') AND media_id = 191;
