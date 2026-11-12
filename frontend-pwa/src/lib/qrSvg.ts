import qrcode from 'qrcode-generator';

/** Ma trận QR thành một path SVG (mỗi ô tối là một hình vuông 1×1) — nét, in to nhỏ đều sắc. */
export function qrSvgMarkup(text: string, { margin = 2, color = '#0a2e26' }: { margin?: number; color?: string } = {}): string {
  // Mức sửa lỗi Q (~25%): mã in dán ngoài trời bị bẩn / xước vẫn quét được.
  const qr = qrcode(0, 'Q');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + margin * 2;
  let d = '';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
}
