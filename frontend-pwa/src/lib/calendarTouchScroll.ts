/** Native vertical scrolling, with horizontal swipes locked for the whole gesture. */
export function attachCalendarTouchScroll(el: HTMLElement): () => void {
  let gesture: { id: number; x: number; y: number; left: number; axis: 'x' | 'y' | null } | null = null;
  let dragged = false;
  const originalSnap = el.style.scrollSnapType;

  const finish = () => {
    gesture = null;
    el.style.scrollSnapType = originalSnap;
  };
  const start = (event: TouchEvent) => {
    finish();
    dragged = false;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, left: el.scrollLeft, axis: null };
  };
  const move = (event: TouchEvent) => {
    if (!gesture) return;
    if (event.touches.length !== 1) { finish(); return; }
    const touch = Array.from(event.touches).find((t) => t.identifier === gesture?.id);
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      dragged = true;
      if (gesture.axis === 'x') el.style.scrollSnapType = 'none';
    }
    if (gesture.axis === 'x' && event.cancelable) {
      event.preventDefault();
      el.scrollLeft = gesture.left - dx;
    }
  };
  const click = (event: MouseEvent) => {
    if (!dragged || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragged = false;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', finish);
  el.addEventListener('touchcancel', finish);
  el.addEventListener('click', click, true);
  return () => {
    finish();
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', finish);
    el.removeEventListener('touchcancel', finish);
    el.removeEventListener('click', click, true);
  };
}
