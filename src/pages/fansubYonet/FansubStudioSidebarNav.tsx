import { ArrowLeft, ChevronsLeft, ChevronsRight, Coins, ExternalLink, Languages, MessagesSquare, Rocket, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import { cn } from '@/lib/utils'
import { buildPublicFansubPath } from '@/lib/routes'
import type { Fansub } from '@/types'
import { roleLabel, type FansubRole, type FansubYonetTab } from './useFansubYonetState'
import {
  buildFansubStudioNavItems,
  FANSUB_STUDIO_GROUP_ORDER,
  fansubStudioGroupLabel,
  type FansubStudioNavGroup,
  type FansubStudioNavItem,
} from './fansubStudioNavigation'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubStudioSidebarNavProps {
  fansubId: string
  fansubSlug?: string
  fansubName: string
  fansub: Fansub
  myRole: FansubRole
  activeTab: FansubYonetTab
  onTabChange: (tab: FansubYonetTab) => void
  /** Fansub kasasinin guncel coin bakiyesi. */
  coinBalance: number
  /** Chapters pending approval (sidebar attention badge). */
  pendingChapters: number
  /** Pending work on the community server (application + report). */
  pendingCommunity: number
  /** Bekleyen ekip katilim basvurusu sayisi. */
  pendingJoinRequests: number
  showBoostManageTab: boolean
  /** Takviye seviye etiketi (or. "Seviye 2"); takviye kapaliysa null. */
  tierLabel?: string | null
  /** Gorunur isim stili (takviye kapisindan gecmis). */
  visibleNameStyle?: Record<string, unknown> | null
  /** Avatar halkasi (takviye cercevesi) sinifi. */
  avatarRingClass?: string
  /** 'Go to server' shortcut if a community v2 server exists. */
  communityServerId?: string | null
  /** Translation Studio V3 entry (flag on or site admin). */
  showTranslationStudio?: boolean
  /** The user's fansub permissions: only permitted tabs show. */
  permissions?: ReadonlySet<string>
  showRolesTab?: boolean
}

function CollapsedTip({ label, open, children }: { label: string; open: boolean; children: ReactNode }) {
  if (open) return <>{children}</>
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  )
}

function FooterLink({ to, icon: Icon, label, open, testId }: { to: string; icon: LucideIcon; label: string; open: boolean; testId?: string }) {
  return (
    <SidebarMenuItem>
      <CollapsedTip label={label} open={open}>
        <SidebarMenuButton asChild className={cn('text-muted-foreground hover:text-foreground', !open && 'justify-center')}>
          <Link to={to} data-testid={testId}>
            <Icon className="h-4 w-4 shrink-0" />
            {open && <span className="truncate">{label}</span>}
          </Link>
        </SidebarMenuButton>
      </CollapsedTip>
    </SidebarMenuItem>
  )
}

/**
 * FansubStudioSidebarNav v2: identity card (name + name style, role, boost level,
 * vault), tabs grouped by workflow and studio exit links at the bottom.
 */
export function FansubStudioSidebarNav({
  fansubId,
  fansubSlug,
  fansubName,
  fansub,
  myRole,
  activeTab,
  onTabChange,
  coinBalance,
  pendingChapters,
  pendingCommunity,
  pendingJoinRequests,
  showBoostManageTab,
  tierLabel,
  visibleNameStyle,
  avatarRingClass = 'ring-border/70',
  communityServerId,
  showTranslationStudio = false,
  permissions,
  showRolesTab = false,
}: FansubStudioSidebarNavProps) {
  const { open, isMobile, setOpenMobile, toggleSidebar } = useSidebar()
  const expanded = open || isMobile
  const publicFansubHref = buildPublicFansubPath({ id: fansubId, slug: fansubSlug })
  const translationStudioHref = `/fansub/${encodeURIComponent(fansubSlug || fansubId)}/studyo`
  const name = resolveFansubNameStylePresentation(visibleNameStyle, { displaySize: false })

  const items = useMemo(
    () => buildFansubStudioNavItems({
      pendingChapters,
      pendingCommunity,
      pendingJoinRequests,
      showBoostManageTab,
      permissions,
      showRolesTab,
    }),
    [pendingChapters, pendingCommunity, pendingJoinRequests, showBoostManageTab, permissions, showRolesTab],
  )

  const groups = useMemo(() => FANSUB_STUDIO_GROUP_ORDER
    .map((group) => ({ id: group, items: items.filter((item) => item.group === group) }))
    .filter((group): group is { id: FansubStudioNavGroup; items: FansubStudioNavItem[] } => group.items.length > 0), [items])

  const canOpenKasa = items.some((item) => item.id === 'kasa')

  const handleSelect = (tab: FansubYonetTab) => {
    onTabChange(tab)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="fansub-studio-sidebar">
      {/* Kimlik karti: avatar + ad + rol satiri; altta kasa ve takviye seviyesi tek seritte. */}
      <SidebarHeader className={cn('p-3', !expanded && 'items-center gap-2 px-2')}>
        <div className={cn(expanded && 'overflow-hidden rounded-2xl border border-border/70 bg-card/60')}>
          <div className={cn('flex items-center gap-3', expanded ? 'p-2.5' : 'flex-col')}>
            <span className={cn('relative flex-none overflow-hidden rounded-xl bg-muted ring-2', avatarRingClass, expanded ? 'size-10' : 'size-9')}>
              {fansub.avatar
                ? <img src={fansub.avatar} alt="" className="size-full object-cover" />
                : <span className="flex size-full items-center justify-center text-xs font-bold">{fansubName.slice(0, 2).toUpperCase()}</span>}
            </span>
            {expanded && (
              <span className="min-w-0 flex-1">
                {/* Isim stili acik temada okunmayabildigi icin stil yalniz koyu temada uygulanir. */}
                <span className="block truncate text-[14px] font-bold leading-tight text-foreground dark:hidden">{fansubName}</span>
                <span className={cn('hidden truncate text-[14px] font-bold leading-tight text-foreground dark:block', name.className)} style={name.inlineStyle}>
                  {fansubName}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{txa('Fansub stüdyosu · {v1}', { v1: roleLabel(myRole) })}</span>
              </span>
            )}
          </div>

          <CollapsedTip label={`Kasa: ${coinBalance.toLocaleString(intlLocale())} coin`} open={expanded}>
            <button
              type="button"
              disabled={!canOpenKasa}
              onClick={() => handleSelect('kasa')}
              className={cn(
                'flex w-full items-center gap-2 text-left transition-colors enabled:hover:bg-amber-500/10 disabled:cursor-default',
                expanded ? 'border-t border-border/60 px-3 py-2' : 'justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-2',
              )}
            >
              <Coins className="h-4 w-4 shrink-0 text-amber-500" />
              {expanded && (
                <>
                  <span className="text-[13px] font-bold tabular-nums text-foreground">{coinBalance.toLocaleString(intlLocale())}</span>
                  <span className="text-[11px] text-muted-foreground">coin</span>
                  {tierLabel && (
                    <span className="ml-auto inline-flex max-w-[55%] items-center gap-1 truncate rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
                      <Rocket className="h-3 w-3 flex-none" />
                      <span className="truncate">{tierLabel}</span>
                    </span>
                  )}
                </>
              )}
            </button>
          </CollapsedTip>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        <nav aria-label={txa('Stüdyo bölümleri')}>
          {groups.map((group) => (
            <SidebarGroup key={group.id} className="py-1">
              {expanded && fansubStudioGroupLabel(group.id) && (
                <SidebarGroupLabel className="flex h-6 items-center px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {fansubStudioGroupLabel(group.id)}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = activeTab === item.id
                    return (
                      <SidebarMenuItem key={item.id}>
                        <CollapsedTip label={item.badge ? `${item.label} (${item.badge})` : item.label} open={expanded}>
                          <SidebarMenuButton
                            type="button"
                            isActive={isActive}
                            aria-current={isActive ? 'page' : undefined}
                            data-testid={`fansub-studio-nav-${item.id}`}
                            className={cn(
                              'relative h-9 font-medium',
                              expanded ? 'justify-start' : 'justify-center px-0',
                              isActive && 'border-transparent bg-primary/10 text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                            )}
                            onClick={() => handleSelect(item.id)}
                          >
                            <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                            {expanded && <span className="truncate">{item.label}</span>}
                            {expanded && typeof item.badge === 'number' && (
                              <SidebarMenuBadge className="bg-amber-500/15 font-bold text-amber-600 dark:text-amber-300">
                                {item.badge}
                              </SidebarMenuBadge>
                            )}
                            {!expanded && item.badge ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500" /> : null}
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
          {showTranslationStudio && (
            <FooterLink to={translationStudioHref} icon={Languages} label={txa('Çeviri Stüdyosu')} open={expanded} testId="fansub-translation-studio-link" />
          )}
          {communityServerId && (
            <FooterLink to={`/topluluk?sunucu=${encodeURIComponent(communityServerId)}`} icon={MessagesSquare} label={txa('Sunucuya git')} open={expanded} />
          )}
          <FooterLink to={publicFansubHref} icon={ExternalLink} label={txa('Profili görüntüle')} open={expanded} />
          <FooterLink to="/" icon={ArrowLeft} label={txa('Siteye dön')} open={expanded} />
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
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </div>
  )
}
