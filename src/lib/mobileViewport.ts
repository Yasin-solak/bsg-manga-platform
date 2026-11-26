/**
 * iOS Safari zooms the page in when an input whose text is smaller than 16px gets focus, and
 * leaves it zoomed after the keyboard closes. Adding maximum-scale=1 on iOS stops that automatic
 * zoom; iOS still lets people pinch-zoom regardless of maximum-scale (accessibility), so nothing
 * is taken away. Other platforms keep the plain viewport: there maximum-scale would block pinch zoom.
 */
export function isAppleTouchDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iP(hone|ad|od)/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function installMobileViewportFix(doc: Document = document, nav: Navigator = navigator): void {
  if (!isAppleTouchDevice(nav.userAgent, nav.maxTouchPoints ?? 0)) return
  const meta = doc.querySelector('meta[name="viewport"]')
  if (!meta) return
  const content = meta.getAttribute('content') ?? ''
  if (/maximum-scale/.test(content)) return
  meta.setAttribute('content', `${content.replace(/\s*,?\s*$/, '')}, maximum-scale=1`)
}
