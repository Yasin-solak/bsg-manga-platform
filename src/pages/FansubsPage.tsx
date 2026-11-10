import { useCallback, useEffect, useMemo, useState } from 'react'
import FansubRequestModal from '@components/common/FansubRequestModal'
import { useAuth } from '@/contexts/AuthContext'
import {
  listFansubs,
  listFansubRecentChapterActivity,
  listMangasForFansub,
  listMyFansubRequests,
  type FansubRecentActivitySummary,
  type FansubRequest,
} from '@/services/fansubService'
import {
  isFansubMembershipWorkflowAvailable,
  leaveFansub,
  listMyFansubInvites,
  listMyFansubJoinRequests,
  listMyFansubMemberships,
  respondFansubInvite,
  type FansubInvite,
  type FansubJoinRequest,
  type FansubMembership,
} from '@/services/fansubMembershipService'
import { toast } from '@/services/toastService'
import { useNavigate } from '@/i18n/router'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'
import { userService } from '@/services/userService'
import { isUuidLike } from '@/lib/routes'
import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { FansubsHero } from '@/pages/fansubs/FansubsHero'
import { FansubShowcaseRail } from '@/pages/fansubs/FansubShowcaseRail'
import { FansubLeaderboardPanel } from '@/pages/fansubs/FansubLeaderboardPanel'
import { FansubDirectorySection } from '@/pages/fansubs/FansubDirectorySection'
import { FansubMembershipCenter } from '@/pages/fansubs/FansubMembershipCenter'
import { FansubsPageSkeleton } from '@/pages/fansubs/FansubsPageSkeleton'
import {
  DIRECTORY_BATCH_SIZE,
  buildRightSidebarFansubModel,
  buildFansubLookup,
  buildFansubShowcaseEntries,
  filterAndSortFansubs,
  getMembershipName,
  toErrorMessage,
  type FansubSort,
} from '@/pages/fansubs/fansubsPageShared'
import type { Fansub, Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

const fansubsPageLogger = createScopedLogger('FansubsPage')

function FansubsPage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const currentUserId = currentUser?.id ?? null
  const canPreviewFansubRequestFlow = isE2EModeEnabled()
  const hasDatabaseUserId = Boolean(currentUserId && isUuidLike(currentUserId) && !canPreviewFansubRequestFlow)
  const showSkeletonPreview = canPreviewFansubRequestFlow
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('skeleton') === '1'
  const canUseFansubRequestModal = Boolean(currentUserId && (hasDatabaseUserId || canPreviewFansubRequestFlow))

  const [fansubs, setFansubs] = useState<Fansub[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSort, setSelectedSort] = useState<FansubSort>('discover')
  const [visibleCount, setVisibleCount] = useState(DIRECTORY_BATCH_SIZE)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [membershipCenterOpen, setMembershipCenterOpen] = useState(false)
  const [recentActivityByFansubId, setRecentActivityByFansubId] = useState<Map<string, FansubRecentActivitySummary>>(new Map())

  const [hubLoading, setHubLoading] = useState(false)
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null)
  const [membershipWorkflowAvailable, setMembershipWorkflowAvailable] = useState(true)
  const [myFansubRequests, setMyFansubRequests] = useState<FansubRequest[]>([])
  const [myMemberships, setMyMemberships] = useState<FansubMembership[]>([])
  const [myInvites, setMyInvites] = useState<FansubInvite[]>([])
  const [myJoinRequests, setMyJoinRequests] = useState<FansubJoinRequest[]>([])
  const [followStateByFansubId, setFollowStateByFansubId] = useState<Record<string, boolean>>({})
  const [followActionByFansubId, setFollowActionByFansubId] = useState<Record<string, boolean>>({})
  const [mangaPreviewByFansubId, setMangaPreviewByFansubId] = useState<Record<string, Manga[]>>({})
  const [mangaPreviewLoadingByFansubId, setMangaPreviewLoadingByFansubId] = useState<Record<string, boolean>>({})

  const hasAnyMembership = myMemberships.length > 0
  const hasPendingFansubRequest = myFansubRequests.some((request) => request.status === 'pending')
  const canCreateFansubRequest = Boolean(canUseFansubRequestModal && !hasAnyMembership && !hasPendingFansubRequest)

  const fansubLookup = useMemo(() => buildFansubLookup(fansubs), [fansubs])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim().toLowerCase())
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    listFansubs()
      .then(async (result) => {
        if (cancelled) return
        const nextFansubs = result.data || []
        setFansubs(nextFansubs)
        try {
          const activityMap = await listFansubRecentChapterActivity(nextFansubs.map((fansub) => fansub.id))
          if (!cancelled) setRecentActivityByFansubId(activityMap)
        } catch (error) {
          if (!cancelled) setRecentActivityByFansubId(new Map())
          fansubsPageLogger.warn({
            event: 'fansubs-page-recent-activity-load-failed',
            message: 'Fansub son aktivite verisi yuklenemedi.',
            error,
          })
        }
      })
      .catch((error) => {
        if (cancelled) return
        setFansubs([])
        setRecentActivityByFansubId(new Map())
        const requestContext = createRequestContext('FansubsPage', 'load-fansubs')
        const reportedError = reportUserFacingError(fansubsPageLogger, {
          event: 'fansubs-page-load-failed',
          error,
          fallback: txa('Fansub listesi yüklenirken hata oluştu.'),
          loggerMessage: txa('Fansub kataloğu yüklenemedi.'),
          requestContext,
        })
        setLoadError(reportedError.userMessage)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadMembershipHub = useCallback(async () => {
    if (!hasDatabaseUserId || !currentUserId) {
      setMyFansubRequests([])
      setMyMemberships([])
      setMyInvites([])
      setMyJoinRequests([])
      return
    }

    setHubLoading(true)
    try {
      const workflowAvailable = await isFansubMembershipWorkflowAvailable()
      setMembershipWorkflowAvailable(workflowAvailable)

      const [requests, memberships] = await Promise.all([
        listMyFansubRequests(currentUserId),
        listMyFansubMemberships(currentUserId),
      ])

      setMyFansubRequests(requests)
      setMyMemberships(memberships)

      if (workflowAvailable) {
        const [invites, joinRequests] = await Promise.all([
          listMyFansubInvites(currentUserId),
          listMyFansubJoinRequests(currentUserId),
        ])
        setMyInvites(invites)
        setMyJoinRequests(joinRequests)
      } else {
        setMyInvites([])
        setMyJoinRequests([])
      }
    } catch (error) {
      const requestContext = createRequestContext('FansubsPage', 'load-membership-center', {
        currentUserId,
      })
      const reportedError = reportUserFacingError(fansubsPageLogger, {
        event: 'fansubs-membership-center-load-failed',
        error,
        fallback: txa('Fansub üyelik merkezi yüklenemedi.'),
        loggerMessage: 'Fansub uyelik merkezi verisi yuklenemedi.',
        requestContext,
      })
      toast.error(toErrorMessage(reportedError.userMessage, txa('Fansub üyelik merkezi yüklenemedi.')))
    } finally {
      setHubLoading(false)
    }
  }, [currentUserId, hasDatabaseUserId])

  useEffect(() => {
    void loadMembershipHub()
  }, [loadMembershipHub])

  const rankedFansubs = useMemo(
    () => buildFansubShowcaseEntries(fansubs, recentActivityByFansubId),
    [fansubs, recentActivityByFansubId],
  )
  const weeklyLeaderFansubs = useMemo(() => rankedFansubs.slice(0, 1), [rankedFansubs])
  const sidebarModel = useMemo(() => buildRightSidebarFansubModel(rankedFansubs), [rankedFansubs])

  const filteredFansubs = useMemo(
    () => filterAndSortFansubs(rankedFansubs, debouncedSearch, selectedSort),
    [debouncedSearch, rankedFansubs, selectedSort],
  )
  const directoryFansubs = filteredFansubs

  const visibleFansubs = useMemo(
    () => directoryFansubs.slice(0, visibleCount),
    [directoryFansubs, visibleCount],
  )
  const hasMore = visibleFansubs.length < directoryFansubs.length
  const interactiveFansubIds = useMemo(
    () => Array.from(new Set([...weeklyLeaderFansubs, ...visibleFansubs].map((fansub) => fansub.id).filter(Boolean))),
    [weeklyLeaderFansubs, visibleFansubs],
  )

  useEffect(() => {
    setVisibleCount(DIRECTORY_BATCH_SIZE)
  }, [debouncedSearch, selectedSort])

  useEffect(() => {
    if (!hasDatabaseUserId || !currentUserId || interactiveFansubIds.length === 0) {
      setFollowStateByFansubId((previous) => (Object.keys(previous).length === 0 ? previous : {}))
      setFollowActionByFansubId((previous) => (Object.keys(previous).length === 0 ? previous : {}))
      return
    }

    const idsToLoad = interactiveFansubIds.filter((fansubId) => followStateByFansubId[fansubId] === undefined)
    if (idsToLoad.length === 0) return

    let cancelled = false

    void userService.listFollowedFansubIds(currentUserId, idsToLoad)
      .then((followedIdSet) => {
        if (cancelled) return
        const nextFollowState = Object.fromEntries(
          idsToLoad.map((fansubId) => [fansubId, followedIdSet.has(fansubId)]),
        )
        setFollowStateByFansubId((previous) => ({
          ...previous,
          ...nextFollowState,
        }))
      })
      .catch((error) => {
        if (cancelled) return
        fansubsPageLogger.warn({
          event: 'fansub-follow-state-batch-sync-failed',
          message: 'Fansub takip durumlari toplu senkronize edilemedi.',
          context: { currentUserId, fansubIds: idsToLoad },
          error,
        })
        setFollowStateByFansubId((previous) => ({
          ...previous,
          ...Object.fromEntries(idsToLoad.map((fansubId) => [fansubId, false])),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [currentUserId, followStateByFansubId, hasDatabaseUserId, interactiveFansubIds])

  function resetFilters() {
    setSearchQuery('')
    setDebouncedSearch('')
    setSelectedSort('discover')
    setVisibleCount(DIRECTORY_BATCH_SIZE)
  }

  async function handleRespondInvite(inviteId: string, action: 'accept' | 'reject') {
    setBusyActionKey(`invite-${inviteId}-${action}`)
    try {
      await respondFansubInvite(inviteId, action)
      toast.success(action === 'accept' ? txa('Davet kabul edildi.') : txa('Davet reddedildi.'))
      await loadMembershipHub()
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Davet yanıtlanamadı.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleLeaveMembership(membership: FansubMembership) {
    if (membership.role === 'admin') {
      toast.info(txa('Admin çıkışı için fansub yönetim panelini kullanın.'))
      navigate(`/fansub/${membership.fansubId}/yonet`)
      return
    }

    setBusyActionKey(`leave-${membership.fansubId}`)
    try {
      await leaveFansub(membership.fansubId)
      toast.info(txa('"{name}" üyeliğin sonlandırıldı.', { name: getMembershipName(membership, fansubLookup) }))
      await loadMembershipHub()
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Fansubdan çıkış yapılamadı.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  function handleRequestSubmitted(createdRequest: FansubRequest) {
    setMyFansubRequests((previous) => [
      createdRequest,
      ...previous.filter((request) => request.id !== createdRequest.id),
    ])
    setRequestModalOpen(false)
    void loadMembershipHub()
  }

  const handleOpenFansubRequest = useCallback(() => {
    if (!currentUserId) {
      toast.info(txa('Fansub kurmak için giriş yapmalısın.'))
      return
    }
    if (!canUseFansubRequestModal) {
      toast.info(txa('Fansub kurma talebi için kullanıcı kaydın hazırlanıyor. Biraz sonra tekrar dene.'))
      return
    }
    if (hasPendingFansubRequest) {
      toast.info(txa('Bekleyen fansub kurma talebin zaten var.'))
      return
    }
    if (hasAnyMembership) {
      toast.info(txa('Aktif bir fansub üyeliğin varken yeni fansub talebi açılamaz.'))
      return
    }

    setMembershipCenterOpen(false)
    setRequestModalOpen(true)
  }, [canUseFansubRequestModal, currentUserId, hasAnyMembership, hasPendingFansubRequest])

  const handleToggleFansubFollow = useCallback(async (fansubId: string) => {
    if (!hasDatabaseUserId || !currentUserId) {
      toast.info(txa('Takip etmek için giriş yapmalısın.'))
      return
    }
    if (followActionByFansubId[fansubId]) return

    const wasFollowing = Boolean(followStateByFansubId[fansubId])
    const followerDelta = wasFollowing ? -1 : 1

    setFollowActionByFansubId((previous) => ({ ...previous, [fansubId]: true }))
    setFollowStateByFansubId((previous) => ({ ...previous, [fansubId]: !wasFollowing }))
    setFansubs((previous) => previous.map((fansub) => (
      fansub.id === fansubId
        ? { ...fansub, followerCount: Math.max(0, (fansub.followerCount || 0) + followerDelta) }
        : fansub
    )))

    try {
      if (wasFollowing) {
        await userService.unfollowFansub(currentUserId, fansubId)
        toast.info(txa('Fansub takibinden çıkıldı.'))
      } else {
        await userService.followFansub(currentUserId, fansubId)
        toast.success(txa('Fansub takip edildi.'))
      }
    } catch (error) {
      const requestContext = createRequestContext('FansubsPage', 'toggle-fansub-follow', {
        currentUserId,
        fansubId,
        nextFollowing: !wasFollowing,
      })
      const reportedError = reportUserFacingError(fansubsPageLogger, {
        event: 'fansub-follow-toggle-failed',
        error,
        fallback: txa('Takip işlemi şu anda tamamlanamadı.'),
        loggerMessage: txa('Fansub takip durumu güncellenemedi.'),
        requestContext,
      })

      setFollowStateByFansubId((previous) => ({ ...previous, [fansubId]: wasFollowing }))
      setFansubs((previous) => previous.map((fansub) => (
        fansub.id === fansubId
          ? { ...fansub, followerCount: Math.max(0, (fansub.followerCount || 0) - followerDelta) }
          : fansub
      )))
      toast.error(reportedError.userMessage)
    } finally {
      setFollowActionByFansubId((previous) => ({ ...previous, [fansubId]: false }))
    }
  }, [currentUserId, followActionByFansubId, followStateByFansubId, hasDatabaseUserId])

  const ensureFansubMangaPreview = useCallback(async (fansubId: string) => {
    if (!fansubId || mangaPreviewByFansubId[fansubId] || mangaPreviewLoadingByFansubId[fansubId]) return

    setMangaPreviewLoadingByFansubId((previous) => ({ ...previous, [fansubId]: true }))
    try {
      const result = await listMangasForFansub(fansubId, { translatedOnly: true })
      setMangaPreviewByFansubId((previous) => ({
        ...previous,
        [fansubId]: result.data || [],
      }))
    } catch (error) {
      fansubsPageLogger.warn({
        event: 'fansub-manga-preview-load-failed',
        message: txa('Fansub manga önizlemesi yüklenemedi.'),
        context: { fansubId },
        error,
      })
      setMangaPreviewByFansubId((previous) => ({
        ...previous,
        [fansubId]: [],
      }))
    } finally {
      setMangaPreviewLoadingByFansubId((previous) => ({ ...previous, [fansubId]: false }))
    }
  }, [mangaPreviewByFansubId, mangaPreviewLoadingByFansubId])

  if ((loading && !loadError) || showSkeletonPreview) {
    return <FansubsPageSkeleton showFansubRequestAction={Boolean(currentUserId)} />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-5 py-4">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <div className="space-y-3">
            <FansubsHero
              totalFansubs={fansubs.length}
              searchQuery={searchQuery}
              selectedSort={selectedSort}
              onSearchChange={setSearchQuery}
              onSortChange={setSelectedSort}
              onClearSearch={() => {
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              onOpenFansubRequest={handleOpenFansubRequest}
              showFansubRequestAction={Boolean(currentUserId)}
            />
            <FansubShowcaseRail
              items={weeklyLeaderFansubs}
              currentUserId={hasDatabaseUserId ? currentUserId : null}
              followStateByFansubId={followStateByFansubId}
              followActionByFansubId={followActionByFansubId}
              mangaPreviewByFansubId={mangaPreviewByFansubId}
              mangaPreviewLoadingByFansubId={mangaPreviewLoadingByFansubId}
              onToggleFollow={handleToggleFansubFollow}
              onEnsureMangaPreview={ensureFansubMangaPreview}
            />
            <FansubDirectorySection
              fansubs={visibleFansubs}
              loading={loading}
              loadError={loadError}
              onResetFilters={resetFilters}
              searchQuery={debouncedSearch}
              hasMore={hasMore}
              onLoadMore={() => setVisibleCount((previous) => previous + DIRECTORY_BATCH_SIZE)}
              currentUserId={hasDatabaseUserId ? currentUserId : null}
              followStateByFansubId={followStateByFansubId}
              followActionByFansubId={followActionByFansubId}
              mangaPreviewByFansubId={mangaPreviewByFansubId}
              mangaPreviewLoadingByFansubId={mangaPreviewLoadingByFansubId}
              onToggleFollow={handleToggleFansubFollow}
              onEnsureMangaPreview={ensureFansubMangaPreview}
            />
          </div>

          <FansubLeaderboardPanel
            trendItems={sidebarModel.trendFansubs}
            recentItems={sidebarModel.recentFansubs}
            recommendedItems={sidebarModel.recommendedFansubs}
          />
        </div>
      </div>

      <FansubMembershipCenter
        isOpen={membershipCenterOpen}
        onOpenChange={setMembershipCenterOpen}
        currentUserId={canUseFansubRequestModal ? currentUserId : null}
        hubLoading={hubLoading}
        membershipWorkflowAvailable={membershipWorkflowAvailable}
        busyActionKey={busyActionKey}
        canCreateFansubRequest={canCreateFansubRequest}
        myFansubRequests={myFansubRequests}
        myMemberships={myMemberships}
        myInvites={myInvites}
        myJoinRequests={myJoinRequests}
        fansubLookup={fansubLookup}
        onRespondInvite={handleRespondInvite}
        onLeaveMembership={handleLeaveMembership}
        onOpenRequest={handleOpenFansubRequest}
      />

      {canUseFansubRequestModal && currentUserId ? (
        <FansubRequestModal
          isOpen={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          requesterUserId={currentUserId}
          onSubmitted={handleRequestSubmitted}
        />
      ) : null}
    </div>
  )
}

export default FansubsPage
