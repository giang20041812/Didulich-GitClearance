/** "Gợi ý quanh đây" — khớp NearbyDtos (backend-api). */

export interface NearbyLandmark {
  id: number;
  name: string;
  slug: string | null;
  kind: string;
  latitude: number;
  longitude: number;
}

export interface NearbyOffer {
  placeId: number;
  name: string;
  slug: string | null;
  kind: string;
  label: string | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  message: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  priceUnit: string | null;
}

export interface NearbySuggestions {
  triggerRadiusM: number;
  landmarks: NearbyLandmark[];
  offers: NearbyOffer[];
}

export interface LandmarkHit {
  id: number;
  name: string;
  distanceKm: number;
  distanceText: string;
}

export interface PartnerOffer {
  placeId: number;
  placeName: string;
  kind: string;
  label: string | null;
  imageUrl: string | null;
  eligible: boolean;
  notEligibleReason: string | null;
  configured: boolean;
  enabled: boolean;
  message: string | null;
  radiusKm: number;
  hiddenByAdmin: boolean;
  hiddenReason: string | null;
  updatedAt: string | null;
  landmarks: LandmarkHit[];
}

export interface PartnerOffers {
  radiusMinKm: number;
  radiusMaxKm: number;
  messageMax: number;
  places: PartnerOffer[];
}

export interface OfferInput {
  enabled: boolean;
  message: string | null;
  radiusKm: number;
}

export interface AdminOfferRow {
  placeId: number;
  placeName: string;
  kind: string;
  label: string | null;
  providerId: number | null;
  providerName: string | null;
  enabled: boolean;
  message: string | null;
  radiusKm: number;
  hiddenByAdmin: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  updatedAt: string;
  placeVisible: boolean;
}
