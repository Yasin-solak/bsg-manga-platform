import { NotificationTrigger } from '@/components/notifications/NotificationTrigger'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Link, LocaleSwitchLink, useNavigate } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'
import {
  ChevronsUpDown,
  Coins,
  History,
  LogOut,
  Moon,
  Package,
  Sun,
  Settings,
  Trophy,
  User,
  Languages,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeContext } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { userService } from '@/services/userService'
import { buildInactiveFeatureMessage, showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppSidebarQuickPanels } from './appSidebar/AppSidebarQuickPanels'
import {
  blurActiveElement,
  OPEN_QUICK_PANEL_EVENT,
  type OpenQuickPanelEventDetail,
  type QuickPanelKey,
} from './appSidebar/appSidebarUtils'
import { useAppSidebarData } from './appSidebar/useAppSidebarData'
import { intlLocale, txa } from '@/i18n/activeLocale'

function resolveAccountAvatarUrl(avatar: string | undefined, username: string) {
  const normalizedAvatar = typeof avatar === 'string' ? avatar.trim() : ''
  if (normalizedAvatar) return normalizedAvatar
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || 'user')}`
}

export interface AccountTopBarActionsProps {
  /**
   * 'sidebar': left menu bottom block, user chip in front at full width,
   * bell/messages compact on the right. 'inline': a horizontal group such as the mobile strip.
   */
  variant?: 'inline' | 'sidebar'
  showCoinShortcut?: boolean
}

export function AccountTopBarActions({ variant = 'inline', showCoinShortcut = false }: AccountTopBarActionsProps = {}) {
  const isSidebar = variant === 'sidebar'
  const { currentUser, isAdmin, signOut, loading, updateCurrentUser } = useAuth()
  const { resolvedTheme, toggleTheme } = useThemeContext()
  const t = useT()
  const isDarkTheme = resolvedTheme === 'dark'
  const { isAdminResolved } = useResolvedAdminAccess(currentUser)
  const navigate = useNavigate()
  const location = useLocation()
  const [profileLevel, setProfileLevel] = useState<string | null>(null)
  const shouldPreventUserMenuRefocusRef = useRef(false)

  const accountData = useAppSidebarData({
    currentUser,
    isAdmin: isAdminResolved || isAdmin,
    updateCurrentUser,
  })
  const currentUserId = currentUser?.id
  const {
    isCoinCodeActivationEnabled,
    isUserTasksEnabled,
    loadBalance,
    loadHistory,
    loadInventory,
    setActiveQuickPanel,
    setIsNotificationOpen,
  } = accountData

  const inactiveCoinCodeMessage = buildInactiveFeatureMessage(txa('Coin kodu aktivasyonu'))
  const inactiveUserTasksMessage = buildInactiveFeatureMessage(txa('Kullanıcı görev sistemi'))

  useEffect(() => {
    setIsNotificationOpen(false)
    setActiveQuickPanel(null)
  }, [
    location.hash,
    location.pathname,
    location.search,
    setActiveQuickPanel,
    setIsNotificationOpen,
  ])

  useEffect(() => {
    if (!currentUserId) {
      setProfileLevel(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const profile = await userService.getOwnProfileById(currentUserId)
        if (!cancelled) setProfileLevel(profile.level || null)
      } catch {
        if (!cancelled) setProfileLevel(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const openQuickPanel = useCallback((panel: QuickPanelKey) => {
    if (panel === 'redeem' && !isCoinCodeActivationEnabled) {
      showInactiveFeatureToast(txa('Coin kodu aktivasyonu'))
      return
    }
    if (panel === 'tasks' && !isUserTasksEnabled) {
      showInactiveFeatureToast(txa('Kullanıcı görev sistemi'))
      return
    }

    shouldPreventUserMenuRefocusRef.current = true
    blurActiveElement()
    setIsNotificationOpen(false)
    window.setTimeout(() => setActiveQuickPanel(panel), 0)

    if (panel === 'inventory') void loadInventory()
    if (panel === 'history') void loadHistory()
    if (panel === 'balance') void loadBalance()
  }, [
    isCoinCodeActivationEnabled,
    isUserTasksEnabled,
    loadBalance,
    loadHistory,
    loadInventory,
    setActiveQuickPanel,
    setIsNotificationOpen,
  ])

  useEffect(() => {
    const handleOpenQuickPanel = (event: Event) => {
      const detail = (event as CustomEvent<OpenQuickPanelEventDetail>).detail
      if (!detail?.panel) return
      openQuickPanel(detail.panel)
    }

    window.addEventListener(OPEN_QUICK_PANEL_EVENT, handleOpenQuickPanel as EventListener)
    return () => {
      window.removeEventListener(OPEN_QUICK_PANEL_EVENT, handleOpenQuickPanel as EventListener)
    }
  }, [openQuickPanel])

  // The home quest goes only to the visible desktop account panel.
  // The shared mz:open-quests event was also opening the hidden mobile panel.
  useEffect(() => {
    if (!isSidebar || location.pathname !== '/') return
    const handler = () => openQuickPanel('tasks')
    window.addEventListener('mz:open-desktop-home-quests', handler)
    return () => window.removeEventListener('mz:open-desktop-home-quests', handler)
  }, [isSidebar, location.pathname, openQuickPanel])

  const handleUserMenuCloseAutoFocus = (event: Event) => {
    if (!shouldPreventUserMenuRefocusRef.current) return
    event.preventDefault()
    shouldPreventUserMenuRefocusRef.current = false
  }

  const handleSignOut = async () => {
    try {
      accountData.setSigningOut(true)
      await signOut()
      navigate('/giris')
    } finally {
      accountData.setSigningOut(false)
    }
  }

  return (
    <>
      <div className={cn('flex items-center gap-2', isSidebar && 'w-full flex-col items-stretch gap-1', isSidebar && showCoinShortcut && 'dh-account')}>
        {currentUser ? (
          <>
            {isSidebar && showCoinShortcut ? (
              <button
                type="button"
                onClick={() => openQuickPanel('redeem')}
                className="flex h-9 w-full items-center gap-2 rounded-xl bg-amber-500/10 px-3 text-left hover:bg-amber-500/15"
                aria-label={txa('Coin yükle')}
                data-account-part="coin"
              >
                <Coins className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{accountData.displayedStones.toLocaleString(intlLocale())}</span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{txa('Coin yükle')}</span>
              </button>
            ) : null}
            <NotificationTrigger
              sidebar={isSidebar && !showCoinShortcut}
              open={accountData.isNotificationOpen}
              onOpenChange={accountData.setIsNotificationOpen}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-xl px-2.5 text-left transition-colors hover:bg-accent',
                    isSidebar && 'w-full min-w-0 px-2 hover:bg-sidebar-accent',
                  )}
                  aria-label={txa('Kullanıcı menüsü')}
                  data-account-part="user"
                >
                  <img
                    src={resolveAccountAvatarUrl(currentUser.avatar, currentUser.username)}
                    alt=""
                    loading="eager"
                    decoding="async"
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                  <span className={cn('hidden min-w-0 sm:block', isSidebar && 'block flex-1')}>
                    <span className={cn('block max-w-28 truncate text-sm font-semibold leading-tight text-foreground', isSidebar && 'max-w-none')}>
                      {currentUser.username}
                    </span>
                    <span className="block truncate text-xs font-medium leading-tight text-primary">
                      {profileLevel ? txa(profileLevel) : accountData.roleLabel}
                    </span>
                  </span>
                  <ChevronsUpDown className={cn('hidden h-4 w-4 shrink-0 text-muted-foreground sm:block', isSidebar && 'block')} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isSidebar ? "top" : "bottom"}
                align="end"
                sideOffset={10}
                className="z-[80] w-56"
                onCloseAutoFocus={handleUserMenuCloseAutoFocus}
              >
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">@{currentUser.username}</p>
                  <p className="text-xs text-muted-foreground">{txa('{v1} Coin', { v1: accountData.displayedStones.toLocaleString(intlLocale()) })}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={`/profil/${encodeURIComponent(currentUser.username)}`}>
                    <User className="mr-2 h-4 w-4" />{' '}{txa('Profilim')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuickPanel('inventory')}>
                  <Package className="mr-2 h-4 w-4" />{' '}{txa('Envanter')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuickPanel('history')}>
                    <History className="mr-2 h-4 w-4" /> {txa('Okuma Geçmişi')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuickPanel('balance')}>
                  <Coins className="mr-2 h-4 w-4" />{' '}{txa('Bakiye')}
                </DropdownMenuItem>
                {!showCoinShortcut && (accountData.isCoinCodeActivationEnabled ? (
                  <DropdownMenuItem onClick={() => openQuickPanel('redeem')}>
                    <Trophy className="mr-2 h-4 w-4" />{' '}{txa('Coin Kodu')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="opacity-80"
                    title={inactiveCoinCodeMessage}
                    onClick={() => showInactiveFeatureToast(txa('Coin kodu aktivasyonu'))}
                  >
                    <Trophy className="mr-2 h-4 w-4" />{' '}{txa('Coin Kodu')}
                  </DropdownMenuItem>
                ))}
                {accountData.isUserTasksEnabled ? (
                  <DropdownMenuItem onClick={() => openQuickPanel('tasks')}>
                    <Trophy className="mr-2 h-4 w-4" /> {txa('Görevler')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="opacity-80"
                    title={inactiveUserTasksMessage}
                    onClick={() => showInactiveFeatureToast(txa('Kullanıcı görev sistemi'))}
                  >
                    <Trophy className="mr-2 h-4 w-4" /> {txa('Görevler')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { if (showCoinShortcut) navigate('/ayarlar'); else openQuickPanel('security') }}><Settings className="mr-2 h-4 w-4" /> {txa('Ayarlar')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    toggleTheme()
                  }}
                >
                  {isDarkTheme ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  {isDarkTheme ? txa('Açık tema') : txa('Koyu tema')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <LocaleSwitchLink><Languages className="mr-2 h-4 w-4" />{t('locale.switchTo')}</LocaleSwitchLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={accountData.signingOut}
                  onClick={() => {
                    void handleSignOut()
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> {accountData.signingOut ? txa('Çıkış yapılıyor...') : txa('Çıkış Yap')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : !loading ? (
          <Button asChild className={cn('h-10 rounded-lg px-4', isSidebar && 'w-full rounded-xl')}>
            <Link to="/giris">
              <User className="mr-2 h-4 w-4" />
              {txa('Giriş Yap')}
            </Link>
          </Button>
        ) : (
          <div role="status" aria-label={txa('Hesap bilgileri yükleniyor')} className={cn('flex items-center gap-2', isSidebar ? 'h-[84px] w-full' : 'h-10 w-24')}>
            <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
            <span aria-hidden="true" className="h-4 flex-1 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        )}
      </div>

      <AppSidebarQuickPanels
        desktopDesign={isSidebar && showCoinShortcut}
        activeQuickPanel={accountData.activeQuickPanel}
        adminFansubs={accountData.adminFansubs}
        applyBackground={accountData.applyBackground}
        applyFrame={accountData.applyFrame}
        balanceError={accountData.balanceError}
        balanceLoading={accountData.balanceLoading}
        balanceRows={accountData.balanceRows}
        currentUser={currentUser}
        displayedStones={accountData.displayedStones}
        fansubInventoryCount={accountData.fansubInventoryCount}
        historyError={accountData.historyError}
        historyLoading={accountData.historyLoading}
        historyRows={accountData.historyRows}
        inventoryError={accountData.inventoryError}
        inventoryLoading={accountData.inventoryLoading}
        isCoinCodeActivationEnabled={accountData.isCoinCodeActivationEnabled}
        isUserTasksEnabled={accountData.isUserTasksEnabled}
        loadInventory={accountData.loadInventory}
        ownedBadges={accountData.ownedBadges}
        personalInventoryCount={accountData.personalInventoryCount}
        personalOwnedRows={accountData.personalOwnedRows}
        resolvedBackgroundRows={accountData.resolvedBackgroundRows}
        resolvedFrameRows={accountData.resolvedFrameRows}
        resolvedPatternRows={accountData.resolvedPatternRows}
        roleLabel={accountData.roleLabel}
        selectedBackgroundIdentifier={accountData.selectedBackgroundIdentifier}
        selectedFrameIdentifier={accountData.selectedFrameIdentifier}
        setActiveQuickPanel={(panel) => {
          accountData.setActiveQuickPanel(panel)
          if (!panel && isSidebar && location.pathname === '/') window.dispatchEvent(new Event('mz:desktop-home-quests-refresh'))
        }}
        updateCurrentUserStones={accountData.updateCurrentUserStones}
        updateFansubBalance={accountData.updateFansubBalance}
      />
    </>
  )
}

export default AccountTopBarActions
