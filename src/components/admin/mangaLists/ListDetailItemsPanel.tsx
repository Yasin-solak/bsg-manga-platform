import { Link } from '@/i18n/router'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { AdminMangaListItemRow } from '@/services/adminMangaListService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Manga in the list.
 *
 * The admin's main job in this window is looking at the list's CONTENT, so this is the default
 * tab.
 *
 * **Inactive/unapproved manga is highlighted:** on a public list such a record
 * appears to visitors as a gap, and in the old version badges got lost
 * among other info.
 */

interface ListDetailItemsPanelProps {
  items: AdminMangaListItemRow[]
}

export function ListDetailItemsPanel({ items }: ListDetailItemsPanelProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">
        {txa('Bu listede henüz manga yok.')}
      </p>
    )
  }

  const hiddenCount = items.filter((item) => !item.mangaIsActive || !item.mangaIsApproved).length

  return (
    <div className="space-y-3" data-testid="admin-list-items-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('{v1} manga · liste sırasıyla', { v1: items.length.toLocaleString(intlLocale()) })}
        </p>
        {hiddenCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {txa('{v1} manga ziyaretçiye görünmüyor', { v1: hiddenCount })}
          </span>
        ) : null}
      </div>

      <ul className="m-0 list-none space-y-1.5 p-0">
        {items.map((item) => {
          const hidden = !item.mangaIsActive || !item.mangaIsApproved
          return (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2',
                hidden && 'border-amber-500/40 bg-amber-500/5',
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                {item.position}
              </span>
              <img
                loading="lazy"
                decoding="async"
                src={item.mangaCoverImageUrl || '/manga-cover.jpg'}
                alt=""
                className="h-12 w-9 shrink-0 rounded-md border border-border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-medium text-foreground">{item.mangaTitle}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {!item.mangaIsActive ? (
                    <Badge variant="destructive" className="rounded-full text-[10px]">{txa('Pasif')}</Badge>
                  ) : null}
                  {!item.mangaIsApproved ? (
                    <Badge variant="outline" className="rounded-full text-[10px]">{txa('Onaysız')}</Badge>
                  ) : null}
                  {!hidden ? (
                    <Badge variant="secondary" className="rounded-full text-[10px]">{txa('Yayında')}</Badge>
                  ) : null}
                </div>
                {item.note ? (
                  <p className="m-0 mt-1 line-clamp-2 text-xs text-muted-foreground">{item.note}</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" asChild>
                <Link
                  to={buildPublicMangaPath({ id: item.mangaId, slug: item.mangaSlug, title: item.mangaTitle })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" aria-label={txa('Sitede aç')} />
                </Link>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
