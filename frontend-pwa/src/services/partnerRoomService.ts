import axios from 'axios';
import { partnerCached } from '@/lib/partnerCache';
import type { PartnerRoom, PartnerRoomInput, RoomPrice, RoomPriceInput, RoomInventoryInput, RoomInventoryDay, RoomQuote, HomestayBlockInput, HomestayChangeLog, HomestayAvailability, RoomLockInput, RoomLockResult, HomestayUnits, UnitDay, CalendarBootstrap, UpcomingStay } from '@/types/room';
import type { HomestayOptionsDto } from '@/types/partner';
import type { SubmittedChange } from '@/types/changeRequest';
const config = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` } });
const base = (placeId: number) => `/api/v1/partner/homestays/${placeId}/rooms`;
export const partnerRoomService = {
  async list(placeId: number) { return (await axios.get<PartnerRoom[]>(base(placeId),config())).data; },
  /** Danh mục tiện ích loại phòng (như nhau với mọi Homestay, gần như không đổi): giữ trong cache của tab. */
  async options(placeId: number,priority: 'high' | 'low' = 'high') { return partnerCached('room-options',async()=>(await axios.get<HomestayOptionsDto['amenities']>(`${base(placeId)}/options`,{...config(),apiPriority:priority})).data,30*60_000); },
  async save(placeId: number, id: number | null, input: PartnerRoomInput) { return (await axios.request<PartnerRoom | SubmittedChange>({url: id == null ? base(placeId) : `${base(placeId)}/${id}`,method: id == null ? 'POST' : 'PUT',data:input,...config()})).data; },
  async prices(placeId: number,id: number) { return (await axios.get<RoomPrice[]>(`${base(placeId)}/${id}/prices`,config())).data; },
  async savePrice(placeId: number,id: number,priceId: number | null,input: RoomPriceInput) { return (await axios.request<RoomPrice | SubmittedChange>({url:`${base(placeId)}/${id}/prices${priceId == null ? '' : `/${priceId}`}`,method:priceId==null?'POST':'PUT',data:input,...config()})).data; },
  /** Trả SubmittedChange khi Homestay đang công khai (yêu cầu xóa chờ Admin duyệt); undefined khi đã xóa trực tiếp. */
  async deletePrice(placeId: number,id: number,priceId: number): Promise<SubmittedChange | undefined> { const r=await axios.delete<SubmittedChange | ''>(`${base(placeId)}/${id}/prices/${priceId}`,config()); return r.status===202 && r.data!=='' ? r.data : undefined; },
  async calendar(placeId: number,id: number,startDate: string,endDate: string) { return (await axios.get<RoomInventoryDay[]>(`${base(placeId)}/${id}/calendar`,{...config(),params:{startDate,endDate}})).data; },
  async inventory(placeId: number,id: number,input: RoomInventoryInput) { await axios.put(`${base(placeId)}/${id}/calendar`,input,config()); },
  async quote(placeId: number,id: number,startDate: string,endDate: string,roomCount: number,guestCount: number) { return (await axios.get<RoomQuote>(`${base(placeId)}/${id}/quote`,{...config(),params:{startDate,endDate,roomCount,guestCount}})).data; },
  /** Ngừng / mở phục vụ cả Homestay theo ngày; trả về số ngày-loại phòng đã có đơn (đơn cũ vẫn giữ nguyên). */
  async blockHomestay(placeId: number,input: HomestayBlockInput) { return (await axios.put<{ bookedDays: number }>(`/api/v1/partner/homestays/${placeId}/calendar-block`,input,config())).data; },
  /** Lịch phòng tổng hợp: mọi loại phòng × các ngày trong [startDate, endDate). Timeout dài vì request đầu có thể rơi vào container backend đang khởi động (~15 giây). */
  async availability(placeId: number,startDate: string,endDate: string) { return (await axios.get<HomestayAvailability>(`/api/v1/partner/homestays/${placeId}/availability`,{...config(),timeout:30000,params:{startDate,endDate}})).data; },
  /** Đơn còn hiệu lực chưa trả phòng của loại phòng — hỏi lại chủ nhà trước khi khóa loại phòng. */
  async upcomingStays(placeId: number,id: number) { return (await axios.get<UpcomingStay[]>(`${base(placeId)}/${id}/upcoming-stays`,config())).data; },
  /** Khóa / mở phòng một loại phòng theo khoảng ngày; 409 khi lịch đã bị sửa ở nơi khác kể từ lúc tải. */
  async lockRooms(placeId: number,id: number,input: RoomLockInput) { return (await axios.put<RoomLockResult>(`${base(placeId)}/${id}/locks`,input,{...config(),timeout:30000})).data; },
  /** Lịch theo từng phòng (Phòng 1, Phòng 2...) của mọi loại phòng trong Homestay, [startDate, endDate). */
  async units(placeId: number,startDate: string,endDate: string,priority: 'high' | 'low' = 'high') { return (await axios.get<HomestayUnits>(`/api/v1/partner/homestays/${placeId}/units`,{...config(),timeout:30000,apiPriority:priority,params:{startDate,endDate}})).data; },
  /**
   * Mở trang Lịch phòng trong MỘT lượt gọi: danh sách Homestay + lịch của Homestay đang xem. prefer = Homestay muốn xem
   * theo thứ tự (đường dẫn, lựa chọn lần trước); máy chủ bỏ qua id không thuộc NCC, không có thì lấy Homestay đầu tiên.
   */
  async calendarBootstrap(prefer: number[],startDate: string,endDate: string) { return (await axios.get<CalendarBootstrap>('/api/v1/partner/calendar',{...config(),timeout:30000,params:{prefer:prefer.join(',')||undefined,startDate,endDate}})).data; },
  /** Khóa (locked=true) / mở một phòng trong một ngày. Khóa phòng có khách thì khách được chuyển sang phòng trống; 409 khi hết phòng trống. */
  async setUnit(placeId: number,id: number,unitNo: number,stayDate: string,locked: boolean) { return (await axios.put<UnitDay>(`${base(placeId)}/${id}/units/${unitNo}`,{stayDate,locked},{...config(),timeout:30000})).data; },
  async changeLog(placeId: number) { return (await axios.get<HomestayChangeLog[]>(`/api/v1/partner/homestays/${placeId}/change-log`,config())).data; },
};
