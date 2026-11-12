import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FilePenLine, Images, MapPin, Star, UserCog, X } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { useAdminPermission } from '@/hooks/useAdminPermission';
import { getApiErrorMessage } from '@/lib/apiError';
import type { AdminPlaceDetailDto, AdminPlaceSummaryDto, PlaceShowcase } from '@/types/admin';
import { StatusBadge } from './StatusBadge';
import { DATA_VERIFIED_LABEL, DATA_VERIFIED_TONE, kindMeta, VERIFICATION_LABEL, VERIFICATION_TONE, VISIBILITY_LABEL, VISIBILITY_TONE } from './placeMeta';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import OverlayPortal from './OverlayPortal';
import PlaceShowcaseSections from './PlaceShowcaseSections';

interface PlaceQuickPreviewProps {
  /** Dữ liệu dòng đã có sẵn trong bảng — hiển thị ngay trong lúc tải chi tiết. */
  place: AdminPlaceSummaryDto;
  onClose: () => void;
  onApprove: () => void;
  onRequestUpdate: () => void;
  onToggleVisibility: () => void;
  /** Bật / tắt cờ "dữ liệu đã xác thực" của địa điểm. */
  onToggleDataVerified: (next: boolean) => void;
  savingDataVerified?: boolean;
  /** Admin tự thêm ảnh vào điểm đến — mở panel quản lý media. */
  onAddMedia?: () => void;
}

const vnd = (n?: number | null) => (n == null ? null : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
const CONTACT_LABEL: Partial<Record<string, string>> = {
  PHONE: 'Điện thoại', EMAIL: 'Email', FACEBOOK: 'Facebook', TIKTOK: 'TikTok', ZALO: 'Zalo', WEBSITE: 'Website', YOUTUBE: 'YouTube',
};
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

/** Ngăn xem nhanh bên phải: Admin đọc chi tiết điểm đến và Duyệt / Yêu cầu bổ sung ngay. */
export default function PlaceQuickPreview({ place, onClose, onApprove, onRequestUpdate, onToggleVisibility, onToggleDataVerified, savingDataVerified = false, onAddMedia }: PlaceQuickPreviewProps) {
  // Admin cấp 3 chỉ xem: không hiện nút duyệt / yêu cầu bổ sung / ẩn.
  const canOperate = useAdminPermission().can('operate');
  const [detail, setDetail] = useState<AdminPlaceDetailDto | null>(null);
  const [error, setError] = useState('');
  const [showcase, setShowcase] = useState<PlaceShowcase | null>(null);
  const [showcaseError, setShowcaseError] = useState('');
  const [requestExpanded, setRequestExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    adminService
      .getPlaceById(place.id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((err: unknown) => {
        if (alive) setError(getApiErrorMessage(err, 'Không tải được chi tiết điểm đến.'));
      });
    // Hình ảnh / tiện nghi / chính sách tải song song, lỗi riêng không chặn phần thông tin chính.
    adminService
      .getPlaceShowcase(place.id)
      .then((s) => {
        if (alive) setShowcase(s);
      })
      .catch((err: unknown) => {
        if (alive) setShowcaseError(getApiErrorMessage(err, 'Không tải được hình ảnh, tiện nghi của điểm đến.'));
      });
    return () => {
      alive = false;
    };
  }, [place.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = detail ?? place;
  const kind = kindMeta(p.kind);
  const KindIcon = kind.icon;
  const price =
    p.priceRefMin != null || p.priceRefMax != null
      ? [vnd(p.priceRefMin), vnd(p.priceRefMax)].filter(Boolean).join(' – ') + (detail?.priceUnitNote ? ` · ${detail.priceUnitNote}` : '')
      : null;
  const googleMapsUrl = detail?.contacts?.find((c) => c.channel === 'GOOGLE_MAPS')?.value;
  const otherContacts = detail?.contacts?.filter((c) => c.channel !== 'GOOGLE_MAPS') ?? [];
  const pros = detail?.highlights?.filter((h) => h.type === 'PRO') ?? [];
  const cons = detail?.highlights?.filter((h) => h.type === 'CON') ?? [];
  const attributes = detail?.attributes ? Object.entries(detail.attributes).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object') : [];

  return (
    <OverlayPortal>
    <div className="admin-overlay-shell z-[9998] flex justify-end bg-ink-deep/40 backdrop-blur-[2px] fade-in-overlay" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Xem nhanh ${p.name}`}
        onClick={(e) => e.stopPropagation()}
        className="admin-drawer flex h-full min-h-0 w-full min-w-0 max-w-md flex-col bg-white shadow-xl panel-slide-in"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${kind.tone}`}>
            <KindIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-display text-base font-bold leading-snug text-ink-deep">{p.name}</h3>
            <p className="truncate font-mono text-[11px] text-muted">#{p.id} · {p.slug}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge tone={VERIFICATION_TONE[p.verification]} pulse={p.verification === 'UNVERIFIED'}>
                {VERIFICATION_LABEL[p.verification]}
              </StatusBadge>
              <StatusBadge tone={VISIBILITY_TONE[p.visibility]}>{VISIBILITY_LABEL[p.visibility]}</StatusBadge>
              <StatusBadge tone={DATA_VERIFIED_TONE[place.dataVerified ? 'true' : 'false']}>{DATA_VERIFIED_LABEL[place.dataVerified ? 'true' : 'false']}</StatusBadge>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${kind.tone}`}>{kind.label}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain break-words px-4 py-4 sm:px-5">
          {error && (
            <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 p-2.5 text-xs text-danger">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-canvas/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Xác thực dữ liệu</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink">
                {place.dataVerified
                  ? 'Thông tin đã được đối chiếu và xác thực (dữ liệu chính thống).'
                  : 'Dữ liệu mới nhập, chưa đối chiếu thực tế. Bật sau khi kiểm tra tên, giá, liên hệ, vị trí và hình ảnh.'}
              </p>
            </div>
            {canOperate && (
              <ToggleSwitch
                checked={place.dataVerified}
                onChange={onToggleDataVerified}
                label={`Xác thực dữ liệu ${p.name}`}
                showState={false}
                disabled={savingDataVerified}
              />
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Field label="Nhà cung cấp">{p.providerName || 'Hệ thống du lịch'}</Field>
            <Field label="Khu vực">{p.regionName || '—'}</Field>
            <Field label="Danh mục">{p.categoryName || kind.label}</Field>
            <Field label="Đánh giá">
              {p.ratingAvg != null && (p.ratingCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-sun text-sun" /> {Number(p.ratingAvg).toFixed(1)}
                  <span className="text-muted">({p.ratingCount})</span>
                </span>
              ) : (
                'Chưa có'
              )}
            </Field>
            <Field label="Điểm Google">
              {detail?.googleRating != null ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-sun text-sun" /> {Number(detail.googleRating).toFixed(1)}/5
                </span>
              ) : (
                'Chưa có'
              )}
            </Field>
            <Field label="Giá tham khảo">{price || '—'}</Field>
            <Field label="Địa chỉ" wide>
              <span className="inline-flex items-start gap-1">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> {p.address || '—'}
              </span>
            </Field>
            <Field label="Google Maps" wide>
              {googleMapsUrl ? (
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Mở liên kết Google Maps
                </a>
              ) : (
                'Chưa có'
              )}
            </Field>
            <Field label="Ngày tạo">{fmtDate(p.createdAt)}</Field>
            <Field label="Kiểm duyệt gần nhất">{fmtDate(p.lastVerifiedAt)}</Field>
          </dl>

          {!detail && !error && (
            <div className="mt-4 flex flex-col gap-2" aria-busy="true">
              <div className="h-3 w-24 animate-pulse rounded-sm bg-canvas" />
              <div className="h-16 animate-pulse rounded-md bg-canvas" />
            </div>
          )}

          {detail?.description && (
            <Block title="Mô tả">
              <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink">{detail.description}</p>
            </Block>
          )}
          {detail?.accessNote && (
            <Block title="Hướng dẫn đường đi">
              <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink">{detail.accessNote}</p>
            </Block>
          )}
          {(pros.length > 0 || cons.length > 0) && (
            <Block title="Ưu điểm / Hạn chế">
              <ul className="space-y-1 text-xs leading-relaxed text-ink">
                {pros.map((h) => (
                  <li key={h.id} className="flex gap-1.5"><span className="font-semibold text-accent-600">+</span>{h.content}</li>
                ))}
                {cons.map((h) => (
                  <li key={h.id} className="flex gap-1.5"><span className="font-semibold text-amber-700">−</span>{h.content}</li>
                ))}
              </ul>
            </Block>
          )}
          {otherContacts.length > 0 && (
            <Block title="Liên hệ">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                {otherContacts.map((c) => (
                  <div key={c.id} className="contents">
                    <dt className="text-muted">{CONTACT_LABEL[c.channel] ?? c.channel}</dt>
                    <dd className="break-all text-ink">
                      {/^https?:\/\//i.test(c.value) ? (
                        <a href={c.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{c.value}</a>
                      ) : (
                        c.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}
          {attributes.length > 0 && (
            <Block title="Thuộc tính">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {attributes.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="min-w-0 break-words text-muted">{k}</dt>
                    <dd className="min-w-0 break-words text-ink">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}
          <PlaceShowcaseSections showcase={showcase} error={showcaseError} name={p.name} showStayPolicy={p.kind === 'HOMESTAY'} />
          {detail && !detail.description && !detail.accessNote && (
            <p className="mt-4 rounded-md bg-sun/10 px-3 py-2 text-[11px] text-amber-700">
              Điểm đến chưa có mô tả — cân nhắc yêu cầu NCC bổ sung trước khi duyệt.
            </p>
          )}
        </div>

        {canOperate && (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-canvas/60 px-4 py-3 sm:px-5">
          {p.verification !== 'VERIFIED' && (
            <button
              type="button"
              onClick={onApprove}
              className="flex min-h-11 min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-accent-600 sm:min-h-9 sm:text-xs"
            >
              <CheckCircle2 className="h-4 w-4" /> Duyệt
            </button>
          )}
          {p.verification !== 'NEEDS_UPDATE' && !requestExpanded && (
            <button
              type="button"
              onClick={() => setRequestExpanded(true)}
              className="flex min-h-11 min-w-[10rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-sun/60 bg-white px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-sun/10 sm:min-h-9 sm:text-xs"
            >
              <FilePenLine className="h-4 w-4" /> Yêu cầu bổ sung
            </button>
          )}
          {requestExpanded && (
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted">Chọn cách bổ sung</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setRequestExpanded(false); onRequestUpdate(); }}
                  className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md border border-sun/60 bg-white px-2 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-sun/10"
                >
                  <UserCog className="h-3.5 w-3.5" /> Yêu cầu nhà CC
                </button>
                {onAddMedia && (
                  <button
                    type="button"
                    onClick={() => { setRequestExpanded(false); onAddMedia(); }}
                    className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md border border-primary/40 bg-white px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-50"
                  >
                    <Images className="h-3.5 w-3.5" /> Admin thêm ảnh
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRequestExpanded(false)}
                  aria-label="Đóng"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleVisibility}
            title={p.visibility === 'PUBLISHED' ? 'Ẩn điểm đến' : 'Công khai điểm đến'}
            className="flex min-h-11 min-w-[5rem] flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary sm:min-h-9 sm:flex-none sm:text-xs"
          >
            {p.visibility === 'PUBLISHED' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {p.visibility === 'PUBLISHED' ? 'Ẩn' : 'Công khai'}
          </button>
        </footer>
        )}
      </aside>
    </div>
    </OverlayPortal>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}
