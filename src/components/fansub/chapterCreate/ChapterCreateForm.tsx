/**
 * ChapterCreateForm: presentation layer of the chapter add form.
 *
 * Takes state/actions from the useChapterCreateForm hook. The same body is used in both
 * the full page and the in-studio modal.
 */
import { Link } from '@/i18n/router'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Eye,
  FilePlus,
  GripVertical,
  Image as ImageIcon,
  Info,
  Loader2,
  ScrollText,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { humanFileSize } from '@/utils/imageProcessingUtils'
import { suppressAuthFocusSyncForNativeFileDialog } from '@/lib/nativeFileDialogFocus'
import ReaderPreviewModal from './ReaderPreviewModal'
import {
  CHAPTER_NOTES_MAX_LENGTH,
  MAX_WIDTH_OPTIONS,
  SLICE_HEIGHT_OPTIONS,
  type ChapterCreateFormApi,
} from './useChapterCreateForm'
import { intlLocale, txa } from '@/i18n/activeLocale'

function SectionHeader({ icon: Icon, title, trailing }: { icon: typeof FilePlus; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="flex-1 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {trailing}
    </div>
  )
}

interface ChapterCreateFormProps {
  form: ChapterCreateFormApi
  variant?: 'page' | 'modal'
  cancelHref?: string
  onCancel?: () => void
}

export default function ChapterCreateForm({ form, variant = 'page', cancelHref, onCancel }: ChapterCreateFormProps) {
  const {
    pageInputRef,
    mangas,
    mangaId,
    setMangaId,
    chapterNumber,
    setChapterNumber,
    chapterTitle,
    setChapterTitle,
    publishAt,
    setPublishAt,
    notes,
    setNotes,
    pagePreviews,
    dragOverIndex,
    dragStartIndex,
    isPageDragOver,
    showReaderPreview,
    setShowReaderPreview,
    sliceHeight,
    setSliceHeight,
    maxWidth,
    setMaxWidth,
    processing,
    processedFiles,
    validatingPages,
    pageProcessingError,
    loading,
    originalSize,
    processedSize,
    handlePageFilesChange,
    handleUploadDragOver,
    handleUploadDragLeave,
    handleUploadDrop,
    removePage,
    clearAllPages,
    handlePageDragStart,
    handlePageDragEnd,
    handlePageDragOver,
    handlePageDragLeave,
    handlePageDrop,
    num,
    isValidNum,
    selectedManga,
    displayPreviews,
    isValid,
    submit,
  } = form

  const pageFilesCount = pagePreviews.length

  // The window blurs/focuses when the native file picker opens; unless we suppress the session
  // sync on focus return, the studio remounts and it feels like "the page reloaded".
  const openPagePicker = () => {
    suppressAuthFocusSyncForNativeFileDialog()
    pageInputRef.current?.click()
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start gap-6',
        variant === 'page' ? 'lg:grid-cols-[1fr_340px]' : 'xl:grid-cols-[1fr_320px]',
      )}
    >
      <main className="min-w-0 space-y-6">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {/* ─── 1. Temel Bilgiler ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={ScrollText} title={txa('Temel Bilgiler')} />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ca-manga">
                  Manga <span className="text-destructive">*</span>
                </Label>
                <select
                  id="ca-manga"
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  value={mangaId}
                  onChange={(e) => setMangaId(e.target.value)}
                  required
                >
                  <option value="">{txa('- Manga secin -')}</option>
                  {mangas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                {mangas.length === 0 && (
                  <span className="block text-xs text-muted-foreground">{txa('Secilebilir manga bulunamadi. Once manga ekleyin.')}</span>
                )}
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ca-num">
                    {txa('Bolum numarasi')}{' '}<span className="text-destructive">*</span>
                  </Label>
                  <Input id="ca-num" type="number" placeholder={txa('Orn. 156')} min={1} value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ca-publish-at">{txa('Yayin tarihi')}</Label>
                  <Input id="ca-publish-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ca-title">{txa('Bolum basligi')}</Label>
                <Input id="ca-title" type="text" placeholder={txa('Orn. Son Savas')} value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} maxLength={120} />
                <span className="block text-xs text-muted-foreground">{chapterTitle.length}/120</span>
              </div>
            </div>
          </section>

          {/* ─── 2. Sayfalar ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={ImageIcon} title={txa('Sayfalar')} />

            <input
              ref={pageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="absolute h-0 w-0 opacity-0 pointer-events-none"
              onChange={handlePageFilesChange}
              aria-label={txa('Sayfa yukle')}
              disabled={!mangaId || validatingPages || processing}
            />

            {pageFilesCount === 0 ? (
              <div
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground transition-all',
                  isPageDragOver ? 'scale-[1.01] border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                )}
                onClick={() => mangaId && openPagePicker()}
                onDragOver={handleUploadDragOver}
                onDragLeave={handleUploadDragLeave}
                onDrop={handleUploadDrop}
              >
                <Upload className="h-10 w-10 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">{txa('Sayfa gorsellerini yukleyin')}</p>
                  <p className="text-xs">{txa('JPG, PNG, WebP. Sayfalar otomatik birlestirilir, sikistirilir ve dilimlenir.')}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={!mangaId || validatingPages} className="gap-1.5">
                  {validatingPages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {validatingPages ? txa('Dogrulaniyor...') : txa('Dosya Sec')}
                </Button>
                {!mangaId && <p className="text-[11px] text-muted-foreground">{txa('Once yukaridan bir manga secin.')}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Birlestirme ayarlari */}
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">{txa('Dilim yuksekligi')}</Label>
                    <select
                      className="flex h-7 w-36 rounded border border-input bg-transparent px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      value={sliceHeight}
                      onChange={(e) => setSliceHeight(Number(e.target.value))}
                    >
                      {SLICE_HEIGHT_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">{txa('Max genislik')}</Label>
                    <select
                      className="flex h-7 w-36 rounded border border-input bg-transparent px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      value={maxWidth}
                      onChange={(e) => setMaxWidth(Number(e.target.value))}
                    >
                      {MAX_WIDTH_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Durum gostergesi */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{txa('{v1} sayfa yuklu', { v1: pageFilesCount })}</span>
                    <span>{txa('Orijinal:')}{' '}{humanFileSize(originalSize)}</span>
                    {validatingPages && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {txa('Dogrulaniyor...')}
                      </Badge>
                    )}
                    {processing && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {txa('Isleniyor...')}
                      </Badge>
                    )}
                    {!processing && processedFiles && (
                      <Badge variant="secondary" className="gap-1 text-xs text-chart-2">
                        <CheckCircle2 className="h-3 w-3" />
                        {humanFileSize(processedSize)}
                        {originalSize > 0 && txa(' ({v1}% kazanim)', { v1: Math.round((1 - processedSize / originalSize) * 100) })}
                      </Badge>
                    )}
                    {!processing && processedFiles && (
                      <Badge variant="outline" className="text-xs">
                        {processedFiles.length}{' '}{txa('dilim')}
                      </Badge>
                    )}
                    {pageProcessingError && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <AlertCircle className="h-3 w-3" />
                        {txa('Isleme hatasi')}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{txa('Surukle-birak ile sirala')}</span>
                </div>

                {pageProcessingError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{pageProcessingError}</span>
                  </div>
                )}

                {/* Sayfa grid */}
                <div className="max-h-[400px] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-muted/20 p-2">
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {pagePreviews.map((src, i) => (
                      <div
                        key={`${src}-${i}`}
                        className={cn(
                          'group relative aspect-[3/4] cursor-grab overflow-hidden rounded-lg border-2 border-border bg-muted/30 transition-all active:cursor-grabbing',
                          dragOverIndex === i && 'border-primary ring-2 ring-primary/30',
                          dragStartIndex === i && 'scale-95 opacity-40',
                        )}
                        draggable
                        onDragStart={(e) => handlePageDragStart(e, i)}
                        onDragEnd={handlePageDragEnd}
                        onDragOver={(e) => handlePageDragOver(e, i)}
                        onDragLeave={handlePageDragLeave}
                        onDrop={(e) => handlePageDrop(e, i)}
                      >
                        <span className="absolute left-1 top-1 z-[2] flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <GripVertical className="h-3 w-3" />
                        </span>
                        <img src={src} alt={txa('Sayfa {v1}', { v1: i + 1 })} className="h-full w-full cursor-pointer object-cover" draggable={false} onClick={() => setShowReaderPreview(true)} />
                        <button
                          type="button"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePage(i)
                          }}
                          aria-label={txa('Sayfa {v1} kaldir', { v1: i + 1 })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kontrol butonlari */}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={openPagePicker} disabled={validatingPages || processing}>
                    {validatingPages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {validatingPages ? txa('Dogrulaniyor...') : txa('Daha fazla ekle')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={clearAllPages}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {txa('Tumunu kaldir')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ─── 3. Notlar ─── */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <SectionHeader icon={ScrollText} title={txa('Notlar')} />
            <div className="space-y-2">
              <Textarea
                id="ca-notes"
                placeholder={txa('Ceviri notlari, ozel uyari vb. (istege bagli)')}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, CHAPTER_NOTES_MAX_LENGTH))}
                rows={3}
                maxLength={CHAPTER_NOTES_MAX_LENGTH}
                className="min-h-20 resize-y"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{txa('Bu not reader icinde bolum karti olarak gosterilir.')}</span>
                <span>
                  {notes.length}/{CHAPTER_NOTES_MAX_LENGTH}
                </span>
              </div>
            </div>
          </section>

          {/* ─── Submit ─── */}
          <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-3 border-t border-border bg-background/85 px-1 py-3 backdrop-blur">
            {cancelHref ? (
              <Button asChild variant="outline">
                <Link to={cancelHref}>{txa('Iptal')}</Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onCancel}>
                {txa('Iptal')}
              </Button>
            )}
            <Button type="submit" disabled={!isValid} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
              {txa('Bolum Ekle')}
            </Button>
          </div>
        </form>
      </main>

      {/* ─── Onizleme paneli ─── */}
      <aside className="min-w-0 max-lg:static">
        <div className={cn('flex flex-col gap-4', variant === 'page' ? 'lg:sticky lg:top-6' : 'xl:sticky xl:top-2')}>
          {/* Bolum bilgileri */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{txa('Bolum Onizlemesi')}</h3>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-base font-semibold text-foreground">
                {txa('{v1} Bolum', { v1: isValidNum ? `${num}.` : '--.' })}
                {chapterTitle.trim() && <span className="font-normal text-muted-foreground"> - {chapterTitle}</span>}
              </p>
              {selectedManga && <p className="mt-1 text-sm text-muted-foreground">{selectedManga.title}</p>}
              {publishAt && <p className="mt-1 text-xs text-muted-foreground">{txa('Yayin:')}{' '}{new Date(publishAt).toLocaleString(intlLocale())}</p>}
              {notes.trim() && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{txa('Not:')}{' '}{notes.trim()}</p>}
            </div>
          </section>

          {/* Sayfa onizleme */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h3 className="flex-1 text-sm font-semibold text-foreground">
                {displayPreviews.length > 0 ? txa('Sonuc Onizleme ({v1})', { v1: displayPreviews.length }) : txa('Sayfa Onizleme')}
              </h3>
              {processing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {!processing && processedFiles && (
                <Badge variant="secondary" className="gap-0.5 text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5" />{' '}{txa('hazir')}
                </Badge>
              )}
            </div>

            {displayPreviews.length > 0 && !processing && (
              <Button type="button" variant="default" size="sm" className="mb-3 w-full gap-1.5" onClick={() => setShowReaderPreview(true)}>
                <BookOpen className="h-3.5 w-3.5" />
                {txa('Reader ile On Izle')}
              </Button>
            )}

            <div className="flex max-h-[400px] flex-col gap-1 overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-muted/20 p-1">
              {displayPreviews.length > 0 ? (
                displayPreviews.map((src, i) => (
                  <div key={`preview-${i}`} className="relative flex-shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                    <img src={src} alt="" className="w-full object-contain" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{i + 1}</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-30" />
                  <p className="text-xs">{txa('Henuz sayfa yuklenmedi.')}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>

      {showReaderPreview && displayPreviews.length > 0 && (
        <ReaderPreviewModal
          pages={displayPreviews}
          chapterLabel={isValidNum ? `${txa('Bolum {v1}', { v1: num ?? '' })}${chapterTitle.trim() ? ` - ${chapterTitle}` : ''}` : txa('On Izleme')}
          mangaTitle={selectedManga?.title || ''}
          onClose={() => setShowReaderPreview(false)}
        />
      )}
    </div>
  )
}
