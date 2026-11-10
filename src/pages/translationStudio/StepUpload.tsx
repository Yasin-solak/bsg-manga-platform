import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, CheckCircle, MagnifyingGlassPlus, Plus, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { readZip } from '@/lib/zipReader'
import {
  createPages, deletePage, naturalCompare, TL_ACCEPTED_MIME, TL_MAX_PAGE_BYTES, uploadPageRaw, type TlPage,
} from '@/services/translationStudioService'
import { GhostButton, ProgressBar, StepHeading } from './studioUi'
import { useRawThumbnail } from './useRawThumbnail'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { confirmDialog } from '@/services/confirmService'
import { UploadLightbox } from './UploadLightbox'
import { txa } from '@/i18n/activeLocale'

type UploadState = 'sirada' | 'yukleniyor' | 'yuklendi' | 'hata'

interface LocalUpload {
  file: File
  preview: string
  state: UploadState
  error?: string
}

const MIME_BY_EXTENSION: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const CONCURRENCY = 3

async function expandFiles(input: File[]): Promise<{ files: File[], rejected: string[] }> {
  const files: File[] = []
  const rejected: string[] = []
  for (const file of input) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const entries = await readZip(await file.arrayBuffer(), {
        filter: (name) => !name.startsWith('__MACOSX/') && Boolean(MIME_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? '']),
      })
      for (const entry of entries) {
        const baseName = entry.name.split('/').pop() ?? entry.name
        const type = MIME_BY_EXTENSION[baseName.split('.').pop()?.toLowerCase() ?? '']
        files.push(new File([entry.data], baseName, { type }))
      }
      continue
    }
    if (!(TL_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
      rejected.push(txa('{v1}: desteklenmeyen tür', { v1: file.name }))
      continue
    }
    files.push(file)
  }
  const accepted = files.filter((file) => {
    if (file.size > TL_MAX_PAGE_BYTES) {
      rejected.push(txa('{v1}: 20 MB sınırını aşıyor', { v1: file.name }))
      return false
    }
    return true
  })
  return { files: accepted.sort((a, b) => naturalCompare(a.name, b.name)), rejected }
}

export function StepUpload({ projectId, crumb, pages, onPagesChange, onBusyChange }: {
  projectId: string
  crumb: string
  pages: TlPage[]
  onPagesChange: (updater: (pages: TlPage[]) => TlPage[]) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [uploads, setUploads] = useState<Record<string, LocalUpload>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queueRef = useRef<string[]>([])
  const activeRef = useRef(0)
  const uploadsRef = useRef(uploads)
  uploadsRef.current = uploads

  useEffect(() => () => {
    for (const upload of Object.values(uploadsRef.current)) URL.revokeObjectURL(upload.preview)
  }, [])

  const setUpload = useCallback((pageId: string, patch: Partial<LocalUpload>) => {
    setUploads((current) => (current[pageId] ? { ...current, [pageId]: { ...current[pageId], ...patch } } : current))
  }, [])

  const pump = useCallback(() => {
    while (activeRef.current < CONCURRENCY && queueRef.current.length) {
      const pageId = queueRef.current.shift() as string
      const upload = uploadsRef.current[pageId]
      if (!upload) continue
      activeRef.current += 1
      onBusyChange(true)
      setUpload(pageId, { state: 'yukleniyor', error: undefined })
      uploadPageRaw(pageId, upload.file)
        .then(({ width, height }) => {
          setUpload(pageId, { state: 'yuklendi' })
          onPagesChange((current) => current.map((page) => (page.id === pageId
            ? { ...page, rawStatus: 'ready', width, height, scanStage: 'uploaded' } : page)))
        })
        .catch((error: unknown) => setUpload(pageId, {
          state: 'hata', error: toUserFacingErrorMessage(error, txa('Yüklenemedi')),
        }))
        .finally(() => {
          activeRef.current -= 1
          if (!activeRef.current && !queueRef.current.length) onBusyChange(false)
          pump()
        })
    }
  }, [onBusyChange, onPagesChange, setUpload])

  const addFiles = useCallback(async (input: File[]) => {
    if (!input.length) return
    setNotice(null)
    try {
      const { files, rejected } = await expandFiles(input)
      if (rejected.length) setNotice(txa('{v1} dosya atlandı: {v2}', { v1: rejected.length, v2: `${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}` }))
      if (!files.length) return
      // Deleted pages can leave gaps in order; new pages are added after the largest position.
      const startIndex = pages.reduce((max, page) => Math.max(max, page.pageIndex + 1), 0)
      const created = await createPages(projectId, files.map((file) => file.name), startIndex)
      const next: Record<string, LocalUpload> = {}
      created.forEach((page, index) => {
        next[page.id] = { file: files[index], preview: URL.createObjectURL(files[index]), state: 'sirada' }
      })
      uploadsRef.current = { ...uploadsRef.current, ...next }
      setUploads(uploadsRef.current)
      onPagesChange((current) => [...current, ...created])
      queueRef.current.push(...created.map((page) => page.id))
      pump()
    } catch (error) {
      setNotice(toUserFacingErrorMessage(error, txa('Dosyalar eklenemedi.')))
    }
  }, [onPagesChange, pages, projectId, pump])

  const remove = async (pageId: string) => {
    try {
      await deletePage(pageId)
      queueRef.current = queueRef.current.filter((id) => id !== pageId)
      const preview = uploadsRef.current[pageId]?.preview
      if (preview) URL.revokeObjectURL(preview)
      setUploads((current) => {
        const next = { ...current }
        delete next[pageId]
        return next
      })
      onPagesChange((current) => current.filter((page) => page.id !== pageId))
    } catch (error) {
      setNotice(toUserFacingErrorMessage(error, txa('Sayfa kaldırılamadı.')))
    }
  }

  // A page being uploaded cannot be deleted (a half-finished upload would write the page back).
  const canRemove = (page: TlPage) => uploads[page.id]?.state !== 'yukleniyor'
  const confirmRemove = async (page: TlPage, position: number) => {
    const confirmed = await confirmDialog({
      title: txa('Sayfayı sil'),
      message: txa('Sayfa {v1} ({v2}) bu bölümden silinsin mi? Bu sayfadaki alanlar ve çeviriler de silinir.', { v1: String(position + 1).padStart(2, '0'), v2: page.fileName ?? 'dosya' }),
      confirmText: txa('Sil'),
      cancelText: txa('Vazgeç'),
      variant: 'danger',
    })
    if (!confirmed) return
    await remove(page.id)
    setViewing((current) => (current === null ? null : pages.length <= 1 ? null : Math.min(current, pages.length - 2)))
  }

  const retry = (pageId: string) => {
    queueRef.current.push(pageId)
    pump()
  }

  const readyCount = pages.filter((page) => page.rawStatus === 'ready').length
  const openPicker = () => inputRef.current?.click()

  return (
    <div
      className='tl-screen flex min-h-0 flex-1 flex-col gap-[22px] px-6 pb-5 pt-7 sm:px-10'
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)) }}
    >
      <StepHeading step={3} title={txa('Ham sayfaları yükle')} subtitle={txa('{v1} · sayfa sırası dosya adından alınır', { v1: crumb })} />
      <input
        ref={inputRef}
        type='file'
        multiple
        accept='image/png,image/jpeg,image/webp,.zip'
        className='hidden'
        onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }}
      />
      {notice && <span className='text-[12.5px] font-semibold text-[var(--tl-amber)]'>{notice}</span>}

      {pages.length === 0 ? (
        <button
          type='button'
          onClick={openPicker}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-3.5 rounded-2xl border-[1.5px] border-dashed bg-transparent text-[var(--tl-fg)] transition-colors',
            dragging ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)]' : 'border-[var(--tl-line2)] hover:border-[var(--tl-p35)] hover:bg-[var(--tl-p15)]',
          )}
          data-testid='tl-upload-drop'
        >
          <span className='flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--tl-p15)] text-[var(--tl-p)]'>
            <UploadSimple weight='bold' size={30} />
          </span>
          <span className='text-xl font-extrabold'>{txa('Sayfaları buraya sürükle')}</span>
          <span className='text-[13.5px] font-semibold text-[var(--tl-mut)]'>{txa('PNG, JPG, WEBP veya tek ZIP · sayfa başına en fazla 20 MB')}</span>
          <span className='mt-1.5 inline-flex h-10 items-center rounded-[10px] bg-[var(--tl-p)] px-5 text-[13px] font-extrabold text-[var(--tl-pfg)]'>{txa('Dosya seç')}</span>
        </button>
      ) : (
        <>
          <div className='flex items-center gap-3.5'>
            <span className='text-sm font-bold'>{readyCount} / {txa('{v1} sayfa', { v1: pages.length })}</span>
            <ProgressBar value={pages.length ? readyCount / pages.length : 0} className='max-w-[520px] flex-1' />
            <div className='flex-1' />
            <GhostButton onClick={openPicker} className='h-9 rounded-[9px] px-[13px] text-[12.5px]'>
              <Plus weight='bold' size={13} />
              {txa('Sayfa ekle')}
            </GhostButton>
          </div>
          <div className={cn(
            'grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-4 overflow-y-auto rounded-xl',
            dragging && 'outline outline-2 outline-dashed outline-[var(--tl-p35)]',
          )}
          >
            {pages.map((page, position) => (
              <UploadTile
                key={page.id}
                position={position}
                page={page}
                upload={uploads[page.id]}
                onRetry={() => retry(page.id)}
                onRemove={() => { void remove(page.id) }}
                onOpen={() => setViewing(position)}
                onDelete={canRemove(page) ? () => { void confirmRemove(page, position) } : undefined}
              />
            ))}
          </div>
        </>
      )}
      {viewing !== null && (
        <UploadLightbox
          pages={pages}
          index={viewing}
          localPreview={(pageId) => uploads[pageId]?.preview}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onRemove={(page) => { void confirmRemove(page, pages.indexOf(page)) }}
          canRemove={canRemove}
        />
      )}
    </div>
  )
}

function UploadTile({ position, page, upload, onRetry, onRemove, onOpen, onDelete }: {
  position: number
  page: TlPage
  upload?: LocalUpload
  onRetry: () => void
  onRemove: () => void
  onOpen: () => void
  onDelete?: () => void
}) {
  const remote = useRawThumbnail(upload ? null : page.rawStatus === 'ready' ? page.id : null)
  const preview = upload?.preview ?? remote
  const state: UploadState = upload?.state ?? (page.rawStatus === 'ready' ? 'yuklendi' : 'hata')
  const label = state === 'yuklendi' ? txa('Yüklendi') : state === 'yukleniyor' ? txa('Yükleniyor…') : state === 'sirada' ? txa('Sırada') : txa('Hata')
  const number = String(position + 1).padStart(2, '0')
  return (
    <div className={cn('flex flex-col gap-[7px] transition-opacity', state === 'sirada' && 'opacity-50')}>
      <div className='tl-hatch group relative box-border flex aspect-[2/3] items-end overflow-hidden rounded-lg border border-[var(--tl-line)] p-2'>
        {preview && (
          <button type='button' onClick={onOpen} className='absolute inset-0 cursor-zoom-in border-0 bg-transparent p-0' aria-label={txa('Sayfa {v1} büyüt', { v1: number })} data-testid='tl-upload-open'>
            <img src={preview} alt='' className='h-full w-full object-cover' />
            <span className='absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100'>
              <MagnifyingGlassPlus weight='bold' size={22} />
            </span>
          </button>
        )}
        {onDelete && state !== 'hata' && (
          <button
            type='button'
            onClick={onDelete}
            className='absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border-0 bg-black/70 text-[var(--tl-red)] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100'
            title={txa('Sayfayı sil')}
            aria-label={txa('Sayfa {v1} sil', { v1: number })}
            data-testid='tl-upload-delete'
          >
            <Trash weight='bold' size={14} />
          </button>
        )}
        <span className='pointer-events-none relative truncate font-mono text-[11px] text-[var(--tl-dim)] [text-shadow:0_1px_2px_#000]'>{page.fileName ?? `sayfa_${number}`}</span>
        {state === 'yuklendi' && <CheckCircle weight='fill' size={17} className='pointer-events-none absolute right-2 top-2 text-[var(--tl-green)]' />}
        {state === 'hata' && (
          <button
            type='button'
            onClick={upload ? onRetry : onRemove}
            title={upload?.error ?? txa('Dosyası yüklenmemiş sayfayı kaldır')}
            className='absolute inset-0 flex flex-col items-center justify-center gap-1.5 border-0 bg-black/70 text-[11.5px] font-bold text-[var(--tl-red)]'
          >
            <WarningCircle weight='fill' size={20} />
            {upload ? txa('Tekrar dene') : txa('Yüklenmedi · kaldır')}
            {upload && <ArrowClockwise weight='bold' size={13} />}
          </button>
        )}
      </div>
      <span className={cn(
        'flex justify-between text-[11.5px] font-semibold',
        state === 'yuklendi' ? 'text-[var(--tl-fg2)]' : state === 'hata' ? 'text-[var(--tl-red)]' : 'text-[var(--tl-p)]',
      )}
      >
        <span>{txa('Sayfa {v1}', { v1: number })}</span>
        <span>{label}</span>
      </span>
    </div>
  )
}
