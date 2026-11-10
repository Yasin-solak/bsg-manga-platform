import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { AlertTriangle, CalendarClock, Check, Eye, ToggleLeft } from 'lucide-react'
import type { AdminMangaChapterBrief, AdminMangaControlDetail } from '@/services/adminService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildPublicChapterPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { AdminChapterStudioReviewButton } from '@/components/admin/chapterReview/AdminChapterStudioReview'
import { txa } from '@/i18n/activeLocale'

/**
 * Chapter review surface.
 *
 * This is the admin's MAIN job in this window: does the uploaded translation meet the criteria?
 * So it is the default tab.
 *
 * **Why cards, not a table:** the old version opened a separate 7-column table for each
 * chapter number; rows scrolled horizontally and were unreadable on narrow screens.
 * The information needed for a decision is small and fixed (who, how many pages, when,
 * what state); a card gives it at a glance and works on mobile too.
 *
 * No ownership: several fansubs can translate the same chapter number, and each version
 * is reviewed SEPARATELY.
 */

interface MangaDetailChapterReviewProps {
  detail: AdminMangaControlDetail
  chapterGroups: Array<{ chapterNumber: number; versions: AdminMangaChapterBrief[] }>
  chapterPageCounts: Record<string, number>
  chapterPublishDraft: Record<string, string>
  onChapterPublishDraftChange: (chapterId: string, value: string) => void
  detailBusyKey: string | null
  onToggleChapterApproved: (chapter: AdminMangaChapterBrief) => void | Promise<void>
  onToggleChapterActive: (chapter: AdminMangaChapterBrief) => void | Promise<void>
  onSaveChapterPublishAt: (chapter: AdminMangaChapterBrief) => void | Promise<void>
}

function relativeDate(value?: string) {
  if (!value) return '—'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '—'
  const days = Math.floor((Date.now() - time) / 86_400_000)
  if (days <= 0) return 'bugun'
  if (days === 1) return 'dun'
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  if (days < 365) return txa('{v1} ay once', { v1: Math.floor(days / 30) })
  return txa('{v1} yil once', { v1: Math.floor(days / 365) })
}

export function MangaDetailChapterReview({
  detail,
  chapterGroups,
  chapterPageCounts,
  chapterPublishDraft,
  onChapterPublishDraftChange,
  detailBusyKey,
  onToggleChapterApproved,
  onToggleChapterActive,
  onSaveChapterPublishAt,
}: MangaDetailChapterReviewProps) {
  const [onlyPending, setOnlyPending] = useState(false)

  const pendingCount = useMemo(
    () => chapterGroups.reduce((total, group) => total + group.versions.filter((v) => !v.isApproved).length, 0),
    [chapterGroups],
  )

  const visibleGroups = useMemo(() => {
    if (!onlyPending) return chapterGroups
    return chapterGroups
      .map((group) => ({ ...group, versions: group.versions.filter((v) => !v.isApproved) }))
      .filter((group) => group.versions.length > 0)
  }, [chapterGroups, onlyPending])

  if (chapterGroups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        {txa('Bu seride henüz bölüm yok.')}
      </p>
    )
  }

  return (
    <div className="space-y-3" data-testid="admin-manga-chapter-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Aynı bölümü birden çok fansub çevirebilir; her sürüm ayrı incelenir.')}
        </p>
        {pendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={onlyPending ? 'secondary' : 'outline'}
            className="min-h-11 shrink-0"
            aria-pressed={onlyPending}
            onClick={() => setOnlyPending((previous) => !previous)}
          >
            {txa('Sadece bekleyenler (')}{pendingCount})
          </Button>
        ) : null}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {txa('İnceleme bekleyen çeviri yok.')}
        </p>
      ) : (
        visibleGroups.map((group) => (
          <section key={group.chapterNumber} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h4 className="m-0 font-heading text-sm text-foreground">{txa('{v1}. Bolum', { v1: group.chapterNumber })}</h4>
              {group.versions.length > 1 ? (
                <Badge variant="outline" className="rounded-full text-[10px]">{group.versions.length}{' '}{txa('ceviri')}</Badge>
              ) : null}
            </div>

            {group.versions.map((chapter) => {
              const pageCount = chapterPageCounts[chapter.id]
              const emptyPages = pageCount === 0
              return (
                <article
                  key={chapter.id}
                  className={cn(
                    'rounded-lg border border-border bg-card p-3',
                    !chapter.isApproved && 'border-amber-500/40 bg-amber-500/5',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-medium text-foreground">
                        {chapter.fansubId ? chapter.fansubName : txa('Ekip bilgisi yok')}
                        {chapter.title ? <span className="text-muted-foreground"> · {chapter.title}</span> : null}
                      </p>
                      <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className={cn(emptyPages && 'font-semibold text-amber-600 dark:text-amber-400')}>
                          {pageCount === undefined ? txa('sayfa ?') : txa('{v1} sayfa', { v1: pageCount })}
                        </span>
                        <span>·</span>
                        <span>{relativeDate(chapter.createdAt)}</span>
                        {emptyPages ? (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="size-3" aria-hidden="true" />
                              {txa('yükleme yarım')}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={chapter.isApproved ? 'default' : 'secondary'} className="rounded-full text-[10px]">
                        {chapter.isApproved ? txa('Onaylı') : txa('Onay bekliyor')}
                      </Badge>
                      {!chapter.isActive ? (
                        <Badge variant="destructive" className="rounded-full text-[10px]">{txa('Yayında değil')}</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {/* Kriter denetimi sayfalari GORMEDEN yapilamaz; baglanti
                        tam olarak bu fansubun surumunu acar. */}
                    <Button type="button" size="sm" variant="default" className="min-h-11" asChild>
                      <Link
                        to={buildPublicChapterPath({
                          mangaId: detail.id,
                          mangaSlug: detail.slug,
                          mangaTitle: detail.title,
                          chapterId: chapter.id,
                          chapterNumber: chapter.chapterNumber,
                          fansubId: chapter.fansubId,
                          fansubSlug: chapter.fansubId ? chapter.fansubSlug : undefined,
                          forceVersionQuery: true,
                        })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        {txa('Sayfaları incele')}
                      </Link>
                    </Button>
                    {/* Stüdyo bolumu: ham | cevrilmis yan yana, metinler, yeni dil. */}
                    <AdminChapterStudioReviewButton chapterId={chapter.id} />
                    <Button
                      type="button"
                      size="sm"
                      variant={chapter.isApproved ? 'outline' : 'default'}
                      className="min-h-11"
                      disabled={detailBusyKey === `chapter-approved-${chapter.id}`}
                      onClick={() => { void onToggleChapterApproved(chapter) }}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      {chapter.isApproved ? txa('Onayı geri al') : txa('Onayla')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={detailBusyKey === `chapter-active-${chapter.id}`}
                      onClick={() => { void onToggleChapterActive(chapter) }}
                    >
                      <ToggleLeft className="size-3.5" aria-hidden="true" />
                      {chapter.isActive ? txa('Yayından kaldır') : txa('Yayına al')}
                    </Button>

                    {/* Yayin tarihi kendi satirinda: dar sutunda dugmelerle
                        ayni satira sikisip tasiyordu (olculdu). */}
                    <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                      <label htmlFor={`publish-${chapter.id}`} className="shrink-0">{txa('Yayın')}</label>
                      <input
                        id={`publish-${chapter.id}`}
                        type="datetime-local"
                        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs"
                        value={chapterPublishDraft[chapter.id] || ''}
                        onChange={(event) => onChapterPublishDraftChange(chapter.id, event.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        disabled={detailBusyKey === `chapter-publish-${chapter.id}`}
                        onClick={() => { void onSaveChapterPublishAt(chapter) }}
                      >
                        {txa('Kaydet')}
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        ))
      )}
    </div>
  )
}
