import type { FormEvent, ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { AlertTriangle, ExternalLink, Globe, ImageOff, Loader2, Lock, MoreHorizontal, Trash2 } from 'lucide-react'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AdminMangaListCommentRow, AdminMangaListDetail, AdminMangaListSummary } from '@/services/adminMangaListService'
import { formatListDate, listRelativeAge, type CommentVisibilityFilter } from './adminMangaListsUtils'
import { ListDetailCommentsPanel } from './ListDetailCommentsPanel'
import { ListDetailItemsPanel } from './ListDetailItemsPanel'
import { ListDetailMetaPanel } from './ListDetailMetaPanel'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type ListDetailTab = 'items' | 'meta' | 'comments'

export interface ListMetaDraft {
  title: string
  description: string
  isPublic: boolean
}

/** Gaps to see without opening details (empty / no cover / inactive manga / hidden comment). */
function listWarnings(list: AdminMangaListSummary, detail: AdminMangaListDetail | null) {
  const warnings: string[] = []
  const itemCount = detail ? detail.items.length : list.itemsCount
  if (itemCount === 0) warnings.push(txa('Hiç mangası yok; ziyaretçi için çıkmaz sokak.'))
  if (!list.coverMangaId) warnings.push(txa('Kapak seçilmemiş; kart yüzeyi eksik görünür.'))
  if (!list.description?.trim()) warnings.push(txa('Açıklama yok.'))
  if (detail) {
    const hiddenItems = detail.items.filter((item) => !item.mangaIsActive || !item.mangaIsApproved).length
    if (hiddenItems > 0) warnings.push(txa('{v1} manga pasif ya da onaysız; listede boşluk olarak görünür.', { v1: hiddenItems }))
    const hiddenComments = detail.comments.filter((comment) => !comment.isActive).length
    if (hiddenComments > 0) warnings.push(txa('{v1} yorum kaldırılmış.', { v1: hiddenComments }))
  }
  return warnings
}

const TABS: Array<{ id: ListDetailTab, label: string }> = [
  { id: 'items', get label() { return txa('Mangalar') } },
  { id: 'meta', get label() { return txa('Bilgiler') } },
  { id: 'comments', get label() { return txa('Yorumlar') } },
]

/**
 * List details (the desk's right panel / drawer on narrow screens). The top part is
 * PERSISTENT context: identity, counts, gaps; it does not vanish on tab change (in the old
 * window moving to "Comments" hid which list you were in).
 * Tabs are by job: Manga (default), Info, Comments.
 */
export function ListDetailPane({
  list,
  detail,
  detailLoading,
  detailError,
  onRetry,
  layout,
  busy,
  tab,
  onTabChange,
  meta,
  metaSaving,
  onMetaChange,
  onSaveMeta,
  commentFilter,
  commentSearch,
  comments,
  commentActionKey,
  onCommentFilterChange,
  onCommentSearchChange,
  onRemoveComment,
  onRestoreComment,
  onToggleVisibility,
  onDelete,
}: {
  list: AdminMangaListSummary
  detail: AdminMangaListDetail | null
  detailLoading: boolean
  detailError: string | null
  onRetry: () => void
  /** desk: kararlar basligin saginda; sheet: altta sabit. */
  layout: 'desk' | 'sheet'
  busy: boolean
  tab: ListDetailTab
  onTabChange: (tab: ListDetailTab) => void
  meta: ListMetaDraft
  metaSaving: boolean
  onMetaChange: (patch: Partial<ListMetaDraft>) => void
  onSaveMeta: (event: FormEvent<HTMLFormElement>) => void
  commentFilter: CommentVisibilityFilter
  commentSearch: string
  comments: AdminMangaListCommentRow[]
  commentActionKey: string | null
  onCommentFilterChange: (value: CommentVisibilityFilter) => void
  onCommentSearchChange: (value: string) => void
  onRemoveComment: (comment: AdminMangaListCommentRow) => void
  onRestoreComment: (comment: AdminMangaListCommentRow) => void
  onToggleVisibility: () => void
  onDelete: () => void
}) {
  const allComments = detail?.comments ?? []
  const hiddenComments = allComments.filter((comment) => !comment.isActive).length
  const itemCount = detail ? detail.items.length : list.itemsCount
  const commentCount = detail ? allComments.length : list.commentsCount
  const warnings = listWarnings(list, detail)
  const size = layout === 'desk' ? 'sm' : 'default'
  const visibilityAction = (
    <Button variant="outline" size={size} disabled={busy} onClick={onToggleVisibility} className="gap-1.5" data-testid="admin-lists-toggle-visibility">
      {busy ? <Loader2 className="size-4 animate-spin" /> : list.isPublic ? <Lock className="size-4" /> : <Globe className="size-4" />}
      {list.isPublic ? txa('Özele al') : txa('Herkese aç')}
    </Button>
  )

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Liste ayrıntısı')}
      data-testid="admin-lists-detail"
    >
      <header className="border-b border-border/60 px-5 py-3.5">
        <div className="flex items-start gap-3">
          {list.coverImageUrl
            ? <img src={list.coverImageUrl} alt="" loading="lazy" decoding="async" className="h-[60px] w-11 shrink-0 rounded-md border border-border bg-muted object-cover" />
            : <span className="flex h-[60px] w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/60" title={txa('Kapak seçilmemiş')}><ImageOff className="size-4" /></span>}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Pill tone={list.isPublic ? 'emerald' : undefined}>{list.isPublic ? txa('Herkese açık') : txa('Özel')}</Pill>
              {itemCount === 0 ? <Pill tone="amber">{txa('Boş')}</Pill> : null}
              {!list.coverMangaId ? <Pill tone="amber">{txa('Kapaksız')}</Pill> : null}
            </span>
            <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold leading-snug tracking-tight [overflow-wrap:anywhere]">{list.title}</h2>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              <AdminEntityHoverCard kind="user" entityKey={list.ownerId || null}>@{list.ownerUsername}</AdminEntityHoverCard>
              {' · '}{txa('{v1} oluşturuldu · {v2} güncellendi', { v1: formatListDate(list.createdAt), v2: listRelativeAge(list.updatedAt) })}
            </span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
            {layout === 'desk' ? visibilityAction : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-lists-more"><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {list.isPublic ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/listeler/${list.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Sitede aç')}</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to={`/profil/${encodeURIComponent(list.ownerUsername)}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Sahibinin profili')}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete} data-testid="admin-lists-delete">
                  <Trash2 className="size-4" />{txa('Kalıcı olarak sil…')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-muted-foreground" data-testid="admin-lists-facts">
          <Fact value={itemCount} label="manga" warn={itemCount === 0} />
          <Fact value={commentCount} label={txa('yorum')} extra={hiddenComments > 0 ? txa('{v1} kaldırılmış', { v1: hiddenComments }) : undefined} />
          <span className="rounded-lg bg-muted/50 px-2.5 py-1">
            {list.ratingsCount > 0
              ? <><b className="font-bold tabular-nums text-foreground">{list.ratingAvg.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })}</b> {txa('puan · {v1} oy', { v1: list.ratingsCount.toLocaleString(intlLocale()) })}</>
              : txa('Henüz puan yok')}
          </span>
        </div>

        {warnings.length ? (
          <ul className="mt-3 flex flex-col gap-1" data-testid="admin-list-detail-warnings">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-1.5 text-[12px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warning}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div role="tablist" aria-label={txa('Liste ayrıntısı bölümleri')} className="flex shrink-0 gap-1 border-b border-border/60 px-4">
        {TABS.map((item) => {
          const selected = tab === item.id
          const count = item.id === 'items' ? itemCount : item.id === 'comments' ? commentCount : null
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(item.id)}
              data-testid={`admin-lists-tab-${item.id}`}
              className={cn(
                'relative inline-flex h-10 items-center gap-1.5 px-2.5 text-[13px] font-semibold transition-colors',
                selected ? 'text-foreground after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {count != null ? <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] tabular-nums">{count}</span> : null}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {detailLoading && !detail ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
        ) : detailError && !detail ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-[13px] text-muted-foreground">
            {detailError}
            <Button size="sm" variant="outline" onClick={onRetry}>{txa('Tekrar dene')}</Button>
          </div>
        ) : detail ? (
          <>
            {tab === 'items' ? <ListDetailItemsPanel items={detail.items} /> : null}
            {tab === 'meta' ? (
              <ListDetailMetaPanel
                metaTitleDraft={meta.title}
                metaDescriptionDraft={meta.description}
                metaIsPublicDraft={meta.isPublic}
                metaSaving={metaSaving}
                onMetaTitleDraftChange={(title) => onMetaChange({ title })}
                onMetaDescriptionDraftChange={(description) => onMetaChange({ description })}
                onMetaIsPublicDraftChange={(isPublic) => onMetaChange({ isPublic })}
                onSubmit={onSaveMeta}
              />
            ) : null}
            {tab === 'comments' ? (
              <ListDetailCommentsPanel
                stats={{ total: allComments.length, active: allComments.length - hiddenComments, inactive: hiddenComments }}
                commentFilter={commentFilter}
                commentSearch={commentSearch}
                commentActionKey={commentActionKey}
                comments={comments}
                allComments={allComments}
                onCommentSearchChange={onCommentSearchChange}
                onCommentFilterChange={onCommentFilterChange}
                onRemoveComment={onRemoveComment}
                onRestoreComment={onRestoreComment}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {layout === 'sheet' ? (
        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">{visibilityAction}</footer>
      ) : null}
    </section>
  )
}

function Pill({ tone, children }: { tone?: 'emerald' | 'amber', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'emerald' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Fact({ value, label, extra, warn = false }: { value: number, label: string, extra?: string, warn?: boolean }) {
  return (
    <span className={cn('rounded-lg bg-muted/50 px-2.5 py-1', warn && 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
      <b className={cn('font-bold tabular-nums', warn ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{value.toLocaleString(intlLocale())}</b> {label}
      {extra ? <span className="text-amber-700 dark:text-amber-300"> · {extra}</span> : null}
    </span>
  )
}
