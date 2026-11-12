import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { ExperienceCard, RouteRow } from '@/components/partner/ServiceListingViews';
import ExplorePlaceForm from '@/components/explore/ExplorePlaceForm';
import { getApiErrorMessage } from '@/lib/apiError';
import { serviceGroupOf } from '@/lib/serviceGroups';
import { listingApi, type ListingConfig, type ListingRow } from '@/services/portalServicesApi';
import { providerServiceByType } from '@/components/layout/providerServices';
import type { PlaceForm } from '@/types/explore';
import { ListSkeleton } from '@/components/ui/PageSkeleton';

/**
 * "Dịch vụ của tôi" của nhà xe (tuyến xe, xe đưa đón, thuê xe) và nhà cung cấp trải nghiệm. Dịch vụ mới và mọi thay đổi
 * cần quản trị viên duyệt; dịch vụ nhà xe hiện ở trang Di chuyển, trải nghiệm hiện ở trang Văn hóa (mục Trải nghiệm bản địa).
 */
export default function PartnerListingsPage() {
  const [config, setConfig] = useState<ListingConfig | null>(null);
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  // ?moi=1 (nút "Thêm…" ở trang tổng quan): mở sẵn form thêm mới.
  const [params, setParams] = useSearchParams();
  const [editing, setEditingState] = useState<PlaceForm | 'new' | null>(() => (params.get('moi') ? 'new' : null));
  const setEditing = (value: PlaceForm | 'new' | null) => {
    setEditingState(value);
    if (!value && params.get('moi')) setParams({}, { replace: true });
  };
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listingApi.config(), listingApi.list()])
      .then(([cfg, page]) => { if (alive) { setConfig(cfg); setRows(page.content); setError(''); } })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được danh sách dịch vụ.')); });
    return () => { alive = false; };
  }, [reload]);

  const openEdit = async (id: number) => {
    setBusyId(id);
    try {
      setEditing(await listingApi.get(id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không mở được dịch vụ.'));
    } finally {
      setBusyId(null);
    }
  };

  const transport = config?.serviceType === 'TRANSPORT';
  const service = config ? providerServiceByType(config.serviceType) : null;
  const title = transport ? 'Tuyến xe & dịch vụ' : 'Trải nghiệm của tôi';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {service && <img src={service.image} alt="" aria-hidden width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />}
          <div>
            <h1 className="text-lg font-bold text-ink-deep">{config ? title : 'Dịch vụ của tôi'}</h1>
            <p className="text-sm text-muted">
              {transport
                ? 'Mỗi tuyến xe, dịch vụ xe ôm hay thuê xe là một mục riêng, hiện ở trang "Di chuyển" sau khi quản trị viên duyệt.'
                : 'Mỗi trải nghiệm (trekking, làm nghề, ẩm thực…) là một mục riêng, hiện ở trang "Văn hóa" (mục Trải nghiệm bản địa) sau khi quản trị viên duyệt.'}
            </p>
          </div>
        </div>
        {config && (
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">
            <Plus className="h-4 w-4" /> {transport ? 'Thêm tuyến / dịch vụ' : 'Thêm trải nghiệm'}
          </button>
        )}
      </div>

      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!rows ? (
        !error && <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          <p>Bạn chưa đăng {transport ? 'tuyến xe hay dịch vụ' : 'trải nghiệm'} nào.</p>
          <p className="mt-1 text-xs">Sau khi được duyệt, bạn có thể gắn dịch vụ vào <Link to="/partner/combos" className="font-semibold text-primary underline">combo</Link> và bật <Link to="/partner/nearby" className="font-semibold text-primary underline">gợi ý quanh đây</Link>.</p>
        </div>
      ) : (
        transport ? (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => <RouteRow key={row.place.id} row={row} busy={busyId === row.place.id} onEdit={() => { void openEdit(row.place.id); }} />)}
          </ul>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => <ExperienceCard key={row.place.id} row={row} busy={busyId === row.place.id} onEdit={() => { void openEdit(row.place.id); }} />)}
          </ul>
        )
      )}

      {editing && config && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editing === 'new' ? 'Thêm dịch vụ' : 'Sửa dịch vụ'}
            className="flex max-h-full w-full flex-col bg-white shadow-xl sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-bold text-ink-deep">{editing === 'new' ? (transport ? 'Thêm tuyến / dịch vụ' : 'Thêm trải nghiệm') : 'Sửa dịch vụ'}</h2>
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
              serviceMode={{ category: config.category, groups: config.groups }}
              submitLabel="Gửi duyệt"
              onCancel={() => setEditing(null)}
              onSubmit={async (input) => {
                if (editing === 'new') await listingApi.create(input);
                else await listingApi.update(editing.id, input);
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

/** Đang có bản sửa chờ duyệt: mở form với nội dung bản sửa đó, kể cả giá và thông tin dịch vụ (ảnh vẫn là ảnh đang hiển thị). */
function pendingAsForm(form: PlaceForm): Partial<PlaceForm> {
  const c = form.pendingEdit?.changes;
  if (!c) return {};
  const s = c.service;
  return {
    name: c.name, category: c.category ?? form.category, summary: c.summary, description: c.description, address: c.address,
    latitude: c.latitude, longitude: c.longitude, phone: c.phone, website: c.website,
    openingHours: (c.openingHours ?? []).map((h) => ({ dayOfWeek: h.dayOfWeek, dayName: '', closed: h.closed, open: h.open, close: h.close })),
    ...(s && s.serviceGroup ? {
      priceFrom: c.priceFrom ?? null,
      priceUnit: c.priceUnit ?? null,
      service: {
        serviceGroup: s.serviceGroup, serviceGroupLabel: serviceGroupOf(s.serviceGroup)?.label ?? '', vehicleType: s.vehicleType ?? null,
        routeFrom: s.routeFrom ?? null, routeTo: s.routeTo ?? null, departureTimes: s.departureTimes ?? null,
        durationMinutes: s.durationMinutes ?? null, seats: s.seats ?? null, groupSizeMax: s.groupSizeMax ?? null,
        languages: s.languages ?? [], includes: s.includes ?? null,
      },
    } : {}),
  };
}
