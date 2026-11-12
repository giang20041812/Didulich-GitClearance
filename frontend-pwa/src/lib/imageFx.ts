/**
 * Ảnh toàn trang: chưa tải xong thì hiện khung skeleton lấp lánh (thay vì ảnh vẽ dần từng dải / nhảy cỡ), tải xong
 * mới hiện trọn ảnh và mờ dần vào. Một MutationObserver cho cả trang nên không phải sửa từng <img>.
 *
 * - <img data-loading>: đang tải (styles/globals.css giấu nội dung ảnh, nền là skeleton).
 * - <img data-no-skeleton>: vẫn chờ tải xong mới hiện nhưng không vẽ nền skeleton (vd. ảnh hero trên nền tối).
 */
export function installImageFx(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return

  const done = (img: HTMLImageElement) => {
    if (!img.hasAttribute('data-loading')) return
    img.removeAttribute('data-loading')
    img.setAttribute('data-loaded', '')
  }

  const onLoad = (event: Event) => done(event.currentTarget as HTMLImageElement)

  const track = (img: HTMLImageElement) => {
    // Ảnh đã có trong cache / đã giải mã: hiện ngay, không nháy skeleton.
    if (img.complete && (img.naturalWidth > 0 || !img.currentSrc)) {
      img.removeAttribute('data-loading')
      return
    }
    img.removeAttribute('data-loaded')
    img.setAttribute('data-loading', '')
    img.addEventListener('load', onLoad, { once: true })
    img.addEventListener('error', onLoad, { once: true })
  }

  const scan = (node: Node) => {
    if (node instanceof HTMLImageElement) track(node)
    else if (node instanceof Element) node.querySelectorAll('img').forEach(track)
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLImageElement) track(record.target)
      } else {
        record.addedNodes.forEach(scan)
      }
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset'],
  })
  scan(document.documentElement)
}
