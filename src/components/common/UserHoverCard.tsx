import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  buildStandardNameTextStyleVars,
  buildNameTextStyleVars,
  getStandardNameTextClassName,
  getNameTextStyleClassName,
  resolveKnownNameTextColorId,
  resolveKnownNameTextEffectId,
  resolveKnownNameTextFontId,
} from '@/data/nameTextEffects'
import {
  buildUserNameStyleProps,
} from '@/data/userNameStyle'
import {
  resolveUserHoverDataWithMeta,
} from '@/services/hoverCardService'
import type { ResolvedUserHoverData } from '@/services/hoverCardService/types'
import { userService } from '@/services/userService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { useAuth } from '@/contexts/AuthContext'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import {
  createHydratedFollowerCountSync,
  resetHoverFollowState,
  runOptimisticHoverFollowToggle,
  syncHoverFollowerCount,
  useHoverFollowStateLoader,
} from './hoverFollowActions'
import {
  closeHoverActionMenu,
  primeHoverActionMenuOpen,
  syncHoverActionMenuOpenChange,
} from './hoverMenuActions'
import { ReportModal } from './ReportModal/ReportModal'
import { FansubHoverCard } from './FansubHoverCard'
import { MangaHoverCard } from './MangaHoverCard'
import { UserHoverCardSurface } from './UserHoverCardSurface'
import type { HoverCardThemeColors } from './hoverCardTheme'
import {
  useCurrentUserFansubMembershipLoader,
  useUserHoverBlockStateLoader,
} from './userHoverState'
import { openUserHoverReport, runUserHoverBlockToggle } from './userHoverModerationActions'
import {
  bindHoverCardPosition,
  cleanupHoverLifecycle,
  createHoverCloseHandler,
  createHoverHydrationRetry,
  isUuid,
  keepHoverOpen,
  normalizeBioText,
  registerActiveHoverCloser,
  resetHoverHydrationState,
  runHoverHydration,
  scheduleHoverClose,
  shouldRenderHoverPatternOverlay,
  syncHoverActionMenuState,
  triggerHoverOpen,
  UNIFIED_PROFILE_HOVER_CARD_WIDTH,
  unregisterActiveHoverCloser,
} from './userHoverCardShared'
import { txa } from '@/i18n/activeLocale'

const userHoverCardLogger = createScopedLogger('UserHoverCard')

export interface UserHoverCardProps {
  children: ReactNode
  id?: string
  username: string
  displayName?: string
  avatar: string
  bio?: string
  followerCount?: number
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  themeColors?: HoverCardThemeColors | null
  activeNameEffectId?: string
  activeNameFontId?: string
  activeNameColorId?: string
  activeNameSecondaryColorId?: string
  isPremiumActive?: boolean
  activeProfileEffectAssets?: StoreProfileEffectAssets
  displayedBadges?: Array<{
    id: string
    name: string
    imageUrl: string
    rarity?: string
  }>
  className?: string
  portalClassName?: string
  enableAutoHydration?: boolean
  sideOffset?: number
}

function UserHoverCard({
  children,
  id,
  username,
  displayName,
  avatar,
  bio,
  followerCount,
  frameType = 'default',
  primaryColor,
  secondaryColor,
  profileBackgroundStyle,
  profileBackgroundVideoUrl,
  profilePatternStyle,
  themeColors,
  activeNameEffectId,
  activeNameFontId,
  activeNameColorId,
  activeNameSecondaryColorId,
  isPremiumActive,
  activeProfileEffectAssets,
  displayedBadges,
  className,
  portalClassName,
  enableAutoHydration = true,
  sideOffset = 8,
}: UserHoverCardProps) {
  const { currentUser } = useAuth()
  const hoverInstanceId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [hoverPosition, setHoverPosition] = useState({ left: 0, top: 0 })
  const [hydrated, setHydrated] = useState<ResolvedUserHoverData | null>(null)
  const [isHydrationLoading, setIsHydrationLoading] = useState(false)
  const [hydrationError, setHydrationError] = useState<string | null>(null)
  const [isFollowingUser, setIsFollowingUser] = useState(false)
  const [isFollowStateLoading, setIsFollowStateLoading] = useState(false)
  const [isFollowActionLoading, setIsFollowActionLoading] = useState(false)
  const [isBlockStateLoading, setIsBlockStateLoading] = useState(false)
  const [isBlockActionLoading, setIsBlockActionLoading] = useState(false)
  const [isBlockedByCurrentUser, setIsBlockedByCurrentUser] = useState(false)
  const [displayFollowerCount, setDisplayFollowerCount] = useState(0)
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [isUserReportModalOpen, setIsUserReportModalOpen] = useState(false)
  const [currentUserFansubMemberships, setCurrentUserFansubMemberships] = useState<
    Array<{
      fansubId: string
      fansubName: string
      role: string
      teamTag?: string
    }>
  >([])
  const triggerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const openTimeoutRef = useRef<number | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)
  const hydrationRequestedRef = useRef(false)
  const hydrationAbortRef = useRef<AbortController | null>(null)
  const actionMenuOpenRef = useRef(false)

  const rawUserRef = (id || '').trim()
  const normalizedUserId = isUuid(rawUserRef) ? rawUserRef : ''
  const fallbackUsernameFromId = normalizedUserId ? '' : rawUserRef
  const resolvedUserId = (hydrated?.id || normalizedUserId || '').trim()
  const resolvedUsername = (hydrated?.username || username || fallbackUsernameFromId || '').trim()
  const resolvedDisplayName = hydrated?.displayName || displayName || resolvedUsername
  const resolvedAvatar =
    hydrated?.avatar
    || avatar
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(resolvedUsername || rawUserRef || 'user')}`
  const resolvedBio = hydrated?.bio ?? bio
  const resolvedFollowerCount = hydrated?.followerCount ?? followerCount ?? 0
  const resolvedFrameType = hydrated?.frameType || frameType || 'default'
  const resolvedPrimaryColor = hydrated?.primaryColor || primaryColor
  const resolvedProfileBackgroundStyle = hydrated?.profileBackgroundStyle || profileBackgroundStyle
  const resolvedProfileBackgroundVideoUrl = hydrated?.profileBackgroundVideoUrl || profileBackgroundVideoUrl
  const resolvedProfilePatternStyle = hydrated?.profilePatternStyle || profilePatternStyle
  const resolvedActiveNameEffectId = resolveKnownNameTextEffectId(hydrated?.activeNameEffectId || activeNameEffectId || null)
  const resolvedActiveNameFontId = resolveKnownNameTextFontId(hydrated?.activeNameFontId || activeNameFontId || null)
  const resolvedActiveNameColorId = resolveKnownNameTextColorId(hydrated?.activeNameColorId || activeNameColorId || null)
  const resolvedActiveNameSecondaryColorId = resolveKnownNameTextColorId(
    hydrated?.activeNameSecondaryColorId || activeNameSecondaryColorId || null,
  )
  const hasResolvedNameStyle = Boolean(
    resolvedActiveNameEffectId
    || resolvedActiveNameFontId
    || resolvedActiveNameColorId
    || resolvedActiveNameSecondaryColorId
  )
  const legacyNameStyleClassName = hasResolvedNameStyle
    ? getNameTextStyleClassName({
      effectId: resolvedActiveNameEffectId || undefined,
      fontId: resolvedActiveNameFontId || undefined,
      colorId: resolvedActiveNameColorId || undefined,
    })
    : getStandardNameTextClassName()
  const legacyNameStyleInlineStyle = hasResolvedNameStyle
    ? buildNameTextStyleVars(
      resolvedActiveNameColorId || undefined,
      resolvedActiveNameSecondaryColorId || undefined,
    )
    : buildStandardNameTextStyleVars()
  const resolvedThemeColors = hydrated ? (hydrated.hoverTheme ?? themeColors ?? null) : (themeColors ?? null)
  // If a full user style from the server exists (fill, effect color, motion) it is drawn; a name too
  // close in color to the card theme stays readable with a contrast shield.
  const userNameStyleProps = hydrated?.activeUserNameStyle
    ? buildUserNameStyleProps(hydrated.activeUserNameStyle, {
      guardSurfaces: resolvedThemeColors ? [resolvedThemeColors.mainColor, resolvedThemeColors.accentColor] : undefined,
    })
    : null
  const resolvedNameStyleClassName = userNameStyleProps?.className ?? legacyNameStyleClassName
  const resolvedNameStyleInlineStyle = userNameStyleProps?.style ?? legacyNameStyleInlineStyle
  const resolvedFansubMemberships = hydrated?.fansubMemberships ?? []
  const resolvedIsPremiumActive = hydrated?.isPremiumActive ?? isPremiumActive ?? false
  const resolvedDisplayedBadges = hydrated?.displayedBadges ?? displayedBadges ?? []
  const resolvedActiveProfileEffectAssets = hydrated?.activeProfileEffectAssets || activeProfileEffectAssets
  const normalizedBio = normalizeBioText(resolvedBio)
  const currentFansubMembershipIdSet = new Set(currentUserFansubMemberships.map((item) => item.fansubId))
  const sharedFansubs = resolvedFansubMemberships.filter((item, index, arr) => {
    if (!currentFansubMembershipIdSet.has(item.fansubId)) return false
    return arr.findIndex((candidate) => candidate.fansubId === item.fansubId) === index
  })
  const showHydrationSkeleton = isHydrationLoading && !hydrated

  const hasCustomBg = Boolean(resolvedProfileBackgroundStyle || resolvedProfileBackgroundVideoUrl)
  const shouldRenderPatternOverlay = shouldRenderHoverPatternOverlay(
    hasCustomBg,
    resolvedProfilePatternStyle,
  )
  const shouldUseFullWidth = /\bw-full\b/.test(className ?? '')
  const isOwnHoverProfile = Boolean(currentUser?.id && resolvedUserId && currentUser.id === resolvedUserId)

  const scheduleClose = () => {
    scheduleHoverClose({
      openTimeoutRef,
      closeTimeoutRef,
      hydrationAbortRef,
      actionMenuOpenRef,
      hoverInstanceId,
      setIsOpen,
    })
  }

  useEffect(() => {
    resetHoverHydrationState({
      hydrationAbortRef,
      hydrationRequestedRef,
      setHydrated,
      setHydrationError,
      setIsHydrationLoading,
      setIsActionMenuOpen,
    })
  }, [id, username])

  useEffect(() => {
    resetHoverFollowState({
      setFollowing: setIsFollowingUser,
      setFollowStateLoading: setIsFollowStateLoading,
      setFollowActionLoading: setIsFollowActionLoading,
      setDisplayFollowerCount,
      setIsActionMenuOpen,
      resetExtra: () => {
        setIsBlockStateLoading(false)
        setIsBlockActionLoading(false)
        setIsBlockedByCurrentUser(false)
        setCurrentUserFansubMemberships([])
      },
    })
  }, [currentUser?.id, resolvedUserId])

  useEffect(() => {
    syncHoverActionMenuState({
      isActionMenuOpen,
      actionMenuOpenRef,
      closeTimeoutRef,
      hoverInstanceId,
      setIsOpen,
    })
  }, [hoverInstanceId, isActionMenuOpen])

  useEffect(() => {
    syncHoverFollowerCount(resolvedFollowerCount, setDisplayFollowerCount)
  }, [resolvedFollowerCount, resolvedUserId])

  useEffect(() => {
    const closeSelf = createHoverCloseHandler({
      openTimeoutRef,
      closeTimeoutRef,
      hoverInstanceId,
      setIsOpen,
    })
    registerActiveHoverCloser(hoverInstanceId, closeSelf)
    return () => unregisterActiveHoverCloser(hoverInstanceId)
  }, [hoverInstanceId])

  useEffect(() => {
    return () => {
      cleanupHoverLifecycle({
        hydrationAbortRef,
        openTimeoutRef,
        closeTimeoutRef,
      })
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return
    return bindHoverCardPosition({
      triggerRef,
      hoverInstanceId,
      sideOffset,
      setHoverPosition,
      setIsOpen,
    })
  }, [hoverInstanceId, isOpen, sideOffset])

  useHoverFollowStateLoader({
    deps: [isBlockedByCurrentUser, isOpen, currentUser?.id, resolvedUserId, isOwnHoverProfile],
    enabled: isOpen && Boolean(currentUser?.id) && Boolean(resolvedUserId) && !isOwnHoverProfile,
    blocked: isBlockedByCurrentUser,
    onBlocked: () => {
      setIsFollowingUser(false)
      setIsFollowStateLoading(false)
    },
    logger: userHoverCardLogger,
    scope: 'UserHoverCard',
    currentUserId: currentUser?.id || '',
    targetId: resolvedUserId,
    targetContextKey: 'targetUserId',
    message: 'takip durumu yuklenemedi.',
    load: () => userService.isFollowingUser(currentUser!.id, resolvedUserId),
    apply: setIsFollowingUser,
    applyLoading: setIsFollowStateLoading,
  })

  useUserHoverBlockStateLoader({
    deps: [isOpen, currentUser?.id, resolvedUserId, isOwnHoverProfile],
    enabled: isOpen && Boolean(currentUser?.id) && Boolean(resolvedUserId) && !isOwnHoverProfile,
    logger: userHoverCardLogger,
    scope: 'UserHoverCard',
    currentUserId: currentUser?.id || '',
    targetUserId: resolvedUserId,
    message: 'engel durumu yuklenemedi.',
    load: () => userService.getUserBlockState(resolvedUserId, currentUser!.id),
    applyBlocked: setIsBlockedByCurrentUser,
    applyLoading: setIsBlockStateLoading,
  })

  useCurrentUserFansubMembershipLoader({
    deps: [isOpen, currentUser?.id, isOwnHoverProfile],
    enabled: isOpen && Boolean(currentUser?.id) && !isOwnHoverProfile,
    logger: userHoverCardLogger,
    scope: 'UserHoverCard',
    currentUserId: currentUser?.id || '',
    message: 'aktif kullanici fansub uyelikleri yuklenemedi.',
    load: () => resolveUserHoverDataWithMeta({ userId: currentUser!.id }).then((result) => result.data),
    applyMemberships: setCurrentUserFansubMemberships,
  })

  const hydrateOnDemand = ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    runHoverHydration({
      enableAutoHydration,
      canHydrate: Boolean(normalizedUserId || resolvedUsername),
      forceRefresh,
      hydrationRequestedRef,
      hydrationAbortRef,
      setHydrationError,
      setIsHydrationLoading,
      setHydrated,
      logger: userHoverCardLogger,
      warningMessage: 'hover karti hydrate edilemedi.',
      failureMessage: txa('Kullanıcı kartı yüklenemedi.'),
      buildRequestContext: () => createRequestContext('UserHoverCard', 'hydrate-user-hover-card', {
        targetUserId: normalizedUserId || null,
        targetUsername: resolvedUsername || null,
        forceRefresh,
      }),
      load: async ({ controller, forceRefresh: shouldForceRefresh }) => {
        const result = await resolveUserHoverDataWithMeta(
          {
            userId: normalizedUserId || undefined,
            username: resolvedUsername || undefined,
          },
          {
            forceRefresh: shouldForceRefresh,
            allowStale: !shouldForceRefresh,
            revalidateStale: !shouldForceRefresh,
            signal: controller.signal,
          },
        )
        if (controller.signal.aborted) return null

        let nextData = result.data
        if (result.meta.source === 'cache-stale' && !shouldForceRefresh) {
          const freshResult = await resolveUserHoverDataWithMeta(
            {
              userId: normalizedUserId || undefined,
              username: resolvedUsername || undefined,
            },
            {
              forceRefresh: true,
              allowStale: false,
              revalidateStale: false,
              signal: controller.signal,
            },
          )
          if (!controller.signal.aborted && freshResult.data) {
            nextData = freshResult.data
          }
        }
        return nextData
      },
    })
  }

  const handleRetryHydration = createHoverHydrationRetry(hydrateOnDemand)
  const syncHydratedFollowerCount = createHydratedFollowerCountSync({ setHydrated })

  const handleMouseEnter = () => {
    triggerHoverOpen({
      hydrateOnDemand: () => hydrateOnDemand(),
      openTimeoutRef,
      closeTimeoutRef,
      triggerRef,
      hoverInstanceId,
      sideOffset,
      setHoverPosition,
      setIsOpen,
    })
  }

  const handleMouseLeave = () => {
    scheduleClose()
  }

  const handleToggleFollow = async () => {
    if (!resolvedUserId) {
      toast.info(txa('Kullanıcı bilgisi yükleniyor, tekrar dene.'))
      return
    }
    if (!currentUser?.id) {
      toast.info(txa('Takip etmek için giriş yapmalısınız.'))
      return
    }
    if (isBlockedByCurrentUser) {
      toast.info(txa('Engellediğiniz bir kullanıcıyı takip edemezsiniz.'))
      return
    }
    if (isOwnHoverProfile || isFollowActionLoading) return

    await runOptimisticHoverFollowToggle({
      logger: userHoverCardLogger,
      scope: 'UserHoverCard',
      currentUserId: currentUser.id,
      targetId: resolvedUserId,
      targetContextKey: 'targetUserId',
      isActionLoading: isFollowActionLoading,
      isFollowing: isFollowingUser,
      displayFollowerCount,
      setActionLoading: setIsFollowActionLoading,
      setFollowing: setIsFollowingUser,
      setDisplayFollowerCount,
      follow: () => userService.followUser(currentUser.id, resolvedUserId),
      unfollow: () => userService.unfollowUser(currentUser.id, resolvedUserId),
      onHydratedCountSync: syncHydratedFollowerCount,
      missingTargetMessage: txa('Kullanıcı bilgisi yükleniyor, tekrar dene.'),
      missingCurrentUserMessage: txa('Takip etmek için giriş yapmalısınız.'),
      successFollowMessage: txa('Kullanıcı takip edildi.'),
      successUnfollowMessage: txa('Kullanıcı takibinden çıkıldı.'),
      failureFallback: txa('Takip işlemi şu anda tamamlanamadı.'),
      blockedMessage: txa('Bu kullanıcı ile takip ilişkisi kurulamıyor.'),
    })
  }

  const handleToggleBlock = async () => {
    await runUserHoverBlockToggle({
      logger: userHoverCardLogger,
      currentUserId: currentUser?.id || '',
      targetUserId: resolvedUserId,
      isOwnHoverProfile,
      isBlockActionLoading,
      isBlockedByCurrentUser,
      isFollowingUser,
      displayFollowerCount,
      setIsBlockActionLoading,
      setIsBlockedByCurrentUser,
      setIsFollowingUser,
      setDisplayFollowerCount,
      actionMenuOpenRef,
      setIsActionMenuOpen,
    })
  }

  const handleOpenUserReport = async () => {
    await openUserHoverReport({
      currentUserId: currentUser?.id || '',
      targetUserId: resolvedUserId,
      isOwnHoverProfile,
      actionMenuOpenRef,
      setIsActionMenuOpen,
      setIsUserReportModalOpen,
    })
  }

  return (
    <div
      className={cn('relative', isOpen ? 'z-[130]' : 'z-0', shouldUseFullWidth ? 'w-full' : '', className)}
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !cardRef.current?.contains(event.relatedTarget as Node | null)) handleMouseLeave()
      }}
    >
      {children}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={cardRef}
          className={cn('fixed z-[350] w-[320px] animate-in fade-in zoom-in-95 duration-150', portalClassName)}
          style={{
            left: `${hoverPosition.left}px`,
            top: `${hoverPosition.top}px`,
            width: `${UNIFIED_PROFILE_HOVER_CARD_WIDTH}px`,
          }}
          onMouseEnter={() => {
            keepHoverOpen({
              closeTimeoutRef,
              hoverInstanceId,
              setIsOpen,
            })
          }}
          onMouseLeave={() => {
            scheduleClose()
          }}
        >
          <UserHoverCardSurface
            className='w-full'
            activeProfileEffectAssets={resolvedActiveProfileEffectAssets}
            hasCustomBg={hasCustomBg}
            profileBackgroundVideoUrl={resolvedProfileBackgroundVideoUrl}
            profileBackgroundStyle={resolvedProfileBackgroundStyle}
            shouldRenderPatternOverlay={shouldRenderPatternOverlay}
            profilePatternStyle={resolvedProfilePatternStyle}
            themeColors={resolvedThemeColors}
            userId={resolvedUserId || null}
            username={resolvedUsername}
            displayName={resolvedDisplayName}
            activeFansubIdentityTag={hydrated?.activeFansubIdentityTag ?? null}
            avatar={resolvedAvatar}
            frameType={resolvedFrameType}
            activeNameClassName={resolvedNameStyleClassName}
            activeNameInlineStyle={resolvedNameStyleInlineStyle}
            isPremiumActive={resolvedIsPremiumActive}
            sharedFansubNames={sharedFansubs.map((item) => item.fansubName)}
            isBlockedByCurrentUser={isBlockedByCurrentUser}
            hydrationError={hydrationError}
            onRetryHydration={handleRetryHydration}
            followerCount={displayFollowerCount}
            displayedBadges={resolvedDisplayedBadges}
            bio={normalizedBio}
            fansubMemberships={resolvedFansubMemberships.map((item) => ({
              fansubId: item.fansubId,
              fansubName: item.fansubName,
              fansubSlug: item.fansubSlug,
              role: item.role,
            }))}
            isOwnHoverProfile={isOwnHoverProfile}
            showHydrationSkeleton={showHydrationSkeleton}
            isFollowStateLoading={isFollowStateLoading}
            isFollowActionLoading={isFollowActionLoading}
            isBlockStateLoading={isBlockStateLoading}
            isBlockActionLoading={isBlockActionLoading}
            isFollowingUser={isFollowingUser}
            primaryColor={resolvedPrimaryColor}
            secondaryColor={hydrated?.secondaryColor || secondaryColor}
            showActionMenu={Boolean(resolvedUsername && !isOwnHoverProfile)}
            actionMenuOpen={isActionMenuOpen}
            onActionMenuPointerDown={() => {
              primeHoverActionMenuOpen({
                closeTimeoutRef,
                actionMenuOpenRef,
              })
            }}
            onActionMenuOpenChange={(nextOpen) => {
              syncHoverActionMenuOpenChange({
                nextOpen,
                actionMenuOpenRef,
                setIsActionMenuOpen,
                triggerRef,
                cardRef,
                scheduleClose,
              })
            }}
            onOpenUserReport={() => { void handleOpenUserReport() }}
            onToggleBlock={() => { void handleToggleBlock() }}
            onFollowToggle={() => { void handleToggleFollow() }}
            profileHref={resolvedUsername ? `/profil/${encodeURIComponent(resolvedUsername)}` : null}
          />
        </div>,
        document.body,
      )}
      <ReportModal
        isOpen={isUserReportModalOpen}
        onClose={() => {
          closeHoverActionMenu({
            actionMenuOpenRef,
            setIsActionMenuOpen,
          })
          setIsUserReportModalOpen(false)
        }}
        targetId={resolvedUserId}
        targetType="user"
      />
    </div>
  )
}

export { FansubHoverCard, MangaHoverCard, UserHoverCard }
export type { HoverCardProps } from './userHoverCardShared'
export type { MangaHoverCardProps } from './MangaHoverCard'




