/**
 * FansubChapterEditModal v2: chapter edit window.
 *
 * Left: title, adding pages (drag-and-drop or choose) and change summary.
 * Right: page grid; cards reorder by drag-and-drop, arrow / remove
 * buttons also work by keyboard, a click opens a large preview. The "Reader"
 * view shows pages stacked as in the reader.
 */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  CaretRight,
  Info,
  Rows,
  SquaresFour,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export interface FansubChapterEditModalPageItem {
  id: string
  source: 'existing' | 'new'
  previewUrl: string
}

interface FansubChapterEditModalProps {
  isOpen: boolean
  chapterTitleDraft: string
  chapterEditLoading: boolean
  chapterEditError: string | null
  chapterExistingPageCount: number
  chapterNewPageCount: number
  chapterPageItems: FansubChapterEditModalPageItem[]
  chapterResultPageCount: number
  chapterSaving: boolean
  onTitleChange: (value: string) => void
  onMovePage: (pageId: string, direction: 'up' | 'down') => void
  onSelectNewPages: (event: ChangeEvent<HTMLInputElement>) => void
  onRemovePage: (pageId: string) => void
  onClose: () => void
  onSave: () => void
  /** Ust baslik (orn. "Gece Yolcusu · Bolum 12"). */
  chapterLabel?: string
  /** Published chapter: the change goes to approval as a revision. */
  isLive?: boolean
  /** Initial page count (to show how many were removed). */
  originalPageCount?: number
  /** Moves to a target position by drag-and-drop. If not given, only arrows work. */
  onReorderPage?: (pageId: string, targetIndex: number) => void
  /** Pencereye birakilan dosyalar. */
  onAddFiles?: (files: File[]) => void
}

function FansubChapterEditModal({
  isOpen,
  chapterTitleDraft,
  chapterEditLoading,
  chapterEditError,
  chapterExistingPageCount,
  chapterNewPageCount,
  chapterPageItems,
  chapterResultPageCount,
  chapterSaving,
  onTitleChange,
  onMovePage,
  onSelectNewPages,
  onRemovePage,
  onClose,
  onSave,
  chapterLabel,
  isLive = false,
  originalPageCount,
  onReorderPage,
  onAddFiles,
}: FansubChapterEditModalProps) {
  const [view, setView] = useState<'grid' | 'reader'>('grid')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [fileDragging, setFileDragging] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) { setLightbox(null); setView('grid') }
  }, [isOpen])

  useEffect(() => {
    if (lightbox == null) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setLightbox((index) => (index == null ? index : Math.min(chapterPageItems.length - 1, index + 1)))
      if (event.key === 'ArrowLeft') setLightbox((index) => (index == null ? index : Math.max(0, index - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, chapterPageItems.length])

  const removedCount = originalPageCount != null ? Math.max(0, originalPageCount - chapterExistingPageCount) : null
  const ready = !chapterEditLoading && !chapterEditError
  const busy = chapterSaving

  const handleFileDrop = (event: DragEvent<HTMLElement>) => {
    if (!onAddFiles || !event.dataTransfer.files.length) return
    event.preventDefault()
    setFileDragging(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length) onAddFiles(files)
  }

  const handleCardDrop = (index: number) => {
    if (dragId && onReorderPage) onReorderPage(dragId, index)
    setDragId(null)
    setDropIndex(null)
  }

  const isFileDrag = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="flex max-h-[min(calc(100dvh-1rem),860px)] w-[min(1080px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onDragOver={(event) => { if (onAddFiles && isFileDrag(event)) { event.preventDefault(); setFileDragging(true) } }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setFileDragging(false) }}
        onDrop={handleFileDrop}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-lg">{chapterLabel ? txa('{v1} · düzenle', { v1: chapterLabel }) : txa('Bölümü düzenle')}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {isLive
              ? txa('Bölüm yayında: değişiklikler onaya gider, onaylanana kadar okurlar mevcut sürümü görür.')
              : txa('Sayfaları ekle, sırala ya da kaldır; kaydedince bölüm onaya gider.')}
          </DialogDescription>
        </DialogHeader>

        {!ready ? (
          <div className="flex min-h-[260px] flex-1 items-center justify-center px-5 text-[13px] text-muted-foreground">
            {chapterEditLoading ? txa('Bölüm yükleniyor…') : chapterEditError}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[270px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-4 overflow-y-auto border-b border-border/60 p-5 md:border-b-0 md:border-r">
              <div className="space-y-1.5">
                <Label htmlFor="chapter-title">{txa('Bölüm başlığı')}</Label>
                <Input id="chapter-title" type="text" maxLength={140} value={chapterTitleDraft} disabled={busy} onChange={(event) => onTitleChange(event.target.value)} placeholder={txa('İsteğe bağlı')} />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60',
                  fileDragging ? 'border-primary bg-primary/5' : 'border-border/80 hover:border-primary/50',
                )}
              >
                <UploadSimple size={22} className="text-muted-foreground" />
                <span className="text-[13px] font-bold">{txa('Sayfa ekle')}</span>
                <span className="text-[11.5px] text-muted-foreground">{txa('{v1}; sona eklenir.', { v1: onAddFiles ? txa('Görselleri buraya sürükle ya da seç') : txa('Görselleri seç') })}</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onSelectNewPages} disabled={busy} />

              <dl className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Mevcut')}</dt><dd className="text-[16px] font-black tabular-nums">{chapterExistingPageCount}</dd></div>
                <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Yeni')}</dt><dd className="text-[16px] font-black tabular-nums text-amber-500">+{chapterNewPageCount}</dd></div>
                {removedCount != null ? <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Kaldırılan')}</dt><dd className="text-[16px] font-black tabular-nums text-rose-500">−{removedCount}</dd></div> : null}
                <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Kayıttan sonra')}</dt><dd className="text-[16px] font-black tabular-nums">{chapterResultPageCount}</dd></div>
              </dl>

              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <Info size={14} weight="fill" className="mt-0.5 flex-none" />
                {txa('Kartları sürükleyerek sıralayabilir, bir sayfaya tıklayarak büyük görebilirsin. En az bir sayfa kalmalı.')}
              </p>
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-2.5">
                <span className="text-[12.5px] font-semibold">{txa('{v1} sayfa', { v1: chapterPageItems.length })}</span>
                <div className="flex rounded-full border border-border/70 p-0.5">
                  {([['grid', SquaresFour, 'Izgara'], ['reader', Rows, 'Okuyucu']] as const).map(([mode, IconCmp, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={view === mode}
                      onClick={() => setView(mode)}
                      className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', view === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <IconCmp size={13} />{label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {chapterPageItems.length === 0 ? (
                  <p className="py-16 text-center text-[13px] text-muted-foreground">{txa('Sayfa yok. Soldan görsel ekle.')}</p>
                ) : view === 'reader' ? (
                  <div className="mx-auto flex max-w-[520px] flex-col bg-black/80">
                    {chapterPageItems.map((page, index) => (
                      <img key={page.id} src={page.previewUrl} alt={txa('Sayfa {v1}', { v1: index + 1 })} loading="lazy" className="block w-full" />
                    ))}
                  </div>
                ) : (
                  <ol className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))' }}>
                    {chapterPageItems.map((page, index) => (
                      <li
                        key={page.id}
                        draggable={Boolean(onReorderPage) && !busy}
                        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDragId(page.id) }}
                        onDragEnd={() => { setDragId(null); setDropIndex(null) }}
                        onDragOver={(event) => { if (dragId) { event.preventDefault(); setDropIndex(index) } }}
                        onDrop={(event) => { if (dragId) { event.preventDefault(); event.stopPropagation(); handleCardDrop(index) } }}
                        className={cn(
                          'group relative overflow-hidden rounded-xl border bg-muted/30 transition-all',
                          page.source === 'new' ? 'border-amber-500/50' : 'border-border/70',
                          dragId === page.id && 'opacity-40',
                          dropIndex === index && dragId && dragId !== page.id && 'ring-2 ring-primary',
                          onReorderPage && !busy && 'cursor-grab active:cursor-grabbing',
                        )}
                      >
                        <button type="button" className="block w-full" onClick={() => setLightbox(index)} aria-label={txa('Sayfa {v1} büyük önizleme', { v1: index + 1 })}>
                          <img src={page.previewUrl} alt="" loading="lazy" className="block aspect-[2/3] w-full object-cover" draggable={false} />
                        </button>
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">{index + 1}</span>
                        {page.source === 'new' ? <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-black">{txa('Yeni')}</span> : null}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <span className="flex gap-1">
                            <button type="button" disabled={busy || index === 0} onClick={() => onMovePage(page.id, 'up')} className="flex size-7 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25 disabled:opacity-40" aria-label={txa('Sayfa {v1} öne al', { v1: index + 1 })}>
                              <ArrowLeft size={13} weight="bold" />
                            </button>
                            <button type="button" disabled={busy || index === chapterPageItems.length - 1} onClick={() => onMovePage(page.id, 'down')} className="flex size-7 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25 disabled:opacity-40" aria-label={txa('Sayfa {v1} arkaya al', { v1: index + 1 })}>
                              <ArrowRight size={13} weight="bold" />
                            </button>
                          </span>
                          <button type="button" disabled={busy} onClick={() => onRemovePage(page.id)} className="flex size-7 items-center justify-center rounded-md bg-rose-500/80 text-white hover:bg-rose-500 disabled:opacity-40" aria-label={txa('Sayfa {v1} kaldır', { v1: index + 1 })}>
                            <Trash size={13} weight="bold" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{txa('İptal')}</Button>
          <Button type="button" onClick={onSave} disabled={busy || !ready || chapterResultPageCount === 0}>
            {busy ? txa('Kaydediliyor…') : txa('Kaydet ve onaya gönder')}
          </Button>
        </div>

        {lightbox != null && chapterPageItems[lightbox] ? (
          <div className="absolute inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-label={txa('Sayfa önizleme')}>
            <div className="flex items-center justify-between px-4 py-2 text-[13px] font-semibold text-white">
              <span className="tabular-nums">{txa('Sayfa')}{' '}{lightbox + 1} / {chapterPageItems.length}</span>
              <button type="button" onClick={() => setLightbox(null)} className="flex size-8 items-center justify-center rounded-full hover:bg-white/15" aria-label={txa('Önizlemeyi kapat')}><X size={16} /></button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-4">
              <img src={chapterPageItems[lightbox].previewUrl} alt="" className="max-h-full max-w-full object-contain" />
              <button type="button" disabled={lightbox === 0} onClick={() => setLightbox(lightbox - 1)} className="absolute left-2 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" aria-label={txa('Önceki sayfa')}><CaretLeft size={18} /></button>
              <button type="button" disabled={lightbox === chapterPageItems.length - 1} onClick={() => setLightbox(lightbox + 1)} className="absolute right-2 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" aria-label={txa('Sonraki sayfa')}><CaretRight size={18} /></button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default FansubChapterEditModal
