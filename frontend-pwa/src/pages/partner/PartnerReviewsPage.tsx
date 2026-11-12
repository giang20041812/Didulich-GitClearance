import { useEffect, useState } from 'react';
import { peekPartnerStale, primePartner } from '@/lib/partnerCache';
import { MessageSquare, Star, Filter as FilterIcon } from 'lucide-react';
import { partnerReviewService } from '@/services/partnerReviewService';
import { fetchPartnerHomestayNames, homestayError } from '@/services/partnerHomestayService';
import type { PartnerReviewDto } from '@/types/partner';
import { Alert, EmptyState, LoadingBlock, PageHeader, Tabs } from '@/components/partner/PartnerUI';
import { ui } from '@/lib/partnerUi';

const dateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN') : '—');
type Filter = 'all' | 'unreplied' | 'replied';

/** UC-NCC-09: xem đánh giá của khách về các Homestay mình quản lý và phản hồi công khai. */
const REVIEWS_KEY = 'reviews';

export default function PartnerReviewsPage() {
  // Mở lại trang: hiện ngay danh sách lần trước trong tab, rồi làm mới ngầm.
  const [reviews, setReviews] = useState<PartnerReviewDto[]>(() => peekPartnerStale<PartnerReviewDto[]>(REVIEWS_KEY) ?? []);
  const [loading, setLoading] = useState(() => !peekPartnerStale(REVIEWS_KEY));
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('unreplied');
  const [placeId, setPlaceId] = useState<number | ''>('');
  const [homestays, setHomestays] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let active = true;
    // Danh sách đánh giá là nội dung chính: gửi trước. Bộ lọc Homestay chỉ là tiện ích: cache của tab hoặc /names,
    // ưu tiên thấp; lỗi thì lấy danh sách Homestay từ chính các đánh giá.
    partnerReviewService.list()
      .then((data) => { if (active) { setReviews(data); primePartner(REVIEWS_KEY, data); } })
      .catch((e: unknown) => { if (active) setError(homestayError(e)); })
      .finally(() => { if (active) setLoading(false); });
    fetchPartnerHomestayNames('low')
      .then((names) => { if (active) setHomestays(names); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const places: [number, string][] = homestays.length
    ? homestays.map((h) => [h.id, h.name])
    : [...new Map(reviews.map((r) => [r.placeId, r.placeName])).entries()];
  const byPlace = reviews.filter((r) => placeId === '' || r.placeId === placeId);
  const unreplied = byPlace.filter((r) => !r.providerReply).length;
  const shown = byPlace.filter((r) => filter === 'all' || (filter === 'replied' ? !!r.providerReply : !r.providerReply));
  const getPlaceAvg = (pId: number | '') => {
    const pReviews = reviews.filter((r) => pId === '' || r.placeId === pId);
    return pReviews.length ? (pReviews.reduce((s, r) => s + r.rating, 0) / pReviews.length).toFixed(1) : '—';
  };
  const update = (next: PartnerReviewDto) => setReviews((list) => {
    const updated = list.map((r) => (r.id === next.id ? next : r));
    primePartner(REVIEWS_KEY, updated); // bản lưu khớp phản hồi vừa đăng / gỡ
    return updated;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Bảng điều khiển', to: '/partner/overview' }, { label: 'Đánh giá của khách' }]}
        title="Đánh giá của khách"
        description="Phản hồi của bạn hiện công khai ngay dưới đánh giá trên trang Homestay. Trả lời nhanh và lịch sự giúp tạo thiện cảm với khách sau."
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">
            {/* Filter Form */}
            {places.length > 1 && (
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted" />
                <select 
                  value={placeId} 
                  onChange={(e) => setPlaceId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="h-9 px-3 text-sm border border-border rounded-md bg-white focus:outline-none focus:border-primary font-semibold min-w-[200px]"
                >
                  <option value="">Tất cả homestay</option>
                  {places.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Rating */}
            <div className={`flex items-center gap-2 shrink-0 pl-2 ${places.length > 1 ? 'sm:border-l sm:border-border' : ''}`}>
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-sun/30 bg-sun/10 text-sun-700">
                <Star className="h-4 w-4" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold leading-none text-ink-deep">{getPlaceAvg(placeId)}{getPlaceAvg(placeId) !== '—' ? '/5' : ''}</span>
                <span className="text-sm text-muted font-medium">({byPlace.length} đánh giá)</span>
              </div>
            </div>
          </div>
        }
      />



      <div className="mb-2">
        <Tabs<Filter> value={filter} onChange={setFilter} tabs={[
          { id: 'unreplied', label: 'Chưa phản hồi', badge: unreplied },
          { id: 'replied', label: 'Đã phản hồi' },
          { id: 'all', label: 'Tất cả' },
        ]} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <LoadingBlock label="Đang tải đánh giá..." rows={2} /> : (
        <div className="flex flex-col gap-4">
          {shown.map((r) => <ReviewCard key={r.id} review={r} onChange={update} />)}
          {!shown.length && !error && (
            <EmptyState icon={MessageSquare} title={filter === 'unreplied' ? 'Bạn đã phản hồi hết đánh giá' : 'Chưa có đánh giá nào'}
              description={filter === 'unreplied' ? 'Tuyệt vời! Khi có đánh giá mới, chúng sẽ hiện ở đây.' : 'Đánh giá xuất hiện sau khi khách hoàn thành kỳ nghỉ.'} />
          )}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, onChange }: { review: PartnerReviewDto; onChange: (r: PartnerReviewDto) => void }) {
  // UC-NCC-09: NCC chọn đánh giá và bấm "Phản hồi" mới mở vùng nhập; "Hủy" đóng vùng nhập, không đăng nội dung.
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.providerReply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function run(action: () => Promise<PartnerReviewDto>, success: string) {
    setBusy(true); setError(''); setDone('');
    try { const next = await action(); onChange(next); setText(next.providerReply ?? ''); setEditing(false); setDone(success); }
    catch (e: unknown) { setError(homestayError(e)); } finally { setBusy(false); }
  }

  function post() {
    if (!text.trim()) { setError('Vui lòng nhập nội dung phản hồi'); return; }
    void run(() => partnerReviewService.reply(review.id, text.trim()), 'Đã đăng phản hồi');
  }

  return (
    <article className="group flex flex-col gap-4 p-5 rounded-lg border border-border bg-surface transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm hover:border-primary/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50  text-sm font-bold text-primary">
            {review.guestName.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div>
            <p className="font-semibold text-ink-deep">{review.guestName}</p>
            <p className="text-xs text-muted">{review.placeName}{review.bookingCode ? ` · Đơn ${review.bookingCode}` : ''} · {dateTime(review.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5" aria-label={`${review.rating} sao`}>
            {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= review.rating ? 'fill-sun text-sun' : 'text-border'}`} />)}
          </span>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{review.content || <span className="text-muted">Khách không để lại nội dung.</span>}</p>

      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {!editing && !review.providerReply && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Chưa phản hồi</span>
          <button type="button" className={ui.btnOutline} onClick={() => { setEditing(true); setDone(''); }}><MessageSquare className="h-4 w-4" />Phản hồi</button>
        </div>
      )}
      {editing ? (
        <form className="flex flex-col gap-2 border-l-2 border-primary pl-3" onSubmit={(e) => { e.preventDefault(); post(); }}>
          <textarea aria-label="Nội dung phản hồi" className={ui.textarea} rows={3} maxLength={2000} disabled={busy} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cảm ơn khách, giải đáp góp ý hoặc chia sẻ cải thiện của bạn..." />
          <div className="flex items-center gap-2">
            <button disabled={busy || !text.trim()} className={ui.btnPrimary}>{busy ? 'Đang lưu...' : 'Đăng phản hồi'}</button>
            <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); setText(review.providerReply ?? ''); }} className={ui.btnGhost}>Hủy</button>
            <span className="ml-auto text-xs text-muted">{text.length}/2000</span>
          </div>
        </form>
      ) : review.providerReply && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/10 bg-primary-50 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-primary"><MessageSquare className="h-3.5 w-3.5" /> Phản hồi của bạn · {dateTime(review.providerReplyAt)}</p>
          <p className="whitespace-pre-wrap text-sm text-ink">{review.providerReply}</p>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" disabled={busy} onClick={() => { setEditing(true); setDone(''); }} className="text-primary hover:underline">Sửa</button>
            <button type="button" disabled={busy} onClick={() => void run(() => partnerReviewService.removeReply(review.id), 'Đã gỡ phản hồi')} className="text-danger hover:underline">Gỡ phản hồi</button>
          </div>
        </div>
      )}
    </article>
  );
}

