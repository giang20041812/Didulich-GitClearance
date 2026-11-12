import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MapPin, Calendar, Users, ChevronDown, Search, User, Mail, Phone, Lock, Heart, Mountain, Waves, Landmark, Utensils, Building2, Flame, Star, CheckCircle, AlertTriangle, Info, Copy } from "lucide-react"

export default function DesignSystemPage() {
  return (
    <div className="space-y-16 pb-32">
      {/* Intro Section */}
      <section className="pt-8">
        <h1 className="text-4xl md:text-[44px] font-bold font-display text-[#0f2d3c] tracking-tight mb-4">
          Đi Du Lịch Design System &<br />Component Library
        </h1>
        <p className="text-[17px] text-[var(--color-muted)] max-w-3xl leading-relaxed mb-10">
          Bộ quy chuẩn giao diện và thư viện component dùng chung cho toàn bộ hệ thống Đi Du Lịch.
          Thiết kế mang hơi thở biển bạc và núi ngàn Việt Nam, dung hòa tính kỹ thuật khắt khe cùng trải nghiệm
          khám phá bản địa chân thực.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#f0f7f3]/50 rounded-2xl p-6 border border-[#3f7656]/10">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-2">MÀU SẮC ĐỊNH DANH</div>
            <div className="text-2xl font-bold text-[#16709a] mb-1">18+ Tokens</div>
            <div className="text-sm text-[#3f7656]">Ocean Blue & Forest Green</div>
          </div>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#66716c]/10">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-2">HỆ THỐNG TYPE</div>
            <div className="text-2xl font-bold text-[#16709a] mb-1">10 Cấp bậc</div>
            <div className="text-sm text-[#3f7656]">Plus Jakarta Sans & Inter</div>
          </div>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#66716c]/10">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-2">COMPONENTS</div>
            <div className="text-2xl font-bold text-[#16709a] mb-1">45+ Blocks</div>
            <div className="text-sm text-[#3f7656]">Ready for Production</div>
          </div>
          <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#66716c]/10">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-2">TIÊU CHUẨN TRUY CẬP</div>
            <div className="text-2xl font-bold text-[#e5a33d] mb-1">WCAG 2.1 AA</div>
            <div className="text-sm text-[#3f7656]">Tối ưu độ tương phản</div>
          </div>
        </div>
      </section>

      {/* Colors */}
      <section>
        <div className="flex justify-between items-end border-b pb-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
              <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">01</span>
              MỤC 01 / NỀN TẢNG
            </div>
            <h2 className="text-3xl font-bold font-display text-[#0f2d3c]">Bảng Màu & Token Hệ Thống</h2>
          </div>
          <Button variant="outline" size="sm" className="bg-[#f0f4f8] border-none text-[#0f2d3c] font-semibold flex gap-2 rounded-lg">
            <Copy className="w-4 h-4" /> Sao chép bộ Token
          </Button>
        </div>

        <h3 className="text-lg font-bold text-[#0f2d3c] mb-6 flex items-center gap-2">
          Brand Core (Màu Nhận Diện)
          <span className="text-sm font-normal text-[#66716c]">Thẩm mỹ chủ đạo biển & núi</span>
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-12">
          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#0a7d64] h-32 p-4 text-white flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-80 uppercase tracking-widest">Primary</div>
              <div className="text-2xl font-bold">#0a7d64</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Deep Teal</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-primary</div>
              <div className="flex justify-between items-center bg-[#edfbf7] rounded p-2 text-xs font-medium">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a7d64] font-bold">AA (4.6:1)</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#3dc9d9] h-32 p-4 text-[#0a2e26] flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-80 uppercase tracking-widest">Secondary</div>
              <div className="text-2xl font-bold">#3DC9D9</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Bright Aqua</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-secondary</div>
              <div className="flex justify-between items-center bg-[#f0fbfd] rounded p-2 text-xs font-medium">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a2e26] font-bold">AAA (8.1:1)</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#52d967] h-32 p-4 text-[#0a2e26] flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-80 uppercase tracking-widest">Accent / CTA</div>
              <div className="text-2xl font-bold">#52D967</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Leaf Green</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-accent</div>
              <div className="flex justify-between items-center bg-[#effcf2] rounded p-2 text-xs font-medium">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a2e26] font-bold">Dark text AAA</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#7ef2dd] h-32 p-4 text-[#0a2e26] flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-80 uppercase tracking-widest">Primary Light</div>
              <div className="text-2xl font-bold">#7EF2DD</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Mint Aqua</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-primary-light</div>
              <div className="flex justify-between items-center bg-[#edfbf7] rounded p-2 text-xs font-medium">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a2e26] font-bold">Pastel Tint</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#88f28f] h-32 p-4 text-[#0a2e26] flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-80 uppercase tracking-widest">Accent Light</div>
              <div className="text-2xl font-bold">#88F28F</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Soft Lime</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-accent-light</div>
              <div className="flex justify-between items-center bg-[#effcf2] rounded p-2 text-xs font-medium">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a2e26] font-bold">Eco Badge</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-[#59766e]/15 overflow-hidden flex flex-col h-[280px]">
            <div className="bg-[#f3faf7] border-b border-[#59766e]/15 h-32 p-4 text-[#0a2e26] flex flex-col justify-end">
              <div className="text-xs font-semibold opacity-70 uppercase tracking-widest">Canvas Eco</div>
              <div className="text-2xl font-bold">#F3FAF7</div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="font-bold text-[#0a2e26] mb-1">Eco Mist</div>
              <div className="text-xs text-[#59766e] mb-auto">bg-canvas</div>
              <div className="flex justify-between items-center bg-white rounded p-2 text-xs font-medium border border-[#59766e]/15">
                <span className="text-[#59766e]">Tương phản</span>
                <span className="text-[#0a2e26]">Page Base</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Typography & Spacing */}
      <section className="py-8">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">02</span>
          MỤC 02 / CẤU TRÚC
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Typography, Spacing & Radius Scale</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Hệ thống kiểu chữ tối ưu hóa cho tiếng Việt có dấu, kết hợp nhịp thở layout 8pt hài hòa cùng bán kính góc tròn mềm mại mô phỏng sóng nước và triền đồi.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-2">
            <h3 className="text-lg font-bold text-[#16709a] mb-8">Hệ Thống Phông Chữ (Typographic Hierarchy)</h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Display Hero</div>
                  <div className="text-[11px] text-[#66716c]">Plus Jakarta Sans / 48px / Bold</div>
                </div>
                <div className="md:col-span-2 font-display text-[48px] font-bold text-[#16709a] leading-tight">Khám phá Việt Nam</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Headline H1</div>
                  <div className="text-[11px] text-[#66716c]">Plus Jakarta Sans / 40px / Bold</div>
                </div>
                <div className="md:col-span-2 font-display text-[40px] font-bold text-[#0f2d3c] leading-tight">Biển Xanh & Đại Ngàn</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Headline H2</div>
                  <div className="text-[11px] text-[#66716c]">Plus Jakarta Sans / 32px / Bold</div>
                </div>
                <div className="md:col-span-2 font-display text-[32px] font-bold text-[#0f2d3c] leading-tight">Hành Trình Bản Địa Trọn Vẹn</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Headline H3</div>
                  <div className="text-[11px] text-[#66716c]">Plus Jakarta Sans / 24px / SemiBold</div>
                </div>
                <div className="md:col-span-2 font-display text-[24px] font-semibold text-[#0f2d3c] leading-tight">Văn Hóa Cố Đô Huế & Phố Hội</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Headline H4</div>
                  <div className="text-[11px] text-[#66716c]">Plus Jakarta Sans / 20px / SemiBold</div>
                </div>
                <div className="md:col-span-2 font-display text-[20px] font-semibold text-[#0f2d3c] leading-tight">Lịch trình chi tiết 3 ngày 2 đêm</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Body Large</div>
                  <div className="text-[11px] text-[#66716c]">Inter / 18px / Regular</div>
                </div>
                <div className="md:col-span-2 font-body text-[18px] text-[#66716c] leading-relaxed">Mỗi chuyến đi là một chương truyện đáng nhớ với ẩm thực và con người.</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-[#66716c]/10">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Body Regular</div>
                  <div className="text-[11px] text-[#66716c]">Inter / 16px / Regular</div>
                </div>
                <div className="md:col-span-2 font-body text-[16px] text-[#66716c] leading-relaxed">Trải nghiệm chèo sup ngắm bình minh trên vịnh Lan Hạ, thưởng thức hải sản tươi rói.</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="font-bold text-[#0f2d3c] text-[13px]">Caption & Badge</div>
                  <div className="text-[11px] text-[#66716c]">Inter & Jakarta / 12px / 500-600</div>
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <span className="font-body text-[12px] font-medium text-[#66716c] uppercase tracking-wider">Lưu ý: Giá chưa bao gồm VAT</span>
                  <Badge className="bg-[#dceff0] text-[#16709a] font-bold text-[10px] px-2 py-0.5 rounded-sm">GIẢM 20%</Badge>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-12">
            <div>
              <h3 className="text-lg font-bold text-[#0f2d3c] mb-6 flex items-center gap-2">
                <span className="w-4 h-4 border border-[#0f2d3c] border-dashed rounded-sm flex-shrink-0"></span> Radius Scale
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#16709a] text-white flex items-center justify-center text-xs font-bold">8</div>
                    <span className="text-[13px] font-bold text-[#0f2d3c]">Buttons & Inputs</span>
                  </div>
                  <span className="text-[11px] text-[#66716c]">rounded-xl (8-10px)</span>
                </div>
                <div className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#3f7656] text-white flex items-center justify-center text-xs font-bold">16</div>
                    <span className="text-[13px] font-bold text-[#0f2d3c]">Cards & Panels</span>
                  </div>
                  <span className="text-[11px] text-[#66716c]">rounded-2xl (16px)</span>
                </div>
                <div className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#e5a33d] text-white flex items-center justify-center text-xs font-bold">20</div>
                    <span className="text-[13px] font-bold text-[#0f2d3c]">Modals & Hero</span>
                  </div>
                  <span className="text-[11px] text-[#66716c]">rounded-3xl (20-24px)</span>
                </div>
                <div className="flex items-center justify-between bg-[#f8f9fa] p-3 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#0f2d3c] text-white flex items-center justify-center text-xs font-bold">∞</div>
                    <span className="text-[13px] font-bold text-[#0f2d3c]">Pills & Badges</span>
                  </div>
                  <span className="text-[11px] text-[#66716c]">rounded-full (9999px)</span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-[#0f2d3c] mb-8 flex items-center gap-2">
                <span className="text-[#16709a] font-bold text-xl leading-none w-4 inline-block translate-y-[-2px]">&#9251;</span> Spacing (8pt Grid)
              </h3>
              <div className="flex items-end gap-2 sm:gap-4 h-32 w-full max-w-[240px] mx-auto border-b border-[#66716c]/20 pb-2">
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[8px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">4px</span>
                </div>
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[16px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">8px</span>
                </div>
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[24px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">12px</span>
                </div>
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[32px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">16px</span>
                </div>
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[48px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">24px</span>
                </div>
                <div className="flex flex-col items-center flex-1 group">
                  <div className="w-full bg-[#16709a] h-[64px] rounded-t-sm transition-all group-hover:bg-[#e5a33d]"></div>
                  <span className="text-[10px] text-[#66716c] mt-2">32px</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section className="py-8">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">03</span>
          MỤC 03 / TƯƠNG TÁC
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Hệ Thống Nút Bấm (Button Variants)</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Đầy đủ biến thể màu sắc, kích thước và phản hồi tương tác (Hover, Active, Loading, Disabled) phục vụ cả giao diện desktop lẫn touch mobile.</p>
        
        <div className="mb-12 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-[#66716c]/10">
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider w-1/4">BIẾN THỂ</th>
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider text-center">DEFAULT</th>
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider text-center">HOVER STATE</th>
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider text-center">ACTIVE / PRESSED</th>
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider text-center">LOADING SPINNER</th>
                <th className="pb-4 text-[10px] font-bold text-[#66716c] uppercase tracking-wider text-center">DISABLED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#66716c]/5">
              <tr>
                <td className="py-6">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Primary (Ocean Blue)</div>
                  <div className="text-[12px] text-[#66716c]">Hành động chính</div>
                </td>
                <td className="py-6 text-center"><Button variant="primary" className="rounded-xl px-6">Đặt Tour Ngay</Button></td>
                <td className="py-6 text-center"><Button variant="primary" className="rounded-xl px-6 bg-[#125a7a]">Đặt Tour Ngay</Button></td>
                <td className="py-6 text-center"><Button variant="primary" className="rounded-xl px-6 bg-[#0f4b66]">Đặt Tour Ngay</Button></td>
                <td className="py-6 text-center"><Button variant="primary" isLoading className="rounded-xl px-6">Đang xử lý</Button></td>
                <td className="py-6 text-center"><Button variant="primary" disabled className="rounded-xl px-6 bg-[#f0f4f8] text-[#8b9299]">Đặt Tour Ngay</Button></td>
              </tr>
              <tr>
                <td className="py-6">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Secondary (Forest Green)</div>
                  <div className="text-[12px] text-[#66716c]">Hành động tự nhiên</div>
                </td>
                <td className="py-6 text-center"><Button variant="secondary" className="rounded-xl px-6">Khám Phá Rừng</Button></td>
                <td className="py-6 text-center"><Button variant="secondary" className="rounded-xl px-6 bg-[#325e45]">Khám Phá Rừng</Button></td>
                <td className="py-6 text-center"><Button variant="secondary" className="rounded-xl px-6 bg-[#264734]">Khám Phá Rừng</Button></td>
                <td className="py-6 text-center"><Button variant="secondary" isLoading className="rounded-xl px-6">Đang tải</Button></td>
                <td className="py-6 text-center"><Button variant="secondary" disabled className="rounded-xl px-6 bg-[#f0f4f8] text-[#8b9299]">Khám Phá Rừng</Button></td>
              </tr>
              <tr>
                <td className="py-6">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Accent CTA (Sunset Gold)</div>
                  <div className="text-[12px] text-[#66716c]">Chốt deal, Giữ chỗ</div>
                </td>
                <td className="py-6 text-center"><Button variant="accent" className="rounded-xl px-6">Nhận Ưu Đãi</Button></td>
                <td className="py-6 text-center"><Button variant="accent" className="rounded-xl px-6 bg-[#f8ebd0]">Nhận Ưu Đãi</Button></td>
                <td className="py-6 text-center"><Button variant="accent" className="rounded-xl px-6 bg-[#c28a33] text-white">Nhận Ưu Đãi</Button></td>
                <td className="py-6 text-center"><Button variant="accent" isLoading className="rounded-xl px-6">Gửi mã</Button></td>
                <td className="py-6 text-center"><Button variant="accent" disabled className="rounded-xl px-6 bg-[#f0f4f8] text-[#8b9299]">Nhận Ưu Đãi</Button></td>
              </tr>
              <tr>
                <td className="py-6">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Outline / Subtle</div>
                  <div className="text-[12px] text-[#66716c]">Hành động thứ cấp</div>
                </td>
                <td className="py-6 text-center"><Button variant="outline" className="rounded-xl px-6 border-[#16709a]/50 text-[#16709a]">Xem Lịch Trình</Button></td>
                <td className="py-6 text-center"><Button variant="outline" className="rounded-xl px-6 bg-[#dceff0]/50 border-[#16709a]/50 text-[#16709a]">Xem Lịch Trình</Button></td>
                <td className="py-6 text-center"><Button variant="outline" className="rounded-xl px-6 bg-[#dceff0] border-[#16709a] text-[#16709a]">Xem Lịch Trình</Button></td>
                <td className="py-6 text-center"><Button variant="outline" isLoading className="rounded-xl px-6 border-[#66716c]/20 text-[#66716c]">Chờ xíu</Button></td>
                <td className="py-6 text-center"><Button variant="outline" disabled className="rounded-xl px-6 border-[#e6e8eb] text-[#8b9299]">Xem Lịch Trình</Button></td>
              </tr>
              <tr>
                <td className="py-6">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Ghost / Editorial</div>
                  <div className="text-[12px] text-[#66716c]">Liên kết nội dung</div>
                </td>
                <td className="py-6 text-center"><Button variant="ghost" className="rounded-xl px-6 text-[#16709a]">Tìm hiểu thêm &rarr;</Button></td>
                <td className="py-6 text-center"><Button variant="ghost" className="rounded-xl px-6 bg-[#f8f9fa] text-[#16709a]">Tìm hiểu thêm &rarr;</Button></td>
                <td className="py-6 text-center"><Button variant="ghost" className="rounded-xl px-6 bg-[#dceff0]/50 text-[#16709a]">Tìm hiểu thêm &rarr;</Button></td>
                <td className="py-6 text-center"><Button variant="ghost" isLoading className="rounded-xl px-6 text-[#66716c]">Chờ...</Button></td>
                <td className="py-6 text-center"><Button variant="ghost" disabled className="rounded-xl px-6 text-[#8b9299]">Tìm hiểu thêm &rarr;</Button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="text-[10px] font-bold text-[#16709a] uppercase tracking-wider mb-6">QUY CHUẨN KÍCH THƯỚC (SIZE SCALE)</h4>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" className="rounded-xl bg-[#16709a] px-6 flex gap-2"><CheckCircle className="w-5 h-5"/> Large (48px)</Button>
              <Button size="md" className="rounded-xl bg-[#16709a] px-5 flex gap-2"><CheckCircle className="w-4 h-4"/> Medium (40px)</Button>
              <Button size="sm" className="rounded-xl bg-[#16709a] px-4 flex gap-1.5 text-xs"><CheckCircle className="w-3.5 h-3.5"/> Small (32px)</Button>
            </div>
          </div>
          
          <div>
            <h4 className="text-[10px] font-bold text-[#3f7656] uppercase tracking-wider mb-6">ICON BUTTONS & FLOATING ACTIONS</h4>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 text-[#16709a] bg-[#f8f9fa] hover:bg-[#dceff0]"><Heart className="w-5 h-5"/></Button>
              <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 text-[#16709a] bg-[#f8f9fa] hover:bg-[#dceff0]"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg></Button>
              <Button size="icon" className="rounded-full w-12 h-12 bg-[#16709a] hover:bg-[#125a7a] text-white shadow-md"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></Button>
              <Button size="icon" className="rounded-full w-12 h-12 bg-[#e5a33d] hover:bg-[#c28a33] text-[#0f2d3c] shadow-md"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg></Button>
            </div>
          </div>
        </div>
      </section>

      {/* Form Controls & Booking Inputs */}

      <section className="py-12 border-t border-[#66716c]/10 mt-12">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">04</span>
          MỤC 04 / NHẬP LIỆU
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Form Controls & Booking Inputs</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Thiết kế phục vụ thao tác tìm kiếm nhanh: ô tìm kiếm đa trường, chọn ngày khởi hành, bộ đếm số lượng khách, dropdowns và lựa chọn dạng checkbox/radio.</p>
        
        <div className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xs font-bold text-[#16709a] uppercase tracking-wider">TỔ HỢP TÌM KIẾM TOUR NHANH (COMPOUND SEARCH)</h4>
            <span className="text-xs text-[#66716c]">Desktop Banner Component</span>
          </div>
          
          <div className="w-full flex flex-col md:flex-row items-center gap-3 p-3 rounded-[24px] bg-[#f8f9fa] border border-[#66716c]/10">
            <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-[#66716c]/10 p-3 flex items-center gap-4 cursor-text hover:border-[#16709a] transition-colors">
              <div className="w-8 h-8 rounded-full bg-[#f0f4f8] flex items-center justify-center shrink-0">
                <MapPin className="text-[#66716c] w-4 h-4" />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-0.5">Điểm đến</span>
                <span className="text-[15px] font-medium text-[#202327]">Mù Cang Chải, Yên Bái</span>
              </div>
            </div>
            
            <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-[#66716c]/10 p-3 flex items-center gap-4 cursor-pointer hover:border-[#16709a] transition-colors">
              <div className="w-8 h-8 rounded-full bg-[#f0f4f8] flex items-center justify-center shrink-0">
                <Calendar className="text-[#66716c] w-4 h-4" />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-0.5">Ngày đi</span>
                <span className="text-[15px] font-medium text-[#202327]">15 Th10 - 18 Th10</span>
              </div>
            </div>
            
            <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-[#66716c]/10 p-3 flex items-center justify-between cursor-pointer hover:border-[#16709a] transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-[#fff0d6] flex items-center justify-center shrink-0">
                  <Users className="text-[#e5a33d] w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-0.5">Hành khách</span>
                  <span className="text-[15px] font-medium text-[#202327]">2 người lớn, 1 trẻ em</span>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center text-[#66716c] opacity-50 mr-2">
                  <ChevronDown className="w-3.5 h-3.5 rotate-180 -mb-1" />
                  <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
            
            <div className="w-full md:w-auto shrink-0 h-full flex items-center">
              <Button size="lg" className="rounded-[18px] w-full md:w-auto px-8 h-[60px] shadow-md bg-[#16709a] text-white hover:bg-[#125a7a] text-[15px] font-bold flex items-center gap-2">
                <Search className="w-5 h-5" />
                Tìm Chuyến Đi
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xl font-bold font-display text-[#0f2d3c] mb-8">Các Trạng Thái Input Đơn Lẻ (Input Field States)</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="font-bold text-[#202327] mb-3 text-sm">Mặc định (Default)</div>
              <Input placeholder="Họ và tên người đặt" startIcon={<User className="w-5 h-5" />} helpText={<span className="text-[#66716c]">Điền chính xác theo CCCD</span>} />
            </div>
            <div>
              <div className="font-bold text-[#16709a] mb-3 text-sm">Đang Focus (Active)</div>
              <Input placeholder="contact@didulich.vn" startIcon={<Mail className="w-5 h-5" />} className="border-[#16709a] ring-1 ring-[#16709a]" helpText={<span className="text-[#16709a]">Email dùng nhận vé điện tử</span>} />
            </div>
            <div>
              <div className="font-bold text-[#d04648] mb-3 text-sm">Báo Lỗi (Error State)</div>
              <Input placeholder="090123" startIcon={<Phone className="w-5 h-5" />} error helpText={<><AlertTriangle className="w-3.5 h-3.5"/> Số điện thoại chưa đủ 10 số</>} />
            </div>
            <div>
              <div className="font-bold text-[#66716c] opacity-50 mb-3 text-sm">Vô hiệu hóa (Disabled)</div>
              <Input placeholder="VIETNAM_TOUR_2024" startIcon={<Lock className="w-5 h-5" />} disabled helpText="Mã hệ thống tự động khóa" />
            </div>
          </div>
        </div>
      </section>

      {/* Badges, Tags & Tabs */}
      <section className="py-12 border-t border-[#66716c]/10 mt-4">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest mt-4">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">05</span>
          MỤC 05 / PHÂN LOẠI
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Huy Hiệu (Badges), Tags & Thanh Tabs</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Hệ thống nhãn chủ đề danh lam thắng cảnh, định danh khuyến mãi nổi bật và segmented control chuyển tab mượt mà.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h4 className="text-xl font-bold font-display text-[#0f2d3c] mb-6">Nhãn Chủ Đề (Category Chips)</h4>
            <div className="flex flex-wrap gap-3 mb-10">
              <Badge className="bg-[#daf0e2] text-[#2e7d5b] hover:bg-[#c1e6cf] flex gap-1.5 px-3 py-1.5"><Mountain className="w-3.5 h-3.5"/> Du lịch núi</Badge>
              <Badge className="bg-[#dceff0] text-[#16709a] hover:bg-[#b0dce2] flex gap-1.5 px-3 py-1.5"><Waves className="w-3.5 h-3.5"/> Du lịch biển</Badge>
              <Badge className="bg-[#fcf6eb] text-[#e5a33d] hover:bg-[#f8ebd0] flex gap-1.5 px-3 py-1.5 border border-[#e5a33d]/30"><Landmark className="w-3.5 h-3.5"/> Văn hóa lịch sử</Badge>
              <Badge className="bg-[#f5f6f7] text-[#8b9299] hover:bg-[#e6e8eb] flex gap-1.5 px-3 py-1.5"><Utensils className="w-3.5 h-3.5"/> Ẩm thực bản xứ</Badge>
              <Badge className="bg-[#f8f9fa] text-[#66716c] hover:bg-[#e6e8eb] flex gap-1.5 px-3 py-1.5 border border-[#66716c]/20"><Building2 className="w-3.5 h-3.5"/> Phố cổ & Đô thị</Badge>
            </div>
            
            <h4 className="text-xl font-bold font-display text-[#0f2d3c] mb-6">Huy Hiệu Trạng Thái (Status Badges)</h4>
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-[#d04648] text-white hover:bg-[#b83b3e] flex gap-1.5 px-3 py-1"><Flame className="w-3.5 h-3.5"/> Hot Deal</Badge>
              <Badge className="bg-[#dceff0] text-[#16709a] hover:bg-[#b0dce2] flex gap-1.5 px-3 py-1 border border-[#16709a]/20"><Calendar className="w-3.5 h-3.5"/> Mới Ra Mắt</Badge>
              <Badge className="bg-white text-[#e5a33d] flex gap-1.5 px-3 py-1 border border-[#e5a33d]"><Star className="w-3.5 h-3.5"/> Best Seller</Badge>
              <Badge className="bg-[#daf0e2] text-[#2e7d5b] flex gap-1.5 px-3 py-1 border border-[#2e7d5b]/20"><CheckCircle className="w-3.5 h-3.5"/> Local Experience</Badge>
            </div>
          </div>
          
          <div>
            <h4 className="text-xl font-bold font-display text-[#0f2d3c] mb-6">Chuyển Phân Mục (Tabs & Segmented Control)</h4>
            
            <div className="w-full bg-[#f8f9fa] p-1.5 rounded-2xl flex items-center mb-10 border border-[#66716c]/10">
              <button className="flex-1 bg-white shadow text-[#16709a] font-bold py-2.5 rounded-xl text-sm transition-all">Tất Cả Tour</button>
              <button className="flex-1 text-[#66716c] font-medium py-2.5 rounded-xl text-sm hover:text-[#202327] transition-all">Chuyến Đi Núi</button>
              <button className="flex-1 text-[#66716c] font-medium py-2.5 rounded-xl text-sm hover:text-[#202327] transition-all">Nghỉ Dưỡng Biển</button>
            </div>
            
            <div className="flex border-b border-[#66716c]/20 w-full">
              <div className="flex-1 pb-4 flex items-center justify-center gap-2 border-b-2 border-[#16709a] cursor-pointer">
                <span className="font-bold text-[#16709a] text-sm text-center">Tổng Quan Hành Trình</span>
                <span className="bg-[#dceff0] text-[#16709a] text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">01</span>
              </div>
              <div className="flex-1 pb-4 flex flex-col items-center justify-center gap-1 cursor-pointer">
                <span className="font-medium text-[#66716c] text-sm text-center">Lịch Trình Chi Tiết</span>
                <span className="bg-[#f0f4f8] text-[#66716c] text-[10px] font-bold w-12 py-0.5 rounded-full text-center">3 ngày</span>
              </div>
              <div className="flex-1 pb-4 flex items-center justify-center gap-2 cursor-pointer">
                <span className="font-medium text-[#66716c] text-sm text-center">Đánh Giá Của Khách</span>
                <span className="bg-[#f0f4f8] text-[#66716c] text-[10px] font-bold px-1.5 py-0.5 rounded-full">124</span>
              </div>
            </div>
            <p className="text-xs text-[#66716c] mt-6">Segmented buttons tối ưu trên thiết bị cảm ứng với diện tích chạm tối thiểu 44px, hỗ trợ phản hồi trực quan trạng thái chọn.</p>
          </div>
        </div>
      </section>
      {/* Cards */}
      <section className="py-12 border-t border-[#66716c]/10 mt-12">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">06</span>
          MỤC 06 / TRƯNG BÀY DỮ LIỆU
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Hệ Thống Thẻ Trải Nghiệm (Cards)</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Thiết kế cấu trúc Cloud White nổi trên nền canvas, tích hợp hình ảnh phong cảnh tỉ lệ vàng 4:3, đánh giá, chi phí và tương tác yêu thích mượt mà.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-all border border-[#66716c]/10 flex flex-col">
            <div className="relative aspect-[4/3] bg-[#dceff0]">
              <div className="absolute top-4 left-4">
                <Badge className="bg-[#3f7656] text-white hover:bg-[#325e45] text-[10px] px-2 py-0.5 rounded-full">Du lịch núi</Badge>
              </div>
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
                  <Heart className="w-4 h-4 text-[#66716c]" />
                </div>
              </div>
            </div>
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center gap-1.5 text-[#66716c] text-[11px] mb-2 font-medium">
                <MapPin className="w-3.5 h-3.5" />
                Mù Cang Chải, Yên Bái
              </div>
              <h3 className="font-bold text-[#0f2d3c] text-lg leading-tight mb-3">Săn Mây Đỉnh Đèo Khau Phạ & Mùa Lúa Vàng Mâm Xôi</h3>
              <div className="flex items-center gap-2 text-xs text-[#66716c] font-medium mb-5 mt-auto">
                <Star className="w-3.5 h-3.5 text-[#e5a33d] fill-[#e5a33d]" />
                <span className="text-[#0f2d3c] font-bold">4.9</span> (1.240 đánh giá)
                <span className="opacity-50">•</span> 3N2Đ
              </div>
              <div className="flex items-end justify-between pt-4 border-t border-[#66716c]/10">
                <div>
                  <div className="text-[10px] text-[#66716c] font-medium mb-0.5">Giá trọn gói từ</div>
                  <div className="text-[#16709a] font-bold text-lg">2.490.000đ</div>
                </div>
                <Button size="sm" className="bg-[#16709a] text-white rounded-lg hover:bg-[#125a7a] px-4 font-bold text-xs h-8 shadow-sm">Xem Tour</Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-all border border-[#66716c]/10 flex flex-col">
            <div className="relative aspect-[4/3] bg-[#dceff0]">
              <div className="absolute top-4 left-4">
                <Badge className="bg-[#16709a] text-white hover:bg-[#125a7a] text-[10px] px-2 py-0.5 rounded-full">Du lịch biển</Badge>
              </div>
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
                  <Heart className="w-4 h-4 text-[#66716c]" />
                </div>
              </div>
            </div>
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center gap-1.5 text-[#66716c] text-[11px] mb-2 font-medium">
                <MapPin className="w-3.5 h-3.5" />
                An Thới, Phú Quốc
              </div>
              <h3 className="font-bold text-[#0f2d3c] text-lg leading-tight mb-3">Trải Nghiệm Du Thuyền Ngắm Hoàng Hôn & Lặn San Hô 4 Đảo</h3>
              <div className="flex items-center gap-2 text-xs text-[#66716c] font-medium mb-5 mt-auto">
                <Star className="w-3.5 h-3.5 text-[#e5a33d] fill-[#e5a33d]" />
                <span className="text-[#0f2d3c] font-bold">5.0</span> (860 đánh giá)
                <span className="opacity-50">•</span> Trong ngày
              </div>
              <div className="flex items-end justify-between pt-4 border-t border-[#66716c]/10">
                <div>
                  <div className="text-[10px] text-[#66716c] font-medium mb-0.5">Giá trọn gói từ</div>
                  <div className="text-[#16709a] font-bold text-lg">1.250.000đ</div>
                </div>
                <Button size="sm" className="bg-[#16709a] text-white rounded-lg hover:bg-[#125a7a] px-4 font-bold text-xs h-8 shadow-sm">Xem Tour</Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-all border border-[#66716c]/10 flex flex-col">
            <div className="relative h-[200px] bg-[#f8f9fa] m-4 rounded-xl overflow-hidden">
              <div className="absolute bottom-3 left-3">
                <Badge className="bg-[#202327]/60 text-white backdrop-blur-sm border-none hover:bg-[#202327]/80 text-[10px] px-2 py-0.5 rounded-sm">Phóng sự văn hóa</Badge>
              </div>
            </div>
            <div className="p-5 pt-1 flex flex-col flex-1">
              <h3 className="font-bold text-[#0f2d3c] text-[19px] leading-[1.3] mb-3">Những Con Người Làm Nên Vẻ Đẹp Việt Nam</h3>
              <p className="text-[13px] text-[#66716c] leading-relaxed mb-6">
                Gặp gỡ các nghệ nhân làng dệt thổ cẩm vùng cao và ngư dân can trường giữ nghề lưới cước ven bờ biển miền Trung.
              </p>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[11px] text-[#66716c] font-medium">Bài đọc 6 phút</span>
                <span className="text-[#16709a] text-[13px] font-bold flex items-center gap-1 cursor-pointer hover:underline">
                  Đọc tiếp <span className="text-[15px]">&rarr;</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Modals & Toasts */}
      <section>
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest mt-12">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">07</span>
          MỤC 07 / PHẢN HỒI NGƯỜI DÙNG
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Cửa Sổ Tương Tác (Modals) & Toasts Thông Báo</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Hộp thoại xác nhận đặt tour tối ưu trải nghiệm chốt đơn cùng bộ bốn thông báo Toast tiêu chuẩn (Thành công, Cảnh báo, Lỗi, Thông tin).</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[#f8f9fa] rounded-3xl p-6 border border-[#66716c]/10 relative shadow-inner h-[500px] flex items-center justify-center">
            <div className="bg-white rounded-[24px] shadow-xl w-full max-w-[500px] overflow-hidden border border-[#66716c]/10">
              <div className="bg-[#f8f9fa] px-6 py-4 flex items-center justify-between border-b border-[#66716c]/10">
                <div className="flex items-center gap-2 font-bold text-[#0f2d3c]">
                  <Landmark className="w-5 h-5 text-[#16709a]" />
                  Xác Nhận Đặt Tour Đi Du Lịch
                </div>
                <div className="w-8 h-8 rounded-full bg-[#e6e8eb] flex items-center justify-center cursor-pointer hover:bg-[#d1d5db] transition-colors">
                  <span className="text-lg leading-none mt-[-2px]">&times;</span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="font-bold text-[#0f2d3c] text-[15px]">Mù Cang Chải 3N2Đ Mùa Lúa</div>
                  <Badge className="bg-[#daf0e2] text-[#2e7d5b] text-[10px] px-2 py-0.5 rounded border-none">Khởi hành Hà Nội</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-[13px] text-[#202327] mb-6">
                  <div className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#66716c]"></span> Ngày khởi hành: <span className="font-medium">20/10/2024</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#66716c]"></span> Số lượng: <span className="font-medium">02 Khách lớn</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#66716c]"></span> Hạng phòng: <span className="font-medium">Bungalow View Đồi</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#66716c]"></span> Giảm giá: <span className="font-medium text-[#2e7d5b]">-300.000đ (VOUCHER)</span></div>
                </div>
                
                <div className="flex justify-between items-center py-4 border-y border-[#66716c]/10 mb-6">
                  <span className="font-bold text-[#0f2d3c]">Tổng chi phí dự kiến:</span>
                  <span className="font-bold text-xl text-[#16709a]">4.680.000đ</span>
                </div>
                
                <div className="mb-6">
                  <label className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider block mb-2">GHI CHÚ ĐẶC BIỆT CHO ĐOÀN</label>
                  <Input placeholder="Yêu cầu ăn chay, ghế đầu xe..." className="bg-[#f8f9fa] border-none text-[13px]" />
                </div>
              </div>
              <div className="bg-[#f8f9fa] px-6 py-4 flex justify-end gap-3 border-t border-[#66716c]/10">
                <Button variant="ghost" className="text-[#66716c] font-medium text-[13px] hover:text-[#0f2d3c] hover:bg-transparent">Hủy Bỏ</Button>
                <Button className="bg-[#16709a] text-white hover:bg-[#125a7a] font-bold text-[13px] px-5 rounded-lg shadow-sm flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Xác Nhận & Thanh Toán
                </Button>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 flex flex-col justify-center">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-2">BỐN TRẠNG THÁI TOAST (LIVE FEEDBACK)</div>
            
            <div className="bg-white rounded-xl shadow-[var(--shadow-sm)] border border-[#66716c]/10 border-l-4 border-l-[#2e7d5b] p-4 flex gap-3 relative pr-10">
              <CheckCircle className="text-[#2e7d5b] w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-[#0f2d3c] text-[13px] mb-0.5">Đặt tour thành công!</h4>
                <p className="text-[#66716c] text-[12px]">Mã xác nhận VJ-8823 đã được gửi về email của bạn.</p>
              </div>
              <span className="absolute top-4 right-4 text-[#66716c] text-lg leading-none cursor-pointer hover:text-[#0f2d3c]">&times;</span>
            </div>
            
            <div className="bg-white rounded-xl shadow-[var(--shadow-sm)] border border-[#66716c]/10 border-l-4 border-l-[#d98a28] p-4 flex gap-3 relative pr-10">
              <AlertTriangle className="text-[#d98a28] w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-[#0f2d3c] text-[13px] mb-0.5">Chỗ còn lại có hạn!</h4>
                <p className="text-[#66716c] text-[12px]">Chỉ còn 3 suất cuối cùng cho chuyến bay sáng thứ Sáu.</p>
              </div>
              <span className="absolute top-4 right-4 text-[#66716c] text-lg leading-none cursor-pointer hover:text-[#0f2d3c]">&times;</span>
            </div>
            
            <div className="bg-white rounded-xl shadow-[var(--shadow-sm)] border border-[#66716c]/10 border-l-4 border-l-[#d04648] p-4 flex gap-3 relative pr-10">
              <Info className="text-[#d04648] w-5 h-5 shrink-0 mt-0.5 rotate-180" />
              <div>
                <h4 className="font-bold text-[#0f2d3c] text-[13px] mb-0.5">Lỗi kết nối cổng thanh toán</h4>
                <p className="text-[#66716c] text-[12px]">Vui lòng kiểm tra số dư hoặc thử lại với thẻ quốc tế.</p>
              </div>
              <span className="absolute top-4 right-4 text-[#66716c] text-lg leading-none cursor-pointer hover:text-[#0f2d3c]">&times;</span>
            </div>
            
            <div className="bg-white rounded-xl shadow-[var(--shadow-sm)] border border-[#66716c]/10 border-l-4 border-l-[#16709a] p-4 flex gap-3 relative pr-10">
              <Info className="text-[#16709a] w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-[#0f2d3c] text-[13px] mb-0.5">Cập nhật lịch đón khách</h4>
                <p className="text-[#66716c] text-[12px]">Hướng dẫn viên sẽ gọi xác nhận 2 tiếng trước giờ khởi hành.</p>
              </div>
              <span className="absolute top-4 right-4 text-[#66716c] text-lg leading-none cursor-pointer hover:text-[#0f2d3c]">&times;</span>
            </div>
          </div>
        </div>
      </section>
      
      {/* Skeletons & Empty States */}
      <section className="py-12 border-t border-[#66716c]/10 mt-12">
        <div className="flex items-center gap-2 text-[#16709a] text-sm font-semibold mb-2 uppercase tracking-widest">
          <span className="w-4 h-4 rounded-full bg-[#16709a] flex items-center justify-center text-white text-[8px] font-bold">08</span>
          MỤC 08 / TRẠNG THÁI HỆ THỐNG
        </div>
        <h2 className="text-3xl font-bold font-display text-[#0f2d3c] mb-4">Skeleton Loading, Phân Trang & Trạng Thái Rỗng</h2>
        <p className="text-[var(--color-muted)] max-w-2xl mb-10">Đảm bảo không gián đoạn cảm xúc khi mạng yếu hoặc không tìm thấy kết quả tìm kiếm với skeleton shimmer và empty illustration thân thiện.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-[#66716c]/10 relative overflow-hidden">
            <div className="text-[10px] font-bold text-[#66716c] uppercase tracking-wider mb-4">SKELETON CARD SHIMMER</div>
            <Skeleton className="w-full aspect-[4/3] rounded-2xl mb-4 bg-[#e6e8eb]" />
            <Skeleton className="w-3/4 h-5 rounded-md mb-2 bg-[#e6e8eb]" />
            <Skeleton className="w-1/2 h-4 rounded-md mb-6 bg-[#e6e8eb]" />
            <div className="flex justify-between items-end mt-10">
              <Skeleton className="w-1/3 h-8 rounded-md bg-[#e6e8eb]" />
              <Skeleton className="w-1/4 h-10 rounded-xl bg-[#e6e8eb]" />
            </div>
            <div className="absolute top-6 right-6 w-2 h-2 rounded-full bg-[#16709a]"></div>
          </div>
          
          <div className="bg-white rounded-[24px] p-8 shadow-sm border border-[#66716c]/10 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[#f0f4f8] flex items-center justify-center mb-6">
              <Search className="w-6 h-6 text-[#66716c]" />
            </div>
            <h3 className="font-bold text-[#0f2d3c] text-xl mb-3">Không Tìm Thấy Chuyến Đi</h3>
            <p className="text-[13px] text-[#66716c] mb-8 leading-relaxed max-w-[240px]">
              Hiện chưa có lịch khởi hành phù hợp với bộ lọc đã chọn. Hãy thử tìm kiếm địa danh khác gần đó.
            </p>
            <Button className="bg-[#16709a] text-white hover:bg-[#125a7a] font-bold text-[13px] px-6 py-5 rounded-xl shadow-sm">
              Khám Phá Tour Phổ Biến
            </Button>
          </div>
          
          <div className="bg-[#fff5f5] rounded-[24px] p-8 shadow-sm flex flex-col items-center justify-center text-center border border-[#d04648]/10">
            <div className="w-16 h-16 rounded-full bg-[#fce8e8] flex items-center justify-center mb-6">
              <AlertTriangle className="w-6 h-6 text-[#d04648]" />
            </div>
            <h3 className="font-bold text-[#d04648] text-xl mb-3">Sự Cố Tải Dữ Liệu</h3>
            <p className="text-[13px] text-[#66716c] mb-8 leading-relaxed max-w-[260px]">
              Đường truyền máy chủ tạm thời bị nghẽn. Bạn có thể nhấn tải lại hoặc quay lại trang chủ.
            </p>
            <div className="flex gap-3 w-full">
              <Button className="flex-1 bg-[#d04648] text-white hover:bg-[#b83b3e] font-bold text-[13px] py-5 rounded-xl shadow-sm">
                <span className="flex items-center gap-2"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg> Thử Lại</span>
              </Button>
              <Button className="flex-1 bg-white text-[#0f2d3c] border border-[#66716c]/20 hover:bg-gray-50 font-bold text-[13px] py-5 rounded-xl shadow-sm">
                Trang Chủ
              </Button>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-[#66716c]/10 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[13px] text-[#66716c]">Hiển thị <span className="font-bold text-[#202327]">1 - 12</span> trong tổng số <span className="font-bold text-[#202327]">148</span> tour trải nghiệm</div>
          <div className="flex gap-1.5 items-center">
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-[#66716c] hover:bg-[#f8f9fa]">&lt;</Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-[#202327] font-medium hover:bg-[#f8f9fa]">1</Button>
            <Button variant="primary" size="icon" className="w-8 h-8 rounded-lg bg-[#16709a] text-white font-bold">2</Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-[#202327] font-medium hover:bg-[#f8f9fa]">3</Button>
            <span className="text-[#66716c] px-1">...</span>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-[#202327] font-medium hover:bg-[#f8f9fa]">12</Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-[#66716c] hover:bg-[#f8f9fa]">&gt;</Button>
          </div>
          <Button variant="outline" className="text-[#16709a] border-[#16709a]/20 bg-[#dceff0]/30 hover:bg-[#dceff0]/60 font-bold text-[13px] rounded-xl flex gap-2 h-10">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
            Xem thêm 24 tour khác
          </Button>
        </div>
      </section>
    </div>
  )
}
