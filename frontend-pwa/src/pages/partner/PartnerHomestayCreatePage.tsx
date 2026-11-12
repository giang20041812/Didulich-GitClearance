import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BedDouble, CheckCircle2, ChevronDown, Circle, Image as ImageIcon, Info, Loader2, LocateFixed,
  MapPin, Plus, Send, ShieldCheck, Trash2, type LucideIcon,
} from 'lucide-react';
import type { HomestayOptionsDto, OnboardRequest, PhotoRef } from '@/types/partner';
import type { PartnerRoomInput } from '@/types/room';
import { checkOnboard, fetchHomestayOptions, geocodeAddress, homestayError, onboardHomestay } from '@/services/partnerHomestayService';
import { partnerRoomService } from '@/services/partnerRoomService';
import { partnerMediaService } from '@/services/partnerMediaService';
import PhotoPicker from '@/components/partner/PhotoPicker';
import { usePhotoCleanup, type LocalPhoto } from '@/lib/localPhotos';
import MoneyInput from '@/components/partner/MoneyInput';
import { CountInput, FieldError } from '@/components/partner/RoomTypesManager';
import { BLANK_ROOM, ROOM_NAME_PRESETS, hasRoomErrors, roomErrors } from '@/lib/roomForm';
import { Alert, Field } from '@/components/partner/PartnerUI';
import { addressError, coordinateError, firstError, lengthError, nameError, phoneError, urlError } from '@/lib/fieldValidation';
import { guessRegion, mapsUrl, parseGoogleMapsLink } from '@/lib/mapLink';
import { ui, vnd } from '@/lib/partnerUi';

const STEPS: { title: string; hint: string; icon: LucideIcon }[] = [
  { title: 'Thông tin', hint: 'Tên, liên hệ, địa chỉ', icon: Info },
  { title: 'Ảnh', hint: 'Ảnh & tiện nghi', icon: ImageIcon },
  { title: 'Phòng & giá', hint: 'Loại phòng, giá/đêm', icon: BedDouble },
  { title: 'Gửi duyệt', hint: 'Giờ nhận / trả phòng', icon: Send },
];

const DRAFT_KEY = 'partner_onboard_draft_v1';

interface Info { name: string; contactPhone: string; address: string; regionId: number | null; latitude: number | null; longitude: number | null; googleMapLink: string; description: string }
interface RoomDraft { key: string; form: PartnerRoomInput; photos: LocalPhoto[] }
interface Draft { step: number; info: Info; amenities: string[]; otherAmenities: string; rooms: { key: string; form: PartnerRoomInput }[]; checkInFrom: string; checkOutUntil: string }

let roomSeq = 0;
const newRoom = (form: Partial<PartnerRoomInput> = {}): RoomDraft => { roomSeq += 1; return { key: `room-${Date.now()}-${roomSeq}`, form: { ...BLANK_ROOM, ...form }, photos: [] }; };

const sessionPhone = () => {
  try { const raw = localStorage.getItem('portal_user'); return raw ? String((JSON.parse(raw) as { phone?: string }).phone ?? '') : ''; } catch { return ''; }
};
const readDraft = (): Draft | null => {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
};

/**
 * "Đăng Homestay" cho chủ nhà: 4 bước ngắn trên một trang, kiểm tra ngay khi gõ, ảnh chỉ xem trước trên máy, và MỘT lần
 * gửi tạo cả Homestay + ảnh + loại phòng rồi gửi quản trị viên duyệt (trước đây phải tạo Homestay, sang trang Phòng tạo
 * loại phòng, quay lại tab Vận hành mới gửi duyệt được). Những gì chủ nhà chưa có (email, Facebook, nội quy...) bổ sung
 * sau ở trang Homestay. Thông tin chữ được tự lưu trên máy nếu lỡ thoát giữa chừng.
 */
export default function PartnerHomestayCreatePage() {
  const navigate = useNavigate();
  const [saved] = useState(readDraft);
  const [restored, setRestored] = useState(!!saved);
  const [step, setStep] = useState(saved?.step ?? 0);
  const [info, setInfo] = useState<Info>(saved?.info ?? { name: '', contactPhone: sessionPhone(), address: '', regionId: null, latitude: null, longitude: null, googleMapLink: '', description: '' });
  const [amenities, setAmenities] = useState<string[]>(saved?.amenities ?? []);
  const [otherAmenities, setOtherAmenities] = useState(saved?.otherAmenities ?? '');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [rooms, setRooms] = useState<RoomDraft[]>(() => saved?.rooms?.length ? saved.rooms.map(r => ({ ...r, photos: [] })) : [newRoom()]);
  // Mở sẵn thẻ phòng chưa có tên (lần đầu vào bước Phòng); thẻ giữ nguyên trạng thái mở khi chủ nhà bắt đầu gõ.
  const [openRoom, setOpenRoom] = useState<string | null>(() => rooms.find(r => !r.form.name)?.key ?? null);
  const [checkInFrom, setCheckInFrom] = useState(saved?.checkInFrom ?? '14:00');
  const [checkOutUntil, setCheckOutUntil] = useState(saved?.checkOutUntil ?? '12:00');
  const [options, setOptions] = useState<HomestayOptionsDto>({ regions: [], amenities: [] });
  const [roomOptions, setRoomOptions] = useState<HomestayOptionsDto['amenities']>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [geo, setGeo] = useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: '', ok: true });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const uploaded = useRef(new Map<string, PhotoRef>());
  const topRef = useRef<HTMLDivElement>(null);
  usePhotoCleanup([...photos, ...rooms.flatMap(r => r.photos)]);

  useEffect(() => {
    let active = true;
    fetchHomestayOptions().then(o => { if (active) setOptions(o); }).catch(() => { /* danh mục chỉ để gợi ý */ });
    // Danh mục tiện nghi phòng không phụ thuộc Homestay (backend bỏ qua mã Homestay trên đường dẫn).
    partnerRoomService.options(0).then(o => { if (active) setRoomOptions(o); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Tự lưu phần chữ (ảnh không lưu được trên máy) để lỡ tắt trình duyệt vẫn không phải gõ lại.
  useEffect(() => {
    const draft: Draft = { step, info, amenities, otherAmenities, rooms: rooms.map(r => ({ key: r.key, form: r.form })), checkInFrom, checkOutUntil };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* bộ nhớ trình duyệt đầy / bị chặn */ }
  }, [step, info, amenities, otherAmenities, rooms, checkInFrom, checkOutUntil]);

  const setField = <K extends keyof Info>(key: K, value: Info[K]) => { setInfo(prev => ({ ...prev, [key]: value })); };
  const touch = (key: string) => setTouched(t => (t[key] ? t : { ...t, [key]: true }));

  // ---------- kiểm tra ----------
  const infoErrors = {
    name: nameError(info.name),
    contactPhone: phoneError(info.contactPhone, true),
    address: addressError(info.address),
    coordinates: coordinateError(info.latitude, info.longitude),
    googleMapLink: urlError(info.googleMapLink, 2000),
    description: lengthError(info.description, 10000),
  };
  const photoIssue = photos.length === 0 ? 'Cần ít nhất 1 ảnh Homestay' : null;
  const otherIssue = lengthError(otherAmenities, 2000);
  const roomIssue = rooms.length === 0 ? 'Cần ít nhất 1 loại phòng' : rooms.some(r => hasRoomErrors(r.form)) ? 'Có loại phòng chưa điền đúng' : null;
  const nameClash = (() => {
    const names = rooms.map(r => r.form.name.trim().toLowerCase()).filter(Boolean);
    return names.length !== new Set(names).size ? 'Hai loại phòng đang trùng tên — đặt tên khác nhau' : null;
  })();
  const timeIssue = !checkInFrom || !checkOutUntil ? 'Chọn giờ nhận phòng và trả phòng' : null;
  const stepErrors = [
    firstError(...Object.values(infoErrors)),
    firstError(photoIssue, otherIssue),
    firstError(roomIssue, nameClash),
    timeIssue,
  ];
  const showInfo = (key: keyof typeof infoErrors) => !!touched[key] || !!checkedSteps[0];

  /** Danh sách việc còn thiếu, hiện ở bước cuối — bấm để quay lại đúng bước. */
  const missing = [
    { done: !infoErrors.name && !infoErrors.contactPhone && !infoErrors.address, label: 'Tên, số điện thoại và địa chỉ', step: 0 },
    { done: !photoIssue, label: 'Ít nhất 1 ảnh Homestay', step: 1 },
    { done: !roomIssue && !nameClash, label: 'Ít nhất 1 loại phòng có giá', step: 2 },
    { done: !timeIssue, label: 'Giờ nhận / trả phòng', step: 3 },
  ];
  const canSubmit = missing.every(m => m.done) && !stepErrors.some(Boolean);

  function goTo(next: number) {
    setError('');
    setStep(next);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function next() {
    setCheckedSteps(c => ({ ...c, [step]: true }));
    // Bước ảnh không chặn đi tiếp: ảnh bắt buộc khi gửi duyệt, còn lưu nháp thì chưa cần.
    if (step !== 1 && stepErrors[step]) { setError('Vui lòng sửa các ô được đánh dấu đỏ.'); return; }
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  // ---------- vị trí ----------
  async function locateFromAddress(force = false) {
    const address = info.address.trim();
    if (address.length < 5 || geo.busy || (!force && info.latitude != null && info.longitude != null)) return;
    const region = options.regions.find(r => r.id === info.regionId)?.name;
    setGeo({ busy: true, text: 'Đang tìm vị trí trên bản đồ...', ok: true });
    try {
      const found = await geocodeAddress(region && !address.toLowerCase().includes(region.toLowerCase()) ? `${address}, ${region}` : address);
      setInfo(prev => ({ ...prev, latitude: Number(found.latitude.toFixed(6)), longitude: Number(found.longitude.toFixed(6)) }));
      setGeo({ busy: false, text: 'Đã tìm thấy vị trí theo địa chỉ. Bấm “Xem trên bản đồ” để kiểm tra.', ok: true });
    } catch {
      setGeo({ busy: false, text: 'Chưa tìm được vị trí theo địa chỉ. Khi đang ở Homestay, bấm “Dùng vị trí hiện tại”.', ok: false });
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setGeo({ busy: false, text: 'Thiết bị không hỗ trợ lấy vị trí.', ok: false }); return; }
    setGeo({ busy: true, text: 'Đang lấy vị trí hiện tại...', ok: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInfo(prev => ({ ...prev, latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }));
        setGeo({ busy: false, text: 'Đã lấy vị trí hiện tại của bạn.', ok: true });
      },
      () => setGeo({ busy: false, text: 'Không lấy được vị trí — hãy cho phép trình duyệt truy cập vị trí rồi thử lại.', ok: false }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function onMapLink(url: string) {
    setField('googleMapLink', url);
    if (!url.trim()) return;
    const parsed = parseGoogleMapsLink(url);
    if (parsed.latitude != null && parsed.longitude != null) {
      setInfo(prev => ({ ...prev, googleMapLink: url, latitude: parsed.latitude, longitude: parsed.longitude, address: prev.address || parsed.placeName || '' }));
      setGeo({ busy: false, text: 'Đã lấy vị trí từ link Google Maps.', ok: true });
    } else if (parsed.shortLink) {
      setGeo({ busy: false, text: 'Link rút gọn chưa đọc được vị trí. Mở link rồi sao chép link đầy đủ trên thanh địa chỉ, hoặc bấm “Dùng vị trí hiện tại”.', ok: false });
    }
  }

  function onAddressBlur() {
    touch('address');
    if (info.regionId == null) {
      const region = guessRegion(info.address, options.regions);
      if (region) setField('regionId', region.id);
    }
    void locateFromAddress();
  }

  // ---------- phòng ----------
  const updateRoom = (key: string, patch: Partial<PartnerRoomInput>) =>
    setRooms(list => list.map(r => (r.key === key ? { ...r, form: { ...r.form, ...patch } } : r)));
  const setRoomPhotos = (key: string, next: LocalPhoto[]) => setRooms(list => list.map(r => (r.key === key ? { ...r, photos: next } : r)));
  function addRoom() {
    const room = newRoom();
    setRooms(list => [...list, room]);
    setOpenRoom(room.key);
  }
  function removeRoom(key: string) {
    setRooms(list => {
      const target = list.find(r => r.key === key);
      target?.photos.forEach(p => URL.revokeObjectURL(p.preview));
      return list.filter(r => r.key !== key);
    });
  }

  // ---------- gửi ----------
  function buildRequest(submit: boolean, placePhotos: PhotoRef[], roomPhotos: PhotoRef[][]): OnboardRequest {
    return {
      submit,
      homestay: {
        name: info.name.trim(), contactPhone: info.contactPhone.trim(), address: info.address.trim(), regionId: info.regionId,
        latitude: info.latitude, longitude: info.longitude, googleMapLink: info.googleMapLink.trim(), description: info.description.trim(),
        amenities, otherAmenities: otherAmenities.trim(), checkInFrom, checkOutUntil,
        freeCancelCutoffHours: null, refundOnLateCancel: null, policyName: '', cancellationPolicy: '',
      },
      photos: placePhotos,
      rooms: rooms.map((r, i) => ({ room: { ...r.form, name: r.form.name.trim(), otherAmenities: r.form.otherAmenities?.trim() ?? '' }, photos: roomPhotos[i] ?? [] })),
    };
  }

  async function uploadAll(): Promise<{ place: PhotoRef[]; rooms: PhotoRef[][] }> {
    const total = photos.length + rooms.reduce((n, r) => n + r.photos.length, 0);
    let index = 0;
    const one = async (photo: LocalPhoto) => {
      index += 1;
      const cached = uploaded.current.get(photo.key);
      if (cached) return cached;
      setBusy(`Đang tải ảnh ${index}/${total}...`);
      const ref = await partnerMediaService.uploadToStorage(photo.file);
      uploaded.current.set(photo.key, ref);
      return ref;
    };
    const place: PhotoRef[] = [];
    for (const photo of photos) place.push(await one(photo));
    const roomRefs: PhotoRef[][] = [];
    for (const room of rooms) {
      const refs: PhotoRef[] = [];
      for (const photo of room.photos) refs.push(await one(photo));
      roomRefs.push(refs);
    }
    return { place, rooms: roomRefs };
  }

  async function send(submit: boolean) {
    setCheckedSteps({ 0: true, 1: true, 2: true, 3: true });
    setError('');
    if (submit && !canSubmit) {
      const firstBad = missing.find(m => !m.done)?.step ?? stepErrors.findIndex(Boolean);
      setError('Còn thiếu thông tin để gửi duyệt — xem các mục chưa có dấu ✓ bên dưới.');
      if (firstBad >= 0 && firstBad !== step) goTo(firstBad);
      return;
    }
    if (!submit && (infoErrors.name || rooms.some(r => hasRoomErrors(r.form)) || nameClash)) {
      setError(infoErrors.name ? 'Cần tên Homestay để lưu nháp.' : 'Có loại phòng chưa điền đúng — sửa hoặc xóa loại phòng đó rồi lưu nháp.');
      return;
    }
    try {
      setBusy('Đang kiểm tra thông tin...');
      await checkOnboard(buildRequest(submit, [], []));
      const refs = await uploadAll();
      setBusy(submit ? 'Đang gửi duyệt...' : 'Đang lưu nháp...');
      const result = await onboardHomestay(buildRequest(submit, refs.place, refs.rooms));
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* bỏ qua */ }
      navigate(result.submitted ? '/partner/homestays' : `/partner/homestay/${result.id}/edit`, { replace: true, state: { notice: result.message } });
    } catch (e: unknown) {
      setError(e instanceof Error && !('isAxiosError' in e) ? e.message : homestayError(e));
    } finally {
      setBusy('');
    }
  }

  function startOver() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* bỏ qua */ }
    setInfo({ name: '', contactPhone: sessionPhone(), address: '', regionId: null, latitude: null, longitude: null, googleMapLink: '', description: '' });
    setAmenities([]); setOtherAmenities(''); setRooms([newRoom()]); setCheckInFrom('14:00'); setCheckOutUntil('12:00');
    setTouched({}); setCheckedSteps({}); setRestored(false); goTo(0);
  }

  const inputCls = (bad: boolean) => `${ui.input} ${bad ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`;
  const hasLocation = info.latitude != null && info.longitude != null;

  return (
    <div ref={topRef} className="mx-auto flex w-full max-w-3xl scroll-mt-20 flex-col gap-5 pb-[calc(7rem+var(--safe-bottom))] lg:pb-8">
      <div className="flex flex-col gap-1">
        <Link to="/partner/homestays" className="group inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Homestay của tôi
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-deep sm:text-3xl">Đăng Homestay</h1>
        <p className="text-sm text-muted">4 bước ngắn, khoảng 5 phút. Gửi một lần là xong — quản trị viên duyệt rồi Homestay hiện lên cho khách đặt.</p>
      </div>

      {restored && (
        <Alert tone="info" action={<button type="button" className={ui.btnGhost} onClick={startOver}>Làm lại từ đầu</button>}>
          Đã khôi phục thông tin bạn nhập dở lần trước. Ảnh cần chọn lại.
        </Alert>
      )}

      <ol className="grid grid-cols-4 gap-1.5" aria-label="Các bước đăng Homestay">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step && !stepErrors[i];
          const Icon = s.icon;
          return (
            <li key={s.title}>
              <button type="button" onClick={() => (i <= step ? goTo(i) : undefined)} disabled={i > step || !!busy} aria-current={active ? 'step' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-md border px-1 py-2 text-center transition-colors ${active ? 'border-primary bg-primary text-white shadow-[var(--shadow-teal)]' : done ? 'border-primary/30 bg-primary-50 text-primary' : 'border-border bg-surface text-muted'}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span className="text-[11px] font-bold leading-tight sm:text-xs">{i + 1}. {s.title}</span>
                <span className={`hidden text-[10px] sm:block ${active ? 'text-white/80' : 'text-muted'}`}>{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {error && <Alert tone="error">{error}</Alert>}

      <fieldset disabled={!!busy} className="flex min-w-0 flex-col gap-5">
        {step === 0 && (
          <Section title="Thông tin cơ bản" description="Chỉ cần tên, số điện thoại và địa chỉ. Phần còn lại không bắt buộc.">
            <Field label="Tên Homestay" required>
              <input className={inputCls(showInfo('name') && !!infoErrors.name)} maxLength={255} value={info.name} autoFocus
                onChange={e => setField('name', e.target.value)} onBlur={() => touch('name')} placeholder="VD: Nhà sàn Bản Lìm" />
              <FieldError show={showInfo('name')} error={infoErrors.name} />
            </Field>
            <Field label="Số điện thoại nhận khách" required hint="Khách và quản trị viên gọi số này. Mặc định là số bạn dùng để đăng nhập.">
              <input className={inputCls(showInfo('contactPhone') && !!infoErrors.contactPhone)} type="tel" inputMode="tel" maxLength={32} value={info.contactPhone}
                onChange={e => setField('contactPhone', e.target.value)} onBlur={() => touch('contactPhone')} placeholder="VD: 0912 345 678" />
              <FieldError show={showInfo('contactPhone')} error={infoErrors.contactPhone} />
            </Field>
            <Field label="Địa chỉ" required>
              <textarea className={`${ui.textarea} ${showInfo('address') && infoErrors.address ? 'border-danger' : ''}`} rows={2} maxLength={500} value={info.address}
                onChange={e => setField('address', e.target.value)} onBlur={onAddressBlur} placeholder="Thôn/bản, xã, huyện, tỉnh — VD: Bản Lìm Mông, xã Cao Phạ, Mù Cang Chải, Lào Cai" />
              <FieldError show={showInfo('address')} error={infoErrors.address} />
            </Field>

            <div className="flex flex-col gap-3 rounded-md border border-primary/10 bg-canvas p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-deep"><MapPin className="h-4 w-4 text-coral" /> Vị trí trên bản đồ <span className="font-normal text-muted">(nên có)</span></p>
                {hasLocation && <a className="text-xs font-semibold text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={mapsUrl(info.latitude as number, info.longitude as number)}>Xem trên bản đồ</a>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className={ui.btnOutline} onClick={useCurrentLocation} disabled={geo.busy}>
                  <LocateFixed className="h-4 w-4" /> Dùng vị trí hiện tại
                </button>
                <button type="button" className={ui.btnOutline} onClick={() => void locateFromAddress(true)} disabled={geo.busy || info.address.trim().length < 5}>
                  <MapPin className="h-4 w-4" /> Tìm theo địa chỉ
                </button>
              </div>
              {geo.text && <p role="status" className={`text-xs ${geo.ok ? 'text-accent-700' : 'text-danger'}`}>{geo.busy && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}{geo.text}</p>}
              <FieldError show error={infoErrors.coordinates} />
              <Field label="Hoặc dán link Google Maps của Homestay" hint="Mở Google Maps, tìm Homestay, bấm Chia sẻ → Sao chép đường liên kết.">
                <input className={inputCls(!!infoErrors.googleMapLink)} type="url" inputMode="url" value={info.googleMapLink} onChange={e => onMapLink(e.target.value)} placeholder="https://www.google.com/maps/place/..." />
                <FieldError show error={infoErrors.googleMapLink} />
              </Field>
              {options.regions.length > 0 && (
                <Field label="Khu vực" hint="Để khách lọc theo huyện / xã. Tự chọn theo địa chỉ khi có thể.">
                  <select className={ui.select} value={info.regionId ?? ''} onChange={e => setField('regionId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Chưa chọn</option>
                    {options.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Giới thiệu ngắn" hint={`Không bắt buộc — cảnh đẹp, món ngon, trải nghiệm đặc biệt. ${info.description.length.toLocaleString('vi-VN')}/10.000 ký tự`}>
              <textarea className={ui.textarea} rows={4} maxLength={10000} value={info.description} onChange={e => setField('description', e.target.value)}
                placeholder="VD: Nhà sàn gỗ giữa ruộng bậc thang, có bếp lửa, chủ nhà nấu cơm lam và gà đồi..." />
            </Field>
          </Section>
        )}

        {step === 1 && (
          <>
            <Section title="Ảnh Homestay" description="Ảnh sáng, rõ, chụp ngang đẹp nhất. Ảnh chỉ được tải lên khi bạn bấm Gửi duyệt.">
              <PhotoPicker photos={photos} onChange={(next) => { setPhotoError(''); setPhotos(next); }} onError={setPhotoError} disabled={!!busy}
                title="Ảnh chung" hint="Ảnh đầu tiên là ảnh bìa (khách thấy đầu tiên). Nên có 3-8 ảnh: toàn cảnh, phòng, khu sinh hoạt chung, cảnh xung quanh." />
              {photoError && <p role="alert" className="text-xs font-semibold text-danger">{photoError}</p>}
              <FieldError show={!!checkedSteps[1]} error={photoIssue} />
            </Section>
            <Section title="Tiện nghi chung" description="Không bắt buộc. Bấm để chọn; tiện nghi riêng từng phòng khai báo ở bước sau.">
              {options.amenities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {options.amenities.map(a => {
                    const on = amenities.includes(a.name);
                    return (
                      <button key={a.id} type="button" aria-pressed={on} onClick={() => setAmenities(on ? amenities.filter(x => x !== a.name) : [...amenities, a.name])}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink hover:border-primary/50'}`}>
                        {on && <CheckCircle2 className="h-3.5 w-3.5" />}{a.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <Field label="Tiện ích khác" hint="Những thứ không có trong danh sách, VD: cho mượn áo mưa, sạc dự phòng, đón khách tại bến xe.">
                <textarea className={`${ui.textarea} ${otherIssue ? 'border-danger' : ''}`} rows={2} maxLength={2000} value={otherAmenities} onChange={e => setOtherAmenities(e.target.value)} placeholder="Gõ tự do, cách nhau bằng dấu phẩy" />
                <FieldError show error={otherIssue} />
              </Field>
            </Section>
          </>
        )}

        {step === 2 && (
          <Section title="Phòng & giá" description="Mỗi loại phòng một thẻ: tên, có mấy phòng, mỗi phòng mấy khách, giá một đêm. Ảnh phòng nên có nhưng không bắt buộc.">
            <div className="flex flex-col gap-3">
              {rooms.map((room, i) => {
                const isOpen = openRoom === room.key;
                return (
                  <RoomCard key={room.key} index={i} room={room} options={roomOptions} open={isOpen}
                    showErrors={!!checkedSteps[2]} onToggle={() => setOpenRoom(isOpen ? '' : room.key)}
                    onChange={(patch) => updateRoom(room.key, patch)} onPhotos={(next) => setRoomPhotos(room.key, next)} onPhotoError={setPhotoError}
                    onRemove={rooms.length > 1 ? () => removeRoom(room.key) : undefined} disabled={!!busy} />
                );
              })}
              {photoError && <p role="alert" className="text-xs font-semibold text-danger">{photoError}</p>}
              <FieldError show={!!checkedSteps[2]} error={nameClash} />
              <button type="button" onClick={addRoom} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary-50/30 text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary-50">
                <Plus className="h-5 w-5" /> Thêm loại phòng khác
              </button>
            </div>
          </Section>
        )}

        {step === 3 && (
          <>
            <Section title="Giờ nhận & trả phòng" description="Đã điền sẵn giờ phổ biến, sửa nếu khác.">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nhận phòng từ"><input className={inputCls(!checkInFrom)} type="time" value={checkInFrom} onChange={e => setCheckInFrom(e.target.value)} /></Field>
                <Field label="Trả phòng trước"><input className={inputCls(!checkOutUntil)} type="time" value={checkOutUntil} onChange={e => setCheckOutUntil(e.target.value)} /></Field>
              </div>
              <FieldError show error={timeIssue} />
            </Section>
            <Section title="Xem lại trước khi gửi">
              <ul className="flex flex-col gap-2">
                {missing.map(m => (
                  <li key={m.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className={`flex items-center gap-2 ${m.done ? 'text-ink' : 'font-semibold text-danger'}`}>
                      {m.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-600" /> : <Circle className="h-4 w-4 shrink-0" />}{m.label}
                    </span>
                    {!m.done && <button type="button" className="shrink-0 text-xs font-bold text-primary underline" onClick={() => goTo(m.step)}>Bổ sung</button>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 rounded-md border border-border bg-canvas p-3 text-sm">
                <p className="font-bold text-ink-deep">{info.name || 'Chưa có tên'}</p>
                <p className="text-xs text-muted">{info.address || 'Chưa có địa chỉ'} · {info.contactPhone}</p>
                {photos.length > 0 && (
                  <div className="flex gap-1.5">
                    {photos.slice(0, 5).map(p => <img key={p.key} src={p.preview} alt="" className="h-12 w-16 rounded-sm object-cover" />)}
                    {photos.length > 5 && <span className="flex h-12 w-12 items-center justify-center rounded-sm bg-surface text-xs font-bold text-muted">+{photos.length - 5}</span>}
                  </div>
                )}
                <ul className="flex flex-col gap-1 border-t border-border pt-2">
                  {rooms.map(r => (
                    <li key={r.key} className="flex justify-between gap-3 text-xs">
                      <span className="truncate text-ink">{r.form.name || 'Loại phòng chưa đặt tên'} · {r.form.totalRoomCount || 0} phòng · {r.form.maxOccupancy || 0} khách/phòng</span>
                      <span className="shrink-0 font-bold text-ink-deep">{r.form.basePrice > 0 ? `${vnd(r.form.basePrice)}/đêm` : '—'}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-center gap-1.5 border-t border-border pt-2 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Nhận phòng từ {checkInFrom} · trả trước {checkOutUntil}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted">Sau khi gửi, quản trị viên kiểm tra và duyệt. Trong lúc chờ, bạn vẫn sửa được thông tin, thêm ảnh, nội quy, email, Facebook… ở trang Homestay.</p>
            </Section>
          </>
        )}
      </fieldset>

      {/* Thanh nút: cố định đáy màn hình trên điện thoại (thanh điều hướng dưới được ẩn ở trang này), nằm cuối trang trên máy tính. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 pb-[max(var(--safe-bottom),0.75rem)] pt-3 shadow-[0_-4px_16px_rgba(10,46,38,0.08)] backdrop-blur-md lg:static lg:rounded-lg lg:border lg:p-4 lg:shadow-none">
        {busy && <p role="status" className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}</p>}
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {step > 0 && (
            <button type="button" className={`${ui.btnGhost} h-12`} disabled={!!busy} onClick={() => goTo(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Quay lại
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <>
              <button type="button" className={`${ui.btnGhost} ml-auto hidden h-12 sm:inline-flex`} disabled={!!busy || !info.name.trim()} onClick={() => void send(false)}>Lưu nháp</button>
              <button type="button" className={`${ui.btnPrimary} h-12 flex-1 sm:flex-none sm:px-8 ${step === 0 ? 'ml-auto' : ''}`} disabled={!!busy} onClick={next}>
                Tiếp tục <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`${ui.btnOutline} ml-auto h-12`} disabled={!!busy || !info.name.trim()} onClick={() => void send(false)}>Lưu nháp</button>
              <button type="button" className={`${ui.btnCoral} h-12 flex-1 sm:flex-none sm:px-8`} disabled={!!busy} onClick={() => void send(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi duyệt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className={`${ui.card} flex flex-col gap-4 p-4 sm:p-5`}>
      <div>
        <h2 className="text-base font-bold text-ink-deep">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Thẻ một loại phòng trong luồng đăng Homestay: thu gọn thành một dòng tóm tắt, bấm để mở sửa. */
function RoomCard({ index, room, options, open, showErrors, onToggle, onChange, onPhotos, onPhotoError, onRemove, disabled }: {
  index: number; room: RoomDraft; options: HomestayOptionsDto['amenities']; open: boolean; showErrors: boolean; disabled: boolean;
  onToggle: () => void; onChange: (patch: Partial<PartnerRoomInput>) => void; onPhotos: (photos: LocalPhoto[]) => void;
  onPhotoError: (message: string) => void; onRemove?: () => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const form = room.form;
  const errors = roomErrors(form);
  const bad = Object.values(errors).some(Boolean);
  const show = (key: keyof typeof errors) => showErrors || !!touched[key];
  const set = (patch: Partial<PartnerRoomInput>, key: keyof typeof errors) => { onChange(patch); setTouched(t => ({ ...t, [key]: true })); };
  const inputCls = (key: keyof typeof errors) => `${ui.input} ${show(key) && errors[key] ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`;

  return (
    <article className={`rounded-lg border bg-surface ${showErrors && bad ? 'border-danger/50' : 'border-border'}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        {room.photos[0] ? <img src={room.photos[0].preview} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
          : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary"><BedDouble className="h-5 w-5" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink-deep">{form.name || `Loại phòng ${index + 1}`}</span>
          <span className="block truncate text-xs text-muted">
            {form.totalRoomCount || 0} phòng · {form.maxOccupancy || 0} khách/phòng · {form.basePrice > 0 ? `${vnd(form.basePrice)}/đêm` : 'chưa có giá'}
          </span>
        </span>
        {showErrors && bad ? <span className="text-xs font-bold text-danger">Cần sửa</span> : !bad && <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-600" />}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <Field label="Tên loại phòng" required>
            <input className={inputCls('name')} maxLength={255} value={form.name} onChange={e => set({ name: e.target.value }, 'name')} placeholder="VD: Phòng đôi view ruộng" />
            {!form.name && (
              <span className="flex flex-wrap gap-1.5">
                {ROOM_NAME_PRESETS.map(p => <button key={p} type="button" disabled={disabled} onClick={() => set({ name: p }, 'name')} className="rounded-sm border border-border bg-canvas px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary/50">{p}</button>)}
              </span>
            )}
            <FieldError show={show('name')} error={errors.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Có mấy phòng" required>
              <CountInput value={form.totalRoomCount} max={10000} ariaLabel="Số phòng" invalid={show('totalRoomCount') && !!errors.totalRoomCount} onChange={v => set({ totalRoomCount: v }, 'totalRoomCount')} />
              <FieldError show={show('totalRoomCount')} error={errors.totalRoomCount} />
            </Field>
            <Field label="Khách / phòng" required>
              <CountInput value={form.maxOccupancy} max={1000} ariaLabel="Khách tối đa mỗi phòng" invalid={show('maxOccupancy') && !!errors.maxOccupancy} onChange={v => set({ maxOccupancy: v }, 'maxOccupancy')} />
              <FieldError show={show('maxOccupancy')} error={errors.maxOccupancy} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Giá 1 đêm" required>
              <MoneyInput ariaLabel="Giá ngày thường" value={form.basePrice > 0 ? form.basePrice : null} onChange={v => set({ basePrice: v ?? 0 }, 'basePrice')} />
              <FieldError show={show('basePrice')} error={errors.basePrice} />
            </Field>
            <Field label="Giá cuối tuần (T7, CN)" hint="Để trống nếu bằng giá thường.">
              <MoneyInput ariaLabel="Giá cuối tuần" placeholder="Bằng giá thường" value={form.weekendPrice ?? null} onChange={v => set({ weekendPrice: v ?? undefined }, 'weekendPrice')} />
              <FieldError show={show('weekendPrice')} error={errors.weekendPrice} />
            </Field>
          </div>
          <PhotoPicker photos={room.photos} onChange={onPhotos} onError={onPhotoError} disabled={disabled} compact coverLabel="Ảnh đại diện"
            title="Ảnh phòng (nên có)" hint="Chưa có ảnh phòng thì khách xem ảnh chung của Homestay." />
          {options.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-ink">Tiện nghi trong phòng <span className="font-normal text-muted">(không bắt buộc)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {options.map(a => {
                  const on = form.amenityIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} disabled={disabled}
                      onClick={() => onChange({ amenityIds: on ? form.amenityIds.filter(x => x !== a.id) : [...form.amenityIds, a.id] })}
                      className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink hover:border-primary/50'}`}>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <Field label="Tiện ích khác của phòng" hint="Không bắt buộc, VD: ấm siêu tốc, chăn điện, máy sấy tóc.">
            <input className={inputCls('otherAmenities')} maxLength={2000} value={form.otherAmenities ?? ''} onChange={e => set({ otherAmenities: e.target.value }, 'otherAmenities')} />
            <FieldError show={show('otherAmenities')} error={errors.otherAmenities} />
          </Field>
          {onRemove && (
            <button type="button" className={`${ui.btnGhost} w-fit text-danger hover:text-danger`} disabled={disabled} onClick={onRemove}>
              <Trash2 className="h-4 w-4" /> Bỏ loại phòng này
            </button>
          )}
        </div>
      )}
    </article>
  );
}
