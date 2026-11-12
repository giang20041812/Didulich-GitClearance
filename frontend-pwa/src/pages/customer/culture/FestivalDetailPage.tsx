import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchFestivalByIdOrSlug } from '@/services/festivalService';
import { FestivalDto } from '@/types/festival';
import { Button } from '@/components/ui/button';
import VietmapView from '@/components/map/VietmapView';
import type { VietmapMarkerItem } from '@/types/integrations/vietmap';
import {
  Calendar,
  MapPin,
  Sparkles,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  Map as MapIcon,
  Compass,
  Navigation,
  Flame,
  Info,
} from 'lucide-react';
import { openGoogleMapsDirections } from '@/lib/mapUtils';
import DetailSection from '@/components/common/DetailSection';
import PlaceHighlights from '@/components/common/PlaceHighlights';
import DetailPageShell, { DetailAsideCard, DetailFact } from '@/components/common/DetailPageShell';
import type { PlaceHighlightItem } from '@/types/homestay';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';

// Tọa độ GPS chuẩn cho từng lễ hội tại Mù Cang Chải
const FESTIVAL_COORDINATES: Record<string, { lat: number; lng: number; address: string; accessNote: string }> = {
  'mua-vang-kham-pha-ruong-bac-thang': {
    lat: 21.8485,
    lng: 104.0912,
    address: 'Đồi Mâm Xôi, Xã La Pán Tẩn, Huyện Mù Cang Chải, Tỉnh Lào Cai',
    accessNote: 'Từ Quốc lộ 32 rẽ vào đường liên thôn La Pán Tẩn. Ô tô đỗ tại bãi xe chân đồi, tiếp tục đi bộ hoặc xe ôm bản địa 1.5km lên đồi.'
  },
  'mung-com-moi': {
    lat: 21.7512,
    lng: 104.3184,
    address: 'Bản Lìm Mông, Xã Tú Lệ & Bản Sáng Nhù, Mù Cang Chải, Lào Cai',
    accessNote: 'Đường bê tông liên bản ô tô vào tận nơi. Có bãi đỗ xe tại nhà văn hóa cộng đồng bản.'
  },
  'festival-khen-mong': {
    lat: 21.8588,
    lng: 104.0845,
    address: 'Sân vận động Trung tâm Huyện Mù Cang Chải, Thị trấn Mù Cang Chải, Lào Cai',
    accessNote: 'Ngay trung tâm thị trấn, mặt đường Quốc lộ 32, chỗ đỗ xe máy và ô tô thuận tiện.'
  },
  'hoa-to-day': {
    lat: 21.7925,
    lng: 104.1432,
    address: 'Khu vực rừng hoa Tớ Dày, Xã Púng Luông & Nậm Khắt, Mù Cang Chải, Lào Cai',
    accessNote: 'Đi theo đường tỉnh lộ hướng Nậm Khắt, đường dốc thoai thoải, cảnh quan hai bên đường ngập tràn sắc hoa đỏ thắm.'
  },
  'gau-tao': {
    lat: 21.8650,
    lng: 104.1120,
    address: 'Đồi Gầu Tào truyền thống, Xã Chế Cu Nha, Huyện Mù Cang Chải, Tỉnh Lào Cai',
    accessNote: 'Đường đèo bê tông dốc vừa phải, ô tô gầm cao hoặc xe máy di chuyển dễ dàng.'
  }
};

// Cung cấp bộ PRO - CON - TIP đặc thù sâu sắc cho từng lễ hội
const FESTIVAL_HIGHLIGHTS: Record<string, {
  pros: string[];
  cons: string[];
  tips: string[];
}> = {
  'mua-vang-kham-pha-ruong-bac-thang': {
    pros: [
      'Khung cảnh Di tích Quốc gia ruộng bậc thang vào mùa lúa chín vàng rực rỡ nhất trong năm.',
      'Nhiều hoạt động biểu diễn dù lượn Bay Trên Mùa Vàng tại đèo Khau Phạ cực kỳ mãn nhãn.',
      'Cơ hội gặp gỡ cộng đồng nghệ nhân Mông, Thái và thưởng thức nông sản mới gặt.'
    ],
    cons: [
      'Lượng khách đổ về rất đông vào các dịp cuối tuần tháng 9 - 10, đường QL32 có thể ùn tắc cục bộ.',
      'Đoạn đường xe ôm lên Mâm Xôi dốc đứng và nhiều bụi vào những ngày hanh khô.'
    ],
    tips: [
      'Nên chụp ảnh vào khung giờ vàng 06:30 - 08:30 sáng khi sương sớm còn vờn trên ngọn lúa.',
      'Nên mặc trang phục màu nổi (trắng, đỏ, cam) để tương phản tuyệt đẹp với nền lúa chín vàng.',
      'Chuẩn bị sẵn tiền mặt lẻ để thanh toán phí xe ôm hoặc mua nông sản người dân.'
    ]
  },
  'mung-com-moi': {
    pros: [
      'Không khí đầm ấm, mộc mạc và đậm chất văn hóa gia đình truyền thống vùng cao Tây Bắc.',
      'Được thưởng thức cốm non nếp nương rang giã tay thơm ngào ngạt vừa ra lò.',
      'Trải nghiệm lối sống sinh hoạt mến khách nguyên bản của đồng bào người Thái Trắng và Mông.'
    ],
    cons: [
      'Lễ hội mang tính gia đình và thôn bản, không diễn ra cố định một ngày mà rải rác theo vụ lúa gặt.',
      'Cần có sự dẫn dắt của người dân địa phương hoặc homestay để tham gia đúng nghi lễ trang trọng.'
    ],
    tips: [
      'Hãy thử tự tay cầm chày giã cốm cùng các cô gái Thái để cảm nhận trọn vẹn sự tinh tế của phong tục.',
      'Mua cốm tươi gói lá dong mang về làm quà trong ngày là lựa chọn tuyệt vời nhất.'
    ]
  },
  'festival-khen-mong': {
    pros: [
      'Hội tụ những nghệ nhân thổi khèn điêu luyện nhất khắp các bản làng rẻo cao Tây Bắc.',
      'Các điệu múa khèn quay người, nhảy bước tinh xảo thể hiện tinh thần thượng võ và tài hoa của chàng trai Mông.',
      'Có không gian trưng bày và workshop hướng dẫn kỹ thuật chế tác nhạc cụ truyền thống.'
    ],
    cons: [
      'Khu vực sân khấu trung tâm vào tối khai mạc rất đông khán giả, cần đến sớm để có vị trí quan sát tốt.',
      'Âm thanh nhạc cụ vang rộn cả ngày, du khách nhạy cảm với tiếng ồn nên chọn vị trí ngồi thoáng.'
    ],
    tips: [
      'Gặp gỡ nghệ nhân tại các gian hàng trưng bày vào buổi sáng để được nghe diễn giải chi tiết về các thế khèn.',
      'Tôn trọng không gian biểu diễn, không đi cắt ngang qua trước mặt các nghệ nhân đang thực hiện bài khèn thi tài.'
    ]
  },
  'hoa-to-day': {
    pros: [
      'Cảnh sắc hoa Tớ Dày (đào rừng hoang dã) bung nở đỏ rực cả sườn núi báo hiệu mùa xuân về.',
      'Không gian thanh bình, ít xô bồ hơn mùa lúa chín, khí hậu mùa đông se lạnh trong lành.',
      'Các bản làng người Mông bước vào ngày tết cổ truyền với nhiều trò chơi dân gian rực rỡ sắc màu.'
    ],
    cons: [
      'Mùa hoa nở phụ thuộc nhiều vào thời tiết rét buốt, thời gian rộ hoa chỉ kéo dài từ 2 đến 3 tuần.',
      'Buổi chiều mùa đông sương mù buông sớm, nhiệt độ giảm sâu cần chuẩn bị áo ấm dày.'
    ],
    tips: [
      'Cung đường xã Nậm Khắt và đồi Púng Luông là hai tọa độ có mật độ hoa nở dày và rực rỡ nhất.',
      'Kết hợp chụp ảnh trang phục dân tộc Mông hoa trên nền cành Tớ Dày sẽ cho ra những bức ảnh rất thơ mộng.'
    ]
  },
  'gau-tao': {
    pros: [
      'Lễ hội mùa xuân linh thiêng nhất của đồng bào Mông cầu phúc, cầu mùa màng bội thu và con cái bình an.',
      'Nhiều trò chơi dân gian truyền thống sôi động: bắn nỏ, đánh cù, ném pao, đẩy gậy.',
      'Màu sắc trang phục truyền thống của phụ nữ Mông rực rỡ sắc thổ cẩm trong ngày hội lớn.'
    ],
    cons: [
      'Địa điểm diễn ra ở bãi đồi cao lộng gió, đường đi dốc và đất đỏ nếu gặp sương mù ẩm ướt.',
      'Cần chú ý giữ gìn trật tự và không làm ồn trong thời gian thầy cúng thực hiện nghi lễ dựng cây nêu.'
    ],
    tips: [
      'Hãy tham gia ném pao cùng thanh niên bản địa để trải nghiệm trọn vẹn nét văn hóa giao duyên thanh lịch.',
      'Không bước qua hoặc động chạm vào cây nêu thiêng giữa bãi hội.'
    ]
  }
};

export default function FestivalDetailPage() {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const identifier = slug || id || 'mua-vang-kham-pha-ruong-bac-thang';
  const navigate = useNavigate();

  const [festival, setFestival] = useState<FestivalDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFestivalByIdOrSlug(identifier)
      .then((data) => {
        setFestival(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [identifier]);

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] bg-[var(--color-canvas)]"><DetailSkeleton label="Đang tải thông tin lễ hội" /></div>
    );
  }

  if (!festival) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center bg-[var(--color-canvas)] px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-600">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-ink-deep)] mb-2">Không tìm thấy thông tin lễ hội</h2>
        <p className="text-sm text-[var(--color-muted)] max-w-md mb-6">
          Lễ hội bạn đang tìm kiếm có thể đã được cập nhật hoặc không tồn tại. Vui lòng quay lại danh sách để khám phá.
        </p>
        <Button
          variant="primary"
          onClick={() => navigate('/experiences')}
          className="rounded-md font-bold px-5"
        >
          Quay lại danh sách lễ hội
        </Button>
      </div>
    );
  }

  // Tọa độ & thông tin vị trí
  const geoInfo = FESTIVAL_COORDINATES[festival.slug] || {
    lat: 21.8588,
    lng: 104.0845,
    address: festival.location || 'Huyện Mù Cang Chải, Tỉnh Lào Cai',
    accessNote: 'Đường giao thông liên xã thuận tiện, di chuyển bằng xe máy hoặc ô tô.'
  };

  // Highlights Pro / Con / Tip cho các lễ hội đặc thù
  const highlights = FESTIVAL_HIGHLIGHTS[festival.slug];

  // Markers cho VietMap
  const markers: VietmapMarkerItem[] = [
    {
      id: festival.id,
      name: festival.name,
      latitude: geoInfo.lat,
      longitude: geoInfo.lng,
      address: geoInfo.address,
      coverImageUrl: festival.coverImageUrl,
      isMain: true,
      kind: 'ATTRACTION',
      tagText: festival.highlightTag || 'Lễ hội bản địa'
    }
  ];

  // PRO / CON / TIP dựng sẵn cho từng lễ hội → cùng dạng dữ liệu highlight với địa điểm & đặc sản.
  const highlightItems: PlaceHighlightItem[] = highlights
    ? ([
        ['PRO', highlights.pros],
        ['CON', highlights.cons],
        ['TIP', highlights.tips],
      ] as const).flatMap(([type, list], g) => list.map((content, i) => ({ id: g * 100 + i, type, content })))
    : [];

  const openDirections = () => openGoogleMapsDirections(geoInfo.lat, geoInfo.lng, geoInfo.address || festival.name);
  const timeText = festival.timeRange || festival.seasonNote;
  const images = festival.coverImageUrl ? [festival.coverImageUrl] : [];

  const tabs = [
    { id: 'about', label: 'Ý nghĩa' },
    ...(festival.suitableExperience || (festival.activities?.length ?? 0) > 0 ? [{ id: 'experience', label: 'Trải nghiệm' }] : []),
    ...(highlightItems.length > 0 ? [{ id: 'tips', label: 'Kinh nghiệm' }] : []),
    ...(festival.etiquetteDont ? [{ id: 'etiquette', label: 'Quy tắc' }] : []),
    { id: 'map', label: 'Bản đồ' },
  ];

  const badges = (
    <>
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-2xs">
        <Sparkles className="h-3 w-3 text-emerald-600" />
        {festival.highlightTag || 'Di sản văn hóa'}
      </span>
      {festival.isCurrentSeason && (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <Flame className="h-3.5 w-3.5 text-amber-600" />
          Thời điểm đẹp nhất đang diễn ra
        </span>
      )}
    </>
  );

  const meta = (
    <>
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
        <Calendar className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
        {timeText}
      </span>
      <span className="text-slate-300" aria-hidden>·</span>
      <button
        type="button"
        onClick={openDirections}
        className="group inline-flex cursor-pointer items-center gap-1 text-left text-slate-700 transition-colors hover:text-[var(--color-primary)]"
        title="Xem chỉ đường trên Google Maps"
      >
        <MapPin className="h-4 w-4 shrink-0 text-[var(--color-primary)] transition-transform duration-200 group-hover:scale-110" />
        <span className="underline decoration-slate-300 underline-offset-4 group-hover:decoration-[var(--color-primary)]">
          {festival.location || geoInfo.address}
        </span>
      </button>
    </>
  );

  const aside = (
    <DetailAsideCard>
      <div className="mb-4">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Thời gian tổ chức</span>
        <p className="mt-0.5 text-xl font-extrabold leading-snug text-slate-900">{timeText}</p>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4 text-sm">
        <DetailFact label="Trạng thái">
          <span className="font-bold text-[var(--color-primary)]">
            {festival.isCurrentSeason ? 'Đang vào mùa nở rộ' : 'Theo lịch thường niên'}
          </span>
        </DetailFact>
        <DetailFact label="Khu vực">{festival.regionName || 'Mù Cang Chải'}</DetailFact>
        <DetailFact label="Giá vé tham gia">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
            Miễn phí mở cửa tự do
          </span>
        </DetailFact>
        <DetailFact label="Loại hình">Di sản văn hóa phi vật thể</DetailFact>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={openDirections}
        className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl cta cta-primary font-bold text-white shadow-sm transition "
      >
        <Navigation className="h-4 w-4" />
        <span>Chỉ đường tới điểm lễ hội</span>
      </motion.button>
      <Link
        to="/experiences"
        onClick={(e) => {
          if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
            e.preventDefault();
            navigate(-1);
          }
        }}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4 text-[var(--color-primary)]" />
        Xem tất cả lễ hội khác
      </Link>
    </DetailAsideCard>
  );

  return (
    <DetailPageShell
      breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: 'Văn hóa & Lễ hội', to: '/experiences' }, { label: festival.name }]}
      badges={badges}
      title={festival.name}
      meta={meta}
      images={images}
      tabs={tabs}
      cta={{
        label: 'Chỉ đường',
        onClick: openDirections,
        hint: (
          <>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Thời gian</span>
            <p className="max-w-[200px] truncate text-sm font-black leading-tight text-slate-900">{timeText}</p>
          </>
        ),
      }}
      shareText={festival.coreValue}
      saveLabel="Lưu lại"
      aside={aside}
    >
      <DetailSection id="about" variant="flat" icon={Sparkles} title="Ý nghĩa lịch sử & văn hóa">
        <p className="whitespace-pre-line text-[15px] leading-[1.8] text-slate-700">{festival.coreValue}</p>
        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <div>
            <span className="font-bold text-slate-900">Chu kỳ thời gian mùa vụ: </span>
            <span>{festival.seasonNote}</span>
          </div>
        </div>
      </DetailSection>

      {(festival.suitableExperience || (festival.activities?.length ?? 0) > 0) && (
        <DetailSection id="experience" variant="flat" icon={Compass} title="Trải nghiệm đề xuất & hoạt động tiêu biểu">
          {festival.suitableExperience && (
            <div className="whitespace-pre-line text-[15px] leading-[1.8] text-slate-700">{festival.suitableExperience}</div>
          )}
          {festival.activities && festival.activities.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Các hoạt động chính</h3>
              <div className="flex flex-wrap gap-2">
                {festival.activities.map((act, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/70 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {act}
                  </span>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      <PlaceHighlights id="tips" variant="flat" highlights={highlightItems} />

      {festival.etiquetteDont && (
        <DetailSection id="etiquette" variant="flat" icon={ShieldAlert} title="Quy tắc văn hóa & điều không nên làm">
          <p className="text-[15px] font-medium leading-relaxed text-slate-800">{festival.etiquetteDont}</p>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              <strong>Lời khuyên du lịch có trách nhiệm:</strong> Luôn xin phép trước khi chụp ảnh người cao tuổi, không xả rác tại các khu di tích danh thắng và giữ gìn cảnh quan thiên nhiên sạch đẹp.
            </p>
          </div>
        </DetailSection>
      )}

      <DetailSection
        id="map"
        variant="flat"
        icon={MapIcon}
        title="Bản đồ & đường đi"
        aside={
          <button
            type="button"
            onClick={openDirections}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/70 px-3.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:border-emerald-600/50 hover:bg-emerald-100"
            title="Mở Google Maps để chọn điểm xuất phát"
          >
            <Navigation className="h-3.5 w-3.5 text-emerald-600" />
            <span>Chỉ đường Google Maps</span>
          </button>
        }
      >
        <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <div>
              <span className="font-bold text-slate-900">Địa chỉ tổ chức: </span>
              <span>{geoInfo.address}</span>
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-slate-200/70 pt-1.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <span className="font-bold text-slate-900">Chỉ dẫn tiếp cận: </span>
              <span className="text-slate-600">{geoInfo.accessNote}</span>
            </div>
          </div>
        </div>

        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200 md:h-[400px]">
          <VietmapView
            centerLat={geoInfo.lat}
            centerLng={geoInfo.lng}
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
