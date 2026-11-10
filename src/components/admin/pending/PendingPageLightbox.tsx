import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export interface LightboxPage {
  url: string
  label: string
  /** In a revision: removed (rose) / added (emerald) page. */
  tone?: 'rose' | 'emerald'
}

const TONE_RING = { rose: 'ring-rose-500', emerald: 'ring-emerald-500' } as const

/**
 * Shows chapter pages large: a page is fully read before approving. Navigate with arrows,
 * the strip below and the keyboard (left / right, Esc).
 */
export function PendingPageLightbox({ pages, index, onIndexChange, onClose }: {
  pages: LightboxPage[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const page = index == null ? null : pages[index] ?? null
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (index == null) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onIndexChange(index - 1) }
      if (event.key === 'ArrowRight' && index < pages.length - 1) { event.preventDefault(); onIndexChange(index + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onIndexChange, pages.length])

  // Seritteki secili kucuk resim gorunur kalsin.
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])

  const nav = 'flex size-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-25'

  return (
    <Dialog open={page != null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(94vh,1100px)] w-[min(96vw,1240px)] max-w-none flex-col gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-white sm:max-w-none"
        data-testid="admin-pending-page-lightbox"
      >
        {page && index != null ? (
          <>
            <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
              <DialogTitle className="text-[13.5px] font-bold text-white">{page.label}</DialogTitle>
              <span className="text-[12px] tabular-nums text-white/60">{index + 1} / {pages.length}</span>
              <DialogDescription className="sr-only">{txa('Bölüm sayfasının büyük önizlemesi; sol ve sağ ok tuşlarıyla gezilir.')}</DialogDescription>
              <span className="flex-1" />
              <a href={page.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white/75 hover:bg-white/10 hover:text-white">
                {txa('Yeni sekmede aç')} <ExternalLink className="size-3.5" />
              </a>
              <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20" aria-label={txa('Kapat')}>
                <X className="size-4" />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 items-center gap-3 px-3 py-3">
              <button type="button" className={nav} disabled={index === 0} onClick={() => onIndexChange(index - 1)} aria-label={txa('Önceki sayfa')}>
                <ChevronLeft className="size-5" />
              </button>
              <div className="flex h-full min-w-0 flex-1 items-center justify-center">
                <img key={page.url} src={page.url} alt={page.label} className="max-h-full max-w-full rounded-md object-contain" />
              </div>
              <button type="button" className={nav} disabled={index >= pages.length - 1} onClick={() => onIndexChange(index + 1)} aria-label={txa('Sonraki sayfa')}>
                <ChevronRight className="size-5" />
              </button>
            </div>
            {pages.length > 1 ? (
              <div ref={stripRef} className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-2.5" aria-label={txa('Sayfalar')}>
                {pages.map((entry, entryIndex) => (
                  <button
                    key={`${entry.url}-${entryIndex}`}
                    type="button"
                    onClick={() => onIndexChange(entryIndex)}
                    aria-current={entryIndex === index ? 'true' : undefined}
                    aria-label={entry.label}
                    className={cn(
                      'relative h-16 w-11 shrink-0 overflow-hidden rounded-md opacity-60 ring-2 ring-transparent transition-opacity hover:opacity-100',
                      entry.tone && TONE_RING[entry.tone],
                      entryIndex === index && 'opacity-100 ring-white',
                    )}
                  >
                    <img src={entry.url} alt="" loading="lazy" className="size-full bg-white/5 object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
