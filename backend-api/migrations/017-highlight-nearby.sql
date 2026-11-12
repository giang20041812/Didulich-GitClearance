--liquibase formatted sql

--changeset viettrek:v2-017-highlight-nearby
--comment: Thêm loại NEARBY cho place_highlight: "Khoảng cách đến điểm vui chơi nổi bật" (hiện ở trang chi tiết homestay).
ALTER TABLE place_highlight
  DROP CONSTRAINT ck_place_highlight_type;

ALTER TABLE place_highlight
  ADD CONSTRAINT ck_place_highlight_type
    CHECK (type IN ('PRO', 'CON', 'TIP', 'PAIN_POINT', 'NEARBY'));
