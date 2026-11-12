import { partnerBookingService } from '@/services/partnerBookingService';
import { homestayError } from '@/services/partnerHomestayService';
import type { Decision, DecisionSummary } from '@/components/partner/BookingDecisionDialog';
import type { PartnerBookingDetailDto, PartnerBookingRowDto } from '@/types/booking';

/** Tóm tắt đơn cho hộp xác nhận, từ dòng danh sách hoặc chi tiết đơn của NCC. */
export function decisionSummary(b: PartnerBookingRowDto | PartnerBookingDetailDto): DecisionSummary {
  return {
    bookingCode: b.bookingCode, guestName: b.guestName, guestPhone: b.guestPhone, roomTypeName: b.roomTypeName ?? '',
    roomCount: b.roomCount, guestCount: b.guestCount, checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights,
    totalAmount: b.totalAmount, guestNote: b.guestNote,
  };
}

/** Thực hiện thao tác của NCC; lỗi API đổi thành Error có câu thông báo dễ hiểu cho hộp xác nhận. */
export async function runPartnerDecision(decision: Decision, note?: string): Promise<PartnerBookingDetailDto> {
  try {
    return await partnerBookingService.act(decision.id, decision.action, note);
  } catch (e: unknown) {
    throw new Error(homestayError(e));
  }
}
