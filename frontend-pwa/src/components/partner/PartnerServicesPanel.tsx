import { useEffect, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import type { HomestayServiceOffer, HomestayServiceInput } from '@/types/homestay';
import { homestayError } from '@/services/partnerHomestayService';
import { Alert, Card, EmptyState, Field, Pill } from '@/components/partner/PartnerUI';
import { ui, vnd } from '@/lib/partnerUi';
import MoneyInput from '@/components/partner/MoneyInput';

const EMPTY: HomestayServiceInput = { name: '', description: '', price: null, priceUnit: '', active: true };
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` } });

/** FR-NCC-04: dịch vụ cung cấp tại Homestay (ăn uống, đưa đón, trải nghiệm...). */
export default function PartnerServicesPanel({ placeId }: { placeId: number }) {
  const url = `/api/v1/partner/homestays/${placeId}/services`;
  const [items, setItems] = useState<HomestayServiceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<HomestayServiceInput | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    axios.get<HomestayServiceOffer[]>(url, auth())
      .then(r => { if (active) setItems(r.data); })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  function open(item: HomestayServiceOffer | null) {
    setError('');
    setEditId(item?.id ?? null);
    setForm(item ? { name: item.name, description: item.description ?? '', price: item.price, priceUnit: item.priceUnit ?? '', active: item.active } : { ...EMPTY });
  }

  async function save() {
    if (!form) return;
    setBusy(true); setError('');
    try {
      const saved = (await axios.request<HomestayServiceOffer>({ url: editId ? `${url}/${editId}` : url, method: editId ? 'PUT' : 'POST', data: form, ...auth() })).data;
      setItems(prev => editId ? prev.map(i => i.id === editId ? saved : i) : [...prev, saved]);
      setForm(null); setEditId(null);
    } catch (e: unknown) { setError(homestayError(e)); }
    finally { setBusy(false); }
  }

  const set = <K extends keyof HomestayServiceInput>(k: K, v: HomestayServiceInput[K]) => setForm(f => f ? { ...f, [k]: v } : f);

  return (
    <Card title="Dịch vụ tại Homestay" icon={Sparkles}
      description="Bữa ăn, đưa đón, thuê xe, hướng dẫn trekking... Khách chọn dịch vụ kèm theo khi đặt phòng."
      actions={!form && <button type="button" className={ui.btnOutline} onClick={() => open(null)}><Plus className="h-4 w-4" />Thêm dịch vụ</button>}>
      {error && <Alert tone="error">{error}</Alert>}

      {form && (
        <form className="flex flex-col gap-4 rounded-md border border-primary/20 bg-primary-50/40 p-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="text-sm font-bold text-ink-deep">{editId ? 'Sửa dịch vụ' : 'Dịch vụ mới'}</p>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên dịch vụ" required className="sm:col-span-2">
              <input className={ui.input} required maxLength={255} value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: Bữa tối gà đồi nướng" />
            </Field>
            <Field label="Mô tả" className="sm:col-span-2">
              <textarea className={ui.textarea} rows={3} maxLength={10000} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Thời gian phục vụ, số người, lưu ý..." />
            </Field>
            <Field label="Giá (VND)" hint="Để trống nếu giá tùy theo yêu cầu, khách liên hệ trực tiếp.">
              <MoneyInput ariaLabel="Giá dịch vụ" placeholder="Để trống nếu giá liên hệ" value={form.price} onChange={v => set('price', v)} />
            </Field>
            <Field label="Đơn vị tính">
              <input className={ui.input} maxLength={64} value={form.priceUnit ?? ''} onChange={e => set('priceUnit', e.target.value)} placeholder="người, suất, chuyến..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={form.active} onChange={e => set('active', e.target.checked)} />
              Đang cung cấp (bỏ chọn để tạm ẩn với khách)
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button className={ui.btnPrimary}>{busy ? 'Đang lưu...' : 'Lưu dịch vụ'}</button>
              <button type="button" className={ui.btnGhost} onClick={() => { setForm(null); setEditId(null); }}>Hủy</button>
            </div>
          </fieldset>
        </form>
      )}

      {loading ? <p role="status" className="text-sm text-muted">Đang tải dịch vụ...</p>
        : items.length === 0 && !form ? (
          <EmptyState icon={Sparkles} title="Chưa có dịch vụ nào" description="Thêm dịch vụ để khách có thêm lựa chọn và bạn có thêm thu nhập."
            action={<button type="button" className={ui.btnPrimary} onClick={() => open(null)}><Plus className="h-4 w-4" />Thêm dịch vụ đầu tiên</button>} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map(item => (
              <li key={item.id} className={`flex flex-col gap-2 rounded-md border border-primary/10 bg-surface p-4 ${ui.cardHover} ${item.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink-deep">{item.name}</p>
                  <button type="button" aria-label={`Sửa ${item.name}`} className={ui.iconBtn} onClick={() => open(item)}><Pencil className="h-4 w-4" /></button>
                </div>
                {item.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{item.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-sm font-bold text-primary">{item.price != null ? `${vnd(item.price)}${item.priceUnit ? ` / ${item.priceUnit}` : ''}` : 'Giá liên hệ'}</span>
                  <Pill tone={item.active ? 'accent' : 'neutral'}>{item.active ? 'Đang cung cấp' : 'Tạm ẩn'}</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
