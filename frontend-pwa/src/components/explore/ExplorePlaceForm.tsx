import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import ExploreMap from '@/components/explore/ExploreMap';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiError';
import {
  DEFAULT_CENTER, EXPLORE_CATEGORIES, IMAGES_MAX, NAME_MAX, SUMMARY_MAX, DAY_NAMES, cleanText, inServiceArea,
} from '@/lib/exploreRules';
import { uploadExploreImage } from '@/services/exploreService';
import { GUIDE_LANGUAGES } from '@/components/layout/providerServices';
import {
  FIXED_ROUTE_GROUPS, PRICE_UNIT_SUGGESTIONS, SERVICE_LIMITS, minutesText, serviceGroupOf, serviceGroupsFor,
} from '@/lib/serviceGroups';
import type { ExploreCategory, OpeningHourInput, PlaceForm, PlaceInput, ServiceGroup, ServiceProfileInput } from '@/types/explore';

type FieldKey = 'name' | 'category' | 'summary' | 'description' | 'address' | 'images' | 'coordinates' | 'coordVerified'
  | 'phone' | 'website' | 'openingHours'
  | 'serviceGroup' | 'vehicleType' | 'route' | 'departureTimes' | 'durationMinutes' | 'seats' | 'groupSizeMax' | 'languages'
  | 'includes' | 'priceFrom' | 'priceUnit';
type Errors = Partial<Record<FieldKey, string>>;

interface ImageItem {
  key: string;
  mediaId?: number;
  imageId?: string;
  url?: string;
  /** Ảnh xem trước khi đang tải lên. */
  preview?: string;
  uploading?: boolean;
  error?: string;
}

interface DayRow {
  closed: boolean;
  open: string;
  close: string;
}

const PHONE = /^(\+84|0)\d{9,10}$/;
const HTTP_URL = /^https?:\/\/\S+$/i;

function initialDays(form: PlaceForm | null): DayRow[] {
  const rows: DayRow[] = Array.from({ length: 7 }, () => ({ closed: false, open: '07:00', close: '21:00' }));
  for (const h of form?.openingHours ?? []) {
    if (h.dayOfWeek >= 1 && h.dayOfWeek <= 7) rows[h.dayOfWeek - 1] = { closed: h.closed, open: h.open ?? '', close: h.close ?? '' };
  }
  return rows;
}

/** Thông tin dịch vụ nhà xe / trải nghiệm trên form (chuỗi như người nhập, đổi sang số khi gửi). */
interface ServiceState {
  on: boolean;
  group: ServiceGroup | null;
  vehicleType: string;
  routeFrom: string;
  routeTo: string;
  departureTimes: string;
  durationHours: string;
  seats: string;
  groupSize: string;
  languages: string[];
  includes: string;
  priceFrom: string;
  priceUnit: string;
}

function initialService(form: PlaceForm | null, forced: boolean): ServiceState {
  const s = form?.service ?? null;
  const minutes = s?.durationMinutes ?? null;
  return {
    on: forced || s != null,
    group: s?.serviceGroup ?? null,
    vehicleType: s?.vehicleType ?? '',
    routeFrom: s?.routeFrom ?? '',
    routeTo: s?.routeTo ?? '',
    departureTimes: s?.departureTimes ?? '',
    durationHours: minutes == null ? '' : String(Math.round((minutes / 60) * 100) / 100).replace('.', ','),
    seats: s?.seats != null ? String(s.seats) : '',
    groupSize: s?.groupSizeMax != null ? String(s.groupSizeMax) : '',
    languages: s?.languages ?? [],
    includes: s?.includes ?? '',
    priceFrom: form?.priceFrom != null && s != null ? String(Math.round(form.priceFrom)) : '',
    priceUnit: s != null ? form?.priceUnit ?? '' : '',
  };
}

/** "5,5" → 5.5; trống → null; không phải số → NaN. */
const parseNumber = (raw: string): number | null => {
  const value = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!value) return null;
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
};

const coord = (value: number | null | undefined) => (value == null ? '' : String(value));
const parseCoord = (raw: string): number | null | 'invalid' => {
  const value = raw.trim().replace(',', '.');
  if (!value) return null;
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : 'invalid';
};

/**
 * AD-02 — form thêm / sửa địa điểm khám phá, Admin và NCC dùng chung (US02.01). Kiểm tra trên form theo FS §5 (V1–V16) rồi
 * hiện lỗi máy chủ trả về dưới đúng ô. Admin có thêm cờ "Tọa độ đã xác minh" (BR-C05) và Hiển thị / Ẩn.
 */
export default function ExplorePlaceForm({ initial, scope, submitLabel, onSubmit, onCancel, serviceMode }: {
  initial: PlaceForm | null;
  scope: 'admin' | 'partner';
  submitLabel: string;
  onSubmit: (input: PlaceInput) => Promise<void>;
  onCancel: () => void;
  /**
   * Form dịch vụ của nhà xe / nhà cung cấp trải nghiệm: danh mục cố định, bắt buộc chọn nhóm dịch vụ, có giá và thông tin
   * dịch vụ. Không truyền = form địa điểm khám phá (Admin bật được khối dịch vụ cho Dịch vụ địa phương / Trải nghiệm).
   */
  serviceMode?: { category: ExploreCategory; groups: { code: ServiceGroup; label: string }[] };
}) {
  const admin = scope === 'admin';
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ExploreCategory | null>(serviceMode?.category ?? initial?.category ?? null);
  const [svc, setSvc] = useState<ServiceState>(() => initialService(initial, Boolean(serviceMode)));
  const groupOptions = serviceMode?.groups ?? serviceGroupsFor(category).map((g) => ({ code: g.code, label: g.label }));
  /** Khối dịch vụ có hiệu lực: form dịch vụ, hoặc Admin bật cho danh mục có nhóm dịch vụ. */
  const serviceActive = Boolean(serviceMode) || (admin && svc.on && groupOptions.length > 0);
  const groupKind = serviceGroupOf(svc.group)?.kind ?? null;
  const setService = (patch: Partial<ServiceState>) => setSvc((v) => ({ ...v, ...patch }));
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(coord(initial?.latitude));
  const [lng, setLng] = useState(coord(initial?.longitude));
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [hasHours, setHasHours] = useState((initial?.openingHours.length ?? 0) > 0);
  const [days, setDays] = useState<DayRow[]>(() => initialDays(initial));
  const [images, setImages] = useState<ImageItem[]>(
    () => (initial?.images ?? []).map((img) => ({ key: `m${img.mediaId}`, mediaId: img.mediaId, url: img.url })),
  );
  const [coordVerified, setCoordVerified] = useState(initial?.coordVerified ?? false);
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const latValue = parseCoord(lat);
  const lngValue = parseCoord(lng);
  const picked = typeof latValue === 'number' && typeof lngValue === 'number' ? { lat: latValue, lng: lngValue } : null;
  // AC-02.05: sửa tọa độ của địa điểm đã có → cờ xác minh tự tắt, phải xác minh lại sau khi lưu.
  const coordsChanged = initial != null && (coord(initial.latitude) !== lat.trim() || coord(initial.longitude) !== lng.trim());
  const uploading = images.some((i) => i.uploading);
  const clear = (key: FieldKey) => setErrors((e) => ({ ...e, [key]: undefined }));

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    clear('images');
    const room = IMAGES_MAX - images.length;
    if (files.length > room) setErrors((e) => ({ ...e, images: `Mỗi địa điểm tối đa ${IMAGES_MAX} ảnh.` }));
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = `n${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      setImages((list) => [...list, { key, preview, uploading: true }]);
      uploadExploreImage(file, scope)
        .then((res) => setImages((list) => list.map((i) => (i.key === key ? { key, imageId: res.imageId, url: res.url, preview } : i))))
        .catch((err: unknown) => setImages((list) => list.map((i) => (i.key === key
          ? { key, preview, error: err instanceof Error && err.message ? err.message : getApiErrorMessage(err, 'Không tải được ảnh.') }
          : i))));
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    const cleanName = cleanText(name);
    if (!cleanName) e.name = 'Vui lòng nhập tên địa điểm.';
    else if (cleanName.length > NAME_MAX) e.name = `Tên địa điểm tối đa ${NAME_MAX} ký tự.`;
    if (!category) e.category = 'Vui lòng chọn danh mục.';
    const cleanSummary = summary.normalize('NFC').trim();
    if (!cleanSummary) e.summary = 'Vui lòng nhập mô tả ngắn.';
    else if (cleanSummary.length > SUMMARY_MAX) e.summary = `Mô tả ngắn tối đa ${SUMMARY_MAX} ký tự.`;
    const ready = images.filter((i) => !i.error);
    if (ready.length === 0) e.images = 'Vui lòng thêm ít nhất 1 ảnh.';
    else if (ready.length > IMAGES_MAX) e.images = `Mỗi địa điểm tối đa ${IMAGES_MAX} ảnh.`;
    if (latValue === 'invalid' || lngValue === 'invalid') e.coordinates = 'Vĩ độ / kinh độ phải là số thập phân, ví dụ 21.851.';
    else if ((latValue === null) !== (lngValue === null)) e.coordinates = 'Vui lòng nhập đủ vĩ độ và kinh độ.';
    else if (picked && !inServiceArea(picked.lat, picked.lng)) e.coordinates = 'Tọa độ nằm ngoài vùng phục vụ (tỉnh Yên Bái / Lào Cai).';
    if (admin && coordVerified && !picked) e.coordVerified = 'Cần nhập tọa độ trước khi xác minh.';
    if (phone.trim() && !PHONE.test(phone.replace(/[\s.\-()]/g, ''))) e.phone = 'Số điện thoại không hợp lệ.';
    if (website.trim() && !HTTP_URL.test(website.trim())) e.website = 'Website phải bắt đầu bằng http:// hoặc https://.';
    if (serviceActive) {
      const L = SERVICE_LIMITS;
      if (!svc.group || !groupOptions.some((g) => g.code === svc.group)) e.serviceGroup = 'Vui lòng chọn loại dịch vụ.';
      if (groupKind === 'TRANSPORT') {
        if (svc.vehicleType.trim().length > L.vehicleTypeMax) e.vehicleType = `Loại xe tối đa ${L.vehicleTypeMax} ký tự.`;
        if (svc.group && FIXED_ROUTE_GROUPS.includes(svc.group) && (!svc.routeFrom.trim() || !svc.routeTo.trim()))
          e.route = 'Vui lòng nhập điểm đi và điểm đến của tuyến.';
        if (svc.departureTimes.trim().length > L.departureTimesMax) e.departureTimes = `Giờ chạy tối đa ${L.departureTimesMax} ký tự.`;
        const seats = parseNumber(svc.seats);
        if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > L.seatsMax)) e.seats = `Số chỗ mỗi xe từ 1 đến ${L.seatsMax}.`;
      }
      if (groupKind === 'CULTURE') {
        const size = parseNumber(svc.groupSize);
        if (size !== null && (!Number.isInteger(size) || size < 1 || size > L.groupSizeMax)) e.groupSizeMax = `Số khách mỗi đoàn từ 1 đến ${L.groupSizeMax}.`;
      }
      if (svc.routeFrom.trim().length > L.routeMax || svc.routeTo.trim().length > L.routeMax) e.route = `Điểm đi / điểm đến tối đa ${L.routeMax} ký tự.`;
      const hours = parseNumber(svc.durationHours);
      if (hours !== null) {
        const minutes = Math.round(hours * 60);
        if (Number.isNaN(hours) || minutes < L.durationMinMinutes || minutes > L.durationMaxMinutes)
          e.durationMinutes = 'Thời lượng từ 10 phút đến 7 ngày (168 giờ).';
      }
      if (svc.includes.trim().length > L.includesMax) e.includes = `Mục "Đã bao gồm" tối đa ${L.includesMax} ký tự.`;
      const price = parseNumber(svc.priceFrom.replace(/\./g, ''));
      if (price !== null && (!Number.isInteger(price) || price < 0 || price > L.priceMax)) e.priceFrom = 'Giá phải là số đồng từ 0 đến 100.000.000.';
      if (svc.priceUnit.trim().length > L.priceUnitMax) e.priceUnit = `Đơn vị giá tối đa ${L.priceUnitMax} ký tự.`;
    }
    if (hasHours) {
      days.forEach((d, i) => {
        if (e.openingHours || d.closed) return;
        if (!d.open || !d.close) e.openingHours = `Vui lòng nhập giờ mở và giờ đóng cho ${(DAY_NAMES[i + 1] ?? '').toLowerCase()}.`;
        else if (d.open === d.close) e.openingHours = `Giờ mở và giờ đóng không được trùng nhau (${(DAY_NAMES[i + 1] ?? '').toLowerCase()}).`;
      });
    }
    return e;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || uploading) return;
    const found = validate();
    setErrors(found);
    setFormError('');
    if (Object.values(found).some(Boolean)) return;
    const openingHours: OpeningHourInput[] = hasHours
      ? days.map((d, i) => ({ dayOfWeek: i + 1, closed: d.closed, open: d.closed ? null : d.open, close: d.closed ? null : d.close }))
      : [];
    const input: PlaceInput = {
      name: cleanText(name), category, summary: summary.trim(), description: description.trim(), address: address.trim(),
      latitude: picked?.lat ?? null, longitude: picked?.lng ?? null, phone: phone.trim(), website: website.trim(), openingHours,
      images: images.filter((i) => !i.error).map((i) => (i.mediaId ? { mediaId: i.mediaId } : { imageId: i.imageId, url: i.url })),
      ...(admin ? { coordVerified: picked ? coordVerified && !coordsChanged : false, visible } : {}),
      ...(serviceActive && svc.group ? serviceInput(svc) : {}),
    };
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err);
      if (fieldErrors.length > 0) setErrors(Object.fromEntries(fieldErrors.map((f) => [f.field, f.message])) as Errors);
      else setFormError(getApiErrorMessage(err, 'Không lưu được địa điểm.'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (key: FieldKey) =>
    `w-full rounded-md border bg-white px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 sm:text-sm ${
      errors[key] ? 'border-danger focus:ring-danger/15' : 'border-border focus:border-primary focus:ring-primary/20'
    }`;
  const label = 'mb-1 block text-xs font-semibold text-ink-deep';
  const err = (key: FieldKey) => (errors[key] ? <p id={`explore-${key}-error`} role="alert" className="mt-1 text-xs text-danger">{errors[key]}</p> : null);
  const counter = (value: string, max: number) => {
    const n = cleanText(value).length;
    return <span className={`text-[11px] tabular-nums ${n > max ? 'font-semibold text-danger' : 'text-muted'}`}>{n}/{max}</span>;
  };

  return (
    <form onSubmit={(e) => { void submit(e); }} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {initial?.pendingEdit?.status === 'REJECTED' && initial.pendingEdit.rejectReason && (
          <p className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">Thay đổi gần nhất bị từ chối: {initial.pendingEdit.rejectReason}</p>
        )}

        <div>
          <div className="flex items-baseline justify-between"><label htmlFor="explore-name" className={label}>{serviceMode ? 'Tên dịch vụ' : 'Tên địa điểm'} <span className="text-danger">*</span></label>{counter(name, NAME_MAX)}</div>
          <input id="explore-name" value={name} onChange={(e) => { setName(e.target.value); clear('name'); }} aria-invalid={!!errors.name} className={inputCls('name')} />
          {err('name')}
        </div>

        {!serviceMode && <div>
          <span id="explore-category-label" className={label}>Danh mục <span className="text-danger">*</span></span>
          <div role="radiogroup" aria-labelledby="explore-category-label" className="flex flex-wrap gap-1.5">
            {EXPLORE_CATEGORIES.map((c) => (
              <button key={c.value} type="button" role="radio" aria-checked={category === c.value}
                onClick={() => { setCategory(c.value); clear('category'); }}
                className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-semibold ${category === c.value ? 'border-primary bg-primary text-white' : errors.category ? 'border-danger/60 text-ink' : 'border-border text-ink hover:bg-hover'}`}>
                {c.label}
              </button>
            ))}
          </div>
          {err('category')}
        </div>}

        {admin && !serviceMode && groupOptions.length > 0 && (
          <label className="flex items-start gap-2 rounded-md border border-border bg-canvas/50 px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={svc.on} onChange={(e) => setService({ on: e.target.checked })} />
            <span>
              <span className="font-semibold text-ink-deep">Có thông tin dịch vụ</span>
              <span className="block text-xs text-muted">
                {category === 'LOCAL_SERVICE' ? 'Nhà xe, xe ôm, thuê xe: loại xe, tuyến, giờ chạy, giá — hiện ở trang Di chuyển.' : 'Trải nghiệm bản địa: thời lượng, số khách, ngôn ngữ, giá.'}
              </span>
            </span>
          </label>
        )}

        {serviceActive && (
          <ServiceFields svc={svc} setService={setService} groups={groupOptions} groupKind={groupKind}
            errors={errors} clear={clear} inputCls={inputCls} label={label} err={err} />
        )}

        <div>
          <div className="flex items-baseline justify-between"><label htmlFor="explore-summary" className={label}>Mô tả ngắn <span className="text-danger">*</span></label>{counter(summary, SUMMARY_MAX)}</div>
          <textarea id="explore-summary" rows={3} value={summary} onChange={(e) => { setSummary(e.target.value); clear('summary'); }} aria-invalid={!!errors.summary} className={inputCls('summary')} />
          {err('summary')}
        </div>

        <div>
          <label htmlFor="explore-description" className={label}>Mô tả chi tiết</label>
          <textarea id="explore-description" rows={4} value={description} onChange={(e) => { setDescription(e.target.value); clear('description'); }} className={inputCls('description')} />
          {err('description')}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className={label}>Ảnh <span className="text-danger">*</span> <span className="font-normal text-muted">(1–{IMAGES_MAX} ảnh, JPG / PNG / WebP, mỗi ảnh tối đa 5 MB; ảnh đầu tiên là ảnh bìa)</span></span>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((img, index) => (
              <li key={img.key} className={`relative aspect-square overflow-hidden rounded-md border ${img.error ? 'border-danger' : 'border-border'} bg-canvas`}>
                {(img.url || img.preview) && <img src={img.url ?? img.preview} alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" />}
                {img.uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-5 w-5 animate-spin" /></span>}
                {img.error && <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-1 py-0.5 text-[10px] text-white">{img.error}</span>}
                {index === 0 && !img.error && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 text-[10px] font-bold text-white">Bìa</span>}
                <div className="absolute right-1 top-1 flex gap-1">
                  {index > 0 && !img.error && !img.uploading && (
                    <button type="button" aria-label="Đặt làm ảnh bìa" title="Đặt làm ảnh bìa"
                      onClick={() => setImages((list) => [img, ...list.filter((i) => i.key !== img.key)])}
                      className="flex h-7 w-7 items-center justify-center rounded bg-white/90 text-amber-600"><Star className="h-3.5 w-3.5" /></button>
                  )}
                  <button type="button" aria-label="Xóa ảnh" title="Xóa ảnh" onClick={() => setImages((list) => list.filter((i) => i.key !== img.key))}
                    className="flex h-7 w-7 items-center justify-center rounded bg-white/90 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
            {images.length < IMAGES_MAX && (
              <li>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted hover:bg-hover">
                  <ImagePlus className="h-5 w-5" /> Thêm ảnh
                </button>
              </li>
            )}
          </ul>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          {err('images')}
        </div>

        <div>
          <label htmlFor="explore-address" className={label}>Địa chỉ</label>
          <input id="explore-address" value={address} onChange={(e) => { setAddress(e.target.value); clear('address'); }} className={inputCls('address')} />
          {err('address')}
        </div>

        <div>
          <span className={label}>Tọa độ <span className="font-normal text-muted">(bấm bản đồ / kéo ghim, hoặc nhập số thập phân)</span></span>
          {!mapFailed ? (
            <ExploreMap markers={[]} className="h-56 sm:h-64" onError={() => setMapFailed(true)}
              pick={{ value: picked, center: picked ?? DEFAULT_CENTER, onChange: (v) => { setLat(v.lat.toFixed(6)); setLng(v.lng.toFixed(6)); clear('coordinates'); } }} />
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Không tải được bản đồ, hãy nhập tọa độ.</p>
          )}
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label="Vĩ độ" inputMode="decimal" placeholder="Vĩ độ, vd 21.851" value={lat} onChange={(e) => { setLat(e.target.value); clear('coordinates'); }} className={inputCls('coordinates')} />
            <input aria-label="Kinh độ" inputMode="decimal" placeholder="Kinh độ, vd 104.088" value={lng} onChange={(e) => { setLng(e.target.value); clear('coordinates'); }} className={inputCls('coordinates')} />
            <button type="button" onClick={() => { setLat(''); setLng(''); clear('coordinates'); }} className="rounded-md border border-border px-3 text-xs text-muted hover:bg-hover">Xóa</button>
          </div>
          {err('coordinates')}
          {admin && (
            <div className="mt-2">
              <label className={`flex items-start gap-2 text-sm ${!picked || coordsChanged ? 'text-muted' : 'text-ink'}`}>
                <input type="checkbox" className="mt-1 h-4 w-4" disabled={!picked || coordsChanged}
                  checked={!!picked && !coordsChanged && coordVerified} onChange={(e) => { setCoordVerified(e.target.checked); clear('coordVerified'); }} />
                <span>Tọa độ đã xác minh <span className="block text-xs text-muted">Chỉ địa điểm đã xác minh tọa độ mới vào "Khám phá quanh đây", có khoảng cách và chỉ đường.</span></span>
              </label>
              {coordsChanged && initial?.coordVerified && (
                <p className="mt-1 text-xs text-amber-700">Tọa độ vừa thay đổi nên cờ xác minh sẽ tự tắt — lưu xong hãy kiểm tra và xác minh lại.</p>
              )}
              {err('coordVerified')}
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-deep">
            <input type="checkbox" className="h-4 w-4" checked={hasHours} onChange={(e) => { setHasHours(e.target.checked); clear('openingHours'); }} />
            Có giờ mở cửa
          </label>
          {hasHours && (
            <ul className="mt-2 space-y-1.5">
              {days.map((d, i) => (
                <li key={i} className="grid grid-cols-[84px_auto_1fr] items-center gap-2 text-sm">
                  <span className="text-xs font-semibold">{DAY_NAMES[i + 1]}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={d.closed} onChange={(e) => { const closed = e.target.checked; setDays((rows) => rows.map((r, j) => (j === i ? { ...r, closed } : r))); clear('openingHours'); }} /> Nghỉ
                  </label>
                  {!d.closed ? (
                    <div className="flex items-center gap-1">
                      <input type="time" aria-label={`Giờ mở ${DAY_NAMES[i + 1]}`} value={d.open} onChange={(e) => { const open = e.target.value; setDays((rows) => rows.map((r, j) => (j === i ? { ...r, open } : r))); clear('openingHours'); }} className="min-w-0 flex-1 rounded-md border border-border px-2 py-1 text-sm" />
                      <span aria-hidden>–</span>
                      <input type="time" aria-label={`Giờ đóng ${DAY_NAMES[i + 1]}`} value={d.close} onChange={(e) => { const close = e.target.value; setDays((rows) => rows.map((r, j) => (j === i ? { ...r, close } : r))); clear('openingHours'); }} className="min-w-0 flex-1 rounded-md border border-border px-2 py-1 text-sm" />
                    </div>
                  ) : <span className="text-xs text-muted">Nghỉ cả ngày</span>}
                </li>
              ))}
            </ul>
          )}
          {err('openingHours')}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="explore-phone" className={label}>Số điện thoại</label>
            <input id="explore-phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); clear('phone'); }} className={inputCls('phone')} />
            {err('phone')}
          </div>
          <div>
            <label htmlFor="explore-website" className={label}>Website</label>
            <input id="explore-website" type="url" placeholder="https://" value={website} onChange={(e) => { setWebsite(e.target.value); clear('website'); }} className={inputCls('website')} />
            {err('website')}
          </div>
        </div>

        {admin && (initial == null || initial.approvalStatus === 'APPROVED') && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Hiển thị với khách
          </label>
        )}
        {formError && <p role="alert" className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">{formError}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-md px-4 text-sm font-medium text-muted hover:bg-hover sm:min-h-9 sm:text-xs">Hủy</button>
        <button type="submit" disabled={saving || uploading} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 sm:min-h-9 sm:text-xs">
          {(saving || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {uploading ? 'Đang tải ảnh…' : saving ? 'Đang lưu…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Thông tin dịch vụ gửi lên (ServiceProfileInput) — trường không áp dụng cho loại thì bỏ trống. */
function serviceInput(svc: ServiceState): Pick<PlaceInput, 'priceFrom' | 'priceUnit' | 'service'> {
  const kind = serviceGroupOf(svc.group)?.kind;
  const num = (raw: string) => {
    const n = parseNumber(raw);
    return n === null || Number.isNaN(n) ? null : n;
  };
  const hours = num(svc.durationHours);
  const text = (v: string) => v.trim() || null;
  const service: ServiceProfileInput = {
    serviceGroup: svc.group,
    vehicleType: kind === 'TRANSPORT' ? text(svc.vehicleType) : null,
    routeFrom: text(svc.routeFrom),
    routeTo: kind === 'TRANSPORT' ? text(svc.routeTo) : null,
    departureTimes: kind === 'TRANSPORT' ? text(svc.departureTimes) : null,
    durationMinutes: hours === null ? null : Math.round(hours * 60),
    seats: kind === 'TRANSPORT' ? num(svc.seats) : null,
    groupSizeMax: kind === 'CULTURE' ? num(svc.groupSize) : null,
    languages: kind === 'CULTURE' ? svc.languages : null,
    includes: text(svc.includes),
  };
  const price = num(svc.priceFrom.replace(/\./g, ''));
  return { priceFrom: price, priceUnit: price === null ? null : text(svc.priceUnit), service };
}

/** Khối "Thông tin dịch vụ": nhóm dịch vụ, giá, rồi các ô riêng của nhà xe hoặc trải nghiệm. */
function ServiceFields({ svc, setService, groups, groupKind, errors, clear, inputCls, label, err }: {
  svc: ServiceState;
  setService: (patch: Partial<ServiceState>) => void;
  groups: { code: ServiceGroup; label: string }[];
  groupKind: 'TRANSPORT' | 'CULTURE' | null;
  errors: Errors;
  clear: (key: FieldKey) => void;
  inputCls: (key: FieldKey) => string;
  label: string;
  err: (key: FieldKey) => React.ReactNode;
}) {
  const fixedRoute = svc.group != null && FIXED_ROUTE_GROUPS.includes(svc.group);
  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-canvas/40 p-3 sm:p-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">Thông tin dịch vụ</legend>
      <div>
        <span id="service-group-label" className={label}>Loại dịch vụ <span className="text-danger">*</span></span>
        <div role="radiogroup" aria-labelledby="service-group-label" className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button key={g.code} type="button" role="radio" aria-checked={svc.group === g.code}
              onClick={() => { setService({ group: g.code }); clear('serviceGroup'); }}
              className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-semibold ${svc.group === g.code ? 'border-primary bg-primary text-white' : errors.serviceGroup ? 'border-danger/60 text-ink' : 'border-border bg-white text-ink hover:bg-hover'}`}>
              {g.label}
            </button>
          ))}
        </div>
        {err('serviceGroup')}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <label htmlFor="service-price" className={label}>Giá từ (đồng) <span className="font-normal text-muted">— bỏ trống nếu giá liên hệ</span></label>
          <input id="service-price" inputMode="numeric" placeholder="VD: 280000" value={svc.priceFrom}
            onChange={(e) => { setService({ priceFrom: e.target.value }); clear('priceFrom'); }} className={inputCls('priceFrom')} />
          {err('priceFrom')}
        </div>
        <div>
          <label htmlFor="service-unit" className={label}>Đơn vị</label>
          <input id="service-unit" list="service-unit-options" placeholder="/khách" maxLength={SERVICE_LIMITS.priceUnitMax} value={svc.priceUnit}
            onChange={(e) => { setService({ priceUnit: e.target.value }); clear('priceUnit'); }} className={inputCls('priceUnit')} />
          <datalist id="service-unit-options">{PRICE_UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>
          {err('priceUnit')}
        </div>
      </div>

      {groupKind === 'TRANSPORT' && (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div>
              <label htmlFor="service-vehicle" className={label}>Loại xe</label>
              <input id="service-vehicle" placeholder="VD: Limousine 9 chỗ" maxLength={SERVICE_LIMITS.vehicleTypeMax} value={svc.vehicleType}
                onChange={(e) => { setService({ vehicleType: e.target.value }); clear('vehicleType'); }} className={inputCls('vehicleType')} />
              {err('vehicleType')}
            </div>
            <div>
              <label htmlFor="service-seats" className={label}>Số chỗ mỗi xe</label>
              <input id="service-seats" inputMode="numeric" placeholder="VD: 9" value={svc.seats}
                onChange={(e) => { setService({ seats: e.target.value }); clear('seats'); }} className={inputCls('seats')} />
              {err('seats')}
            </div>
          </div>
          <div>
            <span className={label}>Tuyến {fixedRoute && <span className="text-danger">*</span>}</span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input aria-label="Điểm đi" placeholder="Điểm đi, vd Hà Nội" maxLength={SERVICE_LIMITS.routeMax} value={svc.routeFrom}
                onChange={(e) => { setService({ routeFrom: e.target.value }); clear('route'); }} className={inputCls('route')} />
              <span aria-hidden className="text-muted">→</span>
              <input aria-label="Điểm đến" placeholder="Điểm đến, vd Mù Cang Chải" maxLength={SERVICE_LIMITS.routeMax} value={svc.routeTo}
                onChange={(e) => { setService({ routeTo: e.target.value }); clear('route'); }} className={inputCls('route')} />
            </div>
            {err('route')}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label htmlFor="service-departures" className={label}>Giờ chạy</label>
              <input id="service-departures" placeholder="VD: 6:00, 13:30, 21:00" maxLength={SERVICE_LIMITS.departureTimesMax} value={svc.departureTimes}
                onChange={(e) => { setService({ departureTimes: e.target.value }); clear('departureTimes'); }} className={inputCls('departureTimes')} />
              {err('departureTimes')}
            </div>
            <div>
              <label htmlFor="service-duration" className={label}>Thời gian đi (giờ)</label>
              <input id="service-duration" inputMode="decimal" placeholder="VD: 5,5" value={svc.durationHours}
                onChange={(e) => { setService({ durationHours: e.target.value }); clear('durationMinutes'); }} className={inputCls('durationMinutes')} />
              {err('durationMinutes') ?? <DurationHint hours={svc.durationHours} />}
            </div>
          </div>
        </>
      )}

      {groupKind === 'CULTURE' && (
        <>
          <div>
            <label htmlFor="service-meeting" className={label}>Điểm hẹn</label>
            <input id="service-meeting" placeholder="VD: Nhà văn hóa bản Lìm Mông" maxLength={SERVICE_LIMITS.routeMax} value={svc.routeFrom}
              onChange={(e) => { setService({ routeFrom: e.target.value }); clear('route'); }} className={inputCls('route')} />
            {err('route')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="service-duration" className={label}>Thời lượng mỗi lượt (giờ)</label>
              <input id="service-duration" inputMode="decimal" placeholder="VD: 3 hoặc 1,5" value={svc.durationHours}
                onChange={(e) => { setService({ durationHours: e.target.value }); clear('durationMinutes'); }} className={inputCls('durationMinutes')} />
              {err('durationMinutes') ?? <DurationHint hours={svc.durationHours} />}
            </div>
            <div>
              <label htmlFor="service-group-size" className={label}>Số khách tối đa mỗi đoàn</label>
              <input id="service-group-size" inputMode="numeric" placeholder="VD: 12" value={svc.groupSize}
                onChange={(e) => { setService({ groupSize: e.target.value }); clear('groupSizeMax'); }} className={inputCls('groupSizeMax')} />
              {err('groupSizeMax')}
            </div>
          </div>
          <fieldset>
            <legend className={label}>Ngôn ngữ hướng dẫn</legend>
            <div className="flex flex-wrap gap-1.5">
              {GUIDE_LANGUAGES.map((l) => {
                const checked = svc.languages.includes(l.code);
                return (
                  <label key={l.code} className={`flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-xs font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${checked ? 'border-primary bg-primary-50 text-primary' : 'border-border bg-white text-ink hover:bg-hover'}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => {
                        const next = checked ? svc.languages.filter((c) => c !== l.code) : GUIDE_LANGUAGES.map((o) => o.code).filter((c) => c === l.code || svc.languages.includes(c));
                        setService({ languages: next });
                        clear('languages');
                      }} />
                    {l.label}
                  </label>
                );
              })}
            </div>
            {err('languages')}
          </fieldset>
        </>
      )}

      {groupKind && (
        <div>
          <label htmlFor="service-includes" className={label}>Đã bao gồm <span className="font-normal text-muted">(mỗi dòng một mục)</span></label>
          <textarea id="service-includes" rows={3} maxLength={SERVICE_LIMITS.includesMax}
            placeholder={groupKind === 'TRANSPORT' ? 'Nước uống\nĐón trả tận nơi trong thị trấn' : 'Người hướng dẫn bản địa\nDụng cụ, nguyên liệu'}
            value={svc.includes} onChange={(e) => { setService({ includes: e.target.value }); clear('includes'); }} className={inputCls('includes')} />
          {err('includes')}
        </div>
      )}
    </fieldset>
  );
}

/** "0,67" giờ → "≈ 40 phút": người nhập thấy ngay thời lượng sẽ hiện cho khách. */
function DurationHint({ hours }: { hours: string }) {
  const h = parseNumber(hours);
  const text = h === null || Number.isNaN(h) ? null : minutesText(Math.round(h * 60));
  return text ? <p className="mt-1 text-[11px] text-muted">≈ {text}</p> : null;
}
