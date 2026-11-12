--liquibase formatted sql

--changeset viettrek:v2-016-place-data-verified
--comment: Cờ "dữ liệu đã xác thực" (bật / tắt) do Admin gán trên từng địa điểm (homestay, điểm tham quan, nhà hàng, dịch vụ...): TRUE = thông tin đã được đối chiếu thực tế / là dữ liệu chính thống, FALSE = dữ liệu mới nhập từ file nghiên cứu (DATA CHÍNH THỐNG.xlsx) hoặc do NCC tự đăng, chưa kiểm chứng. Độc lập với place.verification (quy trình duyệt nội dung 4 trạng thái) và coord_verified (tọa độ). Địa điểm đã có tại thời điểm thêm cột là dữ liệu chính thống nên được đặt TRUE; sau đó mặc định FALSE cho mọi địa điểm tạo mới.
ALTER TABLE place ADD COLUMN data_verified boolean NOT NULL DEFAULT TRUE;
ALTER TABLE place ALTER COLUMN data_verified SET DEFAULT FALSE;
--rollback ALTER TABLE place DROP COLUMN data_verified;
