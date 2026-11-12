/**
 * Hiệu ứng bấm cho nút CTA: mỗi lần nhấn (chuột, chạm, hoặc Enter/Space) gắn tạm lớp .cta-pop để họa tiết quanh nút
 * bung ra rồi tan (xem styles/cta.css). Một listener ủy quyền duy nhất cho cả trang.
 */
const POP_MS = 720

export function installCtaFx(): void {
  if (typeof document === 'undefined') return

  const timers = new WeakMap<HTMLElement, number>()

  const pop = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const cta = target.closest<HTMLElement>('.cta')
    if (!cta || cta.matches(':disabled, [aria-disabled="true"]')) return
    // Bấm liên tiếp: gỡ lớp, ép trình duyệt vẽ lại để animation chạy lại từ đầu.
    cta.classList.remove('cta-pop')
    void cta.offsetWidth
    cta.classList.add('cta-pop')
    const prev = timers.get(cta)
    if (prev) window.clearTimeout(prev)
    timers.set(
      cta,
      window.setTimeout(() => {
        cta.classList.remove('cta-pop')
        timers.delete(cta)
      }, POP_MS),
    )
  }

  document.addEventListener('pointerdown', (event) => pop(event.target), { passive: true })
  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    pop(event.target)
  })
}
