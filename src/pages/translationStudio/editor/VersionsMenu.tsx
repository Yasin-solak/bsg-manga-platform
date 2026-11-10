import { useCallback, useEffect, useRef, useState } from 'react'
import { ClockCounterClockwise, Robot, Trash, UserCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  deletePageVersion, getPageVersion, listPageVersions, savePageVersion,
  type TlItem, type TlPageVersion, type TlStroke,
} from '@/services/translationEditorService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Page version history: manual "Save version" and an automatic version when a task completes.
 * Restoring uses the editor's snapshot mechanism (undoable with Ctrl+Z).
 */

function timeLabel(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString(intlLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function VersionsMenu({ pageId, language, canSave, canDelete, onFlush, onRestore, onToast }: {
  pageId: string
  language: string
  canSave: boolean
  canDelete: boolean
  onFlush: () => Promise<void>
  onRestore: (snapshot: { items: TlItem[], strokes: TlStroke[] }) => Promise<void>
  onToast: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<TlPageVersion[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setVersions(await listPageVersions(pageId))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Sürümler yüklenemedi.')))
    }
  }, [onToast, pageId])

  useEffect(() => { if (open) void load() }, [load, open])
  useEffect(() => { setOpen(false) }, [pageId])
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const save = async () => {
    setBusy(true)
    try {
      // Surum DB'deki halden alinir: once bekleyen yazimlar bosaltilir.
      await onFlush()
      await savePageVersion(pageId, label.trim() || txa('Elle kaydedildi'))
      setLabel('')
      onToast(txa('Sürüm kaydedildi'))
      await load()
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Sürüm kaydedilemedi.')))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (version: TlPageVersion) => {
    setBusy(true)
    try {
      await onFlush()
      const snapshot = await getPageVersion(version.id, language)
      await onRestore(snapshot)
      onToast(txa('"{v1}" geri yüklendi · Ctrl+Z ile geri alabilirsin', { v1: version.label }))
      setOpen(false)
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Sürüm geri yüklenemedi.')))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (version: TlPageVersion) => {
    try {
      await deletePageVersion(version.id)
      setVersions((current) => current.filter((entry) => entry.id !== version.id))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Sürüm silinemedi.')))
    }
  }

  return (
    <div ref={rootRef} className='relative flex-none'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={txa('Sürüm geçmişi')}
        className={cn('flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold', open ? 'border-[var(--tl-p35)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] text-[var(--tl-fg2)]')}
        data-testid='tl-versions'
      >
        <ClockCounterClockwise weight='bold' size={14} />
        {txa('Sürümler')}
      </button>
      {open && (
        <div className='absolute right-0 top-10 z-30 flex w-[340px] flex-col gap-2 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-3 shadow-xl' data-testid='tl-versions-panel'>
          {canSave && (
            <form className='flex gap-1.5' onSubmit={(event) => { event.preventDefault(); void save() }}>
              <input
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={txa('Not (isteğe bağlı): ör. "dizgi öncesi"')}
                className='h-8 min-w-0 flex-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-2.5 text-xs text-[var(--tl-fg)] outline-none focus:border-[var(--tl-p35)]'
              />
              <button type='submit' disabled={busy} className='h-8 rounded-lg border-0 bg-[var(--tl-p)] px-3 text-xs font-extrabold text-[var(--tl-pfg)] disabled:opacity-45' data-testid='tl-version-save'>
                {txa('Şimdi kaydet')}
              </button>
            </form>
          )}
          <div className='flex max-h-[320px] flex-col gap-1 overflow-y-auto'>
            {versions.length === 0 && <span className='py-3 text-center text-xs text-[var(--tl-mut)]'>{txa('Bu sayfanın kayıtlı sürümü yok.')}</span>}
            {versions.map((version) => (
              <div key={version.id} className='group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--tl-acc2)]' data-testid='tl-version-row'>
                {version.kind === 'auto'
                  ? <Robot weight='bold' size={14} className='flex-none text-[var(--tl-mut)]' aria-label={txa('Otomatik')} />
                  : <UserCircle weight='bold' size={14} className='flex-none text-[var(--tl-mut)]' aria-label={txa('Elle')} />}
                <span className='flex min-w-0 flex-1 flex-col'>
                  <span className='truncate text-[12.5px] font-bold text-[var(--tl-fg)]'>{version.label}</span>
                  <span className='text-[11px] text-[var(--tl-mut)]'>{txa('{v1} · {v2} · {v3} öğe', { v1: timeLabel(version.createdAt), v2: version.createdBy ?? 'sistem', v3: version.itemCount })}</span>
                </span>
                <button type='button' disabled={busy} onClick={() => { void restore(version) }} className='h-7 rounded-md border border-[var(--tl-line)] bg-transparent px-2 text-[11px] font-bold text-[var(--tl-fg2)] disabled:opacity-45' data-testid='tl-version-restore'>
                  {txa('Geri yükle')}
                </button>
                {canDelete && (
                  <button type='button' onClick={() => { void remove(version) }} className='flex h-7 w-7 items-center justify-center rounded-md text-[var(--tl-mut)] opacity-0 hover:text-[var(--tl-red)] focus-visible:opacity-100 group-hover:opacity-100' aria-label={txa('{v1} sürümünü sil', { v1: version.label })}>
                    <Trash weight='bold' size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
