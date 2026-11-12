import { useCallback, useEffect, useState } from 'react';
import {
  Siren, Phone, MapPin, CheckCircle2, XCircle, Send, Plus, RefreshCw,
  Clock, ExternalLink, ShieldAlert,
} from 'lucide-react';
import { sosAdminService } from '@/services/adminService';
import type { SosRequestDto, SosRequestStatus, EmergencyContactDto } from '@/types/sos';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { ReasonDialog, type ReasonDialogTone } from './AdminFilters';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

/** Thao tác SOS đang chờ admin xác nhận lần nữa trước khi gửi. */
interface PendingSosAction {
  title: string;
  description: string;
  confirmLabel: string;
  tone: ReasonDialogTone;
  okMessage: string;
  run: () => Promise<unknown>;
}

interface SosPanelProps {
  notify: (tone: 'success' | 'error', text: string) => void;
}

const STATUS_TABS: { value: SosRequestStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'DISPATCHED', label: 'Đã điều phối' },
  { value: 'RESOLVED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'ALL', label: 'Tất cả' },
];

const STATUS_STYLE: Record<SosRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  DISPATCHED: 'bg-sky-100 text-sky-800 border-sky-300',
  RESOLVED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-300',
};

const TYPE_LABEL: Record<string, string> = {
  MEDICAL: 'Y tế',
  ACCIDENT: 'Tai nạn',
  LOST: 'Thất lạc',
  SECURITY: 'An ninh',
  OTHER: 'Khác',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

/**
 * Bảng SOS cho cổng Admin: theo dõi yêu cầu hỗ trợ khẩn cấp của du khách,
 * điều phối đầu mối và quản lý danh bạ. Tự làm mới mỗi 30 giây khi tab còn hiện.
 */
export default function SosPanel({ notify }: SosPanelProps) {
  const [status, setStatus] = useState<SosRequestStatus | 'ALL'>('PENDING');
  const [items, setItems] = useState<SosRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<EmergencyContactDto[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const [dispatchingId, setDispatchingId] = useState<number | null>(null);
  const [contactId, setContactId] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSosAction | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Lượt làm mới nền (silent) ưu tiên thấp, nhường thao tác của quản trị viên.
      const res = await sosAdminService.getSosRequests(status === 'ALL' ? undefined : status, silent ? 'low' : 'high');
      setItems(res.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách SOS');
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      // Danh bạ là phần phụ của trang: ưu tiên thấp, bảng SOS đi trước.
      setContacts(await sosAdminService.getEmergencyContacts(false, 'low'));
    } catch {
      // Danh bạ lỗi không chặn bảng chính
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useVisibleInterval(() => void load(true), 30_000);

  /** Chạy thao tác đã được xác nhận; danh sách tải lại ngầm nên hộp thoại đóng ngay khi máy chủ trả kết quả. */
  const act = async ({ run, okMessage }: PendingSosAction) => {
    setBusy(true);
    try {
      await run();
      notify('success', okMessage);
      setPending(null);
      setDispatchingId(null);
      setNote('');
      void load(true);
    } catch (e) {
      setPending(null);
      notify('error', e instanceof Error ? e.message : 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tiêu đề + bộ lọc trạng thái */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <Siren className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-deep">Yêu cầu hỗ trợ khẩn cấp (SOS)</h2>
              <p className="text-xs text-muted">Du khách gửi từ nút "Cần hỗ trợ khẩn cấp" — tự làm mới mỗi 30 giây.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                status === t.value ? 'bg-slate-900 text-white' : 'border border-border bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {t.value === 'PENDING' && items.length > 0 && status === 'PENDING' && ` (${items.length})`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
      )}

      {/* Danh sách yêu cầu */}
      {loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
          <ShieldAlert className="mx-auto mb-2 h-9 w-9 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">
            {status === 'PENDING' ? 'Không có yêu cầu nào đang chờ xử lý' : 'Không có yêu cầu nào ở trạng thái này'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map(r => (
            <div key={r.id} className={`rounded-xl border bg-white p-4 shadow-xs ${r.status === 'PENDING' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-border'}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-deep">
                    #{r.id} · {r.requesterName}
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{TYPE_LABEL[r.type] ?? r.type}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" /> {timeAgo(r.createdAt)}</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-black ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </div>

              <a href={`tel:${r.requesterPhone}`} className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">
                <Phone className="h-3.5 w-3.5" /> {r.requesterPhone}
              </a>

              {r.latitude != null && r.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mb-2 flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                >
                  <MapPin className="h-3.5 w-3.5" /> Vị trí GPS: {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)} <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {r.description && (
                <p className="mb-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">{r.description}</p>
              )}

              {r.assignedContact && (
                <p className="mb-2 text-xs text-slate-600">
                  <b>Đã điều phối:</b> {r.assignedContact.name} — {r.assignedContact.phone}
                  {r.dispatchNote && <span className="block text-slate-500">Ghi chú: {r.dispatchNote}</span>}
                </p>
              )}

              {r.status === 'PENDING' && (
                dispatchingId === r.id ? (
                  <div className="mt-1 space-y-2 rounded-lg border border-border bg-slate-50 p-3">
                    <select
                      value={contactId}
                      onChange={e => setContactId(e.target.value)}
                      className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="">— Chọn đầu mối xử lý —</option>
                      {contacts.filter(c => c.isActive).map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                      ))}
                    </select>
                    <input
                      value={note} onChange={e => setNote(e.target.value)}
                      placeholder="Ghi chú điều phối (khuyến nghị gọi điện trước)"
                      className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button" disabled={!contactId || busy}
                        onClick={() => {
                          const contact = contacts.find((c) => c.id === Number(contactId));
                          setPending({
                            title: `Điều phối SOS #${r.id}`,
                            description: `Giao yêu cầu khẩn cấp của ${r.requesterName || 'du khách'} cho ${contact ? `${contact.name} (${contact.phone})` : 'đầu mối đã chọn'}. Hãy chắc chắn đã gọi điện xác nhận với đầu mối.`,
                            confirmLabel: 'Điều phối ngay',
                            tone: 'primary',
                            okMessage: 'Đã điều phối SOS #' + r.id,
                            run: () => sosAdminService.dispatchSos(r.id, Number(contactId), note || undefined),
                          });
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" /> Xác nhận điều phối
                      </button>
                      <button type="button" onClick={() => setDispatchingId(null)} className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Đóng</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => { setDispatchingId(r.id); setContactId(''); setNote(''); }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Điều phối
                    </button>
                    <button
                      type="button" disabled={busy}
                      onClick={() =>
                        setPending({
                          title: `Hủy SOS #${r.id}`,
                          description: `Yêu cầu khẩn cấp của ${r.requesterName || 'du khách'} sẽ chuyển sang "Đã hủy" và không còn trong hàng chờ. Chỉ hủy khi đã xác minh là báo nhầm.`,
                          confirmLabel: 'Hủy yêu cầu',
                          tone: 'danger',
                          okMessage: 'Đã hủy SOS #' + r.id,
                          run: () => sosAdminService.cancelSos(r.id),
                        })
                      }
                      className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Hủy
                    </button>
                  </div>
                )
              )}

              {r.status === 'DISPATCHED' && (
                <button
                  type="button" disabled={busy}
                  onClick={() =>
                    setPending({
                      title: `Hoàn tất SOS #${r.id}`,
                      description: `Xác nhận du khách ${r.requesterName || ''} đã được hỗ trợ xong. Yêu cầu sẽ chuyển sang "Hoàn tất".`,
                      confirmLabel: 'Đã xử lý xong',
                      tone: 'primary',
                      okMessage: 'Đã hoàn tất SOS #' + r.id,
                      run: () => sosAdminService.resolveSos(r.id),
                    })
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu đã xử lý xong
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Xác nhận lần nữa trước khi điều phối / hủy / hoàn tất / xóa đầu mối */}
      {pending && (
        <ReasonDialog
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          reasonRequired={false}
          hideReason
          tone={pending.tone}
          onCancel={() => setPending(null)}
          onConfirm={() => act(pending)}
        />
      )}

      {/* Danh bạ đầu mối khẩn cấp */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-deep">Danh bạ đầu mối (hiển thị cho du khách)</h3>
          <button type="button" onClick={() => void loadContacts()} className="flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline">
            <RefreshCw className={`h-3 w-3 ${contactsLoading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </div>
        {contactsLoading ? (
          <p className="p-4 text-center text-xs text-muted">Đang tải…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted">
                  <th className="py-2 pr-3">Tên</th>
                  <th className="py-2 pr-3">SĐT</th>
                  <th className="py-2 pr-3">Loại</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className={`border-b border-border/60 ${c.isActive ? '' : 'opacity-50'}`}>
                    <td className="py-2 pr-3 font-semibold text-slate-800">{c.name}</td>
                    <td className="py-2 pr-3"><a className="font-bold text-rose-700" href={`tel:${c.phone}`}>{c.phone}</a></td>
                    <td className="py-2 pr-3">{c.type}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            title: '',
                            description: '',
                            confirmLabel: '',
                            tone: 'primary',
                            okMessage: c.isActive ? 'Đã tắt đầu mối' : 'Đã bật đầu mối',
                            run: async () => {
                              await sosAdminService.updateEmergencyContact(c.id, { isActive: !c.isActive });
                              await loadContacts();
                            },
                          })
                        }
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {c.isActive ? 'Đang dùng' : 'Tắt'}
                      </button>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPending({
                            title: 'Xóa đầu mối khẩn cấp',
                            description: `Xóa "${c.name}" (${c.phone}) khỏi danh bạ. Du khách sẽ không còn thấy số này.`,
                            confirmLabel: 'Xóa đầu mối',
                            tone: 'danger',
                            okMessage: 'Đã xóa đầu mối',
                            run: async () => {
                              await sosAdminService.deleteEmergencyContact(c.id);
                              await loadContacts();
                            },
                          })
                        }
                        className="text-[11px] font-semibold text-danger hover:underline"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted">Chưa có đầu mối nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <AddContactRow onAdded={() => void loadContacts()} notify={notify} />
      </div>
    </div>
  );
}

/** Thêm nhanh đầu mối khẩn cấp (tên + SĐT + loại). */
function AddContactRow({ onAdded, notify }: { onAdded: () => void; notify: (t: 'success' | 'error', m: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('TOURISM_SUPPORT');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      await sosAdminService.createEmergencyContact({ type: type as never, name: name.trim(), phone: phone.trim() });
      notify('success', 'Đã thêm đầu mối khẩn cấp');
      setName(''); setPhone('');
      onAdded();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Không thêm được đầu mối');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên đầu mối (VD: Công an huyện MCC)" className="min-w-[180px] flex-1 rounded-md border border-border px-2.5 py-1.5 text-xs" />
      <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="Số điện thoại" className="w-[130px] rounded-md border border-border px-2.5 py-1.5 text-xs" />
      <select value={type} onChange={e => setType(e.target.value)} className="rounded-md border border-border bg-white px-2 py-1.5 text-xs">
        <option value="POLICE">Công an</option>
        <option value="MEDICAL">Y tế</option>
        <option value="FIRE">Cứu nạn</option>
        <option value="TOURISM_SUPPORT">Hỗ trợ du lịch</option>
      </select>
      <button type="submit" disabled={busy || !name.trim() || !phone.trim()} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-50">
        <Plus className="h-3.5 w-3.5" /> Thêm
      </button>
    </form>
  );
}
