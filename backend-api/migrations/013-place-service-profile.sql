--liquibase formatted sql

--changeset viettrek:v2-013-place-service-profile
--comment: Thông tin riêng của dịch vụ nhà xe (place.kind TRANSPORT) và trải nghiệm (CULTURE) do NCC đăng hoặc Admin nhập — trước đây trang Di chuyển phải đoán loại xe / tuyến từ tên địa điểm. service_group: nhóm dịch vụ (nhà xe: LOCAL_MOTO xe ôm / xe máy địa phương, TOUR_MOTO tour xe máy, SELF_DRIVE thuê xe tự lái, INTERCITY_BUS xe khách liên tỉnh, SHARED_CAR xe ghép / taxi; trải nghiệm: TREKKING, CRAFT, CUISINE, CULTURE, ADVENTURE, FARM). Giá "từ" dùng place.price_ref_min + price_unit_note. languages = mã ngôn ngữ cách nhau dấu phẩy (VI,EN,HMONG…).
CREATE TABLE place_service_profile (
    place_id         bigint       PRIMARY KEY REFERENCES place (id) ON DELETE CASCADE,
    service_group    varchar(24)  NOT NULL,
    vehicle_type     varchar(64),
    route_from       varchar(120),
    route_to         varchar(120),
    departure_times  varchar(255),
    duration_minutes integer,
    seats            integer,
    group_size_max   integer,
    languages        varchar(64),
    includes         varchar(1000),
    updated_at       timestamp(6) NOT NULL,
    CONSTRAINT ck_place_service_profile_group CHECK (service_group IN ('LOCAL_MOTO', 'TOUR_MOTO', 'SELF_DRIVE',
        'INTERCITY_BUS', 'SHARED_CAR', 'TREKKING', 'CRAFT', 'CUISINE', 'CULTURE', 'ADVENTURE', 'FARM')),
    CONSTRAINT ck_place_service_profile_duration CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 10 AND 10080),
    CONSTRAINT ck_place_service_profile_seats CHECK (seats IS NULL OR seats BETWEEN 1 AND 100),
    CONSTRAINT ck_place_service_profile_group_size CHECK (group_size_max IS NULL OR group_size_max BETWEEN 1 AND 500)
);
ALTER TABLE place_service_profile ENABLE ROW LEVEL SECURITY;
--rollback DROP TABLE place_service_profile;
