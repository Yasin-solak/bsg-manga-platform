import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Globe, ImageOff, Inbox, Library, ListX, Loader2, Lock,
  MessageSquareWarning, RefreshCw, Search, Trash2, X, type LucideIcon,
} from 'lucide-react'
import {
  clearAdminListControlOverviewCache,
  deleteAdminMangaList,
  getAdminListControlOverview,
  getAdminMangaListDetail,
  getAdminMangaListDetailFresh,
  invalidateAdminMangaListDetailCache,
  listAdminMangaListsPage,
  setAdminMangaListVisibility,
  updateAdminMangaList,
  type AdminListControlOverview,
  type AdminMangaListCommentRow,
  type AdminMangaListDetail,
  type AdminMangaListSort,
  type AdminMangaListSummary,
  type AdminMangaListView,
  type AdminMangaListVisibilityFilter,
} from '@/services/adminMangaListService'
import { setAdminModerationCommentsActive, type AdminCommentModerationItem } from '@/services/adminCommentModerationService'
import { toast } from '@/services/toastService'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { CommentRemoveDialog } from '@/components/admin/sections/comments/CommentRemoveDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ListDeleteDialog } from './mangaLists/ListDeleteDialog'
import { ListDetailPane, type ListDetailTab, type ListMetaDraft } from './mangaLists/ListDetailPane'
import { DEFAULT_LIST_CONTROL_VIEW } from './mangaLists/listControlViews'
import {
  PAGE_LIMIT,
  SORT_OPTIONS,
  VISIBILITY_FILTERS,
  collectCascadeCommentIds,
  listRelativeAge,
  toErrorText,
  type CommentVisibilityFilter,
} from './mangaLists/adminMangaListsUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Summary strip = view. Views go to the SERVER QUERY (filtering on the client would make
 * pagination and the total a lie); counts come from the server summary,
 * not the visible page.
 */
const VIEWS: Array<{ id: AdminMangaListView, label: string, icon: LucideIcon, tone: string, value: (overview: AdminListControlOverview) => number }> = [
  { id: 'all', get label() { return txa('Tümü') }, icon: Library, tone: 'bg-primary/10 text-primary', value: (overview) => overview.total },
  { id: 'private', get label() { return txa('Özel') }, icon: Lock, tone: 'bg-muted text-muted-foreground', value: (overview) => overview.privateLists },
  { id: 'empty', get label() { return txa('Boş') }, icon: ListX, tone: 'bg-amber-500/10 text-amber-500', value: (overview) => overview.emptyLists },
  { id: 'without-cover', get label() { return txa('Kapaksız') }, icon: ImageOff, tone: 'bg-amber-500/10 text-amber-500', value: (overview) => overview.withoutCover },
  { id: 'moderation', get label() { return txa('Kaldırılan yorumlu') }, icon: MessageSquareWarning, tone: 'bg-rose-500/10 text-rose-500', value: (overview) => overview.listsWithInactiveComments },
]

function toModerationItem(comment: AdminMangaListCommentRow, detail: AdminMangaListDetail): AdminCommentModerationItem {
  return {
    id: comment.id,
    source: 'list',
    entityId: detail.id,
    routeHint: `/listeler/${detail.id}`,
    contextTitle: detail.title,
    contextSubtitle: txa('Liste yorumu'),
    authorUserId: comment.authorId,
    authorUsername: comment.authorUsername,
    authorAvatarUrl: comment.authorAvatarUrl || null,
    parentId: comment.parentId,
    body: comment.body,
    isSpoiler: false,
    isActive: comment.isActive,
    isPinned: false,
    likesCount: comment.likesCount,
    dislikesCount: comment.dislikesCount,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replyCount: detail.comments.filter((entry) => entry.parentId === comment.id).length,
  }
}

/**
 * Lists v2: list desk. A paged list on the left (bulk selection), the selected
 * list's persistent context and tabs on the right (Manga / Info / Comments).
 * Removing a list comment is the same flow as the Comments page (reason + author
 * notification). Deletion is only in the "..." menu and a confirm dialog.
 */
function AdminMangaListsSection() {
  const desk = useDeskLayout()
  const [overview, setOverview] = useState<AdminListControlOverview | null>(null)
  const [lists, setLists] = useState<AdminMangaListSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeView, setActiveView] = useState<AdminMangaListView>(DEFAULT_LIST_CONTROL_VIEW)
  const [visibilityFilter, setVisibilityFilter] = useState<AdminMangaListVisibilityFilter>('all')
  const [sortBy, setSortBy] = useState<AdminMangaListSort>('newest')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<AdminMangaListSummary[] | null>(null)

  const [detail, setDetail] = useState<AdminMangaListDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [tab, setTab] = useState<ListDetailTab>('items')
  const [meta, setMeta] = useState<ListMetaDraft>({ title: '', description: '', isPublic: true })
  const [metaSaving, setMetaSaving] = useState(false)
  const [commentFilter, setCommentFilter] = useState<CommentVisibilityFilter>('all')
  const [commentSearch, setCommentSearch] = useState('')
  const [commentActionKey, setCommentActionKey] = useState<string | null>(null)
  const [removeComment, setRemoveComment] = useState<AdminMangaListCommentRow | null>(null)

  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
    setCheckedIds([])
  }, [searchTerm, visibilityFilter, sortBy, activeView])

  const loadLists = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await listAdminMangaListsPage({ page, limit: PAGE_LIMIT, search: searchTerm, visibility: visibilityFilter, sort: sortBy, view: activeView })
      setLists(result.data)
      setTotalCount(result.count)
      return true
    } catch (loadError) {
      if (!silent) {
        setLists([])
        setTotalCount(0)
        setError(toErrorText(loadError, txa('Listeler yüklenemedi.')))
      }
      return false
    } finally {
      if (!silent) setLoading(false)
    }
  }, [activeView, page, searchTerm, sortBy, visibilityFilter])

  const loadOverview = useCallback(async (silent = false) => {
    try {
      setOverview(await getAdminListControlOverview({ force: silent }))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => { void loadLists() }, [loadLists, revision])
  useEffect(() => { void loadOverview(revision > 0) }, [loadOverview, revision])

  // Same rhythm as user and manga management: silent refresh while the tab is visible.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void Promise.all([loadLists(true), loadOverview(true)])
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [loadLists, loadOverview])

  const selected = lists.find((list) => list.id === selectedId) ?? null
  const pageTotal = Math.max(1, Math.ceil(totalCount / PAGE_LIMIT))
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds])
  const checkedLists = useMemo(() => lists.filter((list) => checkedSet.has(list.id)), [checkedSet, lists])
  const pageIds = lists.map((list) => list.id)
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => checkedSet.has(id))
  const somePageChecked = pageIds.some((id) => checkedSet.has(id))

  // On desktop a selection always exists: when the selected list leaves the view, the same position opens.
  useEffect(() => {
    if (selected) {
      lastIndexRef.current = lists.indexOf(selected)
      return
    }
    if (!desk || loading) return
    const next = lists[Math.min(lastIndexRef.current, lists.length - 1)]
    setSelectedId(next ? next.id : null)
  }, [desk, lists, loading, selected])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // Details of the selected list (manga + comments), cached. On fast switching the selection is checked
  // so a late old response does not overwrite the new selection's draft.
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const loadDetail = useCallback(async (listId: string, mode: 'cached' | 'fresh' = 'cached') => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const row = mode === 'fresh' ? await getAdminMangaListDetailFresh(listId) : await getAdminMangaListDetail(listId)
      if (selectedIdRef.current !== listId) return
      setDetail(row)
      if (!row) setDetailError(txa('Liste bulunamadı.'))
      else setMeta({ title: row.title, description: row.description, isPublic: row.isPublic })
    } catch (loadError) {
      if (selectedIdRef.current === listId) setDetailError(toErrorText(loadError, txa('Liste ayrıntısı yüklenemedi.')))
    } finally {
      if (selectedIdRef.current === listId) setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDetail((current) => (current?.id === selectedId ? current : null))
    setTab('items')
    setCommentFilter('all')
    setCommentSearch('')
    void loadDetail(selectedId)
  }, [loadDetail, selectedId])

  const filteredComments = useMemo(() => {
    const comments = detail?.comments ?? []
    const query = commentSearch.trim().toLocaleLowerCase(intlLocale())
    return comments.filter((comment) => {
      if (commentFilter === 'active' && !comment.isActive) return false
      if (commentFilter === 'inactive' && comment.isActive) return false
      if (!query) return true
      return comment.body.toLocaleLowerCase(intlLocale()).includes(query) || comment.authorUsername.toLocaleLowerCase(intlLocale()).includes(query)
    })
  }, [commentFilter, commentSearch, detail?.comments])

  const select = useCallback((list: AdminMangaListSummary) => {
    setSelectedId(list.id)
    if (!desk) setSheetOpen(true)
  }, [desk])

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = selected ? lists.indexOf(selected) : -1
    const next = lists[Math.max(0, Math.min(lists.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setSelectedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-list-id="${next.id}"]`)?.focus())
  }

  const refreshAfterMutation = async () => {
    clearAdminListControlOverviewCache()
    await Promise.all([loadLists(true), loadOverview(true)])
  }

  const patchList = (listId: string, patch: Partial<AdminMangaListSummary>) => {
    setLists((previous) => previous.map((list) => (list.id === listId ? { ...list, ...patch } : list)))
    setDetail((previous) => (previous && previous.id === listId ? { ...previous, ...patch } : previous))
  }

  const setVisibility = async (targets: AdminMangaListSummary[], isPublic: boolean) => {
    const candidates = targets.filter((list) => list.isPublic !== isPublic)
    if (!candidates.length) return
    setBusyKey(candidates.length === 1 ? candidates[0].id : 'bulk')
    try {
      const results = await Promise.allSettled(candidates.map((list) => setAdminMangaListVisibility(list.id, isPublic)))
      const done = candidates.filter((_, index) => results[index].status === 'fulfilled')
      done.forEach((list) => {
        invalidateAdminMangaListDetailCache(list.id)
        patchList(list.id, { isPublic })
      })
      if (selectedId && done.some((list) => list.id === selectedId)) setMeta((current) => ({ ...current, isPublic }))
      setCheckedIds((previous) => previous.filter((id) => !done.some((list) => list.id === id)))
      await refreshAfterMutation()
      const label = isPublic ? txa('herkese açıldı') : txa('özele alındı')
      if (done.length === candidates.length) toast.success(done.length === 1 ? txa('Liste {v1}.', { v1: label }) : txa('{v1} liste {v2}.', { v1: done.length, v2: label }))
      else toast.warning(txa('{v1} liste {v2}, {v3} listede hata oluştu.', { v1: done.length, v2: label, v3: candidates.length - done.length }))
    } finally {
      setBusyKey(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTargets?.length) return
    setBusyKey('delete')
    try {
      const results = await Promise.allSettled(deleteTargets.map((list) => deleteAdminMangaList(list.id)))
      const done = deleteTargets.filter((_, index) => results[index].status === 'fulfilled')
      const doneIds = new Set(done.map((list) => list.id))
      setLists((previous) => previous.filter((list) => !doneIds.has(list.id)))
      setCheckedIds((previous) => previous.filter((id) => !doneIds.has(id)))
      if (selectedId && doneIds.has(selectedId)) {
        setSelectedId(null)
        if (!desk) setSheetOpen(false)
      }
      setDeleteTargets(null)
      if (lists.length === done.length && page > 1) setPage((current) => Math.max(1, current - 1))
      await refreshAfterMutation()
      if (done.length === deleteTargets.length) toast.success(done.length === 1 ? txa('Liste silindi.') : txa('{v1} liste silindi.', { v1: done.length }))
      else toast.warning(txa('{v1} liste silindi, {v2} listede hata oluştu.', { v1: done.length, v2: deleteTargets.length - done.length }))
    } finally {
      setBusyKey(null)
    }
  }

  const makePrivateInstead = async () => {
    if (!deleteTargets?.length) return
    const targets = deleteTargets
    setDeleteTargets(null)
    await setVisibility(targets, false)
  }

  const saveMeta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    setMetaSaving(true)
    try {
      await updateAdminMangaList({ listId: detail.id, title: meta.title, description: meta.description, isPublic: meta.isPublic })
      invalidateAdminMangaListDetailCache(detail.id)
      patchList(detail.id, { title: meta.title.trim(), description: meta.description.trim(), isPublic: meta.isPublic, updatedAt: new Date().toISOString() })
      await refreshAfterMutation()
      toast.success(txa('Liste bilgileri kaydedildi.'))
    } catch (saveError) {
      toast.error(toErrorText(saveError, txa('Liste bilgileri kaydedilemedi.')))
    } finally {
      setMetaSaving(false)
    }
  }

  const setCommentActive = async (comment: AdminMangaListCommentRow, isActive: boolean, reason?: string) => {
    if (!detail) return
    setCommentActionKey(comment.id)
    try {
      await setAdminModerationCommentsActive([toModerationItem(comment, detail)], isActive, reason)
      // Yanitlar da birlikte gizlenir / acilir (zincir).
      const cascade = collectCascadeCommentIds(detail.comments, comment.id)
      setDetail((previous) => (previous ? { ...previous, comments: previous.comments.map((entry) => (cascade.has(entry.id) ? { ...entry, isActive } : entry)) } : previous))
      invalidateAdminMangaListDetailCache(detail.id)
      setRemoveComment(null)
      await refreshAfterMutation()
      toast.success(isActive ? txa('Yorum yeniden yayında.') : txa('Yorum kaldırıldı; yazara bildirim gitti.'))
    } catch (actionError) {
      toast.error(toErrorText(actionError, txa('Yorum durumu değiştirilemedi.')))
    } finally {
      setCommentActionKey(null)
    }
  }

  const togglePage = (checked: boolean) => {
    setCheckedIds((previous) => {
      const next = new Set(previous)
      for (const id of pageIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return [...next]
    })
  }

  const detailPane = selected ? (
    <ListDetailPane
      list={selected}
      detail={detail?.id === selected.id ? detail : null}
      detailLoading={detailLoading}
      detailError={detailError}
      onRetry={() => { void loadDetail(selected.id, 'fresh') }}
      layout={desk ? 'desk' : 'sheet'}
      busy={busyKey === selected.id}
      tab={tab}
      onTabChange={setTab}
      meta={meta}
      metaSaving={metaSaving}
      onMetaChange={(patch) => setMeta((current) => ({ ...current, ...patch }))}
      onSaveMeta={(event) => { void saveMeta(event) }}
      commentFilter={commentFilter}
      commentSearch={commentSearch}
      comments={filteredComments}
      commentActionKey={commentActionKey}
      onCommentFilterChange={setCommentFilter}
      onCommentSearchChange={setCommentSearch}
      onRemoveComment={setRemoveComment}
      onRestoreComment={(comment) => { void setCommentActive(comment, true) }}
      onToggleVisibility={() => { void setVisibility([selected], !selected.isPublic) }}
      onDelete={() => setDeleteTargets([selected])}
    />
  ) : null

  const removeItem = removeComment && detail ? toModerationItem(removeComment, detail) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={loading} data-testid="admin-lists-section">
      <AdminSectionHeader
        title={txa('Listeler')}
        description={txa('Üyelerin manga listeleri: görünürlük, içerik eksikleri ve liste yorumları.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Liste özeti')} data-testid="admin-lists-metrics">
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {VIEWS.map((view) => {
            const active = activeView === view.id
            return (
              <button key={view.id} type="button" aria-pressed={active} onClick={() => setActiveView(view.id)} data-testid={`admin-lists-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', view.tone)}><view.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{overview ? view.value(overview).toLocaleString(intlLocale()) : '—'}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      {overview && overview.counterDrift > 0 ? (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-300" data-testid="admin-lists-counter-drift">
          <AlertTriangle className="size-3.5 shrink-0" />
          {txa('{v1} listede manga / yorum sayacı gerçek sayıyla uyuşmuyor; satırdaki sayı farklı olabilir, ayrıntı gerçek sayıyı gösterir.', { v1: overview.counterDrift })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={txa('Liste adı, açıklama ya da sahibi ara')} aria-label={txa('Listelerde ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        <Select value={visibilityFilter} onValueChange={(value) => setVisibilityFilter(value as AdminMangaListVisibilityFilter)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Görünürlük')}><SelectValue /></SelectTrigger>
          <SelectContent>{VISIBILITY_FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as AdminMangaListSort)}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Sıralama')}><SelectValue /></SelectTrigger>
          <SelectContent>{SORT_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      {/* Masada (xl) izgara kalan yuksekligi doldurur; liste ve ayrinti kendi icinde kayar. */}
      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-lists-workspace">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" data-testid="admin-lists-list">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 pl-4 pr-2">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={allPageChecked}
              ref={(element) => { if (element) element.indeterminate = !allPageChecked && somePageChecked }}
              onChange={(event) => togglePage(event.target.checked)}
              disabled={pageIds.length === 0}
              aria-label={txa('Bu sayfadaki listelerin tümünü seç')}
            />
            {checkedLists.length ? (
              <>
                <span className="text-[12.5px] font-semibold tabular-nums">{txa('{v1} seçili', { v1: checkedLists.length })}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full px-3 text-[12px]" disabled={Boolean(busyKey)} data-testid="admin-lists-bulk">
                      {busyKey === 'bulk' ? <Loader2 className="size-3.5 animate-spin" /> : null}{txa('Toplu işlem')}<ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem disabled={!checkedLists.some((list) => !list.isPublic)} onSelect={() => { void setVisibility(checkedLists, true) }}><Globe className="size-4" />{txa('Herkese aç')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!checkedLists.some((list) => list.isPublic)} onSelect={() => { void setVisibility(checkedLists, false) }}><Lock className="size-4" />{txa('Özele al')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTargets(checkedLists)}><Trash2 className="size-4" />{txa('Kalıcı olarak sil…')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={txa('Seçimi temizle')} onClick={() => setCheckedIds([])}><X className="size-4" /></Button>
              </>
            ) : (
              <span className="text-[12px] tabular-nums text-muted-foreground">{txa('{v1} liste', { v1: totalCount.toLocaleString(intlLocale()) })}</span>
            )}
          </div>

          {loading && lists.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : lists.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-muted-foreground" data-testid="admin-lists-empty">
              {searchTerm ? txa('Aramaya uyan liste yok.') : txa('Bu görünümde liste yok.')}
            </p>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Listeler')} onKeyDown={handleListKey} ref={listRef}>
              {lists.map((list) => {
                const active = list.id === selectedId
                return (
                  <li key={list.id} className={cn('relative flex items-stretch transition-colors hover:bg-muted/40', active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}>
                    <label className="flex shrink-0 cursor-pointer items-center pl-4 pr-1">
                      <input type="checkbox" className="size-4 accent-primary" checked={checkedSet.has(list.id)} onChange={(event) => setCheckedIds((previous) => (event.target.checked ? [...previous, list.id] : previous.filter((id) => id !== list.id)))} aria-label={txa('{v1} listesini seç', { v1: list.title })} />
                    </label>
                    <button
                      type="button"
                      onClick={() => select(list)}
                      aria-current={active ? 'true' : undefined}
                      data-list-id={list.id}
                      data-testid={`admin-lists-row-${list.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-2 pr-4 text-left outline-none focus-visible:bg-muted/50"
                    >
                      {list.coverImageUrl
                        ? <img src={list.coverImageUrl} alt="" loading="lazy" decoding="async" className="h-11 w-8 shrink-0 rounded-md border border-border bg-muted object-cover" />
                        : <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/60" title={txa('Kapak seçilmemiş')}><ImageOff className="size-3.5" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {!list.isPublic ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={txa('Özel')} /> : null}
                          <span className="truncate text-[13px] font-semibold text-foreground">{list.title}</span>
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <span className="min-w-0 truncate">
                            <AdminEntityHoverCard kind="user" entityKey={list.ownerId || null} focusable={false}>@{list.ownerUsername}</AdminEntityHoverCard>
                            {' · '}{list.itemsCount === 0 ? <span className="text-amber-700 dark:text-amber-300">{txa('boş')}</span> : `${list.itemsCount} manga`}
                            {list.commentsCount > 0 ? txa(' · {v1} yorum', { v1: list.commentsCount }) : ''}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">{listRelativeAge(list.updatedAt)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {totalCount > PAGE_LIMIT ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{(page - 1) * PAGE_LIMIT + 1}–{Math.min(totalCount, page * PAGE_LIMIT)} / {totalCount.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || page >= pageTotal} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detailPane ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir liste seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{selected?.title ?? txa('Liste ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Liste içeriği, bilgileri ve yorumları.')}</SheetDescription>
            {detailPane}
          </SheetContent>
        </Sheet>
      ) : null}

      <ListDeleteDialog
        lists={deleteTargets}
        busy={busyKey === 'delete' || busyKey === 'bulk'}
        onCancel={() => setDeleteTargets(null)}
        onMakePrivateInstead={() => { void makePrivateInstead() }}
        onConfirm={() => { void confirmDelete() }}
      />
      <CommentRemoveDialog
        comment={removeItem}
        busy={Boolean(removeComment && commentActionKey === removeComment.id)}
        onCancel={() => setRemoveComment(null)}
        onConfirm={(reason) => { if (removeComment) void setCommentActive(removeComment, false, reason) }}
      />
    </section>
  )
}

export default AdminMangaListsSection
