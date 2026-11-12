import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, Bus, Wallet, UtensilsCrossed, ShieldAlert, Phone, Siren,
  ChevronRight, Mountain, CloudSun, Bike, Car, Footprints, Info,
} from 'lucide-react';
import EmergencySosModal from '@/components/customer/EmergencySosModal';
import Reveal from '@/components/ui/Reveal';
import heroBg from '@/assets/photos/banner-guide.webp';

/** Bảng mục lục nhanh dạng chip, bấm cuộn tới mục tương ứng. */
const SECTIONS = [
  { id: 'thoi-diem', label: 'Thời điểm đẹp', icon: CalendarClock },
  { id: 'di-chuyen', label: 'Di chuyển', icon: Bus },
  { id: 'chi-phi', label: 'Chi phí', icon: Wallet },
  { id: 'am-thuc', label: 'Ẩm thực', icon: UtensilsCrossed },
  { id: 'an-toan', label: 'An toàn & lưu ý', icon: ShieldAlert },
  { id: 'khan-cap', label: 'Khẩn cấp', icon: Phone },
];

const SEASONS = [
  { name: 'Mùa nước đổ', time: 'Tháng 5 – đầu tháng 7', desc: 'Ruộng ngập nước như tấm gương khổng lồ phản chiếu mây trời — mùa "săn gương" của nhiếp ảnh gia.', tone: 'sky' },
  { name: 'Mùa lúa xanh', time: 'Tháng 7 – 8', desc: 'Cả thung lũng xanh mướt, khí hậu mát dễ chịu, ít khách — hợp nghỉ dưỡng và trekking nhẹ.', tone: 'emerald' },
  { name: 'Mùa lúa chín (vàng)', time: 'Giữa tháng 9 – giữa tháng 10', desc: 'Thời điểm vàng: ruộng nhuộm vàng óng, thời tiết đẹp, nhiều lễ hội. Đặt homestay sớm 2–4 tuần.', tone: 'amber' },
  { name: 'Mùa mây & đông', time: 'Tháng 11 – tháng 2', desc: 'Săn mây đèo Khau Phạ, sương giá, hoa mận đào đầu xuân. Rét khô, mang đồ ấm kỹ.', tone: 'slate' },
];

const COSTS = [
  { item: 'Homestay bản địa', cost: '200.000đ – 1.800.000đ', unit: '/đêm/phòng', note: 'Theo giá niêm yết 6 homestay trên nền tảng' },
  { item: 'Ăn sáng ở chợ / quán', cost: '20.000đ – 40.000đ', unit: '/bữa', note: 'Phở, xôi, bánh mơ...' },
  { item: 'Bữa trưa/tối địa phương', cost: '50.000đ – 120.000đ', unit: '/bữa', note: 'Cơm bụi đến món đặt như gà nướng mắc khén' },
  { item: 'Thuê xe máy tại địa phương', cost: '~120.000đ – 250.000đ', unit: '/ngày', note: 'Hỏi chủ homestay, thường có sẵn' },
  { item: 'Xe khách Hà Nội – Mù Cang Chải', cost: '~200.000đ – 350.000đ', unit: '/chiều', note: 'Giường nằm, bến Mỹ Đình / Yên Nghĩa' },
  { item: 'Suối khoáng nóng Tú Lệ', cost: 'vài chục nghìn', unit: '/lượt', note: 'Bể tập thể, mang sẵn đồ' },
];

const NOTES = [
  { title: 'Đèo Khau Phạ sương mù', desc: 'Sáng sớm và chiều muộn sương dày, tầm nhìn kém — bật đèn, giữ khoảng cách, không vượt xe trên đèo.' },
  { title: 'Sóng & Internet', desc: 'Một số bản (Chế Cu Nha, La Pán Tẩn) sóng yếu; tải sẵn bản đồ offline và lưu SĐT homestay.' },
  { title: 'Tiền mặt', desc: 'Chợ, quán nhỏ và nhiều homestay thanh toán tiền mặt; ATM tập trung ở thị trấn.' },
  { title: 'Tôn trọng văn hóa bản địa', desc: 'Hỏi trước khi chụp chân dung người dân, không tự ý vào nhà, xin phép khi qua ruộng và nghĩa địa.' },
  { title: 'Mua đặc sản dọc đường', desc: 'Cốm, táo mèo dọc đèo thường tươi và rẻ hơn; chọn quầy đông, hỏi giá trước khi mua.' },
  { title: 'Đi bộ giữa ruộng', desc: 'Chỉ đi đường mòn, bờ ruộng; ruộng bậc thang dễ sạt lở đất khi mưa to, không đi khi trời mưa lớn.' },
];

export default function TravelGuidePage() {
  const [sosOpen, setSosOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden flex flex-col">
      {/* Hero nhỏ */}
      <section className="relative w-full min-h-[300px] md:min-h-[340px] flex items-end pt-[calc(120px+var(--safe-top))] pb-8">
        <div className="absolute inset-0 z-0 bg-cover bg-center bg-[#07362c]" style={{ backgroundImage: `url(${heroBg})` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-[#0f2d3c]/85" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1000px] px-4 md:px-8">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-sun)]">Tiện ích du khách</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Cẩm nang du lịch Mù Cang Chải</h1>
          <p className="mt-2 max-w-2xl text-sm md:text-base font-medium text-white/90">
            Mọi thứ cần biết trước chuyến đi: thời điểm đẹp, đường đi, chi phí, món nên ăn và những lưu ý để chuyến đi trọn vẹn.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1000px] px-4 pb-14 md:px-8">
        {/* Mục lục nhanh + nút SOS */}
        <div className="flex flex-wrap items-center gap-2 py-4">
          {SECTIONS.map(s => (
            <button key={s.id} type="button" onClick={() => scrollTo(s.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:border-[#052620] hover:text-[#052620] active:scale-95">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          ))}
          <button type="button" onClick={() => setSosOpen(true)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95">
            <Siren className="h-3.5 w-3.5" /> Cần hỗ trợ khẩn cấp
          </button>
        </div>

        {/* 1. Thời điểm đẹp */}
        <Reveal>
          <section id="thoi-diem" className="mb-10 scroll-mt-24">
            <SectionHead icon={CalendarClock} title="Thời điểm đẹp để đi" desc="Mỗi mùa Mù Cang Chải mang một vẻ đẹp riêng — chọn theo sở thích của bạn." />
            <div className="grid gap-4 sm:grid-cols-2">
              {SEASONS.map((s, i) => (
                <div key={s.name} className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:shadow-sm ${i === 2 ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200/80'}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-[#0a2e26]">{s.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">{s.time}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{s.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3.5 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
              Mùa lúa chín là cao điểm — giá phòng cuối tuần có thể cao hơn ngày thường và hết phòng sớm.
            </p>
          </section>
        </Reveal>

        {/* 2. Di chuyển */}
        <Reveal>
          <section id="di-chuyen" className="mb-10 scroll-mt-24">
            <SectionHead icon={Bus} title="Di chuyển tới & trong Mù Cang Chải" desc="Cách thị trấn Hà Nội ~300km theo QL32 qua Sơn Tây – Trung Hà – Đoan Hùng – Nghĩa Lộ." />
            <div className="grid gap-4 md:grid-cols-3">
              <TransportCard icon={Bus} title="Xe khách giường nằm" lines={[
                'Bến Mỹ Đình / Yên Nghĩa (Hà Nội) → Mù Cang Chải, Tú Lệ.',
                'Giờ chạy phổ biến: chiều tối, ngủ đêm, sáng tới nơi (~6–7 giờ).',
                'Đặt vé trước 1–3 ngày mùa cao điểm; báo trước trạm xuống cho chủ homestay đón.' ]} />
              <TransportCard icon={Bike} title="Xe máy (phượt)" lines={[
                'Tuyến kinh điển QL32: Hà Nội – Sơn Tây – cầu Trung Hà – Đoan Hùng – Nghĩa Lộ – Tú Lệ – Mù Cang Chải.',
                'Xuất phát sớm 5–6h sáng, chia 2 ngày nếu muốn thong thả (nghỉ đêm Nghĩa Lộ/Tú Lệ).',
                'Đổ xăng đầy ở Nghĩa Lộ; một số đoạn QL32 xa trạm.' ]} />
              <TransportCard icon={Car} title="Ô tô tự lái" lines={[
                'Đường trải nhựa toàn tuyến; qua đèo Khau Phạ cần lái số thấp, phanh mát.',
                'Từ Hà Nội mất ~6–8 tiếng gồm nghỉ; tránh chạy đêm vì sương mù.',
                'Trong huyện thuê được xe máy tại homestay để đi các bản nhỏ.' ]} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-950">
                <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <p><b>Đi bộ quanh bản:</b> La Pán Tẩn, Chế Cu Nha, Móng Ngựa đều có đường mòn ngắn 1–3 giờ; mang giày bám tốt vì bờ ruộng trơn khi ướt.</p>
              </div>
              <div className="flex items-start gap-2.5 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-xs text-sky-950">
                <CloudSun className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                <p><b>Thời tiết & săn mây:</b> trang chi tiết homestay có widget dự báo theo tọa độ; mây đẹp nhất 5h30–7h sáng ở Dế Xu Phình, đỉnh Khau Phạ.</p>
              </div>
            </div>
          </section>
        </Reveal>

        {/* 3. Chi phí */}
        <Reveal>
          <section id="chi-phi" className="mb-10 scroll-mt-24">
            <SectionHead icon={Wallet} title="Chi phí tham khảo" desc="Mức giá thực tế tại địa phương (tham khảo, cập nhật 10/2026) để bạn lên kế hoạch." />
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              {COSTS.map((c, i) => (
                <div key={c.item} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-3.5 ${i % 2 ? 'bg-slate-50/50' : ''}`}>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{c.item}</p>
                    <p className="text-[11px] text-slate-500">{c.note}</p>
                  </div>
                  <p className="text-sm font-extrabold text-[var(--color-primary)]">
                    {c.cost} <span className="text-[11px] font-medium text-slate-500">{c.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* 4. Ẩm thực */}
        <Reveal>
          <section id="am-thuc" className="mb-10 scroll-mt-24">
            <SectionHead icon={UtensilsCrossed} title="Ẩm thực không nên bỏ lỡ" desc="Cốm Tú Lệ còn ấm, xôi ngũ sắc, gà nướng mắc khén… — xem mục Đặc sản để biết nơi mua, nơi thưởng thức." />
            <Link to="/specialties" className="group flex items-center justify-between gap-3 rounded-xl border-2 border-slate-100 bg-white p-4 shadow-2xs transition-all hover:border-teal-500/30 hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#052620]/10 text-[#052620]">
                  <Mountain className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Đặc sản Mù Cang Chải & Tú Lệ</p>
                  <p className="text-xs text-slate-500">Món đặc trưng của đồng bào vùng cao và nơi mua</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-[#052620]">Xem tất cả <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          </section>
        </Reveal>

        {/* 5. An toàn & lưu ý */}
        <Reveal>
          <section id="an-toan" className="mb-10 scroll-mt-24">
            <SectionHead icon={ShieldAlert} title="An toàn & lưu ý" desc="Vùng núi cao — những điều nhỏ này giúp chuyến đi an toàn và được dân bản quý mến." />
            <div className="grid gap-4 sm:grid-cols-2">
              {NOTES.map(n => (
                <div key={n.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
                  <p className="mb-1.5 text-sm font-extrabold text-slate-800">{n.title}</p>
                  <p className="text-xs leading-relaxed text-slate-600">{n.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* 6. Khẩn cấp */}
        <Reveal>
          <section id="khan-cap" className="mb-4 scroll-mt-24">
            <SectionHead icon={Phone} title="Danh bạ khẩn cấp" desc="Lưu sẵn 3 số quốc gia này trước khi lên đường — gọi được cả khi không có sóng mạnh." />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { phone: '113', label: 'Công an', desc: 'An ninh trật tự, tai nạn giao thông' },
                { phone: '114', label: 'Cứu hỏa, cứu nạn', desc: 'Cháy rừng, kẹt xe, cứu hộ' },
                { phone: '115', label: 'Cấp cứu y tế', desc: 'Thương tích, bệnh cấp' },
              ].map(h => (
                <a key={h.phone} href={`tel:${h.phone}`}
                  className="group flex flex-col items-center gap-2 rounded-2xl border-2 border-rose-200 bg-white p-6 text-center shadow-xs transition-all hover:border-rose-400 hover:bg-rose-50 active:scale-95"
                >
                  <Phone className="h-6 w-6 text-rose-600" />
                  <span className="text-2xl font-black tracking-tight text-rose-700 group-hover:underline">{h.phone}</span>
                  <span className="text-xs font-bold text-slate-700">{h.label}</span>
                  <span className="text-[11px] leading-tight text-slate-500">{h.desc}</span>
                </a>
              ))}
            </div>
            <button type="button" onClick={() => setSosOpen(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 text-sm font-black text-white shadow-xs transition-colors hover:bg-rose-700 active:scale-[0.99] cursor-pointer"
            >
              <Siren className="h-4 w-4" /> Gửi yêu cầu hỗ trợ tới vận hành viên (kèm vị trí GPS)
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Yêu cầu được ghi nhận trên hệ thống; với tình huống nguy hiểm — hãy gọi 113/114/115 trước.
            </p>
          </section>
        </Reveal>
      </div>

      <EmergencySosModal isOpen={sosOpen} onClose={() => setSosOpen(false)} />
    </div>
  );
}

function SectionHead({ icon: Icon, title, desc }: { icon: typeof Bus; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <h2 className="text-xl font-extrabold text-[#0a2e26] md:text-2xl">{title}</h2>
      <p className="mt-1 max-w-xl text-xs font-medium leading-relaxed text-slate-500 md:text-sm">{desc}</p>
    </div>
  );
}

function TransportCard({ icon: Icon, title, lines }: { icon: typeof Bus; title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
      </div>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-600">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" /> {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
