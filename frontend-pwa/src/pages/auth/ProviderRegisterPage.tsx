import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2, Pencil, Search } from 'lucide-react';
import RegisterShell from '@/components/provider/RegisterShell';
import ProviderTypePicker from '@/components/provider/ProviderTypePicker';
import {
  EXPERIENCE_TYPES, GUIDE_LANGUAGES, PROPERTY_TYPES, VEHICLE_TYPES, codeLabel, providerServiceBySlug, providerServiceByType,
  type CodeOption,
} from '@/components/layout/providerServices';
import { providerApplicationService } from '@/services/providerApplicationService';
import { homestayError } from '@/services/partnerHomestayService';
import { getApiFieldErrors } from '@/lib/apiError';
import type {
  ProviderApplicationDetails, ProviderApplicationStatusResult, ProviderRegisterInput, ProviderRegisterResult, ProviderServiceType,
} from '@/types/partner';

const input =
  'h-11 w-full rounded-lg border border-border bg-white px-3.5 text-base font-normal text-ink-deep placeholder:text-slate-400 transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-slate-300 sm:text-sm';
const blank: Omit<ProviderRegisterInput, 'serviceType'> = { businessName: '', contactName: '', contactPhone: '', contactEmail: '', password: '', address: '', businessLicenseNo: '', description: '' };

/** Lời giới thiệu và gợi ý nhập theo loại hình đang chọn (ví dụ minh họa, không phải dữ liệu thật). */
const COPY: Record<ProviderServiceType, {
  title: string; subtitle: string; namePlaceholder: string; addressLabel: string; addressPlaceholder: string;
  descriptionLabel: string; descriptionPlaceholder: string; detailsTitle: string; afterApproval: string;
}> = {
  HOMESTAY: {
    title: 'Đăng ký Homestay',
    subtitle: 'Dành cho chủ homestay, hợp tác xã và cơ sở lưu trú muốn đón khách qua nền tảng.',
    namePlaceholder: 'VD: A Chu Homestay Y Tý',
    addressLabel: 'Địa chỉ cơ sở',
    addressPlaceholder: 'Thôn Mò Phú Chải, Xã Y Tý, Bát Xát...',
    descriptionLabel: 'Giới thiệu cơ sở (kinh nghiệm đón khách, điểm đặc biệt...)',
    descriptionPlaceholder: 'Nhà gỗ truyền thống, view ruộng bậc thang, có bếp chung...',
    detailsTitle: 'Thông tin cơ sở lưu trú',
    afterApproval: 'Sau khi được duyệt, bạn đăng homestay, loại phòng, giá và lịch phòng trong cổng đối tác.',
  },
  EXPERIENCE: {
    title: 'Đăng ký Trải nghiệm',
    subtitle: 'Dành cho người tổ chức tour bản làng, trekking, lớp làm nghề, trải nghiệm ẩm thực và văn hóa địa phương.',
    namePlaceholder: 'VD: Tour bản Lìm Mông',
    addressLabel: 'Địa chỉ / điểm hẹn',
    addressPlaceholder: 'Bản Lìm Mông, xã Cao Phạ, Mù Cang Chải...',
    descriptionLabel: 'Giới thiệu trải nghiệm (hoạt động chính, điều khách nhận được...)',
    descriptionPlaceholder: 'Đi bộ qua ruộng bậc thang, học thêu thổ cẩm cùng người Mông, ăn trưa tại nhà dân...',
    detailsTitle: 'Thông tin trải nghiệm',
    afterApproval: 'Sau khi được duyệt, bạn đăng từng trải nghiệm (thời lượng, giá, ngôn ngữ) và combo trong cổng đối tác.',
  },
  TRANSPORT: {
    title: 'Đăng ký Nhà xe',
    subtitle: 'Dành cho nhà xe khách, xe đưa đón, xe ghép và dịch vụ cho thuê xe máy tại địa phương.',
    namePlaceholder: 'VD: Nhà xe Tú Lệ Limousine',
    addressLabel: 'Địa chỉ nhà xe / điểm đón',
    addressPlaceholder: 'Thị trấn Mù Cang Chải, gần bến xe...',
    descriptionLabel: 'Giới thiệu nhà xe (chất lượng xe, dịch vụ đi kèm...)',
    descriptionPlaceholder: 'Xe đời mới, đón trả tận nơi trong phố cổ, có chỗ để xe máy...',
    detailsTitle: 'Thông tin nhà xe',
    afterApproval: 'Sau khi được duyệt, bạn đăng các tuyến xe, giờ chạy, giá vé và combo trong cổng đối tác.',
  },
};
const inputInvalid = '!border-rose-400 !ring-2 !ring-rose-200';
/** Khách hay gõ "0912 345 678": bỏ khoảng trắng, chấm, gạch, ngoặc (máy chủ chỉ nhận chữ số và +84). */
const normalizePhone = (value: string) => value.trim().replace(/[\s.()-]/g, '');
/** Các ô được server kiểm tra trùng (tên khớp RegisterInput bên backend). */
type DuplicateField = 'contactPhone' | 'contactEmail';
const DUPLICATE_FIELDS: readonly DuplicateField[] = ['contactPhone', 'contactEmail'];
const STATUS_TONE = {
  PENDING: 'border-amber-200 bg-amber-50/80 text-amber-900',
  APPROVED: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
  REJECTED: 'border-rose-200 bg-rose-50/80 text-rose-800',
} as const;

// ------------------------------------------------------------------ câu hỏi riêng từng loại hình

interface DetailsForm {
  propertyType: string; roomCount: string; maxGuests: string;
  experienceTypes: string[]; durationHours: string; groupSizeMax: string; languages: string[]; guideLicenseNo: string;
  vehicleTypes: string[]; fleetSize: string; routes: string; transportLicenseNo: string;
}
const blankDetails: DetailsForm = {
  propertyType: '', roomCount: '', maxGuests: '',
  experienceTypes: [], durationHours: '', groupSizeMax: '', languages: [], guideLicenseNo: '',
  vehicleTypes: [], fleetSize: '', routes: '', transportLicenseNo: '',
};
type DetailErrors = Partial<Record<keyof DetailsForm, string>>;

const toNumber = (value: string) => (value.trim() === '' ? NaN : Number(value.trim().replace(',', '.')));
const intError = (value: string, min: number, max: number, label: string) => {
  const n = toNumber(value);
  if (!Number.isInteger(n)) return `${label} phải là số nguyên từ ${min} đến ${max}.`;
  return n < min || n > max ? `${label} phải từ ${min} đến ${max}.` : undefined;
};

/** Cùng quy tắc với ProviderApplicationDetails.java — báo lỗi ngay dưới từng ô trước khi gửi. */
function detailErrors(type: ProviderServiceType, d: DetailsForm): DetailErrors {
  const e: DetailErrors = {};
  if (type === 'HOMESTAY') {
    if (!d.propertyType) e.propertyType = 'Vui lòng chọn loại nhà.';
    e.roomCount = intError(d.roomCount, 1, 100, 'Số phòng');
    e.maxGuests = intError(d.maxGuests, 1, 500, 'Số khách tối đa');
  } else if (type === 'EXPERIENCE') {
    if (d.experienceTypes.length === 0) e.experienceTypes = 'Vui lòng chọn ít nhất một loại trải nghiệm.';
    const hours = toNumber(d.durationHours);
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 120) e.durationHours = 'Thời lượng mỗi lượt phải từ 0,5 đến 120 giờ.';
    else if (!Number.isInteger(hours * 2)) e.durationHours = 'Thời lượng tính theo nửa giờ (vd 1,5 giờ).';
    e.groupSizeMax = intError(d.groupSizeMax, 1, 200, 'Số khách tối đa mỗi đoàn');
    if (d.guideLicenseNo.trim().length > 64) e.guideLicenseNo = 'Số thẻ hướng dẫn viên tối đa 64 ký tự.';
  } else {
    if (d.vehicleTypes.length === 0) e.vehicleTypes = 'Vui lòng chọn ít nhất một loại xe.';
    e.fleetSize = intError(d.fleetSize, 1, 500, 'Số xe');
    const routes = d.routes.trim();
    if (routes.length < 3 || routes.length > 500) e.routes = 'Tuyến chạy chính cần từ 3 đến 500 ký tự.';
    if (d.transportLicenseNo.trim().length > 64) e.transportLicenseNo = 'Số giấy phép tối đa 64 ký tự.';
  }
  for (const key of Object.keys(e) as (keyof DetailsForm)[]) if (!e[key]) delete e[key];
  return e;
}

/** Chỉ gửi các khóa của loại hình đang chọn (máy chủ bỏ qua khóa lạ, nhưng gửi gọn cho dễ đọc nhật ký). */
function detailsPayload(type: ProviderServiceType, d: DetailsForm): ProviderApplicationDetails {
  if (type === 'HOMESTAY') return { propertyType: d.propertyType, roomCount: toNumber(d.roomCount), maxGuests: toNumber(d.maxGuests) };
  if (type === 'EXPERIENCE') {
    const out: ProviderApplicationDetails = {
      experienceTypes: d.experienceTypes, durationHours: toNumber(d.durationHours), groupSizeMax: toNumber(d.groupSizeMax),
    };
    if (d.languages.length) out.languages = d.languages;
    if (d.guideLicenseNo.trim()) out.guideLicenseNo = d.guideLicenseNo.trim();
    return out;
  }
  const out: ProviderApplicationDetails = { vehicleTypes: d.vehicleTypes, fleetSize: toNumber(d.fleetSize), routes: d.routes.trim() };
  if (d.transportLicenseNo.trim()) out.transportLicenseNo = d.transportLicenseNo.trim();
  return out;
}

/** Dòng tóm tắt câu trả lời riêng ở bước "Xem lại hồ sơ". */
function detailRows(type: ProviderServiceType, d: DetailsForm): [string, string][] {
  const list = (options: CodeOption[], codes: string[]) => codes.map((c) => codeLabel(options, c)).join(', ');
  if (type === 'HOMESTAY') {
    return [['Loại nhà', codeLabel(PROPERTY_TYPES, d.propertyType)], ['Số phòng', d.roomCount], ['Số khách tối đa', d.maxGuests]];
  }
  if (type === 'EXPERIENCE') {
    return [
      ['Loại trải nghiệm', list(EXPERIENCE_TYPES, d.experienceTypes)],
      ['Thời lượng mỗi lượt', `${d.durationHours.replace('.', ',')} giờ`],
      ['Khách tối đa mỗi đoàn', d.groupSizeMax],
      ['Ngôn ngữ hướng dẫn', d.languages.length ? list(GUIDE_LANGUAGES, d.languages) : '—'],
      ['Số thẻ hướng dẫn viên', d.guideLicenseNo.trim() || '—'],
    ];
  }
  return [
    ['Loại xe', list(VEHICLE_TYPES, d.vehicleTypes)],
    ['Số xe', d.fleetSize],
    ['Tuyến chạy chính', d.routes.trim()],
    ['Giấy phép kinh doanh vận tải', d.transportLicenseNo.trim() || '—'],
  ];
}

/** Bước của luồng đăng ký (chỉ số trong REGISTER_STEPS; bước 0 = chọn loại hình). */
type Step = 1 | 2 | 3;
type ContactErrors = Partial<Record<'contactName' | 'contactPhone' | 'contactEmail' | 'password' | 'confirm', string>>;
type BusinessErrors = Partial<Record<'businessName' | 'address', string>>;

/**
 * UC-NCC-01: chọn loại hình → người đại diện & đăng nhập → thông tin cơ sở (câu hỏi riêng từng loại) → xem lại & gửi; hồ sơ
 * chờ Admin thẩm định. Có tra cứu trạng thái hồ sơ. Màu và cột giới thiệu đổi theo loại hình (RegisterShell).
 */
export default function ProviderRegisterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<'register' | 'status'>('register');
  // Mở từ hộp "Bạn muốn cung cấp gì?" (?loai=homestay | trai-nghiem | nha-xe): vào thẳng mẫu của loại đó; không có thì hỏi chọn.
  const type = providerServiceBySlug(searchParams.get('loai'))?.type ?? null;
  const [pickerValue, setPickerValue] = useState<ProviderServiceType | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState(blank);
  const [details, setDetails] = useState<DetailsForm>(blankDetails);
  const [confirm, setConfirm] = useState('');
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});
  const [businessErrors, setBusinessErrors] = useState<BusinessErrors>({});
  const [showDetailErrors, setShowDetailErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProviderRegisterResult | null>(null);
  // Lỗi trùng do server báo theo từng ô, kèm giá trị đã gửi: sửa ô đó thì lỗi tự mất.
  const [duplicates, setDuplicates] = useState<Partial<Record<DuplicateField, { value: string; message: string }>>>({});
  const duplicateError = (field: DuplicateField) => {
    const dup = duplicates[field];
    return dup && dup.value === form[field].trim() ? dup.message : undefined;
  };
  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setDetail = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => setDetails((d) => ({ ...d, [key]: value }));
  const go = (next: Step) => { setStep(next); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const chooseType = (next: ProviderServiceType) => {
    setSearchParams((params) => {
      const copy = new URLSearchParams(params);
      copy.set('loai', providerServiceByType(next).slug);
      return copy;
    });
    setShowDetailErrors(false);
    go(1);
  };
  const changeType = () => {
    setPickerValue(type);
    setSearchParams((p) => { const c = new URLSearchParams(p); c.delete('loai'); return c; });
  };

  const footer = (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>Đã được duyệt? <Link to="/portal/login" className="font-bold text-primary hover:underline">Đăng nhập cổng đối tác</Link></span>
      <span aria-hidden>•</span>
      <button type="button" onClick={() => { setMode(mode === 'status' ? 'register' : 'status'); setError(''); }} className="font-bold text-primary hover:underline cursor-pointer">
        {mode === 'status' ? 'Đăng ký mới' : 'Xem trạng thái hồ sơ'}
      </button>
    </span>
  );

  if (mode === 'status') {
    return (
      <RegisterShell type={type} step={null} title="Xem trạng thái hồ sơ" subtitle="Nhập mã hồ sơ và số điện thoại đã dùng khi đăng ký." footer={footer}>
        <StatusLookup initialId={result?.applicationId} initialPhone={result ? normalizePhone(form.contactPhone) : ''} />
      </RegisterShell>
    );
  }

  if (result && type) {
    const service = providerServiceByType(type);
    return (
      <RegisterShell type={type} step={null} title="Đã gửi hồ sơ" subtitle="Cảm ơn bạn đã đăng ký trở thành đối tác." footer={footer}>
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={service.image} alt="" aria-hidden width={88} height={88} className="h-[88px] w-[88px] object-contain" />
          <p className="text-lg font-bold text-ink-deep">Đã tiếp nhận hồ sơ đăng ký {service.label}</p>
          <p className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-900">Mã hồ sơ: #{result.applicationId} · Đang chờ xét duyệt</p>
          <p className="max-w-md text-sm text-muted">{result.message}</p>
          <p className="max-w-md text-xs text-muted">Hãy lưu lại mã hồ sơ để tra cứu trạng thái. Tài khoản được mở quyền quản lý sau khi quản trị viên duyệt.</p>
          <button type="button" onClick={() => setMode('status')} className="mt-2 h-11 rounded-lg bg-primary px-6 text-sm font-bold text-white hover:bg-primary-600 cursor-pointer">
            Xem trạng thái hồ sơ
          </button>
        </div>
      </RegisterShell>
    );
  }

  // Bước 0: chưa chọn loại hình — cùng ba thẻ như hộp chọn trên trang chủ.
  if (!type) {
    return (
      <RegisterShell type={null} step={0} title="Bạn muốn cung cấp gì?" subtitle="Mỗi loại hình có mẫu đăng ký riêng. Hồ sơ được quản trị viên duyệt trước khi bạn bắt đầu nhận khách." footer={footer}>
        <div className="flex flex-col gap-6">
          <ProviderTypePicker name="provider-type-page" value={pickerValue} onChange={setPickerValue} onConfirm={chooseType} />
          <div className="flex justify-end border-t border-border pt-5">
            <button type="button" disabled={!pickerValue} onClick={() => pickerValue && chooseType(pickerValue)}
              className="h-12 rounded-lg bg-ink-deep px-8 text-[15px] font-semibold text-white transition-colors hover:bg-ink-deep/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer">
              Tiếp theo
            </button>
          </div>
        </div>
      </RegisterShell>
    );
  }

  const service = providerServiceByType(type);
  const copy = COPY[type];
  const dErrors = detailErrors(type, details);
  const dError = (key: keyof DetailsForm) => (showDetailErrors ? dErrors[key] : undefined);

  const nextFromContact = () => {
    const e: ContactErrors = {};
    if (form.contactName.trim().length < 2) e.contactName = 'Vui lòng nhập họ tên người đại diện.';
    if (!/^(0|\+84)[35789][0-9]{8}$/.test(normalizePhone(form.contactPhone))) e.contactPhone = 'Số điện thoại không đúng định dạng (VD: 0912 345 678).';
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) e.contactEmail = 'Email không đúng định dạng.';
    if (form.password.length < 8) e.password = 'Mật khẩu tối thiểu 8 ký tự.';
    if (form.password !== confirm) e.confirm = 'Mật khẩu nhập lại không khớp.';
    setContactErrors(e);
    if (Object.keys(e).length || DUPLICATE_FIELDS.some((f) => duplicateError(f))) return;
    go(2);
  };

  const nextFromBusiness = () => {
    const e: BusinessErrors = {};
    if (!form.businessName.trim()) e.businessName = type === 'TRANSPORT' ? 'Vui lòng nhập tên nhà xe.' : 'Vui lòng nhập tên cơ sở.';
    if (!form.address.trim()) e.address = 'Vui lòng nhập địa chỉ.';
    setBusinessErrors(e);
    setShowDetailErrors(true);
    if (Object.keys(e).length || Object.keys(dErrors).length) { setError(`Vui lòng hoàn thiện các ô được đánh dấu.`); return; }
    go(3);
  };

  async function submit() {
    if (!type) return;
    setBusy(true); setError('');
    try {
      setResult(await providerApplicationService.register({
        ...form, serviceType: type, contactPhone: normalizePhone(form.contactPhone), contactEmail: form.contactEmail.trim(),
        details: detailsPayload(type, details),
      }));
    } catch (e: unknown) {
      // Trùng số điện thoại / email: quay về bước người đại diện, báo ngay dưới ô bị trùng.
      const found = getApiFieldErrors(e).filter((f): f is { field: DuplicateField; message: string } =>
        (DUPLICATE_FIELDS as readonly string[]).includes(f.field));
      if (found.length) {
        setDuplicates(Object.fromEntries(found.map((f) => [f.field, { value: form[f.field].trim(), message: f.message }])));
        go(1);
      } else {
        setError(homestayError(e));
      }
    } finally { setBusy(false); }
  }

  const typeBar = (
    <div className="mb-6 flex items-center gap-3 rounded-lg bg-primary-50 px-3 py-2.5">
      <img src={service.image} alt="" aria-hidden width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-primary">{service.label}</p>
        <p className="truncate text-xs text-muted">{service.description}</p>
      </div>
      <button type="button" onClick={changeType} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-ink-deep underline underline-offset-2 hover:bg-white cursor-pointer">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Đổi loại hình
      </button>
    </div>
  );

  const actions = (back: (() => void) | null, next: () => void, label: string) => (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
      {back ? (
        <button type="button" onClick={back} disabled={busy} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-ink hover:bg-canvas cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
      ) : <span />}
      <button type="button" onClick={next} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-60 cursor-pointer">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{label}{!busy && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  );

  if (step === 3) {
    const sections: { title: string; edit: Step; rows: [string, string][] }[] = [
      { title: 'Người đại diện', edit: 1, rows: [['Họ tên', form.contactName], ['Số điện thoại', form.contactPhone], ['Email', form.contactEmail || '—']] },
      {
        title: copy.detailsTitle, edit: 2,
        rows: [[type === 'TRANSPORT' ? 'Tên nhà xe' : 'Tên cơ sở', form.businessName], [copy.addressLabel, form.address], ...detailRows(type, details), ['Giới thiệu', form.description || '—']],
      },
    ];
    return (
      <RegisterShell type={type} step={3} title="Xem lại hồ sơ" subtitle="Kiểm tra thông tin trước khi gửi cho quản trị viên thẩm định." footer={footer}>
        {typeBar}
        <div className="space-y-4">
          {sections.map((sec) => (
            <section key={sec.title} className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border bg-canvas/60 px-4 py-2.5">
                <h2 className="text-sm font-bold text-ink-deep">{sec.title}</h2>
                <button type="button" onClick={() => go(sec.edit)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer">
                  <Pencil className="h-3.5 w-3.5" /> Sửa
                </button>
              </div>
              <dl className="divide-y divide-border text-sm">
                {sec.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-1 gap-0.5 px-4 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-3">
                    <dt className="text-xs font-semibold text-muted sm:text-sm">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Quản trị viên sẽ thẩm định hồ sơ. {copy.afterApproval}</span>
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {actions(() => go(2), () => { void submit(); }, busy ? 'Đang gửi…' : 'Gửi đăng ký')}
      </RegisterShell>
    );
  }

  if (step === 2) {
    return (
      <RegisterShell type={type} step={2} title={copy.detailsTitle} subtitle={copy.subtitle} footer={footer}>
        {typeBar}
        <div className="flex flex-col gap-5">
          <Field label={type === 'TRANSPORT' ? 'Tên nhà xe' : 'Tên cơ sở kinh doanh / hợp tác xã'} required error={businessErrors.businessName}>
            <input className={`${input} ${businessErrors.businessName ? inputInvalid : ''}`} maxLength={255} value={form.businessName}
              onChange={(e) => { set('businessName', e.target.value); setBusinessErrors((x) => ({ ...x, businessName: undefined })); }} placeholder={copy.namePlaceholder} />
          </Field>
          <Field label={copy.addressLabel} required error={businessErrors.address}>
            <input className={`${input} ${businessErrors.address ? inputInvalid : ''}`} maxLength={500} value={form.address}
              onChange={(e) => { set('address', e.target.value); setBusinessErrors((x) => ({ ...x, address: undefined })); }} placeholder={copy.addressPlaceholder} />
          </Field>

          {type === 'HOMESTAY' && (
            <>
              <ChipGroup label="Loại nhà" required options={PROPERTY_TYPES} single values={details.propertyType ? [details.propertyType] : []}
                onChange={(v) => setDetail('propertyType', v[0] ?? '')} error={dError('propertyType')} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Số phòng cho thuê" required error={dError('roomCount')}>
                  <input className={`${input} ${dError('roomCount') ? inputInvalid : ''}`} inputMode="numeric" value={details.roomCount} onChange={(e) => setDetail('roomCount', e.target.value)} placeholder="VD: 5" />
                </Field>
                <Field label="Số khách tối đa cùng lúc" required error={dError('maxGuests')}>
                  <input className={`${input} ${dError('maxGuests') ? inputInvalid : ''}`} inputMode="numeric" value={details.maxGuests} onChange={(e) => setDetail('maxGuests', e.target.value)} placeholder="VD: 20" />
                </Field>
              </div>
            </>
          )}

          {type === 'EXPERIENCE' && (
            <>
              <ChipGroup label="Loại trải nghiệm (chọn một hoặc nhiều)" required options={EXPERIENCE_TYPES} values={details.experienceTypes}
                onChange={(v) => setDetail('experienceTypes', v)} error={dError('experienceTypes')} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Thời lượng mỗi lượt (giờ)" required error={dError('durationHours')}>
                  <input className={`${input} ${dError('durationHours') ? inputInvalid : ''}`} inputMode="decimal" value={details.durationHours} onChange={(e) => setDetail('durationHours', e.target.value)} placeholder="VD: 3 hoặc 1,5" />
                </Field>
                <Field label="Số khách tối đa mỗi đoàn" required error={dError('groupSizeMax')}>
                  <input className={`${input} ${dError('groupSizeMax') ? inputInvalid : ''}`} inputMode="numeric" value={details.groupSizeMax} onChange={(e) => setDetail('groupSizeMax', e.target.value)} placeholder="VD: 12" />
                </Field>
              </div>
              <ChipGroup label="Ngôn ngữ hướng dẫn (không bắt buộc)" options={GUIDE_LANGUAGES} values={details.languages}
                onChange={(v) => setDetail('languages', v)} />
              <Field label="Số thẻ hướng dẫn viên (nếu có)" error={dError('guideLicenseNo')}>
                <input className={input} maxLength={64} value={details.guideLicenseNo} onChange={(e) => setDetail('guideLicenseNo', e.target.value)} placeholder="VD: 115123456" />
              </Field>
            </>
          )}

          {type === 'TRANSPORT' && (
            <>
              <ChipGroup label="Loại xe (chọn một hoặc nhiều)" required options={VEHICLE_TYPES} values={details.vehicleTypes}
                onChange={(v) => setDetail('vehicleTypes', v)} error={dError('vehicleTypes')} />
              <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
                <Field label="Số xe" required error={dError('fleetSize')}>
                  <input className={`${input} ${dError('fleetSize') ? inputInvalid : ''}`} inputMode="numeric" value={details.fleetSize} onChange={(e) => setDetail('fleetSize', e.target.value)} placeholder="VD: 6" />
                </Field>
                <Field label="Giấy phép kinh doanh vận tải (nếu có)" error={dError('transportLicenseNo')}>
                  <input className={input} maxLength={64} value={details.transportLicenseNo} onChange={(e) => setDetail('transportLicenseNo', e.target.value)} placeholder="VD: 15/GP-SGTVT" />
                </Field>
              </div>
              <Field label="Tuyến chạy chính" required error={dError('routes')}>
                <textarea className={`${input} h-auto py-2.5 ${dError('routes') ? inputInvalid : ''}`} rows={2} maxLength={500} value={details.routes} onChange={(e) => setDetail('routes', e.target.value)} placeholder="VD: Hà Nội – Mù Cang Chải (hằng ngày); đưa đón Tú Lệ – Khau Phạ" />
              </Field>
            </>
          )}

          <Field label={copy.descriptionLabel}>
            <textarea className={`${input} h-auto py-2.5`} rows={3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={copy.descriptionPlaceholder} />
          </Field>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {actions(() => go(1), nextFromBusiness, 'Xem lại')}
      </RegisterShell>
    );
  }

  return (
    <RegisterShell type={type} step={1} title="Người đại diện" subtitle="Số điện thoại và mật khẩu dưới đây dùng để đăng nhập cổng đối tác sau khi được duyệt." footer={footer}>
      {typeBar}
      <div className="flex flex-col gap-5">
        <Field label="Họ tên người đại diện" required error={contactErrors.contactName}>
          <input className={`${input} ${contactErrors.contactName ? inputInvalid : ''}`} autoComplete="name" maxLength={255} value={form.contactName}
            onChange={(e) => { set('contactName', e.target.value); setContactErrors((x) => ({ ...x, contactName: undefined })); }} placeholder="VD: Triệu Văn Mua" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Số điện thoại đăng nhập" required error={duplicateError('contactPhone') ?? contactErrors.contactPhone}>
            <input className={`${input} ${duplicateError('contactPhone') || contactErrors.contactPhone ? inputInvalid : ''}`} type="tel" inputMode="tel" autoComplete="tel" maxLength={20}
              value={form.contactPhone} onChange={(e) => { set('contactPhone', e.target.value); setContactErrors((x) => ({ ...x, contactPhone: undefined })); }} placeholder="09xx xxx xxx" />
          </Field>
          <Field label="Email (không bắt buộc)" error={duplicateError('contactEmail') ?? contactErrors.contactEmail}>
            <input className={`${input} ${duplicateError('contactEmail') || contactErrors.contactEmail ? inputInvalid : ''}`} type="email" autoComplete="email" maxLength={255}
              value={form.contactEmail} onChange={(e) => { set('contactEmail', e.target.value); setContactErrors((x) => ({ ...x, contactEmail: undefined })); }} placeholder="contact@example.com" />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mật khẩu (tối thiểu 8 ký tự)" required error={contactErrors.password}>
            <input className={`${input} ${contactErrors.password ? inputInvalid : ''}`} type="password" autoComplete="new-password" maxLength={72}
              value={form.password} onChange={(e) => { set('password', e.target.value); setContactErrors((x) => ({ ...x, password: undefined })); }} placeholder="••••••••" />
          </Field>
          <Field label="Nhập lại mật khẩu" required error={contactErrors.confirm}>
            <input className={`${input} ${contactErrors.confirm ? inputInvalid : ''}`} type="password" autoComplete="new-password" maxLength={72}
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setContactErrors((x) => ({ ...x, confirm: undefined })); }} placeholder="••••••••" />
          </Field>
        </div>
      </div>
      {actions(null, nextFromContact, 'Tiếp tục')}
    </RegisterShell>
  );
}

/** Nhóm nút chọn (một hoặc nhiều) — mỗi nút là ô chọn thật để đọc màn hình và bàn phím dùng được. */
function ChipGroup({ label, options, values, onChange, single = false, required = false, error }: {
  label: string; options: CodeOption[]; values: string[]; onChange: (values: string[]) => void;
  single?: boolean; required?: boolean; error?: string;
}) {
  const toggle = (code: string) => {
    if (single) onChange([code]);
    else onChange(values.includes(code) ? values.filter((v) => v !== code) : options.map((o) => o.code).filter((c) => c === code || values.includes(c)));
  };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-2 text-sm font-semibold text-ink-deep">{label}{required && <span className="text-rose-500"> *</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = values.includes(option.code);
          return (
            <label key={option.code}
              className={`flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30 ${
                checked ? 'border-primary bg-primary text-white' : 'border-border bg-white text-ink hover:border-primary/40'
              }`}>
              <input type={single ? 'radio' : 'checkbox'} name={label} className="sr-only" checked={checked} onChange={() => toggle(option.code)} />
              {option.label}
            </label>
          );
        })}
      </div>
      {error && <span role="alert" className="flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}</span>}
    </fieldset>
  );
}

/** UC-NCC-01 "Xem trạng thái": chỉ người biết mã hồ sơ + số điện thoại đăng ký mới xem được. */
function StatusLookup({ initialId, initialPhone }: { initialId?: number; initialPhone: string }) {
  const [applicationId, setApplicationId] = useState(initialId ? String(initialId) : '');
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<ProviderApplicationStatusResult | null>(null);

  async function lookup() {
    setBusy(true); setError(''); setStatus(null);
    try { setStatus(await providerApplicationService.status({ applicationId: Number(applicationId), contactPhone: normalizePhone(phone) })); }
    catch (e: unknown) { setError(homestayError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="flex flex-col gap-5">
        <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
          <Field label="Mã hồ sơ" required><input className={input} required inputMode="numeric" pattern="[0-9]+" value={applicationId} onChange={(e) => setApplicationId(e.target.value)} placeholder="VD: 12" /></Field>
          <Field label="Số điện thoại đăng ký" required><input className={input} required type="tel" pattern="[+0-9() .\-]{8,20}" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" /></Field>
        </fieldset>
        <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50 cursor-pointer">
          <Search className="h-4 w-4" />{busy ? 'Đang tra cứu…' : 'Xem trạng thái'}
        </button>
      </form>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {status && (
        <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${STATUS_TONE[status.status]}`}>
          <p className="flex items-center gap-2 text-base font-bold">
            <img src={providerServiceByType(status.serviceType).image} alt="" aria-hidden width={28} height={28} className="h-7 w-7 object-contain" />
            {status.statusLabel}
          </p>
          <p>Hồ sơ #{status.applicationId} · {status.businessName} · {providerServiceByType(status.serviceType).label}</p>
          <p className="text-xs opacity-80">Gửi lúc {new Date(status.createdAt).toLocaleString('vi-VN')}{status.reviewedAt ? ` · xử lý lúc ${new Date(status.reviewedAt).toLocaleString('vi-VN')}` : ''}</p>
          {status.reviewNote && <p className="whitespace-pre-wrap rounded-md bg-white/80 p-2.5 text-ink">Nội dung cần xử lý: {status.reviewNote}</p>}
          {status.status === 'APPROVED' && <Link to="/portal/login" className="inline-flex items-center gap-1 font-bold text-primary underline"><CheckCircle2 className="h-4 w-4" /> Đăng nhập cổng đối tác</Link>}
          {status.status === 'REJECTED' && <p className="text-xs opacity-80">Bạn có thể bổ sung theo nội dung trên rồi gửi hồ sơ đăng ký mới.</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-deep">
      <span>{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
      {error && (
        <span role="alert" className="flex items-center gap-1 text-xs font-normal text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </span>
      )}
    </label>
  );
}
