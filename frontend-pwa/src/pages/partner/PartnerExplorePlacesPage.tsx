import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Loader2, MapPin, Pencil, Plus, X } from 'lucide-react';
import ExplorePlaceForm from '@/components/explore/ExplorePlaceForm';
import { getApiErrorMessage } from '@/lib/apiError';
import { partnerCreatePlace, partnerGetPlace, partnerListPlaces, partnerUpdatePlace } from '@/services/exploreService';
import type { PlaceForm, PlaceRow } from '@/types/explore';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

/** Trạng thái hiển thị cho NCC (BR-C02, BR-C03). */
function statusOf(row: PlaceRow): { label: string; cls: string } {
  if (row.approvalStatus === 'PENDING') return { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-800' };
  if (row.approvalStatus === 'REJECTED') return { label: 'Bị từ chối', cls: 'bg-rose-50 text-rose-700' };
  return row.visible ? { label: 'Đang hiển thị', cls: 'bg-emerald-50 text-emerald-700' } : { label: 'Đang ẩn', cls: 'bg-slate-100 text-slate-600' };
}

/**
 * NCC-01 — địa điểm của NCC (US02.01): chỉ địa điểm của chính NCC (BR-C01). Thêm mới → Chờ duyệt (AC-02.06); sửa địa
 * điểm đã duyệt → gửi bản sửa, khách vẫn thấy bản cũ tới khi Admin duyệt (BR-C03).
 */
export default function PartnerExplorePlacesPage() {
  const [rows, setRows] = useState<PlaceRow[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<PlaceForm | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    partnerListPlaces()
      .then((res) => { if (alive) { setRows(res.content); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách địa điểm.')); });
    return () => { alive = false; };
  }, [reload]);

  const openEdit = async (row: PlaceRow) => {
    setBusyId(row.id);
    try {
      setEditing(await partnerGetPlace(row.id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không mở được địa điểm.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-ink-deep"><Compass className="h-5 w-5 text-primary" /> Địa điểm của tôi</h1>
          <p className="text-sm text-muted">Quán ăn, điểm tham quan, dịch vụ của bạn hiển thị ở mục "Khám phá quanh đây". Địa điểm mới và thay đổi cần quản trị viên duyệt.</p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">
          <Plus className="h-4 w-4" /> Thêm địa điểm
        </button>
      </div>

      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!rows ? (
        !error && <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">Bạn chưa có địa điểm nào.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const status = statusOf(row);
            return (
              <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
                <span className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-canvas">
                  {row.imageUrl ? <img src={row.imageUrl} alt="" className="h-full w-full object-cover" /> : <MapPin className="m-auto mt-4 h-5 w-5 text-muted" />}
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="break-words text-sm font-bold text-ink-deep">{row.name}</p>
                  <p className="text-muted">{row.categoryLabel}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${status.cls}`}>{status.label}</span>
                    {row.pendingEdit && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">Có thay đổi chờ duyệt</span>}
                    {!row.hasCoordinates && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Chưa có tọa độ</span>}
                  </div>
                  {row.approvalStatus === 'REJECTED' && row.rejectReason && <p className="mt-1 text-rose-700">Lý do: {row.rejectReason}</p>}
                </div>
                <button type="button" disabled={busyId === row.id} onClick={() => { void openEdit(row); }}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold hover:bg-hover">
                  {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Sửa
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editing === 'new' ? 'Thêm địa điểm' : 'Sửa địa điểm'}
            className="flex max-h-full w-full flex-col bg-white shadow-xl sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-bold text-ink-deep">{editing === 'new' ? 'Thêm địa điểm' : 'Sửa địa điểm'}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-hover"><X className="h-4 w-4" /></button>
            </div>
            {editing !== 'new' && editing.approvalStatus === 'APPROVED' && (
              <p className="mx-4 mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Thay đổi sẽ được gửi quản trị viên duyệt. Trong lúc chờ, khách vẫn thấy thông tin hiện tại.
                {editing.pendingEdit?.status === 'PENDING' && ' Bạn đang có một bản thay đổi chờ duyệt — gửi lần này sẽ thay bản đó.'}
              </p>
            )}
            <ExplorePlaceForm
              initial={editing === 'new' ? null : editing.pendingEdit?.status === 'PENDING' ? { ...editing, ...pendingAsForm(editing) } : editing}
              scope="partner"
              submitLabel="Gửi duyệt"
              onCancel={() => setEditing(null)}
              onSubmit={async (input) => {
                if (editing === 'new') await partnerCreatePlace(input);
                else await partnerUpdatePlace(editing.id, input);
                setEditing(null);
                setNotice('Đã gửi. Quản trị viên sẽ duyệt và bạn sẽ nhận thông báo kết quả.');
                setReload((r) => r + 1);
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Khi đang có bản sửa chờ duyệt, mở form với nội dung bản sửa đó (ảnh vẫn là ảnh đang hiển thị). */
function pendingAsForm(form: PlaceForm): Partial<PlaceForm> {
  const c = form.pendingEdit?.changes;
  if (!c) return {};
  return {
    name: c.name, category: c.category ?? form.category, summary: c.summary, description: c.description, address: c.address,
    latitude: c.latitude, longitude: c.longitude, phone: c.phone, website: c.website,
    openingHours: (c.openingHours ?? []).map((h) => ({ dayOfWeek: h.dayOfWeek, dayName: '', closed: h.closed, open: h.open, close: h.close })),
  };
}
