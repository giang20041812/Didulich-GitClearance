import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { placeDetailPath } from '@/lib/placeRoutes';
import { ArrowLeft, Crosshair, MapPinOff, RefreshCw } from 'lucide-react';
import { MapContextData, MapOverviewPlace, MapViewerScenario } from '@/types/integrations/google-maps';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';
import { fetchMapContext, fetchMapOverviewPlaces } from '@/services/placeService';
import InteractiveMapView from '@/components/map/InteractiveMapView';
import MapSlideUpSheet from '@/components/map/MapSlideUpSheet';
import VietmapView from '@/components/map/VietmapView';

type LoadStatus = 'loading' | 'error' | 'ready';

/** /homestay/:slug/map: bản đồ của một chỗ nghỉ. /map (lối tắt PWA, nút "Xem bản đồ"): bản đồ tổng quan. */
export default function FullScreenMapPage() {
  const { slug } = useParams<{ slug?: string }>();
  // key theo slug: đổi địa điểm thì trạng thái tải được làm mới từ đầu.
  return slug ? <PlaceMapView key={slug} slug={slug} /> : <OverviewMapView />;
}

function MapHeader({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  // Mở thẳng từ lối tắt PWA thì không có trang trước trong app: về trang chủ thay vì thoát khỏi app.
  const goBack = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIndex > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <header className="relative z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-2.5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shrink-0"
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

function MapLoading({ text }: { text: string }) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function MapMessage({ title, description, onRetry, children }: {
  title: string;
  description: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-slate-50">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mb-4 text-amber-600 shadow-2xs">
        <MapPinOff className="w-8 h-8" />
      </div>
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-1.5">{title}</h2>
      <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-6 leading-relaxed">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl cta cta-primary text-white text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function PlaceMapView({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [mapContext, setMapContext] = useState<MapContextData | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('SCENARIO_1');

  useEffect(() => {
    let isMounted = true;
    fetchMapContext(slug)
      .then((data) => {
        if (!isMounted) return;
        setMapContext(data);
        setActiveScenarioId(data.scenarios.find((s) => s.isPrimary)?.id ?? data.scenarios[0]?.id ?? 'SCENARIO_1');
        setStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load map context:', err);
        if (isMounted) setStatus('error');
      });
    return () => {
      isMounted = false;
    };
  }, [slug, reloadKey]);

  if (status === 'loading') {
    return <MapLoading text="Đang tải bản đồ vị trí..." />;
  }

  if (status === 'error' || !mapContext) {
    return (
      <div className="h-screen w-screen flex flex-col bg-slate-50">
        <MapHeader title="Bản đồ vị trí" />
        <MapMessage
          title="Không tải được bản đồ địa điểm"
          description="Địa điểm có thể không còn tồn tại hoặc kết nối đang gián đoạn. Vui lòng thử lại."
          onRetry={() => {
            setStatus('loading');
            setReloadKey((k) => k + 1);
          }}
        >
          <Link to="/map" className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold">
            Xem bản đồ du lịch
          </Link>
        </MapMessage>
      </div>
    );
  }

  const goToDetail = () => navigate(`/homestays/${mapContext.placeId}`);

  if (!mapContext.coordinates) {
    return (
      <div className="h-screen w-screen flex flex-col bg-slate-50">
        <MapHeader title="Bản đồ vị trí" subtitle={mapContext.placeName} />
        <MapMessage
          title="Địa điểm chưa có toạ độ trên bản đồ"
          description={mapContext.address
            ? `Địa chỉ: ${mapContext.address}. Vui lòng liên hệ chỗ nghỉ để được chỉ đường.`
            : 'Vui lòng liên hệ chỗ nghỉ để được chỉ đường.'}
        >
          <button
            type="button"
            onClick={goToDetail}
            className="px-5 py-2.5 rounded-xl cta cta-primary text-white text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            Quay lại chi tiết địa điểm
          </button>
        </MapMessage>
      </div>
    );
  }

  const placeCoordinates = mapContext.coordinates;
  const primaryScenario: MapViewerScenario = {
    id: 'SCENARIO_1',
    code: `MAP-${mapContext.placeId}`,
    label: mapContext.placeName,
    targetName: mapContext.placeName,
    latitude: placeCoordinates.latitude,
    longitude: placeCoordinates.longitude,
    zoomLevel: 15,
    isPrimary: true,
  };
  const scenarios = mapContext.scenarios.length > 0 ? mapContext.scenarios : [primaryScenario];
  const currentScenario = scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? primaryScenario;
  const resetScenarioId = scenarios.find((s) => s.isPrimary)?.id ?? scenarios[0]?.id ?? primaryScenario.id;
  // Đang xem chính chỗ nghỉ (không phải một điểm lân cận): mới hiện địa chỉ, ghi chú đường đi và huy hiệu xác minh.
  const viewingPlace = currentScenario.isPrimary ?? currentScenario.id === resetScenarioId;

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-slate-100">
      <MapHeader
        title="Bản đồ vị trí"
        subtitle={mapContext.placeName}
        actions={(
          <button
            type="button"
            onClick={() => setActiveScenarioId(resetScenarioId)}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Định vị về chỗ nghỉ"
            aria-label="Định vị về chỗ nghỉ"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      >
        {/* Chuyển nhanh giữa chỗ nghỉ và các điểm tham quan lân cận (dữ liệu thật từ máy chủ) */}
        {scenarios.length > 1 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {scenarios.map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => setActiveScenarioId(sc.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  currentScenario.id === sc.id
                    ? 'bg-[var(--color-primary)] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sc.isPrimary ? `📍 ${sc.targetName}` : sc.label}
              </button>
            ))}
          </div>
        )}
      </MapHeader>

      {/* Main Map Viewport */}
      <main className="flex-1 relative w-full h-full">
        <InteractiveMapView
          centerLat={currentScenario.latitude}
          centerLng={currentScenario.longitude}
          zoomLevel={currentScenario.zoomLevel}
          placeName={mapContext.placeName}
          placeLat={placeCoordinates.latitude}
          placeLng={placeCoordinates.longitude}
          pois={mapContext.pois}
        />

        {/* Slide-Up Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto">
          <MapSlideUpSheet
            placeName={currentScenario.targetName}
            address={viewingPlace ? mapContext.address : currentScenario.accessNote}
            regionName={mapContext.regionName}
            categoryLabel={viewingPlace ? 'Chỗ nghỉ' : undefined}
            latitude={currentScenario.latitude}
            longitude={currentScenario.longitude}
            altitudeMeters={currentScenario.altitudeMeters ?? mapContext.altitudeMeters}
            accessNote={viewingPlace ? (currentScenario.accessNote ?? mapContext.accessNote) : undefined}
            verificationBadge={viewingPlace ? mapContext.verificationBadge : undefined}
            onBackToDetail={goToDetail}
          />
        </div>
      </main>
    </div>
  );
}

/** Đường dẫn trang chi tiết theo loại địa điểm (lib/placeRoutes — đặc sản mở dưới mục "Đặc sản"). */
function detailPathFor(place: MapOverviewPlace): string {
  return placeDetailPath(place.kind, place.id);
}

const DEFAULT_CENTER = { latitude: 21.85, longitude: 104.08 }; // Mù Cang Chải

function OverviewMapView() {
  const [places, setPlaces] = useState<MapOverviewPlace[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    fetchMapOverviewPlaces()
      .then((data) => {
        if (!isMounted) return;
        setPlaces(data);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load map places:', err);
        if (isMounted) setStatus('error');
      });
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const markers: VietmapMarkerItem[] = useMemo(() => places.map((place) => ({
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    kind: place.kind,
    address: place.address || place.regionName,
    coverImageUrl: place.coverImageUrl,
    url: detailPathFor(place),
    displayMode: 'name' as const,
  })), [places]);

  if (status === 'loading') {
    return <MapLoading text="Đang tải bản đồ du lịch..." />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-slate-100">
      <MapHeader
        title="Bản đồ du lịch"
        subtitle={status === 'ready' && places.length > 0 ? `${places.length} địa điểm có vị trí trên bản đồ` : undefined}
      />
      {status === 'error' ? (
        <MapMessage
          title="Không tải được bản đồ du lịch"
          description="Kết nối đang gián đoạn. Vui lòng thử lại sau ít phút."
          onRetry={() => {
            setStatus('loading');
            setReloadKey((k) => k + 1);
          }}
        />
      ) : places.length === 0 ? (
        <MapMessage
          title="Chưa có địa điểm nào trên bản đồ"
          description="Các địa điểm sẽ xuất hiện ở đây khi có toạ độ được xác minh."
        >
          <Link to="/homestays" className="px-5 py-2.5 rounded-xl cta cta-primary text-white text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95">
            Xem danh sách homestay
          </Link>
        </MapMessage>
      ) : (
        <main className="flex-1 relative w-full h-full">
          <VietmapView
            centerLat={places[0]?.latitude ?? DEFAULT_CENTER.latitude}
            centerLng={places[0]?.longitude ?? DEFAULT_CENTER.longitude}
            zoomLevel={12}
            markers={markers}
            className="w-full h-full min-h-[calc(100vh-56px)]"
          />
        </main>
      )}
    </div>
  );
}
