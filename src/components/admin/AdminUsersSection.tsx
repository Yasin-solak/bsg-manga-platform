import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from '@/i18n/router'
import {
  Activity, Ban, BadgeCheck, ChevronLeft, ChevronRight, Inbox, RefreshCw, Search, Shield, ShieldAlert, ShieldOff, Sparkles, Users, X,
  type LucideIcon,
} from 'lucide-react'
import {
  fetchAdminUserPreview,
  getAdminUserOverview,
  invalidateAdminUserDetailCache,
  invalidateAdminUserInsightsCache,
  listAdminUsersPage,
  setAdminUsersBanState,
  updateAdminUserRole,
  type AdminManagedUser,
  type AdminUserFansubFilter,
  type AdminUserOverview,
  type AdminUserPageCursor,
  type AdminUserRole,
  type AdminUserRoleFilter,
} from '@/services/adminUserService'
import { toast } from '@/services/toastService'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import AdminUserDetailModal from './users/AdminUserDetailModal'
import { AdminUserBanDialog } from './users/AdminUserBanDialog'
import type { AdminUserDetailTab } from './users/adminUserDetailTabs'
import {
  ROLE_FILTERS,
  TRUST_FILTERS,
  VERIFICATION_FILTERS,
  formatRelativeTime,
  getUserDisplayName,
  getUserTrust,
  roleLabel,
  toErrorText,
  type AdminManagedUserView,
  type AdminUserTrustFilter,
  type AdminUserVerificationFilter,
} from './users/adminUsersUtils'
import { UserAvatar, UserDetailPane, UserTag } from './users/UserDetailPane'
import {
  DEFAULT_USERS_VIEW,
  ROLE_OPTIONS,
  USERS_PER_PAGE,
  USERS_VIEW_OPTIONS,
  roleTone,
  type AdminUsersView,
} from './users/usersSectionViews'
import { intlLocale, txa } from '@/i18n/activeLocale'

const VIEW_STYLE: Record<AdminUsersView, { icon: LucideIcon, tone: string }> = {
  all: { icon: Users, tone: 'bg-primary/10 text-primary' },
  new: { icon: Sparkles, tone: 'bg-sky-500/10 text-sky-500' },
  staff: { icon: Shield, tone: 'bg-violet-500/10 text-violet-500' },
  review: { icon: ShieldAlert, tone: 'bg-amber-500/10 text-amber-500' },
  banned: { icon: Ban, tone: 'bg-rose-500/10 text-rose-500' },
}

const FANSUB_FILTERS: Array<[AdminUserFansubFilter, string]> = [
  ['all', 'Ekip durumu'],
  ['member', 'Ekip üyesi'],
  ['none', 'Ekipsiz'],
]

function Tick({ checked, indeterminate = false, label, onChange }: { checked: boolean, indeterminate?: boolean, label: string, onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => { if (node) node.indeterminate = indeterminate }}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer accent-primary"
    />
  )
}

interface AdminUsersSectionProps {
  currentUserId?: string
}

/**
 * Users v2: user desk. The list is paged and filtered on the server
 * (list_admin_user_management_page_v2, cursor based); the selected account is on the
 * right, in a drawer on narrow screens. Activity, reading, comments, ownership and
 * moderation history are in a detail window. Role, ban and bulk actions pass through dialogs
 * explaining the result.
 */
function AdminUsersSection({ currentUserId }: AdminUsersSectionProps) {
  const desk = useDeskLayout()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [listError, setListError] = useState('')
  const [users, setUsers] = useState<AdminManagedUserView[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [overview, setOverview] = useState<AdminUserOverview | null>(null)
  const [hasNext, setHasNext] = useState(false)

  const [page, setPage] = useState(1)
  const [cursorByPage, setCursorByPage] = useState<Record<number, AdminUserPageCursor | undefined>>({})
  /*
   * A search from `?q=` is SEEDED: boxes in the Operations panel open a door here.
   * Lazy initializer on purpose: read only on mount.
   */
  const [searchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q')?.trim() ?? '')
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q')?.trim() ?? '')
  const [activeView, setActiveView] = useState<AdminUsersView>(DEFAULT_USERS_VIEW)
  const [roleFilter, setRoleFilter] = useState<AdminUserRoleFilter>('all')
  const [fansubFilter, setFansubFilter] = useState<AdminUserFansubFilter>('all')
  const [verificationFilter, setVerificationFilter] = useState<AdminUserVerificationFilter>('all')
  const [trustFilter, setTrustFilter] = useState<AdminUserTrustFilter>('all')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<AdminManagedUserView | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [detailModalUser, setDetailModalUser] = useState<AdminManagedUserView | null>(null)
  const [detailInitialTab, setDetailInitialTab] = useState<AdminUserDetailTab>('profil')

  const [banDialogUsers, setBanDialogUsers] = useState<AdminManagedUserView[]>([])
  const [banReasonDraft, setBanReasonDraft] = useState('')
  const [banUntilDraft, setBanUntilDraft] = useState('')
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const lastIndexRef = useRef(0)
  const focusedIdRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const currentCursor = cursorByPage[page]
  const totalPages = Math.max(1, Math.ceil(totalCount / USERS_PER_PAGE))
  const listed = users.find((user) => user.id === focusedId) ?? null
  const focused = listed ? (preview?.id === listed.id ? preview : listed) : null

  const resetPagination = useCallback(() => {
    setPage(1)
    setCursorByPage({})
    setSelectedIds(new Set())
  }, [])

  // The search box searches on the server as you type (with a short delay).
  useEffect(() => {
    const next = searchInput.trim()
    if (next === searchTerm) return undefined
    const handle = window.setTimeout(() => {
      setSearchTerm(next)
      resetPagination()
    }, 300)
    return () => window.clearTimeout(handle)
  }, [resetPagination, searchInput, searchTerm])

  const refreshOverview = useCallback(async (silent = false) => {
    try {
      setOverview(await getAdminUserOverview())
      return true
    } catch (error) {
      if (!silent) toast.error(toErrorText(error, txa('Kullanıcı özeti yüklenemedi.')))
      return false
    }
  }, [])

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await listAdminUsersPage({
        page,
        limit: USERS_PER_PAGE,
        cursor: currentCursor,
        search: searchTerm,
        view: activeView,
        role: roleFilter,
        verification: verificationFilter,
        trust: trustFilter,
        fansub: fansubFilter,
      })
      setUsers(result.data)
      setTotalCount(result.count)
      setHasNext(result.hasNext)
      setListError('')
      if (result.nextCursor) {
        setCursorByPage((previous) => {
          const existing = previous[page + 1]
          if (existing?.createdAt === result.nextCursor?.createdAt && existing?.userId === result.nextCursor?.userId) return previous
          return { ...previous, [page + 1]: result.nextCursor }
        })
      }
      return true
    } catch (error) {
      setListError(toErrorText(error, txa('Kullanıcı listesi yüklenemedi.')))
      return false
    } finally {
      if (!silent) setLoading(false)
    }
  }, [activeView, currentCursor, fansubFilter, page, roleFilter, searchTerm, trustFilter, verificationFilter])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void Promise.all([loadUsers(true), refreshOverview(true)])
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [loadUsers, refreshOverview])

  // On desktop a selection always exists: when the selected account leaves the view, the same position opens.
  useEffect(() => {
    if (listed) {
      lastIndexRef.current = users.indexOf(listed)
      return
    }
    if (!desk || loading) return
    const next = users[Math.min(lastIndexRef.current, users.length - 1)]
    if (next) setFocusedId(next.id)
  }, [desk, listed, loading, users])

  // The selected account's current summary (last activity, team) is fetched separately; the list row is a fallback.
  const loadPreview = useCallback(async (userId: string) => {
    setPreviewLoadingId(userId)
    try {
      const fresh = await fetchAdminUserPreview(userId)
      if (focusedIdRef.current === userId) setPreview(fresh)
    } catch {
      // Liste ozeti kullanilabilir kaldigi icin onizleme hatasi paneli kapatmaz.
    } finally {
      setPreviewLoadingId((current) => (current === userId ? null : current))
    }
  }, [])
  useEffect(() => {
    focusedIdRef.current = focusedId
    if (!focusedId) return undefined
    const handle = window.setTimeout(() => { void loadPreview(focusedId) }, 150)
    return () => window.clearTimeout(handle)
  }, [focusedId, loadPreview])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  const selectedUsers = useMemo(() => users.filter((user) => selectedIds.has(user.id)), [selectedIds, users])
  const allOnPageSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id))
  const filtersActive = roleFilter !== 'all' || fansubFilter !== 'all' || verificationFilter !== 'all' || trustFilter !== 'all'

  const select = (user: AdminManagedUserView) => {
    setFocusedId(user.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = listed ? users.indexOf(listed) : -1
    const next = users[Math.max(0, Math.min(users.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setFocusedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-user-id="${next.id}"]`)?.focus())
  }

  const setView = (view: AdminUsersView) => {
    setActiveView(view)
    resetPagination()
  }

  const clearFilters = () => {
    setRoleFilter('all')
    setFansubFilter('all')
    setVerificationFilter('all')
    setTrustFilter('all')
    resetPagination()
  }

  const toggleSelected = (userId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds(checked ? new Set(users.map((user) => user.id)) : new Set())
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const [usersRefreshed, overviewRefreshed] = await Promise.all([loadUsers(true), refreshOverview(true)])
      if (focusedId) void loadPreview(focusedId)
      if (!usersRefreshed || !overviewRefreshed) toast.warning(txa('Bazı veriler yenilenemedi; son başarılı görünüm korunuyor.'))
    } finally {
      setRefreshing(false)
    }
  }

  const afterMutation = async (userIds: string[]) => {
    userIds.forEach((id) => {
      invalidateAdminUserDetailCache(id)
      invalidateAdminUserInsightsCache(id)
    })
    await Promise.all([loadUsers(true), refreshOverview(true)])
    if (focusedId && userIds.includes(focusedId)) void loadPreview(focusedId)
    if (detailModalUser && userIds.includes(detailModalUser.id)) {
      try {
        setDetailModalUser(await fetchAdminUserPreview(detailModalUser.id))
      } catch {
        // Detay penceresi kendi son basarili verisini korur.
      }
    }
  }

  const changeRole = (user: AdminManagedUserView, nextRole: AdminUserRole) => {
    if (user.role === nextRole) return
    if (user.id === currentUserId && nextRole !== 'admin') {
      toast.warning(txa('Kendi admin rolünü düşüremezsin.'))
      return
    }
    const option = ROLE_OPTIONS.find((entry) => entry.id === nextRole)
    setConfirm({
      title: txa('Rolü {v1} yap', { v1: roleLabel(nextRole).toLocaleLowerCase(intlLocale()) }),
      subject: txa('{v1} (@{v2}) · şu an {v3}', { v1: getUserDisplayName(user), v2: user.username, v3: roleLabel(user.role).toLocaleLowerCase(intlLocale()) }),
      consequence: option?.consequence ?? '',
      confirmLabel: txa('Rolü değiştir'),
      destructive: nextRole === 'admin',
      run: async () => {
        setActionLoadingKey(`${user.id}:role`)
        try {
          await updateAdminUserRole(user.id, nextRole)
          await afterMutation([user.id])
          toast.success(txa('@{v1} artık {v2}.', { v1: user.username, v2: roleLabel(nextRole).toLocaleLowerCase(intlLocale()) }))
        } catch (error) {
          toast.error(toErrorText(error, txa('Rol güncellenemedi.')))
        } finally {
          setActionLoadingKey(null)
        }
      },
    })
  }

  const bulkChangeRole = (nextRole: AdminUserRole) => {
    const targets = selectedUsers.filter((user) => user.role !== nextRole && !(user.id === currentUserId && nextRole !== 'admin'))
    if (targets.length === 0) {
      toast.warning(txa('Seçili hesapların hepsi zaten bu rolde ya da değiştirilemez.'))
      return
    }
    setConfirm({
      title: txa('{v1} hesabın rolünü {v2} yap', { v1: targets.length, v2: roleLabel(nextRole).toLocaleLowerCase(intlLocale()) }),
      subject: targets.slice(0, 4).map((user) => `@${user.username}`).join(', ') + (targets.length > 4 ? txa(' ve {v1} hesap daha', { v1: targets.length - 4 }) : ''),
      consequence: ROLE_OPTIONS.find((entry) => entry.id === nextRole)?.consequence ?? '',
      confirmLabel: txa('Rolleri değiştir'),
      destructive: nextRole === 'admin',
      run: async () => {
        setActionLoadingKey('bulk:role')
        try {
          const results = await Promise.allSettled(targets.map((user) => updateAdminUserRole(user.id, nextRole)))
          const updated = results.filter((result): result is PromiseFulfilledResult<AdminManagedUser> => result.status === 'fulfilled')
          setSelectedIds(new Set())
          await afterMutation(updated.map((result) => result.value.id))
          if (updated.length === targets.length) toast.success(txa('{v1} hesabın rolü güncellendi.', { v1: updated.length }))
          else toast.warning(txa('{v1} hesap güncellendi, {v2} işlem tamamlanamadı.', { v1: updated.length, v2: targets.length - updated.length }))
        } finally {
          setActionLoadingKey(null)
        }
      },
    })
  }

  const openBanDialog = (targets: AdminManagedUserView[]) => {
    const eligible = targets.filter((user) => !user.isBanned && user.id !== currentUserId)
    if (eligible.length === 0) {
      toast.warning(txa('Banlanabilecek bir hesap seçilmedi.'))
      return
    }
    setBanDialogUsers(eligible)
    setBanReasonDraft('')
  }

  async function applyBanState(targets: AdminManagedUserView[], nextBanned: boolean, reason?: string, banUntil?: string) {
    const eligible = targets.filter((user) => !(nextBanned && user.id === currentUserId))
    if (eligible.length === 0) return
    setActionLoadingKey(eligible.length > 1 ? 'bulk:ban' : `${eligible[0].id}:ban`)
    try {
      const result = await setAdminUsersBanState({
        userIds: eligible.map((user) => user.id),
        isBanned: nextBanned,
        reason,
        banUntil,
      })
      setBanDialogUsers([])
      setBanReasonDraft('')
      setSelectedIds(new Set())
      await afterMutation(eligible.map((user) => user.id))
      if (result.rejected > 0) {
        toast.warning(txa('{v1} hesap güncellendi, {v2} işlem güvenlik kuralı nedeniyle reddedildi.', { v1: result.updated, v2: result.rejected }))
      } else {
        toast.success(nextBanned ? txa('{v1} hesap banlandı.', { v1: result.updated }) : txa('{v1} hesabın banı kaldırıldı.', { v1: result.updated }))
      }
    } catch (error) {
      toast.error(toErrorText(error, txa('Ban durumu değiştirilemedi.')))
    } finally {
      setActionLoadingKey(null)
    }
  }

  const askUnban = (targets: AdminManagedUserView[]) => {
    const banned = targets.filter((user) => user.isBanned)
    if (banned.length === 0) return
    setConfirm({
      title: banned.length > 1 ? txa('{v1} hesabın banını kaldır', { v1: banned.length }) : txa('Banı kaldır'),
      subject: banned.slice(0, 4).map((user) => `@${user.username}`).join(', ') + (banned.length > 4 ? txa(' ve {v1} hesap daha', { v1: banned.length - 4 }) : ''),
      consequence: txa('Hesap hemen yeniden etkinleşir. Ban kaydı moderasyon geçmişinde kalır ve güven skorunda ban geçmişi olarak sayılmaya devam eder.'),
      confirmLabel: txa('Banı kaldır'),
      run: () => applyBanState(banned, false),
    })
  }

  const toggleBan = (user: AdminManagedUserView) => {
    if (user.isBanned) askUnban([user])
    else openBanDialog([user])
  }

  async function confirmBan() {
    const reason = banReasonDraft.trim()
    if (reason.length < 3) return
    const until = banUntilDraft ? new Date(banUntilDraft).toISOString() : undefined
    await applyBanState(banDialogUsers, true, reason, until)
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const openDetail = (user: AdminManagedUserView, tab: AdminUserDetailTab) => {
    setSheetOpen(false)
    setDetailInitialTab(tab)
    setDetailModalUser(user)
  }

  const busy = actionLoadingKey !== null
  const bannableCount = selectedUsers.filter((user) => !user.isBanned && user.id !== currentUserId).length
  const bannedCount = selectedUsers.filter((user) => user.isBanned).length

  const detail = focused ? (
    <UserDetailPane
      user={focused}
      layout={desk ? 'desk' : 'sheet'}
      currentUserId={currentUserId}
      busy={busy}
      previewLoading={previewLoadingId === focused.id && preview?.id !== focused.id}
      onChangeRole={(role) => changeRole(focused, role)}
      onToggleBan={() => toggleBan(focused)}
      onOpenDetail={(tab) => openDetail(focused, tab)}
    />
  ) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={loading || refreshing} data-testid="admin-users-section">
      <AdminSectionHeader
        title={txa('Kullanıcılar')}
        description={txa('Hesaplar: rol, güven, ban ve ekip üyelikleri.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading || refreshing} onClick={() => void handleRefresh()}><RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Kullanıcı özeti')} data-testid="admin-users-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {USERS_VIEW_OPTIONS.map((view) => {
            const active = activeView === view.id
            const value = overview ? view.count(overview) : null
            const style = VIEW_STYLE[view.id]
            return (
              <button key={view.id} type="button" aria-pressed={active} onClick={() => setView(view.id)} data-testid={`admin-users-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', style.tone)}><style.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
          <div className="flex items-center gap-3 px-4 py-3" data-testid="admin-users-active">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 max-sm:hidden"><Activity className="size-[18px]" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{txa('Aktif (30 gün)')}</span>
              <span className="block text-[20px] font-black leading-tight tabular-nums">
                {overview?.activeLast30Days == null ? '—' : overview.activeLast30Days.toLocaleString(intlLocale())}
                {overview?.onlineNow ? <span className="ml-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">{txa('{v1} çevrim içi', { v1: overview.onlineNow })}</span> : null}
              </span>
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={160} placeholder={txa('Görünen ad, @kullanıcı adı, kimlik ya da e-posta')} aria-label={txa('Kullanıcılarda ara')} className="h-9 pl-9 text-[13px]" data-testid="admin-users-search" />
        </div>
        <Select value={roleFilter} onValueChange={(value) => { setRoleFilter(value as AdminUserRoleFilter); resetPagination() }}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Rol')}><SelectValue /></SelectTrigger>
          <SelectContent>{ROLE_FILTERS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={trustFilter} onValueChange={(value) => { setTrustFilter(value as AdminUserTrustFilter); resetPagination() }}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Güven bandı')}><SelectValue /></SelectTrigger>
          <SelectContent>{TRUST_FILTERS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={verificationFilter} onValueChange={(value) => { setVerificationFilter(value as AdminUserVerificationFilter); resetPagination() }}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('E-posta doğrulaması')}><SelectValue /></SelectTrigger>
          <SelectContent>{VERIFICATION_FILTERS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fansubFilter} onValueChange={(value) => { setFansubFilter(value as AdminUserFansubFilter); resetPagination() }}>
          <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Ekip üyeliği')}><SelectValue /></SelectTrigger>
          <SelectContent>{FANSUB_FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
        </Select>
        {filtersActive ? <Button size="sm" variant="ghost" className="h-9 gap-1 text-[12.5px]" onClick={clearFilters}><X className="size-3.5" />{txa('Filtreleri temizle')}</Button> : null}
      </div>

      {listError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: listError })}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-users-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {users.length > 0 ? (
            <div className="flex min-h-11 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-[12px]" data-testid="admin-users-bulk">
              <Tick checked={allOnPageSelected} indeterminate={selectedIds.size > 0 && !allOnPageSelected} label={txa('Sayfadaki hesapları seç')} onChange={toggleAllOnPage} />
              {selectedIds.size === 0 ? (
                <span className="text-muted-foreground">{txa('{v1} hesap', { v1: totalCount.toLocaleString(intlLocale()) })}</span>
              ) : (
                <>
                  <span className="font-semibold">{txa('{v1} seçili', { v1: selectedIds.size })}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={busy} data-testid="admin-users-bulk-role">{txa('Rol')}</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ROLE_OPTIONS.map((option) => <DropdownMenuItem key={option.id} onSelect={() => bulkChangeRole(option.id)}>{txa('{v1} yap…', { v1: option.label })}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {bannableCount > 0 ? <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12px] text-rose-600 dark:text-rose-300" disabled={busy} onClick={() => openBanDialog(selectedUsers)} data-testid="admin-users-bulk-ban"><Ban className="size-3.5" />{txa('Banla ({v1})', { v1: bannableCount })}</Button> : null}
                    {bannedCount > 0 ? <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12px]" disabled={busy} onClick={() => askUnban(selectedUsers)} data-testid="admin-users-bulk-unban"><ShieldOff className="size-3.5" />{txa('Banı kaldır ({v1})', { v1: bannedCount })}</Button> : null}
                    <Button size="icon-sm" variant="ghost" aria-label={txa('Seçimi temizle')} onClick={() => setSelectedIds(new Set())}><X className="size-3.5" /></Button>
                  </span>
                </>
              )}
            </div>
          ) : null}
          {loading && users.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-users-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users className="size-5" /></span>
              <span className="text-[13px] font-semibold">{searchTerm ? txa('Aramaya uyan hesap yok') : txa('Bu görünümde hesap yok')}</span>
              {activeView !== 'all' || filtersActive ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => { clearFilters(); setView('all') }}>{txa('Tüm kullanıcıları göster')}</Button> : null}
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Kullanıcılar')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-users-list">
              {users.map((user) => {
                const trust = getUserTrust(user)
                const current = user.id === focusedId
                return (
                  <li key={user.id} className={cn('relative flex items-center gap-3 pl-4 transition-colors hover:bg-muted/40', current && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}>
                    <Tick checked={selectedIds.has(user.id)} label={txa('@{v1} seç', { v1: user.username })} onChange={(checked) => toggleSelected(user.id, checked)} />
                    <button
                      type="button"
                      onClick={() => select(user)}
                      aria-current={current ? 'true' : undefined}
                      data-user-id={user.id}
                      data-testid={`admin-users-row-${user.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left outline-none focus-visible:bg-muted/50"
                    >
                      <UserAvatar user={user} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{getUserDisplayName(user)}</span>
                          {user.isVerified ? <BadgeCheck className="size-3.5 shrink-0 text-sky-500" aria-label={txa('E-posta doğrulanmış')} /> : null}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          @{user.username}{user.primaryFansub ? ` · ${user.primaryFansub.name}` : ''}
                        </span>
                        {user.role !== 'user' || user.isBanned || trust.band === 'review' || trust.band === 'low' ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {user.role !== 'user' ? <UserTag tone={roleTone(user.role)}>{roleLabel(user.role)}</UserTag> : null}
                            {user.isBanned ? <UserTag tone="rose">{txa('Banlı')}</UserTag> : null}
                            {!user.isBanned && (trust.band === 'review' || trust.band === 'low') ? <UserTag tone="amber">{txa('Güven {v1}', { v1: trust.score ?? '—' })}</UserTag> : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground" title={txa('Kayıt')}>{formatRelativeTime(user.createdAt).replace(txa(' önce'), '')}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {totalCount > USERS_PER_PAGE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{(page - 1) * USERS_PER_PAGE + 1}–{Math.min(totalCount, page * USERS_PER_PAGE)} / {totalCount.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || page <= 1} onClick={() => { setSelectedIds(new Set()); setPage(page - 1) }}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || !hasNext || page >= totalPages} onClick={() => { setSelectedIds(new Set()); setPage(page + 1) }}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir hesap seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Kullanıcı ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Hesabı incele, rolünü ya da ban durumunu değiştir.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />

      <AdminUserDetailModal
        isOpen={Boolean(detailModalUser)}
        user={detailModalUser}
        currentUserId={currentUserId}
        isBusy={busy}
        initialTab={detailInitialTab}
        onClose={() => setDetailModalUser(null)}
        onToggleBan={toggleBan}
      />

      <AdminUserBanDialog
        users={banDialogUsers}
        isOpen={banDialogUsers.length > 0}
        banReason={banReasonDraft}
        banUntil={banUntilDraft}
        isBusy={actionLoadingKey?.endsWith(':ban') === true}
        onClose={() => setBanDialogUsers([])}
        onBanReasonChange={setBanReasonDraft}
        onBanUntilChange={setBanUntilDraft}
        onConfirm={confirmBan}
      />
    </section>
  )
}

export default AdminUsersSection
