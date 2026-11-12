import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, Map as MapIcon } from 'lucide-react';
import type { VietmapMarkerItem, VietmapViewProps } from '@/types/integrations/vietmap';
import { declutterPlanLabels, ensurePlanPinStyle, planPinHtml } from './planPins';

export type { VietmapMarkerItem, VietmapViewProps };

/**
 * Leaflet gán chuỗi HTML của divIcon/popup bằng innerHTML: mọi giá trị lấy từ API (tên, địa chỉ do đối tác nhập...)
 * phải được thoát trước khi ghép vào HTML.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Chỉ nhận URL http(s) hoặc đường dẫn nội bộ; chặn javascript:, data:... Trả về URL đã chuẩn hoá hoặc null. */
function safeHttpUrl(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

interface CategoryStyle {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  shadowColor: string;
  svgIcon: string;
  badgeBg: string;
  badgeText: string;
}

function getMarkerCategoryStyle(item: VietmapMarkerItem): CategoryStyle {
  const rawKind = (item.kind || item.category || '').toUpperCase();

  // 1. Homestay / Chỗ nghỉ: Solid Deep Forest Teal
  if (item.isMain || rawKind === 'HOMESTAY' || rawKind.includes('LODGE') || rawKind.includes('RESORT') || rawKind.includes('HOTEL')) {
    return {
      label: 'Chỗ nghỉ',
      bgColor: '#0a7d64',
      textColor: '#FFFFFF',
      borderColor: item.isMain ? '#F59E0B' : '#036855',
      shadowColor: 'rgba(4, 140, 115, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
      badgeBg: '#EDFBF7',
      badgeText: '#0a7d64',
    };
  }

  // 2. Ẩm thực / Nhà hàng: Solid Warm Crimson Coral
  if (rawKind === 'FOOD' || rawKind === 'RESTAURANT' || rawKind.includes('ĂN') || rawKind.includes('QUÁN')) {
    return {
      label: 'Ẩm thực',
      bgColor: '#DC2626',
      textColor: '#FFFFFF',
      borderColor: '#B91C1C',
      shadowColor: 'rgba(220, 38, 38, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v14a2 2 0 0 1-2 2H9"/><line x1="6" y1="2" x2="6" y2="22"/></svg>`,
      badgeBg: '#FEF2F2',
      badgeText: '#DC2626',
    };
  }

  // 3. Danh thắng / Check-in: Solid Royal Sapphire Blue
  if (rawKind === 'ATTRACTION' || rawKind === 'DESTINATION' || rawKind === 'EXPERIENCE' || rawKind.includes('CẢNH') || rawKind.includes('THẮNG')) {
    return {
      label: 'Thắng cảnh',
      bgColor: '#2563EB',
      textColor: '#FFFFFF',
      borderColor: '#1D4ED8',
      shadowColor: 'rgba(37, 99, 235, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`,
      badgeBg: '#EFF6FF',
      badgeText: '#2563EB',
    };
  }

  // 4. Di chuyển / Phương tiện: Solid Amber Gold
  if (rawKind === 'TRANSPORT' || rawKind === 'BUS' || rawKind === 'STATION' || rawKind.includes('XE') || rawKind.includes('BẾN')) {
    return {
      label: 'Di chuyển',
      bgColor: '#D97706',
      textColor: '#FFFFFF',
      borderColor: '#B45309',
      shadowColor: 'rgba(217, 119, 6, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.2 6 18.2 6H5.8C4.8 6 3.9 6.8 3.6 7.8L2.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>`,
      badgeBg: '#FFFBEB',
      badgeText: '#D97706',
    };
  }

  // 5. Chợ / Mua sắm: Solid Rich Purple
  if (rawKind === 'MARKET' || rawKind === 'SHOPPING' || rawKind.includes('CHỢ') || rawKind.includes('TẠP HOÁ') || rawKind.includes('MUA SẮM')) {
    return {
      label: 'Chợ / Mua sắm',
      bgColor: '#7C3AED',
      textColor: '#FFFFFF',
      borderColor: '#6D28D9',
      shadowColor: 'rgba(124, 58, 237, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
      badgeBg: '#F5F3FF',
      badgeText: '#7C3AED',
    };
  }

  // 6. Dịch vụ / Khoáng nóng / Tiện ích: Solid Dark Slate
  if (rawKind === 'SERVICE' || rawKind === 'UTILITY' || rawKind === 'HOT_SPRING' || rawKind.includes('KHOÁNG') || rawKind.includes('SPA')) {
    return {
      label: 'Dịch vụ',
      bgColor: '#0F172A',
      textColor: '#FFFFFF',
      borderColor: '#334155',
      shadowColor: 'rgba(15, 23, 42, 0.4)',
      svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      badgeBg: '#F1F5F9',
      badgeText: '#0F172A',
    };
  }

  // Mặc định: Solid Neutral Gray-Green
  return {
    label: 'Địa điểm',
    bgColor: '#475569',
    textColor: '#FFFFFF',
    borderColor: '#334155',
    shadowColor: 'rgba(71, 85, 105, 0.4)',
    svgIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    badgeBg: '#F8FAFC',
    badgeText: '#475569',
  };
}

/** Lề căn khung: một số (đều 4 phía) hoặc lề riêng góc trên-trái / dưới-phải (chừa chỗ cho lớp phủ của trang). */
function fitOptions(padding: NonNullable<VietmapViewProps['fitPadding']>): L.FitBoundsOptions {
  return typeof padding === 'number'
    ? { padding: [padding, padding] }
    : { paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight };
}

export default function VietmapView({
  centerLat = 21.85,
  centerLng = 104.08,
  zoomLevel = 13,
  markers = [],
  className = "w-full h-full min-h-[350px] rounded-lg overflow-hidden",
  onMarkerClick,
  interactive = true,
  scrollWheelZoom,
  onMapClick,
  selectedPadding,
  mapClassName = 'min-h-[350px]',
  fitPadding = 40,
  zoomSnap = 1,
  onLabelsHiddenChange,
}: VietmapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const fallbackLayerRef = useRef<L.TileLayer | null>(null);
  /** Danh sách id điểm lần căn khung gần nhất: chỉ đổi huy hiệu / điểm chọn thì không căn lại (bản đồ không nhảy). */
  const fittedKeyRef = useRef('');
  /** Khung đã căn gần nhất + khách đã kéo bản đồ chưa: khung chứa đổi kích thước thì căn lại nếu khách chưa kéo. */
  const fittedBoundsRef = useRef<L.LatLngBounds | null>(null);
  const userMovedRef = useRef(false);
  /** Bản đồ tạo một lần: giữ hàm bấm vùng trống mới nhất trong ref. */
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  const fitPaddingRef = useRef(fitPadding);
  useEffect(() => { fitPaddingRef.current = fitPadding; }, [fitPadding]);
  /** Pin đang chọn lần trước — chỉ kéo bản đồ khi khách chọn pin khác. */
  const focusedIdRef = useRef<string | number | null>(null);
  const onLabelsHiddenRef = useRef(onLabelsHiddenChange);
  useEffect(() => { onLabelsHiddenRef.current = onLabelsHiddenChange; }, [onLabelsHiddenChange]);
  /** Pin lịch trình: xếp lại nhãn tên cho khỏi chồng nhau (sau khi vẽ pin, phóng to / kéo, đổi kích thước khung). */
  const relabel = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const hidden = declutterPlanLabels(map.getContainer());
    onLabelsHiddenRef.current?.(hidden);
  }, []);

  const vietmapApiKey = (import.meta.env.VITE_VIETMAP_API_KEY as string | undefined)?.trim() || '';
  const [hasTileError, setHasTileError] = useState(false);

  // Nền dự phòng Esri World Imagery (ảnh vệ tinh): không cần API key và KHÔNG vẽ biên giới chính trị
  // trên ảnh — trung lập về chủ quyền (khác OSM vẽ Hoàng Sa/Trường Sa sai lệch nên bị cấm),
  // đảm bảo bản đồ vẫn tương tác (zoom/kéo) ngay cả khi chưa cấu hình key VietMap.
  const ensureFallbackBasemap = (map: L.Map) => {
    if (fallbackLayerRef.current) return;
    fallbackLayerRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 }
    ).addTo(map);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Bản đồ xem trước (interactive=false): khóa kéo / phóng to để vuốt qua không kẹt cuộn trang.
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: zoomLevel,
        zoomControl: interactive,
        zoomSnap,
        scrollWheelZoom: scrollWheelZoom ?? interactive,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
      });

      // Ưu tiên nền VietMap khi đã cấu hình key Tilemap.
      if (vietmapApiKey) {
        const tileUrl = `https://maps.vietmap.vn/tm/{z}/{x}/{y}.png?apikey=${encodeURIComponent(vietmapApiKey)}`;
        const vietmapTileLayer = L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://maps.vietmap.vn" target="_blank" rel="noopener noreferrer">VietMap</a> contributors',
          maxZoom: 19,
        });

        vietmapTileLayer.on('tileerror', () => {
          setHasTileError(true);
          // Key sai loại / hết hạn: lót nền vệ tinh Esri bên dưới để bản đồ vẫn dùng được thay vì trống.
          ensureFallbackBasemap(map);
          if (fallbackLayerRef.current) fallbackLayerRef.current.bringToBack();
        });

        vietmapTileLayer.addTo(map);
      } else {
        // Chưa có key VietMap: dùng thẳng nền vệ tinh Esri — bản đồ thật (zoom/kéo/marker) thay vì nền xám trống.
        // Tuyệt đối không fallback sang OSM để tránh vi phạm chủ quyền Hoàng Sa - Trường Sa.
        ensureFallbackBasemap(map);
      }

      const markersLayer = L.layerGroup().addTo(map);
      map.on('dragstart', () => { userMovedRef.current = true; });
      // Pin lịch trình: phóng to / kéo xong thì xếp lại nhãn tên (ẩn nhãn nào đè lên pin, nhãn khác).
      map.on('moveend', () => relabel());
      map.on('click', () => { onMapClickRef.current?.(); });
      mapInstanceRef.current = map;
      markersLayerRef.current = markersLayer;
    } else {
      mapInstanceRef.current.setView([centerLat, centerLng], zoomLevel);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        fallbackLayerRef.current = null;
        fittedKeyRef.current = '';
        fittedBoundsRef.current = null;
      }
    };
  }, [vietmapApiKey]);

  // Khung chứa đổi kích thước sau khi bản đồ đã tạo (bố cục trang ổn định muộn, xoay máy...): Leaflet giữ kích thước cũ
  // nên hiện dải xám và căn khung sai — báo lại kích thước, căn lại các điểm nếu khách chưa tự kéo bản đồ.
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      map.invalidateSize({ animate: false });
      if (fittedBoundsRef.current && !userMovedRef.current) {
        map.fitBounds(fittedBoundsRef.current, { ...fitOptions(fitPaddingRef.current), maxZoom: 15, animate: false });
      }
      relabel();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [relabel]);

  // Update center when props change
  useEffect(() => {
    if (mapInstanceRef.current && centerLat && centerLng) {
      mapInstanceRef.current.setView([centerLat, centerLng], zoomLevel);
    }
  }, [centerLat, centerLng, zoomLevel]);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    const bounds = L.latLngBounds([]);

    markers.forEach((item) => {
      if (!item.latitude || !item.longitude) return;

      const position: [number, number] = [item.latitude, item.longitude];
      bounds.extend(position);

      const isMainHomestay = Boolean(item.isMain);
      const catStyle = getMarkerCategoryStyle(item);
      const isSelected = Boolean(item.selected);
      const planTone = item.badgeTone;

      // Resolve tag display label (Tên homestay/dịch vụ hoặc giá theo displayMode)
      let displayTagText = item.name;
      if (item.tagText) {
        displayTagText = item.tagText;
      } else if (item.displayMode === 'price' && item.price) {
        displayTagText = `${(item.price / 1000).toLocaleString('vi-VN')}k`;
      } else {
        displayTagText = item.name;
      }

      // Truncate length if needed
      const maxLen = isMainHomestay ? 26 : 20;
      const formattedLabel = displayTagText.length > maxLen
        ? `${displayTagText.slice(0, maxLen - 2)}...`
        : displayTagText;

      // Custom Pin Marker: Biểu tượng location pin chuẩn + nhãn tên nằm cạnh pin (không nằm trong pin)
      const pinSize = isMainHomestay || isSelected ? 32 : 26;
      const innerIconSize = isMainHomestay || isSelected ? 16 : 13;
      // Huy hiệu "+" (thêm vào lịch trình) / số thứ tự điểm đã thêm, gắn ở góc trên phải của pin.
      const badgeHtml = item.badge ? `
            <span style="
              position: absolute;
              top: -9px;
              right: -10px;
              min-width: 19px;
              height: 19px;
              padding: 0 4px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 12px;
              font-weight: 800;
              line-height: 1;
              box-shadow: 0 1px 4px rgba(15, 23, 42, 0.3);
              ${item.badgeTone === 'added' ? 'background: #F59E0B; color: #FFFFFF; border: 2px solid #FFFFFF;' : 'background: #FFFFFF; color: #0a7d64; border: 2px solid #0a7d64;'}
            ">${escapeHtml(item.badge)}</span>` : '';
      const markerHtml = `
        <div class="vietmap-modern-marker-wrapper" style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transform: translate(-${pinSize / 2}px, -100%);
          z-index: ${isMainHomestay ? '1000' : '500'};
          white-space: nowrap;
          pointer-events: auto;
        ">
          <!-- 1. Biểu tượng Location Pin sắc nét (+ huy hiệu lịch trình nếu có) -->
          <span style="position: relative; display: inline-flex; flex-shrink: 0;">
          <div class="vietmap-pin-badge" style="
            position: relative;
            width: ${pinSize}px;
            height: ${pinSize}px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: ${catStyle.bgColor};
            color: ${catStyle.textColor};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 2px solid ${isMainHomestay ? '#F59E0B' : '#FFFFFF'};
            box-shadow: 0 4px 10px ${catStyle.shadowColor};
            transition: transform 0.18s ease;
          ">
            <span style="
              transform: rotate(45deg);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: ${innerIconSize}px;
              height: ${innerIconSize}px;
            ">
              ${catStyle.svgIcon}
            </span>
          </div>
          ${badgeHtml}
          </span>

          <!-- 2. Nhãn tên / giá nằm cạnh (bên phải) biểu tượng Location -->
          <div class="vietmap-pin-label" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: #FFFFFF;
            color: #0F172A;
            border: 1px solid #E2E8F0;
            border-left: 3px solid ${catStyle.bgColor};
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
            padding: ${isMainHomestay ? '3px 8px' : '2px 6px'};
            border-radius: 4px;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: ${isMainHomestay ? '11.5px' : '10.5px'};
            font-weight: ${isMainHomestay || isSelected ? '700' : '600'};
            line-height: 1.25;
            letter-spacing: -0.01em;
            transform: translateY(-${pinSize / 3}px);
            pointer-events: auto;
          ">
            <span>${escapeHtml(formattedLabel)}</span>
            ${isMainHomestay ? `<span style="font-size: 8.5px; background: #F59E0B; color: #FFFFFF; padding: 0.5px 3.5px; border-radius: 2px; font-weight: 700;">Chính</span>` : ''}
          </div>
        </div>
      `;

      if (planTone) ensurePlanPinStyle();
      const customIcon = L.divIcon({
        html: planTone
          ? planPinHtml({
              id: item.id,
              tone: planTone,
              label: escapeHtml(item.name.length > 24 ? `${item.name.slice(0, 22)}…` : item.name),
              badge: escapeHtml(item.badge ?? ''),
              selected: isSelected,
            })
          : markerHtml,
        className: 'vietmap-custom-marker',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      const coverImageUrl = safeHttpUrl(item.coverImageUrl);
      const detailUrl = safeHttpUrl(item.url);
      const addressText = item.address || item.district;
      const popupHtml = `
        <div style="max-width: 230px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2px;">
          ${coverImageUrl ? `
            <div style="position: relative; overflow: hidden; border-radius: 4px; margin-bottom: 7px;">
              <img
                src="${escapeHtml(coverImageUrl)}"
                alt="${escapeHtml(item.name)}"
                style="width: 100%; height: 110px; object-fit: cover; display: block;" 
              />
              <div style="
                position: absolute; 
                top: 5px; 
                left: 5px; 
                background: ${catStyle.bgColor}; 
                color: white; 
                font-size: 10px; 
                font-weight: 700; 
                padding: 2px 6px; 
                border-radius: 3px; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                display: flex;
                align-items: center;
                gap: 4px;
              ">
                <span style="display: flex; align-items: center;">${catStyle.svgIcon}</span> ${catStyle.label}
              </div>
            </div>
          ` : `
            <div style="
              display: inline-flex; 
              align-items: center; 
              gap: 4px; 
              background: ${catStyle.badgeBg}; 
              color: ${catStyle.badgeText}; 
              font-size: 10px; 
              font-weight: 700; 
              padding: 2px 6px; 
              border-radius: 3px; 
              margin-bottom: 6px;
              border: 1px solid ${catStyle.borderColor}33;
            ">
              <span style="display: flex; align-items: center;">${catStyle.svgIcon}</span> ${catStyle.label}
            </div>
          `}

          <div style="font-weight: 700; font-size: 13px; color: #0f172a; line-height: 1.35; margin-bottom: 4px;">
            ${escapeHtml(item.name)}
          </div>

          ${addressText ? `
            <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; display: flex; align-items: start; gap: 3px;">
              <span style="color: ${catStyle.bgColor}; flex-shrink: 0; font-size: 11px;">📍</span>
              <span style="overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                ${escapeHtml(addressText)}
              </span>
            </div>
          ` : ''}

          ${typeof item.distance === 'number' && Number.isFinite(item.distance) ? `
            <div style="font-size: 11px; font-weight: 600; color: #0a7d64; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>
              <span>Khoảng cách: ${item.distance < 1 ? Math.round(item.distance * 1000) + ' m' : item.distance.toFixed(1) + ' km'}</span>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px solid #f1f5f9;">
            ${item.price ? `
              <div style="font-weight: 800; font-size: 13px; color: #ea580c;">
                ${escapeHtml(Number(item.price).toLocaleString('vi-VN'))} đ<span style="font-size: 10px; font-weight: 600; color: #64748b;">/đêm</span>
              </div>
            ` : '<div></div>'}
            ${detailUrl ? `
              <a
                href="${escapeHtml(detailUrl)}"
                style="
                  display: inline-block;
                  background: #0a7d64;
                  color: white;
                  font-size: 10px;
                  font-weight: 700;
                  padding: 4px 8px;
                  border-radius: 4px;
                  text-decoration: none;
                  box-shadow: 0 2px 4px rgba(4,140,115,0.2);
                "
              >
                Xem chi tiết →
              </a>
            ` : ''}
          </div>
        </div>
      `;

      const zIndexOffset = isSelected ? 1000
        : planTone === 'added' ? 400
        : planTone === 'home' ? 300
        : isMainHomestay ? 500
        : 0;
      // Pin lịch trình: rê chuột thì nổi lên trên (nhãn đang ẩn hiện ra không bị pin khác che).
      const leafletMarker = L.marker(position, { icon: customIcon, zIndexOffset, riseOnHover: !!planTone });
      if (!item.noPopup) {
        leafletMarker.bindPopup(popupHtml, { maxWidth: 250, className: 'vietmap-custom-popup' });
      }

      leafletMarker.on('click', () => {
        onMarkerClick?.(item);
      });

      if (markersLayerRef.current) {
        markersLayerRef.current.addLayer(leafletMarker);
      }
    });

    // Căn khung theo các điểm khi danh sách điểm đổi (không căn lại khi chỉ đổi huy hiệu / điểm đang chọn).
    const fitKey = markers.map((m) => m.id).join('|');
    // Không chạy hiệu ứng: marker được vẽ lại ngay sau đó (đổi huy hiệu) giữa lúc đang zoom làm Leaflet báo lỗi _leaflet_pos.
    if (markers.length > 1 && bounds.isValid() && mapInstanceRef.current && fitKey !== fittedKeyRef.current) {
      fittedKeyRef.current = fitKey;
      fittedBoundsRef.current = bounds;
      userMovedRef.current = false;
      mapInstanceRef.current.fitBounds(bounds, { ...fitOptions(fitPaddingRef.current), maxZoom: 15, animate: false });
    }

    // Chọn pin khác: kéo bản đồ (ít nhất có thể) để pin không nằm dưới thẻ nổi của trang.
    const focused = markers.find((m) => m.selected && m.latitude && m.longitude);
    const focusedId = focused ? focused.id : null;
    if (focused && selectedPadding && focusedId !== focusedIdRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.panInside([focused.latitude, focused.longitude], {
        paddingTopLeft: selectedPadding.topLeft,
        paddingBottomRight: selectedPadding.bottomRight,
        duration: 0.3,
      });
    }
    focusedIdRef.current = focusedId;
    if (markers.some((m) => m.badgeTone)) relabel();
  }, [markers, onMarkerClick, selectedPadding, relabel]);

  return (
    <div className={`relative ${className}`}>
      {/* Ghi chú cấu hình chỉ hiện ở bản dev: production luôn có nền bản đồ thật
          (VietMap khi có key, vệ tinh Esri khi chưa có key nên không còn thông báo "nền tạm thời chưa khả dụng").
          Tuyệt đối không fallback sang OSM tiles để tránh vi phạm chủ quyền Hoàng Sa - Trường Sa. */}
      {!vietmapApiKey && import.meta.env.DEV && (
        <div className="absolute bottom-2 left-2 right-2 z-[1000] flex items-center gap-2 rounded-md bg-slate-800/80 px-3 py-2 text-[11px] text-white backdrop-blur-xs shadow-md">
          <MapIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="opacity-90">
            Đang dùng nền vệ tinh Esri (chưa cấu hình VITE_VIETMAP_API_KEY). Thêm key Tilemap để hiện nền VietMap.
          </span>
        </div>
      )}

      {/* Lỗi tải tile VietMap (key sai loại / hết hạn): nền vệ tinh Esri đã tự lót bên dưới nên bản đồ vẫn
          dùng được; production không hiện thông báo, bản dev hiện hướng dẫn kiểm tra key. */}
      {hasTileError && vietmapApiKey && import.meta.env.DEV && (
        <div className="absolute top-3 left-3 right-3 z-[1000] p-3 rounded-md bg-rose-600/95 text-white backdrop-blur-xs shadow-md border border-rose-700/30 flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Lỗi tải bản đồ nền VietMap (Kiểm tra API Key)</p>
            <p className="text-[11px] opacity-90 mt-0.5">
              Nếu bạn thấy thông báo <em>"This consumer only has APIs enabled..."</em>, nghĩa là bạn đang dùng API Key của dịch vụ APIs (Search/Route).
              Hãy vào VietMap Console &gt; Consumers, tạo/chọn consumer loại <strong>Tilemap</strong> và copy API Key đó vào <code className="bg-black/20 px-1 py-0.5 rounded font-mono">VITE_VIETMAP_API_KEY</code>.
            </p>
          </div>
        </div>
      )}

      <div ref={mapContainerRef} className={`w-full h-full ${mapClassName} z-10 bg-slate-100`} />
    </div>
  );
}
