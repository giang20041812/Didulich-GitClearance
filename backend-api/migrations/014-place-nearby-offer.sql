--liquibase formatted sql

--changeset viettrek:v2-014-place-nearby-offer
--comment: "Gợi ý quanh đây" của NCC — khách đã bật gợi ý đi tới gần một điểm nổi tiếng (vd Sống Lưng Khủng Long) thì ứng dụng hiện thông báo gợi ý các địa điểm / dịch vụ của NCC quanh đó. Vị trí của khách KHÔNG gửi lên máy chủ: ứng dụng tải danh sách điểm mốc + gợi ý rồi tự tính khoảng cách. Mỗi địa điểm của NCC (đã duyệt, đang hiển thị, có tọa độ) có tối đa một gợi ý: enabled = NCC bật / tắt, message = lời mời ngắn (≤ 120 ký tự, không chứa đường link), radius_km = bán kính gợi ý 1–30 km tính từ địa điểm. hidden_by_admin + hidden_reason: Admin ẩn gợi ý vi phạm; NCC sửa lời mời không tự mở lại, chỉ Admin mở lại.
CREATE TABLE place_nearby_offer (
    place_id        bigint       PRIMARY KEY REFERENCES place (id) ON DELETE CASCADE,
    enabled         boolean      NOT NULL DEFAULT TRUE,
    message         varchar(120),
    radius_km       integer      NOT NULL DEFAULT 5,
    hidden_by_admin boolean      NOT NULL DEFAULT FALSE,
    hidden_reason   varchar(500),
    hidden_at       timestamp(6),
    updated_at      timestamp(6) NOT NULL,
    updated_by      bigint       REFERENCES account (id) ON DELETE SET NULL,
    CONSTRAINT ck_place_nearby_offer_radius CHECK (radius_km BETWEEN 1 AND 30),
    CONSTRAINT ck_place_nearby_offer_hidden CHECK (NOT hidden_by_admin OR hidden_reason IS NOT NULL)
);
CREATE INDEX idx_place_nearby_offer_updated_by ON place_nearby_offer (updated_by);
ALTER TABLE place_nearby_offer ENABLE ROW LEVEL SECURITY;

INSERT INTO notification_template (code, channel, subject, body_template, is_active) VALUES
  ('PARTNER_NEARBY_OFFER_HIDDEN', 'IN_APP', 'Gợi ý quanh đây bị ẩn',        '{{place_name}}: quản trị viên đã ẩn gợi ý quanh đây. Lý do: {{reason}}', TRUE),
  ('PARTNER_NEARBY_OFFER_SHOWN',  'IN_APP', 'Gợi ý quanh đây hiện trở lại', '{{place_name}}: gợi ý quanh đây đã được hiển thị trở lại.', TRUE);
--rollback DELETE FROM notification_template WHERE code IN ('PARTNER_NEARBY_OFFER_HIDDEN', 'PARTNER_NEARBY_OFFER_SHOWN');
--rollback DROP TABLE place_nearby_offer;
