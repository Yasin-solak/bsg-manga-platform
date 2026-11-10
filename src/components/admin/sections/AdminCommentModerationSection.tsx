import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, EyeOff, Inbox, Link2, Loader2, MessageSquare,
  MessagesSquare, MoreHorizontal, Pin, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2, UserRound, type LucideIcon,
} from 'lucide-react'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import AdminUserDetailModal from '@/components/admin/users/AdminUserDetailModal'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  listAdminCommentModerationPage,
  setAdminModerationCommentsActive,
  type AdminCommentModerationItem,
  type AdminCommentModerationList,
  type AdminCommentModerationSignalFilter,
  type AdminCommentModerationSourceFilter,
  type AdminCommentModerationStatusFilter,
} from '@/services/adminCommentModerationService'
import type { AdminManagedUser } from '@/services/adminUserService'
import { toast } from '@/services/toastService'
import { AdminCommentBodyPreview } from './comments/AdminCommentBodyPreview'
import { CommentRemoveDialog } from './comments/CommentRemoveDialog'
import {
  COMMENT_SOURCE_ORDER,
  commentBodyKind,
  commentBodyKindLabel,
  commentRelativeAge,
  commentRouteActionLabel,
  commentSignalHint,
  commentSignalLabel,
  commentSignals,
  commentSourceLabel,
  commentWasEdited,
  formatAdminCommentDateTime,
} from './comments/adminCommentModerationUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 20

type ViewId = 'flagged' | 'active' | 'removed' | 'all'

/** Summary strip = view; counts are for the selected source + search (a total, not a filter). */
const VIEWS: Array<{ id: ViewId, label: string, status: AdminCommentModerationStatusFilter, signal: AdminCommentModerationSignalFilter, icon: LucideIcon, tone: string }> = [
  { id: 'flagged', get label() { return txa('Riskli') }, status: 'active', signal: 'flagged', icon: ShieldAlert, tone: 'bg-amber-500/10 text-amber-500' },
  { id: 'active', get label() { return txa('Yayında') }, status: 'active', signal: 'all', icon: MessageSquare, tone: 'bg-emerald-500/10 text-emerald-500' },
  { id: 'removed', get label() { return txa('Kaldırılan') }, status: 'removed', signal: 'all', icon: EyeOff, tone: 'bg-rose-500/10 text-rose-500' },
  { id: 'all', get label() { return txa('Tümü') }, status: 'all', signal: 'all', icon: MessagesSquare, tone: 'bg-primary/10 text-primary' },
]

const SIGNAL_OPTIONS: Array<[AdminCommentModerationSignalFilter, string]> = [
  ['all', 'Tüm yorumlar'],
  ['flagged', 'Herhangi bir sinyal'],
  ['links', 'Bağlantı'],
  ['spoiler', 'Spoiler'],
  ['spam', 'Spam / reklam'],
  ['abuse', 'Hakaret'],
]

const EMPTY_LIST: AdminCommentModerationList = {
  rows: [],
  total: 0,
  sources: { all: 0, chapter: 0, manga: 0, list: 0 },
  counts: { active: 0, removed: 0, flagged: 0 },
}

function buildAdminManagedUserFromComment(comment: AdminCommentModerationItem): AdminManagedUser {
  return {
    id: comment.authorUserId,
    username: comment.authorUsername,
    avatarUrl: comment.authorAvatarUrl || '',
    role: 'user',
    isBanned: false,
    isActive: true,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
}

function CommentAvatar({ comment, large = false }: { comment: AdminCommentModerationItem, large?: boolean }) {
  const size = large ? 'size-11 text-[13px]' : 'size-9 text-[11px]'
  return comment.authorAvatarUrl
    ? <img src={comment.authorAvatarUrl} alt="" loading="lazy" decoding="async" className={cn(size, 'shrink-0 rounded-full border border-border bg-muted object-cover')} />
    : <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground')} aria-hidden="true">{(comment.authorUsername[0] || '?').toLocaleUpperCase(intlLocale())}</span>
}

/**
 * Comments v2: comment moderation desk. The server searches and filters all comments
 * (admin_list_moderation_comments); the strip picks a view (Risky /
 * Live / Removed / All), tabs pick the source (All / Chapter /
 * Manga / List). Removal passes a reason dialog; only the selected comment's
 * author is notified, replies are hidden in a chain.
 */
export function AdminCommentModerationSection() {
  const desk = useDeskLayout()
  const [source, setSource] = useState<AdminCommentModerationSourceFilter>('all')
  const [status, setStatus] = useState<AdminCommentModerationStatusFilter>('active')
  const [signal, setSignal] = useState<AdminCommentModerationSignalFilter>('flagged')
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<AdminCommentModerationList>(EMPTY_LIST)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<AdminCommentModerationItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminManagedUser | null>(null)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  // Arama yazarken her harfte sorgu atilmaz.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(draftSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [draftSearch])

  useEffect(() => { setPage(0) }, [source, status, signal, search])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    listAdminCommentModerationPage({ source, status, signal, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => { if (active) setData(result) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? txa(reason.message) : txa('Yorumlar yüklenemedi.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [source, status, signal, search, page, revision])

  const rows = data.rows
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const activeView = VIEWS.find((view) => view.status === status && view.signal === signal)?.id ?? null

  // On desktop a selection always exists: when the selected comment leaves the view, the same position opens.
  useEffect(() => {
    if (selected) {
      lastIndexRef.current = rows.indexOf(selected)
      return
    }
    if (!desk || loading) return
    const next = rows[Math.min(lastIndexRef.current, rows.length - 1)]
    setSelectedId(next ? next.id : null)
  }, [desk, loading, rows, selected])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const select = useCallback((row: AdminCommentModerationItem) => {
    setSelectedId(row.id)
    if (!desk) setSheetOpen(true)
  }, [desk])

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = selected ? rows.indexOf(selected) : -1
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setSelectedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-comment-id="${next.id}"]`)?.focus())
  }

  const setView = (view: (typeof VIEWS)[number]) => {
    setStatus(view.status)
    setSignal(view.signal)
  }

  const applyActive = async (target: AdminCommentModerationItem, nextActive: boolean, reason?: string) => {
    setBusyId(target.id)
    try {
      await setAdminModerationCommentsActive([target], nextActive, reason)
      const replies = target.replyCount ?? 0
      if (nextActive) toast.success(replies > 0 ? txa('Yorum ve yanıtları yeniden yayında.') : txa('Yorum yeniden yayında.'))
      else toast.success(txa('Yorum kaldırıldı; yazara bildirim gitti.'))
      setRemoveTarget(null)
      // Local state updates immediately; counts and the view refresh from the server.
      setData((current) => ({ ...current, rows: current.rows.map((row) => (row.id === target.id ? { ...row, isActive: nextActive } : row)) }))
      setRevision((value) => value + 1)
      if (!desk && !nextActive) { setSheetOpen(false); setSelectedId(null) }
    } catch (reason) {
      toast.error(reason instanceof Error && reason.message ? reason.message : txa('Yorum durumu güncellenemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  const detail = selected ? (
    <CommentDetailPane
      comment={selected}
      layout={desk ? 'desk' : 'sheet'}
      busy={busyId === selected.id}
      onRemove={() => setRemoveTarget(selected)}
      onRestore={() => { void applyActive(selected, true) }}
      onOpenUser={() => { if (selected.authorUserId) setSelectedUser(buildAdminManagedUserFromComment(selected)) }}
    />
  ) : null

  const totalOfSource = data.counts.active + data.counts.removed

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-comments">
      <AdminSectionHeader
        title={txa('Yorumlar')}
        description={txa('Bölüm, manga ve liste yorumları: inceleme, kaldırma ve geri açma.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Yorum özeti')}>
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {VIEWS.map((view) => {
            const active = activeView === view.id
            const value = view.id === 'all' ? totalOfSource : data.counts[view.id]
            return (
              <button key={view.id} type="button" aria-pressed={active} onClick={() => setView(view)} data-testid={`admin-comments-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', view.tone)}><view.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{value.toLocaleString(intlLocale())}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Yorum kaynağı')}>
          {COMMENT_SOURCE_ORDER.map((value) => {
            const active = source === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSource(value)}
                data-testid={`admin-comments-source-${value}`}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {commentSourceLabel(value)}
                <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] tabular-nums">{data.sources[value]}</span>
              </button>
            )
          })}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} maxLength={120} placeholder={txa('Yorum, üye ya da seri / gönderi ara')} aria-label={txa('Yorumlarda ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        <Select value={signal} onValueChange={(value) => setSignal(value as AdminCommentModerationSignalFilter)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Sinyal')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {SIGNAL_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      {/* Masada (xl) izgara kalan yuksekligi doldurur; liste ve ayrinti kendi icinde kayar. */}
      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-comments-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && rows.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-comments-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-5" /></span>
              <span className="text-[13px] font-semibold">
                {search ? txa('Aramaya uyan yorum yok') : activeView === 'flagged' ? txa('Riskli yorum yok') : txa('Bu görünümde yorum yok')}
              </span>
              {activeView === 'flagged' && !search ? (
                <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => setView(VIEWS[1])}>{txa('Yayındaki yorumları göster')}</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Yorumlar')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-comments-list">
              {rows.map((row) => <CommentRow key={row.id} comment={row} active={row.id === selectedId} onSelect={() => select(row)} />)}
            </ul>
          )}
          {data.total > PAGE_SIZE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{page * PAGE_SIZE + 1}–{Math.min(data.total, (page + 1) * PAGE_SIZE)} / {data.total.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || page >= pageCount - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir yorum seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Yorum ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Yorumu incele, kaldır ya da geri aç.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <CommentRemoveDialog
        comment={removeTarget}
        busy={Boolean(removeTarget && busyId === removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={(reason) => { if (removeTarget) void applyActive(removeTarget, false, reason) }}
      />

      <AdminUserDetailModal isOpen={selectedUser !== null} user={selectedUser} onClose={() => setSelectedUser(null)} />
    </section>
  )
}

function CommentRow({ comment, active, onSelect }: { comment: AdminCommentModerationItem, active: boolean, onSelect: () => void }) {
  const signals = commentSignals(comment)
  const risky = signals.some((signal) => signal === 'abuse' || signal === 'spam' || signal === 'links')
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        data-comment-id={comment.id}
        data-testid={`admin-comments-row-${comment.id}`}
        className={cn(
          'relative flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50',
          active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
        )}
      >
        <span className={cn('mt-[15px] size-2 shrink-0 rounded-full', !comment.isActive ? 'bg-rose-500' : risky ? 'bg-amber-500' : 'bg-emerald-500')} aria-hidden="true" />
        <CommentAvatar comment={comment} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="min-w-0 truncate">
              <AdminEntityHoverCard kind="user" entityKey={comment.authorUserId || null} focusable={false}>
                <span className="font-semibold text-foreground">@{comment.authorUsername}</span>
              </AdminEntityHoverCard>
              {' · '}{commentSourceLabel(comment.source)} · {comment.contextTitle}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 break-words text-[12.5px] leading-5 text-foreground [overflow-wrap:anywhere]">
            {comment.body.trim() || txa('Metin yok (yalnız ifade / çıkartma).')}
          </span>
          {signals.length || !comment.isActive || comment.parentId ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {!comment.isActive ? <Tag tone="rose">{txa('Kaldırıldı')}</Tag> : null}
              {comment.parentId ? <Tag>{txa('Yanıt')}</Tag> : null}
              {signals.map((item) => <Tag key={item} tone={item === 'abuse' ? 'rose' : 'amber'}>{commentSignalLabel(item)}</Tag>)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">{commentRelativeAge(comment.createdAt)}</span>
      </button>
    </li>
  )
}

function Tag({ tone, children }: { tone?: 'rose' | 'amber', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'rose' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300' : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Fact({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[12.5px] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function CommentDetailPane({
  comment,
  layout,
  busy,
  onRemove,
  onRestore,
  onOpenUser,
}: {
  comment: AdminCommentModerationItem
  /** desk: kararlar basligin saginda; sheet: altta sabit. */
  layout: 'desk' | 'sheet'
  busy: boolean
  onRemove: () => void
  onRestore: () => void
  onOpenUser: () => void
}) {
  const signals = commentSignals(comment)
  const size = layout === 'desk' ? 'sm' : 'default'
  const removedByAuthor = comment.authorRemovedCount ?? 0
  const actions = comment.isActive ? (
    <Button variant="outline" size={size} disabled={busy} onClick={onRemove} className="gap-1.5 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300" data-testid="admin-comments-remove">
      <Trash2 className="size-4" />{txa('Kaldır…')}
    </Button>
  ) : (
    <Button variant="outline" size={size} disabled={busy} onClick={onRestore} className="gap-1.5" data-testid="admin-comments-restore">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{txa('Geri aç')}
    </Button>
  )

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Yorum ayrıntısı')}
      data-testid="admin-comments-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <CommentAvatar comment={comment} large />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
            <Tag tone={comment.isActive ? undefined : 'rose'}>{comment.isActive ? txa('Yayında') : txa('Kaldırıldı')}</Tag>
            <span className="truncate">{commentSourceLabel(comment.source)} › {comment.contextTitle}{comment.source === 'chapter' ? ` › ${comment.contextSubtitle}` : ''}</span>
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <AdminEntityHoverCard kind="user" entityKey={comment.authorUserId || null}>
              <span className="text-[16px] font-bold tracking-tight">@{comment.authorUsername}</span>
            </AdminEntityHoverCard>
            <FansubIdentityTagChip tag={comment.activeFansubIdentityTag} size="xs" />
          </span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {formatAdminCommentDateTime(comment.createdAt)}{commentWasEdited(comment) ? txa(' · düzenlendi') : ''}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? actions : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-comments-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {comment.routeHint ? (
                <DropdownMenuItem asChild>
                  <a href={comment.routeHint} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{commentRouteActionLabel(comment.source)}</a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onOpenUser} disabled={!comment.authorUserId}><UserRound className="size-4" />{txa('Üye ayrıntısı')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {comment.isSpoiler ? (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200">
            <EyeOff className="mt-px size-4 shrink-0" />{txa('Yazar yorumu spoiler olarak işaretledi; sitede bulanık görünür.')}
          </p>
        ) : null}

        {comment.body.trim() ? (
          <AdminCommentBodyPreview text={comment.body} size="comfortable" className="rounded-2xl bg-muted/35 px-4 py-3 text-[13.5px] leading-6" />
        ) : (
          <p className="rounded-2xl bg-muted/35 px-4 py-3 text-[13px] italic text-muted-foreground">{txa('Metin yok; yalnız ifade ya da çıkartma.')}</p>
        )}

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Bağlam')}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label={txa('Kaynak')}>{commentSourceLabel(comment.source)}</Fact>
            <Fact label={comment.source === 'list' ? txa('Liste') : txa('Seri')}>
              {comment.mangaId
                ? <AdminEntityHoverCard kind="manga" entityKey={comment.mangaId}>{comment.contextTitle}</AdminEntityHoverCard>
                : comment.contextTitle}
              {comment.source === 'chapter' ? <span className="block text-muted-foreground">{comment.contextSubtitle}</span> : null}
            </Fact>
            <Fact label={txa('Tür')}>{comment.parentId ? txa('Yanıt') : txa('Ana yorum')} · {commentBodyKindLabel(commentBodyKind(comment))}</Fact>
            <Fact label={txa('Yanıtlar')}>{(comment.replyCount ?? 0).toLocaleString(intlLocale())}</Fact>
            <Fact label={txa('Beğeni / beğenmeme')}>{comment.likesCount.toLocaleString(intlLocale())} / {comment.dislikesCount.toLocaleString(intlLocale())}</Fact>
            {comment.isPinned ? <Fact label={txa('Durum')}><span className="inline-flex items-center gap-1"><Pin className="size-3.5" />{txa('Sabitlenmiş')}</span></Fact> : null}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Yazar geçmişi')}</h3>
          <p className={cn('text-[12.5px]', removedByAuthor >= 2 ? 'text-rose-600 dark:text-rose-300' : 'text-muted-foreground')} data-testid="admin-comments-author-history">
            {removedByAuthor > 0
              ? txa('Bu üyenin daha önce kaldırılmış {v1} yorumu var.', { v1: removedByAuthor.toLocaleString(intlLocale()) })
              : txa('Bu üyenin kaldırılmış yorumu yok.')}
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Dikkat noktaları')}</h3>
          {signals.length ? (
            <ul className="flex flex-col gap-1.5" data-testid="admin-comments-signals">
              {signals.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                  {item === 'links' ? <Link2 className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <AlertTriangle className={cn('mt-0.5 size-3.5 shrink-0', item === 'abuse' ? 'text-rose-500' : 'text-amber-500')} />}
                  {commentSignalHint(item, comment)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">{txa('Otomatik bir dikkat noktası yok; tonu ve bağlamı yine de kendin değerlendir.')}</p>
          )}
        </section>
      </div>

      {layout === 'sheet' ? (
        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">{actions}</footer>
      ) : (
        <footer className="border-t border-border/60 px-5 py-2 text-[11.5px] text-muted-foreground">{txa('Listede ↑ ↓ ile gezebilirsin')}</footer>
      )}
    </section>
  )
}

export default AdminCommentModerationSection
