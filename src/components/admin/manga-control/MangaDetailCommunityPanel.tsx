import { Pin, Search, Star, Trash2 } from 'lucide-react'
import type { AdminMangaCommentItem, AdminMangaRatingItem } from '@/services/adminService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Community moderation: comments and ratings.
 *
 * **Why a list, not a table:** the old version had two separate 5-6 column tables;
 * comment text was squeezed in a narrow cell and rows scrolled horizontally. In comment
 * moderation what must be read is THE TEXT ITSELF, and a list format makes room
 * for it.
 *
 * Both are in one tab but separate sections: ratings are a few rows on most series
 * and did not deserve their own tab.
 */

interface MangaDetailCommunityPanelProps {
  comments: AdminMangaCommentItem[]
  commentSearch: string
  onCommentSearchChange: (value: string) => void
  ratings: AdminMangaRatingItem[]
  ratingSearch: string
  onRatingSearchChange: (value: string) => void
  ratingSummary: { total: number; average: number | null; distribution: number[] }
  detailBusyKey: string | null
  onToggleCommentPinned: (comment: AdminMangaCommentItem) => void | Promise<void>
  onToggleCommentActive: (comment: AdminMangaCommentItem) => void | Promise<void>
  onDeleteComment: (comment: AdminMangaCommentItem) => void | Promise<void>
  onDeleteRating: (ratingItem: AdminMangaRatingItem) => void | Promise<void>
}

function dateText(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: '2-digit' })
}

export function MangaDetailCommunityPanel({
  comments,
  commentSearch,
  onCommentSearchChange,
  ratings,
  ratingSearch,
  onRatingSearchChange,
  ratingSummary,
  detailBusyKey,
  onToggleCommentPinned,
  onToggleCommentActive,
  onDeleteComment,
  onDeleteRating,
}: MangaDetailCommunityPanelProps) {
  return (
    <div className="space-y-6" data-testid="admin-manga-community-panel">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="m-0 mr-auto font-heading text-sm text-foreground">{txa('Yorumlar')}</h4>
          <SearchBox
            value={commentSearch}
            onChange={onCommentSearchChange}
            placeholder={txa('Kullanıcı, metin ya da kimlik ara…')}
            label={txa('Yorumlarda ara')}
          />
        </div>

        {comments.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {txa('Yorum bulunamadi.')}
          </p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={cn(
                  'rounded-lg border border-border bg-card p-3',
                  !comment.isActive && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2.5">
                  {comment.avatarUrl ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={comment.avatarUrl}
                      alt=""
                      className="size-7 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="size-7 shrink-0 rounded-full border border-border bg-muted" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <strong className="text-foreground">{comment.username}</strong>
                      <span className="text-muted-foreground">{dateText(comment.createdAt)}</span>
                      {comment.likes > 0 ? <span className="text-muted-foreground">{comment.likes}{' '}{txa('begeni')}</span> : null}
                      {comment.isPinned ? <Badge variant="secondary" className="rounded-full text-[10px]">{txa('Sabit')}</Badge> : null}
                      {comment.isSpoiler ? <Badge variant="outline" className="rounded-full text-[10px]">{txa('Spoiler')}</Badge> : null}
                      {!comment.isActive ? <Badge variant="destructive" className="rounded-full text-[10px]">{txa('Gizli')}</Badge> : null}
                      {comment.parentId ? <span className="text-muted-foreground">{txa('yanıt')}</span> : null}
                    </p>
                    {/* Moderasyonda okunmasi gereken sey METIN; kirpilmaz. */}
                    <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
                      {comment.content}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={detailBusyKey === `comment-pin-${comment.id}`}
                    onClick={() => { void onToggleCommentPinned(comment) }}
                  >
                    <Pin className="size-3.5" aria-hidden="true" />
                    {comment.isPinned ? txa('Sabitlemeyi kaldır') : txa('Sabitle')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={detailBusyKey === `comment-active-${comment.id}`}
                    onClick={() => { void onToggleCommentActive(comment) }}
                  >
                    {comment.isActive ? txa('Gizle') : txa('Göster')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="min-h-11"
                    disabled={detailBusyKey === `comment-delete-${comment.id}`}
                    onClick={() => { void onDeleteComment(comment) }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {txa('Sil')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="m-0 mr-auto font-heading text-sm text-foreground">{txa('Puanlar')}</h4>
          <SearchBox
            value={ratingSearch}
            onChange={onRatingSearchChange}
            placeholder={txa('Kullanıcı ya da puan ara…')}
            label={txa('Puanlarda ara')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            <Star className="size-3.5" aria-hidden="true" />
            {ratingSummary.average ?? '—'} / 5
          </span>
          <span>{ratingSummary.total}{' '}{txa('oy')}</span>
          <span className="flex flex-wrap gap-1">
            {ratingSummary.distribution.map((count, index) => (
              <span key={index} className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                {index + 1}★ {count}
              </span>
            ))}
          </span>
        </div>

        {ratings.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {txa('Puan kaydi bulunamadi.')}
          </p>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {ratings.map((item) => (
              <li key={item.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                {item.avatarUrl ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={item.avatarUrl}
                    alt=""
                    className="size-6 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : null}
                <strong className="min-w-0 truncate text-xs text-foreground">{item.username}</strong>
                <Badge variant="secondary" className="rounded-full text-[10px]">{item.rating} / 5</Badge>
                <span className="text-[11px] text-muted-foreground">{dateText(item.createdAt)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto min-h-11"
                  disabled={detailBusyKey === `rating-delete-${item.userId}`}
                  onClick={() => { void onDeleteRating(item) }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {txa('Sil')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-[280px] sm:flex-none">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 pl-8"
      />
    </div>
  )
}
