--liquibase formatted sql

--changeset viettrek:v2-018-rename-yen-bai-to-lao-cai
--comment: Đổi tên tỉnh Yên Bái thành Lào Cai trong bảng region và cập nhật dữ liệu địa điểm.
UPDATE region
SET code = 'LAO_CAI',
    name = 'Lào Cai',
    name_norm = 'lao cai',
    path = 'Lào Cai'
WHERE code = 'YEN_BAI' OR (level = 1 AND name = 'Yên Bái');

UPDATE region
SET path = regexp_replace(path, '^Yên Bái/', 'Lào Cai/')
WHERE path LIKE 'Yên Bái/%';

UPDATE place
SET address = replace(
      replace(
        replace(address, 'tỉnh Yên Bái / Lào Cai', 'tỉnh Lào Cai'),
        'phường Yên Bái, Lào Cai', 'tỉnh Lào Cai'
      ),
      'Yên Bái', 'Lào Cai'
    )
WHERE address LIKE '%Yên Bái%';

UPDATE place
SET address = replace(address, 'Yen Bai', 'Lao Cai')
WHERE address LIKE '%Yen Bai%';

UPDATE place
SET description = replace(
      replace(description, 'phường Yên Bái, Lào Cai', 'tỉnh Lào Cai'),
      'Yên Bái', 'Lào Cai'
    )
WHERE description LIKE '%Yên Bái%';

UPDATE place
SET name = replace(name, 'Yên Bái', 'Lào Cai'),
    name_norm = replace(name_norm, 'yen bai', 'lao cai')
WHERE name LIKE '%Yên Bái%' OR name_norm LIKE '%yen bai%';

INSERT INTO app_setting (setting_key, setting_value, updated_at)
VALUES ('catalog_version', now()::text, now())
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    updated_at = now();

