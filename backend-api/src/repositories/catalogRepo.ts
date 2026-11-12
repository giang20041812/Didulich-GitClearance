import { exec, one, query } from '../db/pool.js';
import { insertRow, updateRow } from '../db/sql.js';
import type { CategoryKind, HighlightType, MediaRole, PlaceVisibility } from '../domain/enums.js';
import { nowLocal } from '../lib/time.js';

// ---- Món ăn đặc sản ---------------------------------------------------------------------------------------------

export interface DishRow {
  id: number;
  slug: string;
  name: string;
  nameNorm: string;
  description: string | null;
  badge: string | null;
  regionId: number | null;
  origin: string | null;
  whereToEat: string | null;
  ingredients: string | null;
  culturalMeaning: string | null;
  servingNote: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string | null;
  videoUrl: string | null;
  visibility: PlaceVisibility;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  regionName: string | null;
  regionPath: string | null;
}

const DISH_WITH_REGION = `SELECT d.*, r.name AS region_name, r.path AS region_path FROM dish d LEFT JOIN region r ON r.id = d.region_id`;

export async function publishedDishes(): Promise<DishRow[]> {
  return query<DishRow>(`${DISH_WITH_REGION} WHERE d.visibility = 'PUBLISHED' ORDER BY d.sort_order ASC, d.name ASC`);
}

export async function dishBySlug(slug: string): Promise<DishRow | null> {
  return one<DishRow>(`${DISH_WITH_REGION} WHERE d.slug = $1`, [slug]);
}

export async function dishById(id: number): Promise<DishRow | null> {
  return one<DishRow>(`${DISH_WITH_REGION} WHERE d.id = $1`, [id]);
}

/** Ảnh của nhiều món: mỗi dòng {id: dishId, value: url}, ảnh COVER đứng đầu rồi theo sortOrder. */
export async function dishImageUrls(dishIds: readonly number[]): Promise<Array<{ id: number; value: string }>> {
  if (dishIds.length === 0) return [];
  return query(
    `SELECT dm.dish_id AS id, ma.public_url AS value FROM dish_media dm JOIN media_asset ma ON ma.id = dm.media_id
      WHERE dm.dish_id = ANY($1)
      ORDER BY dm.dish_id, CASE WHEN dm.role = 'COVER' THEN 0 ELSE 1 END, dm.sort_order ASC`,
    [dishIds],
  );
}

export interface DishMediaItem {
  mediaId: number;
  publicUrl: string | null;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
}

export async function dishMediaWithAsset(dishId: number): Promise<DishMediaItem[]> {
  return query<DishMediaItem>(
    `SELECT dm.media_id, ma.public_url, dm.role, dm.caption, dm.sort_order FROM dish_media dm JOIN media_asset ma ON ma.id = dm.media_id
      WHERE dm.dish_id = $1 ORDER BY CASE WHEN dm.role = 'COVER' THEN 0 ELSE 1 END, dm.sort_order ASC`,
    [dishId],
  );
}

export async function dishHighlights(dishId: number): Promise<Array<{ id: number; type: HighlightType; content: string }>> {
  return query('SELECT id, type, content FROM dish_highlight WHERE dish_id = $1 ORDER BY sort_order ASC, id ASC', [dishId]);
}

export interface ServingPlace {
  id: number;
  slug: string;
  name: string;
  kind: CategoryKind;
  address: string | null;
  isSignature: boolean;
}

/** Địa điểm đang công khai phục vụ món (món đặc trưng của quán đứng trước). */
export async function placesServingDish(dishId: number): Promise<ServingPlace[]> {
  return query<ServingPlace>(
    `SELECT p.id, p.slug, p.name, p.kind, p.address, pd.is_signature FROM place_dish pd JOIN place p ON p.id = pd.place_id
      WHERE pd.dish_id = $1 AND p.is_deleted = FALSE AND p.visibility = 'PUBLISHED'
      ORDER BY pd.is_signature DESC, p.name ASC`,
    [dishId],
  );
}

// ---- Lễ hội -----------------------------------------------------------------------------------------------------

export interface FestivalRow {
  id: number;
  slug: string;
  name: string;
  nameNorm: string;
  seasonNote: string | null;
  coreValue: string | null;
  suitableExperience: string | null;
  etiquetteDont: string | null;
  coverImageUrl: string | null;
  location: string | null;
  regionId: number | null;
  visibility: PlaceVisibility;
  isDeleted: boolean;
  suitableDateStart: string | null;
  suitableDateEnd: string | null;
  regionName: string | null;
}

export interface FestivalOccurrenceRow {
  id: number;
  festivalId: number;
  periodStart: string;
  periodEnd: string;
  isEstimated: boolean;
  note: string | null;
}

export async function publishedFestivals(): Promise<FestivalRow[]> {
  return query<FestivalRow>(
    `SELECT f.*, r.name AS region_name FROM festival f LEFT JOIN region r ON r.id = f.region_id
      WHERE f.visibility = 'PUBLISHED' AND f.is_deleted = FALSE ORDER BY f.id ASC`,
  );
}

export async function occurrencesOf(festivalIds: readonly number[]): Promise<FestivalOccurrenceRow[]> {
  if (festivalIds.length === 0) return [];
  return query<FestivalOccurrenceRow>('SELECT * FROM festival_occurrence WHERE festival_id = ANY($1) ORDER BY id', [festivalIds]);
}

// ---- Cài đặt ứng dụng ---------------------------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const row = await one<{ settingValue: string }>('SELECT setting_value FROM app_setting WHERE setting_key = $1', [key]);
  return row?.settingValue ?? null;
}

export async function putSetting(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at`,
    [key, value, nowLocal()],
  );
}

export { insertRow, updateRow };
