import { useEffect } from 'react'
import { CaretLeft, CaretRight, Trash, X } from '@phosphor-icons/react'
import type { TlPage } from '@/services/translationStudioService'
import { useRawThumbnail } from './useRawThumbnail'
import { txa } from '@/i18n/activeLocale'

/*
 * Shows a page large in the upload step: wrong page / order / quality is checked before
 * uploading. Navigate with arrows and keyboard (left/right, Esc); deletion works here too.
 */
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
  const page = pages[index]
  const local = page ? localPreview(page.id) : undefined
  const remote = useRawThumbnail(page && !local && page.rawStatus === 'ready' ? page.id : null)
  const src = local ?? remote

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (event.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, onIndex, pages.length])

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
        <span className='text-sm font-bold'>{txa('Sayfa {v1} / {v2}', { v1: number, v2: pages.length })}</span>
        <span className='truncate font-mono text-xs text-white/60'>{page.fileName}</span>
        {page.width && page.height && <span className='text-xs text-white/50'>{page.width}×{page.height}</span>}
        <div className='flex-1' />
        <button
          type='button'
          disabled={!canRemove(page)}
          onClick={() => onRemove(page)}
          className='flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tl-red)]/50 bg-transparent px-3 text-xs font-bold text-[var(--tl-red)] disabled:opacity-40'
          data-testid='tl-upload-lightbox-remove'
        >
          <Trash weight='bold' size={14} />
          {txa('Sayfayı sil')}
        </button>
        <button type='button' onClick={onClose} className='flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white' aria-label={txa('Kapat')}>
          <X weight='bold' size={16} />
        </button>
      </div>
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
    </div>
  )
}
