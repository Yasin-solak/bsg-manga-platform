import { Link } from '@/i18n/router'
import { BookOpen, ChevronRight, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildPublicMangaPath } from '@/lib/routes'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { useState } from 'react'
import ProfileShelfDialog from '../profile/ProfileShelfDialog'
import type { FansubMangaShelfItem } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

const FANSUB_MANGA_VISIBLE_COUNT = 3

type FansubMangaShelfProps = {
  loading: boolean
  mangas: FansubMangaShelfItem[]
  canSeePending: boolean
}

export default function FansubMangaShelf({
  loading,
  mangas,
  canSeePending,
}: FansubMangaShelfProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const visibleMangas = mangas.slice(0, FANSUB_MANGA_VISIBLE_COUNT)

  return (
    <>
      <Card className="rounded-[30px] border-border/70 bg-background/80 shadow-none">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txa('Manga vitrini')}</p>
              <h2 className="text-2xl font-semibold text-foreground">{txa('Seriler')}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {txa('Fansubun vitrinde tuttuğu ilk üç seri. Derin liste pencerede açılır.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-border/70 bg-background/60 text-foreground">
                {mangas.length.toLocaleString(intlLocale())}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs font-medium text-primary"
                onClick={() => setDialogOpen(true)}
              >
                {txa('Tümünü gör')}
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: FANSUB_MANGA_VISIBLE_COUNT }).map((_, index) => (
                  <div key={index} className="overflow-hidden rounded-[24px] border border-border/60 bg-card/55">
                    <div className="aspect-[3/4] bg-muted/70" />
                    <div className="space-y-3 p-3">
                      <div className="h-4 rounded-full bg-muted/70" />
                      <div className="h-3 w-2/3 rounded-full bg-muted/60" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleMangas.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {visibleMangas.map((manga) => (
                  <Link
                    key={manga.id}
                    to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
                    className="group overflow-hidden rounded-[24px] border border-border/60 bg-card/60 transition-colors hover:border-primary/30 hover:bg-card"
                  >
                    <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--card))_68%,hsl(var(--muted)/0.78)_100%)] p-3">
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,transparent_0%,transparent_42%,hsl(var(--foreground)/0.03)_42%,transparent_74%,hsl(var(--foreground)/0.025)_74%,transparent_100%)]" aria-hidden />
                      <div className="relative flex items-start justify-between gap-2">
                        <Badge
                          variant="outline"
                          className="border-border/70 bg-background/70 text-[10px] uppercase tracking-[0.14em] text-foreground"
                        >
                          {txa('{v1} bolum', { v1: manga.approvedChapterCount.toLocaleString(intlLocale()) })}
                        </Badge>
                        {canSeePending && (manga.isPendingOwned || manga.pendingChapterCount > 0) ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/35 bg-amber-500/12 text-[10px] uppercase tracking-[0.14em] text-amber-600"
                          >
                            {txa('Bekliyor')}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="relative mt-8 flex aspect-[3/4] items-end overflow-hidden rounded-[18px] border border-border/60 bg-background/55 p-3">
                        <div className="max-w-[11ch]">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Seri vitrini')}</p>
                          <p className="mt-2 line-clamp-4 text-sm font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
                            {manga.title}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3">
                      <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {manga.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3.5" />
                          {manga.lastChapter || txa('Yeni seri')}
                        </span>
                        {manga.pendingChapterCount > 0 && canSeePending ? (
                          <span>{txa('{`${v1} bekleyen`}', { v1: manga.pendingChapterCount })}</span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-border/70 bg-card/50 px-6 py-12 text-center">
                <BookOpen className="size-5 text-muted-foreground" />
                <p className="m-0 text-sm leading-6 text-muted-foreground">
                  {txa('Henüz bu fansub tarafından vitrine çıkarılacak bir seri yok.')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {dialogOpen ? (
        <ProfileShelfDialog
          description={txa('Fansubun tüm seri listesi ve temel yayın durumu bu pencerede açılır.')}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          title={txa('Fansub serileri')}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mangas.length > 0 ? mangas.map((manga) => {
              const coverImage = optimizePublicImageUrl(manga.coverImage) || manga.coverImage
              return (
                <Link
                  key={manga.id}
                  to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
                  className="group overflow-hidden rounded-[24px] border border-border/60 bg-card/60 transition-colors hover:border-primary/30 hover:bg-card"
                >
                  <img loading="lazy" decoding="async"
                    src={coverImage}
                    alt=""
                    aria-hidden
                    className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {manga.title}
                      </h3>
                      <Badge variant="outline" className="border-border/70 bg-background/70 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {manga.approvedChapterCount.toLocaleString(intlLocale())}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="size-3.5" />
                        {manga.lastChapter || txa('Yeni seri')}
                      </span>
                      {manga.pendingChapterCount > 0 && canSeePending ? (
                        <span>{txa('{`${v1} bekleyen`}', { v1: manga.pendingChapterCount })}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              )
            }) : (
              <div className="rounded-[22px] border border-dashed border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
                {txa('Henüz gösterilecek seri yok.')}
              </div>
            )}
          </div>
        </ProfileShelfDialog>
      ) : null}
    </>
  )
}
