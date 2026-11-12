/**
 * Pin kiểu "lên lịch trình" (marker có badgeTone): nút "+" xanh thương hiệu cho điểm chưa thêm (viền trắng, nhịp nhẹ),
 * pin cam đánh số thứ tự cho điểm đã thêm, ô vuông bo góc hình ngôi nhà cho chỗ nghỉ. Điểm đang chọn to hơn, nhãn đậm.
 * Chuỗi HTML gán qua innerHTML của Leaflet: nhãn và số truyền vào ĐÃ được thoát HTML.
 */

const FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const STYLE_ID = 'vietmap-plan-pin-style';

const PLUS_SVG = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const HOUSE_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>';

/** Keyframes nhịp của nút "+" — chèn một lần vào <head>. */
export function ensurePlanPinStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes vmPlanPulse { 0% { transform: scale(1); opacity: .5; } 70%, 100% { transform: scale(1.9); opacity: 0; } }
.vm-plan-pin .vm-plan-face { transition: transform .16s ease, box-shadow .16s ease; }
.vm-plan-pin:hover .vm-plan-face { transform: scale(1.1); }
.vm-plan-pin:hover .vm-plan-drop { transform: rotate(-45deg) scale(1.08); }
.vm-plan-pin:hover .vm-plan-label { box-shadow: 0 4px 12px rgba(15, 23, 42, .22); }
.vm-plan-label[data-side="left"] { left: auto !important; right: calc(100% + 6px); }
.vm-plan-label[data-hidden="true"] { display: none; }
.vm-plan-pin:hover .vm-plan-label[data-hidden="true"] { display: inline-block; }
@media (prefers-reduced-motion: reduce) { .vm-plan-pulse { animation: none !important; opacity: 0 !important; } }
`;
  document.head.appendChild(style);
}

/** Lệch nhịp giữa các nút "+" để bản đồ không nhấp nháy đồng loạt. */
function pulseDelay(id: string | number): number {
  const text = String(id);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return (hash % 7) * 0.35;
}

function labelHtml(label: string, tone: 'add' | 'added' | 'home', selected: boolean, order = ''): string {
  const skin = selected
    ? 'background:#0a2e26;color:#ffffff;border:1px solid #0a2e26;font-weight:800;'
    : tone === 'added'
      ? 'background:#fff7ed;color:#9a3412;border:1px solid #fdba74;font-weight:800;'
      : tone === 'home'
        ? 'background:#0a7d64;color:#ffffff;border:1px solid #06604a;font-weight:800;'
        : 'background:rgba(255,255,255,.96);color:#1e293b;border:1px solid rgba(15,23,42,.08);font-weight:650;';
  return `<span class="vm-plan-label" data-tone="${tone}" data-selected="${selected}" data-order="${order}" style="position:absolute;left:calc(100% + 6px);top:50%;transform:translateY(-50%);white-space:nowrap;${skin}font-size:11.5px;line-height:1.2;padding:4px 9px;border-radius:9999px;box-shadow:0 2px 8px rgba(15,23,42,.16);letter-spacing:-0.01em;transition:box-shadow .16s ease;">${label}</span>`;
}

/** HTML của pin lịch trình. label / badge đã thoát HTML. */
export function planPinHtml(opts: { id: string | number; tone: 'add' | 'added' | 'home'; label: string; badge: string; selected: boolean }): string {
  const { id, tone, label, badge, selected } = opts;
  const base = `class="vm-plan-pin" style="position:relative;cursor:pointer;font-family:${FONT};pointer-events:auto;`;

  if (tone === 'home') {
    // Pin giọt nước xanh đậm (mũi chạm toạ độ, thân nằm phía trên) — nút "+" của điểm sát bên vẫn tách bạch, không đè lên.
    const size = 38;
    const lift = Math.round(size / 2 + size * 0.707);
    return `
      <div ${base}width:${size}px;height:${size}px;transform:translate(-${size / 2}px,-${lift}px);">
        <span class="vm-plan-drop" style="position:absolute;inset:0;background:#06604a;border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 6px 14px rgba(6,96,74,.45),0 0 0 2px rgba(245,158,11,.9);transition:transform .16s ease;"></span>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff;">${HOUSE_SVG}</span>
        ${labelHtml(label, tone, selected)}
      </div>`;
  }

  if (tone === 'added') {
    const size = selected ? 46 : 38;
    // Ô vuông xoay -45° (góc nhọn xuống dưới): mũi pin cách tâm 0,707 cạnh — đẩy lên để mũi chạm đúng toạ độ.
    const lift = Math.round(size / 2 + size * 0.707);
    return `
      <div ${base}width:${size}px;height:${size}px;transform:translate(-${size / 2}px,-${lift}px);">
        <span class="vm-plan-drop" style="position:absolute;inset:0;background:#f97316;border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 6px 14px rgba(234,88,12,.42)${selected ? ',0 0 0 5px rgba(249,115,22,.28)' : ''};transition:transform .16s ease;"></span>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:${selected ? 18 : 15}px;font-weight:900;line-height:1;">${badge}</span>
        ${labelHtml(label, tone, selected, badge)}
      </div>`;
  }

  const size = selected ? 46 : 36;
  return `
    <div ${base}width:${size}px;height:${size}px;transform:translate(-50%,-50%);">
      <span class="vm-plan-pulse" style="position:absolute;inset:0;border-radius:9999px;background:rgba(10,125,100,.5);animation:vmPlanPulse 2.6s ease-out ${pulseDelay(id)}s infinite;"></span>
      <span class="vm-plan-face" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#0a7d64;color:#ffffff;border:3px solid #ffffff;box-shadow:0 6px 16px rgba(6,96,74,.45)${selected ? ',0 0 0 5px rgba(10,125,100,.28)' : ''};">${PLUS_SVG(selected ? 22 : 18)}</span>
      ${labelHtml(label, tone, selected)}
    </div>`;
}

/** Ưu tiên giữ nhãn khi chồng nhau: điểm đang chọn > điểm đã thêm (theo thứ tự) > chỗ nghỉ > nút "+". */
function labelRank(label: HTMLElement): number {
  if (label.dataset.selected === 'true') return 0;
  if (label.dataset.tone === 'added') return 1 + Number(label.dataset.order || 0) / 1000;
  return label.dataset.tone === 'home' ? 2 : 3;
}

const overlaps = (a: DOMRect, b: DOMRect, gap: number) =>
  a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

/**
 * Xếp nhãn tên của các pin lịch trình trên khung bản đồ: mỗi nhãn đặt bên phải pin, đè lên pin / nhãn khác thì lật sang
 * trái, vẫn đè thì ẩn (rê chuột vào pin vẫn hiện). Nhãn điểm đang chọn và điểm đã thêm được giữ trước. Trả về số nhãn
 * bị ẩn (để trang gợi ý phóng to). Gọi lại sau khi vẽ pin, phóng to / kéo bản đồ, đổi kích thước khung.
 */
export function declutterPlanLabels(container: HTMLElement): number {
  const pins = Array.from(container.querySelectorAll<HTMLElement>('.vm-plan-pin'));
  if (pins.length === 0) return 0;
  const box = container.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return 0;
  const items = pins
    .map((pin) => ({ pin, label: pin.querySelector<HTMLElement>('.vm-plan-label') }))
    .filter((item): item is { pin: HTMLElement; label: HTMLElement } => !!item.label);
  for (const { label } of items) {
    label.dataset.side = 'right';
    label.dataset.hidden = 'false';
  }
  const pinRects = pins.map((pin) => pin.getBoundingClientRect());
  /** Pin "+" (chưa thêm) — nhãn điểm đã thêm / đang chọn được phép đè lên (biết rõ đã thêm điểm nào quan trọng hơn). */
  const isAddPin = pins.map((pin) => pin.querySelector<HTMLElement>('.vm-plan-label')?.dataset.tone === 'add');
  const placed: DOMRect[] = [];
  let hidden = 0;
  items.sort((a, b) => labelRank(a.label) - labelRank(b.label));
  for (const { pin, label } of items) {
    const strong = label.dataset.selected === 'true' || label.dataset.tone === 'added';
    const fits = (side: 'right' | 'left') => {
      label.dataset.side = side;
      const rect = label.getBoundingClientRect();
      const blocked = pinRects.some((r, i) => pins[i] !== pin && !(strong && isAddPin[i]) && overlaps(rect, r, 1))
        || placed.some((r) => overlaps(rect, r, 3));
      const inside = rect.left >= box.left + 2 && rect.right <= box.right - 2;
      return { side, rect, ok: !blocked && inside };
    };
    // Phải trước, không vừa (đè pin / nhãn khác, tràn mép khung) thì thử trái, vẫn không vừa thì ẩn — kéo / phóng bản đồ
    // sẽ xếp lại. Nhãn điểm đang chọn luôn hiện.
    const right = fits('right');
    let chosen = right.ok ? right : null;
    if (!chosen) {
      const left = fits('left');
      if (left.ok) chosen = left;
    }
    if (!chosen && label.dataset.selected === 'true') chosen = right;
    if (chosen) {
      label.dataset.side = chosen.side;
      placed.push(chosen.rect);
    } else {
      label.dataset.side = 'right';
      label.dataset.hidden = 'true';
      // Chỉ đếm nhãn của pin đang nằm trong khung (pin ngoài khung không cần gợi ý phóng to).
      const r = pin.getBoundingClientRect();
      if (r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom) hidden += 1;
    }
  }
  return hidden;
}
