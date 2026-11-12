import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, MapPin, Plus, Search, Trash2, Utensils, X } from 'lucide-react';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiError';
import { uploadExploreImage } from '@/services/exploreService';
import { comboApi, type ComboScope } from '@/services/portalServicesApi';
import type { ComboFormData, ComboInput, PlaceRef } from '@/types/combo';

/** Giới hạn khớp ComboWriter.java. */
const LIMITS = {
  titleMin: 5, titleMax: 150, summaryMin: 10, summaryMax: 300, descriptionMax: 5000, daysMax: 15, priceMax: 100_000_000,
  priceNoteMax: 255, groupMax: 100, listMax: 2000, stopsMax: 60, stopTitleMin: 2, stopTitleMax: 150, stopNoteMax: 1000,
  restaurantsMax: 10, restaurantNoteMax: 255,
} as const;

interface StopRow {
  key: string;
  dayNo: number;
  startTime: string;
  endTime: string;
  place: PlaceRef | null;
  title: string;
  note: string;
}

interface RestaurantRow {
  key: string;
  place: PlaceRef;
  note: string;
}

type Errors = Record<string, string | undefined>;

let seq = 0;
const nextKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;
const toInt = (raw: string): number | null => {
  const v = raw.trim().replace(/[.\s]/g, '');
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : NaN;
};

function fromInitial(initial: ComboFormData | null, useChanges: boolean) {
  const content = useChanges && initial?.pendingChanges ? initial.pendingChanges : initial?.content ?? null;
  const places = new Map<number, PlaceRef>((initial?.places ?? []).map((p) => [p.id, p]));
  const stops: StopRow[] = (content?.stops ?? []).map((s) => ({
    key: nextKey(), dayNo: s.dayNo, startTime: s.startTime ?? '', endTime: s.endTime ?? '',
    place: s.placeId != null ? places.get(s.placeId) ?? null : null, title: s.title ?? '', note: s.note ?? '',
  }));
  const restaurants: RestaurantRow[] = (content?.restaurants ?? []).flatMap((r) => {
    const place = places.get(r.placeId);
    return place ? [{ key: nextKey(), place, note: r.note ?? '' }] : [];
  });
  return { content, stops, restaurants };
}

/**
 * Form combo dùng chung cho Admin và NCC: thông tin chung, giá "từ" mỗi khách, lịch trình từng ngày (giờ, địa điểm, việc
 * làm), mục đã / không bao gồm (ăn uống luôn không bao gồm) và nhà hàng gợi ý. Kiểm tra trên form như ComboWriter.java rồi
 * hiện lỗi máy chủ dưới đúng ô / đúng điểm dừng.
 */
export default function ComboForm({ scope, initial, editPending = false, submitLabel, onSubmit, onCancel }: {
  scope: ComboScope;
  initial: ComboFormData | null;
  /** Mở bản sửa đang chờ duyệt (NCC) thay cho bản đang hiển thị. */
  editPending?: boolean;
  submitLabel: string;
  onSubmit: (input: ComboInput) => Promise<void>;
  onCancel: () => void;
}) {
  const start = useMemo(() => fromInitial(initial, editPending), [initial, editPending]);
  const c = start.content;
  const [title, setTitle] = useState(c?.title ?? '');
  const [summary, setSummary] = useState(c?.summary ?? '');
  const [description, setDescription] = useState(c?.description ?? '');
  const [days, setDays] = useState(c?.days ?? 2);
  const [nights, setNights] = useState(c?.nights ?? 1);
  const [price, setPrice] = useState(c?.priceFrom != null ? String(Math.round(c.priceFrom)) : '');
  const [priceNote, setPriceNote] = useState(c?.priceNote ?? '');
  const [groupMin, setGroupMin] = useState(c?.groupSizeMin != null ? String(c.groupSizeMin) : '');
  const [groupMax, setGroupMax] = useState(c?.groupSizeMax != null ? String(c.groupSizeMax) : '');
  const [includes, setIncludes] = useState(c?.includes ?? '');
  const [excludes, setExcludes] = useState(c?.excludes ?? '');
  const [cover, setCover] = useState<{ url: string; uploading?: boolean; error?: string } | null>(c?.coverImageUrl ? { url: c.coverImageUrl } : null);
  const [stops, setStops] = useState<StopRow[]>(() => (start.stops.length ? start.stops : [
    { key: nextKey(), dayNo: 1, startTime: '', endTime: '', place: null, title: '', note: '' },
  ]));
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>(start.restaurants);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: undefined }));

  /** Thứ tự gửi đi = theo ngày, trong ngày theo thứ tự trên form (máy chủ báo lỗi "stops.N" theo thứ tự này). */
  const ordered = useMemo(() => [...stops].sort((a, b) => a.dayNo - b.dayNo), [stops]);
  const stopError = (row: StopRow) => errors[`stop:${row.key}`];

  const uploadCover = (file: File | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCover({ url: preview, uploading: true });
    clear('coverImageUrl');
    uploadExploreImage(file, scope)
      .then((res) => setCover({ url: res.url }))
      .catch((err: unknown) => setCover({ url: preview, error: err instanceof Error && err.message ? err.message : getApiErrorMessage(err, 'Không tải được ảnh.') }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    const t = title.trim().replace(/\s+/g, ' ');
    if (!t) e.title = 'Vui lòng nhập tên combo.';
    else if (t.length < LIMITS.titleMin || t.length > LIMITS.titleMax) e.title = `Tên combo từ ${LIMITS.titleMin} đến ${LIMITS.titleMax} ký tự.`;
    const s = summary.trim().replace(/\s+/g, ' ');
    if (!s) e.summary = 'Vui lòng nhập mô tả ngắn.';
    else if (s.length < LIMITS.summaryMin || s.length > LIMITS.summaryMax) e.summary = `Mô tả ngắn từ ${LIMITS.summaryMin} đến ${LIMITS.summaryMax} ký tự.`;
    if (description.trim().length > LIMITS.descriptionMax) e.description = `Giới thiệu tối đa ${LIMITS.descriptionMax} ký tự.`;
    if (nights > days) e.nights = 'Số đêm không được nhiều hơn số ngày.';
    const p = toInt(price);
    if (p === null) e.priceFrom = 'Vui lòng nhập giá combo mỗi khách.';
    else if (Number.isNaN(p) || p > LIMITS.priceMax) e.priceFrom = 'Giá là số đồng từ 0 đến 100.000.000.';
    if (priceNote.trim().length > LIMITS.priceNoteMax) e.priceNote = `Ghi chú giá tối đa ${LIMITS.priceNoteMax} ký tự.`;
    const gMin = toInt(groupMin);
    const gMax = toInt(groupMax);
    if ([gMin, gMax].some((g) => g !== null && (Number.isNaN(g) || g < 1 || g > LIMITS.groupMax))) e.groupSize = `Số khách mỗi đoàn từ 1 đến ${LIMITS.groupMax}.`;
    else if (gMin !== null && gMax !== null && gMin > gMax) e.groupSize = 'Số khách tối thiểu không được lớn hơn tối đa.';
    if (includes.trim().length > LIMITS.listMax) e.includes = `Mục "Đã bao gồm" tối đa ${LIMITS.listMax} ký tự.`;
    if (excludes.trim().length > LIMITS.listMax) e.excludes = `Mục "Không bao gồm" tối đa ${LIMITS.listMax} ký tự.`;
    if (cover?.uploading) e.coverImageUrl = 'Ảnh bìa đang tải lên, vui lòng đợi.';
    else if (cover?.error) e.coverImageUrl = 'Ảnh bìa tải lên lỗi — xóa hoặc chọn ảnh khác.';

    if (stops.length === 0) e.stops = 'Vui lòng thêm lịch trình (ít nhất một điểm mỗi ngày).';
    else if (stops.length > LIMITS.stopsMax) e.stops = `Lịch trình tối đa ${LIMITS.stopsMax} điểm.`;
    for (const row of stops) {
      const key = `stop:${row.key}`;
      const stopTitle = row.title.trim() || row.place?.name || '';
      if (row.dayNo > days) e[key] = `Ngày ${row.dayNo} vượt quá số ngày của combo — đổi ngày hoặc xóa điểm này.`;
      else if (stopTitle.length < LIMITS.stopTitleMin || stopTitle.length > LIMITS.stopTitleMax) e[key] = 'Chọn địa điểm hoặc ghi việc làm (2–150 ký tự).';
      else if (row.note.trim().length > LIMITS.stopNoteMax) e[key] = `Ghi chú tối đa ${LIMITS.stopNoteMax} ký tự.`;
      else if (row.startTime && row.endTime && row.endTime <= row.startTime) e[key] = 'Giờ kết thúc phải sau giờ bắt đầu.';
    }
    if (!e.stops) {
      const missing = Array.from({ length: days }, (_, i) => i + 1).filter((d) => !stops.some((s) => s.dayNo === d));
      if (missing.length) e.stops = `Ngày ${missing.join(', ')} chưa có điểm nào trong lịch trình.`;
    }
    if (restaurants.length > LIMITS.restaurantsMax) e.restaurants = `Tối đa ${LIMITS.restaurantsMax} nhà hàng gợi ý.`;
    for (const r of restaurants) if (r.note.trim().length > LIMITS.restaurantNoteMax) e[`restaurant:${r.key}`] = `Ghi chú tối đa ${LIMITS.restaurantNoteMax} ký tự.`;
    return e;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const found = validate();
    setErrors(found);
    setFormError('');
    if (Object.values(found).some(Boolean)) {
      setFormError('Vui lòng sửa các ô được đánh dấu.');
      return;
    }
    const input: ComboInput = {
      title: title.trim(), summary: summary.trim(), description: description.trim() || null, days, nights,
      priceFrom: toInt(price), priceNote: priceNote.trim() || null,
      groupSizeMin: toInt(groupMin), groupSizeMax: toInt(groupMax),
      includes: includes.trim() || null, excludes: excludes.trim() || null, coverImageUrl: cover?.url ?? null,
      stops: ordered.map((s) => ({
        dayNo: s.dayNo, startTime: s.startTime || null, endTime: s.endTime || null, placeId: s.place?.id ?? null,
        title: s.title.trim() || s.place?.name || '', note: s.note.trim() || null,
      })),
      restaurants: restaurants.map((r) => ({ placeId: r.place.id, note: r.note.trim() || null })),
    };
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err);
      if (fieldErrors.length > 0) {
        const mapped: Errors = {};
        for (const f of fieldErrors) {
          const stop = /^stops\.(\d+)$/.exec(f.field);
          const restaurant = /^restaurants\.(\d+)$/.exec(f.field);
          if (stop) {
            const row = ordered[Number(stop[1])];
            mapped[row ? `stop:${row.key}` : 'stops'] = f.message;
          } else if (restaurant) {
            const row = restaurants[Number(restaurant[1])];
            mapped[row ? `restaurant:${row.key}` : 'restaurants'] = f.message;
          } else mapped[f.field] = f.message;
        }
        setErrors(mapped);
        setFormError('Vui lòng sửa các ô được đánh dấu.');
      } else setFormError(getApiErrorMessage(err, 'Không lưu được combo.'));
    } finally {
      setSaving(false);
    }
  };

  const updateStop = (key: string, patch: Partial<StopRow>) => {
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    clear(`stop:${key}`);
    clear('stops');
  };
  const moveStop = (row: StopRow, dir: -1 | 1) => setStops((list) => {
    const sameDay = list.filter((s) => s.dayNo === row.dayNo);
    const i = sameDay.findIndex((s) => s.key === row.key);
    const swap = sameDay[i + dir];
    if (!swap) return list;
    const a = list.findIndex((s) => s.key === row.key);
    const b = list.findIndex((s) => s.key === swap.key);
    const next = [...list];
    [next[a], next[b]] = [next[b] as StopRow, next[a] as StopRow];
    return next;
  });

  const inputCls = (key: string) =>
    `w-full rounded-md border bg-white px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 sm:text-sm ${
      errors[key] ? 'border-danger focus:ring-danger/15' : 'border-border focus:border-primary focus:ring-primary/20'
    }`;
  const label = 'mb-1 block text-xs font-semibold text-ink-deep';
  const err = (key: string) => (errors[key] ? <p role="alert" className="mt-1 text-xs text-danger">{errors[key]}</p> : null);
  const dayNumbers = Array.from({ length: Math.max(days, ...stops.map((s) => s.dayNo)) }, (_, i) => i + 1);

  return (
    <form onSubmit={(e) => { void submit(e); }} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {initial?.status === 'REJECTED' && initial.rejectReason && (
          <p className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">Combo bị từ chối: {initial.rejectReason}</p>
        )}
        {initial?.pendingRejectReason && (
          <p className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">Thay đổi gần nhất bị từ chối: {initial.pendingRejectReason}</p>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Thông tin chung</h3>
          <div>
            <label htmlFor="combo-title" className={label}>Tên combo <span className="text-danger">*</span></label>
            <input id="combo-title" value={title} maxLength={LIMITS.titleMax + 20} placeholder="VD: Mù Cang Chải mùa lúa chín 3 ngày 2 đêm"
              onChange={(e) => { setTitle(e.target.value); clear('title'); }} className={inputCls('title')} />
            {err('title')}
          </div>
          <div>
            <label htmlFor="combo-summary" className={label}>Mô tả ngắn <span className="text-danger">*</span></label>
            <textarea id="combo-summary" rows={2} value={summary} maxLength={LIMITS.summaryMax + 20} placeholder="Một câu cho thẻ combo: đi đâu, xem gì, hợp với ai."
              onChange={(e) => { setSummary(e.target.value); clear('summary'); }} className={inputCls('summary')} />
            {err('summary')}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="combo-days" className={label}>Số ngày <span className="text-danger">*</span></label>
              <select id="combo-days" value={days} onChange={(e) => { setDays(Number(e.target.value)); clear('days'); clear('stops'); }} className={inputCls('days')}>
                {Array.from({ length: LIMITS.daysMax }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d} ngày</option>)}
              </select>
              {err('days')}
            </div>
            <div>
              <label htmlFor="combo-nights" className={label}>Số đêm <span className="text-danger">*</span></label>
              <select id="combo-nights" value={nights} onChange={(e) => { setNights(Number(e.target.value)); clear('nights'); }} className={inputCls('nights')}>
                {Array.from({ length: LIMITS.daysMax + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n} đêm</option>)}
              </select>
              {err('nights')}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="combo-price" className={label}>Giá từ (đồng / khách) <span className="text-danger">*</span></label>
              <input id="combo-price" inputMode="numeric" value={price} placeholder="VD: 1890000"
                onChange={(e) => { setPrice(e.target.value); clear('priceFrom'); }} className={inputCls('priceFrom')} />
              {err('priceFrom')}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div>
              <label htmlFor="combo-price-note" className={label}>Ghi chú giá</label>
              <input id="combo-price-note" value={priceNote} maxLength={LIMITS.priceNoteMax + 20} placeholder="VD: Giá cho nhóm từ 2 khách, trẻ em dưới 6 tuổi miễn phí"
                onChange={(e) => { setPriceNote(e.target.value); clear('priceNote'); }} className={inputCls('priceNote')} />
              {err('priceNote')}
            </div>
            <div>
              <span className={label}>Số khách mỗi đoàn</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                <input aria-label="Số khách tối thiểu" inputMode="numeric" placeholder="Từ" value={groupMin} onChange={(e) => { setGroupMin(e.target.value); clear('groupSize'); }} className={inputCls('groupSize')} />
                <span aria-hidden className="text-muted">–</span>
                <input aria-label="Số khách tối đa" inputMode="numeric" placeholder="Đến" value={groupMax} onChange={(e) => { setGroupMax(e.target.value); clear('groupSize'); }} className={inputCls('groupSize')} />
              </div>
              {err('groupSize')}
            </div>
          </div>
          <div>
            <span className={label}>Ảnh bìa <span className="font-normal text-muted">— bỏ trống thì dùng ảnh của điểm đầu tiên trong lịch trình</span></span>
            {cover ? (
              <div className={`relative h-36 w-full max-w-xs overflow-hidden rounded-md border ${cover.error ? 'border-danger' : 'border-border'} bg-canvas`}>
                <img src={cover.url} alt="Ảnh bìa combo" className="h-full w-full object-cover" />
                {cover.uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-5 w-5 animate-spin" /></span>}
                {cover.error && <span className="absolute inset-x-0 bottom-0 bg-danger/90 px-2 py-1 text-[11px] text-white">{cover.error}</span>}
                <button type="button" aria-label="Xóa ảnh bìa" onClick={() => { setCover(null); clear('coverImageUrl'); }}
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded bg-white/90 text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex h-24 w-full max-w-xs flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted hover:bg-hover">
                <ImagePlus className="h-5 w-5" /> Chọn ảnh bìa
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ''; }} />
            {err('coverImageUrl')}
          </div>
          <div>
            <label htmlFor="combo-description" className={label}>Giới thiệu</label>
            <textarea id="combo-description" rows={4} value={description} placeholder="Điểm đặc biệt của chuyến đi, mùa đẹp nhất, lưu ý sức khỏe…"
              onChange={(e) => { setDescription(e.target.value); clear('description'); }} className={inputCls('description')} />
            {err('description')}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Lịch trình</h3>
            <p className="text-xs text-muted">Mỗi ngày ít nhất một điểm. Giờ không bắt buộc; điểm không gắn địa điểm thì ghi việc làm (vd "Di chuyển về Hà Nội").</p>
          </div>
          {err('stops')}
          {dayNumbers.map((day) => {
            const rows = stops.filter((s) => s.dayNo === day);
            return (
              <div key={day} className={`rounded-lg border ${day > days ? 'border-danger/50' : 'border-border'} bg-canvas/40`}>
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-sm font-bold text-ink-deep">Ngày {day}{day > days && <span className="ml-2 text-xs font-semibold text-danger">ngoài số ngày</span>}</span>
                  <button type="button" onClick={() => { setStops((list) => [...list, { key: nextKey(), dayNo: day, startTime: '', endTime: '', place: null, title: '', note: '' }]); clear('stops'); }}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary-50">
                    <Plus className="h-3.5 w-3.5" /> Thêm điểm
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted">Chưa có điểm nào.</p>
                ) : (
                  <ol className="divide-y divide-border">
                    {rows.map((row, index) => (
                      <li key={row.key} className="space-y-2 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{index + 1}</span>
                          <input type="time" aria-label="Giờ bắt đầu" value={row.startTime} onChange={(e) => updateStop(row.key, { startTime: e.target.value })}
                            className="w-[108px] rounded-md border border-border bg-white px-2 py-1.5 text-sm" />
                          <span aria-hidden className="text-muted">–</span>
                          <input type="time" aria-label="Giờ kết thúc" value={row.endTime} onChange={(e) => updateStop(row.key, { endTime: e.target.value })}
                            className="w-[108px] rounded-md border border-border bg-white px-2 py-1.5 text-sm" />
                          <select aria-label="Ngày" value={row.dayNo} onChange={(e) => updateStop(row.key, { dayNo: Number(e.target.value) })}
                            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm">
                            {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Ngày {d}</option>)}
                            {row.dayNo > days && <option value={row.dayNo}>Ngày {row.dayNo}</option>}
                          </select>
                          <div className="ml-auto flex items-center gap-1">
                            <button type="button" aria-label="Lên trên" disabled={index === 0} onClick={() => moveStop(row, -1)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" aria-label="Xuống dưới" disabled={index === rows.length - 1} onClick={() => moveStop(row, 1)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                            <button type="button" aria-label="Xóa điểm" onClick={() => { setStops((list) => list.filter((s) => s.key !== row.key)); clear(`stop:${row.key}`); }} className="flex h-8 w-8 items-center justify-center rounded-md text-danger hover:bg-danger/5"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                        {row.place ? (
                          <div className="flex items-center gap-2 rounded-md border border-border bg-white p-2">
                            {row.place.imageUrl ? <img src={row.place.imageUrl} alt="" className="h-9 w-12 shrink-0 rounded object-cover" /> : <MapPin className="h-4 w-4 shrink-0 text-primary" />}
                            <div className="min-w-0 flex-1 text-xs">
                              <p className="truncate font-semibold text-ink-deep">{row.place.name}</p>
                              <p className="text-muted">{row.place.label}{!row.place.available && ' · đang ẩn với khách'}</p>
                            </div>
                            <button type="button" aria-label="Bỏ địa điểm" onClick={() => updateStop(row.key, { place: null })} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <PlacePicker scope={scope} placeholder="Tìm địa điểm (điểm tham quan, homestay, nhà xe…)"
                            onPick={(place) => updateStop(row.key, { place, title: row.title || '' })} />
                        )}
                        <input aria-label="Việc làm" value={row.title} maxLength={LIMITS.stopTitleMax + 20}
                          placeholder={row.place ? `Việc làm (bỏ trống = "${row.place.name}")` : 'Việc làm, vd "Săn mây bình minh"'}
                          onChange={(e) => updateStop(row.key, { title: e.target.value })}
                          className={inputCls(`stop:${row.key}`)} />
                        <textarea aria-label="Ghi chú" rows={1} value={row.note} placeholder="Ghi chú (không bắt buộc)"
                          onChange={(e) => updateStop(row.key, { note: e.target.value })}
                          className="w-full rounded-md border border-border bg-white px-3 py-2 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                        {stopError(row) && <p role="alert" className="text-xs text-danger">{stopError(row)}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="combo-includes" className={label}>Đã bao gồm <span className="font-normal text-muted">(mỗi dòng một mục)</span></label>
            <textarea id="combo-includes" rows={4} value={includes} placeholder={'Xe đưa đón theo lịch trình\nHomestay 2 đêm\nVé tham quan'}
              onChange={(e) => { setIncludes(e.target.value); clear('includes'); }} className={inputCls('includes')} />
            {err('includes')}
          </div>
          <div>
            <label htmlFor="combo-excludes" className={label}>Không bao gồm <span className="font-normal text-muted">(mỗi dòng một mục)</span></label>
            <textarea id="combo-excludes" rows={4} value={excludes} placeholder={'Chi phí cá nhân\nĐồ uống ngoài chương trình'}
              onChange={(e) => { setExcludes(e.target.value); clear('excludes'); }} className={inputCls('excludes')} />
            <p className="mt-1 text-[11px] text-muted">Ăn uống luôn không bao gồm — trang combo ghi rõ và gợi ý nhà hàng cho khách.</p>
            {err('excludes')}
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Utensils className="h-3.5 w-3.5" /> Nhà hàng gợi ý</h3>
            <p className="text-xs text-muted">
              Chọn tối đa {LIMITS.restaurantsMax} nhà hàng bạn muốn giới thiệu. Trang combo tự gợi ý thêm nhà hàng được khách đánh giá
              tốt nhất trong 15 km quanh lộ trình.
            </p>
          </div>
          {restaurants.length > 0 && (
            <ul className="space-y-2">
              {restaurants.map((r) => (
                <li key={r.key} className="rounded-md border border-border bg-white p-2">
                  <div className="flex items-center gap-2">
                    {r.place.imageUrl ? <img src={r.place.imageUrl} alt="" className="h-9 w-12 shrink-0 rounded object-cover" /> : <Utensils className="h-4 w-4 shrink-0 text-primary" />}
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-deep">{r.place.name}</p>
                    <button type="button" aria-label="Bỏ nhà hàng" onClick={() => setRestaurants((list) => list.filter((x) => x.key !== r.key))}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-danger hover:bg-danger/5"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <input aria-label={`Ghi chú cho ${r.place.name}`} value={r.note} placeholder="Ghi chú, vd: món lẩu cá hồi ngon"
                    onChange={(e) => { const note = e.target.value; setRestaurants((list) => list.map((x) => (x.key === r.key ? { ...x, note } : x))); clear(`restaurant:${r.key}`); }}
                    className={`mt-2 ${inputCls(`restaurant:${r.key}`)}`} />
                  {err(`restaurant:${r.key}`)}
                </li>
              ))}
            </ul>
          )}
          {restaurants.length < LIMITS.restaurantsMax && (
            <PlacePicker scope={scope} kind="RESTAURANT" placeholder="Tìm nhà hàng để thêm"
              exclude={restaurants.map((r) => r.place.id)}
              onPick={(place) => { setRestaurants((list) => [...list, { key: nextKey(), place, note: '' }]); clear('restaurants'); }} />
          )}
          {err('restaurants')}
        </section>

        {formError && <p role="alert" className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">{formError}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-md px-4 text-sm font-medium text-muted hover:bg-hover sm:min-h-9 sm:text-xs">Hủy</button>
        <button type="submit" disabled={saving || Boolean(cover?.uploading)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 sm:min-h-9 sm:text-xs">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Đang lưu…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Ô tìm địa điểm khách đang xem được (gõ tên, chọn trong danh sách). */
function PlacePicker({ scope, kind, placeholder, exclude = [], onPick }: {
  scope: ComboScope;
  kind?: string;
  placeholder: string;
  exclude?: number[];
  onPick: (place: PlaceRef) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<PlaceRef[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      comboApi(scope).placeOptions(keyword.trim(), kind)
        .then((list) => { if (alive) setResults(list); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [keyword, kind, open, scope]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const shown = (results ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input value={keyword} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setKeyword(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        aria-label={placeholder} aria-expanded={open}
        className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
      {open && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-white py-1 shadow-[var(--shadow-lg)]">
          {loading && results === null && <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…</li>}
          {results !== null && shown.length === 0 && !loading && <li className="px-3 py-2 text-xs text-muted">Không tìm thấy địa điểm phù hợp.</li>}
          {shown.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => { onPick(place); setKeyword(''); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover">
                {place.imageUrl ? <img src={place.imageUrl} alt="" className="h-8 w-10 shrink-0 rounded object-cover" /> : <MapPin className="h-4 w-4 shrink-0 text-primary" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-deep">{place.name}</span>
                  <span className="block truncate text-[11px] text-muted">{[place.label, place.address].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
