/**
 * ReaderPreviewModal — Bolum ekleme sirasinda gercek reader gorunumunu taklit
 * eden tam ekran on izleme. Yukleyen kisi sonucu yayinlamadan once gorur.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, X, ZoomIn, ZoomOut } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

type ZoomLevel = 50 | 75 | 100 | 125 | 150
const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 125, 150]

interface ReaderPreviewModalProps {
  pages: string[]
  chapterLabel: string
  mangaTitle: string
  onClose: () => void
}

export default function ReaderPreviewModal({ pages, chapterLabel, mangaTitle, onClose }: ReaderPreviewModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [zoom, setZoom] = useState<ZoomLevel>(100)

  // Esc / Home / End klavye kisayollari
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Home') {
        e.preventDefault()
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
      if (e.key === 'End') {
        e.preventDefault()
        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Scroll ilerleme takibi
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      setScrollProgress(Math.min(Math.max((scrollTop / Math.max(scrollHeight - clientHeight, 1)) * 100, 0), 100))
    }
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [pages.length])

  const zoomIn = () => {
    const i = ZOOM_LEVELS.indexOf(zoom)
    if (i < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[i + 1])
  }
  const zoomOut = () => {
    const i = ZOOM_LEVELS.indexOf(zoom)
    if (i > 0) setZoom(ZOOM_LEVELS[i - 1])
  }

  return (
    <div className="fixed inset-0 z-[11020] flex flex-col overflow-hidden bg-black text-white">
      <header className="shrink-0 border-b border-white/10 bg-black/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">{txa('Kapat')}</span>
            </button>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <span className="truncate text-sm font-medium text-white/90">
              {mangaTitle && <span className="mr-1 text-white/50">{mangaTitle} -</span>}
              {chapterLabel}
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/50">DEMO</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="flex h-7 w-7 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={zoomOut} disabled={zoom === 50}>
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[2.5rem] text-center text-xs font-medium text-white/70">{zoom}%</span>
            <button className="flex h-7 w-7 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30" onClick={zoomIn} disabled={zoom === 150}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="h-0.5 w-full bg-white/10">
          <div className="h-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${scrollProgress}%` }} />
        </div>
      </header>

      <div ref={contentRef} className="flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden bg-neutral-950 px-2 py-4">
        <div className="flex w-full max-w-[1100px] flex-col items-center gap-1" style={{ zoom: `${zoom}%` }}>
          {pages.map((src, i) => (
            <img key={i} src={src} alt={txa('Sayfa {v1}', { v1: i + 1 })} className="block w-full select-none bg-neutral-900" loading="lazy" />
          ))}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/15 bg-black/95 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-xs text-white/60">{txa('{v1} sayfa', { v1: pages.length })}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/70">{Math.round(scrollProgress)}%</span>
            <button className="flex h-7 items-center gap-1 rounded px-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white" onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
              <ArrowUp className="h-3 w-3" />
              <span className="hidden sm:inline">{txa('Basa Don')}</span>
            </button>
          </div>
          <span className="text-xs text-white/40">{txa('Esc ile kapat')}</span>
        </div>
      </footer>
    </div>
  )
}
