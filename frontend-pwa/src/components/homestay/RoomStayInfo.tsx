import { useState, type ReactNode } from 'react';
import {
  Wifi, Car, Wind, Utensils, Coffee, Bath, Shirt, Tv, ShieldCheck, Sparkles, BedDouble, Home,
  LogIn, LogOut, CalendarX2, IdCard, Baby, Dog, Receipt, ChevronDown,
} from 'lucide-react';
import type { HomestayDetailDto, RoomTypeDto } from '@/types/homestay';

/** Icon theo tên tiện nghi (dữ liệu nhập tay, không có mã cố định). */
function amenityIcon(name: string) {
  const n = name.toLowerCase();
  const cls = 'h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]';
  if (n.includes('wifi') || n.includes('mạng')) return <Wifi className={cls} />;
  if (n.includes('đỗ') || n.includes('xe') || n.includes('parking')) return <Car className={cls} />;
  if (n.includes('điều hòa') || n.includes('máy lạnh')) return <Wind className={cls} />;
  if (n.includes('nhà hàng') || n.includes('ăn') || n.includes('bếp') || n.includes('kitchen')) return <Utensils className={cls} />;
  if (n.includes('cà phê') || n.includes('coffee') || n.includes('trà')) return <Coffee className={cls} />;
  if (n.includes('nóng') || n.includes('bình') || n.includes('tắm') || n.includes('shower')) return <Bath className={cls} />;
  if (n.includes('giặt')) return <Shirt className={cls} />;
  if (n.includes('tivi') || n.includes('tv')) return <Tv className={cls} />;
  if (n.includes('an ninh') || n.includes('bảo vệ')) return <ShieldCheck className={cls} />;
  return <Sparkles className={cls} />;
}

const QUICK_AMENITIES = 3;

/**
 * Tóm tắt gọn đặt cạnh ảnh/giá/tên loại phòng: vài tiện nghi nổi bật + giờ nhận/trả phòng — hiện luôn, không phải bấm
 * "Xem lịch phòng & đặt" mới thấy. Danh sách tiện nghi đầy đủ + chính sách xem ở RoomStayInfo (chỉ xổ ra khi bấm CTA).
 */
export function RoomQuickFacts({ room, homestay, showStayTimes = true }: { room: RoomTypeDto; homestay: HomestayDetailDto; showStayTimes?: boolean }) {
  const profile = homestay.homestayProfile;
  const amenities = [...(room.amenities ?? []), ...(homestay.amenities ?? [])];
  const shown = amenities.slice(0, QUICK_AMENITIES);
  const extra = amenities.length - shown.length;
  const hasStay = showStayTimes && !!(profile?.checkInFrom || profile?.checkOutUntil);
  const chip = 'inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs';
  if (shown.length === 0 && !hasStay) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {hasStay && (
        <span className={chip}>
          <LogIn className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />{profile?.checkInFrom ? `Nhận ${profile.checkInFrom}` : 'Nhận phòng'}
          <span className="text-slate-300" aria-hidden>·</span>
          <LogOut className="h-3.5 w-3.5 shrink-0 text-[var(--color-coral)]" />{profile?.checkOutUntil ? `Trả ${profile.checkOutUntil}` : 'Trả phòng'}
        </span>
      )}
      {shown.map((name) => <span key={name} className={chip}>{amenityIcon(name)}{name}</span>)}
      {extra > 0 && <span className={chip}>+{extra} tiện nghi</span>}
    </div>
  );
}

const COLLAPSED_AMENITIES = 8;

function AmenityGroup({ icon, title, names, other }: { icon: ReactNode; title: string; names: string[]; other?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (names.length === 0 && !other) return null;
  const shown = expanded ? names : names.slice(0, COLLAPSED_AMENITIES);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">{icon}{title}</p>
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((name) => (
            <li key={name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
              {amenityIcon(name)}{name}
            </li>
          ))}
          {names.length > COLLAPSED_AMENITIES && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-bold text-[var(--color-primary)] hover:border-[var(--color-primary)] cursor-pointer"
              >
                {expanded ? 'Thu gọn' : `+${names.length - COLLAPSED_AMENITIES} tiện nghi`}
              </button>
            </li>
          )}
        </ul>
      )}
      {other && <p className="mt-1.5 whitespace-pre-line text-xs text-slate-600"><strong className="font-semibold text-slate-700">Khác: </strong>{other}</p>}
    </div>
  );
}

/** Một dòng chính sách: văn bản dài thu gọn 3 dòng, bấm "Xem thêm" để mở. */
function PolicyRow({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180 || text.split('\n').length > 3;
  return (
    <li className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-50)] text-[var(--color-primary)]">{icon}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-700">
        <p className="font-bold text-slate-800">{label}</p>
        <p className={`whitespace-pre-line ${!open && long ? 'line-clamp-3' : ''}`}>{text}</p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
            aria-expanded={open}
          >
            {open ? 'Thu gọn' : 'Xem thêm'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </li>
  );
}

interface PolicyItem {
  key: string;
  icon: ReactNode;
  label: string;
  text?: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 border-t border-slate-100 py-4 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-5">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)] md:pt-0.5">{title}</h4>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * Chi tiết đầy đủ tiện nghi + chính sách của loại phòng — chỉ xổ ra khi khách bấm "Xem lịch phòng & đặt" (giờ nhận / trả
 * phòng đã có ở dòng tóm tắt RoomQuickFacts nên không lặp lại ở đây). Chỉ hiện mục chỗ nghỉ đã công bố.
 */
export default function RoomStayInfo({ room, homestay }: { room: RoomTypeDto; homestay: HomestayDetailDto }) {
  const profile = homestay.homestayProfile;
  const amenityNotes = (homestay.amenityItems ?? []).filter((item) => item.note || item.value !== 'YES');
  const policyRows: PolicyItem[] = [
    { key: 'cancel', icon: <CalendarX2 className="h-3.5 w-3.5" />, label: profile?.currentPolicy?.name ? `Hủy phòng · ${profile.currentPolicy.name}` : 'Hủy phòng', text: profile?.currentPolicy?.description },
    { key: 'rules', icon: <IdCard className="h-3.5 w-3.5" />, label: 'Nội quy lưu trú', text: profile?.houseRules },
    { key: 'children', icon: <Baby className="h-3.5 w-3.5" />, label: 'Trẻ em', text: profile?.childrenPolicy },
    { key: 'pets', icon: <Dog className="h-3.5 w-3.5" />, label: 'Thú cưng', text: profile?.petsPolicy },
    { key: 'surcharge', icon: <Receipt className="h-3.5 w-3.5" />, label: 'Phụ thu', text: profile?.surchargeNote },
  ];
  const policies = policyRows.filter((row): row is PolicyItem & { text: string } => !!row.text && row.text.trim().length > 0);
  const hasAmenities = (room.amenities?.length ?? 0) > 0 || !!room.otherAmenities
    || (homestay.amenities?.length ?? 0) > 0 || !!profile?.otherAmenities || amenityNotes.length > 0;

  return (
    <div className="mt-4 rounded-xl bg-white/90 p-4 md:p-5 shadow-2xs">
      <Section title="Tiện nghi">
        {hasAmenities ? (
          <div className="space-y-3.5">
            <AmenityGroup
              icon={<BedDouble className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
              title="Trong phòng"
              names={room.amenities ?? []}
              other={room.otherAmenities}
            />
            <AmenityGroup
              icon={<Home className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
              title="Chung của chỗ nghỉ"
              names={homestay.amenities ?? []}
              other={profile?.otherAmenities}
            />
            {amenityNotes.length > 0 && (
              <ul className="space-y-0.5 text-xs text-slate-600">
                {amenityNotes.map((item) => (
                  <li key={item.id}><strong className="font-semibold text-slate-700">{item.name}:</strong> {item.note || item.value}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Chỗ nghỉ đang cập nhật tiện nghi.</p>
        )}
      </Section>

      <Section title="Chính sách">
        {policies.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {policies.map((row) => <PolicyRow key={row.key} icon={row.icon} label={row.label} text={row.text} />)}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Chỗ nghỉ chưa công bố chính sách riêng — vui lòng hỏi chủ nhà trước khi đặt.</p>
        )}
      </Section>
    </div>
  );
}
