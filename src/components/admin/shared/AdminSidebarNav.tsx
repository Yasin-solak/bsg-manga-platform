import { ArrowLeft, CheckCircle2, ChevronsLeft, ChevronsRight, Inbox, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  ADMIN_NAV_GROUP_ORDER,
  adminNavGroupLabel,
  filterAdminNavItems,
  pickBusiestQueue,
  type AdminNavItem,
} from '@/pages/admin/adminNavigation'
import type { AdminSection } from '@/pages/admin/adminPageUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export interface AdminSidebarIdentity {
  username: string
  avatarUrl?: string | null
  roleLabel: string
}

interface AdminSidebarNavProps {
  items: AdminNavItem[]
  activeItemId: AdminSection
  onSelect: (section: AdminSection) => void
  identity: AdminSidebarIdentity
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K'

function formatBadge(value: number) {
  return value > 999 ? '999+' : value.toLocaleString(intlLocale())
}

function CollapsedTip({ label, open, children }: { label: string, open: boolean, children: ReactNode }) {
  if (open) return <>{children}</>
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * AdminSidebarNav v2: identity card (admin + pending work strip), a "quick jump" search
 * focused with Ctrl/Cmd+K, sections grouped by workflow and
 * return to site / collapse at the bottom. No submenus: sections have their own tabs.
 */
export function AdminSidebarNav({ items, activeItemId, onSelect, identity }: AdminSidebarNavProps) {
  const { open, setOpen, isMobile, setOpenMobile, toggleSidebar } = useSidebar()
  const expanded = open || isMobile
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const searching = query.trim().length > 0
  const visibleItems = useMemo(() => filterAdminNavItems(items, query), [items, query])
  // In search a single ordered list replaces groups: the first row is where Enter goes.
  const groups = useMemo(() => (searching
    ? [{ id: 'results', label: txa('Sonuçlar'), items: visibleItems }]
    : ADMIN_NAV_GROUP_ORDER
      .map((group) => ({ id: group, label: adminNavGroupLabel(group), items: visibleItems.filter((item) => item.group === group) }))
  ).filter((group) => group.items.length > 0), [searching, visibleItems])

  const workItems = items.filter((item) => !item.inactive && (item.badge ?? 0) > 0)
  const pendingTotal = workItems.reduce((sum, item) => sum + (item.badge ?? 0), 0)
  const urgentTotal = workItems.filter((item) => item.urgent).reduce((sum, item) => sum + (item.badge ?? 0), 0)
  const busiest = pickBusiestQueue(items)

  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus(), 80)

  const select = (item: AdminNavItem) => {
    onSelect(item.id)
    setQuery('')
    if (isMobile) setOpenMobile(false)
  }

  // Ctrl/Cmd+K: focus the quick jump field; expand first if collapsed.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      if (isMobile) setOpenMobile(true)
      else if (!open) setOpen(true)
      focusSearch()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, open, setOpen, setOpenMobile])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="admin-sidebar">
      <SidebarHeader className={cn('gap-2 p-3', !expanded && 'items-center px-2', isMobile && 'pr-11')}>
        <div className={cn(expanded && 'overflow-hidden rounded-2xl border border-border/70 bg-card/60')}>
          <div className={cn('flex items-center gap-3', expanded ? 'p-2.5' : 'flex-col')}>
            <span className={cn('relative flex flex-none items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary ring-2 ring-primary/25', expanded ? 'size-10' : 'size-9')}>
              {identity.avatarUrl
                ? <img src={identity.avatarUrl} alt="" className="size-full object-cover" />
                : <ShieldCheck className="h-5 w-5" />}
            </span>
            {expanded && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold leading-tight text-foreground">{txa('Yönetim paneli')}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">@{identity.username} · {identity.roleLabel}</span>
              </span>
            )}
          </div>

          <CollapsedTip
            label={pendingTotal ? txa('{v1} bekleyen iş{v2}', { v1: pendingTotal, v2: urgentTotal ? txa(' · {v1} acil', { v1: urgentTotal }) : '' }) : txa('Bekleyen iş yok')}
            open={expanded}
          >
            <button
              type="button"
              disabled={!busiest}
              onClick={() => { if (busiest) select(busiest) }}
              title={busiest ? txa('En yoğun kuyruğa git: {v1}', { v1: busiest.label }) : undefined}
              data-testid="admin-queue-summary"
              className={cn(
                'flex w-full items-center gap-2 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-default',
                expanded ? 'border-t border-border/60 px-3 py-2' : 'justify-center rounded-xl border border-border/70 p-2',
              )}
            >
              {pendingTotal
                ? <Inbox className={cn('h-4 w-4 shrink-0', urgentTotal ? 'text-rose-500' : 'text-amber-500')} />
                : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
              {expanded && (pendingTotal ? (
                <>
                  <span className="text-[13px] font-bold tabular-nums text-foreground">{pendingTotal.toLocaleString(intlLocale())}</span>
                  <span className="text-[11px] text-muted-foreground">{txa('bekleyen iş')}</span>
                  {urgentTotal > 0 && (
                    <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600 dark:text-rose-300">
                      {txa('{v1} acil', { v1: urgentTotal.toLocaleString(intlLocale()) })}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[12px] text-muted-foreground">{txa('Kuyruklar boş')}</span>
              ))}
            </button>
          </CollapsedTip>
        </div>

        {expanded ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && visibleItems[0]) {
                  event.preventDefault()
                  select(visibleItems[0])
                } else if (event.key === 'Escape') {
                  setQuery('')
                  event.currentTarget.blur()
                }
              }}
              placeholder={txa('Hızlı geç…')}
              aria-label={txa('Bölüm ara')}
              data-testid="admin-nav-search"
              className="h-8 pl-8 pr-14 text-[13px]"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {SHORTCUT_LABEL}
            </kbd>
          </div>
        ) : (
          <CollapsedTip label={txa('Hızlı geç ({v1})', { v1: SHORTCUT_LABEL })} open={false}>
            <button
              type="button"
              aria-label={txa('Bölüm ara')}
              onClick={() => { setOpen(true); focusSearch() }}
              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
          </CollapsedTip>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        <nav aria-label={txa('Yönetim bölümleri')}>
          {groups.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              {txa('Eşleşen bölüm yok.')}
              <button type="button" className="mt-1 block w-full font-semibold text-primary hover:underline" onClick={() => setQuery('')}>{txa('Aramayı temizle')}</button>
            </div>
          )}
          {groups.map((group) => (
            <SidebarGroup key={group.id} className="py-1">
              {expanded && group.label && (
                <SidebarGroupLabel className="flex h-6 items-center px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item, index) => {
                    const isActive = activeItemId === item.id
                    const isFirstResult = searching && index === 0
                    const badge = item.inactive ? 0 : item.badge ?? 0
                    return (
                      <SidebarMenuItem key={item.id}>
                        <CollapsedTip label={badge ? `${item.label} (${formatBadge(badge)})` : item.inactive ? txa('{v1} (kapalı)', { v1: item.label }) : item.label} open={expanded}>
                          <SidebarMenuButton
                            type="button"
                            isActive={isActive}
                            aria-current={isActive ? 'page' : undefined}
                            title={expanded ? item.description : undefined}
                            data-testid={`admin-nav-${item.id}`}
                            className={cn(
                              'relative h-9 font-medium',
                              expanded ? 'justify-start' : 'justify-center px-0',
                              isActive && 'border-transparent bg-primary/10 text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                              item.inactive && 'text-muted-foreground/70',
                              isFirstResult && 'ring-1 ring-primary/40',
                            )}
                            onClick={() => select(item)}
                          >
                            <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                            {expanded && <span className="truncate">{item.label}</span>}
                            {expanded && isFirstResult && !badge && !item.inactive && (
                              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">{txa('Enter')}</kbd>
                            )}
                            {expanded && item.inactive && (
                              <span className="ml-auto rounded-full border border-border/80 px-1.5 text-[10px] font-semibold text-muted-foreground">{txa('Kapalı')}</span>
                            )}
                            {expanded && badge > 0 && (
                              <SidebarMenuBadge
                                className={cn(
                                  'font-bold',
                                  item.urgent ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
                                )}
                              >
                                {formatBadge(badge)}
                              </SidebarMenuBadge>
                            )}
                            {!expanded && badge > 0 && (
                              <span className={cn('absolute right-1.5 top-1.5 size-2 rounded-full', item.urgent ? 'bg-rose-500' : 'bg-amber-500')} />
                            )}
                          </SidebarMenuButton>
                        </CollapsedTip>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className={cn('gap-1 border-t border-sidebar-border/70 p-2', !expanded && 'items-center')}>
        <SidebarMenu>
          <SidebarMenuItem>
            <CollapsedTip label={txa('Siteye dön')} open={expanded}>
              <SidebarMenuButton asChild className={cn('text-muted-foreground hover:text-foreground', !expanded && 'justify-center')}>
                <Link to="/" data-testid="admin-nav-home">
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  {expanded && <span className="truncate">{txa('Siteye dön')}</span>}
                </Link>
              </SidebarMenuButton>
            </CollapsedTip>
          </SidebarMenuItem>
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                onClick={toggleSidebar}
                className={cn('text-muted-foreground hover:text-foreground', !expanded && 'justify-center')}
                aria-label={expanded ? txa('Kenar çubuğunu daralt') : txa('Kenar çubuğunu genişlet')}
              >
                {expanded ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
                {expanded && <span>{txa('Daralt')}</span>}
                {expanded && <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px]">{IS_MAC ? '⌘B' : 'Ctrl B'}</kbd>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </div>
  )
}
