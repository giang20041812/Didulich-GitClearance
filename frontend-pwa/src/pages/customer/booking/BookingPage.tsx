import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Users,
  BedDouble,
  Utensils,
  ArrowRight,
  Star,
  CheckCircle2,
  Banknote,
  Clock,
  MapPin,
  AlertTriangle,
  X,
  Lock,
  Route,
  Plus,
} from 'lucide-react';
import type { BookingResponseDto, BookedDateRangeDto, BookingRoomChoice } from '@/types/booking';
import type { RoomTypeDto } from '@/types/room';
import { createBooking, saveUserBooking, fetchBookedDatesByPlace } from '@/services/bookingService';
import { getHomestayById } from '@/services/homestayService';
import { getBookingRestriction, getCurrentCustomer, getCurrentPortalCustomer } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { LogoMark, LogoWordmark, BRAND_NAME } from '@/components/ui/logo';
import Stepper from '@/components/ui/Stepper';
import { formatVnDate, nightsBetween } from '@/lib/roomAvailability';
import {
  MAX_ROOMS_PER_BOOKING, availableForRange, bookingNavState, chosenRooms, firstShortage, roomChoiceFrom, roomSummary,
  selectionPrice, suggestedGuestCount, totalRoomCount,
} from '@/lib/roomSelection';
import RoomAvailabilityCalendar, { type CalendarRoomLine } from '@/components/homestay/RoomAvailabilityCalendar';
import { emailError, fullGuestPhone, guestPhoneError } from '@/lib/fieldValidation';
import type { HomestayProfileDetail } from '@/types/homestay';
import { useStickyBottomBar } from '@/hooks/useStickyBottomBar';
import { holdAutoNavigate, noteLocalBookingStatus } from '@/lib/bookingLive';
import { BookingTripResult, BookingTripSection, type BookingTripTarget } from '@/components/booking/BookingTrip';

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Định dạng ISO YYYY-MM-DD -> 'T5, 24/09/2026' (TEST: thống nhất ngày/tháng/năm dd/mm/yyyy)
function formatISODate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${WEEKDAY_SHORT[new Date(isoDate + 'T12:00:00').getDay()] ?? ''}, ${d}/${m}/${y}`;
}

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

export default function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Nhận state từ HomestayDetailPage (các loại phòng đã chọn, ngày ở, số khách).
  const navState = useMemo(() => bookingNavState(location.state), [location.state]);

  // Ngày nhận / trả phòng có thể chỉnh sửa trực tiếp
  // Chuỗi rỗng = chưa chọn. Chỉ có ngày nhận = khách đang chọn lại ngày trả trên lịch: nút đặt phòng tắt cho tới khi đủ.
  const [checkIn, setCheckIn] = useState<string>(() => navState?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState<string>(() => navState?.checkOut ?? '');

  // Các loại phòng của đơn — số phòng từng loại chỉnh được ngay trên trang (0 = bỏ loại đó khỏi đơn, chọn lại được).
  const [roomChoices, setRoomChoices] = useState<BookingRoomChoice[]>(() => navState?.rooms ?? []);
  const chosen = useMemo(() => chosenRooms(roomChoices), [roomChoices]);
  const roomCount = totalRoomCount(roomChoices);
  const changeRoomCount = (roomTypeId: number, count: number) => {
    setRoomChoices((list) => list.map((choice) => (choice.roomTypeId === roomTypeId ? { ...choice, roomCount: Math.max(0, count) } : choice)));
  };

  // Số khách tối đa = sức chứa gợi ý (tổng sức chứa các phòng đã chọn) + 2 khách ở thêm; giảm số phòng thì số khách tự hạ theo.
  const suggestedGuests = suggestedGuestCount(chosen) || 2;
  const maxGuests = suggestedGuests + 2;
  const [guestCount, setGuestCount] = useState<number>(() => {
    const initial = navState?.guestCount && navState.guestCount > 0 ? navState.guestCount : 2;
    return Math.min(initial, maxGuests);
  });
  useEffect(() => {
    setGuestCount((g) => Math.min(g, maxGuests));
  }, [maxGuests]);

  // 1. Số đêm lưu trú (0 khi chưa chọn đủ ngày nhận và ngày trả)
  const hasRange = !!checkIn && !!checkOut && checkOut > checkIn;
  const nights = nightsBetween(checkIn, checkOut);

  // Lịch đã đặt của cả chỗ nghỉ (mỗi khoảng ghi loại phòng) — kiểm tra phòng trống cho từng loại phòng của đơn.
  const [bookedDates, setBookedDates] = useState<BookedDateRangeDto[]>([]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!navState?.placeId) return;
    fetchBookedDatesByPlace(navState.placeId)
      .then((data) => {
        if (Array.isArray(data)) setBookedDates(data);
      })
      .catch((err) => console.warn('fetchBookedDatesByPlace in BookingPage error:', err));
  }, [navState?.placeId]);

  // Phòng còn trống cả khoảng ngày của từng loại phòng.
  const availableByRoom = useMemo(() => {
    const map = new Map<number, number>();
    if (!hasRange) return map;
    for (const choice of roomChoices) {
      map.set(choice.roomTypeId, availableForRange(bookedDates, choice.roomTypeId, choice.totalRoomCount, checkIn, checkOut));
    }
    return map;
  }, [hasRange, roomChoices, bookedDates, checkIn, checkOut]);

  // Kiểm tra tính khả dụng của khoảng ngày đã chọn đối với số phòng từng loại
  const validation = useMemo(() => {
    if (!hasRange) {
      return { isValid: false, message: 'Vui lòng chọn ngày nhận phòng và ngày trả phòng hợp lệ.' };
    }
    if (roomCount <= 0) {
      return { isValid: false, message: 'Vui lòng chọn ít nhất 1 phòng.' };
    }
    if (roomCount > MAX_ROOMS_PER_BOOKING) {
      return { isValid: false, message: `Mỗi đơn đặt tối đa ${MAX_ROOMS_PER_BOOKING} phòng.` };
    }
    const shortage = firstShortage(roomChoices, bookedDates, checkIn, checkOut);
    if (shortage) {
      const { choice, night, available } = shortage;
      return {
        isValid: false,
        message: available <= 0
          ? `${choice.roomTypeName}: đêm ${formatVnDate(night)} đã kín toàn bộ ${choice.totalRoomCount} phòng. Vui lòng chọn khoảng ngày khác.`
          : `${choice.roomTypeName}: đêm ${formatVnDate(night)} chỉ còn ${available}/${choice.totalRoomCount} phòng trống, không đủ ${choice.roomCount} phòng bạn đang chọn.`,
      };
    }
    return { isValid: true, message: '' };
  }, [hasRange, roomCount, roomChoices, bookedDates, checkIn, checkOut]);

  // Lịch: một đêm chỉ chọn được khi mọi loại phòng của đơn đều đủ phòng.
  const calendarLines = useMemo<CalendarRoomLine[]>(
    () => chosen.map((choice) => ({
      name: choice.roomTypeName,
      roomTypeId: choice.roomTypeId,
      bookedDates,
      totalRoomCount: choice.totalRoomCount,
      requestedRoomCount: choice.roomCount,
    })),
    [chosen, bookedDates],
  );

  // Tiền phòng theo từng đêm của từng loại phòng (đêm T7, CN dùng giá cuối tuần) — cùng cách tính với trang chi tiết Homestay.
  const price = useMemo(
    () => (hasRange ? selectionPrice(roomChoices, checkIn, checkOut) : null),
    [hasRange, roomChoices, checkIn, checkOut]
  );
  const totalPrice = price?.total ?? 0;

  // Lấy rating thực tế + giờ nhận/trả phòng NCC đã khai báo.
  const [fetchedRating, setFetchedRating] = useState<{ ratingAvg?: number; ratingCount?: number } | null>(null);
  const [profile, setProfile] = useState<HomestayProfileDetail | null>(null);
  // Tỉnh / thành của chỗ nghỉ — lời mời lên lịch trình gợi ý sau khi đặt xong.
  const [provinceName, setProvinceName] = useState<string | null>(null);
  // Loại phòng của chỗ nghỉ — để thêm loại phòng khác vào cùng đơn.
  const [homestayRooms, setHomestayRooms] = useState<RoomTypeDto[]>([]);

  useEffect(() => {
    if (!navState?.placeId) return;
    getHomestayById(navState.placeId.toString())
      .then((detail) => {
        if (!detail) return;
        setFetchedRating({ ratingAvg: detail.ratingAvg, ratingCount: detail.ratingCount });
        setProfile(detail.homestayProfile ?? null);
        setProvinceName(detail.provinceName ?? null);
        setHomestayRooms(detail.rooms ?? []);
      })
      .catch((err) => {
        console.error('Error fetching homestay detail for booking:', err);
      });
  }, [navState?.placeId]);

  // Loại phòng đang bán, có giá, chưa có trong đơn.
  const addableRooms = useMemo(
    () => homestayRooms.filter((room) => (room.status ?? 'ACTIVE') === 'ACTIVE' && room.basePrice != null
      && !roomChoices.some((choice) => choice.roomTypeId === Number(room.id))),
    [homestayRooms, roomChoices],
  );
  const addRoom = (room: RoomTypeDto) => {
    const choice = roomChoiceFrom(room, 1);
    if (choice) setRoomChoices((list) => [...list, choice]);
  };

  // Đặt chỗ ở cho một lịch trình (mở từ ô "Chỗ ở" của lịch trình): gắn đơn vào lịch trình sau khi tạo — bỏ chọn được.
  const forJourney: BookingTripTarget | null = navState?.journeyId
    ? { id: navState.journeyId, title: navState.journeyTitle?.trim() || 'lịch trình của bạn' }
    : null;
  const [attachJourney, setAttachJourney] = useState(true);

  const checkInTimeText = profile?.checkInFrom ? profile.checkInFrom.slice(0, 5) : '14:00';
  const checkOutTimeText = profile?.checkOutUntil ? profile.checkOutUntil.slice(0, 5) : '12:00';

  const roomInfo = useMemo(() => {
    return {
      placeId: navState?.placeId,
      placeName: navState?.placeName || 'Chỗ nghỉ',
      placeAddress: navState?.placeAddress || '',
      placeRating: navState?.placeRating ?? fetchedRating?.ratingAvg,
      placeReviewCount: navState?.placeReviewCount ?? fetchedRating?.ratingCount,
      coverImageUrl: navState?.coverImageUrl || '',
      latitude: navState?.latitude,
      longitude: navState?.longitude,
      roomName: roomSummary(chosen) || 'Chưa chọn phòng',
      checkInDateStr: checkIn ? formatISODate(checkIn) : '',
      checkInTime: `Từ ${checkInTimeText}`,
      checkOutDateStr: checkOut ? formatISODate(checkOut) : '',
      checkOutTime: `Trước ${checkOutTimeText}`,
    };
  }, [navState, fetchedRating, checkIn, checkOut, chosen, checkInTimeText, checkOutTimeText]);

  // Phiên cổng được xem và điền biểu mẫu; chỉ tài khoản khách được xác nhận đặt phòng.
  const [customer, setCustomer] = useState(getCurrentCustomer);
  const isTraveler = customer?.role === 'TRAVELER';
  const journeyIncluded = !!forJourney && attachJourney && isTraveler;
  const [bookingRestriction, setBookingRestriction] = useState(getBookingRestriction);
  const previewPortalPath = getCurrentPortalCustomer()?.role === 'ADMIN' ? '/admin' : '/partner';

  useEffect(() => {
    const syncSession = () => {
      setCustomer(getCurrentCustomer());
      setBookingRestriction(getBookingRestriction());
    };
    window.addEventListener('auth_change', syncSession);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener('auth_change', syncSession);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  useEffect(() => {
    if (!customer) {
      navigate('/login', {
        state: {
          returnUrl: '/booking',
          bookingState: navState,
          message: 'Vui lòng đăng nhập tài khoản khách hàng để tiến hành đặt phòng.',
        },
        replace: true,
      });
    }
  }, [customer, navState, navigate]);

  // Tự động điền thông tin khách hàng đã đăng nhập vào form
  const [fullName, setFullName] = useState(() => customer?.fullName || '');
  const [countryCode, setCountryCode] = useState('+84');
  const [phone, setPhone] = useState(() => {
    const p = customer?.phone || '';
    return p.startsWith('+84') ? p.slice(3) : p;
  });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [email, setEmail] = useState(() => customer?.email || '');
  const [emailTouched, setEmailTouched] = useState(false);

  // Guest info
  const [guestName, setGuestName] = useState(() => customer?.fullName || '');

  // Price breakdown accordion
  const [isPriceDetailOpen, setIsPriceDetailOpen] = useState(true);

  const handlePhoneBlur = () => {
    setPhoneTouched(true);
  };

  const [isBookingSuccess, setIsBookingSuccess] = useState(false);
  // Thanh tổng tiền + nút đặt dính đáy trên điện thoại: đẩy nút "Về đầu trang" lên trên thanh.
  useStickyBottomBar(!isBookingSuccess);
  // Đang điền form: đơn khác được xác nhận thì chỉ báo, không tự chuyển trang làm mất dữ liệu đang nhập.
  useEffect(() => (isBookingSuccess ? undefined : holdAutoNavigate()), [isBookingSuccess]);
  const [showBookingReview, setShowBookingReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Khóa ngay khi click để không gửi nhiều request trước khi React render lại nút.
  const submittingRef = useRef(false);
  const [bookingResult, setBookingResult] = useState<BookingResponseDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  /**
   * Khách bấm "Ở lại trang này" (hoặc mở xem cả lộ trình): dừng tự chuyển tới chi tiết đơn. Đơn có lịch trình gợi ý chọn
   * kèm ở trang homestay thì không tự chuyển — để khách bấm lưu lịch trình cho đơn.
   */
  const [autoRedirect, setAutoRedirect] = useState(() => !navState?.tripTemplate);
  /** Neo cuộn tới banner lỗi ngay trên nút đặt phòng — khách không phải tự dò lỗi nằm ở đâu. */
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const fail = (message: string) => {
    setSubmitError(message);
    requestAnimationFrame(() => submitErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  // Lỗi của một ô nhập: báo ngay dưới ô đó (không đẩy lên banner gần nút đặt) rồi cuộn + focus vào ô (TEST).
  const [namesTouched, setNamesTouched] = useState(false);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const guestNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const focusField = (ref: React.RefObject<HTMLInputElement | null>) => {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.current?.focus({ preventScroll: true });
    });
  };

  // Tự động chuyển về trang chi tiết đơn sau 5 giây khi đặt phòng thành công
  useEffect(() => {
    if (!isBookingSuccess || !bookingResult?.bookingCode || !autoRedirect) return;

    setRedirectCountdown(5);
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate(`/bookings/${bookingResult.bookingCode}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isBookingSuccess, bookingResult?.bookingCode, navigate, autoRedirect]);

  // Kiểm tra ngay khi gõ: SĐT đúng số chữ số, email đúng dạng (trước đây gõ linh tinh trên 9 ký tự vẫn qua).
  const phoneError = guestPhoneError(countryCode, phone);
  const isPhoneValid = phoneError == null;
  const emailProblem = emailError(email, true);

  const handleSubmitBooking = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (submittingRef.current || isBookingSuccess) return;
    setPhoneTouched(true);
    setEmailTouched(true);
    setNamesTouched(true);
    setSubmitError(null);

    const restriction = getBookingRestriction();
    if (restriction) {
      fail(restriction);
      return;
    }

    const activeCustomer = getCurrentCustomer();
    if (!activeCustomer) {
      fail('Bạn cần đăng nhập tài khoản khách hàng để tiến hành đặt phòng. Đang chuyển đến trang đăng nhập...');
      navigate('/login', {
        state: {
          returnUrl: '/booking',
          bookingState: navState,
          message: 'Vui lòng đăng nhập tài khoản khách hàng để tiến hành đặt phòng.',
        },
      });
      return;
    }
    if (!fullName.trim()) {
      focusField(fullNameRef);
      return;
    }
    if (!guestName.trim()) {
      focusField(guestNameRef);
      return;
    }
    if (phoneError) {
      focusField(phoneRef);
      return;
    }
    if (emailProblem) {
      focusField(emailRef);
      return;
    }
    if (!navState?.placeId || chosen.length === 0 || !checkIn || !checkOut) {
      fail('Thiếu thông tin phòng hoặc ngày lưu trú. Vui lòng kiểm tra lại.');
      return;
    }

    if (!validation.isValid) {
      fail(validation.message || 'Khoảng ngày hoặc số lượng phòng không khả dụng. Vui lòng kiểm tra lại.');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Backend kiểm tra tồn kho và tính lại tổng tiền trong cùng transaction (không gọi quote trước — thêm một
      // request phụ có thể làm treo CTA).
      const result = await createBooking({
        placeId: navState.placeId,
        rooms: chosen.map((choice) => ({ roomTypeId: choice.roomTypeId, roomCount: choice.roomCount })),
        checkIn: checkIn,
        checkOut: checkOut,
        guestCount: guestCount,
        guestName: guestName.trim(),
        guestPhone: fullGuestPhone(countryCode, phone),
        guestEmail: email.trim(),
        // Gắn đơn vào lịch trình đang chọn chỗ ở (lỗi gắn không làm hỏng đơn — xem journeyWarning).
        journeyId: journeyIncluded && forJourney ? forJourney.id : undefined,
      });
      setBookingResult(result);
      saveUserBooking(result);
      // Bộ theo dõi đơn bắt đầu hỏi nhanh: chủ nhà xác nhận là tự chuyển tới chi tiết đơn.
      if (result.bookingCode) noteLocalBookingStatus(result.bookingCode, result.status ?? 'PENDING');
      setIsBookingSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đặt phòng thất bại. Vui lòng thử lại.';
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Nếu chưa đăng nhập khách hàng, hiển thị yêu cầu đăng nhập
  if (!customer) {
    return (
      <div className="min-h-screen bg-[#f6faf8] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-md bg-[#edfbf7] text-[var(--color-primary)] flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-ink-deep)]">Yêu cầu đăng nhập</h2>
          <p className="text-xs text-gray-600">
            Bạn cần đăng nhập tài khoản khách hàng để xem chi tiết và thực hiện đặt phòng. Đang chuyển hướng đến trang đăng nhập...
          </p>
          <Button
            onClick={() =>
              navigate('/login', {
                state: {
                  returnUrl: '/booking',
                  bookingState: navState,
                  message: 'Vui lòng đăng nhập tài khoản khách hàng để tiến hành đặt phòng.',
                },
                replace: true,
              })
            }
            className="w-full cta cta-primary text-white font-bold rounded-md"
          >
            Đăng nhập ngay
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6faf8] text-[var(--color-ink)] flex flex-col">
      {/* Header: Chỉ thuần túy Logo và Tên theo chuẩn */}
      <header className="w-full bg-white/85 backdrop-blur-xl border-b border-slate-200/70 sticky top-0 z-40 shadow-xs pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)]">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" aria-label={`${BRAND_NAME} — Trang chủ`} className="flex items-center gap-2.5 group">
            <LogoMark size={38} className="transition-transform duration-300 group-hover:scale-105" />
            <LogoWordmark height={15} />
          </Link>
          {bookingRestriction && (
            <Link to={previewPortalPath} className="flex min-h-10 shrink-0 items-center rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-[var(--color-primary)] transition-all hover:bg-emerald-50 active:scale-95">
              Về cổng quản lý
            </Link>
          )}
        </div>
      </header>

      {/* Nếu thành công, hiển thị Booking Result View hiện đại, tinh gọn */}
      {isBookingSuccess ? (
        <div className="flex-1 bg-[#F6FAF8] py-8 md:py-14 flex items-center justify-center">
          <div className="max-w-xl w-full mx-auto px-4 space-y-5 animate-in fade-in zoom-in-95 duration-300">
            {/* Main Success Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/50 overflow-hidden transition-all duration-300">
              {/* Header Gradient Accent */}
              <div className="h-2 w-full bg-gradient-to-r from-[var(--color-primary)] via-emerald-400 to-[var(--color-coral)]" />
              
              <div className="p-6 sm:p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center mx-auto mb-4 border border-emerald-100/60 shadow-xs">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Đặt phòng thành công!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                  Yêu cầu của bạn đã được chuyển tới <span className="font-semibold text-slate-800">{roomInfo.placeName}</span>.
                </p>

                {/* Booking Code & Status Pill */}
                <div className="mt-5 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Mã đặt phòng:</span>
                    <span className="text-sm font-mono font-bold text-[var(--color-primary)] tracking-wide">
                      {bookingResult?.bookingCode ?? '—'}
                    </span>
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-[var(--color-primary)] rounded-lg hover:bg-white transition-colors cursor-pointer"
                      title="Sao chép mã"
                      onClick={() => {
                        if (bookingResult?.bookingCode) {
                          navigator.clipboard.writeText(bookingResult.bookingCode);
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-bold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    Chờ chủ nhà xác nhận
                  </div>
                </div>

                {/* Thông tin vắn tắt (Compact Snapshot) */}
                <div className="mt-5 text-left border border-slate-200/80 rounded-xl divide-y divide-slate-100 text-xs sm:text-sm bg-white overflow-hidden shadow-2xs">
                  <div className="p-3.5 flex items-center justify-between gap-4">
                    <span className="text-slate-500 shrink-0">Phòng</span>
                    <span className="font-semibold text-slate-800 text-right truncate">
                      {bookingResult?.rooms?.length ? roomSummary(bookingResult.rooms) : roomInfo.roomName}
                    </span>
                  </div>
                  <div className="p-3.5 flex items-center justify-between gap-4">
                    <span className="text-slate-500 shrink-0">Lưu trú</span>
                    <span className="font-semibold text-slate-700 text-right">
                      {roomInfo.checkInDateStr} → {roomInfo.checkOutDateStr} ({bookingResult?.nights ?? nights} đêm)
                    </span>
                  </div>
                  <div className="p-3.5 flex items-center justify-between gap-4">
                    <span className="text-slate-500 shrink-0">Khách & Phòng</span>
                    <span className="font-semibold text-slate-700 text-right">
                      {bookingResult?.roomCount ?? roomCount} phòng · {bookingResult?.guestCount ?? guestCount} khách ({guestName || fullName})
                    </span>
                  </div>
                  <div className="p-3.5 flex items-center justify-between gap-4 bg-emerald-50/40">
                    <span className="min-w-0 text-slate-700 font-semibold">Tổng tiền · thanh toán sau khi xác nhận</span>
                    <span className="shrink-0 whitespace-nowrap text-base font-black text-[var(--color-coral)]">
                      {new Intl.NumberFormat('vi-VN').format(bookingResult?.totalAmount ?? totalPrice)} VND
                    </span>
                  </div>
                </div>

                {/* Lịch trình: đã gắn đơn, báo nhẹ khi chưa gắn được, hoặc mời lên lịch trình gợi ý cho chuyến đi */}
                {bookingResult?.bookingCode && (
                  <BookingTripResult
                    result={bookingResult}
                    journey={journeyIncluded ? forJourney : null}
                    loggedIn={isTraveler}
                    province={provinceName}
                    placeId={navState?.placeId ?? null}
                    trip={navState?.tripTemplate ? { template: navState.tripTemplate, title: navState.tripTitle ?? null, filters: navState.tripFilters ?? null } : null}
                  />
                )}

                {/* Đếm ngược 5 giây tự chuyển tới chi tiết đơn — khách có thể ở lại để xem kỹ */}
                {autoRedirect && (
                  <div className="mt-6 p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl text-left">
                    <div className="flex items-center justify-between gap-2 text-xs text-emerald-950 font-medium mb-1.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary)]" />
                        <span>
                          Tự chuyển đến chi tiết đơn sau{' '}
                          <span className="font-bold text-[var(--color-primary)] font-mono">{redirectCountdown}s</span>
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setAutoRedirect(false)}
                        className="shrink-0 rounded-full px-2.5 py-1 font-bold text-[var(--color-primary)] hover:bg-white hover:shadow-xs transition-all cursor-pointer"
                      >
                        Ở lại trang này
                      </button>
                    </div>
                    <div className="w-full bg-emerald-200/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${((5 - redirectCountdown) / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/')}
                    className="flex-1 py-2.5 h-11 bg-white border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all text-xs sm:text-sm cursor-pointer active:scale-95"
                  >
                    Về trang chủ
                  </Button>
                  <Button
                    onClick={() => {
                      if (bookingResult?.bookingCode) {
                        navigate(`/bookings/${bookingResult.bookingCode}`);
                      } else {
                        navigate('/bookings');
                      }
                    }}
                    className="flex-1 py-2.5 h-11 cta cta-primary text-white font-bold rounded-xl shadow-sm transition-all text-xs sm:text-sm cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                  >
                    <span>Theo dõi đơn đặt</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <main className="flex-1 py-6 md:py-8">
          <div className="max-w-[1180px] mx-auto px-4 pb-28 md:px-6 lg:pb-6">
            {bookingRestriction && (
              <div id="booking-preview-notice" role="status" className="mb-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-bold">Chế độ xem thử</p>
                  <p className="mt-1">{bookingRestriction}</p>
                </div>
              </div>
            )}

            {/* Nút quay lại & Tiêu đề trang */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigate(-1)}
                type="button"
                className="text-xs md:text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 transition-colors cursor-pointer"
              >
                ← Quay lại chi tiết chỗ nghỉ
              </button>
              <span className="text-xs text-[var(--color-muted)] font-medium">
                Bước 1: Điền thông tin đặt chỗ
              </span>
            </div>

            {/* TÊN VÀ ĐÁNH GIÁ THỰC TẾ TỪ CHỖ NGHỈ */}
            <div className="mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-[var(--color-ink-deep)] leading-tight mb-1.5">
                {roomInfo.placeName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                {roomInfo.placeRating ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-sm border border-amber-200 text-amber-900 font-bold text-xs">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>{Number(roomInfo.placeRating).toFixed(1)} / 5.0</span>
                    </div>
                    {roomInfo.placeReviewCount !== undefined && roomInfo.placeReviewCount > 0 && (
                      <span className="text-gray-500 font-medium">({roomInfo.placeReviewCount} đánh giá)</span>
                    )}
                  </div>
                ) : null}

                {roomInfo.placeAddress && (
                  <div className="text-gray-500 flex items-center gap-1">
                    {roomInfo.placeRating ? <span className="text-gray-300 font-bold mr-1">·</span> : null}
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>{roomInfo.placeAddress}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grid 2 cột */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* ================= CỘT TRÁI: FORM ĐIỀN THÔNG TIN ================= */}
              <div className="lg:col-span-7 space-y-6">

                {/* Khối 1: Liên hệ đặt chỗ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 md:p-7">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center shrink-0 border border-emerald-100/60 shadow-2xs">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Liên hệ đặt chỗ</h2>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Thông tin liên hệ nhận xác nhận đặt phòng
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Họ tên người liên hệ */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Họ và tên người liên hệ<span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <input
                        ref={fullNameRef}
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`w-full h-11 px-4 text-sm bg-white border rounded-xl transition-all outline-none ${namesTouched && !fullName.trim()
                            ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                          }`}
                        placeholder="Nhập họ và tên đầy đủ"
                      />
                      {namesTouched && !fullName.trim() && (
                        <span role="alert" className="text-xs font-medium text-rose-500 mt-1 block">Vui lòng nhập họ và tên liên hệ.</span>
                      )}
                    </div>

                    {/* Họ tên khách lưu trú */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Họ tên khách lưu trú<span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <input
                        ref={guestNameRef}
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className={`w-full h-11 px-4 text-sm bg-white border rounded-xl transition-all outline-none ${namesTouched && !guestName.trim()
                            ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                          }`}
                        placeholder="Nhập họ tên khách lưu trú"
                      />
                      {namesTouched && !guestName.trim() && (
                        <span role="alert" className="text-xs font-medium text-rose-500 mt-1 block">Vui lòng nhập họ tên khách lưu trú.</span>
                      )}
                    </div>

                    {/* SĐT + Email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Điện thoại di động<span className="text-rose-500 ml-0.5">*</span>
                        </label>
                        <div className="flex gap-2">
                          <div className="relative">
                            <select
                              value={countryCode}
                              onChange={(e) => setCountryCode(e.target.value)}
                              className="h-11 pl-3 pr-8 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl appearance-none cursor-pointer focus:border-[var(--color-primary)] outline-none"
                            >
                              <option value="+84">+84</option>
                              <option value="+1">+1</option>
                              <option value="+82">+82</option>
                              <option value="+81">+81</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-4 pointer-events-none" />
                          </div>
                          <div className="flex-1">
                            <input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              ref={phoneRef}
                              maxLength={16}
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s.+-]/g, ''))}
                              onBlur={handlePhoneBlur}
                              className={`w-full h-11 px-4 text-sm bg-white border rounded-xl transition-all outline-none ${phoneTouched && !isPhoneValid
                                  ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                                  : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                                }`}
                              placeholder="VD: 0912 345 678"
                            />
                          </div>
                        </div>
                        {phoneTouched && phoneError && (
                          <span role="alert" className="text-xs font-medium text-rose-500 mt-1 block">
                            {phoneError}
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Email<span className="text-rose-500 ml-0.5">*</span>
                        </label>
                        <input
                          type="email"
                          inputMode="email"
                          ref={emailRef}
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value.trim())}
                          onBlur={() => setEmailTouched(true)}
                          className={`w-full h-11 px-4 text-sm bg-white border rounded-xl transition-all outline-none ${emailTouched && emailProblem
                              ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500'
                              : 'border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-emerald-500/10'
                            }`}
                          placeholder="VD: ten@gmail.com"
                        />
                        {emailTouched && emailProblem && (
                          <span role="alert" className="text-xs font-medium text-rose-500 mt-1 block">
                            {emailProblem}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ================= KHỐI PHÒNG & LỊCH PHÒNG ================= */}
                <div
                  className={`bg-white rounded-2xl border shadow-xs overflow-hidden transition-all ${
                    hasRange && !validation.isValid ? 'border-rose-300 ring-2 ring-rose-200' : 'border-slate-200/80'
                  }`}
                >
                  <div className="p-5 sm:p-6 md:p-7">
                    <div className="flex items-center justify-between gap-2 mb-4 pb-3.5 border-b border-slate-100">
                      <h3 className="font-bold text-lg md:text-xl text-slate-900 leading-snug">Phòng đã chọn</h3>
                      <span className="text-xs font-bold text-[var(--color-primary)] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                        {roomCount} phòng{hasRange ? ` · ${nights} đêm` : ''}
                      </span>
                    </div>

                    {/* Từng loại phòng: giá, phòng còn trống thật cho khoảng ngày đã chọn, số phòng đặt */}
                    <div className="space-y-3 mb-4">
                      {roomChoices.map((choice) => {
                        const available = availableByRoom.get(choice.roomTypeId);
                        const short = hasRange && available != null && available < choice.roomCount;
                        const minCount = roomChoices.length > 1 ? 0 : 1;
                        const maxCount = Math.max(minCount, Math.min(
                          choice.totalRoomCount,
                          MAX_ROOMS_PER_BOOKING - (roomCount - choice.roomCount),
                          hasRange && available != null ? available : choice.totalRoomCount,
                        ));
                        return (
                          <div
                            key={choice.roomTypeId}
                            className={`rounded-xl border p-4 transition-all duration-200 ${
                              choice.roomCount === 0 ? 'border-dashed border-slate-200 bg-slate-50/60'
                                : short ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`font-bold leading-snug text-base ${choice.roomCount === 0 ? 'text-slate-400' : 'text-slate-900'}`}>
                                  {choice.roomTypeName}
                                </div>
                                <div className={`text-xs font-semibold mt-1 ${hasRange ? (short || available === 0 ? 'text-rose-600' : 'text-emerald-700') : 'text-slate-400'}`}>
                                  {hasRange
                                    ? available != null && available > 0
                                      ? `Còn ${available} phòng trống cho ngày đã chọn`
                                      : 'Hết phòng cho ngày đã chọn'
                                    : `${choice.totalRoomCount} phòng loại này · chọn ngày để xem phòng trống`}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-lg font-black text-[var(--color-coral)]">{vnd(choice.basePrice)}đ</span>
                                <span className="text-xs text-slate-400 font-medium"> /đêm</span>
                                {choice.weekendPrice && choice.weekendPrice !== choice.basePrice ? (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Cuối tuần (T7, CN): {vnd(choice.weekendPrice)}đ
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-100">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                                <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-400" />Tối đa {choice.maxOccupancy} khách/phòng</span>
                                {choice.bedInfo && <span className="flex items-center gap-1.5"><BedDouble className="w-3.5 h-3.5 text-slate-400" />{choice.bedInfo}</span>}
                                <span className="flex items-center gap-1.5">
                                  <Utensils className="w-3.5 h-3.5 text-slate-400" />{choice.hasBreakfast ? 'Có bữa sáng' : 'Không gồm bữa sáng'}
                                </span>
                              </div>
                              <div className="sm:w-56 shrink-0">
                                <Stepper
                                  label="Số phòng"
                                  value={choice.roomCount}
                                  min={minCount}
                                  max={maxCount}
                                  onChange={(v) => changeRoomCount(choice.roomTypeId, Math.max(minCount, Math.min(maxCount, v)))}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Thêm loại phòng khác của chỗ nghỉ vào cùng đơn */}
                    {addableRooms.length > 0 && roomCount < MAX_ROOMS_PER_BOOKING && (
                      <div className="mb-4">
                        <p className="text-xs font-bold text-slate-700 mb-2">Thêm loại phòng khác vào đơn:</p>
                        <div className="flex flex-wrap gap-2">
                          {addableRooms.map((room) => (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => addRoom(room)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-[var(--color-primary)] transition-all hover:border-[var(--color-primary)] hover:bg-emerald-50 active:scale-95 cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {room.name}
                              {room.basePrice != null && <span className="font-semibold text-slate-500">· {vnd(room.basePrice)}đ</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-4 sm:w-1/2 sm:pr-1">
                      <Stepper
                        label="Khách"
                        value={guestCount}
                        min={1}
                        max={maxGuests}
                        onChange={(v) => setGuestCount(Math.max(1, Math.min(maxGuests, v)))}
                        hint={`Gợi ý ${suggestedGuests} · tối đa ${maxGuests} khách`}
                      />
                    </div>

                    {/* Lịch phòng: ô Nhận / Trả phòng ở đầu lịch thay cho ô nhập ngày; đêm chọn được khi mọi loại phòng đủ phòng */}
                    <RoomAvailabilityCalendar
                      lines={calendarLines}
                      checkIn={checkIn || null}
                      checkOut={checkOut || null}
                      onChange={(inDate, outDate) => {
                        setCheckIn(inDate ?? '');
                        setCheckOut(outDate ?? '');
                      }}
                    />

                    {/* Chỉ báo lỗi khi khoảng ngày đã chọn không đủ phòng */}
                    {hasRange && !validation.isValid && (
                      <div role="alert" className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{validation.message}</span>
                      </div>
                    )}

                    {/* Tóm tắt phòng */}
                    <div className="space-y-2 text-xs text-slate-700 pt-3 mt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-medium">{guestCount} khách · {roomCount} phòng{hasRange ? ` · ${nights} đêm` : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Đặt cho một lịch trình (từ ô "Chỗ ở"): tùy chọn gắn đơn vào lịch trình */}
                {forJourney && (
                  <BookingTripSection
                    journey={forJourney}
                    attach={attachJourney}
                    onAttachChange={setAttachJourney}
                    loggedIn={isTraveler}
                  />
                )}

                {/* Khối 4: Nhận phòng & thanh toán (không còn hiển thị chính sách hủy) */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 md:p-7">
                  <div className="flex items-center gap-3 pb-3.5 border-b border-slate-100 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center shrink-0 border border-emerald-100/60 shadow-2xs">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base md:text-lg font-bold text-slate-900">Nhận phòng & thanh toán</h2>
                      <p className="text-xs text-slate-500">Những điều cần biết trước chuyến đi</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-slate-900">Nhận phòng từ {checkInTimeText} · Trả phòng trước {checkOutTimeText}</div>
                        <div className="text-slate-500 text-[11px] mt-0.5">Vui lòng mang CCCD / Hộ chiếu khi làm thủ tục.</div>
                      </div>
                    </div>
                    <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/60 flex items-start gap-3">
                      <Banknote className="w-4 h-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-slate-900">Chưa cần thanh toán khi đặt</div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          Khi đơn được xác nhận, bạn liên hệ Zalo để được hướng dẫn thanh toán.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* ================= CỘT PHẢI: STICKY SIDEBAR TÓM TẮT & GIÁ ================= */}
              <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">

                {/* Thẻ Chi tiết giá & Nút Xác nhận đặt phòng */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
                  {/* Tiêu đề Chi tiết giá + Accordion */}
                  <button
                    type="button"
                    onClick={() => setIsPriceDetailOpen(!isPriceDetailOpen)}
                    aria-expanded={isPriceDetailOpen}
                    className="w-full flex items-center justify-between cursor-pointer select-none pb-3.5 border-b border-slate-100 mb-4"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                      <span className="font-bold text-base text-slate-900">Chi tiết giá</span>
                    </span>
                    {isPriceDetailOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isPriceDetailOpen && (
                    <div className="space-y-3 text-xs text-slate-600 mb-4 animate-in fade-in duration-150">
                      {price && price.lines.length > 0 ? (
                        price.lines.map((line) => (
                          <div key={line.choice.roomTypeId} className="space-y-2 pb-2 border-b border-slate-100 last:border-b-0">
                            {price.lines.length > 1 && (
                              <div className="font-bold text-slate-900">{line.choice.roomTypeName} × {line.choice.roomCount}</div>
                            )}
                            {line.weekdayNights > 0 && (
                              <div className="flex justify-between items-start gap-3">
                                <div>
                                  <span className="text-slate-800 font-medium">Ngày thường ({line.weekdayNights} đêm × {line.choice.roomCount} phòng)</span>
                                  <div className="text-[11px] text-slate-400">{vnd(line.choice.basePrice)}đ / phòng / đêm</div>
                                </div>
                                <span className="font-semibold text-slate-800 shrink-0">
                                  {vnd(line.choice.basePrice * line.weekdayNights * line.choice.roomCount)} VND
                                </span>
                              </div>
                            )}
                            {line.weekendNights > 0 && (
                              <div className="flex justify-between items-start gap-3">
                                <div>
                                  <span className="text-slate-800 font-medium">Cuối tuần T7, CN ({line.weekendNights} đêm × {line.choice.roomCount} phòng)</span>
                                  <div className="text-[11px] text-slate-400">{vnd(line.choice.weekendPrice ?? line.choice.basePrice)}đ / phòng / đêm</div>
                                </div>
                                <span className="font-semibold text-slate-800 shrink-0">
                                  {vnd((line.choice.weekendPrice ?? line.choice.basePrice) * line.weekendNights * line.choice.roomCount)} VND
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400">
                          {hasRange ? 'Chọn ít nhất 1 phòng để xem giá.' : 'Chọn đủ ngày nhận và ngày trả phòng để xem giá.'}
                        </p>
                      )}

                      <div className="flex justify-between items-center gap-3 pt-1">
                        <div>
                          <span className="text-slate-800 font-medium">Thuế và phí dịch vụ</span>
                          <div className="text-[11px] text-slate-400">Giá minh bạch, không phí ẩn</div>
                        </div>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                          Đã bao gồm
                        </span>
                      </div>

                    </div>
                  )}

                  {/* Tổng cộng — điện thoại đã có thanh tổng tiền + nút ở đáy màn hình */}
                  <div className="hidden lg:block pt-3 border-t border-slate-100 mb-4">
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <div className="font-bold text-sm text-slate-900">Tổng chi phí</div>
                        <div className="text-xs text-slate-400">
                          {roomCount} phòng{hasRange ? `, ${nights} đêm` : ''}
                        </div>
                      </div>
                      <div className="text-xl md:text-2xl font-black text-[var(--color-coral)] leading-tight">
                        {hasRange ? `${new Intl.NumberFormat('vi-VN').format(totalPrice)} VND` : '—'}
                      </div>
                    </div>

                    {/* Thanh toán hôm nay vs sau khi xác nhận */}
                    <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200/70 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-emerald-900 font-bold">
                        <span>Thanh toán hôm nay:</span>
                        <span className="text-sm text-emerald-600">0 VND</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 font-medium">
                        <span>Thanh toán sau khi xác nhận:</span>
                        <span className="font-bold text-slate-900">{hasRange ? `${new Intl.NumberFormat('vi-VN').format(totalPrice)} VND` : '—'}</span>
                      </div>
                      <div className="text-[11px] text-emerald-800 leading-relaxed pt-0.5">
                        Đơn được xác nhận, bạn sẽ được hướng dẫn thanh toán an toàn qua Zalo.
                      </div>
                    </div>
                  </div>

                  {/* Đơn gắn vào lịch trình: nhắc ngay trên nút đặt */}
                  {journeyIncluded && forJourney && (
                    // Nút cuộn (không dùng link #hash: đổi hash làm mất navigation state của trang đặt phòng).
                    <button
                      type="button"
                      onClick={() => document.getElementById('booking-journey')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="hidden lg:flex w-full items-center gap-2.5 mb-3 rounded-xl border border-teal-200 bg-[#f4fbf8] px-3.5 py-2.5 text-left text-xs text-slate-800 transition-all hover:bg-[#edfbf7] cursor-pointer"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-xs">
                        <Route className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-slate-900">Cho lịch trình “{forJourney.title}”</span>
                        <span className="block text-[11px] text-slate-500">Đơn tự gắn vào lịch trình khi bạn xác nhận đặt phòng</span>
                      </span>
                      <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" strokeWidth={3} />
                    </button>
                  )}

                  {/* Nút Xác nhận đặt phòng CTA */}
                  {submitError && (
                    <div ref={submitErrorRef} role="alert" className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 font-medium mb-3">
                      <Info className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{submitError}</span>
                    </div>
                  )}
                  <Button
                    onClick={() => setShowBookingReview(true)}
                    disabled={Boolean(bookingRestriction) || isSubmitting || !validation.isValid}
                    aria-describedby={bookingRestriction ? 'booking-preview-notice' : undefined}
                    className={`hidden lg:flex w-full h-12 font-bold rounded-xl shadow-xs transition-all items-center justify-center gap-2 active:scale-98 ${
                      bookingRestriction || !validation.isValid
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'cta cta-primary text-white cursor-pointer shadow-md shadow-emerald-700/20'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span className="text-base">Đang xử lý…</span>
                      </>
                    ) : (
                      <span className="text-base">{bookingRestriction ? 'Không thể đặt phòng' : !checkIn ? 'Chọn ngày nhận phòng' : !checkOut ? 'Chọn ngày trả phòng' : roomCount === 0 ? 'Chọn số phòng' : 'Xác nhận đặt phòng'}</span>
                    )}
                  </Button>

                  {/* Lời nhắn dưới nút */}
                  <p className="text-[11px] text-slate-400 mt-3 leading-normal text-center">
                    Bạn chưa cần thanh toán khoản nào hôm nay.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </main>
      )}

      {showBookingReview && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Xem lại đơn đặt phòng</h2>
              <button type="button" onClick={() => setShowBookingReview(false)} className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Bảng tóm tắt: nhãn trái, giá trị phải — quét nhanh trước khi xác nhận */}
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 text-sm">
              {([
                ['Chỗ nghỉ', roomInfo.placeName],
                ['Phòng', `${roomInfo.roomName} · ${guestCount} khách`],
                ['Lưu trú', `${formatISODate(checkIn)} → ${formatISODate(checkOut)} (${nights} đêm)`],
                ['Khách lưu trú', guestName || fullName],
                ['Giờ nhận / trả', `Từ ${checkInTimeText} · trước ${checkOutTimeText}`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="min-w-0 text-right font-semibold text-slate-800">{value}</dd>
                </div>
              ))}
              {journeyIncluded && forJourney && (
                <div className="flex items-center justify-between gap-4 bg-[#f4fbf8] px-3.5 py-2.5">
                  <dt className="flex shrink-0 items-center gap-1.5 text-slate-500">
                    <Route className="h-4 w-4 text-[var(--color-primary)]" /> Lịch trình
                  </dt>
                  <dd className="min-w-0 text-right font-semibold text-[var(--color-primary)]">
                    {forJourney.title} · gắn cùng đơn
                  </dd>
                </div>
              )}
              <div className="flex items-end justify-between gap-4 bg-slate-50 px-3.5 py-3">
                <dt className="shrink-0">
                  <span className="block font-bold text-slate-800">Tổng tiền</span>
                  <span className="block text-[11px] text-slate-500">Thanh toán sau khi được xác nhận</span>
                </dt>
                <dd className="whitespace-nowrap text-right text-lg font-black text-[var(--color-coral)]">{new Intl.NumberFormat('vi-VN').format(totalPrice)} VND</dd>
              </div>
            </dl>
            <p className="mt-3.5 rounded-xl bg-amber-50/90 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed">
              Chủ nhà sẽ xác nhận đơn sớm nhất. Khi đơn được xác nhận, màn hình tự chuyển tới chi tiết đơn để bạn thanh toán qua Zalo.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button type="button" variant="outline" onClick={() => setShowBookingReview(false)} className="rounded-xl font-bold">Chỉnh sửa</Button>
              <Button type="button" disabled={Boolean(bookingRestriction) || isSubmitting} onClick={(event) => { if (isSubmitting || submittingRef.current) return; setShowBookingReview(false); void handleSubmitBooking(event); }} className="rounded-xl font-bold cta cta-primary text-white shadow-sm">{bookingRestriction ? 'Không thể đặt phòng' : isSubmitting ? 'Đang xử lý…' : 'Xác nhận đặt phòng'}</Button>
            </div>
          </div>
        </div>
      , document.body)}

    {/* Thanh đặt phòng sticky trên mobile — trang dài 4 màn hình, khách không phải cuộn tới đáy mới thấy nút */}
    {!isBookingSuccess && (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(var(--safe-bottom),0.75rem)] pt-3 shadow-[0_-4px_20px_rgba(10,46,38,0.08)] backdrop-blur-md lg:hidden">
        {submitError && (
          <p role="alert" className="mx-auto mb-2 max-w-[1180px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{submitError}</p>
        )}
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-[var(--color-coral)] md:text-lg">
              {hasRange ? `${new Intl.NumberFormat('vi-VN').format(totalPrice)}đ` : 'Chưa chọn đủ ngày'}
              {hasRange && (
                <span className="ml-1 text-[11px] font-semibold text-slate-400">
                  · {nights} đêm · {roomCount} phòng
                </span>
              )}
            </p>
            <p className="truncate text-[11px] font-medium text-slate-500">
              {bookingRestriction ? 'Chế độ xem thử' : journeyIncluded && forJourney ? (
                <>
                  {/* Chạm để cuộn tới mục lịch trình (nằm dưới lịch phòng) */}
                  <button
                    type="button"
                    onClick={() => document.getElementById('booking-journey')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="font-bold text-[var(--color-primary)] underline-offset-2 hover:underline cursor-pointer"
                  >
                    <Route className="mr-1 inline h-3 w-3 -translate-y-px" />
                    Cho lịch trình “{forJourney.title}”
                  </button>{' '}
                  · chưa cần thanh toán
                </>
              ) : 'Chưa cần thanh toán lúc đặt'}
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(bookingRestriction) || isSubmitting || !validation.isValid}
            aria-describedby={bookingRestriction ? 'booking-preview-notice' : undefined}
            onClick={() => {
              setSubmitError(null);
              setShowBookingReview(true);
            }}
            className={`h-11 shrink-0 rounded-xl px-5 text-sm font-bold text-white shadow-xs transition-all active:scale-95 ${
              !bookingRestriction && validation.isValid
                ? 'cta cta-primary cursor-pointer shadow-md shadow-emerald-700/20'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            {bookingRestriction ? 'Không thể đặt' : isSubmitting ? 'Đang xử lý…' : !checkIn ? 'Chọn ngày nhận' : !checkOut ? 'Chọn ngày trả' : roomCount === 0 ? 'Chọn phòng' : 'Đặt phòng'}
          </button>
        </div>
      </div>
    )}
    </div>
  );
}
