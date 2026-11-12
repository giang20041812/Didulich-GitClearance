-- Khoảng cách đến điểm vui chơi nổi bật (từ sheet col "Khoảng cách đến điểm vui chơi nổi bật")
-- Run AFTER migration 017-highlight-nearby.sql
-- Sắp xếp ưu tiên khoảng cách từ km ngắn đến dài

DELETE FROM place_highlight
WHERE type = 'NEARBY'
  AND place_id IN (SELECT id FROM place WHERE slug IN (
    'homestay-anh-tuc','new-highland-hotel','homestay-mua-vang','trai-ban-homestay',
    'hoa-son-tra-hotel','nha-nghi-duy-vu','baan-mali-homestay','homestay-hoa-thao',
    'homestay-cuong-tu','homestay-bao-lan','win-homestay','pu-nhu-house',
    'co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang','hotel-thuat-hoa',
    'chelly-hotel','hanh-phuc-creek-homestay','doi-doi-gio','mcc-lu-tre',
    'mai-linh-hotel','sky-motel','nang-hotel','nha-nghi-ngu',
    'chiba-ecolodge','ha-chau-2-homestay','homestay-hien-quang','chai-eco-house',
    'hotel-moon-2','hotel-nhat-phuong'
  ));

WITH nearby_data (slug, content) AS (VALUES
  ('homestay-anh-tuc',         'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('new-highland-hotel',       'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('homestay-mua-vang',        'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('trai-ban-homestay',        'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('hoa-son-tra-hotel',        'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('nha-nghi-duy-vu',          'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('baan-mali-homestay',       'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('homestay-hoa-thao',        'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('homestay-cuong-tu',        'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('homestay-bao-lan',         'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('win-homestay',             'Háng Đăng Dê 4km · Móng Ngựa 4km · Rừng Trúc 4km · Kim Nọi 7km · Sống Lưng KL 8km · Mâm Xôi 10km'),
  ('pu-nhu-house',             'Mâm Xôi 1km · Rừng Trúc 4km · Sống Lưng KL 8km · Móng Ngựa 12km · Háng Đăng Dê 13km · Kim Nọi 17km'),
  ('co-gai-thai-homestay',     'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('moc-homestay',             'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('bungalow-xuan-giang',      'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('hotel-thuat-hoa',          'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 13km'),
  ('chelly-hotel',             'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('hanh-phuc-creek-homestay', 'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('doi-doi-gio',              'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('mcc-lu-tre',               'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('mai-linh-hotel',           'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('sky-motel',                'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('nang-hotel',               'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('nha-nghi-ngu',             'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('chiba-ecolodge',           'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('ha-chau-2-homestay',       'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('homestay-hien-quang',      'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('chai-eco-house',           'Háng Đăng Dê 2km · Móng Ngựa 3km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km'),
  ('hotel-moon-2',             'Háng Đăng Dê 3km · Móng Ngựa 4km · Rừng Trúc 6km · Kim Nọi 6km · Sống Lưng KL 10km · Mâm Xôi 14km'),
  ('hotel-nhat-phuong',        'Háng Đăng Dê 2km · Móng Ngựa 4km · Rừng Trúc 5km · Kim Nọi 5km · Sống Lưng KL 10km · Mâm Xôi 12km')
)
INSERT INTO place_highlight (place_id, type, content, is_public, sort_order)
SELECT p.id, 'NEARBY', d.content, TRUE, 99
FROM nearby_data d
JOIN place p ON p.slug = d.slug;
