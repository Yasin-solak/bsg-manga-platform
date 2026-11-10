import { RotateCcw, Search, Trash2 } from 'lucide-react'
import type { AdminMangaListCommentRow } from '@/services/adminMangaListService'
import { AdminCommentBodyPreview } from '@/components/admin/sections/comments/AdminCommentBodyPreview'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { listRelativeAge, type CommentVisibilityFilter } from './adminMangaListsUtils'
import { txa } from '@/i18n/activeLocale'

/**
 * Moderation of list comments.
 *
 * **Not a table:** what must be read in moderation is THE TEXT
 * ITSELF. Removal uses the same flow as the Comments page (reason + author
 * notification + audit record); this used to have unnotified hiding and permanent
 * deletion. The reply relation is visible: removal hides replies too.
 */

interface ListDetailCommentsPanelProps {
  stats: { total: number, active: number, inactive: number }
  commentFilter: CommentVisibilityFilter
  commentSearch: string
  commentActionKey: string | null
  /** Filtre + aramadan gecen yorumlar. */
  comments: AdminMangaListCommentRow[]
  /** All comments, for the reply relation. */
  allComments: AdminMangaListCommentRow[]
  onCommentSearchChange: (value: string) => void
  onCommentFilterChange: (value: CommentVisibilityFilter) => void
  onRemoveComment: (comment: AdminMangaListCommentRow) => void
  onRestoreComment: (comment: AdminMangaListCommentRow) => void
}

const FILTERS: Array<{ id: CommentVisibilityFilter, label: string }> = [
  { id: 'all', get label() { return txa('Tümü') } },
  { id: 'active', get label() { return txa('Yayında') } },
  { id: 'inactive', get label() { return txa('Kaldırılan') } },
]

export function ListDetailCommentsPanel({
  stats,
  commentFilter,
  commentSearch,
  commentActionKey,
  comments,
  allComments,
  onCommentSearchChange,
  onCommentFilterChange,
  onRemoveComment,
  onRestoreComment,
}: ListDetailCommentsPanelProps) {
  const replyCount = (id: string) => allComments.filter((comment) => comment.parentId === id).length

  return (
    <div className="space-y-3" data-testid="admin-list-comments-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-muted/60 p-1" role="group" aria-label={txa('Yorum durumuna göre filtrele')}>
          {FILTERS.map((filter) => {
            const selected = commentFilter === filter.id
            const count = filter.id === 'all' ? stats.total : filter.id === 'active' ? stats.active : stats.inactive
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onCommentFilterChange(filter.id)}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors', selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {filter.label}
                <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={commentSearch}
            onChange={(event) => onCommentSearchChange(event.target.value)}
            placeholder={txa('Üye ya da metin ara')}
            aria-label={txa('Liste yorumlarında ara')}
            className="h-8 pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">
          {stats.total === 0 ? txa('Bu listeye henüz yorum yazılmamış.') : txa('Bu filtrede yorum yok.')}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {comments.map((comment) => {
            const replies = replyCount(comment.id)
            const busy = commentActionKey === comment.id
            return (
              <li
                key={comment.id}
                className={cn(
                  'rounded-xl border border-border/70 bg-background/40 p-3',
                  !comment.isActive && 'opacity-70',
                  comment.parentId && 'ml-4 border-l-2 border-l-primary/30',
                )}
              >
                <div className="flex items-start gap-2.5">
                  {comment.authorAvatarUrl
                    ? <img loading="lazy" decoding="async" src={comment.authorAvatarUrl} alt="" className="size-7 shrink-0 rounded-full border border-border object-cover" />
                    : <span className="size-7 shrink-0 rounded-full border border-border bg-muted" aria-hidden="true" />}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                      <AdminEntityHoverCard kind="user" entityKey={comment.authorId || null}>
                        <strong className="text-foreground">@{comment.authorUsername}</strong>
                      </AdminEntityHoverCard>
                      <span className="text-muted-foreground">{listRelativeAge(comment.createdAt)}</span>
                      {comment.likesCount > 0 ? <span className="text-muted-foreground">{txa('{v1} beğeni', { v1: comment.likesCount })}</span> : null}
                      {comment.parentId ? <span className="rounded-md bg-muted px-1.5 text-[10.5px] font-bold text-muted-foreground">{txa('Yanıt')}</span> : null}
                      {!comment.isActive ? <span className="rounded-md bg-rose-500/12 px-1.5 text-[10.5px] font-bold text-rose-700 dark:text-rose-300">{txa('Kaldırıldı')}</span> : null}
                    </p>
                    {/* Ham metin BASILMAZ: govde spoiler isaretleri (||...||)
                        ve destek-token'lari icerebiliyor; duz basmak token
                        kodunu goruntuler. Paylasilan onizleme bileseni ikisini
                        de dogru render eder. */}
                    <AdminCommentBodyPreview text={comment.body} size="comfortable" className="mt-1 text-[13px] leading-5 text-foreground" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                  {replies > 0 && comment.isActive ? (
                    <span className="mr-auto text-[11.5px] text-amber-700 dark:text-amber-300">{txa('Kaldırılırsa {v1} yanıtı da gizlenir', { v1: replies })}</span>
                  ) : null}
                  {comment.isActive ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRemoveComment(comment)} data-testid="admin-list-comment-remove" className="h-8 gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300">
                      <Trash2 className="size-3.5" aria-hidden="true" />{txa('Kaldır…')}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRestoreComment(comment)} className="h-8 gap-1.5">
                      <RotateCcw className="size-3.5" aria-hidden="true" />{txa('Geri aç')}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
