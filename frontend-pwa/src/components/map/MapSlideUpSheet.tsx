import { useState } from 'react';
import { MapPin, Compass, AlertCircle, ExternalLink, ArrowLeft, Copy, Check } from 'lucide-react';

interface MapSlideUpSheetProps {
  placeName: string;
  address?: string;
  regionName?: string;
  /** Nhãn loại điểm (vd "Chỗ nghỉ"); bỏ trống thì không hiện. */
  categoryLabel?: string;
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  accessNote?: string;
  verificationBadge?: string;
  onBackToDetail?: () => void;
}

/** Chỉ hiển thị dữ liệu thật của điểm đang xem: trường nào backend không có thì ẩn, không điền giá trị mẫu. */
export default function MapSlideUpSheet({
  placeName,
  address,
  regionName,
  categoryLabel,
  latitude,
  longitude,
  altitudeMeters,
  accessNote,
  verificationBadge,
  onBackToDetail
}: MapSlideUpSheetProps) {
  const [copied, setCopied] = useState(false);

  const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  const handleCopyCoordinates = () => {
    navigator.clipboard?.writeText(coordString)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => { /* Trình duyệt chặn clipboard: bỏ qua. */ });
  };

  const handleOpenExternalNavigation = () => {
    // Open Google Maps Universal Navigation URL
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-t-3xl bg-white shadow-2xl border-t border-slate-200/80 px-4 pt-3 pb-6 space-y-4 max-w-xl mx-auto">
      {/* Drag Handle */}
      <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto" />

      {/* Khu vực & cao độ (nếu có) */}
      {(regionName || altitudeMeters) && (
        <div className="flex items-center gap-1.5 text-xs text-amber-900 font-semibold">
          {regionName && <span>⛰️ {regionName}</span>}
          {regionName && altitudeMeters ? <span>•</span> : null}
          {altitudeMeters ? <span>Cao độ {altitudeMeters}m</span> : null}
        </div>
      )}

      {/* Tags & Action header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {categoryLabel && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 flex items-center gap-1">
              <span>🏠</span> {categoryLabel}
            </span>
          )}

          {verificationBadge && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              {verificationBadge}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyCoordinates}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
          title="Sao chép tọa độ GPS"
          aria-label="Sao chép tọa độ GPS"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Place Title */}
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
        {placeName}
      </h2>

      {/* Address & Coordinates Card */}
      <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-100 space-y-1.5 text-xs sm:text-sm text-slate-700">
        {address && (
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span className="font-medium text-slate-800">{address}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500 pl-0.5">
          <Compass className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{coordString}</span>
        </div>
      </div>

      {/* Road Access Warning / Info */}
      {accessNote && (
        <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>{accessNote}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={handleOpenExternalNavigation}
          className="w-full py-3.5 px-4 rounded-xl bg-[#0F3E2E] hover:bg-[#16503c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-[0.99]"
        >
          <Compass className="w-4 h-4" />
          Mở điều hướng ngoài
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </button>

        {onBackToDetail && (
          <button
            type="button"
            onClick={onBackToDetail}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại chi tiết địa điểm
          </button>
        )}
      </div>

      {/* Disclaimer Caption */}
      <p className="text-[11px] text-center text-slate-400">
        Điều hướng sẽ mở trên Google Maps hoặc Apple Maps cài trên thiết bị.
      </p>
    </div>
  );
}
