import { useState, type ReactNode } from 'react';
import { BedDouble, Check, ImageOff, Sparkles, ScrollText } from 'lucide-react';
import ImageLightbox from '@/components/common/ImageLightbox';
import type { PlaceShowcase, PlaceShowcaseRoom, PlaceStayPolicy } from '@/types/admin';
import { StatusBadge } from './StatusBadge';
import { fmtDate, vnd } from './bookingMeta';

interface PlaceShowcaseSectionsProps {
  /** null trong lúc đang tải. */
  showcase: PlaceShowcase | null;
  error?: string;
  /** Tên dùng cho alt / tiêu đề lightbox. */
  name: string;
  /** Có hiện khối "Chính sách lưu trú" không (chỉ Homestay mới có). */
  showStayPolicy: boolean;
  /** Ghi chú nguồn dữ liệu hiển thị trên các khối (vd "Theo Homestay: ..."). */
  note?: ReactNode;
}

const MAX_THUMBS = 9;

/**
 * Hình ảnh (lưới ảnh thu nhỏ, bấm để xem lớn), tiện nghi và chính sách lưu trú ở màn chi tiết phía Admin
 * (Duyệt điểm đến, Hồ sơ nhà cung cấp). Mỗi khối có trạng thái trống riêng.
 */
export default function PlaceShowcaseSections({ showcase, error, name, showStayPolicy, note }: PlaceShowcaseSectionsProps) {
  const [viewing, setViewing] = useState<number | null>(null);

  if (error) {
    return <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] text-danger">{error}</p>;
  }
  if (!showcase) {
    return (
      <div className="mt-4 flex flex-col gap-2" aria-busy="true">
        <div className="h-3 w-20 animate-pulse rounded-sm bg-canvas" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-md bg-canvas" />)}
        </div>
      </div>
    );
  }

  const images = showcase.images;
  const urls = images.map((i) => i.url);
  const extra = images.length - MAX_THUMBS;

  return (
    <>
      {note && <p className="mt-4 rounded-md bg-canvas px-3 py-2 text-[11px] text-muted">{note}</p>}

      <Section title={`Hình ảnh${images.length ? ` (${images.length})` : ''}`}>
        {images.length === 0 ? (
          <Empty icon={<ImageOff className="h-5 w-5" />} text="Chưa có hình ảnh" />
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {images.slice(0, MAX_THUMBS).map((img, i) => {
              const last = i === MAX_THUMBS - 1 && extra > 0;
              return (
                <li key={`${img.url}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setViewing(i)}
                    aria-label={`Xem ảnh ${i + 1} của ${images.length}${img.caption ? `: ${img.caption}` : ''}`}
                    className="group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <img src={img.url} alt={img.caption ?? `${name} ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300" />
                    {img.cover && (
                      <span className="absolute left-1 top-1 rounded-sm bg-ink-deep/70 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">Ảnh bìa</span>
                    )}
                    {last && (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink-deep/55 text-sm font-bold text-white">+{extra + 1}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Tiện nghi">
        {showcase.amenities.length === 0 ? (
          <Empty icon={<Sparkles className="h-5 w-5" />} text="Chưa có tiện nghi" />
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {showcase.amenities.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-md border border-border bg-canvas/60 px-2 py-1 text-[11px] text-ink">
                <Check className="h-3 w-3 text-accent" aria-hidden /> {a}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {showStayPolicy && (
        <Section title={`Loại phòng${showcase.rooms.length ? ` (${showcase.rooms.length})` : ''}`}>
          {showcase.rooms.length === 0 ? (
            <Empty icon={<BedDouble className="h-5 w-5" />} text="Chưa có loại phòng" />
          ) : (
            <div className="flex flex-col gap-2.5">
              {showcase.rooms.map((room) => <RoomCard key={room.id} room={room} />)}
            </div>
          )}
        </Section>
      )}

      {showStayPolicy && (
        <Section title="Chính sách lưu trú">
          {hasPolicy(showcase.stayPolicy) ? (
            <StayPolicy policy={showcase.stayPolicy} />
          ) : (
            <Empty icon={<ScrollText className="h-5 w-5" />} text="Chưa có chính sách lưu trú" />
          )}
        </Section>
      )}

      {viewing !== null && (
        <ImageLightbox
          images={urls}
          captions={images.map((i) => i.caption)}
          index={viewing}
          alt={name}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

const BATHROOM_LABEL: Record<'YES' | 'NO' | 'UNVERIFIED', string> = {
  YES: 'Có phòng tắm riêng',
  NO: 'Dùng chung',
  UNVERIFIED: 'Chưa xác định',
};

/** Một loại phòng với đủ các trường NCC khai ở Cổng NCC → Loại phòng (cùng nhãn với form NCC). */
function RoomCard({ room: r }: { room: PlaceShowcaseRoom }) {
  const selling = r.status === 'ACTIVE';
  return (
    <article className="rounded-md border border-border">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-canvas/60 px-3 py-2">
        <h5 className="min-w-0 truncate text-xs font-bold text-ink-deep" title={r.name}>{r.name}</h5>
        <StatusBadge tone={selling ? 'success' : 'neutral'}>{selling ? 'Mở bán' : 'Ngừng bán'}</StatusBadge>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-3 py-2.5 text-xs">
        <PolicyItem label="Tổng số phòng">{String(r.totalRoomCount)}</PolicyItem>
        <PolicyItem label="Khách tối đa mỗi phòng">{String(r.maxOccupancy)}</PolicyItem>
        <PolicyItem label="Diện tích">{r.areaSqm != null ? `${r.areaSqm} m²` : ''}</PolicyItem>
        <PolicyItem label="Phòng tắm riêng">{r.privateBathroom ? BATHROOM_LABEL[r.privateBathroom] : ''}</PolicyItem>
        <PolicyItem label="Giá ngày thường / phòng / đêm">{r.basePrice != null ? vnd(r.basePrice) : ''}</PolicyItem>
        <PolicyItem label="Giá cuối tuần (T7, CN)">{r.weekendPrice != null ? vnd(r.weekendPrice) : 'Bằng giá ngày thường'}</PolicyItem>
        <PolicyItem label="Giường ngủ" wide>{r.beds.join(', ')}</PolicyItem>
        <PolicyItem label="Vị trí / hướng nhìn" wide>{r.viewDescription}</PolicyItem>
        <PolicyItem label="Tiện nghi phòng" wide>
          {r.amenities.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {r.amenities.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-sm bg-canvas px-1.5 py-0.5 text-[11px]">
                  <Check className="h-3 w-3 text-accent" aria-hidden /> {a}
                </span>
              ))}
            </span>
          )}
        </PolicyItem>
        <PolicyItem label="Mô tả" wide>{r.description}</PolicyItem>
        <PolicyItem label="Giá theo mùa" wide>
          {r.seasonalPrices.length > 0 && (
            <ul className="flex flex-col gap-1">
              {r.seasonalPrices.map((p) => (
                <li key={`${p.name}-${p.periodStart}`} className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>
                    <span className="font-semibold text-ink-deep">{p.name}</span>{' '}
                    <span className="text-muted">{fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-ink-deep">{vnd(p.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </PolicyItem>
      </dl>
    </article>
  );
}

function hasPolicy(p: PlaceStayPolicy | null): p is PlaceStayPolicy {
  if (!p) return false;
  return [p.checkInFrom, p.checkOutUntil, p.houseRules, p.surchargeNote, p.childrenPolicy, p.petsPolicy, p.cancellationPolicy].some(
    (v) => v.trim().length > 0,
  );
}

/** "14:00:00" → "14:00". */
const hhmm = (t: string) => (t ? t.slice(0, 5) : '');

function StayPolicy({ policy: p }: { policy: PlaceStayPolicy }) {
  const cancellation = p.cancellationPolicy
    ? [
        p.freeCancelCutoffHours != null ? `Hủy miễn phí trước ${p.freeCancelCutoffHours} giờ` : '',
        p.refundOnLateCancel === 'FULL_REFUND' ? 'hủy muộn vẫn hoàn toàn bộ' : p.refundOnLateCancel === 'NO_REFUND' ? 'hủy muộn không hoàn tiền' : '',
      ].filter(Boolean).join(', ')
    : '';
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      <PolicyItem label="Nhận phòng">{hhmm(p.checkInFrom) ? `Từ ${hhmm(p.checkInFrom)}` : ''}</PolicyItem>
      <PolicyItem label="Trả phòng">{hhmm(p.checkOutUntil) ? `Trước ${hhmm(p.checkOutUntil)}` : ''}</PolicyItem>
      <PolicyItem label="Nội quy" wide>{p.houseRules}</PolicyItem>
      <PolicyItem label="Trẻ em" wide>{p.childrenPolicy}</PolicyItem>
      <PolicyItem label="Thú cưng" wide>{p.petsPolicy}</PolicyItem>
      <PolicyItem label="Phụ thu" wide>{p.surchargeNote}</PolicyItem>
      <PolicyItem label={p.cancellationPolicyName ? `Chính sách hủy · ${p.cancellationPolicyName}` : 'Chính sách hủy'} wide>
        {p.cancellationPolicy && (
          <>
            {cancellation && <span className="mb-0.5 block font-semibold text-ink-deep">{cancellation}</span>}
            {p.cancellationPolicy}
          </>
        )}
      </PolicyItem>
    </dl>
  );
}

function PolicyItem({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-ink">{children || <span className="text-muted">Chưa khai</span>}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-canvas/50 px-3 py-5 text-center text-[11px] text-muted">
      <span className="text-muted/70">{icon}</span>
      {text}
    </div>
  );
}
