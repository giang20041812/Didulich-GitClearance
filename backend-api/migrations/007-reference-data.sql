--liquibase formatted sql

--changeset viettrek:v2-007-notification-templates
--comment: Mẫu thông báo đang được code dùng (bỏ các mẫu của luồng đã gỡ: yêu cầu bổ sung thông tin, hết hạn chờ xác nhận, SMS chấp nhận / từ chối cũ).
INSERT INTO notification_template (code, channel, subject, body_template, is_active) VALUES
  ('PROVIDER_APPLICATION_APPROVED', 'SMS', NULL, 'DuLichSo: Ho so doi tac {{business_name}} da duoc duyet. Ban co the dang nhap cong doi tac.', TRUE),
  ('PROVIDER_APPLICATION_REJECTED', 'SMS', NULL, 'DuLichSo: Ho so doi tac {{business_name}} chua duoc duyet. Ly do: {{reason}}', TRUE),
  ('BOOKING_CANCELLED_PROVIDER_LOCKED', 'SMS', NULL, 'DuLichSo: Rat tiec, dat phong {{booking_code}} cua ban da bi huy do tai khoan Nha cung cap hien khong con hoat dong. Chung toi xin loi vi su bat tien nay.', TRUE),
  ('REVIEW_REMOVED_CUSTOMER', 'IN_APP', 'Đánh giá của bạn đã bị gỡ', 'Đánh giá của bạn cho {{homestay_name}} đã bị gỡ. Lý do: {{reason}}. Chúng tôi xin lỗi vì sự bất tiện này, rất mong bạn thông cảm.', TRUE),
  ('REVIEW_PROVIDER_REPLY', 'IN_APP', 'Nhà cung cấp đã phản hồi đánh giá', 'NCC tại {{place_name}} đã phản hồi đánh giá của bạn cho đơn {{booking_code}}.', TRUE),
  ('ADMIN_NEW_PROVIDER_APPLICATION', 'IN_APP', 'Hồ sơ đăng ký NCC mới', 'Nhà cung cấp "{{business_name}}" ({{contact_name}}) vừa gửi hồ sơ đăng ký, đang chờ duyệt.', TRUE),
  ('ADMIN_NEW_TRAVELER', 'IN_APP', 'Khách du lịch mới đăng ký', 'Khách "{{full_name}}" vừa đăng ký tài khoản.', TRUE),
  ('ADMIN_NEW_CHANGE_REQUEST', 'IN_APP', 'Yêu cầu thay đổi mới từ NCC', '{{place_name}}: {{summary}} — đang chờ duyệt.', TRUE),
  ('ADMIN_NEW_SOS', 'IN_APP', 'SOS khẩn cấp mới', '{{requester_name}} ({{requester_phone}}) cần hỗ trợ khẩn cấp.', TRUE),
  ('ADMIN_NEW_BOOKING', 'IN_APP', 'Đơn đặt phòng mới', 'Đơn {{booking_code}} tại {{place_name}} vừa được tạo.', TRUE),
  ('ADMIN_BOOKING_UPDATED', 'IN_APP', 'Khách thay đổi đơn đặt phòng', 'Khách vừa thay đổi đơn {{booking_code}} — cần xác nhận lại.', TRUE),
  ('ADMIN_BOOKING_CONFIRMED', 'IN_APP', 'Đơn đã được xác nhận', 'Đơn {{booking_code}} đã được xác nhận, chờ khách thanh toán.', TRUE),
  ('ADMIN_BOOKING_PAID', 'IN_APP', 'Đơn đã thanh toán', 'Đơn {{booking_code}} đã được ghi nhận thanh toán.', TRUE),
  ('ADMIN_BOOKING_CANCELLED', 'IN_APP', 'Đơn đặt phòng đã bị hủy', 'Đơn {{booking_code}} đã bị hủy.', TRUE),
  ('ADMIN_BOOKING_CHECKED_IN', 'IN_APP', 'Khách đã nhận phòng', 'Đơn {{booking_code}}: khách đã nhận phòng.', TRUE),
  ('PARTNER_NEW_BOOKING', 'IN_APP', 'Đơn đặt phòng mới', 'Đơn {{booking_code}} đang chờ xác nhận.', TRUE),
  ('PARTNER_BOOKING_UPDATED', 'IN_APP', 'Khách thay đổi đơn đặt phòng', 'Khách vừa thay đổi đơn {{booking_code}} — cần xác nhận lại.', TRUE),
  ('PARTNER_BOOKING_CONFIRMED', 'IN_APP', 'Đơn đã được xác nhận', 'Đơn {{booking_code}} đã được xác nhận, chờ khách thanh toán.', TRUE),
  ('PARTNER_BOOKING_PAID', 'IN_APP', 'Đơn đã thanh toán', 'Đơn {{booking_code}} đã được ghi nhận thanh toán.', TRUE),
  ('PARTNER_BOOKING_CANCELLED', 'IN_APP', 'Đơn đặt phòng đã bị hủy', 'Đơn {{booking_code}} đã bị hủy.', TRUE),
  ('PARTNER_BOOKING_CHECKED_IN', 'IN_APP', 'Khách đã nhận phòng', 'Đơn {{booking_code}}: khách đã nhận phòng.', TRUE),
  ('BOOKING_CREATED', 'IN_APP', 'Đã đặt phòng thành công', 'Yêu cầu đặt phòng {{booking_code}} tại {{place_name}} đã được gửi.', TRUE),
  ('BOOKING_CONFIRMED', 'IN_APP', 'Đặt phòng đã được xác nhận', 'Đơn của bạn đã được xác nhận, vui lòng thanh toán theo hướng dẫn.', TRUE),
  ('BOOKING_PAID', 'IN_APP', 'Đã ghi nhận thanh toán', 'Đơn {{booking_code}} đã được ghi nhận thanh toán.', TRUE),
  ('BOOKING_REJECTED', 'IN_APP', 'Đơn đặt phòng bị từ chối', 'Rất tiếc, đơn {{booking_code}} tại {{place_name}} đã bị từ chối.', TRUE),
  ('BOOKING_CANCELLED', 'IN_APP', 'Đơn đặt phòng đã bị hủy', 'Đơn {{booking_code}} đã bị hủy.', TRUE),
  ('JOURNEY_REMINDER', 'IN_APP', 'Đến giờ tham quan', 'Có vẻ đã đến lúc tham quan {{place_name}} rồi, hãy bấm vào để xem cẩm nang địa điểm nhé', TRUE);

--changeset viettrek:v2-007-regions
--comment: Khu vực khởi tạo: Yên Bái -> Mù Cang Chải / Văn Chấn -> xã (level 1 -> 2 -> 3).
INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active) VALUES
  ('YEN_BAI', 'Yên Bái', 'yen bai', 1, NULL, 'Yên Bái', TRUE);

INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active)
SELECT v.code, v.name, v.name_norm, 2, p.id, 'Yên Bái/' || v.name, TRUE
FROM (VALUES
  ('MU_CANG_CHAI', 'Mù Cang Chải', 'mu cang chai'),
  ('VAN_CHAN',     'Văn Chấn',     'van chan')
) AS v(code, name, name_norm)
JOIN region p ON p.code = 'YEN_BAI';

INSERT INTO region (code, name, name_norm, level, parent_id, path, is_active)
SELECT v.code, v.name, v.name_norm, 3, p.id, 'Yên Bái/' || p.name || '/' || v.name, TRUE
FROM (VALUES
  (1,  'MCC_LA_PAN_TAN',   'La Pán Tẩn',              'la pan tan',              'MU_CANG_CHAI'),
  (2,  'MCC_CHE_CU_NHA',   'Chế Cu Nha',              'che cu nha',              'MU_CANG_CHAI'),
  (3,  'MCC_DE_XU_PHINH',  'Dế Xu Phình',             'de xu phinh',             'MU_CANG_CHAI'),
  (4,  'MCC_NAM_KHAT',     'Nậm Khắt',                'nam khat',                'MU_CANG_CHAI'),
  (5,  'MCC_THI_TRAN',     'Thị trấn Mù Cang Chải',   'thi tran mu cang chai',   'MU_CANG_CHAI'),
  (6,  'VC_TU_LE',         'Tú Lệ',                   'tu le',                   'VAN_CHAN'),
  (7,  'VC_SUOI_GIANG',    'Suối Giàng',              'suoi giang',              'VAN_CHAN'),
  (8,  'MCC_CAO_PHA',      'Cao Phạ',                 'cao pha',                 'MU_CANG_CHAI'),
  (9,  'MCC_KHAO_MANG',    'Khao Mang',               'khao mang',               'MU_CANG_CHAI'),
  (10, 'MCC_PUNG_LUONG',   'Púng Luông',              'pung luong',              'MU_CANG_CHAI'),
  (11, 'MCC_LAO_CHAI',     'Lao Chải',                'lao chai',                'MU_CANG_CHAI'),
  (12, 'MCC_MO_DE',        'Mồ Dề',                   'mo de',                   'MU_CANG_CHAI'),
  (13, 'MCC_KIM_NOI',      'Kim Nọi',                 'kim noi',                 'MU_CANG_CHAI'),
  (14, 'MCC_HO_BON',       'Hồ Bốn',                  'ho bon',                  'MU_CANG_CHAI'),
  (15, 'MCC_CHE_TAO',      'Chế Tạo',                 'che tao',                 'MU_CANG_CHAI'),
  (16, 'MCC_NAM_CO',       'Nậm Có',                  'nam co',                  'MU_CANG_CHAI')
) AS v(ord, code, name, name_norm, parent_code)
JOIN region p ON p.code = v.parent_code
ORDER BY v.ord;

--changeset viettrek:v2-007-amenities
--comment: Tiện nghi khởi tạo (mã khớp với bảng icon trong PlaceDetailServiceImpl.resolveAmenityIcon).
INSERT INTO amenity (code, name, scope, is_essential, sort_order, is_active) VALUES
  ('FREE_WIFI',        'Wifi miễn phí',                'PLACE', TRUE,  10, TRUE),
  ('FREE_PARKING',     'Chỗ đỗ xe miễn phí',           'PLACE', TRUE,  20, TRUE),
  ('FREE_KITCHEN',     'Bếp dùng chung',               'PLACE', FALSE, 30, TRUE),
  ('MEAL_ON_DEMAND',   'Phục vụ bữa ăn theo yêu cầu',  'PLACE', FALSE, 40, TRUE),
  ('BUS_PICKUP',       'Đón khách tại bến xe',         'PLACE', FALSE, 50, TRUE),
  ('MOTORBIKE_RENTAL', 'Cho thuê xe máy',              'PLACE', FALSE, 60, TRUE),
  ('BBQ_AREA',         'Khu nướng BBQ',                'PLACE', FALSE, 70, TRUE),
  ('FIREPLACE',        'Bếp lửa sưởi ấm',              'PLACE', FALSE, 80, TRUE),
  ('HOT_WATER',        'Nước nóng',                    'ROOM',  TRUE,  10, TRUE),
  ('MOSQUITO_NET',     'Màn chống muỗi',               'ROOM',  FALSE, 20, TRUE),
  ('AIR_CONDITIONING', 'Điều hòa',                     'ROOM',  FALSE, 30, TRUE),
  ('BALCONY',          'Ban công',                     'ROOM',  FALSE, 40, TRUE),
  ('BATHTUB',          'Bồn tắm',                      'ROOM',  FALSE, 50, TRUE);

--changeset viettrek:v2-007-payment-gateways
--comment: MANUAL = ghi nhận thủ công khi Admin / NCC bấm "Đã thanh toán"; SEPAY = chuyển khoản qua SEPay (webhook).
INSERT INTO payment_gateway (code, name, is_active) VALUES
  ('MANUAL', 'Ghi nhận thủ công (Admin / NCC)', TRUE),
  ('SEPAY',  'Chuyển khoản ngân hàng (SEPay)',   TRUE);
