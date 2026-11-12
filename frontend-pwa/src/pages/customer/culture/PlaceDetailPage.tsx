import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { fetchPlaceDetail, peekPlaceDetail } from '@/services/placeService';
import { PlaceDetail } from '@/types/homestay';
import { canonicalPlacePath, placeSectionFor } from '@/lib/placeRoutes';
import { Button } from '@/components/ui/button';
import VietmapView from '@/components/map/VietmapView';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';
import {
  MapPin,
  Star,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Map as MapIcon,
  Phone,
  Globe,
  Compass,
  Navigation,
  Check,
  Flame,
  Info,
  UtensilsCrossed,
  Layers,
  Bike,
  ShieldCheck,
  ExternalLink,
  MessageCircle,
  Video
} from 'lucide-react';
import { openGoogleMapsDirections } from '@/lib/mapUtils';
import TikTokEmbedPlayer from '@/components/homestay/TikTokEmbedPlayer';
import PlaceHighlights from '@/components/common/PlaceHighlights';
import DetailSection from '@/components/common/DetailSection';
import DetailPageShell, { DetailAsideCard, DetailFact } from '@/components/common/DetailPageShell';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';



// Dữ liệu Pro / Con / Tip được lấy trực tiếp từ bảng place_highlight qua API backend

/** Đổi sang địa điểm khác (cùng route, khác :identifier) thì dựng lại trang từ đầu. */
export default function PlaceDetailPage() {
  const { identifier } = useParams<{ identifier?: string }>();
  return <PlaceDetailContent key={identifier} identifier={identifier} />;
}

function PlaceDetailContent({ identifier }: { identifier?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Đã xem trước đó (quay lại từ trang khác) thì vẽ ngay từ bộ nhớ, làm mới ở nền.
  const [place, setPlace] = useState<PlaceDetail | null>(() => (identifier ? peekPlaceDetail(identifier) ?? null : null));
  const [loading, setLoading] = useState(() => !(identifier && peekPlaceDetail(identifier)));

  useEffect(() => {
    if (!identifier) return undefined;
    let alive = true;
    fetchPlaceDetail(identifier)
      .then((data) => {
        if (!alive) return;
        setPlace(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [identifier]);

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] bg-[var(--color-canvas)]"><DetailSkeleton label="Đang tải thông tin địa điểm" /></div>
    );
  }

  if (!place) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center bg-[var(--color-canvas)] px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-600">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-ink-deep)] mb-2">Không tìm thấy địa điểm</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-md mb-6">
          Địa điểm bạn đang tìm kiếm có thể đã bị xóa hoặc không còn tồn tại trên hệ thống.
        </p>
        <Button
          variant="primary"
          onClick={() => navigate('/destinations')}
          className="rounded-md font-bold px-5"
        >
          Quay lại danh sách điểm đến
        </Button>
      </div>
    );
  }

  const kind = place.categoryKind || 'ATTRACTION';
  // Mở dưới mục sai (link cũ /restaurants/:id, /food/:id cho đặc sản...) thì chuyển về đường dẫn chuẩn của loại địa
  // điểm — header sáng đúng mục, breadcrumb đúng danh sách.
  const canonicalPath = identifier ? canonicalPlacePath(kind, pathname, identifier) : null;
  if (canonicalPath) return <Navigate to={canonicalPath} replace />;
  const needLabel = place.needs === 'adventure' ? 'Khám phá & phiêu lưu' : place.needs === 'enjoy' ? 'Tận hưởng & thư giãn' : null;

  // Ảnh: danh sách URL backend đã sắp (ảnh bìa trước); bản cũ chỉ có media.
  const allImages = place.images && place.images.length > 0
    ? place.images.filter(Boolean)
    : (place.media ?? []).map(m => m.publicUrl).filter(Boolean);

  // Coordinates
  const hasCoordinates = Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
  const lat = hasCoordinates ? place.latitude : 21.8588;
  const lng = hasCoordinates ? place.longitude : 104.0845;
  const addressText = place.address || (place.regionName ? `Khu vực ${place.regionName}, Lào Cai` : 'Tỉnh Lào Cai');
  const tiktokContact = place.contacts.find((contact) => contact.channel === 'TIKTOK' && contact.value);
  // Link TikTok đã hiện thành khung video — không lặp lại như một kênh liên hệ.
  const inquiryContacts = place.contacts.filter((contact) => contact.channel !== 'TIKTOK');

  // Markers for VietMap
  const markers: VietmapMarkerItem[] = [
    {
      id: place.id,
      name: place.name,
      latitude: lat,
      longitude: lng,
      address: addressText,
      coverImageUrl: allImages[0],
      isMain: true,
      kind: kind,
      tagText: place.categoryName || 'Địa điểm khám phá'
    }
  ];

  // Mục điều hướng & breadcrumb theo loại địa điểm (lib/placeRoutes — cùng nguồn với header).
  const section = placeSectionFor(kind);
  const parentRoute = section.path;
  const parentLabel = section.label;
  let categoryIcon = <Compass className="w-4 h-4 text-[var(--color-primary)]" />;
  if (kind === 'RESTAURANT' || kind === 'FOOD') {
    categoryIcon = <UtensilsCrossed className="w-4 h-4 text-[var(--color-coral)]" />;
  } else if (kind === 'TRANSPORT') {
    categoryIcon = <Bike className="w-4 h-4 text-[#3dc9d9]" />;
  } else if (kind === 'SERVICE' || kind === 'PHOTO' || kind === 'RENTAL') {
    categoryIcon = <Layers className="w-4 h-4 text-[var(--color-sun)]" />;
  }

  const hasPrice = typeof place.priceRefMin === 'number';
  const priceDisplay = !hasPrice || place.priceRefMin === 0
    ? 'Miễn phí tham quan'
    : `${(place.priceRefMin as number).toLocaleString('vi-VN')}đ${place.priceUnitNote ? ` /${place.priceUnitNote}` : ''}`;
  const amenityNames = (place.amenityItems?.length ? place.amenityItems.map((item) => item.name) : place.amenities ?? [])
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  const hasHighlights = (place.highlights ?? []).some((h) => ['PRO', 'CON', 'PAIN_POINT', 'TIP'].includes(h.type));
  const tabs = [
    { id: 'about', label: 'Giới thiệu' },
    ...(tiktokContact ? [{ id: 'video', label: 'Video' }] : []),
    ...(hasHighlights ? [{ id: 'experience', label: 'Kinh nghiệm' }] : []),
    ...(amenityNames.length > 0 ? [{ id: 'amenities', label: 'Tiện ích' }] : []),
    { id: 'map', label: 'Bản đồ' },
  ];
  const openDirections = () => openGoogleMapsDirections(lat, lng, addressText || place.name);
  const googleRating = typeof place.googleRating === 'number' ? place.googleRating : null;

  const badges = (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-2xs">
        {categoryIcon}
        {place.categoryName || parentLabel}
      </span>
      {needLabel && (
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {needLabel}
        </span>
      )}
      {place.verification === 'OFFICIAL_VERIFIED' ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> GPS đã xác minh
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> Cộng đồng đề xuất
        </span>
      )}
    </>
  );

  const meta = (
    <>
      {place.ratingAvg ? (
        <span className="inline-flex items-center gap-1 font-bold text-slate-900">
          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
          {place.ratingAvg.toFixed(1)}
          {place.ratingCount > 0 && <span className="font-normal text-slate-500">({place.ratingCount} đánh giá)</span>}
        </span>
      ) : (
        <span className="text-slate-400">Chưa có đánh giá</span>
      )}
      {googleRating != null && (
        <span className="inline-flex items-center gap-1" title="Điểm Google Maps đã xác thực">
          <span className="text-slate-300" aria-hidden>·</span>
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="font-semibold text-slate-800">{googleRating.toFixed(1)}</span>
          <span className="text-xs text-slate-500">Google</span>
        </span>
      )}
      <span className="text-slate-300" aria-hidden>·</span>
      <button
        type="button"
        onClick={openDirections}
        className="group inline-flex cursor-pointer items-center gap-1 text-left text-slate-700 transition-colors hover:text-[var(--color-primary)]"
        title="Xem chỉ đường trên Google Maps"
      >
        <MapPin className="h-4 w-4 shrink-0 text-[var(--color-primary)] transition-transform duration-200 group-hover:scale-110" />
        <span className="underline decoration-slate-300 underline-offset-4 group-hover:decoration-[var(--color-primary)]">{addressText}</span>
      </button>
      {place.altitudeMeters ? (
        <>
          <span className="text-slate-300" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Compass className="h-4 w-4 text-[var(--color-primary)]" />
            Độ cao {place.altitudeMeters}m
          </span>
        </>
      ) : null}
    </>
  );

  const aside = (
    <>
      <DetailAsideCard>
        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {hasPrice && place.priceRefMin !== 0 ? 'Mức chi phí tham khảo' : 'Chi phí'}
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900">{priceDisplay}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4 text-sm">
          <DetailFact label="Danh mục">{place.categoryName || parentLabel}</DetailFact>
          {needLabel && <DetailFact label="Nhu cầu">{needLabel}</DetailFact>}
          <DetailFact label="Khu vực">{place.regionName || 'Huyện Mù Cang Chải'}</DetailFact>
          <DetailFact label="Trạng thái">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              Đang mở cửa đón khách
            </span>
          </DetailFact>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={openDirections}
          className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl cta cta-primary font-bold text-white shadow-sm transition "
        >
          <Navigation className="h-4 w-4" />
          <span>Chỉ đường trên Google Maps</span>
        </motion.button>
        <Link
          to={parentRoute}
          onClick={(e) => {
            if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
              e.preventDefault();
              navigate(-1);
            }
          }}
          className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 text-[var(--color-primary)]" />
          {section.backLabel}
        </Link>
      </DetailAsideCard>

      {inquiryContacts.length > 0 && (
        <DetailAsideCard className="p-5!">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Kênh liên hệ hỏi thông tin</h3>
          <div className="flex flex-col gap-2">
            {inquiryContacts.map((contact, cIdx) => {
              let icon = <Globe className="w-3.5 h-3.5 text-slate-600" />;
              let label = contact.value;
              let href = contact.value;
              let colorStyle = 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100';

              if (contact.channel === 'PHONE') {
                icon = <Phone className="w-3.5 h-3.5 text-emerald-600" />;
                label = `Hotline tư vấn: ${contact.value}`;
                href = `tel:${contact.value.replace(/[^0-9+]/g, '')}`;
                colorStyle = 'bg-emerald-50/80 text-emerald-900 border-emerald-200 hover:bg-emerald-100';
              } else if (contact.channel === 'ZALO') {
                icon = <MessageCircle className="w-3.5 h-3.5 text-cyan-600" />;
                label = `Zalo hỗ trợ: ${contact.value}`;
                href = contact.value.startsWith('http') ? contact.value : `https://zalo.me/${contact.value.replace(/[^0-9]/g, '')}`;
                colorStyle = 'bg-cyan-50/80 text-cyan-900 border-cyan-200 hover:bg-cyan-100';
              } else if (contact.channel === 'FACEBOOK') {
                icon = <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />;
                label = 'Fanpage Facebook';
                href = contact.value.startsWith('http') ? contact.value : `https://facebook.com/${contact.value}`;
                colorStyle = 'bg-indigo-50/80 text-indigo-900 border-indigo-200 hover:bg-indigo-100';
              } else if (contact.channel === 'GOOGLE_MAPS') {
                icon = <MapPin className="w-3.5 h-3.5 text-blue-600" />;
                label = 'Vị trí Google Maps';
                href = contact.value;
                colorStyle = 'bg-blue-50/80 text-blue-900 border-blue-200 hover:bg-blue-100';
              }

              return (
                <a
                  key={cIdx}
                  href={href}
                  target={contact.channel === 'PHONE' ? '_self' : '_blank'}
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${colorStyle}`}
                >
                  {icon}
                  <span className="truncate">{label}</span>
                </a>
              );
            })}
          </div>
        </DetailAsideCard>
      )}
    </>
  );

  return (
    <DetailPageShell
      breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: parentLabel, to: parentRoute }, { label: place.name }]}
      badges={badges}
      title={place.name}
      meta={meta}
      images={allImages}
      tabs={tabs}
      cta={{
        label: 'Chỉ đường',
        onClick: openDirections,
        hint: (
          <>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Chi phí</span>
            <p className="text-sm font-black leading-tight text-slate-900">{priceDisplay}</p>
          </>
        ),
      }}
      shareText={place.description}
      saveLabel="Lưu"
      aside={aside}
    >
      <DetailSection id="about" variant="flat" icon={Sparkles} title="Giới thiệu địa điểm">
        <p className="whitespace-pre-line text-[15px] leading-[1.8] text-slate-700">
          {place.description
            || `Địa điểm nổi bật tọa lạc tại khu vực ${place.regionName || 'Lào Cai'}, sở hữu vẻ đẹp hoang sơ kỳ vĩ và cảnh quan đặc trưng của vùng cao Lào Cai. Nơi đây là điểm dừng chân hấp dẫn dành cho du khách muốn trải nghiệm trọn vẹn thiên nhiên và nét sinh hoạt mộc mạc của đồng bào bản địa.`}
        </p>

        {place.suitableDateStart && place.suitableDateEnd && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-[var(--color-primary)]">
            <span className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[var(--color-coral)]" />
              Thời điểm tham quan đẹp nhất trong năm:
            </span>
            <span className="font-extrabold">
              {place.suitableDateStart.split('-').reverse().slice(0, 2).join('/')} – {place.suitableDateEnd.split('-').reverse().slice(0, 2).join('/')}
            </span>
          </div>
        )}
      </DetailSection>

      {tiktokContact && (
        <DetailSection id="video" variant="flat" icon={Video} title="Video review thực tế">
          <TikTokEmbedPlayer url={tiktokContact.value} placeName={place.name} className="mx-auto" />
        </DetailSection>
      )}

      <PlaceHighlights id="experience" variant="flat" highlights={place.highlights} />

      {amenityNames.length > 0 && (
        <DetailSection id="amenities" variant="flat" icon={CheckCircle2} title="Tiện ích & dịch vụ">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-2xl border border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-3">
            {amenityNames.map((name) => (
              <li key={name} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      <DetailSection
        id="map"
        variant="flat"
        icon={MapIcon}
        title="Bản đồ & đường đi"
        aside={hasCoordinates ? (
          <button
            type="button"
            onClick={openDirections}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/70 px-3.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:border-emerald-600/50 hover:bg-emerald-100"
            title="Mở Google Maps để chọn điểm xuất phát"
          >
            <Navigation className="h-3.5 w-3.5 text-emerald-600" />
            <span>Chỉ đường Google Maps</span>
          </button>
        ) : undefined}
      >
        <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <div>
              <span className="font-bold text-slate-900">Địa chỉ: </span>
              <span>{addressText}</span>
            </div>
          </div>
          {place.accessNote && (
            <div className="flex items-start gap-2 border-t border-slate-200/70 pt-1.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div>
                <span className="font-bold text-slate-900">Ghi chú tiếp cận: </span>
                <span className="text-slate-600">{place.accessNote}</span>
              </div>
            </div>
          )}
        </div>

        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200 md:h-[400px]">
          <VietmapView
            centerLat={lat}
            centerLng={lng}
            zoomLevel={14}
            markers={markers}
            className="h-full w-full"
            mapClassName="min-h-0"
          />
        </div>
      </DetailSection>
    </DetailPageShell>
  );
}
