import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@/i18n/router'
import { BookOpen, ExternalLink, MoreHorizontal, Sparkles, UserPlus, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { resolveFansubHoverData } from '@/services/hoverCardService'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { userService } from '@/services/userService'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import { buildPublicChapterPath, buildPublicFansubPath, buildPublicMangaPath } from '@/lib/routes'
import {
  createHydratedFollowerCountSync,
  resetHoverFollowState,
  runOptimisticHoverFollowToggle,
  syncHoverFollowerCount,
  useHoverFollowStateLoader,
} from './hoverFollowActions'
import { primeHoverActionMenuOpen, syncHoverActionMenuOpenChange } from './hoverMenuActions'
import { AvatarFrame } from './AvatarFrame'
import { FansubDiscoverBadge, FansubGoldFrame } from './FansubBoostChrome'
import { buildHoverCardThemeStyle, hasValidHoverCardTheme } from './hoverCardTheme'
import { resolveFansubNameStylePresentation } from './fansubNameStyle'
import {
  resolveVisibleFansubBackground,
  resolveVisibleFansubNameStyle,
} from '@/lib/fansubBoostCapabilityGovernance'
import {
  bindHoverCardPosition,
  cleanupHoverLifecycle,
  createHoverCloseHandler,
  createHoverHydrationRetry,
  formatHoverDateLabel,
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
import type { HoverCardProps } from './userHoverCardShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

const fansubHoverCardLogger = createScopedLogger('FansubHoverCard')

function FansubHoverCard({
  children,
  id,
  slug,
  name,
  avatar,
  description,
  mangaCount,
  followerCount,
  activeNameStyle,
  hasFullNameStyle,
  hasDiscoverBadge = false,
  hasGoldFrame = false,
  canUploadStaticBackground,
  canUploadVideoBackground,
  frameType = 'default',
  primaryColor: _primaryColor,
  secondaryColor: _secondaryColor,
  profileBackgroundStyle,
  profileBackgroundVideoUrl,
  profilePatternStyle,
  themeColors,
  displayedBadges,
  className,
  portalClassName,
  enableAutoHydration = true,
  sideOffset = 8,
}: HoverCardProps) {
  const { currentUser } = useAuth()
  const hoverInstanceId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [hoverPosition, setHoverPosition] = useState({ left: 0, top: 0 })
  const [hydrated, setHydrated] = useState<Awaited<ReturnType<typeof resolveFansubHoverData>>>(null)
  const [isHydrationLoading, setIsHydrationLoading] = useState(false)
  const [hydrationError, setHydrationError] = useState<string | null>(null)
  const [isFollowingFansub, setIsFollowingFansub] = useState(false)
  const [isFollowStateLoading, setIsFollowStateLoading] = useState(false)
  const [isFollowActionLoading, setIsFollowActionLoading] = useState(false)
  const [displayFollowerCount, setDisplayFollowerCount] = useState(0)
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const openTimeoutRef = useRef<number | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)
  const hydrationRequestedRef = useRef(false)
  const hydrationAbortRef = useRef<AbortController | null>(null)
  const actionMenuOpenRef = useRef(false)

  const rawFansubRef = (id || '').trim()
  const normalizedFansubId = isUuid(rawFansubRef) ? rawFansubRef : ''
  const fallbackSlugFromId = normalizedFansubId ? '' : rawFansubRef
  const sourceFansubSlug = (slug || fallbackSlugFromId || '').trim()
  const resolvedFansubId = (hydrated?.id || normalizedFansubId || '').trim()
  const resolvedFansubSlug = (hydrated?.slug || sourceFansubSlug || '').trim()
  const fansubHref = buildPublicFansubPath({ id: resolvedFansubId, slug: resolvedFansubSlug })
  const resolvedName = hydrated?.name || name
  const resolvedAvatar =
    hydrated?.avatar
    || avatar
    || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(resolvedName || resolvedFansubSlug || resolvedFansubId || 'fansub')}`
  const resolvedDescription = hydrated?.description ?? description
  const resolvedBoostCapabilities = {
    hasFullNameStyle: hydrated?.hasFullNameStyle ?? hasFullNameStyle,
    canUploadStaticBackground: hydrated?.canUploadStaticBackground ?? canUploadStaticBackground,
    canUploadVideoBackground: hydrated?.canUploadVideoBackground ?? canUploadVideoBackground,
  }
  const resolvedActiveNameStyle = resolveVisibleFansubNameStyle(
    hydrated?.activeNameStyle ?? activeNameStyle,
    resolvedBoostCapabilities,
    'resolved',
  )
  const sourceHoverBackgroundStyle = hydrated?.profileBackgroundStyle || profileBackgroundStyle
  const sourceHoverBackgroundVideoUrl = hydrated?.profileBackgroundVideoUrl || profileBackgroundVideoUrl
  const normalizedDescription = normalizeBioText(resolvedDescription)
  const resolvedMangaCount = hydrated?.mangaCount ?? mangaCount ?? 0
  const resolvedFollowerCount = hydrated?.followerCount ?? followerCount ?? 0
  const resolvedFrameType = hydrated?.frameType || frameType || 'default'
  const visibleHoverBackground = resolveVisibleFansubBackground(
    sourceHoverBackgroundStyle || sourceHoverBackgroundVideoUrl
      ? {
          background: sourceHoverBackgroundStyle || '',
          mediaType: sourceHoverBackgroundVideoUrl ? 'video' : 'image',
          videoUrl: sourceHoverBackgroundVideoUrl,
        }
      : null,
    resolvedBoostCapabilities,
    'resolved',
  )
  const resolvedProfileBackgroundStyle = visibleHoverBackground
    ? sourceHoverBackgroundStyle
    : undefined
  const resolvedProfileBackgroundVideoUrl = visibleHoverBackground
    ? sourceHoverBackgroundVideoUrl
    : undefined
  const resolvedProfilePatternStyle = hydrated?.profilePatternStyle || profilePatternStyle
  const resolvedThemeColors = hydrated ? (hydrated.hoverTheme ?? themeColors ?? null) : (themeColors ?? null)
  const isThemed = hasValidHoverCardTheme(resolvedThemeColors)
  const resolvedDisplayedBadges = hydrated?.displayedBadges ?? displayedBadges ?? []
  const resolvedActiveProfileEffectAssets = hydrated?.activeProfileEffectAssets
  const displayedBadgesPreview = resolvedDisplayedBadges.slice(0, 3)
  const hiddenBadgeCount = Math.max(0, resolvedDisplayedBadges.length - displayedBadgesPreview.length)
  const latestContent = hydrated?.latestContent
  const latestContentDateLabel = formatHoverDateLabel(latestContent?.createdAt)
  const participationStatus = hydrated?.participationStatus ?? 'passive'
  const isParticipationActive = participationStatus === 'active'
  const participationUpdatedLabel = formatHoverDateLabel(hydrated?.participationUpdatedAt)
  const showHydrationSkeleton = isHydrationLoading && !hydrated
  const canFollowFansub = Boolean(resolvedFansubId)

  const hasCustomBg = Boolean(resolvedProfileBackgroundStyle || resolvedProfileBackgroundVideoUrl)
  const shouldRenderPatternOverlay = shouldRenderHoverPatternOverlay(
    hasCustomBg,
    resolvedProfilePatternStyle,
  )
  const shouldUseFullWidth = /\bw-full\b/.test(className ?? '')
  const fansubNamePresentation = resolveFansubNameStylePresentation(resolvedActiveNameStyle)
  const hasDatabaseCurrentUserId = Boolean(currentUser?.id && isUuid(currentUser.id))

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
  }, [id, slug, name])

  useEffect(() => {
    resetHoverFollowState({
      setFollowing: setIsFollowingFansub,
      setFollowStateLoading: setIsFollowStateLoading,
      setFollowActionLoading: setIsFollowActionLoading,
      setDisplayFollowerCount,
      setIsActionMenuOpen,
    })
  }, [currentUser?.id, resolvedFansubId])

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
  }, [resolvedFollowerCount, resolvedFansubId])

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
    deps: [isOpen, currentUser?.id, hasDatabaseCurrentUserId, resolvedFansubId],
    enabled: isOpen && hasDatabaseCurrentUserId && Boolean(resolvedFansubId),
    logger: fansubHoverCardLogger,
    scope: 'FansubHoverCard',
    currentUserId: hasDatabaseCurrentUserId ? currentUser!.id : '',
    targetId: resolvedFansubId,
    targetContextKey: 'targetFansubId',
    message: 'fansub takip durumu yuklenemedi.',
    load: () => userService.isFollowingFansub(currentUser!.id, resolvedFansubId),
    apply: setIsFollowingFansub,
    applyLoading: setIsFollowStateLoading,
  })

  const hydrateOnDemand = ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    runHoverHydration({
      enableAutoHydration,
      canHydrate: Boolean(normalizedFansubId || sourceFansubSlug),
      forceRefresh,
      hydrationRequestedRef,
      hydrationAbortRef,
      setHydrationError,
      setIsHydrationLoading,
      setHydrated,
      logger: fansubHoverCardLogger,
      warningMessage: 'fansub hover karti hydrate edilemedi.',
      failureMessage: txa('Fansub kartı yüklenemedi.'),
      buildRequestContext: () => createRequestContext('FansubHoverCard', 'hydrate-fansub-hover-card', {
        targetFansubId: normalizedFansubId || null,
        targetFansubSlug: sourceFansubSlug || null,
        forceRefresh,
      }),
      load: async ({ controller, forceRefresh: shouldForceRefresh }) =>
        resolveFansubHoverData(
          {
            fansubId: normalizedFansubId || undefined,
            slug: sourceFansubSlug || undefined,
          },
          {
            forceRefresh: shouldForceRefresh,
            signal: controller.signal,
          },
        ),
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
    await runOptimisticHoverFollowToggle({
      logger: fansubHoverCardLogger,
      scope: 'FansubHoverCard',
      currentUserId: hasDatabaseCurrentUserId ? currentUser!.id : '',
      targetId: resolvedFansubId,
      targetContextKey: 'targetFansubId',
      isActionLoading: isFollowActionLoading,
      isFollowing: isFollowingFansub,
      displayFollowerCount,
      setActionLoading: setIsFollowActionLoading,
      setFollowing: setIsFollowingFansub,
      setDisplayFollowerCount,
      follow: () => userService.followFansub(currentUser!.id, resolvedFansubId),
      unfollow: () => userService.unfollowFansub(currentUser!.id, resolvedFansubId),
      onHydratedCountSync: syncHydratedFollowerCount,
      missingTargetMessage: txa('Fansub bilgisi yükleniyor, tekrar dene.'),
      missingCurrentUserMessage: txa('Takip etmek için giriş yapmalısınız.'),
      successFollowMessage: txa('Fansub takip edildi.'),
      successUnfollowMessage: txa('Fansub takibinden çıkıldı.'),
      failureFallback: txa('Takip işlemi şu anda tamamlanamadı.'),
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
          data-testid="fansub-hover-card"
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
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
          }}
        >
          <Card
            className="flex h-[640px] flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl"
            style={buildHoverCardThemeStyle(resolvedThemeColors, undefined, { hasCustomBackground: hasCustomBg })}
          >
            {resolvedActiveProfileEffectAssets ? (
              <ProfileEffectLayer assets={resolvedActiveProfileEffectAssets} surface='hover' active className={PROFILE_EFFECT_TOP_LAYER} />
            ) : null}
            <div
              data-testid="fansub-hover-cover"
              className={cn('relative z-0 h-36 shrink-0 overflow-hidden', !isThemed && 'bg-background', !hasCustomBg && 'border-b border-border/50')}
            >
              {resolvedProfileBackgroundVideoUrl && (
                <video className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline>
                  <source src={resolvedProfileBackgroundVideoUrl} />
                </video>
              )}
              {resolvedProfileBackgroundStyle && !resolvedProfileBackgroundVideoUrl && (
                <div className="absolute inset-0" style={{ background: resolvedProfileBackgroundStyle }} />
              )}
              {shouldRenderPatternOverlay && (
                <div className="absolute inset-0 opacity-40" style={{ background: resolvedProfilePatternStyle }} />
              )}
              {hasCustomBg && (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, var(--hover-card-banner-fade, rgb(0 0 0 / 0.8)), var(--hover-card-banner-fade-mid, rgb(0 0 0 / 0.4)), transparent)',
                  }}
                />
              )}
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible p-4">
              <DropdownMenu
                modal={false}
                onOpenChange={(nextOpen) => {
                  syncHoverActionMenuOpenChange({
                    nextOpen,
                    actionMenuOpenRef,
                    setIsActionMenuOpen,
                    triggerRef,
                    cardRef,
                    scheduleClose,
                  })
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onPointerDown={() => {
                      primeHoverActionMenuOpen({
                        closeTimeoutRef,
                        actionMenuOpenRef,
                      })
                    }}
                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    aria-label={txa('Daha fazla')}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[420] w-40">
                  <DropdownMenuItem
                    className="opacity-75"
                    onSelect={() => {
                      showInactiveFeatureToast('Fansub bildirme')
                    }}
                  >
                    {txa('Fansubu Bildir')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive opacity-75 focus:text-destructive"
                    onSelect={() => {
                      showInactiveFeatureToast('Fansub engelleme')
                    }}
                  >
                    {txa('Fansubu Engelle')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-start gap-3">
                <div className="relative z-20 -mt-10 shrink-0">
                  <FansubGoldFrame active={hasGoldFrame} badgeClassName='size-5'>
                    <AvatarFrame src={resolvedAvatar} alt={resolvedName} frameType={resolvedFrameType} size={56} animated={true} hoverActive />
                  </FansubGoldFrame>
                </div>

                <div className="min-w-0 flex-1">
                  <h3
                    className={cn('line-clamp-2 break-words pr-8 font-semibold text-foreground', fansubNamePresentation.className)}
                    style={fansubNamePresentation.inlineStyle}
                  >
                    {resolvedName}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {resolvedFansubSlug ? (
                      <p className="max-w-full truncate text-xs text-muted-foreground">@{resolvedFansubSlug}</p>
                    ) : null}
                    {hasDiscoverBadge ? <FansubDiscoverBadge compact iconOnly /> : null}
                  </div>
                </div>
              </div>

              {hydrationError && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-[11px] text-destructive">{hydrationError}</p>
                    <button
                      type="button"
                      onClick={handleRetryHydration}
                      className="inline-flex shrink-0 items-center rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
                    >
                      {txa('Tekrar Dene')}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-3">
                <div className="flex flex-1 items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BookOpen className="size-3.5" />
                    <span>{txa('{v1} seri', { v1: resolvedMangaCount.toLocaleString(intlLocale()) })}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    <span>{txa('{v1} takipçi', { v1: displayFollowerCount.toLocaleString(intlLocale()) })}</span>
                  </div>
                </div>
                {showHydrationSkeleton ? (
                  <div className="flex animate-pulse items-center gap-1.5">
                    <span className="h-7 w-7 rounded-md bg-muted/35" />
                    <span className="h-7 w-7 rounded-md bg-muted/30" />
                  </div>
                ) : displayedBadgesPreview.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {displayedBadgesPreview.map((badge) => (
                      <img
                        key={badge.id}
                        src={badge.imageUrl}
                        alt={txa(badge.name)}
                        title={txa(badge.name)}
                        className="h-7 w-7 rounded-md border border-border/70 bg-muted/20 object-contain p-0.5"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = '/badges/default.png'
                        }}
                      />
                    ))}
                    {hiddenBadgeCount > 0 && (
                      <span
                        title={txa('{v1} ek rozet', { v1: hiddenBadgeCount })}
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/70 bg-background/60 px-1.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        +{hiddenBadgeCount}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-border/50 pt-3">
                <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3" />
                  {txa('Hakkinda')}
                </p>
                {showHydrationSkeleton ? (
                  <div className="mt-2 space-y-1.5 animate-pulse">
                    <div className="h-2.5 w-full rounded bg-muted/40" />
                    <div className="h-2.5 w-[88%] rounded bg-muted/35" />
                    <div className="h-2.5 w-[72%] rounded bg-muted/30" />
                  </div>
                ) : (
                  <p className="mt-2 max-h-20 overflow-y-auto break-words whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]">
                    {normalizedDescription || txa('Bu fansub henüz bir açıklama eklemedi.')}
                  </p>
                )}
              </div>

              <div className="mt-auto space-y-3 pt-3">
                <div className="border-t border-border/50 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <BookOpen className="size-3" />
                      {txa('Son içerik')}
                    </p>
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        isParticipationActive
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-border/70 bg-muted/20 text-muted-foreground',
                      )}
                    >
                      {isParticipationActive ? txa('Aktif') : txa('Pasif')}
                    </span>
                  </div>

                  {showHydrationSkeleton ? (
                    <div className="mt-2 space-y-1.5 animate-pulse">
                      <div className="h-2.5 w-[85%] rounded bg-muted/40" />
                      <div className="h-2.5 w-[70%] rounded bg-muted/35" />
                      <div className="h-2.5 w-[45%] rounded bg-muted/30" />
                    </div>
                  ) : latestContent ? (
                    <div className="mt-2 space-y-1">
                      <Link
                        to={
                          latestContent.chapterNumber != null
                            ? buildPublicChapterPath({
                              mangaId: latestContent.mangaId,
                              mangaSlug: latestContent.mangaSlug,
                              mangaTitle: latestContent.mangaTitle,
                              chapterNumber: latestContent.chapterNumber,
                              fansubId: resolvedFansubId,
                              fansubSlug: resolvedFansubSlug,
                            })
                            : buildPublicMangaPath({ id: latestContent.mangaId, slug: latestContent.mangaSlug, title: latestContent.mangaTitle })
                        }
                        className="block truncate text-xs font-semibold text-primary hover:underline"
                      >
                        {latestContent.mangaTitle}
                      </Link>
                      <p className="m-0 truncate text-[11px] text-muted-foreground">
                        {latestContent.chapterNumber != null
                          ? `${txa('Bolum {v1}', { v1: latestContent.chapterNumber })}${latestContent.chapterTitle ? ` - ${latestContent.chapterTitle}` : ''}`
                          : txa('Yeni manga eklendi')}
                      </p>
                      <p className="m-0 text-[11px] text-muted-foreground/85">
                        {latestContentDateLabel || txa('Tarih bilgisi yok')}
                      </p>
                    </div>
                  ) : (
                    <p className="m-0 mt-2 text-xs text-muted-foreground">
                      {txa('Son içerik bilgisi bulunamadı.')}
                    </p>
                  )}

                  {participationUpdatedLabel && (
                    <p className="m-0 mt-2 text-[11px] text-muted-foreground/80">
                      {txa('Katılım güncelleme: {v1}', { v1: participationUpdatedLabel })}
                    </p>
                  )}
                </div>

                {(resolvedFansubId || resolvedFansubSlug) && (
                  <div className="grid grid-cols-2 gap-2">
                    {canFollowFansub && (
                      <button
                        type="button"
                        onClick={() => { void handleToggleFollow() }}
                        disabled={isFollowStateLoading || isFollowActionLoading}
                        className={cn(
                          'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                          isFollowingFansub
                            ? 'border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
                            : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-primary',
                          (isFollowStateLoading || isFollowActionLoading) ? 'cursor-not-allowed opacity-65' : '',
                        )}
                      >
                        <UserPlus className="size-3" />
                        {isFollowActionLoading ? txa('İşleniyor...') : isFollowingFansub ? txa('Takipte') : txa('Takip Et')}
                      </button>
                    )}
                    <Link
                      to={fansubHref}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium text-primary transition-colors',
                        'bg-primary/10 hover:bg-primary/20',
                        canFollowFansub ? '' : 'col-span-2',
                      )}
                    >
                      {txa('Fansub Sayfası')}
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>,
        document.body,
      )}
    </div>
  )
}

export { FansubHoverCard }
