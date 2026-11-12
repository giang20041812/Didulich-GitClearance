import type { ReactNode } from 'react';

/**
 * Kho hình vẽ nét mảnh cho họa tiết nền (HomeMotifs). Mỗi hình là một hàm trả về các nét SVG trong khung 260 × 220, chỉ dùng
 * <path> / <circle> / <ellipse> (HomeMotifs đo độ dài từng nét để vẽ dần; <rect> sẽ không được vẽ dần). Nét là currentColor.
 * Nét phụ (vân, gân, bóng đổ) đặt strokeOpacity nhỏ hơn nhóm ngoài (0.3) để hình có chiều sâu mà không rối.
 */

type Pt = readonly [number, number];

const f = (n: number) => +n.toFixed(1);

/** Điểm và góc tiếp tuyến (độ) trên đường cong bậc ba. */
function cubicAt([p0, p1, p2, p3]: readonly [Pt, Pt, Pt, Pt], t: number): [number, number, number] {
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
  const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return [f(x), f(y), f((Math.atan2(dy, dx) * 180) / Math.PI)];
}

/** Điểm trên đường cong bậc hai. */
function quadAt([p0, p1, p2]: readonly [Pt, Pt, Pt], t: number): [number, number] {
  const u = 1 - t;
  return [f(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]), f(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])];
}

/** Thanh có bề dày `w` từ a tới b: hai nét song song, bịt hai đầu (ống khèn, khúc củi). */
function rod([ax, ay]: Pt, [bx, by]: Pt, w: number): string {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = (-(by - ay) / len) * (w / 2);
  const ny = ((bx - ax) / len) * (w / 2);
  return `M${f(ax + nx)} ${f(ay + ny)} L${f(bx + nx)} ${f(by + ny)} L${f(bx - nx)} ${f(by - ny)} L${f(ax - nx)} ${f(ay - ny)} Z`;
}

/** Cây thông nhỏ ba tầng đứng tại (x, y), cao ~30·k. */
function pineTree(x: number, y: number, k = 1): string {
  const X = (dx: number) => f(x + dx * k);
  const Y = (dy: number) => f(y + dy * k);
  return `M${X(0)} ${Y(-30)} L${X(-7)} ${Y(-19)} H${X(-3)} L${X(-10)} ${Y(-10)} H${X(-5)} L${X(-12)} ${Y(-1)} H${X(12)} L${X(5)} ${Y(-10)} H${X(10)} L${X(3)} ${Y(-19)} H${X(7)} Z M${X(0)} ${Y(-1)} V${Y(4)}`;
}

/** Khóm cỏ ba ngọn tại (x, y). */
const tuft = (x: number, y: number) => `M${x - 2} ${y} q -1 -5 -5 -8 M${x} ${y} q -1 -6 1 -10 M${x + 2} ${y} q 1 -5 5 -8`;

/** Chim bay hai cánh cong (đặt bằng transform). */
const BIRD = 'M0 0 Q 5 -6 10 0 Q 15 -6 20 0';

/** Mây bông đơn giản quanh (x, y), rộng ~44·k. */
function cloud(x: number, y: number, k = 1): string {
  const p = (dx: number, dy: number) => `${f(x + dx * k)} ${f(y + dy * k)}`;
  return `M${p(0, 0)} C ${p(-12, 0)}, ${p(-12, -14)}, ${p(1, -14)} C ${p(4, -26)}, ${p(22, -26)}, ${p(26, -14)} C ${p(38, -16)}, ${p(42, 0)}, ${p(30, 0)} Z`;
}

/** Tia sáng quanh tâm (cx, cy) từ bán kính r1 tới r2. */
function rays(cx: number, cy: number, r1: number, r2: number, n = 8, offset = 0): string {
  return Array.from({ length: n }, (_, i) => {
    const a = offset + (i * 2 * Math.PI) / n;
    return `M${f(cx + Math.cos(a) * r1)} ${f(cy + Math.sin(a) * r1)} L${f(cx + Math.cos(a) * r2)} ${f(cy + Math.sin(a) * r2)}`;
  }).join(' ');
}

/** Lá thuôn có gân giữa và gân phụ, gốc ở (0,0) dài 40 theo trục x (đặt bằng transform). */
const LEAF = 'M0 0 C 8 -9, 26 -9, 40 0 C 26 9, 8 9, 0 0 Z';
const LEAF_VEINS = 'M3 0 H35 M12 0 l 5 -4 M20 0 l 5 -4 M28 0 l 4 -3 M12 0 l 5 4 M20 0 l 5 4 M28 0 l 4 3';

/** Hạt lúa (hai bên thân) kèm râu, xếp dọc một đường cong bậc ba từ `from` tới ngọn. */
function riceGrains(c: readonly [Pt, Pt, Pt, Pt], from: number, n: number, k = 1): ReactNode[] {
  const grain = (x: number, y: number, a: number, key: string) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${a}) scale(${k})`}>
      <ellipse cx="11" cy="0" rx="11" ry="4.5" />
      <path d="M22 0 l 8 -1" strokeOpacity="0.2" />
    </g>
  );
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, a] = cubicAt(c, from + (i * (1 - from)) / n);
    out.push(grain(x, y, a - 32, `${i}l`), grain(x, y, a + 32, `${i}r`));
  }
  const [x, y, a] = cubicAt(c, 1);
  out.push(grain(x, y, a, 'tip'));
  return out;
}

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

export const MOTIFS = {
  /** Hai đỉnh núi phủ tuyết trước dãy núi xa, rừng thông dưới chân, suối uốn qua thung, mặt trời, mây và chim. */
  mountains: () => (
    <>
      <path d="M155 118 L178 92 Q182 88 186 92 L206 112 L226 98 Q229 96 232 98 L270 128" strokeOpacity="0.18" />
      <path d="M-10 190 L52 98 Q60 86 68 98 L96 136 L126 102 Q134 92 142 102 L214 190" />
      {/* mũ tuyết răng cưa */}
      <path d="M45 108 L52 98 Q60 86 68 98 L75 108 L69 105 L63 112 L57 104 L51 110 Z" />
      <path d="M119 112 L126 102 Q134 92 142 102 L149 112 L143 109 L137 116 L131 108 L125 114 Z" />
      {/* gân sườn khuất nắng */}
      <path d="M68 114 L78 130 M73 124 L84 142 M64 126 L70 140 M142 118 L154 136 M148 132 L162 152 M138 132 L146 146" strokeOpacity="0.18" />
      {/* suối từ thung giữa hai đỉnh */}
      <path d="M94 142 C 86 160, 116 166, 104 190 M102 140 C 98 156, 128 164, 118 190" strokeOpacity="0.22" />
      <path d={`${pineTree(14, 184, 0.9)} ${pineTree(30, 188, 0.7)} ${pineTree(226, 186, 0.9)} ${pineTree(243, 189, 0.7)}`} />
      <path d="M-10 190 Q 130 186 270 190" />
      <path d="M40 202 Q 80 198 120 202 M150 206 Q 190 202 230 206" strokeOpacity="0.18" />
      <circle cx="210" cy="44" r="16" />
      {SUN_RAYS.map((a, i) => (
        <path key={i} d={`M${f(210 + Math.cos(a) * 22)} ${f(44 + Math.sin(a) * 22)} L${f(210 + Math.cos(a) * (i % 2 ? 27 : 31))} ${f(44 + Math.sin(a) * (i % 2 ? 27 : 31))}`} />
      ))}
      <path d="M24 46 C 10 46, 10 30, 25 30 C 28 16, 48 14, 54 27 C 67 23, 77 36, 66 46 Z" />
      <path d="M30 40 Q 40 35 50 40" strokeOpacity="0.18" />
      <path d={cloud(152, 66, 0.7)} />
      <path d={BIRD} transform="translate(86 40) scale(0.8)" />
      <path d={BIRD} transform="translate(104 54) scale(0.6)" />
    </>
  ),
  /** Ruộng bậc thang: bờ ruộng hai nét, khóm lúa trên từng thửa, chiếc nón lá có nan. */
  terraces: () => (
    <>
      {[50, 82, 114, 146].map((y, i) => {
        const c = [[-10, y], [50, y - 26 + i * 4], [110, y + 30 - i * 4], [270, y - 10]] as const;
        const ts = (i === 3 ? [0.12, 0.28, 0.44] : [0.14, 0.32, 0.5, 0.68, 0.86]).map((t) => t + i * 0.025);
        return (
          <g key={y}>
            <path d={`M-10 ${y} C 50 ${y - 26 + i * 4}, 110 ${y + 30 - i * 4}, 270 ${y - 10}`} />
            <path d={`M-10 ${y + 7} C 50 ${y - 19 + i * 4}, 110 ${y + 37 - i * 4}, 270 ${y - 3}`} strokeOpacity="0.16" />
            <path d={ts.map((t) => { const [x, py] = cubicAt(c, t); return tuft(x, f(py + 20)); }).join(' ')} strokeOpacity="0.22" />
          </g>
        );
      })}
      {/* nón lá: vành trong, nan tỏa từ chóp, quai */}
      <path d="M178 190 Q 212 132 246 190 Q 212 202 178 190 Z" />
      <path d="M178 190 Q 212 182 246 190" strokeOpacity="0.2" />
      <path d="M212 162 L190 193 M212 162 L200 196 M212 162 V197 M212 162 L224 196 M212 162 L234 193" strokeOpacity="0.18" />
      <path d="M194 176 Q 212 184 230 176" />
      <path d="M194 192 Q 192 206 204 210 M230 192 Q 232 206 220 210" strokeOpacity="0.2" />
    </>
  ),
  /** Nhà sàn: mái tranh có sợi rủ, khau cút, hoa văn đầu hồi, vách ván, cửa sổ chấn song, cột có giằng, cầu thang, khói bếp. */
  house: () => {
    const left = [[8, 100], [70, 90], [120, 34]] as const;
    const right = [[232, 100], [170, 90], [120, 34]] as const;
    const thatch = [0.22, 0.32, 0.42, 0.52, 0.62, 0.72].flatMap((t) => [quadAt(left, t), quadAt(right, t)]).map(([x, y]) => `M${x} ${f(y + 2)} l ${x < 120 ? -1 : 1} 7`).join(' ');
    return (
      <>
        <path d="M8 100 Q 70 90 120 34 Q 170 90 232 100" />
        <path d={thatch} strokeOpacity="0.2" />
        <path d="M120 34 L 110 23 Q 105 17 101 21 Q 100 25 104 24 M120 34 L 130 23 Q 135 17 139 21 Q 140 25 136 24" />
        <path d="M104 62 L120 46 L136 62 Z" strokeOpacity="0.22" />
        <path d="M120 50 L125 55 L120 60 L115 55 Z" />
        <path d="M42 102 V146 Q42 152 48 152 H192 Q198 152 198 146 V102" />
        {/* vách ván */}
        <path d="M52 104 V150 M92 104 V150 M148 104 V150 M188 104 V150 M42 140 H58 M86 140 H106 M134 140 H154 M182 140 H198" strokeOpacity="0.16" />
        {/* cửa sổ chấn song */}
        <path d="M60 114 H82 V134 H60 Z M158 114 H180 V134 H158 Z" />
        <path d="M67 114 V134 M75 114 V134 M165 114 V134 M173 114 V134 M60 124 H82 M158 124 H180" strokeOpacity="0.2" />
        <path d="M106 152 V126 Q106 112 120 112 Q134 112 134 126 V152" />
        <path d="M120 112 V152" strokeOpacity="0.2" />
        <path d="M26 152 Q 120 158 214 152" />
        <path d="M32 160 Q 120 165 208 160" strokeOpacity="0.2" />
        <path d="M52 156 Q51 182 52 206 M92 156 Q91 182 92 206 M148 156 Q149 182 148 206 M188 156 Q189 182 188 206" />
        <path d="M52 170 L92 196 M92 170 L52 196 M148 170 L188 196 M188 170 L148 196" strokeOpacity="0.16" />
        <path d="M112 156 L96 206 M130 156 L114 206 M107 170 H125 M102 184 H120 M98 198 H116" />
        <path d="M152 58 C 146 48, 160 42, 152 30 C 146 22, 156 16, 150 6" strokeOpacity="0.2" />
        <path d="M-10 207 Q 60 203 130 207 T 270 206" />
        <path d={`${tuft(14, 206)} ${tuft(232, 206)} ${tuft(72, 205)}`} strokeOpacity="0.22" />
      </>
    );
  },
  /** Dây đèn lồng giăng từ mép vào: đèn có chóp, nan, dải hoa văn và tua rua. */
  lanterns: () => (
    <>
      <path d="M-10 20 Q 120 60 270 14" />
      {([[60, 34], [130, 38], [200, 30]] as const).map(([x, y]) => (
        <g key={x}>
          <path d={`M${x} ${y} V ${y + 9}`} />
          <path d={`M${x - 7} ${y + 13} Q ${x - 7} ${y + 9} ${x} ${y + 9} Q ${x + 7} ${y + 9} ${x + 7} ${y + 13} Z`} />
          <path d={`M${x - 7} ${y + 43} Q ${x - 7} ${y + 47} ${x} ${y + 47} Q ${x + 7} ${y + 47} ${x + 7} ${y + 43} Z`} />
          <ellipse cx={x} cy={y + 28} rx="13" ry="16" />
          <path d={`M${x - 6} ${y + 13} Q ${x - 9} ${y + 28} ${x - 6} ${y + 43} M${x + 6} ${y + 13} Q ${x + 9} ${y + 28} ${x + 6} ${y + 43} M${x} ${y + 12} V ${y + 44}`} strokeOpacity="0.18" />
          <path d={`M${x - 12} ${y + 25} l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3`} strokeOpacity="0.25" />
          <circle cx={x} cy={y + 50} r="1.8" />
          <path d={`M${x - 1.5} ${y + 52} L ${x - 4} ${y + 66} M${x} ${y + 52} V ${y + 68} M${x + 1.5} ${y + 52} L ${x + 4} ${y + 66}`} strokeOpacity="0.25" />
        </g>
      ))}
      {/* hạt cườm treo xen giữa các đèn */}
      {([[95, 40], [166, 37], [234, 22]] as const).map(([x, y]) => (
        <path key={x} d={`M${x} ${y} V ${y + 12} M${x - 3} ${y + 15} a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0`} strokeOpacity="0.22" />
      ))}
    </>
  ),
  /** Bụi tre: thân hai nét có đốt kép, cành con, lá có gân. */
  bamboo: () => (
    <>
      {([[40, 0], [78, 36], [110, 78]] as const).map(([x, top]) => (
        <g key={x}>
          <path d={`M${x - 4} 220 V ${top + 6} Q ${x} ${top} ${x + 4} ${top + 6} V 220`} />
          {Array.from({ length: Math.floor((220 - top) / 40) }, (_, i) => top + 30 + i * 40).map((y) => (
            <path key={y} d={`M${x - 6} ${y} Q ${x} ${y + 3} ${x + 6} ${y} M${x - 4} ${y + 4} Q ${x} ${y + 6} ${x + 4} ${y + 4}`} strokeOpacity="0.22" />
          ))}
        </g>
      ))}
      {/* cành con */}
      <path d="M44 70 C 54 64, 64 54, 74 42 M114 148 C 126 140, 140 132, 154 122 M36 110 C 26 104, 18 96, 10 84" strokeOpacity="0.25" />
      {([
        [40, 62, -35], [40, 142, 30], [78, 100, -30], [78, 180, 35], [110, 130, -30], [110, 118, 40],
        [74, 42, -70], [74, 42, -20], [154, 122, -40], [154, 122, 10], [10, 84, -150], [10, 84, 160],
      ] as const).map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d={LEAF} />
          <path d="M4 0 H34" strokeOpacity="0.18" />
        </g>
      ))}
    </>
  ),
  /** Bát phở: miệng bát, sợi phở, thịt, rau thơm, khói, dải hoa văn chấm, đế bát, đũa và miếng chanh. */
  bowl: () => (
    <>
      <path d="M48 120 Q 120 134 192 120 C 190 172, 160 194, 120 194 C 80 194, 50 172, 48 120 Z" />
      <path d="M48 120 Q 120 106 192 120" strokeOpacity="0.22" />
      <path d="M58 124 C 78 104, 98 136, 120 114 S 162 134, 182 114" />
      <path d="M68 122 C 84 114, 100 128, 118 120 S 156 126, 174 120" strokeOpacity="0.2" />
      <path d="M82 118 q 10 -7 22 -1 q -11 6 -22 1 Z M126 116 q 11 -6 22 0 q -11 6 -22 0 Z" />
      <path d="M152 118 q 0 -9 9 -12 q 1 9 -9 12 Z M162 120 q 4 -8 12 -7 q -3 8 -12 7 Z" strokeOpacity="0.25" />
      {/* dải hoa văn quanh thân bát */}
      <path d="M58 150 Q 120 164 182 150 M66 168 Q 120 180 174 168" strokeOpacity="0.2" />
      {Array.from({ length: 9 }, (_, i) => quadAt([[64, 158], [120, 172], [176, 158]], 0.1 + i * 0.1)).map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="1.8" strokeOpacity="0.25" />
      ))}
      <path d="M96 193 V 199 Q 120 205 144 199 V 193" />
      <path d="M92 98 C 82 82, 102 72, 92 54 M120 94 C 110 76, 130 66, 120 46 M148 98 C 138 82, 158 72, 148 54" />
      <path d="M106 86 C 100 78, 110 72, 106 64 M134 86 C 128 78, 138 72, 134 64" strokeOpacity="0.16" />
      <path d="M150 114 Q 200 82 236 38 M164 118 Q 208 90 242 50" />
      <path d="M8 204 A 15 15 0 0 1 38 204 Z" />
      <path d="M23 204 L 13 194 M23 204 V 189 M23 204 L 33 194 M12 204 A 11 11 0 0 1 34 204" strokeOpacity="0.2" />
    </>
  ),
  /** Bông lúa chín cong nặng hạt có râu, thêm một bông nhỏ và lá lúa. */
  rice: () => {
    const main = [[118, 220], [122, 150], [130, 92], [176, 30]] as const;
    const side = [[112, 220], [104, 172], [90, 132], [58, 100]] as const;
    return (
      <>
        <path d="M118 220 C 122 150, 130 92, 176 30" />
        {riceGrains(main, 0.3, 7)}
        <path d="M112 220 C 104 172, 90 132, 58 100" strokeOpacity="0.25" />
        {riceGrains(side, 0.5, 4, 0.75)}
        <path d="M120 212 C 100 184, 74 168, 36 166 C 70 176, 96 192, 120 212 Z" />
        <path d="M120 212 C 146 176, 176 166, 222 170 C 182 180, 150 192, 120 212 Z" />
        <path d="M118 200 C 140 160, 168 136, 204 128 C 172 144, 148 166, 120 206" strokeOpacity="0.2" />
        <path d="M60 214 Q 120 208 196 214" strokeOpacity="0.2" />
      </>
    );
  },
  /** Hai quả ớt: thân bóng có vệt sáng, đài lá răng cưa, cuống cong, một lá ớt. */
  chili: () => (
    <>
      <path d="M62 62 C 130 40, 200 96, 218 190 C 186 134, 110 92, 62 62 Z" />
      <path d="M104 64 C 140 72, 176 104, 198 150" strokeOpacity="0.2" />
      <path d="M84 58 C 98 56, 112 60, 124 66" strokeOpacity="0.25" />
      <path d="M62 62 C 46 70, 36 58, 44 46 C 54 44, 64 50, 62 62 Z" />
      <path d="M50 62 L 40 70 M56 66 L 54 78 M46 54 L 34 56" strokeOpacity="0.3" />
      <path d="M44 46 C 38 36, 40 26, 48 18 Q 52 14 56 16" />
      <path d="M48 24 C 64 12, 86 12, 100 22 C 84 30, 64 32, 48 24 Z" />
      <path d="M52 24 H 94" strokeOpacity="0.18" />
      <g transform="translate(14 118) scale(0.45)">
        <path d="M62 62 C 130 40, 200 96, 218 190 C 186 134, 110 92, 62 62 Z" />
        <path d="M62 62 C 46 70, 36 58, 44 46 C 54 44, 64 50, 62 62 Z" />
        <path d="M44 46 C 38 36, 40 26, 48 18" />
      </g>
    </>
  ),
  /** La bàn: vành khía, khoen treo, vạch chia, chữ N, hoa gió tám cánh. */
  compass: () => {
    const pt = (r: number, deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return `${f(120 + Math.cos(a) * r)} ${f(110 + Math.sin(a) * r)}`; };
    return (
      <>
        <circle cx="120" cy="110" r="76" />
        <circle cx="120" cy="110" r="62" />
        <path d={rays(120, 110, 76, 80, 36)} strokeOpacity="0.2" />
        <path d="M120 34 V 31" />
        <circle cx="120" cy="24" r="7" />
        {Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8).map((a, i) => (i === 12 ? null : (
          <path key={i} d={`M${f(120 + Math.cos(a) * 62)} ${f(110 + Math.sin(a) * 62)} L${f(120 + Math.cos(a) * (i % 4 === 0 ? 50 : 56))} ${f(110 + Math.sin(a) * (i % 4 === 0 ? 50 : 56))}`} />
        )))}
        <path d="M115 60 V 49 L 125 60 V 49" />
        <circle cx="120" cy="110" r="38" strokeOpacity="0.16" />
        {[45, 135, 225, 315].map((d) => (
          <path key={d} d={`M${pt(36, d)} L${pt(6, d + 90)} L120 110 L${pt(6, d - 90)} Z`} strokeOpacity="0.25" />
        ))}
        <path d="M76 110 Q 120 118 164 110 Q 120 102 76 110 Z" />
        <path d="M120 66 Q 132 110 120 154 Q 108 110 120 66 Z" />
        <path d="M120 66 Q 129 90 130 110 H110 Q 111 90 120 66 Z" fill="currentColor" fillOpacity="0.4" />
        <circle cx="120" cy="110" r="5" />
      </>
    );
  },
  /** Đường đi nét đứt qua núi, rừng tới ghim vị trí; điểm dừng giữa đường và đường đồng mức như bản đồ. */
  route: () => (
    <>
      <path d="M6 96 L34 62 Q38 57 42 62 L58 82 L74 64 Q78 60 82 64 L108 96" />
      <path d="M29 68 L34 62 Q38 57 42 62 L47 68 L42 66 L38 70 L34 66 Z" strokeOpacity="0.25" />
      <path d={`${pineTree(28, 150, 0.7)} ${pineTree(40, 156, 0.55)} ${pineTree(96, 192, 0.6)}`} strokeOpacity="0.25" />
      <path d="M-10 204 C 50 134, 110 212, 150 142 S 190 94, 200 74" strokeDasharray="3 9" />
      <circle cx="150" cy="142" r="4" />
      <circle cx="150" cy="142" r="9" strokeOpacity="0.18" />
      <ellipse cx="200" cy="77" rx="12" ry="3.5" strokeOpacity="0.2" />
      <path d="M200 74 C 188 56, 182 48, 182 38 a18 18 0 0 1 36 0 c0 10 -6 18 -18 36 z" />
      <circle cx="200" cy="38" r="6" />
      <path d="M160 204 C 190 194, 220 200, 250 190 M176 216 C 200 208, 230 214, 256 206 M120 30 C 140 22, 150 34, 168 26" strokeOpacity="0.15" />
    </>
  ),
  /** Lều trại: đường may, cửa vén, dây néo có cọc, cờ nhỏ; trăng, sao và thông phía sau. */
  tent: () => (
    <>
      <path d="M200 40 a14 14 0 1 0 10 24 a11 11 0 0 1 -10 -24 Z" />
      <path d="M44 44 v 8 M40 48 h 8 M172 24 v 6 M169 27 h 6 M232 92 v 6 M229 95 h 6" strokeOpacity="0.25" />
      <path d={`${pineTree(236, 190, 1.1)} ${pineTree(252, 190, 0.8)} ${pineTree(10, 190, 0.9)}`} strokeOpacity="0.22" />
      <path d="M24 190 Q 24 186 28 180 L112 70 Q 120 60 128 70 L212 180 Q 216 186 216 190 Z" />
      <path d="M120 100 Q 104 150 92 190 M120 100 Q 136 150 148 190" />
      <path d="M120 100 Q 112 150 104 172 Q 96 182 92 190 M104 172 Q 98 168 96 160" strokeOpacity="0.2" />
      <path d="M116 68 L 62 186 M124 68 L 178 186" strokeOpacity="0.16" />
      <path d="M120 62 V 36 Q 134 38 144 44 Q 134 48 120 52" />
      <path d="M40 172 L 2 196 M200 172 L 238 196 M-1 194 l 5 6 M235 194 l 5 6" strokeOpacity="0.22" />
      <path d="M-10 190 Q 130 186 270 190 M60 202 Q 80 200 100 202 M150 206 Q 178 203 206 206" />
    </>
  ),
  // ---- Hình bổ sung: mỗi trang / phần dùng bộ riêng nên không lặp hình (xem LAYOUT trong HomeMotifs) ----
  // -- Thiên nhiên / điểm đến --
  /** Biển mây: hai đỉnh núi phủ tuyết nhô khỏi các lớp mây cuộn, mặt trời có tia, chim bay. */
  cloudSea: () => (
    <>
      <path d="M10 150 L86 66 Q94 58 102 66 L140 108 L164 84 Q170 78 176 84 L250 150" />
      <path d="M80 72 L86 66 Q94 58 102 66 L108 72 L102 70 L97 76 L92 69 L86 74 Z" />
      <path d="M160 88 L164 84 Q170 78 176 84 L181 89 L176 87 L172 91 L168 86 L164 90 Z" />
      <path d="M104 78 L116 94 M110 88 L124 106 M180 94 L192 108 M186 104 L198 118" strokeOpacity="0.18" />
      <path d="M-6 152 C 14 132, 44 132, 58 148 C 72 128, 104 128, 118 148 C 134 130, 164 130, 178 148 C 194 132, 224 132, 238 150 C 248 142, 258 144, 266 150" />
      <path d="M50 146 c -2 -8 8 -10 10 -3 M110 146 c -2 -8 8 -10 10 -3 M170 146 c -2 -8 8 -10 10 -3" strokeOpacity="0.2" />
      <path d="M18 176 C 50 162, 80 186, 110 172 S 170 162, 198 174 S 238 178, 256 170" />
      <path d="M44 198 C 76 188, 110 206, 140 196 S 196 190, 228 198" />
      <path d="M70 186 C 90 182, 100 190, 120 186" strokeOpacity="0.16" />
      <circle cx="210" cy="40" r="15" />
      <path d={rays(210, 40, 20, 26)} strokeOpacity="0.25" />
      <path d={BIRD} transform="translate(26 62) scale(0.8)" />
      <path d={BIRD} transform="translate(48 46) scale(0.6)" />
    </>
  ),
  /** Thác nước đổ giữa hai vách đá: dòng suối trên đỉnh, các dải nước rơi, bọt tung và mặt hồ gợn sóng, thông trên vách. */
  waterfall: () => (
    <>
      {/* vách đá hai bên */}
      <path d="M-6 52 Q 40 40 90 48 L96 66 L90 96 L98 128 L90 160 L96 176" />
      <path d="M266 40 Q 214 32 164 46 L158 66 L166 98 L158 130 L166 160 L160 176" />
      <path d="M30 70 L44 86 M58 64 L70 82 M20 100 L34 114 M214 64 L200 82 M236 76 L222 92 M226 110 L212 124" strokeOpacity="0.16" />
      {/* dòng suối chảy tới mép thác */}
      <path d="M90 48 Q 126 58 164 46" />
      <path d="M100 42 Q 126 48 152 40 M112 34 Q 130 38 146 32" strokeOpacity="0.2" />
      {/* các dải nước rơi */}
      <path d="M102 54 C 100 92, 106 132, 102 168" />
      <path d="M114 57 C 112 98, 118 134, 114 170" />
      <path d="M127 58 C 127 100, 124 134, 128 170" />
      <path d="M140 57 C 142 96, 136 134, 141 170" />
      <path d="M152 52 C 155 90, 148 130, 154 168" />
      <path d="M108 70 V84 M121 92 V108 M134 76 V90 M146 104 V118 M110 120 V134 M133 128 V142" strokeOpacity="0.2" />
      {/* bọt nước tung ở chân thác */}
      <path d="M84 176 c 4 -10 16 -12 22 -4 c 4 -10 18 -10 22 -1 c 5 -9 18 -9 22 0 c 5 -8 16 -8 20 2" />
      <path d="M92 164 q 2 -6 6 -4 M160 162 q 3 -6 7 -3 M126 160 q 2 -5 6 -3" strokeOpacity="0.22" />
      {/* mặt hồ gợn sóng */}
      <path d="M40 190 C 90 180, 170 180, 222 190" />
      <path d="M62 202 C 100 195, 160 195, 200 202" />
      <path d="M90 212 C 112 208, 148 208, 170 212" strokeOpacity="0.18" />
      {/* đá bên hồ */}
      <path d="M18 196 q 6 -14 20 -10 q 10 3 8 12 Z M226 194 q 8 -12 20 -6 q 8 5 2 10 Z" />
      {/* thông trên vách, chim bay */}
      <path d={`${pineTree(26, 46, 0.8)} ${pineTree(48, 44, 0.6)} ${pineTree(214, 36, 0.8)} ${pineTree(236, 38, 0.6)}`} />
      <path d={BIRD} transform="translate(150 12) scale(0.7)" />
      <path d={BIRD} transform="translate(176 22) scale(0.5)" />
    </>
  ),
  /** Dù lượn bay trên đỉnh núi (đèo Khau Phạ): cánh dù chia ô, dây dù, phi công ngồi ghế; mây và núi tuyết. */
  paraglider: () => {
    const top = [[66, 74], [130, 18], [194, 74]] as const;
    const bot = [[66, 74], [130, 58], [194, 74]] as const;
    const cells = [1, 2, 3, 4, 5, 6, 7].map((i) => { const [x1, y1] = quadAt(top, i / 8); const [x2, y2] = quadAt(bot, i / 8); return `M${x1} ${y1} L${x2} ${y2}`; }).join(' ');
    return (
      <>
        <path d="M66 74 Q 130 18 194 74 Q 130 58 66 74 Z" />
        <path d={cells} strokeOpacity="0.2" />
        <path d="M66 74 L 124 126 M 194 74 L 136 126 M 98 64 L 127 126 M 162 64 L 133 126" strokeOpacity="0.22" />
        <circle cx="130" cy="118" r="6" />
        <path d="M130 126 V150 M130 134 L121 143 M130 134 L139 143 M130 150 L123 166 M130 150 L137 166" />
        <path d="M120 146 Q 130 156 142 146" strokeOpacity="0.25" />
        <path d={cloud(26, 120, 0.8)} />
        <path d={cloud(206, 140, 0.6)} />
        <circle cx="228" cy="36" r="10" />
        <path d="M-6 208 L56 172 Q62 168 68 172 L102 196 L148 166 Q154 162 160 166 L266 208" />
        <path d="M50 176 L56 172 Q62 168 68 172 L74 176 L69 175 L65 179 L61 175 L56 178 Z M142 170 L148 166 Q154 162 160 166 L166 170 L161 169 L157 173 L153 169 L148 172 Z" strokeOpacity="0.25" />
        <path d={BIRD} transform="translate(196 92) scale(0.6)" />
      </>
    );
  },
  /** Ba cây thông nhiều tầng có vân lá kim trên đồi, đá và cỏ dưới chân, chim bay. */
  pine: () => (
    <>
      {([[70, 1], [128, 1.3], [188, 0.9]] as const).map(([x, k]) => (
        <g key={x} transform={`translate(${x} ${176 - 92 * k}) scale(${k})`}>
          <path d="M0 0 L-16 24 H-7 L-22 48 H-9 L-26 74 H26 L9 48 H22 L7 24 H16 Z" />
          <path d="M0 6 V 70 M0 20 l -6 4 M0 20 l 6 4 M0 40 l -9 6 M0 40 l 9 6 M0 60 l -12 8 M0 60 l 12 8" strokeOpacity="0.16" />
          <path d="M-3 74 V92 M3 74 V92" />
        </g>
      ))}
      <path d="M-6 178 Q 130 170 266 178" />
      <path d="M20 192 Q 80 186 150 192 T 260 190" strokeOpacity="0.18" />
      <path d="M30 178 a10 6 0 0 1 20 0 M218 176 a8 5 0 0 1 16 0" strokeOpacity="0.25" />
      <path d={`${tuft(100, 176)} ${tuft(160, 175)} ${tuft(244, 177)}`} strokeOpacity="0.22" />
      <path d={BIRD} transform="translate(200 40) scale(0.7)" />
      <path d={BIRD} transform="translate(222 58) scale(0.5)" />
    </>
  ),
  /** Đàn chim bay: hai cánh có bề dày, xa dần; mây, mặt trời và dãy núi thấp. */
  birds: () => (
    <>
      {([[34, 70, 1], [100, 34, 1.5], [170, 84, 1.2], [76, 128, 0.9], [200, 150, 0.8], [140, 110, 0.6], [226, 44, 0.55]] as const).map(([x, y, k]) => (
        <path key={x} d="M0 0 Q 10 -14 20 -2 Q 22 -6 24 -2 Q 34 -14 44 0 Q 34 -8 24 2 Q 22 4 20 2 Q 10 -8 0 0 Z" transform={`translate(${x} ${y}) scale(${k * 0.8})`} />
      ))}
      <circle cx="214" cy="104" r="13" strokeOpacity="0.22" />
      <path d={cloud(40, 176, 0.9)} />
      <path d={cloud(176, 30, 0.6)} strokeOpacity="0.22" />
      <path d="M-6 200 L 40 182 L 64 192 L 110 172 L 150 190 L 196 178 L 266 198" strokeOpacity="0.2" />
      <path d="M-6 200 Q 60 192 130 198 T 266 196" />
    </>
  ),
  /** Cầu treo bắc qua suối: trụ có giằng, dây võng, mặt cầu lát ván, bờ đá, thông hai đầu, sóng nước. */
  bridge: () => (
    <>
      <path d="M-6 142 H266" />
      <path d={`M-6 148 H266 ${Array.from({ length: 22 }, (_, i) => `M${i * 12 + 2} 142 V148`).join(' ')}`} strokeOpacity="0.2" />
      <path d="M65 142 V70 M75 142 V70 M185 142 V70 M195 142 V70 M62 70 H78 M182 70 H198" />
      <path d="M65 94 H75 M65 118 H75 M185 94 H195 M185 118 H195 M65 94 L75 118 M75 94 L65 118 M185 94 L195 118 M195 94 L185 118" strokeOpacity="0.2" />
      <path d="M-6 122 Q 36 102 70 70 Q 130 134 190 70 Q 224 102 266 122" />
      {Array.from({ length: 7 }, (_, i) => {
        const x = 82 + i * 16;
        const t = (x - 70) / 120;
        const y = (1 - t) * (1 - t) * 70 + 2 * t * (1 - t) * 134 + t * t * 70;
        return <path key={x} d={`M${x} ${y.toFixed(1)} V142`} />;
      })}
      <path d="M-6 150 L 26 150 Q 44 160 36 178 M266 150 L 232 150 Q 214 160 222 178" strokeOpacity="0.25" />
      <path d="M10 166 a8 5 0 0 1 16 0 M234 168 a8 5 0 0 1 16 0" strokeOpacity="0.2" />
      <path d={`${pineTree(18, 142, 0.9)} ${pineTree(244, 142, 0.8)}`} strokeOpacity="0.25" />
      <path d="M34 178 Q 54 170 74 178 T 114 178 T 154 178 T 194 178 T 234 178" />
      <path d="M20 196 Q 40 188 60 196 T 100 196 T 140 196 T 180 196 T 220 196" />
      <path d="M60 210 Q 80 204 100 210 M150 212 Q 170 206 190 212" strokeOpacity="0.16" />
      <path d={BIRD} transform="translate(118 40) scale(0.7)" />
    </>
  ),
  /** Con đèo quanh co giữa các sườn núi: vạch giữa đường, cọc tiêu, thông ven đường, núi tuyết và mặt trời. */
  pass: () => (
    <>
      <path d="M150 56 L 196 18 Q 202 14 208 18 L 266 64" strokeOpacity="0.2" />
      <path d="M70 200 C 150 180, 70 152, 150 132 C 220 114, 120 94, 160 56" />
      <path d="M112 200 C 192 184, 120 160, 186 136 C 250 118, 160 98, 186 56" />
      <path d="M91 200 C 171 182, 95 156, 168 134 C 234 116, 140 96, 173 56" strokeDasharray="4 8" />
      <path d="M118 160 v -7 M124 150 v -7 M196 124 v -7 M204 116 v -7" strokeOpacity="0.3" />
      <path d="M-6 160 L 28 112 Q 34 104 40 112 L 64 144 L 84 110 Q 88 104 92 110 L 104 128" />
      <path d="M22 120 L28 112 Q34 104 40 112 L46 120 L41 118 L37 123 L33 117 L28 121 Z" strokeOpacity="0.25" />
      <path d="M40 122 L 50 138 M46 132 L 56 146" strokeOpacity="0.16" />
      <path d={`${pineTree(56, 200, 0.8)} ${pineTree(206, 180, 0.7)} ${pineTree(222, 186, 0.9)} ${pineTree(136, 112, 0.6)}`} strokeOpacity="0.25" />
      <circle cx="226" cy="42" r="13" />
      <path d={rays(226, 42, 18, 23)} strokeOpacity="0.22" />
    </>
  ),
  /** Cành hoa ban / hoa mận nở: cánh có gân, nhụy, nụ và lá. */
  flower: () => (
    <>
      <path d="M26 204 C 70 172, 110 152, 150 112 S 210 62, 238 40" />
      <path d="M120 128 q -6 -16 -18 -18 M170 84 q -4 -14 -16 -18 M74 168 q 10 8 22 6" strokeOpacity="0.25" />
      {([[96, 152, 1], [152, 108, 1.25], [198, 66, 1], [58, 186, 0.8], [226, 46, 0.7]] as const).map(([x, y, k], n) => (
        <g key={n} transform={`translate(${x} ${y}) scale(${k})`}>
          {Array.from({ length: 5 }, (_, i) => (
            <path key={i} d="M0 0 C -9 -10, -9 -24, 0 -28 C 9 -24, 9 -10, 0 0 Z" transform={`rotate(${i * 72})`} />
          ))}
          <path d={Array.from({ length: 5 }, (_, i) => { const a = ((i * 72 - 90) * Math.PI) / 180; return `M${f(Math.cos(a) * 6)} ${f(Math.sin(a) * 6)} L${f(Math.cos(a) * 20)} ${f(Math.sin(a) * 20)}`; }).join(' ')} strokeOpacity="0.15" />
          <path d={rays(0, 0, 4, 10, 6, 0.5)} strokeOpacity="0.3" />
          <circle r="3.5" />
        </g>
      ))}
      <ellipse cx="0" cy="0" rx="4" ry="7" transform="translate(100 112) rotate(-30)" />
      <ellipse cx="0" cy="0" rx="3.5" ry="6" transform="translate(150 70) rotate(-24)" />
      {([[130, 132, 40], [184, 78, -150], [40, 196, -40]] as const).map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(0.7)`}>
          <path d={LEAF} />
          <path d={LEAF_VEINS} strokeOpacity="0.16" />
        </g>
      ))}
    </>
  ),

  // -- Lưu trú --
  /** Đống lửa trại: củi chéo có vòng gỗ, lửa nhiều lưỡi, vòng đá, tia lửa và khói. */
  campfire: () => (
    <>
      <path d={`${rod([72, 182], [188, 200], 8)} ${rod([188, 182], [72, 200], 8)}`} />
      <ellipse cx="72" cy="182" rx="2.5" ry="4" strokeOpacity="0.25" />
      <ellipse cx="188" cy="182" rx="2.5" ry="4" strokeOpacity="0.25" />
      <path d="M96 188 l 10 1.5 M150 194 l 12 2 M100 196 l 8 -1.2 M156 186 l 10 -1.5" strokeOpacity="0.16" />
      <path d="M130 172 C 100 162, 96 130, 122 104 C 120 126, 134 128, 138 110 C 160 130, 166 158, 130 172 Z" />
      <path d="M130 168 C 118 162, 118 146, 130 136 C 142 146, 142 162, 130 168 Z" />
      <path d="M108 176 C 96 166, 100 150, 110 140 C 110 154, 118 160, 116 172 M152 176 C 164 166, 160 150, 152 142 C 152 156, 146 160, 146 172" strokeOpacity="0.25" />
      <path d="M60 204 a9 6 0 0 1 18 0 M182 204 a9 6 0 0 1 18 0 M84 210 a8 5 0 0 1 16 0 M160 210 a8 5 0 0 1 16 0 M120 212 a10 5 0 0 1 20 0" />
      <circle cx="98" cy="92" r="2.5" />
      <circle cx="164" cy="82" r="2" />
      <circle cx="146" cy="62" r="2.5" />
      <path d="M112 76 l 4 -8 M174 106 l 6 -6 M88 120 l -6 -4" />
      <path d="M128 96 C 120 84, 136 76, 128 62 C 122 52, 132 44, 126 34" strokeOpacity="0.16" />
    </>
  ),
  /** Giường gỗ: đầu giường núm tròn, gối có nếp, chăn thổ cẩm, thảm tua rua; trăng sao ngoài trời đêm. */
  bed: () => (
    <>
      <path d="M40 174 V 92 Q 40 82 48 82 Q 56 82 56 92 V 174 M216 174 V 122 Q 216 114 210 114 Q 204 114 204 122 V 174" />
      <circle cx="48" cy="78" r="3" />
      <path d="M56 100 H 68 M56 108 H 68" strokeOpacity="0.16" />
      <path d="M40 144 H216" />
      <path d="M40 154 H216" strokeOpacity="0.2" />
      <path d="M58 144 V122 Q58 114 66 114 H98 Q106 114 106 122 V144" />
      <path d="M64 124 Q 80 128 98 122" strokeOpacity="0.2" />
      <path d="M106 144 V130 Q150 118 204 128 V144" />
      <path d="M118 134 Q 150 126 190 134" />
      <path d="M114 140 l 6 -4 l 6 4 l 6 -4 l 6 4 l 6 -4 l 6 4 l 6 -4 l 6 4 l 6 -4 l 6 4 l 6 -4 l 6 4" strokeOpacity="0.22" />
      <path d="M44 174 V 182 M212 174 V 182" />
      <path d="M58 194 H 202 M64 194 l -2 6 M76 194 l -2 6 M88 194 l -2 6 M184 194 l 2 6 M196 194 l 2 6" strokeOpacity="0.2" />
      <path d="M160 52 a14 14 0 1 0 10 24 a11 11 0 0 1 -10 -24 Z" />
      <path d="M92 60 l 0 10 M87 65 h 10 M126 40 v 6 M123 43 h 6 M210 44 v 6 M207 47 h 6" />
    </>
  ),
  /** Ấm trà bốc khói: nắp có núm, vòi, quai, dải hoa văn; hai chén trà và khay. */
  teapot: () => (
    <>
      <path d="M84 138 C 84 104, 156 104, 156 138 C 156 162, 84 162, 84 138 Z" />
      <path d="M100 112 Q120 96 140 112" />
      <circle cx="120" cy="94" r="4" />
      <path d="M106 104 Q 120 100 134 104" strokeOpacity="0.2" />
      <path d="M86 132 Q 120 142 154 132 M86 144 Q 120 154 154 144" strokeOpacity="0.2" />
      <path d="M92 138 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3" strokeOpacity="0.22" />
      <path d="M156 128 C 172 126, 178 114, 190 106 C 194 114, 184 134, 156 142" />
      <ellipse cx="189" cy="107" rx="2.5" ry="1.5" strokeOpacity="0.25" />
      <path d="M84 124 C 56 120, 56 152, 86 150 M84 130 C 66 128, 66 146, 86 144" />
      <path d="M96 162 H144" />
      <path d="M110 82 C 102 72, 118 64, 108 52 M130 82 C 122 72, 138 64, 128 52" />
      <path d="M48 196 Q 130 204 212 196 M60 190 H 200" strokeOpacity="0.22" />
      <path d="M176 172 H 204 C 204 190, 176 190, 176 172 Z M40 176 H 66 C 66 192, 40 192, 40 176 Z" />
      <path d="M180 176 Q 190 179 200 176" strokeOpacity="0.2" />
      <path d="M190 166 C 186 160, 194 156, 190 148" strokeOpacity="0.2" />
    </>
  ),
  /** Ô cửa sổ vòm: khung ô kính, rèm buộc, trăng sao, núi xa ngoài cửa, chậu hoa trên bậu. */
  window: () => (
    <>
      <path d="M76 190 V84 Q76 38 130 38 Q184 38 184 84 V190 Z" />
      <path d="M84 190 V86 Q84 46 130 46 Q176 46 176 86 V190" strokeOpacity="0.18" />
      <path d="M130 38 V190 M76 112 H184" />
      <path d="M76 56 Q 102 96 82 176 M96 48 Q 118 96 100 176" />
      <path d="M80 128 Q 92 134 102 126" />
      <path d="M86 70 Q 100 100 90 160" strokeOpacity="0.16" />
      <path d="M154 60 a15 15 0 1 0 10 27 a12 12 0 0 1 -10 -27 Z" />
      <path d="M144 96 v 6 M141 99 h 6 M110 66 v 5 M107.5 68.5 h 5" strokeOpacity="0.3" />
      <path d="M130 176 L 146 154 L 156 164 L 168 146 L 184 166" strokeOpacity="0.22" />
      <path d="M62 190 H198 M68 200 H192" />
      <path d="M158 190 L 160 178 H 176 L 178 190" />
      <path d="M168 178 C 164 166, 168 160, 168 152 M168 172 Q 158 166 156 158 M168 170 Q 178 164 180 156" strokeOpacity="0.3" />
      <circle cx="168" cy="149" r="3" />
    </>
  ),
  /** Đèn dầu thắp sáng: bóng thủy tinh có vệt sáng, ngọn lửa hai lớp, đế có hoa văn, quai cầm, vầng sáng. */
  lamp: () => (
    <>
      <path d="M96 190 H164 L156 164 H104 Z" />
      <path d="M100 178 H 160" strokeOpacity="0.2" />
      <path d="M108 184 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 4 3" strokeOpacity="0.2" />
      <path d="M108 146 C 96 114, 112 98, 114 76 H146 C 148 98, 164 114, 152 146 Z" />
      <path d="M116 132 C 108 116, 118 104, 120 88" strokeOpacity="0.2" />
      <path d="M130 138 C 120 126, 124 114, 130 104 C 136 114, 140 126, 130 138 Z" />
      <path d="M130 134 C 126 128, 127 120, 130 114 C 133 120, 134 128, 130 134 Z" strokeOpacity="0.25" />
      <path d="M126 146 V 140 H 134 V 146" strokeOpacity="0.25" />
      <path d="M110 76 H150 M118 68 H142 M104 164 C 98 152, 106 146, 108 146 M156 164 C 162 152, 154 146, 152 146" />
      <path d="M164 172 C 186 172, 188 152, 170 150" />
      <path d="M130 40 V52 M96 54 L104 62 M164 54 L156 62 M78 88 H92 M168 88 H182 M84 120 l 10 -3 M176 120 l -10 -3" />
      <path d="M60 192 H 200" strokeOpacity="0.2" />
    </>
  ),

  // -- Ẩm thực / đặc sản --
  /** Cá suối nướng trên đĩa: vảy, mang, vây có tia, đuôi tia, rau thơm và khói. */
  fish: () => (
    <>
      <ellipse cx="132" cy="160" rx="100" ry="16" strokeOpacity="0.22" />
      <path d="M48 112 C 80 76, 152 76, 186 112 C 152 148, 80 148, 48 112 Z" />
      <path d="M186 112 L 226 84 Q 216 112 226 140 Z" />
      <path d="M190 112 L 220 92 M190 112 H 218 M190 112 L 220 132" strokeOpacity="0.18" />
      <circle cx="74" cy="104" r="4" />
      <path d="M58 116 Q 66 120 74 118" strokeOpacity="0.25" />
      <path d="M96 90 Q 106 112 96 134" />
      <path d="M112 82 Q 132 60 152 82 M122 142 Q 136 158 152 142" />
      <path d="M120 80 L 126 70 M132 78 L 134 66 M144 80 L 144 70" strokeOpacity="0.2" />
      <path d={[110, 126, 142, 158].flatMap((x, i) => [96, 110, 124].slice(i === 3 ? 1 : 0, i === 3 ? 2 : 3).map((y) => `M${x} ${y} q 8 6 0 12`)).join(' ')} strokeOpacity="0.22" />
      <path d="M70 140 C 64 152, 90 156, 80 166 M176 140 C 170 152, 196 156, 186 166" strokeOpacity="0.16" />
      <g transform="translate(40 156) rotate(-20) scale(0.6)">
        <path d={LEAF} />
        <path d="M4 0 H34" strokeOpacity="0.18" />
      </g>
      <path d="M98 70 C 92 60, 104 54, 98 44 M128 60 C 122 50, 134 44, 128 34" strokeOpacity="0.2" />
      <circle cx="34" cy="88" r="3" />
      <circle cx="26" cy="72" r="2" />
    </>
  ),
  /** Vò rượu ngô: nút lá buộc dây, cần hút, hoa văn sóng, men chảy; chén nhỏ có đế. */
  wineJar: () => (
    <>
      <path d="M92 84 C 70 100, 66 168, 96 186 H164 C 194 168, 190 100, 168 84 Z" />
      <path d="M100 84 V70 H160 V84" />
      <path d="M94 70 Q 130 46 166 70" />
      <path d="M112 62 Q 108 50 100 44 M148 62 Q 152 50 160 44 M130 56 Q 130 46 134 40" strokeOpacity="0.25" />
      <path d="M104 80 H156" />
      <path d="M100 76 Q 130 82 160 76 M154 78 q 6 10 0 20 M148 79 q 8 8 4 18" strokeOpacity="0.25" />
      <path d="M136 58 C 150 32, 176 22, 204 20" />
      <path d="M82 134 q 7 -9 14 0 t 14 0 t 14 0 t 14 0 t 14 0 t 14 0 t 14 0" />
      <path d="M82 154 H178 M84 116 H176" strokeOpacity="0.2" />
      <path d="M100 98 q -2 10 2 16 M150 96 q 2 12 -2 20 M120 160 q 2 8 0 14" strokeOpacity="0.16" />
      <path d="M192 176 H228 C 228 196, 192 196, 192 176 Z" />
      <path d="M196 180 Q 210 184 224 180" strokeOpacity="0.2" />
      <path d="M210 196 V202 M200 204 H220" />
      <path d="M60 206 H 236" strokeOpacity="0.18" />
    </>
  ),
  /** Bắp ngô: hạt xếp hàng, lá bao có gân, râu ngô, thân và lá. */
  corn: () => (
    <>
      <path d="M130 38 C 162 56, 166 122, 130 152 C 94 122, 98 56, 130 38 Z" />
      {([[130, 46, 146], [121, 52, 142], [139, 52, 142], [112, 62, 132], [148, 62, 132]] as const).map(([x, y0, y1]) => (
        <path key={x} d={`M${x} ${y0} ${Array.from({ length: Math.floor((y1 - y0) / 8) }, () => 'q 4 4 0 8').join(' ')}`} strokeOpacity="0.25" />
      ))}
      <path d="M130 38 C 126 26, 118 20, 108 18 M130 38 C 132 24, 140 18, 150 14 M130 40 C 124 30, 128 22, 122 10" strokeOpacity="0.25" />
      <path d="M130 152 C 94 152, 66 120, 60 70 C 88 92, 108 122, 130 152" />
      <path d="M130 152 C 166 152, 194 120, 200 70 C 172 92, 152 122, 130 152" />
      <path d="M126 148 C 104 140, 80 112, 68 84 M134 148 C 156 140, 180 112, 192 84" strokeOpacity="0.18" />
      <path d="M130 152 V212" />
      <path d="M130 186 C 110 176, 84 180, 60 198 C 86 190, 108 188, 130 190 M130 174 C 150 160, 180 160, 204 174 C 178 170, 152 172, 130 178" strokeOpacity="0.25" />
      <path d="M100 212 H 160" strokeOpacity="0.18" />
    </>
  ),
  /** Cành chè Shan tuyết: lá có gân, búp non một tôm hai lá; chén trà bốc khói. */
  teaLeaf: () => (
    <>
      <path d="M56 196 C 90 156, 130 122, 194 58" />
      {([[84, 164], [108, 142], [132, 120], [158, 96]] as const).map(([x, y]) => (
        <g key={x}>
          {[-105, -5].map((r) => (
            <g key={r} transform={`translate(${x} ${y}) rotate(${r}) scale(0.9)`}>
              <path d={LEAF} />
              <path d={LEAF_VEINS} strokeOpacity="0.16" />
            </g>
          ))}
        </g>
      ))}
      <path d="M0 0 C 6 -8, 20 -8, 28 0 C 20 8, 6 8, 0 0 Z" transform="translate(194 58) rotate(-62)" />
      <path d="M0 0 C 5 -6, 15 -6, 20 0 C 15 6, 5 6, 0 0 Z" transform="translate(190 62) rotate(-110)" />
      <path d="M0 0 C 5 -6, 15 -6, 20 0 C 15 6, 5 6, 0 0 Z" transform="translate(192 62) rotate(-20)" />
      <path d="M176 172 H220 C 220 196, 176 196, 176 172 Z" />
      <path d="M220 178 q 10 0 8 10 q -2 6 -10 4" />
      <path d="M180 176 Q 198 180 216 176" strokeOpacity="0.2" />
      <path d="M168 202 Q 198 210 228 202" />
      <path d="M190 164 C 184 156, 196 150, 190 140 M204 164 C 198 156, 210 150, 204 140" strokeOpacity="0.2" />
    </>
  ),
  /** Chiếc gùi đan của người vùng cao: hoa văn đan, quai đeo, chân gùi, củi và lá rừng bên trong. */
  basket: () => {
    const edge = (y: number) => 0.151 * (y - 72);
    const zig = [85, 111, 137, 163].map((yc) => {
      const x0 = 80 + edge(yc);
      const x1 = 180 - edge(yc);
      const n = Math.floor((x1 - x0) / 8);
      return `M${f(x0)} ${yc + 5} ${Array.from({ length: n }, (_, i) => `L${f(x0 + (i + 0.5) * 8)} ${i % 2 ? yc + 5 : yc - 5}`).join(' ')}`;
    }).join(' ');
    return (
      <>
        <path d="M100 72 L92 40 M112 72 L114 32 M118 72 L124 38" />
        <path d="M150 72 C 150 52, 166 42, 178 40 C 172 54, 162 66, 150 72 Z M134 72 C 128 56, 134 46, 142 40 C 144 52, 140 64, 134 72 Z" />
        <path d="M78 72 H182 L166 178 Q 130 192 94 178 Z" />
        <path d="M72 72 H188 M74 66 H186" />
        <path d="M82 98 H178 M86 124 H174 M90 150 H170" />
        <path d={zig} strokeOpacity="0.2" />
        <path d="M104 72 L 112 184 M130 72 V188 M156 72 L 148 184" strokeOpacity="0.2" />
        <path d="M78 72 C 38 92, 38 152, 76 170 M182 72 C 222 92, 222 152, 184 170" />
        <path d="M70 80 C 44 98, 44 146, 72 162 M190 80 C 216 98, 216 146, 188 162" strokeOpacity="0.18" />
        <path d="M104 184 L 100 200 M156 184 L 160 200 M96 200 H 108 M152 200 H 164" />
      </>
    );
  },
  /** Cơm lam: ba ống tre có đốt, nút lá, vết cháy, hạt cơm ở miệng ống; lá chuối lót dưới. */
  comLam: () => (
    <>
      {([[84, 70, 128], [130, 48, 150], [176, 82, 118]] as const).map(([x, top, h]) => (
        <g key={x}>
          <path d={`M${x - 15} ${top} V${top + h} Q ${x} ${top + h + 7} ${x + 15} ${top + h} V${top}`} />
          <ellipse cx={x} cy={top} rx="15" ry="5" />
          <ellipse cx={x} cy={top} rx="10" ry="3" strokeOpacity="0.2" />
          <path d={`M${x - 15} ${top + h * 0.45} Q ${x} ${top + h * 0.45 + 7} ${x + 15} ${top + h * 0.45} M${x - 15} ${top + h * 0.45 + 4} Q ${x} ${top + h * 0.45 + 11} ${x + 15} ${top + h * 0.45 + 4}`} />
          <path d={`M${x - 8} ${top + 20} l 4 6 M${x + 4} ${top + 30} l 5 7 M${x - 6} ${top + h * 0.7} l 4 6 M${x + 6} ${top + h * 0.8} l 3 5`} strokeOpacity="0.2" />
          <path d={`M${x} ${top - 5} C ${x - 6} ${top - 20}, ${x - 20} ${top - 22}, ${x - 26} ${top - 14}`} />
        </g>
      ))}
      <path d="M40 206 Q 130 186 220 206 Q 130 216 40 206 Z" />
      <path d="M48 206 Q 130 200 212 206 M80 202 l -6 -4 M110 199 l -6 -4 M150 199 l 6 -4 M180 202 l 6 -4" strokeOpacity="0.18" />
    </>
  ),
  /** Xiên thịt nướng: miếng thịt có vân nướng xen rau, vỉ nướng, than hồng và khói. */
  skewers: () => (
    <>
      {([-34, 0, 34] as const).map((dy) => (
        <g key={dy} transform={`translate(130 104) rotate(-28) translate(0 ${dy})`}>
          <path d="M-96 0 H104" />
          <circle cx="-100" cy="0" r="4" />
          {[-62, -28, 6, 40].map((x) => (
            <path key={x} d={`M${x} -9 h24 q7 0 7 7 v4 q0 7 -7 7 h-24 q-7 0 -7 -7 v-4 q0 -7 7 -7 Z`} />
          ))}
          <path d={[-62, -28, 6, 40].map((x) => `M${x + 2} -7 l 6 14 M${x + 12} -7 l 6 14`).join(' ')} strokeOpacity="0.2" />
          <path d="M-36 -5 v 10 M-2 -5 v 10 M32 -5 v 10" strokeOpacity="0.25" />
        </g>
      ))}
      <path d="M40 186 H220 M40 196 H220" />
      <path d={Array.from({ length: 10 }, (_, i) => `M${52 + i * 18} 186 V196`).join(' ')} strokeOpacity="0.2" />
      <path d="M56 206 a8 5 0 0 1 16 0 M84 208 a9 5 0 0 1 18 0 M118 206 a8 5 0 0 1 16 0 M150 208 a9 5 0 0 1 18 0 M184 206 a8 5 0 0 1 16 0" strokeOpacity="0.22" />
      <path d="M70 182 C 66 172, 78 168, 74 158 M130 182 C 126 172, 138 168, 134 158 M190 182 C 186 172, 198 168, 194 158" />
    </>
  ),
  /** Nồi lẩu: quai, dải hoa văn sóng, nấm, rau, bọt sôi, khói, bếp có lửa. */
  pot: () => (
    <>
      <path d="M64 112 H196 V150 Q 196 180 166 180 H94 Q 64 180 64 150 Z" />
      <path d="M56 112 H204" />
      <path d="M64 124 H44 Q 36 124 36 132 M196 124 H216 Q 224 124 224 132" />
      <path d="M64 130 H44 M196 130 H216" strokeOpacity="0.2" />
      <path d="M68 146 q 8 -6 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0" strokeOpacity="0.22" />
      <path d="M80 112 C 80 92, 104 92, 104 112 M150 112 C 152 96, 176 96, 178 112" />
      <path d="M88 112 V 104 M96 112 V 104 M160 112 V 106 M168 112 V 106" strokeOpacity="0.2" />
      <path d="M112 112 C 108 96, 112 86, 120 80 C 122 92, 120 104, 112 112 Z M132 112 C 130 98, 138 88, 146 86 C 146 98, 140 106, 132 112 Z" />
      <circle cx="124" cy="108" r="2.5" strokeOpacity="0.25" />
      <circle cx="142" cy="104" r="2" strokeOpacity="0.25" />
      <path d="M96 76 C 88 66, 104 58, 96 46 M130 70 C 122 60, 138 52, 130 40 M164 76 C 156 66, 172 58, 164 46" />
      <path d="M86 180 L 76 198 M174 180 L 184 198 M66 198 H 194" />
      <path d="M110 194 q -4 -6 0 -12 q 4 6 0 12 M130 194 q -4 -6 0 -12 q 4 6 0 12 M150 194 q -4 -6 0 -12 q 4 6 0 12" strokeOpacity="0.25" />
    </>
  ),
  /** Bánh chưng gói lá dong: lạt buộc chữ thập có nơ, gân lá, nếp gấp góc; đĩa lá lót. */
  banhChung: () => (
    <>
      <path d="M70 58 H190 Q 196 58 196 64 V 176 Q 196 182 190 182 H70 Q 64 182 64 176 V64 Q 64 58 70 58 Z" />
      <path d="M122 58 V182 M138 58 V182 M64 111 H196 M64 127 H196" />
      <path d="M64 58 L 90 84 M196 58 L 170 84 M64 182 L 90 156 M196 182 L 170 156" />
      <path d="M76 58 L 96 78 M88 58 L 104 74 M184 58 L 164 78 M172 58 L 156 74 M76 182 L 96 162 M184 182 L 164 162 M100 98 L 112 108 M160 98 L 148 108 M100 142 L 112 132 M160 142 L 148 132" strokeOpacity="0.16" />
      <path d="M130 119 C 116 102, 102 110, 120 121 M130 119 C 144 102, 158 110, 140 121" />
      <path d="M128 124 L 120 142 M132 124 L 140 142" />
      <circle cx="130" cy="119" r="5" />
      <path d="M50 196 Q 130 210 210 196 M76 196 H184" strokeOpacity="0.25" />
    </>
  ),

  // -- Hành trình / tiện ích --
  /** Ba lô du lịch: túi ngủ cuộn trên nóc, nắp có khóa kéo, túi trước có khóa cài, đường chỉ may, quai đeo. */
  backpack: () => (
    <>
      <path d="M96 46 H164 Q 172 46 172 38 Q 172 30 164 30 H96 Q 88 30 88 38 Q 88 46 96 46 Z" />
      <ellipse cx="94" cy="38" rx="4" ry="8" strokeOpacity="0.25" />
      <path d="M112 28 V48 M148 28 V48" />
      <path d="M82 82 Q 82 48 130 48 Q 178 48 178 82 V 172 Q 178 186 164 186 H96 Q 82 186 82 172 Z" />
      <path d="M90 64 Q 130 54 170 64" strokeDasharray="2 4" />
      <path d="M92 98 Q 130 114 168 98" />
      <path d="M130 106 V 116" />
      <circle cx="130" cy="119" r="2.5" />
      <path d="M96 128 H164 V172 Q 164 178 158 178 H102 Q 96 178 96 172 Z" />
      <path d="M96 142 H164 M122 128 V142" />
      <path d="M125 140 H 135 V 150 H 125 Z" />
      <path d="M102 172 H 158" strokeDasharray="2 4" />
      <path d="M82 92 C 60 102, 58 150, 82 160 M178 92 C 200 102, 202 150, 178 160" />
      <path d="M82 104 C 70 112, 70 142, 82 148 M178 104 C 190 112, 190 142, 178 148" strokeOpacity="0.18" />
      <path d="M196 130 V 140" strokeOpacity="0.25" />
      <ellipse cx="196" cy="150" rx="8" ry="10" strokeOpacity="0.25" />
    </>
  ),
  /** Cột biển chỉ đường bằng gỗ: vân gỗ, đinh, chữ trên biển, đá, cỏ và núi xa. */
  signpost: () => (
    <>
      <path d="M150 198 L 196 166 L 214 178 L 238 158 L 266 186" strokeOpacity="0.16" />
      <path d="M126 198 V 36 L 130 30 L 134 36 V 198" />
      <path d="M130 60 V 70 M130 92 V 108 M130 130 V 140 M130 172 V 190" strokeOpacity="0.16" />
      <path d="M134 54 H196 L214 68 L196 82 H134 Z" />
      <path d="M126 98 H66 L48 112 L66 126 H126 Z" />
      <path d="M134 142 H190 L206 154 L190 166 H134 Z" />
      <path d="M146 64 H184 M146 72 H170 M118 108 H78 M118 116 H92 M146 154 H178" />
      <path d="M140 60 Q 160 62 190 58 M70 104 Q 90 106 116 102 M140 162 Q 160 160 184 162" strokeOpacity="0.14" />
      <circle cx="139" cy="68" r="1.5" />
      <circle cx="121" cy="112" r="1.5" />
      <circle cx="139" cy="154" r="1.5" />
      <path d="M96 198 H164 M104 198 q 4 -10 8 0 M150 198 q 4 -8 8 0" />
      <path d="M86 198 a 8 6 0 0 1 16 0 M164 198 a 6 4 0 0 1 12 0" strokeOpacity="0.25" />
      <path d={`${tuft(118, 198)} ${tuft(146, 198)}`} strokeOpacity="0.25" />
    </>
  ),
  /** Điện thoại hiện bản đồ: đường phố, ghim vị trí, thanh trạng thái, camera, nút cạnh; sóng tín hiệu hai bên. */
  phone: () => (
    <>
      <path d="M98 40 H162 Q 172 40 172 50 V 190 Q 172 200 162 200 H98 Q 88 200 88 190 V50 Q 88 40 98 40 Z" />
      <path d="M98 62 H162 V 172 H98 Z" />
      <path d="M120 50 H140" />
      <circle cx="148" cy="50" r="1.8" />
      <path d="M172 72 h 3 v 16 h -3 M88 80 h -3 v 12 h 3" />
      <path d="M102 68 h 8 M150 66 h 8 v 4 h -8 Z" strokeOpacity="0.25" />
      <circle cx="130" cy="186" r="5" />
      <path d="M98 92 C 120 98, 140 80, 162 86 M98 156 C 116 146, 138 160, 162 150 M112 62 C 118 100, 104 132, 114 172 M150 62 C 146 110, 156 140, 148 172" strokeOpacity="0.16" />
      <path d="M120 152 C 124 146, 132 146, 136 140" strokeDasharray="2 4" />
      <path d="M130 140 C 116 122, 112 114, 112 108 a18 18 0 0 1 36 0 c0 6 -4 14 -18 32 z" />
      <circle cx="130" cy="108" r="6" />
      <path d="M188 54 Q 208 74 188 94 M200 44 Q 228 74 200 104" />
      <path d="M72 54 Q 52 74 72 94 M60 44 Q 32 74 60 104" />
    </>
  ),
  /** Vali: góc bọc, quai xách có đế, đai da khóa cài, ổ khóa, nhãn dán, bánh xe. */
  suitcase: () => (
    <>
      <path d="M54 84 H206 Q 214 84 214 92 V 176 Q 214 184 206 184 H54 Q 46 184 46 176 V92 Q 46 84 54 84 Z" />
      <path d="M46 98 Q 46 92 52 92 M214 98 Q 214 92 208 92 M46 170 Q 46 176 52 176 M214 170 Q 214 176 208 176" strokeOpacity="0.25" />
      <path d="M104 84 V66 Q 104 58 112 58 H148 Q 156 58 156 66 V84" />
      <path d="M112 84 V 68 Q 112 66 114 66 H 146 Q 148 66 148 68 V 84" strokeOpacity="0.2" />
      <path d="M98 84 H 112 M148 84 H 162" />
      <path d="M78 84 V184 M90 84 V184 M170 84 V184 M182 84 V184" />
      <path d="M78 130 H 90 M170 130 H 182" strokeOpacity="0.3" />
      <path d="M118 116 H142 V 130 H118 Z" />
      <circle cx="130" cy="122" r="2" strokeOpacity="0.3" />
      <circle cx="130" cy="158" r="13" />
      <path d="M130 149 l 2.6 5.4 l 5.9 0.8 l -4.3 4.1 l 1 5.9 l -5.2 -2.8 l -5.2 2.8 l 1 -5.9 l -4.3 -4.1 l 5.9 -0.8 Z" strokeOpacity="0.25" />
      <path d="M192 100 H 206 V 120 H 192 Z M195 106 H 203 M195 112 H 201" strokeOpacity="0.25" />
      <path d="M64 184 V 190 M196 184 V 190" />
      <circle cx="64" cy="196" r="6" />
      <circle cx="196" cy="196" r="6" />
    </>
  ),
  /** Hộp cứu thương: nắp, khóa cài, quai, chữ thập; cuộn băng và băng dán bên cạnh. */
  firstAid: () => (
    <>
      <path d="M52 90 H208 Q 216 90 216 98 V 176 Q 216 184 208 184 H52 Q 44 184 44 176 V98 Q 44 90 52 90 Z" />
      <path d="M100 90 V 72 Q 100 64 108 64 H152 Q 160 64 160 72 V 90" />
      <path d="M108 90 V 74 Q 108 72 110 72 H 150 Q 152 72 152 74 V 90" strokeOpacity="0.2" />
      <path d="M44 106 H 216" strokeOpacity="0.25" />
      <path d="M66 100 h 10 v 12 h -10 Z M184 100 h 10 v 12 h -10 Z" />
      <path d="M118 114 H142 V 130 H158 V 150 H142 V 166 H118 V 150 H102 V 130 H118 Z" />
      <path d="M122 118 H 138 V 134 H 154 V 146" strokeOpacity="0.18" />
      <path d="M62 112 V184 M198 112 V184" strokeOpacity="0.2" />
      <circle cx="30" cy="196" r="12" />
      <circle cx="30" cy="196" r="4" />
      <path d="M42 196 H 72" />
      <g transform="translate(224 196) rotate(-30)">
        <path d="M-22 -7 H22 Q 29 -7 29 0 Q 29 7 22 7 H-22 Q -29 7 -29 0 Q -29 -7 -22 -7 Z M-8 -7 V7 M8 -7 V7" />
      </g>
    </>
  ),

  // -- Văn hóa --
  /** Khèn Mông: sáu ống khèn có bề dày, đai buộc, hộp âm vân gỗ, dải vải tua; nốt nhạc bay ra. */
  khen: () => (
    <>
      <path d="M104 150 C 104 130, 156 130, 156 150 C 156 176, 104 176, 104 150 Z" />
      <path d="M110 150 Q 130 144 150 150 M112 160 Q 130 166 148 160" strokeOpacity="0.18" />
      <path d="M130 176 V196 Q 130 204 122 204 H 112" />
      <path d="M112 200 a 4 4 0 1 0 0 8" strokeOpacity="0.3" />
      <path d={([[[110, 140], [82, 34]], [[118, 136], [102, 22]], [[126, 134], [126, 16]], [[134, 134], [150, 22]], [[142, 136], [172, 34]], [[150, 140], [180, 52]]] as const).map(([a, b]) => rod(a, b, 4)).join(' ')} />
      <path d="M94 82 H 166 M90 56 H 170 M98 108 H 160" />
      <path d="M104 154 C 90 162, 92 178, 80 188 M106 158 C 96 168, 100 182, 90 196" strokeOpacity="0.25" />
      <path d="M200 62 V 42 L 216 38 V 58" />
      <ellipse cx="196" cy="62" rx="5" ry="3.5" transform="rotate(-20 196 62)" />
      <ellipse cx="212" cy="58" rx="5" ry="3.5" transform="rotate(-20 212 58)" />
      <path d="M44 84 V 66 Q 52 70 54 78" />
      <ellipse cx="40" cy="84" rx="5" ry="3.5" transform="rotate(-20 40 84)" />
    </>
  ),
  /** Tấm thổ cẩm treo trên thanh gỗ: dải răng cưa, hoa văn thoi, chữ thập, tua rua thắt nút. */
  brocade: () => (
    <>
      <path d="M30 64 H 230" />
      <circle cx="26" cy="64" r="4" />
      <circle cx="234" cy="64" r="4" />
      <path d="M40 70 H220 V150 H40 Z" />
      <path d="M40 84 H220 M40 136 H220" />
      <path d={`M40 81 ${Array.from({ length: 30 }, (_, i) => `L${46 + i * 6} ${i % 2 ? 81 : 73}`).join(' ')}`} strokeOpacity="0.25" />
      <path d={`M40 139 ${Array.from({ length: 30 }, (_, i) => `L${46 + i * 6} ${i % 2 ? 139 : 147}`).join(' ')}`} strokeOpacity="0.25" />
      {[66, 104, 142, 180].map((x) => (
        <g key={x}>
          <path d={`M${x - 17} 110 L ${x} 92 L ${x + 17} 110 L ${x} 128 Z`} />
          <path d={`M${x - 7} 110 L ${x} 102 L ${x + 7} 110 L ${x} 118 Z`} />
          <circle cx={x} cy="110" r="1.5" strokeOpacity="0.3" />
        </g>
      ))}
      <path d="M85 104 V116 M79 110 H91 M123 104 V116 M117 110 H129 M161 104 V116 M155 110 H167" strokeOpacity="0.25" />
      {Array.from({ length: 10 }, (_, i) => 52 + i * 18).map((x) => (
        <g key={x}>
          <path d={`M${x} 150 V 172`} />
          <circle cx={x} cy="158" r="1.6" strokeOpacity="0.3" />
        </g>
      ))}
    </>
  ),
  /** Chiếc ô hoa: mép lượn, nan, hoa nhỏ trên từng múi, chóp ô, cán cong có tua. */
  parasol: () => (
    <>
      <path d="M30 112 C 40 52, 220 52, 230 112 Q 214 126 198 112 Q 182 126 166 112 Q 148 126 130 112 Q 112 126 94 112 Q 78 126 62 112 Q 46 126 30 112 Z" />
      <path d="M130 62 L 62 112 M130 62 L 94 112 M130 62 V 112 M130 62 L 166 112 M130 62 L 198 112" />
      <path d="M44 100 C 60 70, 200 70, 216 100" strokeDasharray="2 5" />
      {([[70, 98], [108, 94], [152, 94], [190, 98]] as const).map(([x, y]) => (
        <g key={x}>
          <path d={rays(x, y, 2, 6, 5)} strokeOpacity="0.25" />
          <circle cx={x} cy={y} r="1.6" strokeOpacity="0.3" />
        </g>
      ))}
      <path d="M130 62 V 46" />
      <circle cx="130" cy="43" r="2.5" />
      <path d="M130 112 V 178 Q 130 196 114 196 Q 100 196 100 184" />
      <path d="M126 150 H 134 M126 156 H 134" strokeOpacity="0.25" />
      <path d="M100 184 V 190 M98 190 L 95 204 M100 190 V 206 M102 190 L 105 204" strokeOpacity="0.25" />
    </>
  ),

  // -- Di chuyển --
  /** Xe máy phượt nhìn nghiêng: bánh có nan và vỏ, yên, chắn bùn, ống xả, gương, đèn pha, túi đồ sau yên, mặt đường. */
  motorbike: () => (
    <>
      <circle cx="66" cy="166" r="26" />
      <circle cx="206" cy="166" r="26" />
      <circle cx="66" cy="166" r="20" strokeOpacity="0.2" />
      <circle cx="206" cy="166" r="20" strokeOpacity="0.2" />
      <path d={`${rays(66, 166, 5, 20, 8)} ${rays(206, 166, 5, 20, 8, 0.3)}`} strokeOpacity="0.16" />
      <circle cx="66" cy="166" r="5" />
      <circle cx="206" cy="166" r="5" />
      <path d="M76 110 Q 76 100 88 100 H 136 Q 148 100 148 110 Z" />
      <path d="M50 100 H 80 V 84 Q 80 78 74 78 H 56 Q 50 78 50 84 Z" />
      <path d="M50 90 H 80 M64 78 V 100" strokeOpacity="0.2" />
      <path d="M38 152 Q 44 124 82 122 H 112" />
      <path d="M148 112 Q 164 110 176 96" />
      <path d="M148 110 L 150 126 M76 110 L 82 122" />
      <path d="M66 166 L 106 144 H 140 L 150 126" />
      <path d="M104 144 H 140 V 162 H 104 Z" />
      <path d="M110 150 H 134 M110 156 H 134" strokeOpacity="0.18" />
      <path d="M104 160 L 128 176 H 150 Q 156 176 156 170" />
      <path d="M206 166 L 182 92" />
      <path d="M180 152 Q 204 126 232 148" />
      <path d="M170 90 H 198 M184 92 L 178 80" />
      <path d="M184 82 L 190 68" />
      <ellipse cx="191" cy="64" rx="5" ry="3.5" />
      <path d="M170 90 a 7 7 0 0 1 -12 4" />
      <circle cx="188" cy="108" r="6" />
      <path d="M200 104 L 222 100 M200 112 L 224 114" strokeDasharray="2 5" />
      <path d="M10 194 H 256" />
      <path d="M30 206 H 250" strokeDasharray="10 12" />
    </>
  ),
  /** Xe khách: hành khách trong ô cửa, cửa lên xuống, gương, đèn pha, sọc thân, mâm bánh, hành lý trên nóc, vạch đường. */
  bus: () => (
    <>
      <path d="M38 82 Q 38 68 52 68 H196 Q 212 68 220 88 L 230 134 V 166 H38 Z" />
      <path d="M52 84 H84 V114 H52 Z M94 84 H126 V114 H94 Z M136 84 H168 V114 H136 Z M178 84 H198 Q 206 84 210 98 L 214 114 H178 Z" />
      {[68, 110, 152, 192].map((x) => (
        <g key={x}>
          <circle cx={x} cy="97" r="5" strokeOpacity="0.25" />
          <path d={`M${x - 8} 114 Q ${x} 102 ${x + 8} 114`} strokeOpacity="0.25" />
        </g>
      ))}
      <path d="M38 132 H230" />
      <path d="M38 142 Q 80 136 120 142 T 230 142" strokeOpacity="0.25" />
      <path d="M180 118 V 166 M196 118 V 166" strokeOpacity="0.25" />
      <path d="M220 88 L 236 82 V 98" />
      <circle cx="222" cy="152" r="4" />
      <path d="M38 156 H 48 M218 162 H 230" strokeOpacity="0.3" />
      <path d="M64 166 a18 18 0 0 1 36 0 M162 166 a18 18 0 0 1 36 0" />
      <circle cx="82" cy="168" r="14" />
      <circle cx="180" cy="168" r="14" />
      <circle cx="82" cy="168" r="5" strokeOpacity="0.3" />
      <circle cx="180" cy="168" r="5" strokeOpacity="0.3" />
      <path d="M56 60 H188 M70 60 q 10 -14 22 0 M112 60 q 14 -18 30 0 M152 60 V 52 H 172 V 60" />
      <path d="M60 68 V 60 M184 68 V 60" strokeOpacity="0.25" />
      <path d="M20 190 H250" />
      <path d="M30 204 H 240" strokeDasharray="12 12" />
    </>
  ),
} satisfies Record<string, () => ReactNode>;

export type MotifName = keyof typeof MOTIFS;
