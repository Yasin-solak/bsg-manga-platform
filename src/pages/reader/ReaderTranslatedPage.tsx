import { useEffect, useRef, useState } from 'react'
import { TranslatedTextBox } from '@/components/translation/TranslatedTextBox'
import type { TlStyle } from '@/services/translationEditorService'
import { fetchReaderCleanPage, type ReaderOverlayItem } from '@/services/translationReaderService'
import { txa } from '@/i18n/activeLocale'

/**
 * Reader language page: clean base (private R2, access checked in the DB) + the selected
 * language's text. For missing text the team's Turkish text shows temporarily.
 * The text layer is built in natural pixel coordinates and scales to page width.
 */
export function ReaderTranslatedPage({ chapterId, index, width, height, items, language, mode, onLoad }: {
  chapterId: string
  index: number
  width: number
  height: number
  items: ReaderOverlayItem[]
  language: string
  mode: 'page' | 'strip'
  onLoad: (width: number, height: number) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [renderedWidth, setRenderedWidth] = useState(width)

  useEffect(() => {
    const node = wrapperRef.current
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '1200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [chapterId, index])

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    let objectUrl: string | null = null
    setFailed(false)
    fetchReaderCleanPage(chapterId, index, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [visible, chapterId, index])

  useEffect(() => {
    const node = wrapperRef.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setRenderedWidth(node.clientWidth || width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [width])

  const scale = renderedWidth / width
  return (
    <div
      ref={wrapperRef}
      className={mode === 'strip' ? 'relative block w-full bg-neutral-900' : 'relative max-h-full w-auto max-w-full'}
      style={{ aspectRatio: `${width} / ${height}`, ...(mode === 'page' ? { height: '100%' } : {}) }}
      data-testid='reader-translated-page'
    >
      {url && (
        <img
          src={url}
          alt={txa('Sayfa {v1}', { v1: index + 1 })}
          className='absolute inset-0 h-full w-full select-none'
          onLoad={(event) => onLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        />
      )}
      {failed && <span className='absolute inset-0 flex items-center justify-center text-xs text-white/60'>{txa('Sayfa yüklenemedi')}</span>}
      {url && (
        <div className='pointer-events-none absolute left-0 top-0 origin-top-left' style={{ width, height, transform: `scale(${scale})` }}>
          {items.map((item) => (
            <TranslatedTextBox
              key={item.id}
              box={{ ...item, style: item.style as TlStyle | null, fontSuggestion: item.font_suggestion }}
              text={item.text ?? item.fallback_text ?? ''}
              pageWidth={width}
              // Eksik metinde gosterilen yedek ekibin TR metnidir; TR kurallariyla yerlesir.
              lang={item.text ? language : 'tr'}
              resolution={scale * (window.devicePixelRatio || 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
