-- ══════════════════════════════════════════════════════════════════════════════
-- Insert ảnh CHUẨN CLOUDINARY vào media_asset + place_media
-- Cloudinary Account: rf7zlbah
-- Tổng số ảnh: 64 ảnh cho 16 homestay ĐiMCC
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Bước 1: Insert media_asset với storage_key và public_url chuẩn Cloudinary
INSERT INTO media_asset (storage_key, public_url, mime_type, created_at)
SELECT
  v.storage_key,
  v.public_url,
  'image/jpeg',
  now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM (VALUES
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/d90fff5ee41be4c3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672426/viettrek/homestays/homestay-anh-tuc/d90fff5ee41be4c3.jpg', 0),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/46fca0e93167dae8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672460/viettrek/homestays/homestay-anh-tuc/46fca0e93167dae8.jpg', 1),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/f1963ac1e63c8935', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672462/viettrek/homestays/homestay-anh-tuc/f1963ac1e63c8935.jpg', 2),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/2cb30e19237436d4', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672466/viettrek/homestays/homestay-anh-tuc/2cb30e19237436d4.jpg', 3),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/fb1a1ccce625a554', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672469/viettrek/homestays/homestay-anh-tuc/fb1a1ccce625a554.jpg', 4),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/e5c484591dd7d7b5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672471/viettrek/homestays/new-highland-hotel/e5c484591dd7d7b5.jpg', 0),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/c8b71c9f047d5571', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672475/viettrek/homestays/new-highland-hotel/c8b71c9f047d5571.jpg', 1),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/b18f4fdc5e758088', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672477/viettrek/homestays/new-highland-hotel/b18f4fdc5e758088.jpg', 2),
  ('hoa-son-tra-hotel', 'cloudinary:viettrek/homestays/hoa-son-tra-hotel/c7752c45c9a1eba5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672481/viettrek/homestays/hoa-son-tra-hotel/c7752c45c9a1eba5.jpg', 0),
  ('nha-nghi-duy-vu', 'cloudinary:viettrek/homestays/nha-nghi-duy-vu/d6e8e2a4da507785', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672484/viettrek/homestays/nha-nghi-duy-vu/d6e8e2a4da507785.jpg', 0),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/93160762ed6afe24', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672487/viettrek/homestays/homestay-hoa-thao/93160762ed6afe24.jpg', 0),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/1a3b65375cf79541', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672489/viettrek/homestays/homestay-hoa-thao/1a3b65375cf79541.jpg', 1),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/364b09472bfa523c', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672491/viettrek/homestays/homestay-hoa-thao/364b09472bfa523c.jpg', 2),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/3502224f9e290daf', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672494/viettrek/homestays/homestay-hoa-thao/3502224f9e290daf.jpg', 3),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/99f050ccac4f1a0c', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672496/viettrek/homestays/homestay-hoa-thao/99f050ccac4f1a0c.jpg', 4),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/b209fbffb2015134', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672499/viettrek/homestays/homestay-cuong-tu/b209fbffb2015134.jpg', 0),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/7cb278784069c5a3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672501/viettrek/homestays/homestay-cuong-tu/7cb278784069c5a3.jpg', 1),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/935d898f9bad7170', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672504/viettrek/homestays/homestay-cuong-tu/935d898f9bad7170.jpg', 2),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/f213210ea784c9aa', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672506/viettrek/homestays/homestay-cuong-tu/f213210ea784c9aa.jpg', 3),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/e73525a9b6d8a21f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672509/viettrek/homestays/homestay-cuong-tu/e73525a9b6d8a21f.jpg', 4),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/74083a7fc60f3f1a', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672511/viettrek/homestays/homestay-bao-lan/74083a7fc60f3f1a.jpg', 0),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/c7782b7caf1a8a46', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672513/viettrek/homestays/homestay-bao-lan/c7782b7caf1a8a46.jpg', 1),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/907d9a5542dd885b', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672516/viettrek/homestays/homestay-bao-lan/907d9a5542dd885b.jpg', 2),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/093ff8078aee4ddb', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672518/viettrek/homestays/homestay-bao-lan/093ff8078aee4ddb.jpg', 3),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/dca50ca9a4ff974e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672819/viettrek/homestays/win-homestay/dca50ca9a4ff974e.jpg', 0),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/cd1bb62f283b4e44', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672828/viettrek/homestays/win-homestay/cd1bb62f283b4e44.jpg', 1),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/8c8a661a2ffd15b6', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672838/viettrek/homestays/win-homestay/8c8a661a2ffd15b6.jpg', 2),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/0b0574c9d2efed9d', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672847/viettrek/homestays/win-homestay/0b0574c9d2efed9d.jpg', 3),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/dea9f9f9c66c3f6f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672554/viettrek/homestays/pu-nhu-house/dea9f9f9c66c3f6f.jpg', 0),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/b49760aea0ef39e2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672557/viettrek/homestays/pu-nhu-house/b49760aea0ef39e2.jpg', 1),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/f323df2a781f7ff5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672560/viettrek/homestays/pu-nhu-house/f323df2a781f7ff5.jpg', 2),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/805c8d9909f7a244', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672562/viettrek/homestays/pu-nhu-house/805c8d9909f7a244.jpg', 3),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/e9841d2951ac68ca', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672565/viettrek/homestays/pu-nhu-house/e9841d2951ac68ca.jpg', 4),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/ea675f2ac9bd5012', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672568/viettrek/homestays/co-gai-thai-homestay/ea675f2ac9bd5012.jpg', 0),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/929e992d93533558', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672571/viettrek/homestays/co-gai-thai-homestay/929e992d93533558.jpg', 1),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/ed7ab1856c1438ac', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672574/viettrek/homestays/co-gai-thai-homestay/ed7ab1856c1438ac.jpg', 2),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/2658abd0f5730146', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672577/viettrek/homestays/co-gai-thai-homestay/2658abd0f5730146.jpg', 3),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/3ae3d6c246d8fbb2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672580/viettrek/homestays/co-gai-thai-homestay/3ae3d6c246d8fbb2.jpg', 4),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/1bc6fa023bfc92e4', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672583/viettrek/homestays/moc-homestay/1bc6fa023bfc92e4.jpg', 0),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/139c17a38c1e919e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672586/viettrek/homestays/moc-homestay/139c17a38c1e919e.jpg', 1),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/0a3999d7f935fa8e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672588/viettrek/homestays/moc-homestay/0a3999d7f935fa8e.jpg', 2),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/c9c62db6954c4ee0', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672591/viettrek/homestays/moc-homestay/c9c62db6954c4ee0.jpg', 3),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/cfd2468425002454', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672594/viettrek/homestays/bungalow-xuan-giang/cfd2468425002454.jpg', 0),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/8c890f94f0f45597', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672596/viettrek/homestays/bungalow-xuan-giang/8c890f94f0f45597.jpg', 1),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/0f2740705e34d86f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672599/viettrek/homestays/bungalow-xuan-giang/0f2740705e34d86f.jpg', 2),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/9879e38504f6a2f2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672601/viettrek/homestays/bungalow-xuan-giang/9879e38504f6a2f2.jpg', 3),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/bd985e5a77efaa45', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672604/viettrek/homestays/bungalow-xuan-giang/bd985e5a77efaa45.jpg', 4),
  ('hotel-thuat-hoa', 'cloudinary:viettrek/homestays/hotel-thuat-hoa/6f0205c796dcce92', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672607/viettrek/homestays/hotel-thuat-hoa/6f0205c796dcce92.jpg', 0),
  ('hotel-thuat-hoa', 'cloudinary:viettrek/homestays/hotel-thuat-hoa/59befb3953b006b3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672610/viettrek/homestays/hotel-thuat-hoa/59befb3953b006b3.jpg', 1),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/c46173223df9c0e8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672856/viettrek/homestays/chelly-hotel/c46173223df9c0e8.jpg', 0),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/d66e187a6f29d18e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672861/viettrek/homestays/chelly-hotel/d66e187a6f29d18e.jpg', 1),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/6bb38a31747ccc88', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672870/viettrek/homestays/chelly-hotel/6bb38a31747ccc88.jpg', 2),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/4a3207f67af076f6', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672656/viettrek/homestays/chelly-hotel/4a3207f67af076f6.jpg', 3),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/d361006785ce93d5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672877/viettrek/homestays/chelly-hotel/d361006785ce93d5.jpg', 4),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/1c3180205e459d06', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672671/viettrek/homestays/hanh-phuc-creek-homestay/1c3180205e459d06.jpg', 0),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/7f6a5ad07a26439a', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672674/viettrek/homestays/hanh-phuc-creek-homestay/7f6a5ad07a26439a.jpg', 1),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/87e163c4a7c765e5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672677/viettrek/homestays/hanh-phuc-creek-homestay/87e163c4a7c765e5.jpg', 2),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/a34ae709f1eb8047', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672680/viettrek/homestays/hanh-phuc-creek-homestay/a34ae709f1eb8047.jpg', 3),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/da308c7061fd5467', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672683/viettrek/homestays/hanh-phuc-creek-homestay/da308c7061fd5467.jpg', 4),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/25240e3f71fa85d0', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672884/viettrek/homestays/hotel-nhat-phuong/25240e3f71fa85d0.jpg', 0),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/a930e2edcb5ef75f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672700/viettrek/homestays/hotel-nhat-phuong/a930e2edcb5ef75f.jpg', 1),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/d2754cc5086217c8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672892/viettrek/homestays/hotel-nhat-phuong/d2754cc5086217c8.jpg', 2),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/e7c865be67d0610e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672899/viettrek/homestays/hotel-nhat-phuong/e7c865be67d0610e.jpg', 3),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/a15872a2324d52e8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672907/viettrek/homestays/hotel-nhat-phuong/a15872a2324d52e8.jpg', 4)
) AS v(slug, storage_key, public_url, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM media_asset m WHERE m.storage_key = v.storage_key
);

-- Bước 2: Insert place_media (gắn ảnh vào place)
INSERT INTO place_media (place_id, media_id, role, sort_order)
SELECT
  p.id,
  m.id,
  CASE WHEN v.sort_order = 0 AND NOT EXISTS (SELECT 1 FROM place_media pm2 WHERE pm2.place_id = p.id AND pm2.role = 'COVER') THEN 'COVER' ELSE 'GALLERY' END,
  v.sort_order
FROM (VALUES
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/d90fff5ee41be4c3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672426/viettrek/homestays/homestay-anh-tuc/d90fff5ee41be4c3.jpg', 0),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/46fca0e93167dae8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672460/viettrek/homestays/homestay-anh-tuc/46fca0e93167dae8.jpg', 1),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/f1963ac1e63c8935', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672462/viettrek/homestays/homestay-anh-tuc/f1963ac1e63c8935.jpg', 2),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/2cb30e19237436d4', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672466/viettrek/homestays/homestay-anh-tuc/2cb30e19237436d4.jpg', 3),
  ('homestay-anh-tuc', 'cloudinary:viettrek/homestays/homestay-anh-tuc/fb1a1ccce625a554', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672469/viettrek/homestays/homestay-anh-tuc/fb1a1ccce625a554.jpg', 4),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/e5c484591dd7d7b5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672471/viettrek/homestays/new-highland-hotel/e5c484591dd7d7b5.jpg', 0),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/c8b71c9f047d5571', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672475/viettrek/homestays/new-highland-hotel/c8b71c9f047d5571.jpg', 1),
  ('new-highland-hotel', 'cloudinary:viettrek/homestays/new-highland-hotel/b18f4fdc5e758088', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672477/viettrek/homestays/new-highland-hotel/b18f4fdc5e758088.jpg', 2),
  ('hoa-son-tra-hotel', 'cloudinary:viettrek/homestays/hoa-son-tra-hotel/c7752c45c9a1eba5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672481/viettrek/homestays/hoa-son-tra-hotel/c7752c45c9a1eba5.jpg', 0),
  ('nha-nghi-duy-vu', 'cloudinary:viettrek/homestays/nha-nghi-duy-vu/d6e8e2a4da507785', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672484/viettrek/homestays/nha-nghi-duy-vu/d6e8e2a4da507785.jpg', 0),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/93160762ed6afe24', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672487/viettrek/homestays/homestay-hoa-thao/93160762ed6afe24.jpg', 0),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/1a3b65375cf79541', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672489/viettrek/homestays/homestay-hoa-thao/1a3b65375cf79541.jpg', 1),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/364b09472bfa523c', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672491/viettrek/homestays/homestay-hoa-thao/364b09472bfa523c.jpg', 2),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/3502224f9e290daf', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672494/viettrek/homestays/homestay-hoa-thao/3502224f9e290daf.jpg', 3),
  ('homestay-hoa-thao', 'cloudinary:viettrek/homestays/homestay-hoa-thao/99f050ccac4f1a0c', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672496/viettrek/homestays/homestay-hoa-thao/99f050ccac4f1a0c.jpg', 4),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/b209fbffb2015134', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672499/viettrek/homestays/homestay-cuong-tu/b209fbffb2015134.jpg', 0),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/7cb278784069c5a3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672501/viettrek/homestays/homestay-cuong-tu/7cb278784069c5a3.jpg', 1),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/935d898f9bad7170', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672504/viettrek/homestays/homestay-cuong-tu/935d898f9bad7170.jpg', 2),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/f213210ea784c9aa', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672506/viettrek/homestays/homestay-cuong-tu/f213210ea784c9aa.jpg', 3),
  ('homestay-cuong-tu', 'cloudinary:viettrek/homestays/homestay-cuong-tu/e73525a9b6d8a21f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672509/viettrek/homestays/homestay-cuong-tu/e73525a9b6d8a21f.jpg', 4),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/74083a7fc60f3f1a', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672511/viettrek/homestays/homestay-bao-lan/74083a7fc60f3f1a.jpg', 0),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/c7782b7caf1a8a46', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672513/viettrek/homestays/homestay-bao-lan/c7782b7caf1a8a46.jpg', 1),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/907d9a5542dd885b', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672516/viettrek/homestays/homestay-bao-lan/907d9a5542dd885b.jpg', 2),
  ('homestay-bao-lan', 'cloudinary:viettrek/homestays/homestay-bao-lan/093ff8078aee4ddb', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672518/viettrek/homestays/homestay-bao-lan/093ff8078aee4ddb.jpg', 3),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/dca50ca9a4ff974e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672819/viettrek/homestays/win-homestay/dca50ca9a4ff974e.jpg', 0),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/cd1bb62f283b4e44', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672828/viettrek/homestays/win-homestay/cd1bb62f283b4e44.jpg', 1),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/8c8a661a2ffd15b6', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672838/viettrek/homestays/win-homestay/8c8a661a2ffd15b6.jpg', 2),
  ('win-homestay', 'cloudinary:viettrek/homestays/win-homestay/0b0574c9d2efed9d', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672847/viettrek/homestays/win-homestay/0b0574c9d2efed9d.jpg', 3),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/dea9f9f9c66c3f6f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672554/viettrek/homestays/pu-nhu-house/dea9f9f9c66c3f6f.jpg', 0),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/b49760aea0ef39e2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672557/viettrek/homestays/pu-nhu-house/b49760aea0ef39e2.jpg', 1),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/f323df2a781f7ff5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672560/viettrek/homestays/pu-nhu-house/f323df2a781f7ff5.jpg', 2),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/805c8d9909f7a244', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672562/viettrek/homestays/pu-nhu-house/805c8d9909f7a244.jpg', 3),
  ('pu-nhu-house', 'cloudinary:viettrek/homestays/pu-nhu-house/e9841d2951ac68ca', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672565/viettrek/homestays/pu-nhu-house/e9841d2951ac68ca.jpg', 4),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/ea675f2ac9bd5012', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672568/viettrek/homestays/co-gai-thai-homestay/ea675f2ac9bd5012.jpg', 0),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/929e992d93533558', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672571/viettrek/homestays/co-gai-thai-homestay/929e992d93533558.jpg', 1),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/ed7ab1856c1438ac', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672574/viettrek/homestays/co-gai-thai-homestay/ed7ab1856c1438ac.jpg', 2),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/2658abd0f5730146', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672577/viettrek/homestays/co-gai-thai-homestay/2658abd0f5730146.jpg', 3),
  ('co-gai-thai-homestay', 'cloudinary:viettrek/homestays/co-gai-thai-homestay/3ae3d6c246d8fbb2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672580/viettrek/homestays/co-gai-thai-homestay/3ae3d6c246d8fbb2.jpg', 4),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/1bc6fa023bfc92e4', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672583/viettrek/homestays/moc-homestay/1bc6fa023bfc92e4.jpg', 0),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/139c17a38c1e919e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672586/viettrek/homestays/moc-homestay/139c17a38c1e919e.jpg', 1),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/0a3999d7f935fa8e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672588/viettrek/homestays/moc-homestay/0a3999d7f935fa8e.jpg', 2),
  ('moc-homestay', 'cloudinary:viettrek/homestays/moc-homestay/c9c62db6954c4ee0', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672591/viettrek/homestays/moc-homestay/c9c62db6954c4ee0.jpg', 3),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/cfd2468425002454', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672594/viettrek/homestays/bungalow-xuan-giang/cfd2468425002454.jpg', 0),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/8c890f94f0f45597', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672596/viettrek/homestays/bungalow-xuan-giang/8c890f94f0f45597.jpg', 1),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/0f2740705e34d86f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672599/viettrek/homestays/bungalow-xuan-giang/0f2740705e34d86f.jpg', 2),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/9879e38504f6a2f2', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672601/viettrek/homestays/bungalow-xuan-giang/9879e38504f6a2f2.jpg', 3),
  ('bungalow-xuan-giang', 'cloudinary:viettrek/homestays/bungalow-xuan-giang/bd985e5a77efaa45', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672604/viettrek/homestays/bungalow-xuan-giang/bd985e5a77efaa45.jpg', 4),
  ('hotel-thuat-hoa', 'cloudinary:viettrek/homestays/hotel-thuat-hoa/6f0205c796dcce92', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672607/viettrek/homestays/hotel-thuat-hoa/6f0205c796dcce92.jpg', 0),
  ('hotel-thuat-hoa', 'cloudinary:viettrek/homestays/hotel-thuat-hoa/59befb3953b006b3', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672610/viettrek/homestays/hotel-thuat-hoa/59befb3953b006b3.jpg', 1),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/c46173223df9c0e8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672856/viettrek/homestays/chelly-hotel/c46173223df9c0e8.jpg', 0),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/d66e187a6f29d18e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672861/viettrek/homestays/chelly-hotel/d66e187a6f29d18e.jpg', 1),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/6bb38a31747ccc88', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672870/viettrek/homestays/chelly-hotel/6bb38a31747ccc88.jpg', 2),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/4a3207f67af076f6', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672656/viettrek/homestays/chelly-hotel/4a3207f67af076f6.jpg', 3),
  ('chelly-hotel', 'cloudinary:viettrek/homestays/chelly-hotel/d361006785ce93d5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672877/viettrek/homestays/chelly-hotel/d361006785ce93d5.jpg', 4),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/1c3180205e459d06', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672671/viettrek/homestays/hanh-phuc-creek-homestay/1c3180205e459d06.jpg', 0),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/7f6a5ad07a26439a', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672674/viettrek/homestays/hanh-phuc-creek-homestay/7f6a5ad07a26439a.jpg', 1),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/87e163c4a7c765e5', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672677/viettrek/homestays/hanh-phuc-creek-homestay/87e163c4a7c765e5.jpg', 2),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/a34ae709f1eb8047', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672680/viettrek/homestays/hanh-phuc-creek-homestay/a34ae709f1eb8047.jpg', 3),
  ('hanh-phuc-creek-homestay', 'cloudinary:viettrek/homestays/hanh-phuc-creek-homestay/da308c7061fd5467', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672683/viettrek/homestays/hanh-phuc-creek-homestay/da308c7061fd5467.jpg', 4),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/25240e3f71fa85d0', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672884/viettrek/homestays/hotel-nhat-phuong/25240e3f71fa85d0.jpg', 0),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/a930e2edcb5ef75f', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672700/viettrek/homestays/hotel-nhat-phuong/a930e2edcb5ef75f.jpg', 1),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/d2754cc5086217c8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672892/viettrek/homestays/hotel-nhat-phuong/d2754cc5086217c8.jpg', 2),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/e7c865be67d0610e', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672899/viettrek/homestays/hotel-nhat-phuong/e7c865be67d0610e.jpg', 3),
  ('hotel-nhat-phuong', 'cloudinary:viettrek/homestays/hotel-nhat-phuong/a15872a2324d52e8', 'https://res.cloudinary.com/rf7zlbah/image/upload/v1793672907/viettrek/homestays/hotel-nhat-phuong/a15872a2324d52e8.jpg', 4)
) AS v(slug, storage_key, public_url, sort_order)
JOIN place p ON p.slug = v.slug
JOIN media_asset m ON m.storage_key = v.storage_key
WHERE NOT EXISTS (
  SELECT 1 FROM place_media pm WHERE pm.place_id = p.id AND pm.media_id = m.id
);

COMMIT;

-- Kiểm tra kết quả
SELECT
  p.slug,
  p.name,
  COUNT(pm.media_id) AS so_anh,
  SUM(CASE WHEN pm.role = 'COVER' THEN 1 ELSE 0 END) AS cover
FROM place p
LEFT JOIN place_media pm ON pm.place_id = p.id
WHERE p.slug IN (
  'homestay-anh-tuc','new-highland-hotel','hoa-son-tra-hotel','nha-nghi-duy-vu',
  'homestay-hoa-thao','homestay-cuong-tu','homestay-bao-lan','win-homestay',
  'pu-nhu-house','co-gai-thai-homestay','moc-homestay','bungalow-xuan-giang',
  'hotel-thuat-hoa','chelly-hotel','hanh-phuc-creek-homestay','hotel-nhat-phuong'
)
GROUP BY p.slug, p.name
ORDER BY p.name;
