import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarPlus, ChevronRight, Info, Loader2, Send } from 'lucide-react';
import SwitchToggle from '@/components/journey/SwitchToggle';
import type { JourneyView } from '@/types/journey';
import { REMIND_BEFORE_MIN, buildJourneyIcs, downloadIcs, stopLink } from '@/lib/journey';
import { disablePushRegistration, enablePush, getPushState, type PushState } from '@/lib/webPush';
import { getApiErrorMessage } from '@/lib/apiError';
import { sendTestReminder, travelerPushApi } from '@/services/journeyService';

/** Thiết bị này đã đăng ký nhắc giờ với tài khoản khách (đăng ký trình duyệt có thể dùng chung với cổng Admin / NCC). */
const FLAG = 'journey_push_v1';
const readFlag = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const writeFlag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* bộ nhớ bị chặn */ } };

/**
 * Nhắc giờ tham quan: thông báo đẩy 30 phút trước mỗi buổi (máy chủ gửi, kể cả khi đã đóng app) — một công tắc bật /
 * tắt. iPhone chưa thêm vào màn hình chính (Safari không nhận đẩy) / trình duyệt chặn hoặc không hỗ trợ: một dòng gợi ý
 * ngắn, nhắc giờ vẫn hiện trong chuông của app; kèm dòng "Thêm vào ứng dụng Lịch" (.ics) để Lịch của máy tự nhắc.
 */
export default function ReminderControl({ journey }: { journey: JourneyView }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null);
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => { if (alive) setState(s === 'on' && !readFlag() ? 'off' : s); }).catch(() => { if (alive) setState('unsupported'); });
    return () => { alive = false; };
  }, []);

  const hasDated = journey.stops.some((s) => !!s.visitDate);
  const ics = () => {
    const content = buildJourneyIcs(
      { id: journey.id, title: journey.title, stops: journey.stops },
      (stopId) => stopLink(journey, stopId),
    );
    if (!content) return;
    downloadIcs(content, `lich-trinh-${journey.id}.ics`);
    setAdded(true);
  };

  const toggle = async () => {
    setBusy('toggle');
    setMessage('');
    try {
      if (state === 'on') {
        await disablePushRegistration(travelerPushApi);
        writeFlag(false);
        setState('off');
      } else {
        const next = await enablePush(travelerPushApi);
        writeFlag(next === 'on');
        setState(next);
      }
    } catch (err) {
      setMessage(getApiErrorMessage(err, state === 'on' ? 'Chưa tắt được nhắc giờ.' : 'Chưa bật được nhắc giờ. Vui lòng thử lại.'));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setMessage('');
    try {
      const delivered = await sendTestReminder();
      setMessage(delivered > 0 ? 'Đã gửi thông báo thử — kiểm tra màn hình thiết bị.' : 'Chưa gửi được tới thiết bị này. Hãy tắt rồi bật lại nhắc giờ.');
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Chưa gửi được thông báo thử.'));
    } finally {
      setBusy(null);
    }
  };

  const canToggle = state === 'on' || state === 'off';
  const subline = state === null ? 'Đang kiểm tra thiết bị…'
    : state === 'on' ? 'Đang bật trên thiết bị này'
      : state === 'off' ? `Báo trước ${REMIND_BEFORE_MIN} phút mỗi buổi tham quan`
        : state === 'denied' ? 'Trình duyệt đang chặn thông báo của trang'
          : state === 'ios-install' ? 'iPhone cần thêm ứng dụng vào màn hình chính'
            : 'Trình duyệt này không nhận thông báo đẩy';

  return (
    <section aria-label="Nhắc giờ và lịch" className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${state === 'on' ? 'bg-[#0a7d64] text-white' : 'bg-[#edfbf7] text-[#0a7d64]'}`}>
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-slate-900">Nhắc giờ tham quan</p>
            <p className={`text-xs ${state === 'on' ? 'font-semibold text-emerald-700' : state === 'denied' || state === 'ios-install' ? 'text-amber-700' : 'text-slate-500'}`}>{subline}</p>
          </div>
          {state === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          ) : (
            <SwitchToggle checked={state === 'on'} onChange={() => { void toggle(); }} disabled={!canToggle} busy={busy === 'toggle'} label="Nhắc giờ tham quan" />
          )}
        </div>

        {state === 'on' && (
          <button type="button" onClick={() => { void test(); }} disabled={busy !== null} className="ml-[52px] mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#0a7d64] hover:underline disabled:opacity-50 cursor-pointer">
            {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Gửi thông báo thử
          </button>
        )}
        {(state === 'ios-install' || state === 'denied' || state === 'unsupported') && (
          <p className="ml-[52px] mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              {state === 'ios-install' && <><Link to="/download" className="font-bold text-[#0a7d64] underline underline-offset-2">Thêm vào màn hình chính</Link> để nhận nhắc giờ. </>}
              {state === 'denied' && 'Mở cài đặt trang web của trình duyệt để cho phép thông báo. '}
              Nhắc giờ vẫn hiện trong chuông của ứng dụng{hasDated ? ' — hoặc thêm vào ứng dụng Lịch bên dưới.' : '.'}
            </span>
          </p>
        )}
        {message && <p role="status" className="ml-[52px] mt-2 text-xs font-semibold text-slate-600">{message}</p>}
      </div>

      {hasDated && (
        <button type="button" onClick={ics} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 cursor-pointer">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <CalendarPlus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-slate-900">Thêm vào ứng dụng Lịch</span>
            <span className="block text-xs text-slate-500">{added ? 'Đã tải tệp lịch (.ics) — mở tệp để thêm vào Lịch.' : 'Lịch của điện thoại tự nhắc trước mỗi buổi'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      )}
    </section>
  );
}
