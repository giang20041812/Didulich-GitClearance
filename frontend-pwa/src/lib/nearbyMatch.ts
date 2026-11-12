import { haversineKm, type LatLng } from '@/lib/distance';
import type { NearbyLandmark, NearbyOffer, NearbySuggestions } from '@/types/nearby';

const MAX_OFFERS = 4;

export interface NearbyHit { landmark: NearbyLandmark; offers: { offer: NearbyOffer; km: number }[] }

/** Điểm mốc gần nhất trong bán kính kích hoạt và các gợi ý mà khách nằm trong bán kính gợi ý của địa điểm. */
export function suggestionsAt(pos: LatLng, data: NearbySuggestions): NearbyHit | null {
  let best: { landmark: NearbyLandmark; km: number } | null = null;
  for (const l of data.landmarks) {
    const km = haversineKm(pos, { lat: Number(l.latitude), lng: Number(l.longitude) });
    if (km * 1000 <= data.triggerRadiusM && (!best || km < best.km)) best = { landmark: l, km };
  }
  if (!best) return null;
  const offers = data.offers
    .map((offer) => ({ offer, km: haversineKm(pos, { lat: Number(offer.latitude), lng: Number(offer.longitude) }) }))
    .filter(({ offer, km }) => km <= offer.radiusKm && offer.placeId !== best?.landmark.id)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_OFFERS);
  return offers.length ? { landmark: best.landmark, offers } : null;
}

