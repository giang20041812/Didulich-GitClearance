import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import {
  MapPin,
  Star,
  Share2,
  Heart,
  Mountain,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
  Navigation,
  MessageSquareReply,
  BedDouble,
  Compass,
  MessagesSquare,
  ArrowLeft,
  ArrowRight,
  PlayCircle,
  Images,
  Copy,
  Check,
  Sparkles,
  Route,
  Users,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useHomestayViewTracking } from '@/hooks/useHomestayViewTracking';
import { getHomestayById, peekHomestay, fetchPlaceReviews } from '@/services/homestayService';
import { fetchBookedDatesByPlace } from '@/services/bookingService';
import type { HomestayDetailDto, RoomTypeDto } from '@/types/homestay';
import type { BookedDateRangeDto, BookingNavigationState, BookingRoomChoice } from '@/types/booking';
import type { ReviewDto } from '@/types/review';
import ImagePlaceholder from '@/components/ui/ImagePlaceholder';
import JourneyContextBanner from '@/components/trip/JourneyContextBanner';
import SectionNavigator, { type SectionLink } from '@/components/homestay/SectionNavigator';
import RoomBookingCard from '@/components/homestay/RoomBookingCard';
import type { RoomTypeTab } from '@/components/homestay/RoomTypeTabs';
import ExploreNearbySection from '@/components/explore/ExploreNearbySection';
import { buildOccupancy, isDateKey, minAvailableInRange, nightsBetween, todayKey } from '@/lib/roomAvailability';
import { MAX_ROOMS_PER_BOOKING, roomChoiceFrom } from '@/lib/roomSelection';
import TikTokEmbedPlayer from '@/components/homestay/TikTokEmbedPlayer';
import { openGoogleMapsDirections } from '@/lib/mapUtils';
import ImageCarousel from '@/components/common/ImageCarousel';
import { isFavorite as checkFavorite, toggleFavorite, onFavoritesChange } from '@/lib/favorites';
import { useNearViewport } from '@/hooks/useNearViewport';
import { mediaUrl } from '@/lib/mediaUrl';
import { parseJourneyId, stayContextFor } from '@/lib/stayContext';
import StayTripSuggest, { type StayTripPick } from '@/components/trip/StayTripSuggest';
import { isPlaceholderOrGenericUrl } from '@/lib/placeImages';

/** Phân tích số phòng chọn sẵn từ URL: ?rooms=12x1.13x2 */
function parseRoomCounts(value: string | null): Record<number, number> | null {
  if (!value) return null;
  const counts: Record<number, number> = {};
  for (const part of value.split('.')) {
    const [id, count] = part.split('x').map(Number);
    if (id && id > 0 && count && count > 0 && count <= MAX_ROOMS_PER_BOOKING) {
      counts[id] = count;
    }
  }
  return Object.keys(counts).length ? counts : null;
}

const formatRoomCounts = (counts: Record<number, number>) =>
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${id}x${count}`)
    .join('.');

const BOOKED_DATES_REFRESH_GAP_MS = 3000;

/**
 * Mô tả chủ nhà viết thành gạch đầu dòng cho dễ đọc lướt. Tách theo dòng, rồi theo câu (dấu câu sau chữ thường / số rồi
 * khoảng trắng — "TP. Yên Bái", "1.200 m" giữ nguyên); câu kiểu liệt kê ngắn ("nhà gỗ…, view…, có bữa tối…") tách tiếp ở
 * ", " ("1,5 km" giữ nguyên). Văn xuôi dài giữ nguyên câu. Dưới 2 ý thì trả null để hiện đoạn văn như cũ.
 */
interface NearbyPointItem {
  name: string;
  distanceKm: number;
  distanceText: string;
}

/**
 * Tách và sắp xếp điểm vui chơi / danh thắng lân cận theo thứ tự khoảng cách tăng dần (km ngắn đến dài).
 */
function parseAndSortNearbyAttractions(content: string | null | undefined): NearbyPointItem[] {
  if (!content?.trim()) return [];
  // Tách theo dấu chấm giữa (·), dấu phẩy, chấm phẩy, hoặc xuống dòng
  const parts = content.split(/[·,\n;]+/).map((s) => s.trim()).filter(Boolean);

  const seen = new Set<string>();
  const items: NearbyPointItem[] = [];

  for (const part of parts) {
    // Trích xuất số km hoặc m: vd "2km", "2.5 km", "500m", "10 km"
    const match = part.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
    let distanceKm = 999999;
    let distanceText = '';
    let name = part;

    if (match && match[1] && match[2]) {
      const val = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toLowerCase();
      distanceKm = unit === 'm' ? val / 1000 : val;
      distanceText = `${val} ${unit}`;
      // Lấy tên điểm vui chơi (bỏ phần khoảng cách và dấu gạch đầu dòng cũ nếu có)
      name = part
        .replace(match[0], '')
        .replace(/^[-\s:–—•(]+|[-\s:–—•)]+$/g, '')
        .trim();
      if (!name) name = part;
    }

    const normKey = name.toLowerCase().trim();
    if (!normKey || seen.has(normKey)) continue;
    seen.add(normKey);

    items.push({
      name,
      distanceKm,
      distanceText: distanceText || match?.[0] || '',
    });
  }

  // Ưu tiên từ số km ngắn đến dài
  return items.sort((a, b) => a.distanceKm - b.distanceKm);
}

function descriptionPoints(text: string | null | undefined): string[] | null {
  if (!text?.trim()) return null;
  const sentences = text
    .replace(/([\p{Ll}\d)"”])[.!?…]+\s+/gu, '$1\n')
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const points = sentences.flatMap((sentence) => {
    const parts = sentence.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 && parts.every((part) => part.length <= 80) ? parts : [sentence];
  });
  const cleaned = points
    .map((point) => point.replace(/^[-•*+]\s*/, '').replace(/[.;,]+$/, '').trim())
    .filter(Boolean)
    .map((point) => point.charAt(0).toLocaleUpperCase('vi') + point.slice(1));
  return cleaned.length >= 2 ? cleaned : null;
}

/** Số ý mô tả hiện trước khi bấm "Xem thêm". */
const DESCRIPTION_POINTS_SHOWN = 6;

type SuggestTab = 'trip' | 'nearby';
/** Hai "bảng nhỏ" của khung "Gợi ý cho chuyến đi". */
const SUGGEST_TABS: { id: SuggestTab; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: 'trip', label: 'Lịch trình gợi ý', hint: 'Bắt đầu từ chỗ nghỉ này', Icon: Route },
  { id: 'nearby', label: 'Xung quanh homestay', hint: 'Nhà hàng, tham quan, check-in…', Icon: MapPin },
];

/** Skeleton loading mượt mà với dải lướt sáng shimmer */
function HomestayDetailSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 pb-16 animate-pulse">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 w-3 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="h-4 w-3 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>

        <div className="mb-6 space-y-3">
          <div className="h-5 w-32 rounded-md bg-emerald-100" />
          <div className="h-9 w-2/3 max-w-md rounded-lg bg-slate-200" />
          <div className="flex gap-4">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="h-4 w-40 rounded bg-slate-200" />
          </div>
        </div>

        <div className="grid h-[260px] md:h-[420px] grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 rounded-2xl overflow-hidden mb-8">
          <div className="col-span-1 md:col-span-2 md:row-span-2 bg-slate-200" />
          <div className="hidden md:block bg-slate-200" />
          <div className="hidden md:block bg-slate-200" />
          <div className="hidden md:block bg-slate-200" />
          <div className="hidden md:block bg-slate-200" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10">
          <div className="space-y-6">
            <div className="h-6 w-48 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-200" />
              <div className="h-4 w-full rounded bg-slate-200" />
              <div className="h-4 w-4/5 rounded bg-slate-200" />
            </div>
          </div>
          <div className="hidden lg:block h-64 rounded-2xl bg-slate-100 border border-slate-200" />
        </div>
      </div>
    </div>
  );
}

export default function HomestayDetailPage() {
  const { id, slug } = useParams<{ id?: string; slug?: string }>();
  const identifier = id || slug || '';
  return <HomestayDetailContent key={identifier} identifier={identifier} />;
}

function HomestayDetailContent({ identifier }: { identifier: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const homestaysPath = `/homestays${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const [homestay, setHomestay] = useState<HomestayDetailDto | null>(() =>
    identifier ? peekHomestay(identifier) ?? null : null
  );
  const [loading, setLoading] = useState(() => !(identifier && peekHomestay(identifier)));
  useHomestayViewTracking(homestay?.id, !loading);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [exploreAvailable, setExploreAvailable] = useState(false);
  const [suggestTab, setSuggestTab] = useState<SuggestTab>('trip');
  const [copiedLink, setCopiedLink] = useState(false);

  const roomsSectionRef = useRef<HTMLDivElement>(null);

  const forJourneyParam = searchParams.get('forJourney');
  const journeyContext = useMemo(() => stayContextFor(parseJourneyId(forJourneyParam)), [forJourneyParam]);
  const dismissJourney = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('forJourney');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const [interactionModal, setInteractionModal] = useState<{
    isOpen: boolean;
    type: 'share' | 'heart' | null;
  }>({
    isOpen: false,
    type: null,
  });

  // Lightbox keyboard controls
  useEffect(() => {
    if (lightboxIndex === null || !homestay) return;
    const total = homestay.images.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? null : (i - 1 + total) % total));
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? null : (i + 1) % total));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, homestay]);

  // Reviews lazy fetching
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const reviewsPerPage = 5;
  const reviewsSectionRef = useRef<HTMLDivElement>(null);
  const reviewsWanted = useNearViewport(reviewsSectionRef, '400px', (homestay?.ratingCount ?? 0) > 0);

  // Booked dates
  const [bookedDates, setBookedDates] = useState<BookedDateRangeDto[]>([]);

  // Stay range
  const [stayRange, setStayRange] = useState<{ checkIn: string | null; checkOut: string | null }>(() => {
    const inKey = searchParams.get('checkIn');
    const outKey = searchParams.get('checkOut');
    return isDateKey(inKey) && isDateKey(outKey) && inKey >= todayKey() && outKey > inKey
      ? { checkIn: inKey, checkOut: outKey }
      : { checkIn: null, checkOut: null };
  });

  const changeStayRange = useCallback(
    (checkIn: string | null, checkOut: string | null) => {
      setStayRange({ checkIn, checkOut });
      if ((checkIn && checkOut) || (!checkIn && !checkOut)) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (checkIn && checkOut) {
              next.set('checkIn', checkIn);
              next.set('checkOut', checkOut);
            } else {
              next.delete('checkIn');
              next.delete('checkOut');
            }
            return next;
          },
          { replace: true }
        );
      }
    },
    [setSearchParams]
  );

  // Room selections
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(() => {
    const fromUrl = Number(searchParams.get('room'));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });

  const [openRoomId, setOpenRoomId] = useState<number | null>(() => {
    const fromUrl = Number(searchParams.get('room'));
    return Number.isFinite(fromUrl) && fromUrl > 0 && searchParams.get('checkIn') ? fromUrl : null;
  });

  const selectRoom = useCallback(
    (roomId: number) => {
      setSelectedRoomId(roomId);
      setOpenRoomId(roomId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('room', String(roomId));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Saved / Favorite state
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    setIsSaved(homestay ? checkFavorite(homestay.id) : false);
  }, [homestay?.id]);
  useEffect(
    () =>
      onFavoritesChange(() => {
        if (homestay) setIsSaved(checkFavorite(homestay.id));
      }),
    [homestay?.id]
  );

  // TikTok video review
  const tiktokContact = useMemo(() => {
    if (!homestay?.contacts) return null;
    return homestay.contacts.find((c) => c.channel === 'TIKTOK' && c.value);
  }, [homestay]);

  // Fetch homestay details
  useEffect(() => {
    if (!identifier) return undefined;
    let alive = true;
    getHomestayById(identifier).then((data) => {
      if (!alive) return;
      if (data) setHomestay(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [identifier]);

  // Fetch booked dates on focus
  const placeId = homestay?.id ?? (/^\d+$/.test(identifier) ? Number(identifier) : null);
  useEffect(() => {
    if (!placeId) return undefined;
    let alive = true;
    let lastLoadAt = 0;
    const load = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastLoadAt < BOOKED_DATES_REFRESH_GAP_MS) return;
      lastLoadAt = Date.now();
      fetchBookedDatesByPlace(placeId)
        .then((list) => {
          if (alive) setBookedDates(list);
        })
        .catch(() => { });
    };
    load();
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [placeId]);

  // Fetch reviews when near viewport
  useEffect(() => {
    if (!reviewsWanted || !homestay?.id) return undefined;
    let alive = true;
    fetchPlaceReviews(String(homestay.id)).then((list) => {
      if (alive) setReviews(list);
    });
    return () => {
      alive = false;
    };
  }, [reviewsWanted, homestay?.id]);

  const sellableRooms = useMemo(() => {
    const active = (homestay?.rooms ?? []).filter((room: RoomTypeDto) => (room.status ?? 'ACTIVE') === 'ACTIVE');
    const sorted = [...active.filter((r) => r.basePrice != null), ...active.filter((r) => r.basePrice == null)];
    // Chống trùng phòng: mỗi loại phòng / tên phòng chỉ xuất hiện 1 lần duy nhất
    const seenNames = new Set<string>();
    const seenIds = new Set<number>();
    const deduped: RoomTypeDto[] = [];
    for (const r of sorted) {
      if (seenIds.has(r.id)) continue;
      const cleanKey = r.name
        .replace(/\[.*?seed.*?\]/gi, '')
        .trim()
        .toLowerCase();
      if (seenNames.has(cleanKey)) continue;
      seenIds.add(r.id);
      seenNames.add(cleanKey);
      deduped.push({
        ...r,
        name: r.name.replace(/\s*\[.*?seed.*?\]/gi, '').trim(),
      });
    }
    return deduped;
  }, [homestay]);

  const roomOptions = useMemo<RoomTypeTab[]>(() => {
    const { checkIn, checkOut } = stayRange;
    return sellableRooms.map((room) => ({
      room,
      available:
        checkIn && checkOut && checkOut > checkIn
          ? minAvailableInRange(buildOccupancy(bookedDates, room.id), room.totalRoomCount || 1, checkIn, checkOut)
          : null,
    }));
  }, [sellableRooms, bookedDates, stayRange]);

  useEffect(() => {
    if (!roomOptions.length) return;
    setSelectedRoomId((current) => {
      if (current != null && roomOptions.some((o) => o.room.id === current)) return current;
      const best =
        roomOptions.find((o) => o.room.basePrice != null && (o.available == null || o.available > 0)) ??
        roomOptions[0];
      return best ? best.room.id : null;
    });
  }, [roomOptions]);

  const selectedRoom = sellableRooms.find((r) => r.id === selectedRoomId) ?? sellableRooms[0] ?? null;
  const roomAlternatives = useMemo(
    () =>
      roomOptions
        .filter((o) => o.room.id !== selectedRoom?.id && o.room.basePrice != null && (o.available ?? 0) > 0)
        .map((o) => ({ room: o.room, available: o.available ?? 0 })),
    [roomOptions, selectedRoom?.id]
  );

  const [roomCounts, setRoomCounts] = useState<Record<number, number> | null>(() =>
    parseRoomCounts(searchParams.get('rooms'))
  );

  const [guestCount, setGuestCount] = useState(() => {
    const fromUrl = Number(searchParams.get('guests'));
    return Number.isInteger(fromUrl) && fromUrl >= 1 && fromUrl <= 50 ? fromUrl : 2;
  });

  const changeGuestCount = useCallback(
    (count: number) => {
      setGuestCount(count);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('guests', String(count));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const recommendedRoomId = useMemo(() => {
    const candidates = roomOptions.filter((o) => o.room.basePrice != null && (o.available == null || o.available > 0));
    if (candidates.length < 2) return null;
    let best: { id: number; cost: number } | null = null;
    for (const { room, available } of candidates) {
      const needed = Math.max(1, Math.ceil(guestCount / Math.max(1, room.maxOccupancy || 2)));
      if (available != null && needed > available) continue;
      const cost = needed * (room.basePrice ?? 0);
      if (!best || cost < best.cost) best = { id: room.id, cost };
    }
    return best?.id ?? null;
  }, [roomOptions, guestCount]);

  const defaultRoomCounts = useMemo<Record<number, number>>(() => {
    if (!selectedRoom || selectedRoom.basePrice == null) return {};
    const perRoom = Math.max(1, selectedRoom.maxOccupancy || 2);
    return { [selectedRoom.id]: Math.min(MAX_ROOMS_PER_BOOKING, Math.max(1, Math.ceil(guestCount / perRoom))) };
  }, [selectedRoom, guestCount]);

  const counts = useMemo(() => {
    const clamped = { ...(roomCounts ?? defaultRoomCounts) };
    for (const option of roomOptions) {
      const count = clamped[option.room.id];
      if (count != null && option.available != null) {
        clamped[option.room.id] = Math.max(1, Math.min(count, option.available));
      }
    }
    return clamped;
  }, [roomCounts, defaultRoomCounts, roomOptions]);

  const roomSelection = useMemo(
    () =>
      sellableRooms
        .map((room) => roomChoiceFrom(room, counts[room.id] ?? 0))
        .filter((choice): choice is BookingRoomChoice => choice != null && choice.roomCount > 0),
    [sellableRooms, counts]
  );

  const changeRoomCount = useCallback(
    (roomId: number, count: number) => {
      const next = { ...counts };
      if (count > 0) next[roomId] = count;
      else delete next[roomId];
      setRoomCounts(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          const value = formatRoomCounts(next);
          if (value) params.set('rooms', value);
          else params.delete('rooms');
          return params;
        },
        { replace: true }
      );
    },
    [counts, setSearchParams]
  );

  const canMixRooms = sellableRooms.filter((room) => room.basePrice != null).length > 1;

  const [tripPick, setTripPick] = useState<StayTripPick | null>(null);
  const [carryTrip, setCarryTrip] = useState(true);

  const bookRooms = useCallback(() => {
    const { checkIn, checkOut } = stayRange;
    if (!homestay || !checkIn || !checkOut || checkOut <= checkIn || roomSelection.length === 0) return;
    const state: BookingNavigationState = {
      placeId: homestay.id,
      placeName: homestay.name,
      placeAddress: homestay.address || homestay.district,
      placeRating: homestay.ratingAvg,
      placeReviewCount: homestay.ratingCount,
      coverImageUrl: homestay.images?.[0] || '',
      latitude: homestay.latitude,
      longitude: homestay.longitude,
      rooms: roomSelection,
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      guestCount,
      ...(journeyContext ? { journeyId: journeyContext.journeyId, journeyTitle: journeyContext.title } : {}),
      ...(!journeyContext && tripPick && carryTrip
        ? { tripTemplate: tripPick.template, tripTitle: tripPick.title, tripFilters: tripPick.filters }
        : {}),
    };
    navigate('/booking', { state });
  }, [homestay, stayRange, roomSelection, guestCount, journeyContext, tripPick, carryTrip, navigate]);

  const fromPrice = useMemo(() => {
    const base = sellableRooms.map((r) => r.basePrice).filter((v): v is number => v != null && v > 0);
    return base.length ? Math.min(...base) : null;
  }, [sellableRooms]);

  // Chỉ ảnh thật của chính homestay; không có thì gallery hiện ô "đang cập nhật" thay vì ảnh nơi khác.
  const authenticImages = useMemo(
    () => (homestay?.images ?? []).filter((img) => !isPlaceholderOrGenericUrl(img)),
    [homestay],
  );

  const nearbyAttractions = homestay?.highlights?.find(h => h.type === 'NEARBY')?.content ?? null;
  const parsedNearbyList = useMemo(() => parseAndSortNearbyAttractions(nearbyAttractions), [nearbyAttractions]);
  const nearestAttraction = parsedNearbyList[0] as NearbyPointItem | undefined;
  const otherAttractions = useMemo(() => parsedNearbyList.slice(1), [parsedNearbyList]);
  const [nearbyDropdownOpen, setNearbyDropdownOpen] = useState(false);
  const nearbyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nearbyDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (nearbyDropdownRef.current && !nearbyDropdownRef.current.contains(e.target as Node)) {
        setNearbyDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNearbyDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [nearbyDropdownOpen]);

  if (loading) {
    return <HomestayDetailSkeleton />;
  }

  if (!homestay) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <h2 className="text-xl font-bold text-slate-900 mb-2">Không tìm thấy chỗ nghỉ</h2>
          <p className="text-sm text-slate-500 mb-6">
            Rất tiếc, chỗ nghỉ bạn tìm kiếm không tồn tại hoặc đã tạm dừng nhận khách.
          </p>
          <button
            type="button"
            onClick={() => navigate(homestaysPath)}
            className="inline-flex h-10 items-center justify-center rounded-xl cta cta-primary px-5 text-sm font-semibold text-white shadow-sm transition "
          >
            Quay lại danh sách
          </button>
        </motion.div>
      </div>
    );
  }

  const profile = homestay.homestayProfile ?? null;
  const checkInTime = profile?.checkInFrom ? profile.checkInFrom.slice(0, 5) : null;
  const checkOutTime = profile?.checkOutUntil ? profile.checkOutUntil.slice(0, 5) : null;
  const activeServices = (homestay.services ?? []).filter((service) => service.active);

  const amenityNames = homestay.amenityItems?.length
    ? homestay.amenityItems.filter((item) => item.value !== 'NO').map((item) => item.name)
    : homestay.amenities ?? [];
  const otherAmenities = profile?.otherAmenities?.trim() || null;

  // Tổng quan gọn: mô tả thành gạch đầu dòng + các thông tin chính mỗi thứ một dòng có biểu tượng.
  const descPoints = descriptionPoints(homestay.description);
  const overviewFacts: { key: string; Icon: LucideIcon; label: string; value: string; wide?: boolean; className?: string }[] = [];
  if (profile?.viewHighlight?.trim()) overviewFacts.push({ key: 'view', Icon: Mountain, label: 'Điểm nhìn', value: profile.viewHighlight.trim() });
  if (profile?.suitability?.trim()) overviewFacts.push({ key: 'suit', Icon: Users, label: 'Phù hợp với', value: profile.suitability.trim() });
  if (checkInTime || checkOutTime) {
    overviewFacts.push({
      key: 'time',
      Icon: Clock,
      label: 'Nhận / trả phòng',
      value: [checkInTime && `Nhận từ ${checkInTime}`, checkOutTime && `Trả trước ${checkOutTime}`].filter(Boolean).join(' · '),
      // Máy tính đã có giờ nhận / trả phòng trên thẻ đặt phòng cột phải.
      className: 'lg:hidden',
    });
  }
  if (homestay.accessNote?.trim()) overviewFacts.push({ key: 'access', Icon: Compass, label: 'Đường đi', value: homestay.accessNote.trim(), wide: true });

  // Khung "Gợi ý cho chuyến đi": lịch trình (ẩn khi đang xem từ một lịch trình) + xung quanh homestay (khi có địa điểm).
  const showTrip = !journeyContext;
  const showSuggest = showTrip || exploreAvailable;
  const showSuggestTabs = showTrip && exploreAvailable;
  const activeSuggestTab: SuggestTab = !showTrip ? 'nearby' : !exploreAvailable ? 'trip' : suggestTab;
  const onlySuggestTab = SUGGEST_TABS.find((tab) => tab.id === activeSuggestTab);
  const focusSuggestTab = (id: SuggestTab) => {
    setSuggestTab(id);
    document.getElementById(`suggest-tab-${id}`)?.focus();
  };

  const policies = [
    { label: 'Nội quy', value: profile?.houseRules },
    { label: 'Trẻ em', value: profile?.childrenPolicy },
    { label: 'Thú cưng', value: profile?.petsPolicy },
    { label: 'Phụ thu', value: profile?.surchargeNote },
    {
      label: 'Hủy phòng',
      value: profile?.currentPolicy ? `${profile.currentPolicy.name} — ${profile.currentPolicy.description}` : null,
    },
  ].filter((policy): policy is { label: string; value: string } => !!policy.value?.trim());

  const hasRating = homestay.ratingAvg != null && homestay.ratingAvg > 0;
  const priceText = fromPrice != null ? new Intl.NumberFormat('vi-VN').format(fromPrice) : null;
  const scrollToRooms = () => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const highlightGroups = [
    { type: 'PRO', title: 'Điểm cộng', Icon: ThumbsUp, dot: 'text-emerald-600' },
    { type: 'CON', title: 'Cần lưu ý', Icon: AlertCircle, dot: 'text-amber-600' },
    { type: 'TIP', title: 'Mẹo nhỏ', Icon: Lightbulb, dot: 'text-sky-600' },
  ]
    .map((group) => ({
      ...group,
      items: (homestay.highlights ?? []).filter((h) => h.type === group.type),
    }))
    .filter((group) => group.items.length > 0);

  const sectionLinks: SectionLink[] = [
    { id: 'booking', label: 'Đặt phòng', hint: priceText ? `từ ${priceText}đ` : undefined },
    { id: 'about', label: 'Tổng quan' },
    { id: 'amenities', label: 'Tiện nghi' },
    ...(activeServices.length ? [{ id: 'services', label: 'Dịch vụ tại chỗ' }] : []),
    ...(showSuggest ? [{ id: 'suggest', label: 'Gợi ý cho chuyến đi' }] : []),
    { id: 'reviews', label: 'Đánh giá' },
  ];

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const sectionVariants: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: 'easeOut' },
    },
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-emerald-50/25 via-white to-slate-50/50 text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pt-4 pb-24 lg:pb-16">
        {/* Breadcrumb + Nút quay về */}
        <nav aria-label="Đường dẫn" className="mb-4 flex items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => {
              if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
                navigate(-1);
              } else {
                navigate(homestaysPath);
              }
            }}
            className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-emerald-300 hover:text-[var(--color-primary)] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay về</span>
          </button>
          <Link to="/" className="hover:text-[var(--color-primary)] transition-colors shrink-0">
            Trang chủ
          </Link>
          <span className="text-slate-300" aria-hidden>/</span>
          <Link to={homestaysPath} className="hover:text-[var(--color-primary)] transition-colors shrink-0">
            Lưu trú
          </Link>
          <span className="text-slate-300" aria-hidden>/</span>
          <span aria-current="page" className="font-semibold text-slate-800 truncate">
            {homestay.name}
          </span>
        </nav>

        {journeyContext && (
          <JourneyContextBanner context={journeyContext} onDismiss={dismissJourney} className="mb-4" />
        )}

        {/* ── 1. HEADER ── */}
        <header className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200/60 shadow-2xs">
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  {homestay.kind === 'HOMESTAY' ? 'Homestay Bản Địa' : 'Chỗ nghỉ trải nghiệm'}
                </span>
                {homestay.operationStatus === 'TEMPORARILY_CLOSED' && (
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                    Tạm ngừng nhận khách
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
                {homestay.name}
              </h1>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
                {hasRating ? (
                  <span className="inline-flex items-center gap-1 font-bold text-slate-900">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    {homestay.ratingAvg.toFixed(1)}
                    <span className="font-normal text-slate-500">
                      ({homestay.ratingCount} đánh giá)
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400">Chưa có đánh giá</span>
                )}

                {homestay.googleRating != null && (
                  <span className="inline-flex items-center gap-1 text-slate-600" title="Điểm Google Maps đã xác thực">
                    <span className="text-slate-300" aria-hidden>·</span>
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-slate-800">{homestay.googleRating.toFixed(1)}</span>
                    <span className="text-xs text-slate-500">Google</span>
                  </span>
                )}

                <span className="text-slate-300" aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() =>
                    openGoogleMapsDirections(
                      homestay.latitude ?? undefined,
                      homestay.longitude ?? undefined,
                      `${homestay.address || homestay.district || ''} ${homestay.name}`
                    )
                  }
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-[var(--color-primary)] transition-colors cursor-pointer text-left group"
                  title="Xem chỉ đường trên Google Maps"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--color-primary)] transition-transform duration-200 group-hover:scale-110" />
                  <span className="underline decoration-slate-300 underline-offset-4 group-hover:decoration-[var(--color-primary)]">
                    {homestay.address || homestay.district}
                  </span>
                </button>

                {nearestAttraction ? (
                  <div className="relative inline-flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-700" ref={nearbyDropdownRef}>
                    <span className="text-slate-300" aria-hidden>·</span>
                    <div className="inline-flex items-center gap-1.5 font-medium">
                      <Navigation className="h-4 w-4 text-[var(--color-primary)] shrink-0" aria-hidden />
                      <span className="text-slate-600">Điểm vui chơi:</span>
                      <span className="text-[var(--color-primary)] font-bold leading-none shrink-0" aria-hidden>–</span>
                      <span className="font-bold text-slate-900">{nearestAttraction.name}{nearestAttraction.distanceText ? ':' : ''}</span>
                      {nearestAttraction.distanceText && (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-200/60 shadow-2xs">
                          {nearestAttraction.distanceText}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-medium">(gần nhất)</span>
                    </div>

                    {otherAttractions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNearbyDropdownOpen((prev) => !prev)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all cursor-pointer border ${nearbyDropdownOpen
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-2xs'
                          }`}
                        aria-expanded={nearbyDropdownOpen}
                      >
                        <span>+{otherAttractions.length} điểm khác</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${nearbyDropdownOpen ? 'rotate-180 text-emerald-700' : 'text-slate-500'
                            }`}
                        />
                      </button>
                    )}

                    {/* Dropdown menu xổ xuống cho các điểm còn lại */}
                    <AnimatePresence>
                      {nearbyDropdownOpen && otherAttractions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                          className="absolute left-0 top-full mt-2 z-30 w-72 sm:w-80 rounded-2xl bg-white p-3.5 shadow-xl ring-1 ring-slate-900/10 border border-slate-100 backdrop-blur-md"
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Các điểm vui chơi khác
                            </span>
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                              từ gần đến xa
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {otherAttractions.map((item, idx) => (
                              <li
                                key={idx}
                                className="flex items-center justify-between gap-2 rounded-lg p-1 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[var(--color-primary)] font-bold text-sm leading-none shrink-0" aria-hidden>–</span>
                                  <span className="font-medium text-slate-800 truncate">{item.name}</span>
                                </span>
                                {item.distanceText && (
                                  <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px] border border-emerald-200/60 shadow-2xs shrink-0">
                                    {item.distanceText}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : nearbyAttractions ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <span className="text-slate-300" aria-hidden>·</span>
                    <Navigation className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                    <span>
                      <span className="font-medium text-slate-600">Điểm vui chơi: </span>
                      <span className="font-semibold text-slate-800">{nearbyAttractions}</span>
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* Actions: Chia sẻ & Yêu thích */}
            <div className="flex shrink-0 items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setInteractionModal({ isOpen: true, type: 'share' })}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 cursor-pointer"
              >
                <Share2 className="h-4 w-4 text-slate-500" />
                <span>Chia sẻ</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  const nowSaved = toggleFavorite({
                    id: String(homestay.id),
                    slug: String(homestay.id),
                    name: homestay.name,
                    priceRefMin: homestay.priceRefMin ?? null,
                    coverImageUrl: homestay.images?.[0],
                    regionName: homestay.district,
                  });
                  setIsSaved(nowSaved);
                  if (nowSaved) setInteractionModal({ isOpen: true, type: 'heart' });
                }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium shadow-xs transition cursor-pointer ${isSaved
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <motion.div
                  animate={isSaved ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Heart className={`h-4 w-4 ${isSaved ? 'fill-rose-600 text-rose-600' : 'text-slate-500'}`} />
                </motion.div>
                <span>{isSaved ? 'Đã lưu' : 'Lưu'}</span>
              </motion.button>
            </div>
          </div>
        </header>

        {/* ── 2. THƯ VIỆN ẢNH (VỚI PARALLAX NHẸ TRÊN DESKTOP) ── */}
        <HomestayGallery images={authenticImages} name={homestay.name} onOpen={setLightboxIndex} />

        {/* ── TIỆN ÍCH (ngay dưới ảnh, trước grid 2 cột) ── */}
        {(amenityNames.length > 0 || otherAmenities) && (
          <section
            id="amenities"
            className="mt-6 scroll-mt-24 rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-4"
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-base font-bold tracking-tight text-slate-900">Tiện ích</h2>
              <span className="text-xs font-medium text-slate-400">
                {amenityNames.length + 1} tiện ích
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              <li className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                <span>Đầy đủ tiện nghi vệ sinh khép kín</span>
              </li>
              {amenityNames.map((name) => (
                <li key={name} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
            {otherAmenities && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-700">Tiện ích khác: </span>
                {otherAmenities}
              </p>
            )}
          </section>
        )}

        {/* ── 3. KHUNG NỘI DUNG CHÍNH (2 CỘT TRÊN MÁY TÍNH) ── */}
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
          {/* CỘT TRÁI: Nội dung chi tiết */}
          <div className="min-w-0 space-y-8">
            {/* ── 1. ĐẶT PHÒNG & CHỌN PHÒNG (Ưu tiên hiển thị ngay trên cùng để du khách chọn phòng nhanh nhất) ── */}
            <motion.section
              id="booking"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={sectionVariants}
              className="scroll-mt-28 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[var(--color-primary)] shadow-2xs">
                    <BedDouble className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                      Chọn phòng & Xem giá
                    </h2>
                    <p className="text-xs text-slate-500">
                      {sellableRooms.length > 1
                        ? `${sellableRooms.length} loại phòng sẵn có — chọn ngày nhận/trả và số lượng phòng.`
                        : 'Chọn ngày nhận và trả phòng để kiểm tra tình trạng phòng trống.'}
                    </p>
                  </div>
                </div>
              </div>

              <div ref={roomsSectionRef} className="flex flex-col gap-4">
                {homestay.operationStatus === 'TEMPORARILY_CLOSED' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <strong>Tạm ngừng nhận đặt phòng.</strong>{' '}
                    {homestay.operationStatusReason || 'Homestay đang tạm đóng và chưa nhận kiểm tra phòng/giá.'} Bạn vẫn
                    có thể tham khảo thông tin chi tiết của chỗ nghỉ.
                  </div>
                ) : sellableRooms.length > 0 ? (
                  sellableRooms.map((room) => (
                    <RoomBookingCard
                      key={room.id}
                      room={room}
                      homestay={homestay}
                      bookedDates={bookedDates}
                      checkIn={stayRange.checkIn}
                      checkOut={stayRange.checkOut}
                      onDatesChange={changeStayRange}
                      selection={roomSelection}
                      onRoomCountChange={changeRoomCount}
                      guestCount={guestCount}
                      onGuestCountChange={changeGuestCount}
                      onBook={bookRooms}
                      canMixRooms={canMixRooms}
                      expanded={openRoomId === room.id}
                      onToggleExpanded={() => (openRoomId === room.id ? setOpenRoomId(null) : selectRoom(room.id))}
                      recommended={recommendedRoomId === room.id}
                      alternatives={roomAlternatives.filter((alt) => alt.room.id !== room.id)}
                      onSelectRoom={selectRoom}
                      journeyTitle={journeyContext?.title ?? null}
                      tripCarry={
                        !journeyContext && tripPick
                          ? { tag: tripPick.tag, checked: carryTrip, onChange: setCarryTrip }
                          : null
                      }
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Chỗ nghỉ chưa mở bán loại phòng trực tuyến nào vào lúc này.
                  </div>
                )}
              </div>
            </motion.section>

            {/* ── 2. GỢI Ý CHO CHUYẾN ĐI: hai bảng nhỏ "Lịch trình gợi ý" và "Xung quanh homestay" (EP02) ──
                Đẩy lên trên ngay dưới phần Chọn phòng & Xem giá. Phần "Xung quanh" luôn nằm trong DOM để tự tải dữ liệu. */}
            <motion.section
              id="suggest"
              hidden={!showSuggest}
              aria-labelledby="suggest-title"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={sectionVariants}
              className="scroll-mt-28 pt-8 border-t border-slate-200"
            >
              <h2 id="suggest-title" className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Gợi ý cho chuyến đi
              </h2>

              {showSuggestTabs ? (
                <div
                  role="tablist"
                  aria-label="Loại gợi ý"
                  className="mt-4 grid grid-cols-2 gap-2.5 sm:max-w-xl"
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                    event.preventDefault();
                    focusSuggestTab(activeSuggestTab === 'trip' ? 'nearby' : 'trip');
                  }}
                >
                  {SUGGEST_TABS.map((tab) => {
                    const selected = activeSuggestTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`suggest-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={`suggest-panel-${tab.id}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => setSuggestTab(tab.id)}
                        className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${selected ? 'border-[var(--color-primary)] bg-[var(--color-primary-50)]' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                          <tab.Icon className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-snug text-[var(--color-ink-deep)]">{tab.label}</span>
                          {/* Điện thoại: hai thẻ chỉ còn ~170px mỗi thẻ — chỉ giữ tên, bỏ dòng gợi ý (bị cắt giữa chữ). */}
                          <span className="hidden truncate text-xs text-slate-500 sm:block">{tab.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                onlySuggestTab && (
                  <p className="mt-1 text-sm text-slate-500">
                    {onlySuggestTab.label} · {onlySuggestTab.hint}
                  </p>
                )
              )}

              <div className="mt-5">
                {showTrip && (
                  <div
                    id="suggest-panel-trip"
                    role={showSuggestTabs ? 'tabpanel' : undefined}
                    aria-labelledby={showSuggestTabs ? 'suggest-tab-trip' : undefined}
                    hidden={activeSuggestTab !== 'trip'}
                  >
                    <StayTripSuggest
                      provinceName={homestay.provinceName}
                      stay={{
                        id: homestay.id,
                        name: homestay.name,
                        latitude: homestay.latitude ?? null,
                        longitude: homestay.longitude ?? null,
                      }}
                      checkIn={stayRange.checkIn}
                      checkOut={stayRange.checkOut}
                      guests={guestCount}
                      onPickChange={setTripPick}
                      borderless
                      hideHeading
                      className="p-0! md:p-0!"
                    />
                  </div>
                )}
                <div
                  id="suggest-panel-nearby"
                  role={showSuggestTabs ? 'tabpanel' : undefined}
                  aria-labelledby={showSuggestTabs ? 'suggest-tab-nearby' : undefined}
                  hidden={activeSuggestTab !== 'nearby'}
                >
                  <ExploreNearbySection
                    homestayId={homestay.id}
                    onAvailabilityChange={setExploreAvailable}
                    embedded
                    active={showSuggest && activeSuggestTab === 'nearby'}
                  />
                </div>
              </div>
            </motion.section>

            {/* ── 3. GIỚI THIỆU CHỖ NGHỈ ── */}
            <motion.section
              id="about"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={sectionVariants}
              className="scroll-mt-28 space-y-4 pt-8 border-t border-slate-200"
            >
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Giới thiệu chỗ nghỉ</h2>

              {descPoints ? (
                <div>
                  <ul className="space-y-1.5">
                    {(aboutOpen ? descPoints : descPoints.slice(0, DESCRIPTION_POINTS_SHOWN)).map((point, index) => (
                      <li key={`${index}-${point}`} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  {descPoints.length > DESCRIPTION_POINTS_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setAboutOpen((open) => !open)}
                      className="mt-2 text-sm font-semibold text-[var(--color-primary)] hover:underline cursor-pointer"
                    >
                      {aboutOpen ? 'Thu gọn' : `Xem thêm ${descPoints.length - DESCRIPTION_POINTS_SHOWN} ý`}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className={`whitespace-pre-line text-sm leading-relaxed text-slate-700 ${aboutOpen ? '' : 'line-clamp-4'}`}>
                    {homestay.description || 'Chỗ nghỉ đang cập nhật mô tả chi tiết.'}
                  </p>
                  {(homestay.description?.length ?? 0) > 260 && (
                    <button
                      type="button"
                      onClick={() => setAboutOpen((open) => !open)}
                      className="mt-2 inline-flex items-center text-sm font-semibold text-[var(--color-primary)] hover:underline cursor-pointer"
                    >
                      {aboutOpen ? 'Thu gọn bớt' : 'Đọc thêm giới thiệu'}
                    </button>
                  )}
                </div>
              )}

              {overviewFacts.length > 0 && (
                <dl
                  className={`grid gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 ${overviewFacts.every((fact) => fact.className) ? 'lg:hidden' : ''
                    }`}
                >
                  {overviewFacts.map((fact) => (
                    <div key={fact.key} className={`flex gap-2.5 ${fact.wide ? 'sm:col-span-2' : ''} ${fact.className ?? ''}`}>
                      <fact.Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">{fact.label}</dt>
                        <dd className="whitespace-pre-line text-sm text-slate-800">{fact.value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              )}
            </motion.section>

            {/* Video trải nghiệm trên Mobile */}
            {tiktokContact && (
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={sectionVariants}
                className="lg:hidden pt-6 border-t border-slate-100"
              >
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <PlayCircle className="h-4 w-4 text-[var(--color-primary)]" />
                    <span>Video review thực tế</span>
                  </h3>
                  <TikTokEmbedPlayer
                    url={tiktokContact.value}
                    placeName={homestay.name}
                    className="w-full rounded-xl overflow-hidden"
                  />
                </div>
              </motion.div>
            )}


            {/* Dịch vụ tại chỗ — một bảng giá gọn */}
            {activeServices.length > 0 && (
              <motion.section
                id="services"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={sectionVariants}
                className="scroll-mt-28 space-y-3 pt-6 border-t border-slate-100"
              >
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Dịch vụ tại chỗ</h2>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {activeServices.map((service) => (
                    <li key={service.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{service.name}</p>
                        {service.description && (
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{service.description}</p>
                        )}
                      </div>
                      {service.price != null ? (
                        <span className="shrink-0 text-sm font-semibold text-[var(--color-primary)]">
                          {service.price.toLocaleString('vi-VN')}đ{service.priceUnit ? ` / ${service.priceUnit}` : ''}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-400">Liên hệ</span>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            {/* Nội quy & Chính sách */}
            {policies.length > 0 && (
              <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={sectionVariants}
                className="pt-6 border-t border-slate-100"
              >
                <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all duration-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span>Nội quy & Chính sách chỗ nghỉ</span>
                    <ChevronRight className="h-5 w-5 text-slate-400 transition-transform duration-200 group-open:rotate-90" />
                  </summary>
                  <div className="mt-4 pt-4 border-t border-slate-100 divide-y divide-slate-100 space-y-3">
                    {policies.map((policy) => (
                      <div key={policy.label} className="pt-3 first:pt-0 grid gap-1 sm:grid-cols-[140px_1fr] text-sm">
                        <span className="font-semibold text-slate-700">{policy.label}</span>
                        <span className="whitespace-pre-line text-slate-600 leading-relaxed">{policy.value}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </motion.section>
            )}

            {/* ── 7. ĐÁNH GIÁ TỪ DU KHÁCH ── */}
            <motion.section
              id="reviews"
              ref={reviewsSectionRef}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={sectionVariants}
              className="scroll-mt-28 pt-8 border-t border-slate-200"
            >
              <div className="mb-6 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[var(--color-primary)] shadow-2xs">
                  <MessagesSquare className="h-4 w-4" />
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Đánh giá từ khách trải nghiệm
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-[280px_1fr] md:gap-10">
                {/* Tổng điểm đánh giá */}
                <div className="h-fit rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 text-center shadow-xs">
                  {hasRating ? (
                    <>
                      <p className="text-4xl sm:text-5xl font-black text-slate-900">
                        {homestay.ratingAvg.toFixed(1)}
                      </p>
                      <div className="mt-1.5 flex justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-4 w-4 ${n <= Math.round(homestay.ratingAvg)
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-slate-300'
                              }`}
                          />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 font-medium">
                        {homestay.ratingCount} đánh giá từ khách thực tế
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Chưa có đánh giá nào. Hãy là du khách đầu tiên trải nghiệm!
                    </p>
                  )}

                  {homestay.googleRating != null && (
                    <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
                      <span>Điểm Google Maps: </span>
                      <strong className="text-slate-900 font-bold">{homestay.googleRating.toFixed(1)}/5</strong>
                    </div>
                  )}

                  {/* Điểm cộng / Lưu ý / Mẹo */}
                  {highlightGroups.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-left">
                      {highlightGroups.flatMap(({ type, title, Icon, dot, items }) =>
                        items.map((h, idx) => (
                          <div
                            key={`${type}-${idx}`}
                            className="flex items-start gap-2 text-xs text-slate-700"
                            title={title}
                          >
                            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${dot}`} />
                            <span className="leading-snug">{h.content}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Danh sách bình luận */}
                <div className="min-w-0">
                  {reviews.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {reviews.slice((reviewPage - 1) * reviewsPerPage, reviewPage * reviewsPerPage).map((review) => (
                        <article key={review.id} className="py-4 first:pt-0">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 shadow-2xs">
                              {review.guestName?.trim().charAt(0).toUpperCase() || 'K'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{review.guestName}</p>
                              <p className="text-[11px] text-slate-400">
                                {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200/50">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              <span>{review.rating}/5</span>
                            </span>
                          </div>

                          <p className="mt-2.5 text-sm leading-relaxed text-slate-700">{review.content}</p>

                          {review.images && review.images.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                              {review.images.map((image) => (
                                <img
                                  key={image}
                                  src={mediaUrl(image)}
                                  alt="Ảnh từ du khách"
                                  loading="lazy"
                                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover border border-slate-200/60 transition-transform duration-200 hover:scale-105"
                                />
                              ))}
                            </div>
                          )}

                          {review.providerReply && (
                            <div className="mt-3 rounded-xl border-l-2 border-[var(--color-primary)] bg-emerald-50/40 p-3 text-xs sm:text-sm text-slate-700">
                              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)]">
                                <MessageSquareReply className="h-3.5 w-3.5" />
                                <span>Phản hồi từ chủ nhà</span>
                              </p>
                              <p className="whitespace-pre-line leading-relaxed text-slate-600">
                                {review.providerReply}
                              </p>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                      {homestay.ratingCount > 0 ? 'Đang tải nhận xét…' : 'Chưa có đánh giá nào cho chỗ nghỉ này.'}
                    </div>
                  )}

                  {reviews.length > reviewsPerPage && (
                    <div className="mt-4 flex items-center justify-end gap-2 text-xs">
                      <button
                        type="button"
                        disabled={reviewPage === 1}
                        onClick={() => setReviewPage((p) => p - 1)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        Trước
                      </button>
                      <span className="text-slate-500 font-medium">
                        Trang {reviewPage} / {Math.ceil(reviews.length / reviewsPerPage)}
                      </span>
                      <button
                        type="button"
                        disabled={reviewPage >= Math.ceil(reviews.length / reviewsPerPage)}
                        onClick={() => setReviewPage((p) => p + 1)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        Sau
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          </div>

          {/* CỘT PHẢI: Sticky Card trên Desktop */}
          <aside className="hidden lg:block lg:w-[360px] shrink-0">
            <div className="sticky top-[calc(var(--app-header-offset,72px)+24px)] space-y-5">
              {/* Thẻ xem giá & đặt phòng nhanh */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_4px_24px_rgba(10,46,38,0.06)] transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(10,46,38,0.1)]">
                <div className="mb-4">
                  {homestay.operationStatus === 'TEMPORARILY_CLOSED' ? (
                    <div>
                      <p className="text-base font-bold text-amber-800">Tạm ngừng nhận phòng</p>
                      <p className="mt-1 text-xs text-slate-500">Chỗ nghỉ hiện chưa mở đặt phòng trực tuyến.</p>
                    </div>
                  ) : priceText ? (
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Giá chỉ từ</span>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-slate-900">{priceText}đ</span>
                        <span className="text-sm text-slate-500 font-medium">/ đêm</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-base font-bold text-slate-800">Liên hệ trực tiếp để có giá</p>
                  )}

                  {(checkInTime || checkOutTime) && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {checkInTime && (
                        <span>
                          Nhận phòng: <strong className="text-slate-800">{checkInTime}</strong>
                        </span>
                      )}
                      {checkInTime && checkOutTime && <span className="text-slate-300">·</span>}
                      {checkOutTime && (
                        <span>
                          Trả phòng: <strong className="text-slate-800">{checkOutTime}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={scrollToRooms}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl cta cta-primary font-bold text-white shadow-sm transition active:scale-[0.99] cursor-pointer"
                >
                  <span>Chọn phòng</span>
                  <ArrowRight className="h-4 w-4" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() =>
                    openGoogleMapsDirections(
                      homestay.latitude ?? undefined,
                      homestay.longitude ?? undefined,
                      `${homestay.address || homestay.district || ''} ${homestay.name}`
                    )
                  }
                  className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                >
                  <Navigation className="h-4 w-4 text-[var(--color-primary)]" />
                  <span>Chỉ đường trên Google Maps</span>
                </motion.button>
              </div>

              {/* Video Review Embed (Desktop) */}
              {tiktokContact && (
                <div id="video" className="scroll-mt-28 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <PlayCircle className="h-4 w-4 text-[var(--color-primary)]" />
                    <span>Video trải nghiệm thực tế</span>
                  </h3>
                  <TikTokEmbedPlayer
                    url={tiktokContact.value}
                    placeName={homestay.name}
                    className="w-full rounded-xl overflow-hidden"
                  />
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Floating Bottom Bar trên Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
        <div className="min-w-0 pr-3">
          {priceText ? (
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-wide">Từ</span>
              <p className="text-lg font-black text-slate-900 leading-tight">
                {priceText}đ <span className="text-xs font-normal text-slate-500">/đêm</span>
              </p>
            </div>
          ) : (
            <p className="text-sm font-bold text-slate-700">Giá phòng liên hệ</p>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={scrollToRooms}
          className="relative overflow-hidden flex h-11 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 text-sm font-bold text-white shadow-sm transition active:scale-95 cursor-pointer"
        >
          <span>Chọn phòng</span>
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </div>

      {/* MODAL TƯƠNG TÁC (CHIA SẺ & YÊU THÍCH) */}
      <AnimatePresence>
        {interactionModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => setInteractionModal({ isOpen: false, type: null })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${interactionModal.type === 'share'
                        ? 'bg-emerald-50 text-[var(--color-primary)]'
                        : 'bg-rose-50 text-rose-600'
                      }`}
                  >
                    {interactionModal.type === 'share' ? (
                      <Share2 className="h-4 w-4" />
                    ) : (
                      <Heart className="h-4 w-4 fill-current" />
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {interactionModal.type === 'share' ? 'Chia sẻ chỗ nghỉ' : 'Đã lưu vào danh sách'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInteractionModal({ isOpen: false, type: null })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  aria-label="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {interactionModal.type === 'share'
                  ? 'Gửi liên kết chỗ nghỉ này tới bạn bè hoặc người đồng hành chuyến đi của bạn.'
                  : 'Chỗ nghỉ này đã được lưu vào danh sách yêu thích trên thiết bị của bạn.'}
              </p>

              {interactionModal.type === 'share' && (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    readOnly
                    value={window.location.href}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 select-all outline-none focus:border-[var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <button
                type="button"
                className="w-full h-10 rounded-xl cta cta-primary text-xs font-bold text-white shadow-sm transition cursor-pointer"
                onClick={() => {
                  if (interactionModal.type === 'heart') {
                    navigate('/homestays?saved=1');
                  }
                  setInteractionModal({ isOpen: false, type: null });
                }}
              >
                {interactionModal.type === 'share' ? 'Đóng' : 'Xem danh sách đã lưu'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX: XEM ẢNH FULL MÀN HÌNH */}
      {lightboxIndex !== null &&
        homestay &&
        homestay.images.length > 0 &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex flex-col bg-black/94 backdrop-blur-md pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Xem ảnh chỗ nghỉ"
            onClick={() => setLightboxIndex(null)}
          >
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="text-sm font-bold">
                {lightboxIndex + 1} / {homestay.images.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition cursor-pointer"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="relative flex flex-1 items-center justify-center px-2 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={lightboxIndex}
                  src={mediaUrl(homestay.images[lightboxIndex])}
                  alt={`${homestay.name} — ảnh ${lightboxIndex + 1}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
                />
              </AnimatePresence>

              {homestay.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((i) => (i === null ? null : (i - 1 + homestay.images.length) % homestay.images.length))
                    }
                    className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/35 transition cursor-pointer md:left-6"
                    aria-label="Ảnh trước"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((i) => (i === null ? null : (i + 1) % homestay.images.length))
                    }
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/35 transition cursor-pointer md:right-6"
                    aria-label="Ảnh sau"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {homestay.images.length > 1 && (
              <div
                className="flex gap-2 overflow-x-auto px-4 pb-4 pt-2 scrollbar-hide"
                onClick={(e) => e.stopPropagation()}
              >
                {homestay.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all cursor-pointer ${i === lightboxIndex
                        ? 'border-white opacity-100 scale-105'
                        : 'border-transparent opacity-50 hover:opacity-80'
                      }`}
                    aria-label={`Ảnh ${i + 1}`}
                  >
                    <img src={mediaUrl(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Điều hướng mục nhanh (nút tròn góc dưới) */}
      <SectionNavigator sections={sectionLinks} />
    </div>
  );
}

/** Vị trí ô ảnh trên lưới 4 cột × 2 hàng */
const GALLERY_TILES: Record<number, string[]> = {
  1: ['col-span-4 row-span-2'],
  2: ['col-span-2 row-span-2', 'col-span-2 row-span-2'],
  3: ['col-span-2 row-span-2', 'col-span-2', 'col-span-2'],
  4: ['col-span-2 row-span-2', 'col-span-2', '', ''],
  5: ['col-span-2 row-span-2', '', '', '', ''],
};

/**
 * Thư viện ảnh đầu trang:
 * - Desktop: Mosaic với hiệu ứng parallax nhẹ trên ảnh chính
 * - Mobile: Carousel trượt ngang gọn gàng
 */
function HomestayGallery({
  images,
  name,
  onOpen,
}: {
  images: string[];
  name: string;
  onOpen: (index: number) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const heroParallaxY = useTransform(scrollY, [0, 450], [0, 24]);

  if (images.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 md:h-[420px]">
        <ImagePlaceholder Icon={Mountain} variant="hero" label="Gallery đang được chủ nhà cập nhật" />
      </div>
    );
  }

  const shown = images.slice(0, 5);
  const tiles = GALLERY_TILES[shown.length] || GALLERY_TILES[5];

  return (
    <div className="relative">
      {/* Mobile: Carousel */}
      <div className="relative h-[260px] overflow-hidden rounded-2xl bg-slate-100 md:hidden shadow-xs">
        <ImageCarousel
          images={images}
          alt={name}
          className="h-full w-full"
          imageClassName="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white transition hover:bg-black/75 cursor-pointer"
        >
          <Images className="h-3.5 w-3.5" />
          <span>{images.length} ảnh</span>
        </button>
      </div>

      {/* Desktop: Lưới mosaic với Parallax trên ảnh chính */}
      <div
        className={`hidden h-[420px] gap-2 overflow-hidden rounded-2xl md:grid shadow-xs ${shown.length === 1 ? 'grid-cols-1' : 'grid-cols-4 grid-rows-2'
          }`}
      >
        {shown.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onOpen(idx)}
            className={`group relative overflow-hidden bg-slate-100 cursor-zoom-in ${tiles?.[idx] ?? ''}`}
            aria-label={`Xem ảnh ${idx + 1} của ${images.length}`}
          >
            <motion.img
              src={mediaUrl(img)}
              alt={idx === 0 ? name : `${name} ${idx + 1}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              style={idx === 0 && !shouldReduceMotion ? { y: heroParallaxY } : undefined}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <span
              className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10"
              aria-hidden
            />
          </button>
        ))}
      </div>

      {/* Nút xem toàn bộ ảnh trên desktop */}
      <div className="hidden md:block">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => onOpen(0)}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-xs font-bold text-slate-800 shadow-md backdrop-blur-xs transition hover:bg-white active:scale-95 cursor-pointer"
        >
          <Images className="h-4 w-4 text-slate-600" />
          <span>Xem tất cả {images.length} ảnh</span>
        </motion.button>
      </div>
    </div>
  );
}
