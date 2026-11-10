import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Columns2, ZoomIn, ZoomOut } from 'lucide-react'
import {
  fetchAdminPageImage,
  getAdminChapterReview,
  type AdminChapterReview,
} from '@/services/translationAdminReviewService'
import { resolveChapterPageUrl } from '@/services/assetUrlService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AdminChapterTexts } from './AdminChapterTexts'
import { txa } from '@/i18n/activeLocale'

/*
 * Admin chapter review: side-by-side RAW | TRANSLATED pages for a studio-uploaded chapter,
 * page-by-page navigation and zoom, page texts and new language generation below.
 * Raw images are in private R2; /api/ceviri/admin-page gives them only to a site admin.
 * The translated side is the published (or pending) chapter's own page image.
 */

const ZOOMS = [1, 1.5, 2, 3]

function useAdminRawImage(pageId: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    setError(null)
    if (!pageId) return undefined
    const controller = new AbortController()
    let objectUrl: string | null = null
    fetchAdminPageImage(pageId, 'raw', controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toUserFacingErrorMessage(reason, txa('Ham sayfa yüklenemedi.')))
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pageId])
  return { url, error }
}

function Pane({ label, src, error, zoom }: { label: string, src: string | null, error?: string | null, zoom: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="h-[58vh] overflow-auto rounded-lg border border-border bg-black/80">
        {src ? (
          <img src={src} alt={label} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} className="mx-auto block" />
        ) : (
          <p className="m-0 p-6 text-center text-xs text-muted-foreground">{error ?? txa('Yükleniyor…')}</p>
        )}
      </div>
    </div>
  )
}

export function AdminChapterStudioReview({ chapterId, open, onOpenChange }: {
  chapterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [review, setReview] = useState<AdminChapterReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getAdminChapterReview(chapterId, signal)
      if (signal?.aborted) return
      setReview(data)
      setError(null)
    } catch (reason) {
      if (!signal?.aborted) setError(toUserFacingErrorMessage(reason, txa('Bölüm incelemesi okunamadı.')))
    }
  }, [chapterId])

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setIndex(0)
    void load(controller.signal)
    return () => controller.abort()
  }, [load, open])

  const pages = review?.pages ?? []
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))] ?? null
  const raw = useAdminRawImage(open && page?.raw_ready ? page.id : null)
  const publishedRef = review?.chapter.pages[page?.index ?? index]
  const translated = typeof publishedRef === 'string' ? resolveChapterPageUrl(publishedRef) || publishedRef : null
  const pageItems = review && page ? review.items.filter((item) => item.page_id === page.id) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-6xl" data-testid="admin-chapter-studio-review">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Columns2 className="size-4" aria-hidden="true" />
            {txa('Stüdyo incelemesi')}{review ? txa(' · {v1}. Bölüm', { v1: review.chapter.chapter_number }) : ''}
            {review?.project?.is_mature ? <Badge variant="destructive">+18</Badge> : null}
            {review && !review.chapter.is_approved ? <Badge variant="secondary">{txa('Onay bekliyor')}</Badge> : null}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          {error ? <p className="m-0 text-sm text-destructive">{error}</p> : null}
          {!error && !review ? <p className="m-0 text-sm text-muted-foreground">{txa('Yükleniyor…')}</p> : null}
          {review && !review.project ? (
            <p className="m-0 rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              {txa('Bu bölüm Çeviri Stüdyosu ile yüklenmemiş; ham sayfa ve metin kaydı yok.')}
            </p>
          ) : null}
          {review?.project && pages.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} aria-label={txa('Önceki sayfa')}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <span className="text-xs font-medium">{txa('Sayfa {v1} / {v2}', { v1: Math.min(index + 1, pages.length), v2: pages.length })}</span>
                <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={index >= pages.length - 1} onClick={() => setIndex((value) => Math.min(pages.length - 1, value + 1))} aria-label={txa('Sonraki sayfa')}>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
                <span className="mx-1 h-5 w-px bg-border" />
                <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={zoom === ZOOMS[0]} onClick={() => setZoom((value) => ZOOMS[Math.max(0, ZOOMS.indexOf(value) - 1)])} aria-label={txa('Küçült')}>
                  <ZoomOut className="size-4" aria-hidden="true" />
                </Button>
                <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
                <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom((value) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(value) + 1)])} aria-label={txa('Büyüt')}>
                  <ZoomIn className="size-4" aria-hidden="true" />
                </Button>
                {page?.file_name ? <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{page.file_name}</span> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Pane label={txa('Ham')} src={raw.url} error={page?.raw_ready ? raw.error : txa('Ham görsel yok.')} zoom={zoom} />
                <Pane label={txa('Çevrilmiş (yayın görseli)')} src={translated} error={txa('Bu sırada yayın görseli yok.')} zoom={zoom} />
              </div>
              <AdminChapterTexts
                chapterId={chapterId}
                items={pageItems}
                languages={review.languages}
                isMature={review.project.is_mature}
                onTranslated={() => { void load() }}
              />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Trigger button + dialog for Manga Control and Pending Approval. */
export function AdminChapterStudioReviewButton({ chapterId, className }: { chapterId: string, className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" size="sm" variant="outline" className={className ?? 'min-h-11'} onClick={() => setOpen(true)} data-testid="admin-chapter-studio-review-open">
        <Columns2 className="size-3.5" aria-hidden="true" />
        {txa('Ham + çeviri')}
      </Button>
      {open ? <AdminChapterStudioReview chapterId={chapterId} open={open} onOpenChange={setOpen} /> : null}
    </>
  )
}
