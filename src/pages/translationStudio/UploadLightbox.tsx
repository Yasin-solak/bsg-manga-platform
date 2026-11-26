import { useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight, Trash, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { TlPage } from '@/services/translationStudioService'
import { useRawThumbnail } from './useRawThumbnail'
import { txa } from '@/i18n/activeLocale'

/*
 * Shows a page large in the upload step: wrong page / order / quality is checked before
 * uploading. Navigate with arrows and keyboard (left/right, Esc); deletion works here too.
 * The reader modes of the site can be previewed: one page at a time, or the vertical strip
 * (webtoon) with or without the gap between pages.
 */
type PreviewMode = 'page' | 'strip' | 'seamless'

const MODES: Array<{ key: PreviewMode, label: () => string }> = [
  { key: 'page', label: () => txa('Sayfa sayfa') },
  { key: 'strip', label: () => txa('Dikey şerit') },
  { key: 'seamless', label: () => txa('Boşluksuz şerit') },
]
export function UploadLightbox({ pages, index, localPreview, onIndex, onClose, onRemove, canRemove }: {
  pages: TlPage[]
  index: number
  /** Local preview of a file uploaded in this session (shown without going to the server). */
  localPreview: (pageId: string) => string | undefined
  onIndex: (index: number) => void
  onClose: () => void
  onRemove: (page: TlPage) => void
  canRemove: (page: TlPage) => boolean
}) {
  const [mode, setMode] = useState<PreviewMode>('page')
  const page = pages[index]
  const local = page ? localPreview(page.id) : undefined
  const remote = useRawThumbnail(page && !local && page.rawStatus === 'ready' ? page.id : null)
  const src = local ?? remote

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (mode !== 'page') return
      else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (event.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, mode, onClose, onIndex, pages.length])

  if (!page) return null
  const number = String(index + 1).padStart(2, '0')
  const nav = 'flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white disabled:opacity-25'
  return (
    <div
      className='fixed inset-0 z-[80] flex flex-col bg-black/90 backdrop-blur-sm'
      role='dialog'
      aria-modal='true'
      aria-label={txa('Sayfa {v1}', { v1: number })}
      onClick={onClose}
      data-testid='tl-upload-lightbox'
    >
      <div className='flex items-center gap-3 px-5 py-3 text-white' onClick={(event) => event.stopPropagation()}>
        <span className='text-sm font-bold'>{mode === 'page' ? txa('Sayfa {v1} / {v2}', { v1: number, v2: pages.length }) : txa('{v1} sayfa', { v1: pages.length })}</span>
        {mode === 'page' && <span className='truncate font-mono text-xs text-white/60'>{page.fileName}</span>}
        {mode === 'page' && page.width && page.height && <span className='text-xs text-white/50'>{page.width}×{page.height}</span>}
        <div className='flex-1' />
        <div className='flex rounded-lg bg-white/10 p-0.5' role='radiogroup' aria-label={txa('Okuma modu')} data-testid='tl-upload-preview-mode'>
          {MODES.map((option) => (
            <button
              key={option.key}
              type='button'
              role='radio'
              aria-checked={mode === option.key}
              onClick={() => setMode(option.key)}
              className={cn('h-8 rounded-md border-0 px-3 text-xs font-bold', mode === option.key ? 'bg-white text-black' : 'bg-transparent text-white/75 hover:text-white')}
            >
              {option.label()}
            </button>
          ))}
        </div>
        {mode === 'page' && <button
          type='button'
          disabled={!canRemove(page)}
          onClick={() => onRemove(page)}
          className='flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tl-red)]/50 bg-transparent px-3 text-xs font-bold text-[var(--tl-red)] disabled:opacity-40'
          data-testid='tl-upload-lightbox-remove'
        >
          <Trash weight='bold' size={14} />
          {txa('Sayfayı sil')}
        </button>}
        <button type='button' onClick={onClose} className='flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white' aria-label={txa('Kapat')}>
          <X weight='bold' size={16} />
        </button>
      </div>
      {mode !== 'page' ? (
        <StripPreview pages={pages} start={index} seamless={mode === 'seamless'} localPreview={localPreview} />
      ) : (
      <div className='relative flex min-h-0 flex-1 items-center justify-center gap-4 px-4 pb-4'>
        <button type='button' className={nav} disabled={index === 0} onClick={(event) => { event.stopPropagation(); onIndex(index - 1) }} aria-label={txa('Önceki sayfa')}>
          <CaretLeft weight='bold' size={20} />
        </button>
        <div className='flex h-full min-w-0 flex-1 items-center justify-center' onClick={(event) => event.stopPropagation()}>
          {src
            ? <img src={src} alt={txa('Sayfa {v1}', { v1: number })} className='max-h-full max-w-full object-contain' />
            : <span className='text-sm font-semibold text-white/60'>{page.rawStatus === 'ready' ? txa('Yükleniyor…') : txa('Bu sayfanın dosyası yüklenmemiş.')}</span>}
        </div>
        <button type='button' className={nav} disabled={index >= pages.length - 1} onClick={(event) => { event.stopPropagation(); onIndex(index + 1) }} aria-label={txa('Sonraki sayfa')}>
          <CaretRight weight='bold' size={20} />
        </button>
      </div>
      )}
    </div>
  )
}

/** The reader's vertical strip: pages at reading width one under the other, opening at `start`. */
function StripPreview({ pages, start, seamless, localPreview }: {
  pages: TlPage[]
  start: number
  seamless: boolean
  localPreview: (pageId: string) => string | undefined
}) {
  const startRef = useRef<HTMLDivElement>(null)
  useEffect(() => { startRef.current?.scrollIntoView({ block: 'start' }) }, [])
  return (
    <div className='min-h-0 flex-1 overflow-y-auto pb-6' onClick={(event) => event.stopPropagation()} data-testid='tl-upload-strip'>
      <div className={cn('mx-auto flex w-full max-w-[720px] flex-col', seamless ? 'gap-0' : 'gap-3')}>
        {pages.map((page, position) => (
          <div key={page.id} ref={position === start ? startRef : undefined}>
            <StripImage page={page} position={position} local={localPreview(page.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StripImage({ page, position, local }: { page: TlPage, position: number, local?: string }) {
  const remote = useRawThumbnail(!local && page.rawStatus === 'ready' ? page.id : null)
  const src = local ?? remote
  const label = txa('Sayfa {v1}', { v1: String(position + 1).padStart(2, '0') })
  if (!src) {
    return <div className='flex aspect-[2/3] w-full items-center justify-center bg-white/5 text-sm font-semibold text-white/50'>{label}</div>
  }
  return <img src={src} alt={label} loading='lazy' className='block w-full' />
}
