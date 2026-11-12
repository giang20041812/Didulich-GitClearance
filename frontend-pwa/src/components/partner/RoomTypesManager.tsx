import { useEffect, useState, type ReactNode } from 'react';
import { peekPartnerStale, primePartner } from '@/lib/partnerCache';
import * as Dialog from '@radix-ui/react-dialog';
import { BedDouble, Loader2, Lock, Plus, Search, Trash2, Unlock, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PartnerRoom, PartnerRoomInput, RoomQuote, UpcomingStay } from '@/types/room';
import { dayMonth } from '@/lib/partnerDates';
import type { HomestayOptionsDto, PhotoRef } from '@/types/partner';
import { partnerRoomService as api } from '@/services/partnerRoomService';
import { partnerMediaService } from '@/services/partnerMediaService';
import { homestayError } from '@/services/partnerHomestayService';
import { isSubmittedChange } from '@/services/changeRequestService';
import MediaManager from '@/components/partner/MediaManager';
import MoneyInput from '@/components/partner/MoneyInput';
import PhotoPicker from '@/components/partner/PhotoPicker';
import { usePhotoCleanup, type LocalPhoto } from '@/lib/localPhotos';
import { BLANK_ROOM, ROOM_NAME_PRESETS, hasRoomErrors, roomErrors } from '@/lib/roomForm';
import { Alert, EmptyState, Field, LoadingBlock, PendingTag } from '@/components/partner/PartnerUI';
import { usePendingChanges } from '@/hooks/usePendingChanges';
import { pendingWhat, type PendingIndex } from '@/lib/pendingChanges';
import { ui, vnd } from '@/lib/partnerUi';

const localDate = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Phòng chưa có giá -> 0 để ô giá hiển thị trống và bắt buộc nhập (MoneyInput chỉ nhận giá > 0).
const toInput = (room: PartnerRoom): PartnerRoomInput => ({ ...room, basePrice: room.basePrice ?? 0, description: room.description ?? '', viewDescription: room.viewDescription ?? '', otherAmenities: room.otherAmenities ?? '' });

/** Ô số nguyên xóa được hết (ô trống = 0, không tự hiện lại số 0 khi đang gõ). */
export function CountInput({ value, onChange, max, ariaLabel, invalid }: { value: number; onChange: (v: number) => void; max: number; ariaLabel?: string; invalid?: boolean }) {
  return (
    <input className={`${ui.input} ${invalid ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`} type="text" inputMode="numeric" aria-label={ariaLabel} aria-invalid={invalid}
      value={value ? String(value) : ''} onChange={e => { const digits = e.target.value.replace(/\D/g, '').slice(0, String(max).length); onChange(digits ? Number(digits) : 0); }} />
  );
}

/** Dòng báo lỗi ngay dưới ô nhập (chỉ hiện khi ô đã được đụng tới hoặc đã bấm Lưu). */
export function FieldError({ show, error }: { show: boolean; error?: string | null }) {
  if (!show || !error) return null;
  return <span role="alert" className="text-[11px] font-semibold text-danger">{error}</span>;
}

/**
 * Danh sách loại phòng của một Homestay + ngăn kéo tạo / sửa. Dùng ở trang "Loại phòng & giá" và ngay trong trang
 * Homestay (tab Phòng) để chủ nhà không phải chuyển qua lại giữa hai trang.
 */
export default function RoomTypesManager({ placeId, showAvailability = false, onChanged, header }: {
  placeId: number; showAvailability?: boolean; onChanged?: () => void; header?: (openNew: () => void) => ReactNode;
}) {
  // Mở lại trang: hiện ngay danh sách loại phòng lần trước trong tab, rồi làm mới ngầm.
  const [rooms, setRooms] = useState<PartnerRoom[]>(() => peekPartnerStale<PartnerRoom[]>(`rooms:${placeId}`) ?? []);
  const [options, setOptions] = useState<HomestayOptionsDto['amenities']>([]);
  const [loading, setLoading] = useState(() => !peekPartnerStale(`rooms:${placeId}`));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ id: number | null; form: PartnerRoomInput } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => peekPartnerStale<PartnerRoom[]>(`rooms:${placeId}`)?.[0]?.id ?? null);
  const [reload, setReload] = useState(0);
  const [pendingKey, setPendingKey] = useState(0);
  const [toggling, setToggling] = useState<number | null>(null);
  const [confirmLock, setConfirmLock] = useState<{ room: PartnerRoom; stays: UpcomingStay[]; answer: (ok: boolean) => void } | null>(null);
  const pending = usePendingChanges(`${reload}|${pendingKey}`);
  const newRooms = pending.newRooms(placeId);

  useEffect(() => {
    let active = true;
    // Danh sách loại phòng hiện ngay; danh mục tiện ích chỉ dùng trong form sửa nên tải sau, ưu tiên thấp (cache của
    // tab từ lần thứ hai). Tuần tự, không gửi song song tới backend.
    api.list(placeId)
      .then((r) => {
        if (!active) return;
        setRooms(r); setError(''); primePartner(`rooms:${placeId}`, r);
        setSelectedId(prev => prev != null && r.some(x => x.id === prev) ? prev : r[0]?.id ?? null);
        void api.options(placeId, 'low').then((o) => { if (active) setOptions(o); }, () => undefined);
      })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [placeId, reload]);

  const openNew = () => { setNotice(''); setEditor({ id: null, form: { ...BLANK_ROOM } }); };
  const openEdit = (room: PartnerRoom) => { setNotice(''); setSelectedId(room.id); setEditor({ id: room.id, form: toInput(room) }); };

  /**
   * Khóa / mở loại phòng ngay một chạm (sửa loại phòng áp dụng trực tiếp, không cần Admin duyệt). Khóa loại phòng còn
   * đơn chưa trả phòng thì hỏi lại trước: khóa chỉ chặn đơn mới, chủ nhà vẫn phải đón các khách đó.
   */
  async function toggleStatus(room: PartnerRoom): Promise<PartnerRoom['status'] | null> {
    if (toggling != null) return null;
    const next = room.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setToggling(room.id); setNotice(''); setError('');
    try {
      const stays = next === 'INACTIVE' ? await api.upcomingStays(placeId, room.id) : [];
      if (stays.length > 0 && !(await new Promise<boolean>(answer => setConfirmLock({ room, stays, answer })))) return null;
      const saved = await api.save(placeId, room.id, { ...toInput(room), status: next });
      if (isSubmittedChange(saved)) { setNotice(saved.message); setPendingKey(n => n + 1); return null; }
      setRooms(list => { const updated = list.map(r => (r.id === room.id ? saved : r)); primePartner(`rooms:${placeId}`, updated); return updated; });
      setNotice(next === 'ACTIVE' ? `Đã mở “${room.name}” — khách đặt được loại phòng này.`
        : `Đã khóa “${room.name}” — khách không đặt mới được.${stays.length > 0 ? ` Vẫn còn ${stays.length} đơn chưa trả phòng, bạn vẫn đón các khách này.` : ' Đơn đã đặt giữ nguyên.'}`);
      onChanged?.();
      return next;
    } catch (e: unknown) { setError(homestayError(e)); return null; }
    finally { setToggling(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      {header?.(openNew)}
      {!loading && (rooms.length > 0 || newRooms.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{rooms.length + newRooms.length} loại phòng · bấm vào phòng để xem / sửa chi tiết, bấm trạng thái để khóa / mở</p>
          <button type="button" className={ui.btnCoral} onClick={openNew}><Plus className="h-4 w-4" />Thêm loại phòng</button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info" action={<button type="button" aria-label="Đóng thông báo" className={ui.iconBtn} onClick={() => setNotice('')}><X className="h-4 w-4" /></button>}>{notice}</Alert>}

      {loading ? <LoadingBlock label="Đang tải loại phòng..." rows={2} /> : rooms.length === 0 && newRooms.length === 0 ? (
        !error && <EmptyState icon={BedDouble} title="Chưa có loại phòng nào" description="Thêm loại phòng với số phòng, số khách và giá để khách có thể đặt."
          action={<button type="button" className={ui.btnCoral} onClick={openNew}><Plus className="h-4 w-4" />Thêm loại phòng</button>} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map(room => {
            const active = room.id === selectedId;
            const waiting = pending.ofRoom(room.id);
            return (
              <article key={room.id}
                className={`flex min-w-0 items-center gap-2 rounded-lg border-2 p-2 pl-1 transition-colors duration-200 ${active ? 'border-primary bg-primary-50 shadow-[var(--shadow-teal)]' : 'border-border bg-surface hover:border-primary/40'}`}>
                <button type="button" onClick={() => openEdit(room)} aria-label={`Xem chi tiết ${room.name}`}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 text-left">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`min-w-0 max-w-full truncate text-sm font-bold ${room.status === 'ACTIVE' ? 'text-ink-deep' : 'text-muted'}`}>{room.name}</span>
                    {waiting.length > 0 && <PendingTag count={waiting.length} detail={waiting.map(pendingWhat)} />}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {room.basePrice == null ? <span className="font-semibold text-danger">Chưa có giá</span>
                      : <><b className="text-sm font-extrabold text-primary">{vnd(room.basePrice)}</b>/đêm{room.weekendPrice ? ` · cuối tuần ${vnd(room.weekendPrice)}` : ''}</>}
                  </span>
                </button>
                <StatusToggle room={room} busy={toggling === room.id} disabled={toggling != null} onToggle={() => void toggleStatus(room)} />
              </article>
            );
          })}
          {newRooms.map(r => (
            <article key={`new-${r.id}`} title="Loại phòng mới — hiện cho khách và nhận đặt sau khi quản trị viên duyệt."
              className="flex min-h-[60px] min-w-0 items-center justify-between gap-2 rounded-lg border-2 border-dashed border-sun bg-sun-light/30 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-bold text-ink-deep">{r.targetName}</span>
              <PendingTag detail={[pendingWhat(r)]} />
            </article>
          ))}
        </div>
      )}

      <RoomEditor placeId={placeId} options={options} editor={editor} pending={pending} onClose={() => setEditor(null)}
        current={editor?.id != null ? rooms.find(r => r.id === editor.id) ?? null : null} toggling={toggling} onToggleStatus={toggleStatus} showAvailability={showAvailability}
        onSaved={(roomId, message) => {
          setEditor(null);
          if (message) setNotice(message);
          if (roomId != null) setSelectedId(roomId);
          setLoading(true); setReload(n => n + 1);
          onChanged?.();
        }} />
      <ConfirmLockDialog ask={confirmLock} onAnswer={(ok) => { confirmLock?.answer(ok); setConfirmLock(null); }} />
    </div>
  );
}

/** Hỏi lại trước khi khóa loại phòng còn đơn chưa trả phòng (nằm trên cả ngăn kéo sửa phòng). */
function ConfirmLockDialog({ ask, onAnswer }: { ask: { room: PartnerRoom; stays: UpcomingStay[] } | null; onAnswer: (ok: boolean) => void }) {
  const shown = ask?.stays.slice(0, 5) ?? [];
  const more = (ask?.stays.length ?? 0) - shown.length;
  return (
    <Dialog.Root open={ask !== null} onOpenChange={(open) => { if (!open) onAnswer(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10001] bg-ink-deep/40" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[10002] flex flex-col gap-4 rounded-t-lg bg-white px-5 pb-[max(20px,var(--safe-bottom))] pt-5 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:pb-5">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-lg font-bold text-ink-deep">Khóa “{ask?.room.name}”?</Dialog.Title>
            <p className="text-sm text-muted">
              Loại phòng này còn <b className="text-ink-deep">{ask?.stays.length} đơn</b> chưa trả phòng. Khóa chỉ chặn khách đặt mới —
              bạn <b className="text-ink-deep">vẫn phải đón các khách này</b>. Không phục vụ được thì vào đơn để liên hệ khách hoặc hủy đơn.
            </p>
          </div>
          <ul className="flex flex-col gap-1 rounded-md bg-canvas p-3 text-sm font-semibold text-ink-deep">
            {shown.map((s, i) => <li key={i}>{dayMonth(s.checkIn)} → {dayMonth(s.checkOut)} · {s.roomCount} phòng</li>)}
            {more > 0 && <li className="text-muted">và {more} đơn khác</li>}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/partner/bookings" className={ui.btnGhost} onClick={() => onAnswer(false)}>Xem đơn</Link>
            <div className="flex gap-2">
              <Dialog.Close type="button" className={ui.btnOutline}>Không khóa</Dialog.Close>
              <button type="button" className={ui.btnDanger} onClick={() => onAnswer(true)}><Lock className="h-4 w-4" />Vẫn khóa</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Trạng thái loại phòng kiêm nút khóa / mở: bấm là đổi ngay. */
function StatusToggle({ room, busy, disabled, onToggle, large = false }: { room: PartnerRoom; busy: boolean; disabled: boolean; onToggle: () => void; large?: boolean }) {
  const open = room.status === 'ACTIVE';
  const Icon = busy ? Loader2 : open ? Unlock : Lock;
  return (
    <button type="button" role="switch" aria-checked={open} disabled={disabled} onClick={onToggle}
      aria-label={open ? `${room.name} đang mở — bấm để khóa phòng` : `${room.name} đã khóa — bấm để mở phòng`}
      title={open ? 'Đang mở cho khách đặt — bấm để khóa' : 'Đã khóa, khách không đặt được — bấm để mở'}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md border font-bold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${large ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} ${open ? 'border-accent/40 bg-accent-50 text-accent-700 hover:bg-accent-50/60' : 'border-border bg-canvas text-muted hover:border-primary/40 hover:text-ink'}`}>
      <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${open ? 'bg-accent' : 'bg-muted/40'}`}>
        <span className={`absolute h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${open ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
      <Icon className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      {open ? 'Đang mở' : 'Đã khóa'}
    </button>
  );
}

/** Ngăn kéo bên phải: tạo / sửa loại phòng. Thay đổi có thể được gửi chờ Admin duyệt thay vì áp dụng ngay. */
function RoomEditor({ placeId, options, editor, pending, onClose, onSaved, current, toggling, onToggleStatus, showAvailability }: {
  pending: PendingIndex;
  placeId: number; options: HomestayOptionsDto['amenities']; editor: { id: number | null; form: PartnerRoomInput } | null;
  onClose: () => void; onSaved: (roomId: number | null, message?: string) => void;
  current: PartnerRoom | null; toggling: number | null; onToggleStatus: (room: PartnerRoom) => Promise<PartnerRoom['status'] | null>; showAvailability: boolean;
}) {
  const [form, setForm] = useState<PartnerRoomInput>(BLANK_ROOM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [progress, setProgress] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [openedFor, setOpenedFor] = useState<typeof editor>(null);
  usePhotoCleanup(photos);
  if (editor !== openedFor) { setOpenedFor(editor); if (editor) { setForm(editor.form); setError(''); setPhotos([]); setProgress(''); setTouched({}); setSubmitted(false); } }

  const set = <K extends keyof PartnerRoomInput>(k: K, v: PartnerRoomInput[K]) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const errors = roomErrors(form);
  const show = (key: keyof typeof errors) => submitted || !!touched[key];
  const invalid = (key: keyof typeof errors) => show(key) && !!errors[key];

  async function save() {
    setSubmitted(true);
    if (hasRoomErrors(form)) { setError('Vui lòng sửa các ô được đánh dấu đỏ.'); return; }
    setBusy(true); setError('');
    try {
      // UC-NCC-03: loại phòng mới — tải ảnh đã chọn lên kho trước rồi gửi kèm; backend gắn ngay (ảnh đầu tiên làm ảnh đại diện),
      // hoặc giữ trong yêu cầu chờ duyệt và gắn khi Admin duyệt nếu Homestay đang công khai.
      const refs: PhotoRef[] = [];
      const failed: string[] = [];
      if (editor?.id == null) {
        for (const [i, photo] of photos.entries()) {
          setProgress(`Đang tải ảnh ${i + 1}/${photos.length}...`);
          try { refs.push(await partnerMediaService.uploadToStorage(photo.file)); }
          catch { failed.push(photo.file.name); }
        }
        setProgress('');
      }
      const saved = await api.save(placeId, editor?.id ?? null, { ...form, otherAmenities: form.otherAmenities?.trim() ?? '', ...(refs.length ? { photos: refs } : {}) });
      const lost = failed.length ? ` Chưa tải được ${failed.length} ảnh — hãy thêm lại sau.` : '';
      if (isSubmittedChange(saved)) {
        // Homestay đang công khai: loại phòng mới chờ Admin duyệt; ảnh được gắn vào phòng khi duyệt.
        onSaved(editor?.id ?? null, `${saved.message}${refs.length ? ' Ảnh đã chọn sẽ được gắn vào loại phòng khi được duyệt.' : ''}${lost}`);
        return;
      }
      onSaved(saved.id, failed.length
        ? `Đã lưu loại phòng, nhưng chưa tải được ${failed.length} ảnh. Hãy mở lại loại phòng để thêm ảnh.`
        : 'Đã lưu loại phòng');
    } catch (e: unknown) { setError(homestayError(e)); }
    finally { setBusy(false); setProgress(''); }
  }

  const inputCls = (key: keyof typeof errors) => `${ui.input} ${invalid(key) ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`;

  return (
    <Dialog.Root open={editor !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9999] bg-ink-deep/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-[10000] flex w-full max-w-xl flex-col bg-white pr-[var(--safe-right)] pt-[var(--safe-top)] shadow-[var(--shadow-lg)]">
          <header className="flex items-center justify-between border-b border-primary/10 px-5 py-4">
            <Dialog.Title className="min-w-0 truncate text-lg font-bold text-ink-deep">{editor?.id ? (current?.name ?? 'Chi tiết loại phòng') : 'Loại phòng mới'}</Dialog.Title>
            <div className="flex items-center gap-2">
              {current && (
                // Khóa / mở áp dụng ngay, không đợi bấm Lưu; form giữ trạng thái mới để lần Lưu sau không ghi đè lại.
                <StatusToggle room={current} busy={toggling === current.id} disabled={toggling != null || busy}
                  onToggle={() => void onToggleStatus(current).then(next => { if (next) setForm(f => ({ ...f, status: next })); })} large />
              )}
              <Dialog.Close aria-label="Đóng" className={ui.iconBtn}><X className="h-5 w-5" /></Dialog.Close>
            </div>
          </header>
          <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <fieldset disabled={busy} className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
              {error && <Alert tone="error">{error}</Alert>}
              {current && pending.ofRoom(current.id).length > 0 && (
                <ul className="flex flex-col gap-0.5 rounded-md border border-sun bg-sun-light/50 px-3 py-2 text-xs font-semibold text-ink-deep">
                  {pending.ofRoom(current.id).map(r => <li key={r.id}>{pendingWhat(r)}</li>)}
                </ul>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tên loại phòng" required className="sm:col-span-2">
                  <input className={inputCls('name')} maxLength={255} value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: Phòng đôi view ruộng bậc thang" />
                  {!form.name && (
                    <span className="flex flex-wrap gap-1.5">
                      {ROOM_NAME_PRESETS.map(p => <button key={p} type="button" onClick={() => set('name', p)} className="rounded-sm border border-border bg-canvas px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary/50">{p}</button>)}
                    </span>
                  )}
                  <FieldError show={show('name')} error={errors.name} />
                </Field>
                <Field label="Có mấy phòng loại này" required>
                  <CountInput value={form.totalRoomCount} max={10000} ariaLabel="Tổng số phòng" invalid={invalid('totalRoomCount')} onChange={v => set('totalRoomCount', v)} />
                  <FieldError show={show('totalRoomCount')} error={errors.totalRoomCount} />
                </Field>
                <Field label="Mỗi phòng ở tối đa mấy khách" required>
                  <CountInput value={form.maxOccupancy} max={1000} ariaLabel="Khách tối đa mỗi phòng" invalid={invalid('maxOccupancy')} onChange={v => set('maxOccupancy', v)} />
                  <FieldError show={show('maxOccupancy')} error={errors.maxOccupancy} />
                </Field>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Giá</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Giá ngày thường / phòng / đêm" required>
                    <MoneyInput ariaLabel="Giá ngày thường" value={form.basePrice > 0 ? form.basePrice : null} onChange={v => set('basePrice', v ?? 0)} />
                    <FieldError show={show('basePrice')} error={errors.basePrice} />
                  </Field>
                  <Field label="Giá cuối tuần (T7, CN)" hint="Để trống nếu bằng giá ngày thường.">
                    <MoneyInput ariaLabel="Giá cuối tuần" placeholder="Bằng giá ngày thường" value={form.weekendPrice ?? null} onChange={v => set('weekendPrice', v ?? undefined)} />
                    <FieldError show={show('weekendPrice')} error={errors.weekendPrice} />
                  </Field>
                </div>
              </div>

              {editor?.id == null ? (
                <div className="flex flex-col gap-2 border-t border-primary/10 pt-5">
                  <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} onError={setError} coverLabel="Ảnh đại diện"
                    title="Ảnh phòng (nên có)" hint="Xem trước tại đây — ảnh được tải lên khi bạn bấm “Lưu loại phòng”. Chưa có ảnh phòng thì khách xem ảnh chung của Homestay." />
                </div>
              ) : (
                <div className="flex flex-col gap-3 border-t border-primary/10 pt-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Ảnh phòng</p>
                  <MediaManager target={{ placeId, roomId: editor.id }} title="Ảnh phòng" />
                </div>
              )}

              <details className="group rounded-md border border-primary/10 bg-canvas/50 p-3" open={!!(form.areaSqm || form.beds.length || form.viewDescription || form.description || form.amenityIds.length || form.otherAmenities)}>
                <summary className="cursor-pointer select-none text-sm font-semibold text-ink-deep">Thông tin thêm <span className="font-normal text-muted">(không bắt buộc)</span></summary>
                <div className="mt-4 flex flex-col gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Diện tích (m²)">
                      <input className={inputCls('areaSqm')} type="number" min={0.01} max={9999.99} step="0.01" value={form.areaSqm ?? ''} onChange={e => set('areaSqm', e.target.value ? Number(e.target.value) : null)} />
                      <FieldError show={show('areaSqm')} error={errors.areaSqm} />
                    </Field>
                    <Field label="Phòng tắm riêng">
                      <select className={ui.select} value={form.privateBathroom} onChange={e => set('privateBathroom', e.target.value === 'YES' ? 'YES' : e.target.value === 'NO' ? 'NO' : 'UNVERIFIED')}>
                        <option value="UNVERIFIED">Chưa xác định</option><option value="YES">Có phòng tắm riêng</option><option value="NO">Dùng chung</option>
                      </select>
                    </Field>
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Giường ngủ</p>
                    {form.beds.map((bed, i) => (
                      <div key={i} className="flex gap-2">
                        <input aria-label="Loại giường" maxLength={32} placeholder="Giường đôi, giường đơn, đệm..." className={ui.input} value={bed.bedType} onChange={e => set('beds', form.beds.map((b, j) => i === j ? { ...b, bedType: e.target.value } : b))} />
                        <input aria-label="Số lượng" type="number" min={1} max={100} className={`${ui.input} w-20`} value={bed.quantity || ''} onChange={e => set('beds', form.beds.map((b, j) => i === j ? { ...b, quantity: Number(e.target.value) } : b))} />
                        <button type="button" aria-label="Xóa giường" className={ui.iconBtn} onClick={() => set('beds', form.beds.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <FieldError show={show('beds')} error={errors.beds} />
                    <button type="button" className={`${ui.btnGhost} w-fit text-primary`} onClick={() => set('beds', [...form.beds, { bedType: '', quantity: 1 }])}><Plus className="h-4 w-4" />Thêm giường</button>
                  </div>

                  {options.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Tiện nghi trong phòng</p>
                      <div className="flex flex-wrap gap-2">
                        {options.map(a => {
                          const on = form.amenityIds.includes(a.id);
                          return (
                            <button key={a.id} type="button" aria-pressed={on} onClick={() => set('amenityIds', on ? form.amenityIds.filter(x => x !== a.id) : [...form.amenityIds, a.id])}
                              className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${on ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink hover:border-primary/50'}`}>
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <Field label="Tiện ích khác" hint="Những thứ không có trong danh sách trên, VD: ấm siêu tốc, máy sấy tóc, chăn điện.">
                    <textarea className={`${ui.textarea} ${invalid('otherAmenities') ? 'border-danger' : ''}`} rows={2} maxLength={2000} value={form.otherAmenities ?? ''} onChange={e => set('otherAmenities', e.target.value)} placeholder="Gõ tự do, cách nhau bằng dấu phẩy" />
                    <FieldError show={show('otherAmenities')} error={errors.otherAmenities} />
                  </Field>

                  <div className="grid gap-4">
                    <Field label="Vị trí / hướng nhìn"><input className={ui.input} maxLength={500} value={form.viewDescription} onChange={e => set('viewDescription', e.target.value)} placeholder="VD: Tầng 2, nhìn ra thung lũng" /></Field>
                    <Field label="Mô tả"><textarea className={ui.textarea} rows={3} maxLength={10000} value={form.description} onChange={e => set('description', e.target.value)} /></Field>
                  </div>
                </div>
              </details>

              {editor?.id == null && (
                <label className="flex items-center gap-2 rounded-md border border-primary/10 bg-canvas p-3 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={form.status === 'ACTIVE'} onChange={e => set('status', e.target.checked ? 'ACTIVE' : 'INACTIVE')} />
                  <span><b>Mở phòng</b> ngay sau khi lưu <span className="text-muted">(bỏ chọn để khóa, chưa nhận đặt)</span></span>
                </label>
              )}

              {showAvailability && current && (
                <details className="rounded-md border border-primary/10 bg-canvas/50 p-3">
                  <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold text-ink-deep"><Search className="h-4 w-4 text-primary" />Kiểm tra còn đủ phòng cho khách hỏi</summary>
                  <div className="mt-4"><AvailabilityCheck key={`quote-${current.id}`} placeId={placeId} room={current} /></div>
                </details>
              )}
            </fieldset>
            <footer className="flex justify-end gap-2 border-t border-primary/10 bg-canvas/60 px-5 py-3 pb-[max(var(--safe-bottom),0.75rem)]">
              <Dialog.Close type="button" className={ui.btnGhost}>Hủy</Dialog.Close>
              <button className={ui.btnPrimary} disabled={busy}>{busy ? (progress || 'Đang lưu...') : 'Lưu loại phòng'}</button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Kiểm tra nhanh còn đủ phòng cho một yêu cầu của khách không. */
function AvailabilityCheck({ placeId, room }: { placeId: number; room: PartnerRoom }) {
  const [start, setStart] = useState(localDate(0));
  const [end, setEnd] = useState(localDate(1));
  const [count, setCount] = useState(1);
  const [guests, setGuests] = useState(2);
  const [quote, setQuote] = useState<RoomQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setBusy(true); setError(''); setQuote(null);
    try { setQuote(await api.quote(placeId, room.id, start, end, count, guests)); } catch (e: unknown) { setError(homestayError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nằm trong form của ngăn kéo loại phòng: không dùng <form> lồng nhau, nút bấm trực tiếp. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:items-end">
        <Field label="Nhận phòng"><input className={ui.input} type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Trả phòng"><input className={ui.input} type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></Field>
        <Field label="Số phòng"><input className={ui.input} type="number" min={1} value={count} onChange={e => setCount(Number(e.target.value))} /></Field>
        <Field label="Số khách"><input className={ui.input} type="number" min={1} value={guests} onChange={e => setGuests(Number(e.target.value))} /></Field>
        <button type="button" className={`${ui.btnPrimary} sm:col-span-2`} disabled={busy} onClick={() => void check()}><Search className="h-4 w-4" />{busy ? 'Đang kiểm tra...' : 'Kiểm tra'}</button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {quote && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${quote.suitable ? 'border-accent/40 bg-accent-50' : 'border-danger/30 bg-danger/5'}`}>
          <div>
            <p className={`text-sm font-bold ${quote.suitable ? 'text-accent-700' : 'text-danger'}`}>{quote.suitable ? 'Có thể đáp ứng yêu cầu này' : 'Không đủ phòng hoặc sức chứa'}</p>
            <p className="text-xs text-muted">Còn ít nhất {quote.availableRooms} phòng trống trong suốt khoảng ngày · tối đa {room.maxOccupancy} khách/phòng</p>
          </div>
          <p className="text-xl font-extrabold text-ink-deep">{vnd(quote.totalAmount)}</p>
        </div>
      )}
    </div>
  );
}
