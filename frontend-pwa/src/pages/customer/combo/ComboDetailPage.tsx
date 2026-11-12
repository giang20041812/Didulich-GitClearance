import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Loader2, MapPin, Users, Utensils, XCircle } from 'lucide-react';
import { BRAND_NAME } from '@/components/ui/logo';
import { getCurrentCustomer } from '@/lib/currentCustomer';
import { mediaUrl } from '@/lib/mediaUrl';
import { placeDetailPath } from '@/lib/placeRoutes';
import { formatVnd } from '@/lib/serviceGroups';
import { ApiError, publicComboApi } from '@/services/publicServicesApi';
import comboImage from '@/assets/fluent/combo.webp';
import type { ComboDetail, ComboRestaurant } from '@/types/combo';
import { DetailSkeleton } from '@/components/ui/PageSkeleton';

const VN_PHONE = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

/** Chi tiết combo: lịch trình từng ngày, mục đã / không bao gồm, nhà hàng gợi ý và mẫu gửi yêu cầu đặt. */
export default function ComboDetailPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ slug: string; combo: ComboDetail | null; error: string } | null>(null);
  const combo = loaded?.slug === slug ? loaded.combo : null;
  const error = loaded?.slug === slug ? loaded.error : '';

  useEffect(() => {
    let alive = true;
    publicComboApi.detail(slug)
      .then((c) => { if (alive) { setLoaded({ slug, combo: c, error: '' }); document.title = `${c.title} — ${BRAND_NAME}`; } })
      .catch((err: unknown) => { if (alive) setLoaded({ slug, combo: null, error: err instanceof ApiError && err.status === 404 ? 'Combo không tồn tại hoặc đã ngừng bán.' : err instanceof Error ? err.message : 'Không tải được combo.' }); });
    return () => { alive = false; };
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-16 text-center">
        <img src={comboImage} alt="" aria-hidden className="h-16 w-16 object-contain opacity-70" />
        <p className="text-sm text-slate-600">{error}</p>
        <Link to="/combo" className="font-semibold text-primary underline">Xem các combo khác</Link>
      </div>
    );
  }
  if (!combo) {
    return <DetailSkeleton label="Đang tải combo" />;
  }

  const pinned = combo.restaurants.filter((r) => r.pinned);
  const auto = combo.restaurants.filter((r) => !r.pinned);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-4 md:px-8">
      <Link
        to="/combo"
        onClick={(e) => {
          if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
            e.preventDefault();
            navigate(-1);
          }
        }}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Quay về
      </Link>
      <div className="overflow-hidden rounded-2xl bg-canvas">
        {combo.coverImageUrl
          ? <img src={mediaUrl(combo.coverImageUrl, 1280)} alt="" className="aspect-[16/7] w-full object-cover" />
          : <div className="flex aspect-[16/7] items-center justify-center"><img src={comboImage} alt="" className="h-24 w-24 object-contain opacity-60" /></div>}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <header>
            <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-deep sm:text-3xl">{combo.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" /> {combo.durationText}</span>
              {(combo.groupSizeMin || combo.groupSizeMax) && (
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />
                  {combo.groupSizeMin && combo.groupSizeMax ? `${combo.groupSizeMin}–${combo.groupSizeMax} khách / đoàn`
                    : combo.groupSizeMax ? `Tối đa ${combo.groupSizeMax} khách / đoàn` : `Từ ${combo.groupSizeMin} khách / đoàn`}
                </span>
              )}
              <span>Tổ chức: <strong className="font-semibold text-ink-deep">{combo.providerName ?? BRAND_NAME}</strong></span>
            </div>
            <p className="mt-3 text-base text-slate-700">{combo.summary}</p>
            {combo.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{combo.description}</p>}
          </header>

          <section aria-labelledby="combo-itinerary">
            <h2 id="combo-itinerary" className="text-lg font-bold text-ink-deep">Lịch trình</h2>
            <ol className="mt-3 space-y-5">
              {combo.itinerary.map((day) => (
                <li key={day.dayNo}>
                  <p className="text-sm font-bold uppercase tracking-wide text-primary">Ngày {day.dayNo}</p>
                  <ol className="mt-2 space-y-0 border-l-2 border-primary/20 pl-4">
                    {day.stops.map((stop) => (
                      <li key={stop.id} className="relative pb-4 last:pb-0">
                        <span aria-hidden className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary" />
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            {(stop.startTime || stop.endTime) && (
                              <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                                <Clock className="h-3.5 w-3.5" /> {[stop.startTime, stop.endTime].filter(Boolean).join(' – ')}
                              </p>
                            )}
                            <p className="font-semibold text-ink-deep">{stop.title}</p>
                            {stop.place && (stop.place.available ? (
                              <Link to={placeDetailPath(stop.place.kind, stop.place.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                <MapPin className="h-3.5 w-3.5" /> {stop.place.name}{stop.place.label ? ` · ${stop.place.label}` : ''}
                              </Link>
                            ) : (
                              <p className="inline-flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> {stop.place.name}</p>
                            ))}
                            {stop.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{stop.note}</p>}
                          </div>
                          {stop.place?.imageUrl && <img src={mediaUrl(stop.place.imageUrl, 330)} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg object-cover" />}
                        </div>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-deep"><CheckCircle2 className="h-4 w-4 text-primary" /> Đã bao gồm</h2>
              {combo.includes.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{combo.includes.map((i) => <li key={i}>{i}</li>)}</ul>
              ) : <p className="mt-2 text-sm text-slate-500">Hỏi người tổ chức khi gửi yêu cầu.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-deep"><XCircle className="h-4 w-4 text-slate-400" /> Không bao gồm</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>Ăn uống (xem nhà hàng gợi ý bên dưới)</li>
                {combo.excludes.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          </section>

          {combo.restaurants.length > 0 && (
            <section aria-labelledby="combo-food">
              <h2 id="combo-food" className="flex items-center gap-2 text-lg font-bold text-ink-deep"><Utensils className="h-5 w-5 text-primary" /> Ăn ở đâu?</h2>
              <p className="mt-1 text-sm text-slate-600">Giá combo chưa gồm ăn uống. Một vài nơi bạn có thể ghé quanh lộ trình:</p>
              {pinned.length > 0 && <RestaurantGrid title="Người tổ chức giới thiệu" items={pinned} />}
              {auto.length > 0 && (
                <RestaurantGrid title="Gần lộ trình" note="Xếp theo đánh giá của khách và khoảng cách tới điểm dừng gần nhất." items={auto} />
              )}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--app-header-offset,80px)+16px)] lg:self-start">
          <RequestCard combo={combo} />
        </aside>
      </div>
    </div>
  );
}

function RestaurantGrid({ title, note, items }: { title: string; note?: string; items: ComboRestaurant[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink-deep">{title}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.placeId}>
            <Link to={placeDetailPath('RESTAURANT', r.placeId)} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-primary/40">
              <span className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-canvas">
                {r.imageUrl ? <img src={mediaUrl(r.imageUrl, 330)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Utensils className="m-auto mt-5 h-5 w-5 text-slate-400" />}
              </span>
              <span className="min-w-0 text-xs">
                <span className="block text-sm font-semibold text-ink-deep">{r.name}</span>
                {r.nearStop && r.distanceText && <span className="block text-slate-500">Cách {r.nearStop} {r.distanceText}</span>}
                {r.priceFrom != null && <span className="block text-slate-600">Giá tham khảo {formatVnd(r.priceFrom)}{r.priceTo != null ? ` – ${formatVnd(r.priceTo)}` : ''}</span>}
                {r.note && <span className="mt-0.5 block text-slate-700">“{r.note}”</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thẻ giá + mẫu gửi yêu cầu đặt (chưa giữ chỗ, chưa trả tiền — người tổ chức gọi lại xác nhận). */
function RequestCard({ combo }: { combo: ComboDetail }) {
  const customer = useMemo(() => getCurrentCustomer(), []);
  const [name, setName] = useState(customer?.role === 'TRAVELER' ? customer.fullName : '');
  const [phone, setPhone] = useState(customer?.role === 'TRAVELER' ? customer.phone ?? '' : '');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(String(combo.groupSizeMin ?? 2));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [formError, setFormError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.contactName = 'Vui lòng nhập họ tên.';
    const cleanPhone = phone.trim().replace(/[\s.()-]/g, '');
    if (!VN_PHONE.test(cleanPhone)) e.contactPhone = 'Số điện thoại chưa đúng định dạng (VD: 0912 345 678).';
    if (!date) e.startDate = 'Vui lòng chọn ngày đi.';
    else if (date < todayVn()) e.startDate = 'Ngày đi không được ở quá khứ.';
    const g = Number(guests);
    if (!Number.isInteger(g) || g < 1 || g > 100) e.guests = 'Số khách từ 1 đến 100.';
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await publicComboApi.request(combo.slug, { contactName: name.trim(), contactPhone: cleanPhone, startDate: date, guests: g, note: note.trim() });
      setDone(res.message);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.field, f.message])));
      else setFormError(err instanceof Error ? err.message : 'Không gửi được yêu cầu.');
    } finally {
      setBusy(false);
    }
  };

  const input = (key: string) => `w-full rounded-lg border bg-white px-3 py-2.5 text-base text-ink-deep focus:outline-none focus:ring-2 sm:text-sm ${errors[key] ? 'border-danger focus:ring-danger/15' : 'border-slate-300 focus:border-primary focus:ring-primary/20'}`;
  const fieldError = (key: string) => (errors[key] ? <p role="alert" className="mt-1 text-xs text-danger">{errors[key]}</p> : null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-md)]">
      <p className="text-xs text-slate-500">Giá từ</p>
      <p className="text-2xl font-extrabold text-ink-deep">{formatVnd(combo.priceFrom)}<span className="text-sm font-semibold text-slate-500"> / khách</span></p>
      {combo.priceNote && <p className="mt-1 text-xs text-slate-600">{combo.priceNote}</p>}
      {done ? (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm text-ink-deep">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {done}
        </div>
      ) : (
        <form onSubmit={(e) => { void submit(e); }} noValidate className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-ink-deep">Gửi yêu cầu đặt combo</p>
          <div>
            <label htmlFor="req-name" className="mb-1 block text-xs font-semibold text-slate-700">Họ tên</label>
            <input id="req-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input('contactName')} />
            {fieldError('contactName')}
          </div>
          <div>
            <label htmlFor="req-phone" className="mb-1 block text-xs font-semibold text-slate-700">Số điện thoại</label>
            <input id="req-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input('contactPhone')} />
            {fieldError('contactPhone')}
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <div>
              <label htmlFor="req-date" className="mb-1 block text-xs font-semibold text-slate-700">Ngày đi</label>
              <input id="req-date" type="date" min={todayVn()} value={date} onChange={(e) => setDate(e.target.value)} className={input('startDate')} />
            </div>
            <div>
              <label htmlFor="req-guests" className="mb-1 block text-xs font-semibold text-slate-700">Số khách</label>
              <input id="req-guests" type="number" min={1} max={100} value={guests} onChange={(e) => setGuests(e.target.value)} className={input('guests')} />
            </div>
          </div>
          {fieldError('startDate')}
          {fieldError('guests')}
          <div>
            <label htmlFor="req-note" className="mb-1 block text-xs font-semibold text-slate-700">Ghi chú <span className="font-normal text-slate-400">(không bắt buộc)</span></label>
            <textarea id="req-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: có trẻ nhỏ, cần đón tại Hà Nội" className={input('note')} />
            {fieldError('note')}
          </div>
          {formError && <p role="alert" className="rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{formError}</p>}
          <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Gửi yêu cầu
          </button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Chưa trừ tiền, chưa giữ chỗ. {combo.providerName ?? BRAND_NAME} sẽ gọi lại để xác nhận lịch đi và giá.
          </p>
        </form>
      )}
    </div>
  );
}
