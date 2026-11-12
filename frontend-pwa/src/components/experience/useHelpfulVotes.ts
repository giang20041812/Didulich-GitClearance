import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@/lib/apiError';
import { getCurrentCustomer } from '@/services/authService';
import { fetchHelpfulState, markHelpful, unmarkHelpful } from '@/services/journeyService';

/** Trạng thái nút "Hữu ích" của một bài với khách đang xem. */
export interface HelpfulVote {
  /** Khách đã bấm. */
  helpful: boolean;
  /** Bài của chính khách — không bấm được, chỉ xem số lượt. */
  own: boolean;
  count: number;
  busy: boolean;
  error: string;
}

interface Mine {
  helpful: boolean;
  own: boolean;
}

/**
 * Nút "Hữu ích" (tim) cho các bài đang hiện, theo mã chia sẻ. Số lượt lấy từ bài (bảng tin / trang chia sẻ); khách đã
 * đăng nhập thì hỏi máy chủ MỘT lần cho cả danh sách xem đã bấm bài nào. Bấm thì đổi ngay trên màn hình rồi mới gửi (lỗi
 * thì trả lại như cũ); chưa đăng nhập thì sang đăng nhập rồi quay lại đúng trang.
 */
export function useHelpfulVotes(tokens: string[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const loggedIn = getCurrentCustomer()?.role === 'TRAVELER';
  const [mine, setMine] = useState<Record<string, Mine>>({});
  /** Số lượt máy chủ trả về sau khi khách bấm — mới hơn số trong bài đã tải. */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());

  const tokensKey = tokens.join(',');
  useEffect(() => {
    if (!loggedIn) return;
    const fresh = tokensKey.split(',').filter((t) => t && !asked.current.has(t));
    if (fresh.length === 0) return;
    fresh.forEach((t) => asked.current.add(t));
    fetchHelpfulState(fresh)
      .then((state) => setMine((current) => {
        const next = { ...current };
        for (const token of fresh) {
          // Khách đã bấm trong lúc chờ: giữ lựa chọn mới nhất của khách.
          if (next[token]) continue;
          next[token] = { helpful: state.helpful.includes(token), own: state.own.includes(token) };
        }
        return next;
      }))
      .catch(() => fresh.forEach((t) => asked.current.delete(t)));
  }, [loggedIn, tokensKey]);

  const voteOf = useCallback((token: string, fallbackCount = 0): HelpfulVote => ({
    helpful: mine[token]?.helpful ?? false,
    own: mine[token]?.own ?? false,
    count: counts[token] ?? fallbackCount,
    busy: !!busy[token],
    error: errors[token] ?? '',
  }), [mine, counts, busy, errors]);

  const toggle = async (token: string, fallbackCount = 0) => {
    if (!loggedIn) {
      navigate('/login', {
        state: {
          returnUrl: `${location.pathname}${location.search}`,
          message: 'Đăng nhập bằng tài khoản du khách để bấm Hữu ích cho hành trình bạn thấy hay.',
        },
      });
      return;
    }
    const before = voteOf(token, fallbackCount);
    if (before.own || before.busy) return;
    const want = !before.helpful;
    setMine((m) => ({ ...m, [token]: { helpful: want, own: false } }));
    setCounts((c) => ({ ...c, [token]: Math.max(0, before.count + (want ? 1 : -1)) }));
    setBusy((b) => ({ ...b, [token]: true }));
    setErrors((e) => ({ ...e, [token]: '' }));
    try {
      const result = want ? await markHelpful(token) : await unmarkHelpful(token);
      setMine((m) => ({ ...m, [token]: { helpful: result.helpful, own: false } }));
      setCounts((c) => ({ ...c, [token]: result.count }));
    } catch (err) {
      setMine((m) => ({ ...m, [token]: { helpful: before.helpful, own: before.own } }));
      setCounts((c) => ({ ...c, [token]: before.count }));
      setErrors((e) => ({ ...e, [token]: getApiErrorMessage(err, 'Chưa lưu được — thử lại nhé.') }));
    } finally {
      setBusy((b) => ({ ...b, [token]: false }));
    }
  };

  return { voteOf, toggle };
}
