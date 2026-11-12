--liquibase formatted sql

--changeset viettrek:v2-009-journey-unify
--comment: Gộp lịch trình mẫu (gói) và lịch trình của khách về một dạng. journey.source: SUGGESTED (gói mẫu — không có chủ, template_code = mã gói) / TRAVELER (của khách). template_id: gói gốc của lịch trình khách (khóa ngoại về chính bảng journey). journey_stop.origin: SUGGESTED (mục của gói / chép từ gói, source_stop_id = mục gốc) / CUSTOM (khách tự thêm). journey_day: tên + lời dặn từng ngày. journey_tag: tag lọc (TRIP_DINING / TRIP_GOAL). journey_stop_dish / journey_stop_alternative: ảnh món và phương án đổi điểm của mục (sort_order liền 0..n-1 cho @OrderColumn).
ALTER TABLE journey
    ALTER COLUMN traveler_id DROP NOT NULL,
    ADD COLUMN source       varchar(16) NOT NULL DEFAULT 'TRAVELER',
    ADD COLUMN template_id  bigint REFERENCES journey (id) ON DELETE SET NULL,
    ADD COLUMN summary      varchar(500),
    ADD COLUMN day_count    smallint,
    ADD COLUMN nights       smallint,
    ADD COLUMN price_from   numeric(14, 2),
    ADD COLUMN visibility   varchar(16),
    ADD COLUMN sort_order   integer     NOT NULL DEFAULT 0,
    ADD COLUMN package_info jsonb,
    ADD CONSTRAINT ck_journey_source CHECK (source IN ('SUGGESTED', 'TRAVELER')),
    ADD CONSTRAINT ck_journey_owner CHECK ((source = 'TRAVELER') = (traveler_id IS NOT NULL)),
    ADD CONSTRAINT ck_journey_suggested CHECK (source = 'TRAVELER' OR (template_code IS NOT NULL AND day_count IS NOT NULL
        AND visibility IS NOT NULL AND template_id IS NULL AND booking_id IS NULL AND share_token IS NULL AND published_at IS NULL)),
    ADD CONSTRAINT ck_journey_day_count CHECK (day_count IS NULL OR (day_count BETWEEN 1 AND 14 AND (nights IS NULL OR nights BETWEEN 0 AND day_count))),
    ADD CONSTRAINT ck_journey_price_from CHECK (price_from IS NULL OR price_from >= 0),
    ADD CONSTRAINT ck_journey_visibility CHECK (visibility IS NULL OR visibility IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
    ADD CONSTRAINT ck_journey_package_info CHECK (package_info IS NULL OR jsonb_typeof(package_info) = 'object');
CREATE UNIQUE INDEX uq_journey_suggested_code ON journey (template_code) WHERE source = 'SUGGESTED';
CREATE INDEX idx_journey_template ON journey (template_id);
CREATE INDEX idx_journey_suggested ON journey (region_id, sort_order) WHERE source = 'SUGGESTED';

ALTER TABLE journey_stop
    ADD COLUMN origin         varchar(16) NOT NULL DEFAULT 'CUSTOM',
    ADD COLUMN source_stop_id bigint REFERENCES journey_stop (id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_journey_stop_origin CHECK (origin IN ('SUGGESTED', 'CUSTOM'));
CREATE INDEX idx_journey_stop_source ON journey_stop (source_stop_id);

CREATE TABLE journey_day (
    journey_id bigint   NOT NULL REFERENCES journey (id) ON DELETE CASCADE,
    day_index  smallint NOT NULL,
    title      varchar(160),
    note       varchar(1000),
    PRIMARY KEY (journey_id, day_index),
    CONSTRAINT ck_journey_day_index CHECK (day_index BETWEEN 1 AND 61),
    CONSTRAINT ck_journey_day_content CHECK (title IS NOT NULL OR note IS NOT NULL)
);
ALTER TABLE journey_day ENABLE ROW LEVEL SECURITY;

CREATE TABLE journey_tag (
    journey_id bigint NOT NULL REFERENCES journey (id) ON DELETE CASCADE,
    tag_id     bigint NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    PRIMARY KEY (journey_id, tag_id)
);
CREATE INDEX idx_journey_tag_tag ON journey_tag (tag_id);
ALTER TABLE journey_tag ENABLE ROW LEVEL SECURITY;

CREATE TABLE journey_stop_dish (
    stop_id    bigint  NOT NULL REFERENCES journey_stop (id) ON DELETE CASCADE,
    dish_id    bigint  NOT NULL REFERENCES dish (id) ON DELETE CASCADE,
    sort_order integer NOT NULL,
    PRIMARY KEY (stop_id, sort_order)
);
CREATE INDEX idx_journey_stop_dish_dish ON journey_stop_dish (dish_id);
ALTER TABLE journey_stop_dish ENABLE ROW LEVEL SECURITY;

CREATE TABLE journey_stop_alternative (
    stop_id    bigint  NOT NULL REFERENCES journey_stop (id) ON DELETE CASCADE,
    place_id   bigint  NOT NULL REFERENCES place (id) ON DELETE CASCADE,
    sort_order integer NOT NULL,
    PRIMARY KEY (stop_id, sort_order)
);
CREATE INDEX idx_journey_stop_alternative_place ON journey_stop_alternative (place_id);
ALTER TABLE journey_stop_alternative ENABLE ROW LEVEL SECURITY;

--changeset viettrek:v2-009-suggested-journeys
--comment: Chép các gói (trip_template.content) thành lịch trình SUGGESTED + ngày + tag + mục + món + phương án, rồi nối lịch trình của khách đã lên từ gói (template_id, mục trùng Ngày N + giờ bắt đầu thành SUGGESTED + source_stop_id, chép món / phương án, tên ngày, tag). Điểm / món tham chiếu theo slug nên chỉ chạy khi mỗi gói đã có điểm trong danh mục: production dựng schema trên DB trống rồi mới chép dữ liệu (docs/db-v2.md mục 6 bước 4) — trước đó changeset chờ (onFail CONTINUE, LiquibaseStartupConfig không lấy lock) và tự chạy ở lần khởi động sau. Điểm không còn thì mục PLACE thành ACTIVITY giữ tên (như instantiateTemplate ở frontend).
--preconditions onFail:CONTINUE onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(*) FROM trip_template t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.content -> 'items') i JOIN place p ON p.slug = i ->> 'place' AND p.is_deleted = FALSE)
INSERT INTO journey (source, traveler_id, region_id, template_code, title, summary, day_count, nights, price_from, visibility,
                     sort_order, package_info, created_at, updated_at)
SELECT 'SUGGESTED', NULL, t.region_id, t.code, t.title, t.summary, t.days, t.nights, t.price_from, t.visibility, t.sort_order,
       jsonb_strip_nulls(jsonb_build_object('included', t.content -> 'included', 'highlights', t.content -> 'highlights',
                                            'addons', t.content -> 'addons')),
       t.created_at, t.updated_at
FROM trip_template t
WHERE NOT EXISTS (SELECT 1 FROM journey j WHERE j.source = 'SUGGESTED' AND j.template_code = t.code);

INSERT INTO journey_day (journey_id, day_index, title, note)
SELECT j.id, g.day, t.content -> 'dayTitles' ->> (g.day - 1), t.content -> 'dayNotes' ->> (g.day - 1)
FROM trip_template t
JOIN journey j ON j.source = 'SUGGESTED' AND j.template_code = t.code
CROSS JOIN LATERAL generate_series(1, t.days) AS g(day)
WHERE coalesce(t.content -> 'dayTitles' ->> (g.day - 1), t.content -> 'dayNotes' ->> (g.day - 1)) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO journey_tag (journey_id, tag_id)
SELECT j.id, tt.tag_id
FROM trip_template_tag tt
JOIN trip_template t ON t.id = tt.template_id
JOIN journey j ON j.source = 'SUGGESTED' AND j.template_code = t.code
ON CONFLICT DO NOTHING;

INSERT INTO journey_stop (journey_id, place_id, kind, title, day_index, day_session, start_time, end_time, note, addons,
                          sort_order, origin)
SELECT j.id, p.id,
       CASE WHEN i.item ->> 'kind' = 'PLACE' AND p.id IS NULL THEN 'ACTIVITY' ELSE i.item ->> 'kind' END,
       i.item ->> 'title', (i.item ->> 'day')::smallint,
       CASE WHEN (i.item ->> 'start')::time < time '11:00' THEN 'MORNING'
            WHEN (i.item ->> 'start')::time < time '14:00' THEN 'NOON'
            WHEN (i.item ->> 'start')::time < time '18:00' THEN 'AFTERNOON'
            ELSE 'EVENING' END,
       (i.item ->> 'start')::time, (i.item ->> 'end')::time, i.item ->> 'note',
       (SELECT string_agg(a.code, ',' ORDER BY a.ord) FROM jsonb_array_elements_text(i.item -> 'addons') WITH ORDINALITY AS a(code, ord)),
       (i.ord - 1)::integer, 'SUGGESTED'
FROM trip_template t
JOIN journey j ON j.source = 'SUGGESTED' AND j.template_code = t.code
CROSS JOIN LATERAL jsonb_array_elements(t.content -> 'items') WITH ORDINALITY AS i(item, ord)
LEFT JOIN place p ON p.slug = i.item ->> 'place' AND p.is_deleted = FALSE
WHERE NOT EXISTS (SELECT 1 FROM journey_stop s WHERE s.journey_id = j.id);

INSERT INTO journey_stop_dish (stop_id, dish_id, sort_order)
SELECT s.id, d.id, (row_number() OVER (PARTITION BY s.id ORDER BY x.ord) - 1)::integer
FROM trip_template t
JOIN journey j ON j.source = 'SUGGESTED' AND j.template_code = t.code
CROSS JOIN LATERAL jsonb_array_elements(t.content -> 'items') WITH ORDINALITY AS i(item, ord)
JOIN journey_stop s ON s.journey_id = j.id AND s.sort_order = i.ord - 1
CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(i.item -> 'dishes', '[]'::jsonb)) WITH ORDINALITY AS x(slug, ord)
JOIN dish d ON d.slug = x.slug
ON CONFLICT DO NOTHING;

INSERT INTO journey_stop_alternative (stop_id, place_id, sort_order)
SELECT s.id, p.id, (row_number() OVER (PARTITION BY s.id ORDER BY x.ord) - 1)::integer
FROM trip_template t
JOIN journey j ON j.source = 'SUGGESTED' AND j.template_code = t.code
CROSS JOIN LATERAL jsonb_array_elements(t.content -> 'items') WITH ORDINALITY AS i(item, ord)
JOIN journey_stop s ON s.journey_id = j.id AND s.sort_order = i.ord - 1
CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(i.item -> 'alternatives', '[]'::jsonb)) WITH ORDINALITY AS x(slug, ord)
JOIN place p ON p.slug = x.slug AND p.is_deleted = FALSE
ON CONFLICT DO NOTHING;

UPDATE journey j SET template_id = s.id
FROM journey s
WHERE j.source = 'TRAVELER' AND j.template_id IS NULL AND s.source = 'SUGGESTED' AND s.template_code = j.template_code;

UPDATE journey_stop c SET origin = 'SUGGESTED', source_stop_id = ts.id
FROM journey j, journey_stop ts
WHERE c.journey_id = j.id AND j.source = 'TRAVELER' AND j.template_id IS NOT NULL AND c.source_stop_id IS NULL
  AND ts.journey_id = j.template_id AND ts.day_index = c.day_index AND ts.start_time = c.start_time;

INSERT INTO journey_stop_dish (stop_id, dish_id, sort_order)
SELECT c.id, d.dish_id, d.sort_order
FROM journey_stop c
JOIN journey j ON j.id = c.journey_id AND j.source = 'TRAVELER'
JOIN journey_stop_dish d ON d.stop_id = c.source_stop_id
WHERE NOT EXISTS (SELECT 1 FROM journey_stop_dish x WHERE x.stop_id = c.id)
ON CONFLICT DO NOTHING;

INSERT INTO journey_stop_alternative (stop_id, place_id, sort_order)
SELECT o.stop_id, o.place_id, (row_number() OVER (PARTITION BY o.stop_id ORDER BY o.ord) - 1)::integer
FROM (SELECT c.id AS stop_id, ts.place_id, -1 AS ord
      FROM journey_stop c
      JOIN journey j ON j.id = c.journey_id AND j.source = 'TRAVELER'
      JOIN journey_stop ts ON ts.id = c.source_stop_id
      WHERE ts.place_id IS NOT NULL AND ts.place_id IS DISTINCT FROM c.place_id
        AND EXISTS (SELECT 1 FROM journey_stop_alternative ta WHERE ta.stop_id = ts.id)
      UNION ALL
      SELECT c.id, a.place_id, a.sort_order
      FROM journey_stop c
      JOIN journey j ON j.id = c.journey_id AND j.source = 'TRAVELER'
      JOIN journey_stop_alternative a ON a.stop_id = c.source_stop_id
      WHERE a.place_id IS DISTINCT FROM c.place_id) o
WHERE NOT EXISTS (SELECT 1 FROM journey_stop_alternative x WHERE x.stop_id = o.stop_id)
ON CONFLICT DO NOTHING;

INSERT INTO journey_day (journey_id, day_index, title, note)
SELECT j.id, d.day_index, d.title, d.note
FROM journey j
JOIN journey_day d ON d.journey_id = j.template_id
WHERE j.source = 'TRAVELER' AND NOT EXISTS (SELECT 1 FROM journey_day x WHERE x.journey_id = j.id)
ON CONFLICT DO NOTHING;

INSERT INTO journey_tag (journey_id, tag_id)
SELECT j.id, t.tag_id
FROM journey j
JOIN journey_tag t ON t.journey_id = j.template_id
WHERE j.source = 'TRAVELER' AND NOT EXISTS (SELECT 1 FROM journey_tag x WHERE x.journey_id = j.id)
ON CONFLICT DO NOTHING;

INSERT INTO app_setting (setting_key, setting_value, updated_at)
VALUES ('catalog_version', 'v2-009-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at;
