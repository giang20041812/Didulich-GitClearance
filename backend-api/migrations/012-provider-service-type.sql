--liquibase formatted sql

--changeset viettrek:v2-012-provider-service-type
--comment: Loại hình nhà cung cấp chọn ở hộp "Bạn muốn cung cấp gì?" trên trang khách: HOMESTAY, EXPERIENCE (trải nghiệm), TRANSPORT (nhà xe). Hồ sơ và đối tác cũ đều là chủ homestay nên mặc định HOMESTAY. provider_application.details = câu trả lời riêng của từng loại (loại nhà, số phòng; loại trải nghiệm, thời lượng; loại xe, tuyến chạy…) để Admin thẩm định. provider.service_type quyết định cổng NCC hiện những công cụ nào.
ALTER TABLE provider_application ADD COLUMN service_type varchar(16) NOT NULL DEFAULT 'HOMESTAY';
ALTER TABLE provider_application ADD CONSTRAINT ck_provider_application_service_type
    CHECK (service_type IN ('HOMESTAY', 'EXPERIENCE', 'TRANSPORT'));
ALTER TABLE provider_application ADD COLUMN details json;
ALTER TABLE provider ADD COLUMN service_type varchar(16) NOT NULL DEFAULT 'HOMESTAY';
ALTER TABLE provider ADD CONSTRAINT ck_provider_service_type
    CHECK (service_type IN ('HOMESTAY', 'EXPERIENCE', 'TRANSPORT'));
--rollback ALTER TABLE provider DROP CONSTRAINT ck_provider_service_type;
--rollback ALTER TABLE provider DROP COLUMN service_type;
--rollback ALTER TABLE provider_application DROP COLUMN details;
--rollback ALTER TABLE provider_application DROP CONSTRAINT ck_provider_application_service_type;
--rollback ALTER TABLE provider_application DROP COLUMN service_type;
