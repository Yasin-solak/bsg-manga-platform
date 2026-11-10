import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { BookOpen, ChevronLeft, ChevronRight, Layers3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { buildPublicMangaPath } from '@/lib/routes'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { cn } from '@/lib/utils'
import type { FansubMangaShelfItem } from './types'
import { txa } from '@/i18n/activeLocale'

const SHOWCASE_MANGA_PAGE_SIZE = 6

type FansubShowcaseMangaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubName: string
  mangas: FansubMangaShelfItem[]
}

function resolveMangaPageCount(totalCount: number) {
  return Math.max(1, Math.ceil(totalCount / SHOWCASE_MANGA_PAGE_SIZE))
}

export default function FansubShowcaseMangaDialog({
  open,
  onOpenChange,
  fansubName,
  mangas,
}: FansubShowcaseMangaDialogProps) {
  const [page, setPage] = useState(1)
  const totalPages = resolveMangaPageCount(mangas.length)

  useEffect(() => {
    if (!open) return
    setPage(1)
  }, [open, fansubName])

  const pageItems = useMemo(() => {
    const startIndex = (page - 1) * SHOWCASE_MANGA_PAGE_SIZE
    return mangas.slice(startIndex, startIndex + SHOWCASE_MANGA_PAGE_SIZE)
  }, [mangas, page])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex w-[min(920px,calc(100vw-1rem))] max-h-[calc(100vh-1rem)] min-h-[min(640px,calc(100vh-1rem))] max-w-none flex-col overflow-hidden rounded-[24px] border border-border/80 bg-background/98 p-0 text-foreground shadow-[0_36px_120px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:w-[min(920px,calc(100vw-2rem))] sm:min-h-[min(720px,calc(100vh-2rem))]'>
        <div className='border-b border-border/70 px-6 py-5'>
          <div className='inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80'>
            <Layers3 className='size-3.5' />
            {txa('Manga vitrini')}
          </div>
          <DialogTitle className='mt-3 text-2xl font-semibold tracking-tight text-foreground'>
            {txa('{v1} mangalari', { v1: fansubName })}
          </DialogTitle>
        </div>

        <div className='min-h-[520px] flex-1 px-6 py-5'>
          {pageItems.length > 0 ? (
            <div className='grid min-h-full auto-rows-fr grid-cols-1 gap-4 content-start sm:grid-cols-2 lg:grid-cols-3'>
              {pageItems.map((manga) => {
                const coverUrl = optimizePublicImageUrl(manga.coverImage) || manga.coverImage
                const chapterCount = Math.max(
                  Number(manga.approvedChapterCount || 0) + Number(manga.pendingChapterCount || 0),
                  0,
                )

                return (
                  <Link
                    key={manga.id}
                    to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
                    onClick={() => onOpenChange(false)}
                    className='group flex min-h-[228px] flex-col overflow-hidden rounded-[18px] border border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card'
                  >
                    <div className='relative aspect-[4/5] overflow-hidden bg-muted/20'>
                      <img
                        loading='lazy'
                        decoding='async'
                        src={coverUrl}
                        alt={manga.title}
                        className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]'
                      />
                      <div className='absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/25 to-transparent' aria-hidden />
                    </div>

                    <div className='flex flex-1 flex-col gap-2 p-4'>
                      <h3 className='line-clamp-2 text-sm font-semibold leading-5 text-foreground'>
                        {manga.title}
                      </h3>
                      <div className='mt-auto flex items-center gap-2 text-xs text-muted-foreground'>
                        <BookOpen className='size-3.5' />
                        <span className={cn(chapterCount === 0 && 'text-muted-foreground/75')}>
                          {txa('{v1} bolum', { v1: chapterCount })}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className='rounded-[18px] border border-dashed border-border/80 bg-card/40 px-5 py-10 text-center text-sm text-muted-foreground'>
              {txa('Bu vitrinde gösterilecek manga bulunamadı.')}
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <div className='flex items-center justify-between border-t border-border/70 px-6 py-4'>
            <p className='text-xs text-muted-foreground'>
              {txa('Sayfa {v1} / {v2}', { v1: page, v2: totalPages })}
            </p>
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9 rounded-full px-3'
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className='size-4' />
                {txa('Önceki')}
              </Button>
              <Button
                type='button'
                size='sm'
                className='h-9 rounded-full px-3'
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                {txa('Sonraki')}
                <ChevronRight className='size-4' />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
