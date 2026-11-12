import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BedDouble, CalendarDays, CheckCircle2, ClipboardList, Clock, Eye, EyeOff, History, Image as ImageIcon, Info, LocateFixed, Lock,
  MapPin, Save, ScrollText, Send, Settings2, Sparkles, Unlock, X, type LucideIcon,
} from 'lucide-react';
import type { HomestayOptionsDto, PartnerHomestayDetailDto, UpdateStatusRequest } from '@/types/partner';
import { isSubmittedChange } from '@/services/changeRequestService';
import {
  fetchHomestayOptions,
  fetchPartnerHomestayDetail,
  geocodeAddress,
  homestayError,
  savePartnerHomestayDetail,
  updateHomestayStatus
} from '@/services/partnerHomestayService';
import PartnerServicesPanel from '@/components/partner/PartnerServicesPanel';
import MediaManager from '@/components/partner/MediaManager';
import RoomTypesManager, { FieldError } from '@/components/partner/RoomTypesManager';
import { usePendingChanges } from '@/hooks/usePendingChanges';
import { pendingWhat } from '@/lib/pendingChanges';
import HomestayClosurePanel from '@/components/partner/HomestayClosurePanel';
import HomestayChangeLogPanel from '@/components/partner/HomestayChangeLogPanel';
import ConfirmDialog, { type ConfirmRequest } from '@/components/partner/ConfirmDialog';
import { Alert, Card, Field, LoadingBlock, PageHeader, PendingTag, Pill } from '@/components/partner/PartnerUI';
import {
  addressError, coordinateError, emailError, facebookError, lengthError, nameError, normalizeUrl, phoneError, tiktokError, urlError,
} from '@/lib/fieldValidation';
import { guessRegion, mapsUrl, parseGoogleMapsLink } from '@/lib/mapLink';
import { ui } from '@/lib/partnerUi';

const EMPTY: PartnerHomestayDetailDto = {
  id: 0, code: '', slug: '', name: '', description: '', address: '', regionName: '', regionId: null,
  latitude: null, longitude: null, googleMapLink: '', facebookUrl: '', contactPhone: '', contactEmail: '', reviewVideoUrl: '', accessNote: '',
  coverImageUrl: '', galleryUrls: [], amenities: [], otherAmenities: '', checkInFrom: '', checkOutUntil: '', processingStartTime: '', processingEndTime: '',
  houseRules: '', cancellationPolicy: '', policyName: '', freeCancelCutoffHours: null, refundOnLateCancel: null,
  surchargeNote: '', childrenPolicy: '', petsPolicy: '', viewHighlight: '', suitability: '', visibility: 'DRAFT', operationStatus: 'OPERATING', isReadyToPublish: false,
  cooperativeName: '', providerCode: '',
};

type TabId = 'info' | 'media' | 'rooms' | 'address' | 'amenities' | 'rules' | 'services' | 'operation';
type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;
const FORM_TABS: TabId[] = ['info', 'address', 'amenities', 'rules'];

/** Mục còn thiếu (câu chữ từ backend missingForPublish) → tab cần mở để bổ sung. */
const tabOfMissing = (item: string): TabId =>
  /phòng/.test(item) && !/giờ/.test(item) ? 'rooms' : /ảnh/.test(item) ? 'media' : /địa chỉ|vị trí/.test(item) ? 'address' : /giờ|chính sách/.test(item) ? 'rules' : 'info';

export default function PartnerHomestayEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const invalidId = id == null || !Number.isSafeInteger(Number(id)) || Number(id) <= 0;
  const placeId = Number(id);
  const [form, setForm] = useState<PartnerHomestayDetailDto>(EMPTY);
  const [initialForm, setInitialForm] = useState<PartnerHomestayDetailDto | null>(null);
  const [options, setOptions] = useState<HomestayOptionsDto>({ regions: [], amenities: [] });
  const [loading, setLoading] = useState(!invalidId);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice>(() => {
    const state: unknown = location.state;
    return typeof state === 'object' && state !== null && 'notice' in state && typeof state.notice === 'string' ? { tone: 'info', text: state.notice } : null;
  });
  const [saving, setSaving] = useState(false);
  // Thay đổi đang chờ quản trị viên duyệt (xuất bản, chuyển NCC, loại phòng, giá): tải lại sau mỗi lần lưu.
  const pendingAll = usePendingChanges(`${saving}|${notice?.text ?? ''}`);
  const [retry, setRetry] = useState(0);
  const [geo, setGeo] = useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: '', ok: true });
  const [logKey, setLogKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [preview, setPreview] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [triedSave, setTriedSave] = useState(false);

  useEffect(() => {
    if (invalidId) return;
    let active = true;
    // Tuần tự, không gửi song song tới backend; danh mục (khu vực, tiện ích) lấy từ cache của tab sau lần đầu.
    fetchPartnerHomestayDetail(placeId)
      .then(async (detail) => [await fetchHomestayOptions(), detail] as const)
      .then(([catalog, detail]) => { if (active) { setOptions(catalog); setForm(detail); setInitialForm(detail); setLoadError(''); } })
      .catch((error: unknown) => { if (active) setLoadError(homestayError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [placeId, retry, invalidId]);

  /**
   * Ảnh / loại phòng đổi ở tab khác: tải lại các số liệu do máy chủ tính (còn thiếu gì, giá tham khảo...) mà KHÔNG
   * ghi đè những gì chủ nhà đang sửa dở trên form.
   */
  const refreshFacts = useCallback(() => {
    if (invalidId) return;
    fetchPartnerHomestayDetail(placeId).then((fresh) => {
      const facts = {
        missingForPublish: fresh.missingForPublish, isReadyToPublish: fresh.isReadyToPublish, pendingPublish: fresh.pendingPublish,
        roomTypesCount: fresh.roomTypesCount, priceRefMin: fresh.priceRefMin, priceRefMax: fresh.priceRefMax, priceUnitNote: fresh.priceUnitNote,
        coverImageUrl: fresh.coverImageUrl, galleryUrls: fresh.galleryUrls, alertNote: fresh.alertNote, visibility: fresh.visibility,
      };
      setForm(prev => ({ ...prev, ...facts }));
      setInitialForm(prev => (prev ? { ...prev, ...facts } : prev));
    }).catch(() => { /* số liệu phụ — lỗi mạng thì giữ số cũ */ });
  }, [placeId, invalidId]);

  function set<K extends keyof PartnerHomestayDetailDto>(key: K, value: PartnerHomestayDetailDto[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }
  const touch = (key: string) => setTouched(t => (t[key] ? t : { ...t, [key]: true }));

  function openTab(tab: TabId) {
    setActiveTab(tab);
    if (notice?.tone !== 'info') setNotice(null);
  }

  async function locate(auto: boolean) {
    const address = form.address.trim();
    if (address.length < 5 || geo.busy || (auto && form.latitude != null && form.longitude != null)) return;
    const region = options.regions.find(r => r.id === form.regionId)?.name;
    setGeo({ busy: true, text: 'Đang tìm vị trí...', ok: true });
    try {
      const found = await geocodeAddress(region && !address.toLowerCase().includes(region.toLowerCase()) ? `${address}, ${region}` : address);
      setForm(prev => ({ ...prev, latitude: Number(found.latitude.toFixed(6)), longitude: Number(found.longitude.toFixed(6)) }));
      setGeo({ busy: false, text: `Đã lấy vị trí theo: ${found.displayName ?? address}. Hãy kiểm tra lại trên bản đồ.`, ok: true });
    } catch (error: unknown) {
      setGeo({ busy: false, text: homestayError(error), ok: false });
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setGeo({ busy: false, text: 'Thiết bị không hỗ trợ lấy vị trí.', ok: false }); return; }
    setGeo({ busy: true, text: 'Đang lấy vị trí hiện tại...', ok: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({ ...prev, latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }));
        setGeo({ busy: false, text: 'Đã lấy vị trí hiện tại của bạn.', ok: true });
      },
      () => setGeo({ busy: false, text: 'Không lấy được vị trí — hãy cho phép trình duyệt truy cập vị trí rồi thử lại.', ok: false }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function onMapLink(url: string) {
    set('googleMapLink', url);
    if (!url.trim()) return;
    const parsed = parseGoogleMapsLink(url);
    if (parsed.latitude != null && parsed.longitude != null) {
      setForm(prev => ({ ...prev, googleMapLink: url, latitude: parsed.latitude, longitude: parsed.longitude, address: prev.address || parsed.placeName || '' }));
      setGeo({ busy: false, text: 'Đã lấy vị trí từ link Google Maps.', ok: true });
    } else if (parsed.shortLink) {
      setGeo({ busy: false, text: 'Link rút gọn chưa đọc được vị trí. Mở link rồi sao chép link đầy đủ, hoặc bấm “Dùng vị trí hiện tại”.', ok: false });
    }
  }

  // ---------- kiểm tra ngay khi gõ ----------
  const errors: Record<string, string | null> = {
    name: nameError(form.name),
    description: lengthError(form.description, 10000),
    viewHighlight: lengthError(form.viewHighlight, 10000),
    suitability: lengthError(form.suitability, 10000),
    contactPhone: phoneError(form.contactPhone),
    contactEmail: emailError(form.contactEmail),
    reviewVideoUrl: tiktokError(form.reviewVideoUrl),
    facebookUrl: facebookError(form.facebookUrl),
    googleMapLink: urlError(form.googleMapLink, 2000),
    address: addressError(form.address, false),
    coordinates: coordinateError(form.latitude, form.longitude),
    accessNote: lengthError(form.accessNote, 10000),
    otherAmenities: lengthError(form.otherAmenities, 2000),
    houseRules: lengthError(form.houseRules, 10000),
  };
  const TAB_OF_ERROR: Record<string, TabId> = {
    name: 'info', description: 'info', viewHighlight: 'info', suitability: 'info', contactPhone: 'info', contactEmail: 'info', reviewVideoUrl: 'info', facebookUrl: 'info',
    googleMapLink: 'address', address: 'address', coordinates: 'address', accessNote: 'address', otherAmenities: 'amenities',
    houseRules: 'rules',
  };
  const errorTabs = new Set(Object.entries(errors).filter(([, e]) => e).map(([k]) => TAB_OF_ERROR[k]));
  const show = (key: string) => triedSave || !!touched[key];
  const bad = (key: string) => show(key) && !!errors[key];
  const inputCls = (key: string) => `${ui.input} ${bad(key) ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`;
  const areaCls = (key: string) => `${ui.textarea} ${bad(key) ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}`;

  function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (saving || loading || loadError) return;
    setTriedSave(true);
    const firstBad = Object.entries(errors).find(([, e]) => e);
    if (firstBad) {
      setNotice({ tone: 'error', text: 'Một số ô chưa đúng — xem các ô đánh dấu đỏ.' });
      setActiveTab(TAB_OF_ERROR[firstBad[0]] ?? 'info');
      return;
    }
    void persist();
  }

  async function persist() {
    setSaving(true);
    setNotice(null);
    try {
      const payload = { ...form, facebookUrl: normalizeUrl(form.facebookUrl), reviewVideoUrl: normalizeUrl(form.reviewVideoUrl), googleMapLink: (form.googleMapLink ?? '').trim() };
      const saved = await savePartnerHomestayDetail(placeId, payload);
      if (isSubmittedChange(saved)) setNotice({ tone: 'info', text: saved.message });
      else {
        setForm(saved); setInitialForm(saved); setTriedSave(false); setTouched({});
        setNotice({ tone: 'success', text: 'Đã lưu thông tin Homestay' });
      }
    } catch (error: unknown) {
      const message = homestayError(error);
      setNotice({ tone: 'error', text: /403|quyền/i.test(message) ? 'Không có quyền cập nhật Homestay này' : message });
    }
    finally { setSaving(false); }
  }

  /** UC-NCC-02 nút Hủy: quay lại danh sách, không lưu thay đổi chưa gửi. */
  function cancel() {
    if (!isDirty) { navigate('/partner/homestays'); return; }
    setConfirm({ title: 'Bỏ các thay đổi chưa lưu?', confirmLabel: 'Bỏ thay đổi', tone: 'danger',
      body: <>Các thông tin bạn vừa sửa sẽ không được lưu. Thông tin hiện hành của Homestay giữ nguyên.</>, onConfirm: () => navigate('/partner/homestays') });
  }

  async function changeStatus(request: UpdateStatusRequest, done: string) {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await updateHomestayStatus(placeId, request);
      if (isSubmittedChange(result)) {
        setNotice({ tone: 'info', text: result.message });
        setForm(prev => ({ ...prev, pendingPublish: true, alertNote: 'Homestay đang chờ duyệt' }));
      } else {
        setForm(prev => ({ ...prev, visibility: result.visibility, operationStatus: result.operationStatus, isReadyToPublish: result.isReadyToPublish, alertNote: result.alertNote }));
        setNotice({ tone: 'success', text: done });
      }
    } catch (error: unknown) { setNotice({ tone: 'error', text: homestayError(error) }); }
    finally { setSaving(false); }
  }

  /** Chỉ xác nhận, không bắt nhập lý do (chủ nhà không phải gõ gì) — backend tự ghi lý do mặc định cho đơn bị hủy. */
  function confirmClose() {
    setConfirm({ title: 'Tạm đóng cửa Homestay?', confirmLabel: 'Tạm đóng cửa', tone: 'danger',
      body: <>Khách không đặt mới được. Các đơn sắp tới sẽ tự hủy và khách nhận thông báo. Bạn mở lại được bất cứ lúc nào.</>,
      onConfirm: () => void changeStatus({ operationStatus: 'TEMP_CLOSED' }, 'Đã tạm đóng cửa Homestay.') });
  }

  function submitForReview() {
    if (isDirty) { setNotice({ tone: 'info', text: 'Bạn có thay đổi chưa lưu — bấm Lưu trước rồi Gửi duyệt.' }); return; }
    setConfirm({ title: 'Gửi Homestay cho quản trị viên duyệt?', confirmLabel: 'Gửi duyệt', tone: 'coral',
      body: <>Sau khi được duyệt, Homestay hiện lên cho khách tìm và đặt phòng. Trong lúc chờ bạn vẫn sửa được thông tin.</>,
      onConfirm: () => void changeStatus({ visibility: 'PUBLISHED' }, 'Đã gửi duyệt.') });
  }

  const amenities = [...new Set([...options.amenities.map(a => a.name), ...form.amenities])];
  const published = form.visibility === 'PUBLISHED';
  const operating = form.operationStatus === 'OPERATING';
  const isDirty = initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) : false;
  const missing = form.missingForPublish ?? [];
  const pendingPublish = !!form.pendingPublish;
  const otherPending = pendingAll.ofPlace(placeId).filter((r) => r.operation !== 'PUBLISH');
  const missingTabs = new Set(missing.map(tabOfMissing));
  const isFormTab = FORM_TABS.includes(activeTab);

  const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'info', label: 'Thông tin', icon: Info },
    { id: 'media', label: 'Ảnh', icon: ImageIcon },
    { id: 'rooms', label: 'Phòng & giá', icon: BedDouble },
    { id: 'address', label: 'Vị trí', icon: MapPin },
    { id: 'amenities', label: 'Tiện nghi', icon: Sparkles },
    { id: 'rules', label: 'Giờ & chính sách', icon: ScrollText },
    { id: 'services', label: 'Dịch vụ', icon: ClipboardList },
    { id: 'operation', label: 'Vận hành', icon: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        breadcrumbs={[
          { label: 'Bảng điều khiển', to: '/partner/overview' },
          { label: 'Cơ sở lưu trú', to: '/partner/homestays' },
          { label: form.name || 'Homestay' },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{form.name || 'Homestay'}</span>
            {published ? <Pill tone="primary"><Eye className="h-3.5 w-3.5" />Đang hiển thị</Pill>
              : pendingPublish ? <PendingTag size="md" detail={['Xuất bản Homestay']} />
              : <Pill tone="neutral"><EyeOff className="h-3.5 w-3.5" />Bản nháp</Pill>}
            {otherPending.length > 0 && <PendingTag size="md" count={otherPending.length} detail={otherPending.map(pendingWhat)} />}
            {!operating && <Pill tone="danger"><Lock className="h-3.5 w-3.5" />Tạm đóng cửa</Pill>}
          </span>
        }
        description="Cập nhật thông tin hiển thị với khách, ảnh, phòng & giá và thiết lập vận hành."
        actions={!invalidId && !loading && !loadError ? <>
          <Link to={`/partner?homestay=${placeId}`} className={`${ui.btnOutline} h-9 px-3 text-xs`}><CalendarDays className="h-3.5 w-3.5" />Lịch phòng</Link>
          {!published && !pendingPublish && (
            <button type="button" onClick={submitForReview} disabled={saving || !form.isReadyToPublish} className={`${ui.btnCoral} h-9 px-3 text-xs`}
              title={form.isReadyToPublish ? 'Gửi quản trị viên duyệt để công khai' : 'Còn thiếu thông tin — xem danh sách bên dưới'}>
              <Send className="h-3.5 w-3.5" />Gửi duyệt
            </button>
          )}
        </> : undefined} />

      {invalidId ? <Alert tone="error">Mã Homestay không hợp lệ.</Alert>
        : loading ? <LoadingBlock label="Đang tải thông tin..." rows={3} />
        : loadError ? (
          <Alert tone="error" action={<button type="button" className={ui.btnGhost} onClick={() => { setLoading(true); setLoadError(''); setRetry(n => n + 1); }}>Thử lại</button>}>{loadError}</Alert>
        ) : (
          <>
            {otherPending.length > 0 && (
              <div role="status" className="flex flex-col gap-1.5 rounded-md border-2 border-sun bg-sun-light/60 px-3.5 py-3 text-sm text-ink-deep">
                <p className="flex items-center gap-1.5 font-black text-amber-800"><Clock className="h-4 w-4" />Đang chờ quản trị viên duyệt — dữ liệu hiện hành chưa đổi cho tới khi được duyệt</p>
                <ul className="flex flex-col gap-0.5 pl-6">{otherPending.map((r) => <li key={r.id} className="list-disc">{pendingWhat(r)}</li>)}</ul>
              </div>
            )}
            {!published && (pendingPublish
              ? <Alert tone="info">Homestay đang chờ duyệt. Quản trị viên duyệt xong thì Homestay được công khai và nhận đặt phòng. Bạn vẫn sửa được thông tin trong lúc chờ.</Alert>
              : missing.length > 0
                ? (
                  <Alert tone="error">
                    <p className="font-semibold">Còn thiếu để gửi duyệt:</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {missing.map(item => (
                        <button key={item} type="button" onClick={() => openTab(tabOfMissing(item))}
                          className="rounded-sm border border-danger/30 bg-surface px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/5">{item} →</button>
                      ))}
                    </div>
                  </Alert>
                )
                : (
                  <Alert tone="success" action={<button type="button" className={`${ui.btnCoral} h-9 px-3 text-xs`} disabled={saving} onClick={submitForReview}><Send className="h-3.5 w-3.5" />Gửi duyệt</button>}>
                    Hồ sơ đã đủ — bấm “Gửi duyệt” để quản trị viên xem và công khai Homestay.
                  </Alert>
                ))}

            <div className="flex flex-col gap-6">
              <nav role="tablist" aria-label="Các mục thông tin" className="-mx-1 flex gap-1 overflow-x-auto border-b border-primary/10 px-1 scrollbar-hide">
                {tabs.map(({ id: tabId, label, icon: Icon }) => {
                  const active = activeTab === tabId;
                  const warn = errorTabs.has(tabId) && triedSave;
                  const needs = missingTabs.has(tabId) && !published;
                  return (
                    <button key={tabId} type="button" role="tab" aria-selected={active} onClick={() => openTab(tabId)}
                      className={`relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ${active ? 'text-primary' : warn ? 'text-danger' : 'text-muted hover:text-ink'}`}>
                      <Icon className="h-4 w-4" />
                      <span className="whitespace-nowrap">{label}</span>
                      {(warn || needs) && <span className="h-2 w-2 rounded-full bg-danger" aria-label="Cần bổ sung" />}
                      <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-sm bg-primary transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  );
                })}
              </nav>

              <div className="flex min-w-0 flex-1 flex-col gap-5">
                {!isFormTab && notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

                {isFormTab && (
                  <form id="homestay-edit-form" noValidate onSubmit={save} className="flex flex-col gap-5">
                    <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
                      {activeTab === 'info' && (
                        <Card title="Thông tin chung" icon={Info} description="Tên và mô tả là thứ khách đọc đầu tiên. Viết ngắn gọn, nêu điểm đặc biệt của nơi ở.">
                          <Field label="Tên Homestay" required>
                            <input className={inputCls('name')} maxLength={255} value={form.name} onChange={e => set('name', e.target.value)} onBlur={() => touch('name')} placeholder="VD: Nhà sàn Bản Lác" />
                            <FieldError show={show('name')} error={errors.name} />
                          </Field>
                          <Field label="Mô tả tổng quan" hint={`${form.description?.length ?? 0}/10000 ký tự`}>
                            <textarea className={areaCls('description')} rows={6} maxLength={10000} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Không gian, cảnh quan, trải nghiệm bản địa, món ăn đặc sản..." />
                            <FieldError show error={errors.description} />
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Số điện thoại liên hệ" required>
                              <input className={inputCls('contactPhone')} type="tel" inputMode="tel" maxLength={32} value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} onBlur={() => touch('contactPhone')} placeholder="VD: 0912 345 678" />
                              <FieldError show={show('contactPhone')} error={errors.contactPhone} />
                            </Field>
                            <Field label="Email liên hệ">
                              <input className={inputCls('contactEmail')} type="email" inputMode="email" maxLength={254} value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)} onBlur={() => touch('contactEmail')} placeholder="VD: tenhomestay@gmail.com" />
                              <FieldError show={show('contactEmail')} error={errors.contactEmail} />
                            </Field>
                          </div>
                          <details className="rounded-md border border-primary/10 bg-canvas/50 p-3" open={!!(form.reviewVideoUrl || form.facebookUrl)}>
                            <summary className="cursor-pointer select-none text-sm font-semibold text-ink-deep">Thông tin thêm <span className="font-normal text-muted">(không bắt buộc)</span></summary>
                            <div className="mt-4 flex flex-col gap-4">
                              <Field label="Link video review TikTok" hint="Link video đầy đủ .../video/số được nhúng xem trực tiếp; link kênh hoặc link rút gọn hiện nút mở TikTok.">
                                <input className={inputCls('reviewVideoUrl')} type="url" inputMode="url" maxLength={500} placeholder="https://www.tiktok.com/@tenkenh/video/7123456789012345678"
                                  value={form.reviewVideoUrl ?? ''} onChange={e => set('reviewVideoUrl', e.target.value)} onBlur={() => { touch('reviewVideoUrl'); set('reviewVideoUrl', normalizeUrl(form.reviewVideoUrl)); }} />
                                <FieldError show={show('reviewVideoUrl')} error={errors.reviewVideoUrl} />
                              </Field>
                              <Field label="Link Fanpage Facebook">
                                <input className={inputCls('facebookUrl')} type="url" inputMode="url" maxLength={500} placeholder="https://www.facebook.com/ten-trang"
                                  value={form.facebookUrl ?? ''} onChange={e => set('facebookUrl', e.target.value)} onBlur={() => { touch('facebookUrl'); set('facebookUrl', normalizeUrl(form.facebookUrl)); }} />
                                <FieldError show={show('facebookUrl')} error={errors.facebookUrl} />
                              </Field>
                            </div>
                          </details>
                        </Card>
                      )}

                      {activeTab === 'address' && (
                        <Card title="Địa chỉ và vị trí" icon={MapPin} description="Nhập địa chỉ — hệ thống tự tìm vị trí trên bản đồ. Đang ở Homestay thì bấm “Dùng vị trí hiện tại” cho chính xác nhất.">
                          <Field label="Địa chỉ" required>
                            <textarea className={areaCls('address')} rows={2} maxLength={500} value={form.address} onChange={e => set('address', e.target.value)}
                              onBlur={() => { touch('address'); if (form.regionId == null) { const region = guessRegion(form.address, options.regions); if (region) set('regionId', region.id); } void locate(true); }}
                              placeholder="Thôn/bản, xã, huyện, tỉnh" />
                            <FieldError show={show('address')} error={errors.address ?? (show('address') && !form.address.trim() ? 'Cần địa chỉ để gửi duyệt' : null)} />
                          </Field>
                          <div className="flex flex-col gap-3 rounded-md border border-primary/10 bg-canvas p-4">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <button type="button" className={ui.btnOutline} onClick={useCurrentLocation} disabled={geo.busy}><LocateFixed className="h-4 w-4" />Dùng vị trí hiện tại</button>
                              <button type="button" disabled={geo.busy || form.address.trim().length < 5} onClick={() => void locate(false)} className={ui.btnOutline}>
                                <MapPin className="h-4 w-4" /> {geo.busy ? 'Đang tìm...' : 'Tìm theo địa chỉ'}
                              </button>
                            </div>
                            {geo.text && <p role="status" className={`text-xs ${geo.ok ? 'text-accent-700' : 'text-danger'}`}>{geo.text}</p>}
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Vĩ độ"><input className={inputCls('coordinates')} type="number" min={-90} max={90} step="any" value={form.latitude ?? ''} onChange={e => set('latitude', e.target.value === '' ? null : Number(e.target.value))} /></Field>
                              <Field label="Kinh độ"><input className={inputCls('coordinates')} type="number" min={-180} max={180} step="any" value={form.longitude ?? ''} onChange={e => set('longitude', e.target.value === '' ? null : Number(e.target.value))} /></Field>
                            </div>
                            <FieldError show error={errors.coordinates} />
                            {form.latitude != null && form.longitude != null && !errors.coordinates && (
                              <a className="w-fit text-sm font-semibold text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={mapsUrl(form.latitude, form.longitude)}>Xem vị trí trên bản đồ</a>
                            )}
                          </div>
                          <Field label="Link Google Maps" hint="Dán link Google Maps để tự lấy vị trí.">
                            <input className={inputCls('googleMapLink')} type="url" inputMode="url" value={form.googleMapLink ?? ''} onChange={e => onMapLink(e.target.value)} onBlur={() => touch('googleMapLink')} placeholder="https://www.google.com/maps/place/..." />
                            <FieldError show error={errors.googleMapLink} />
                          </Field>
                          <Field label="Khu vực">
                            <select className={ui.select} value={form.regionId ?? ''} onChange={e => set('regionId', e.target.value ? Number(e.target.value) : null)}>
                              <option value="">Chưa chọn khu vực</option>
                              {options.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </Field>
                          <Field label="Hướng dẫn đường đi và tiếp cận">
                            <textarea className={areaCls('accessNote')} rows={3} maxLength={10000} value={form.accessNote ?? ''} onChange={e => set('accessNote', e.target.value)} placeholder="Đường vào, chỗ gửi xe, mốc dễ nhận biết..." />
                          </Field>
                        </Card>
                      )}

                      {activeTab === 'amenities' && (
                        <Card title="Tiện nghi và khu vực chung" icon={Sparkles} description="Bấm để chọn hoặc bỏ chọn. Tiện nghi riêng từng phòng khai báo ở tab Phòng & giá.">
                          {amenities.length === 0 ? <p className="text-sm text-muted">Chưa có tiện nghi trong danh mục.</p> : (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {amenities.map(name => {
                                  const on = form.amenities.includes(name);
                                  return (
                                    <button key={name} type="button" aria-pressed={on} onClick={() => set('amenities', on ? form.amenities.filter(a => a !== name) : [...form.amenities, name])}
                                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition-all duration-200 ${on ? 'border-primary bg-primary text-white shadow-[var(--shadow-teal)]' : 'border-border bg-surface text-ink hover:border-primary/50 hover:text-primary'}`}>
                                      {on && <CheckCircle2 className="h-3.5 w-3.5" />}{name}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted">Đã chọn {form.amenities.length}/{amenities.length} tiện nghi.</p>
                            </>
                          )}
                          <Field label="Tiện ích khác" hint="Những thứ không có trong danh sách trên — khách thấy ở mục Tiện ích của trang Homestay.">
                            <textarea className={areaCls('otherAmenities')} rows={3} maxLength={2000} value={form.otherAmenities ?? ''} onChange={e => set('otherAmenities', e.target.value)}
                              placeholder="VD: Cho mượn áo mưa, sạc dự phòng, đón khách tại bến xe Mù Cang Chải" />
                            <FieldError show error={errors.otherAmenities} />
                          </Field>
                        </Card>
                      )}

                      {activeTab === 'rules' && (
                        <>
                          <Card title="Giờ lưu trú và quy định" icon={ScrollText}
                            actions={<button type="button" className={ui.btnGhost} onClick={() => setPreview(true)}><Eye className="h-4 w-4" />Xem trước</button>}>
                            <div className="grid grid-cols-2 gap-4">
                              <Field label="Nhận phòng từ" required><input className={ui.input} type="time" value={form.checkInFrom} onChange={e => set('checkInFrom', e.target.value)} /></Field>
                              <Field label="Trả phòng trước" required><input className={ui.input} type="time" value={form.checkOutUntil} onChange={e => set('checkOutUntil', e.target.value)} /></Field>
                            </div>
                            <Field label="Nội quy chung"><textarea className={areaCls('houseRules')} rows={4} maxLength={10000} value={form.houseRules} onChange={e => set('houseRules', e.target.value)} /></Field>
                            <Field label="Quy định phụ thu"><textarea className={ui.textarea} rows={3} maxLength={10000} value={form.surchargeNote ?? ''} onChange={e => set('surchargeNote', e.target.value)} placeholder="Thêm người, thêm giường, ăn uống..." /></Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Chính sách trẻ em"><textarea className={ui.textarea} rows={2} maxLength={10000} value={form.childrenPolicy ?? ''} onChange={e => set('childrenPolicy', e.target.value)} /></Field>
                              <Field label="Chính sách thú cưng"><textarea className={ui.textarea} rows={2} maxLength={10000} value={form.petsPolicy ?? ''} onChange={e => set('petsPolicy', e.target.value)} /></Field>
                            </div>
                          </Card>
                        </>
                      )}

                      <div className="sticky bottom-20 z-10 -mx-1 flex flex-col gap-3 rounded-lg border border-primary/10 bg-surface/95 px-4 py-3 shadow-[var(--shadow-card-hover)] backdrop-blur sm:flex-row sm:items-center lg:bottom-4">
                        <div className="min-w-0 flex-1">
                          {notice ? <NoticeBar notice={notice} onClose={() => setNotice(null)} />
                            : <p className="text-xs text-muted">{isDirty ? 'Có thay đổi chưa lưu.' : 'Chưa có thay đổi.'}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button type="button" onClick={cancel} disabled={saving} className={ui.btnGhost}>Hủy</button>
                          <button type="submit" disabled={saving || !isDirty} className={ui.btnPrimary}><Save className="h-4 w-4" />{saving ? 'Đang lưu...' : 'Lưu'}</button>
                        </div>
                      </div>
                    </fieldset>
                  </form>
                )}

                {activeTab === 'media' && (
                  <Card title="Ảnh Homestay" icon={ImageIcon} description="Ảnh đại diện hiện ở danh sách tìm kiếm. Nên dùng ảnh ngang, sáng, rõ nét. Ảnh mới chọn được xem trước, bấm “Lưu ảnh” mới lưu.">
                    <MediaManager target={{ placeId }} title="Ảnh Homestay" onChange={(media) => {
                      const cover = media.find(m => m.role === 'COVER')?.url ?? '';
                      const urls = media.map(m => m.url);
                      setForm(prev => ({ ...prev, coverImageUrl: cover, galleryUrls: urls }));
                      setInitialForm(prev => (prev ? { ...prev, coverImageUrl: cover, galleryUrls: urls } : prev));
                      refreshFacts();
                    }} />
                  </Card>
                )}

                {activeTab === 'rooms' && (
                  <RoomTypesManager placeId={placeId} onChanged={refreshFacts}
                    header={() => (
                      <p className="text-sm text-muted">
                        Mỗi loại phòng: số phòng, số khách, giá một đêm. Bấm trạng thái để khóa / mở loại phòng. Số phòng trống và khóa phòng theo ngày xem ở <Link to={`/partner?homestay=${placeId}`} className="font-semibold text-primary underline">Lịch phòng</Link>.
                        {published && ' Thêm loại phòng mới cần quản trị viên duyệt. Sửa phòng và cập nhật ảnh được áp dụng ngay.'}
                      </p>
                    )} />
                )}

                {activeTab === 'services' && <PartnerServicesPanel placeId={placeId} />}

                {activeTab === 'operation' && (
                  <>
                    <Card title="Trạng thái hiển thị và vận hành" icon={Settings2}>
                      {form.alertNote && <Alert tone="info">{form.alertNote}</Alert>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <StatusCard
                          title="Hiển thị trên web"
                          on={published}
                          text={published ? 'Khách có thể tìm thấy và đặt Homestay này.' : pendingPublish ? 'Homestay đang chờ duyệt; chưa nhận Booking.' : form.isReadyToPublish ? 'Hồ sơ đã đủ. Gửi duyệt để quản trị viên xem xét trước khi công khai.' : `Còn thiếu: ${missing.join(', ')}.`}
                          button={published
                            ? <button type="button" disabled={saving} className={ui.btnOutline} onClick={() => void changeStatus({ visibility: 'UNPUBLISHED' }, 'Đã ngừng hiển thị Homestay.')}><EyeOff className="h-4 w-4" />Ngừng hiển thị</button>
                            : <button type="button" disabled={saving || pendingPublish || !form.isReadyToPublish} className={ui.btnCoral} onClick={submitForReview}><Send className="h-4 w-4" />{pendingPublish ? 'Đang chờ duyệt' : 'Gửi duyệt'}</button>} />
                        <StatusCard
                          title="Trạng thái đón khách"
                          on={operating}
                          text={operating ? 'Homestay đang hoạt động và nhận khách bình thường.' : 'Homestay đang tạm đóng cửa, khách không đặt được.'}
                          button={operating
                            ? <button type="button" disabled={saving} className={ui.btnDanger} onClick={confirmClose}><Lock className="h-4 w-4" />Tạm đóng cửa</button>
                            : <button type="button" disabled={saving} className={ui.btnPrimary} onClick={() => void changeStatus({ operationStatus: 'OPERATING' }, 'Homestay đã mở lại.')}><Unlock className="h-4 w-4" />Mở hoạt động</button>} />
                      </div>
                    </Card>

                    <Card title="Lịch phục vụ (đóng/mở dài ngày)" icon={Lock} description="Đóng cả Homestay trong một khoảng ngày, ví dụ sửa chữa hoặc nghỉ lễ.">
                      <HomestayClosurePanel placeId={placeId} onChanged={() => setLogKey(n => n + 1)} />
                    </Card>

                    <Card title="Lịch sử thay đổi giá và lịch phòng" icon={History}>
                      <HomestayChangeLogPanel placeId={placeId} refreshKey={logKey} />
                    </Card>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <PolicyPreview open={preview} onClose={() => setPreview(false)} form={form} />
    </div>
  );
}

/** UC-NCC-05 "Xem trước": chính sách theo cách khách sẽ xem trước khi đặt phòng. */
function PolicyPreview({ open, onClose, form }: { open: boolean; onClose: () => void; form: PartnerHomestayDetailDto }) {
  const hours = form.freeCancelCutoffHours;
  const autoText = hours != null && form.refundOnLateCancel
    ? `${hours === 0 ? 'Khách được hủy miễn phí đến giờ nhận phòng.' : `Khách được hủy miễn phí trước ${hours % 24 === 0 ? `${hours / 24} ngày` : `${hours} giờ`} so với giờ nhận phòng.`}${hours === 0 ? '' : form.refundOnLateCancel === 'FULL_REFUND' ? ' Hủy muộn hơn vẫn được hoàn toàn bộ tiền đã trả.' : ' Hủy muộn hơn không được hoàn tiền đã trả.'}`
    : null;
  const policyText = form.cancellationPolicy?.trim() || autoText;
  const rows: [string, string | null | undefined][] = [
    ['Nhận phòng', form.checkInFrom ? `Từ ${form.checkInFrom}` : null],
    ['Trả phòng', form.checkOutUntil ? `Trước ${form.checkOutUntil}` : null],
    ['Chính sách hủy', policyText ? `${form.policyName ? form.policyName + ': ' : ''}${policyText}` : null],
    ['Trẻ em', form.childrenPolicy],
    ['Thú cưng', form.petsPolicy],
    ['Tiện ích khác', form.otherAmenities],
    ['Phụ thu', form.surchargeNote],
    ['Nội quy', form.houseRules],
  ];
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9999] bg-ink-deep/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[min(85dvh,calc(100dvh-var(--safe-top)-var(--safe-bottom)-2rem))] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-[var(--shadow-lg)]">
          <header className="flex items-center justify-between border-b border-primary/10 px-5 py-4">
            <Dialog.Title className="font-display text-lg font-bold text-ink-deep">Chính sách lưu trú (khách sẽ thấy)</Dialog.Title>
            <Dialog.Close aria-label="Đóng" className={ui.iconBtn}><X className="h-5 w-5" /></Dialog.Close>
          </header>
          <dl className="flex flex-col divide-y divide-border overflow-y-auto px-5 py-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-2.5">
                <dt className="font-semibold text-ink-deep">{k}</dt>
                <dd className={`whitespace-pre-wrap ${v?.trim() ? 'text-ink' : 'italic text-danger'}`}>{v?.trim() || (k === 'Nhận phòng' || k === 'Trả phòng' ? 'Chưa khai báo — bắt buộc để nhận Booking' : 'Chưa khai báo')}</dd>
              </div>
            ))}
          </dl>
          <footer className="border-t border-primary/10 px-5 py-3 text-xs text-muted">Xem trước dựa trên nội dung đang nhập, chưa lưu.</footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NoticeBar({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  return (
    <Alert tone={notice.tone} action={<button type="button" aria-label="Đóng thông báo" className="text-current opacity-60 transition-opacity duration-200 hover:opacity-100" onClick={onClose}><X className="h-4 w-4" /></button>}>
      {notice.text}
    </Alert>
  );
}

function StatusCard({ title, on, text, button }: { title: string; on: boolean; text: string; button: ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-md border p-4 transition-colors duration-200 ${on ? 'border-accent/30 bg-accent-50/50' : 'border-border bg-canvas'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-sm ${on ? 'bg-accent' : 'bg-muted'}`} />
        <h3 className="text-sm font-bold text-ink-deep">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-muted">{text}</p>
      <div className="mt-auto">{button}</div>
    </div>
  );
}

