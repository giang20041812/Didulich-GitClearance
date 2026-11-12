// VietMap Integration Types — DuLichSo Project
// Dữ liệu bản đồ số Việt Nam khẳng định chủ quyền lãnh thổ & biển đảo Hoàng Sa, Trường Sa

export interface VietmapMarkerItem {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
  price?: number;
  coverImageUrl?: string;
  district?: string;
  address?: string;
  ratingScore?: number;
  url?: string;
  isMain?: boolean;
  kind?: string;
  category?: string;
  distance?: number;
  displayMode?: 'name' | 'price' | 'auto';
  tagText?: string;
  /** Số thứ tự điểm đã thêm vào lịch trình (pin 'added' hiện số này). */
  badge?: string;
  /**
   * Có giá trị thì vẽ pin kiểu "lên lịch trình": 'add' nút "+" xanh (bấm để thêm), 'added' pin cam đánh số theo badge,
   * 'home' chỗ nghỉ (ô ngôi nhà). Không có thì giữ pin theo loại địa điểm như cũ.
   */
  badgeTone?: 'add' | 'added' | 'home';
  /** Pin đang được chọn: to hơn, nằm trên cùng. */
  selected?: boolean;
  /** Không gắn popup Leaflet (trang tự hiện thẻ của điểm được chọn). */
  noPopup?: boolean;
}

export interface VietmapViewProps {
  centerLat?: number;
  centerLng?: number;
  zoomLevel?: number;
  markers?: VietmapMarkerItem[];
  className?: string;
  onMarkerClick?: (marker: VietmapMarkerItem) => void;
  /** false = bản đồ xem trước: không kéo / phóng to được (để cuộn trang trên điện thoại không bị kẹt). Mặc định true. */
  interactive?: boolean;
  /** Phóng to bằng con lăn chuột (mặc định theo interactive). Tắt khi bản đồ nằm giữa trang để cuộn trang không bị kẹt. */
  scrollWheelZoom?: boolean;
  /** Bấm vào vùng trống của bản đồ (vd đóng thẻ của điểm đang chọn). */
  onMapClick?: () => void;
  /** Vùng bị thẻ nổi che (px, tính từ mép bản đồ): chọn pin khác thì kéo bản đồ để pin nằm ngoài vùng che. */
  selectedPadding?: { topLeft: [number, number]; bottomRight: [number, number] };
  /** Lớp của khung bản đồ bên trong (mặc định "min-h-[350px]"); bản đồ nhỏ truyền "min-h-0". */
  mapClassName?: string;
  /**
   * Lề (px) khi căn khung vừa các điểm (mặc định 40); màn hình hẹp truyền nhỏ hơn để các pin không dồn cục. Truyền
   * { topLeft, bottomRight } để chừa chỗ cho lớp phủ của trang (nút, chú thích).
   */
  fitPadding?: number | { topLeft: [number, number]; bottomRight: [number, number] };
  /** Bước phóng (mặc định 1); 0.25 để căn khung vừa khít hơn trên màn hình hẹp. */
  zoomSnap?: number;
  /** Pin lịch trình: số nhãn tên bị ẩn vì chồng lên pin / nhãn khác (để trang gợi ý phóng to). */
  onLabelsHiddenChange?: (hidden: number) => void;
}

export type VietmapTileStyle = 'street' | 'satellite';
