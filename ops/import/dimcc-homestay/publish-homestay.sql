-- Đăng lên web các homestay có trạng thái "Chưa đăng" trong 'Tổng hợp thông tin ĐiMCC.xlsx' (đang ở DRAFT).
-- Chạy trong Supabase → SQL Editor. Không đụng dữ liệu khác; chạy lại nhiều lần vẫn an toàn.
UPDATE place
SET visibility = 'PUBLISHED'
WHERE kind = 'HOMESTAY'
  AND is_deleted = FALSE
  AND visibility = 'DRAFT'
  AND slug IN (
    'chelly-hotel', 'chiba-ecolodge', 'doi-doi-gio', 'ha-chau-2-homestay', 'hanh-phuc-creek', 'homestay-bao-lan',
    'homestay-hien-quang', 'hotel-moon-2', 'hotel-thuat-hoa', 'mai-linh-hotel', 'moc-homestay', 'mu-cang-chai-lu-tre',
    'nang-hotel', 'nha-nghi-ngu', 'nhat-phuong-homestay', 'sky-motel'
  );

-- Kiểm tra: mong đợi 30 homestay PUBLISHED
SELECT visibility, count(*) FROM place WHERE kind = 'HOMESTAY' AND is_deleted = FALSE GROUP BY visibility;
