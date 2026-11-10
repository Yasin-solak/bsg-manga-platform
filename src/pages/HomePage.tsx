import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import type { Fansub, Manga } from '@/types'
import { getTrendingMangas, getGenreCounts } from '@/services/mangaService'
import { getHomePageFeed } from '@/services/homeService'
import { resolvePublicLastChapterByMangaIds } from '@/services/homeService/shared.chapters'
import {
    invalidateFollowFeedCache,
    listFollowedActivityFeed,
    subscribeFollowGraphMutations,
    type FollowActivityItem,
    type FollowGraphMutationPayload,
} from '@/services/followFeedService'
import { isFeatureEnabled, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import {
    claimCurrentReadingStreakRewards,
    getReadingStreakSummary,
    type ReadingStreakSummary,
} from '@/services/rewardService'
import { userService, type UserActivityFeedItem } from '@/services/userService'
import { getPublicHomepageConfig, loadHomepageFeaturedMangasByIds } from '@/services/homepageConfigService'
import { getRecommendedMangas, type RecommendedManga } from '@/services/recommendationService'
import {
    DEFAULT_EXPLORE_COLLECTIONS,
    getPublicExploreConfig,
    type ExploreCollectionConfig,
} from '@/services/exploreConfigService'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicMangaPath, buildPublicChapterPath } from '@/lib/routes'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { loadHomeHero } from '@/pages/home/loadHomeHero'
import { useDesktopHomeViewport } from '@/pages/home/useDesktopHomeViewport'
import { HomeHero } from '@/components/home/HomeHero'
import { HomeMobile } from '@/components/home/mobile/HomeMobile'
import { normalizeGenreId, toCanonicalGenreId } from '@/pages/explore/explorePageShared'
import { buildReadingStreakSummaryFromHistory } from '@/pages/home/readingStreakFallback'
import { useHomePersonalization } from '@/pages/home/useHomePersonalization'
import {
    listLatestChaptersWithFansub,
    type LatestChapterItem,
} from '@/services/latestChapterFeedService'
import { isPremiumActive } from '@/services/premiumPackagePublicService'
import {
    groupActiveEvents,
    listActiveEvents,
    type ActiveEvent,
} from '@/services/rewardService/activeEvents'
import { HomeContinueReading, type HomeContinueReadingProgress } from '@/components/home/HomeContinueReading'
import { HomeRecommendedRail } from '@/components/home/HomeRecommendedRail'
import { HomeTrendingGrid } from '@/components/home/HomeTrendingGrid'
import { HomeNewChapters } from '@/components/home/HomeNewChapters'
import { HomeFansubSection } from '@/components/home/HomeFansubSection'
import { HomeRightSidebar } from '@/components/home/HomeRightSidebar'
import { txa } from '@/i18n/activeLocale'

const LIMITS = {
    trending: 10,
    latest: 8,
    fansubs: 3,
    followFeedPageSize: 12,
    hero: 5,
    continueReading: 5,
    recommended: 14,
} as const

const homePageLogger = createScopedLogger('HomePage')

type ReadingHistoryRows = Awaited<ReturnType<typeof userService.getReadingHistory>>

interface ActivityOwner {
    id: string
    username: string
    avatar?: string
    frameType?: string | null
}

function isFollowFeedItemFromActor(
    item: FollowActivityItem,
    actorType: FollowGraphMutationPayload['actorType'],
    actorId: string,
) {
    if (actorType === 'user') {
        return item.actorType === 'user' && item.actorUserId === actorId
    }

    return item.actorType === 'fansub' && item.actorFansubId === actorId
}

function HomePage() {
    const { currentUser, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const isDesktop = useDesktopHomeViewport()
    const [heroLoading, setHeroLoading] = useState(true)
    const [feedLoading, setFeedLoading] = useState(true)
    const [homeFansubs, setHomeFansubs] = useState<Fansub[]>([])
    const [trendingManga, setTrendingManga] = useState<Manga[]>([])
    const [featuredManga, setFeaturedManga] = useState<Manga[]>([])
    const [exploreCollections, setExploreCollections] = useState<ExploreCollectionConfig[]>(DEFAULT_EXPLORE_COLLECTIONS)
    const [exploreGenreCounts, setExploreGenreCounts] = useState<Record<string, number>>({})
    const [followFeedItems, setFollowFeedItems] = useState<FollowActivityItem[]>([])
    const [followFeedLoading, setFollowFeedLoading] = useState(false)
    const [isFollowFeedEnabled, setIsFollowFeedEnabled] = useState(false)
    const [continueReadingManga, setContinueReadingManga] = useState<Manga[]>([])
    const [continueReadingProgress, setContinueReadingProgress] = useState<Record<string, HomeContinueReadingProgress>>({})
    const [ownActivityItems, setOwnActivityItems] = useState<FollowActivityItem[]>([])
    const [readingStreakDays, setReadingStreakDays] = useState(0)
    const [readingStreakSummary, setReadingStreakSummary] = useState<ReadingStreakSummary | null>(null)
    const [recommendationReasons, setRecommendationReasons] = useState<RecommendedManga[]>([])
    const [recommendedManga, setRecommendedManga] = useState<Manga[]>([])

    const currentUserId = currentUser?.id || ''
    const currentUsername = currentUser?.username || ''
    const currentAvatar = currentUser?.avatar || ''
    const currentFrameType = currentUser?.frameType || 'default'

    // On account change the previous account's recommendations do not stay on screen.
    useEffect(() => {
        let mounted = true
        setRecommendedManga([]); setRecommendationReasons([])
        if (!currentUserId) {
            return () => { mounted = false }
        }
        void getRecommendedMangas(LIMITS.recommended).then((rows) => {
            if (mounted) { setRecommendedManga(rows.map((row) => row.manga)); setRecommendationReasons(rows) }
        })
        return () => { mounted = false }
    }, [currentUserId])

    useEffect(() => {
        let mounted = true
        void loadHomeHero({ config: getPublicHomepageConfig, featured: loadHomepageFeaturedMangasByIds, trending: getTrendingMangas })
            .then((rows) => { if (mounted) setFeaturedManga(rows) })
            .catch((error) => { homePageLogger.warn({ event: 'load-home-hero-error', message: 'Ana sayfa vitrini yüklenemedi.', error }) })
            .finally(() => { if (mounted) setHeroLoading(false) })
        return () => { mounted = false }
    }, [])

    useEffect(() => {
        let mounted = true

        async function loadWithRpc() {
            const feed = await getHomePageFeed({
                trendingLimit: LIMITS.trending,
                latestLimit: LIMITS.latest,
                fansubLimit: LIMITS.fansubs,
                announcementLimit: 0,
                sidebarPopularMangaLimit: 0,
            })
            if (!mounted) return

            setHomeFansubs(feed.fansubs.slice(0, LIMITS.fansubs))
            setTrendingManga(feed.trendingMangas)
        }

        async function loadFallback() {
            const trending = await getTrendingMangas(LIMITS.trending)
            if (!mounted) return

            setTrendingManga(trending)
        }

        void (async () => {
            try {
                await loadWithRpc()
            } catch {
                try {
                    await loadFallback()
                } catch (err) {
                    const requestContext = createRequestContext('HomePage', 'load-home-data-error')
                    homePageLogger.error({
                        event: requestContext.event,
                        message: 'ana sayfa verisi yuklenemedi.',
                        context: toRequestContextLogContext(requestContext),
                        error: err,
                    })
                }
            }
        })().finally(() => { if (mounted) setFeedLoading(false) })

        return () => { mounted = false }
    }, [])

    useEffect(() => {
        let cancelled = false

        async function loadExploreCollections() {
            try {
                const [config, counts] = await Promise.all([
                    getPublicExploreConfig(),
                    getGenreCounts(),
                ])
                if (cancelled) return

                setExploreCollections(config.collections)
                setExploreGenreCounts(buildGenreCountMap(counts))
            } catch (err) {
                if (cancelled) return
                setExploreCollections(DEFAULT_EXPLORE_COLLECTIONS)
                setExploreGenreCounts({})

                const requestContext = createRequestContext('HomePage', 'load-explore-collections-error')
                homePageLogger.warn({
                    event: requestContext.event,
                    message: 'ana sayfa tematik koleksiyonlari yuklenemedi, varsayilan koleksiyonlar kullanildi.',
                    context: toRequestContextLogContext(requestContext),
                    error: err,
                })
            }
        }

        void loadExploreCollections()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        let cancelled = false

        const syncFlag = async (forceRefresh = false) => {
            const enabled = await isFeatureEnabled('home.follow_feed', false, forceRefresh)
            if (cancelled) return
            setIsFollowFeedEnabled(enabled === true)
        }

        void syncFlag()
        const unsub = listenFeatureFlagUpdates((payload) => {
            if (payload.key !== 'home.follow_feed') return
            void syncFlag(true)
        })

        return () => { cancelled = true; unsub() }
    }, [])

    useEffect(() => {
        let mounted = true
        let requestId = 0

        const loadFollowFeed = async (forceRefresh = false) => {
            if (!currentUserId || !mounted) return
            const activeRequestId = ++requestId
            setFollowFeedLoading(true)

            try {
                const result = await listFollowedActivityFeed({
                    limit: LIMITS.followFeedPageSize,
                    viewerId: currentUserId,
                    forceRefresh,
                })
                if (!mounted || activeRequestId !== requestId) return
                setFollowFeedItems(result.items)
            } catch {
                if (!mounted || activeRequestId !== requestId) return
                setFollowFeedItems([])
            } finally {
                if (mounted && activeRequestId === requestId) {
                    setFollowFeedLoading(false)
                }
            }
        }

        if (!isFollowFeedEnabled || !currentUserId) {
            invalidateFollowFeedCache()
            setFollowFeedItems([])
            setFollowFeedLoading(false)
            return () => { mounted = false }
        }

        void loadFollowFeed()

        const unsub = subscribeFollowGraphMutations((payload) => {
            if (payload.viewerId !== currentUserId) return

            if (payload.action === 'unfollowed') {
                setFollowFeedItems((prev) =>
                    prev.filter((item) => !isFollowFeedItemFromActor(item, payload.actorType, payload.actorId)),
                )
            }

            void loadFollowFeed(true)
        })

        return () => { mounted = false; unsub() }
    }, [currentUserId, isFollowFeedEnabled])

    useEffect(() => {
        let mounted = true
        const owner: ActivityOwner | null = currentUserId
            ? { id: currentUserId, username: currentUsername, avatar: currentAvatar, frameType: currentFrameType }
            : null

        if (!owner) {
            setContinueReadingManga([])
            setContinueReadingProgress({})
            setReadingStreakDays(0)
            setReadingStreakSummary(null)
            setOwnActivityItems([])
            return () => { mounted = false }
        }

        void (async () => {
            try {
                const readingHistory = await userService.getReadingHistory(owner.id)
                if (!mounted) return

                const readingState = await buildContinueReadingState(readingHistory)
                if (!mounted) return
                setContinueReadingManga(readingState.mangas.slice(0, LIMITS.continueReading))
                setContinueReadingProgress(readingState.progressByMangaId)

                try {
                    let summary = await getReadingStreakSummary()
                    if (!mounted) return
                    if (summary.claimableRewards.some((reward) => reward.isClaimable)) {
                        try {
                            const claimed = await claimCurrentReadingStreakRewards()
                            if (!mounted) return
                            summary = claimed.summary || summary
                        } catch (err) {
                            const requestContext = createRequestContext('HomePage', 'claim-reading-streak-reward-error')
                            homePageLogger.warn({
                                event: requestContext.event,
                                message: 'okuma serisi odulleri otomatik alinmadi.',
                                context: toRequestContextLogContext(requestContext),
                                error: err,
                            })
                        }
                    }
                    setReadingStreakSummary(summary)
                    setReadingStreakDays(summary.currentStreak)
                } catch {
                    const fallback = buildReadingStreakSummaryFromHistory(readingHistory || [])
                    setReadingStreakSummary(fallback)
                    setReadingStreakDays(fallback.currentStreak)
                }

                try {
                    const activities = await userService.getActivityFeed(owner.id, { recentHistory: readingHistory })
                    if (!mounted) return
                    setOwnActivityItems(mapUserActivityItems(activities, owner))
                } catch (err) {
                    const requestContext = createRequestContext('HomePage', 'load-user-activity-error')
                    homePageLogger.warn({
                        event: requestContext.event,
                        message: 'ana sayfa kullanici aktiviteleri yuklenemedi, okuma gecmisi fallback olarak kullanildi.',
                        context: toRequestContextLogContext(requestContext),
                        error: err,
                    })
                    if (mounted) setOwnActivityItems(mapReadingHistoryActivities(readingHistory || [], owner))
                }
            } catch (err) {
                const requestContext = createRequestContext('HomePage', 'load-reading-history-error')
                homePageLogger.warn({
                    event: requestContext.event,
                    message: 'ana sayfa okuma gecmisi yuklenemedi.',
                    context: toRequestContextLogContext(requestContext),
                    error: err,
                })
                if (!mounted) return
                setContinueReadingManga([])
                setContinueReadingProgress({})
                setReadingStreakDays(0)
                setReadingStreakSummary(null)
                setOwnActivityItems([])
            }
        })()

        return () => { mounted = false }
    }, [currentAvatar, currentFrameType, currentUserId, currentUsername])

    const sidebarActivityItems = useMemo(
        () => mergeActivityItems(ownActivityItems, followFeedItems),
        [followFeedItems, ownActivityItems],
    )
    const isSidebarActivityLoading = followFeedLoading && sidebarActivityItems.length === 0
    const heroManga = useMemo(() => {
        if (heroLoading) return []
        const featuredIds = new Set(featuredManga.map((manga) => manga.id))
        return [...featuredManga, ...trendingManga.filter((manga) => !featuredIds.has(manga.id))].slice(0, LIMITS.hero)
    }, [featuredManga, trendingManga, heroLoading])
    const openExploreCollection = (genreId: string) => {
        const genre = toCanonicalGenreId(normalizeGenreId(genreId))
        const params = new URLSearchParams({ genres: genre })
        navigate(`/kesfet?${params.toString()}`)
    }

    /*
     * The active event is fetched only WHEN SIGNED IN: event progress is user-specific,
     * and calling for a guest would be network traffic for empty data.
     * On error the card is simply not shown: the home page must not break
     * because of an event.
     */
    const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null)
    useEffect(() => {
        if (!currentUser) { setActiveEvent(null); return }
        let cancelled = false
        listActiveEvents()
            .then((quests) => {
                if (cancelled) return
                const [first] = groupActiveEvents(quests)
                setActiveEvent(first ?? null)
            })
            .catch(() => { if (!cancelled) setActiveEvent(null) })
        return () => { cancelled = true }
    }, [currentUser])

    /*
     * The home RPC returns manga; chapter and translator info comes separately.
     * When the screen widens, also refresh desktop's longer list.
     */
    const [latestChapters, setLatestChapters] = useState<LatestChapterItem[]>([])
    const [chaptersLoading, setChaptersLoading] = useState(true)
    useEffect(() => {
        let cancelled = false
        setChaptersLoading(true)
        listLatestChaptersWithFansub(isDesktop ? 30 : 6)
            .then((rows) => { if (!cancelled) setLatestChapters(rows) })
            .catch(() => { if (!cancelled) setLatestChapters([]) })
            .finally(() => { if (!cancelled) setChaptersLoading(false) })
        return () => { cancelled = true }
    }, [isDesktop])

    const { unreadCount, unreadCovers, personalizedCollections } =
        useHomePersonalization(currentUser?.id, exploreCollections)

    return (
        <div className="relative">
            {/*
              Mobil tasarım kendi bileşen ağacında korunur. Masaüstü stilleri
              yalnız 1024px ve üzerindeki ana sayfa kabuğuna uygulanır.
            */}
            {!isDesktop ? <div className="lg:hidden">
                <HomeMobile
                    heroMangas={heroManga}
                    heroLoading={authLoading || heroLoading || (feedLoading && heroManga.length === 0)}
                    activeEvent={activeEvent}
                    continueReading={continueReadingManga}
                    continueProgress={continueReadingProgress}
                    latestChapters={latestChapters.slice(0, 6)}
                    unreadCount={unreadCount}
                    unreadCovers={unreadCovers}
                    onFocusUnread={() => navigate('/kutuphane?sekme=bekleyen')}
                    recommended={recommendedManga}
                    friends={sidebarActivityItems}
                    collections={personalizedCollections}
                    genreCounts={exploreGenreCounts}
                    onSelectCollection={(collection) => openExploreCollection(collection.targetGenreId)}
                    isAuthenticated={Boolean(currentUser)}
                    isPremium={isPremiumActive(currentUser?.premiumExpiresAt)}
                />
            </div> : null}

            {isDesktop ? <div data-page-shell className="desktop-home w-full max-w-[1640px] px-4 pb-14 pt-6 max-lg:hidden sm:px-6">
                <div data-page-grid className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div data-page-main className="min-w-0 space-y-6 max-lg:hidden">
                        <HomeHero mangas={heroManga.slice(0, LIMITS.hero)} loading={authLoading || heroLoading || (feedLoading && heroManga.length === 0)} />
                        {currentUser && continueReadingManga.length > 0 ? (
                            <HomeContinueReading
                                mangas={continueReadingManga}
                                progressByMangaId={continueReadingProgress}
                            />
                        ) : null}
                        <HomeNewChapters chapters={latestChapters} loading={chaptersLoading} />
                        <HomeTrendingGrid mangas={trendingManga} loading={feedLoading} />
                        {/* Yeterli gerçek öneri varsa kişisel bölüm açılır. */}
                        {currentUser && recommendedManga.length >= 4 ? (
                            <HomeRecommendedRail key={currentUserId} mangas={recommendedManga} reasons={recommendationReasons} />
                        ) : null}

                        {homeFansubs.length > 0 ? <HomeFansubSection fansubs={homeFansubs} chapters={latestChapters} /> : null}
                    </div>

                    <div data-page-right-sidebar className="hidden self-stretch xl:block">
                        <div className="desktop-home-right">
                            <HomeRightSidebar
                                followFeedItems={sidebarActivityItems}
                                followFeedLoading={isSidebarActivityLoading}
                                isActivityFeedEnabled={Boolean(currentUser)}
                                isAuthenticated={Boolean(currentUser)}
                                currentUsername={currentUser?.username}
                                readingStreakDays={readingStreakDays}
                                readingStreakSummary={readingStreakSummary}
                            />
                        </div>
                    </div>
                </div>
            </div> : null}
        </div>
    )
}

async function buildContinueReadingState(rows: ReadingHistoryRows) {
    const mangas: Manga[] = []
    const progressByMangaId: Record<string, HomeContinueReadingProgress> = {}
    const seen = new Set<string>()
    const mangaIds = Array.from(new Set(
        (rows || [])
            .map((row) => String((row as any)?.manga_id || (row as any)?.manga?.id || '').trim())
            .filter(Boolean),
    ))
    const publicLastChapterByMangaId = await resolvePublicLastChapterByMangaIds(mangaIds)

    ;(rows || []).forEach((row) => {
        const manga = (row as any)?.manga
        const mangaId = String((row as any)?.manga_id || manga?.id || '').trim()
        const title = String(manga?.title || '').trim()
        if (!mangaId || !title || seen.has(mangaId)) return

        seen.add(mangaId)
        const chapterNumber = Number((row as any)?.chapter_number || 0)
        const lastPublicChapter = publicLastChapterByMangaId.get(mangaId) ?? null

        mangas.push({
            id: mangaId,
            slug: typeof manga?.slug === 'string' ? manga.slug : undefined,
            title,
            coverImage: typeof manga?.cover_image_url === 'string' ? manga.cover_image_url : buildCoverPlaceholder(title),
            genres: normalizeGenres(manga?.genres),
            status: manga?.status || undefined,
            rating: Number.isFinite(Number(manga?.rating)) ? Number(manga.rating) : undefined,
            views: Number.isFinite(Number(manga?.total_views)) ? Number(manga.total_views) : undefined,
            lastChapter: Number.isFinite(chapterNumber) && chapterNumber > 0 ? txa('Bölüm {number}', { number: chapterNumber }) : undefined,
        })
        progressByMangaId[mangaId] = {
            chapterPath: buildPublicChapterPath({ mangaId, mangaSlug: manga?.slug, mangaTitle: title, chapterNumber }),
            chapterLabel: Number.isFinite(chapterNumber) && chapterNumber > 0 ? txa('Bölüm {number}', { number: chapterNumber }) : txa('Bölüm bilgisi yok'),
            progressPercent: calculateReadingProgress(chapterNumber, lastPublicChapter),
        }
    })

    return { mangas, progressByMangaId }
}

function buildGenreCountMap(counts: Awaited<ReturnType<typeof getGenreCounts>>) {
    const countMap: Record<string, number> = {}

    counts.forEach((entry) => {
        const rawGenre = entry.genre?.trim()
        if (!rawGenre) return

        const normalized = toCanonicalGenreId(normalizeGenreId(rawGenre))
        countMap[normalized] = (countMap[normalized] || 0) + (Number(entry.count) || 0)
    })

    return countMap
}

function calculateReadingProgress(readChapter: number, lastPublicChapter: number | null) {
    if (!Number.isFinite(readChapter) || readChapter <= 0) return 0
    if (!lastPublicChapter || lastPublicChapter <= 0) return 100
    if (readChapter >= lastPublicChapter) return 100
    return Math.min(100, Math.max(0, Math.round((readChapter / lastPublicChapter) * 100)))
}

function normalizeGenres(value: unknown) {
    return Array.isArray(value)
        ? value.map((entry) => String(entry).trim()).filter(Boolean)
        : undefined
}

function mapUserActivityItems(items: UserActivityFeedItem[], owner: ActivityOwner) {
    return items
        .map((item) => mapUserActivityItem(item, owner))
        .filter((item): item is FollowActivityItem => Boolean(item))
}

function mapReadingHistoryActivities(rows: ReadingHistoryRows, owner: ActivityOwner) {
    const items = (rows || []).map((row) => {
        const manga = (row as any)?.manga
        return {
            id: String((row as any)?.id || `${(row as any)?.manga_id || manga?.id || 'manga'}:${(row as any)?.chapter_number || 0}`),
            type: 'read',
            mangaId: manga?.id || (row as any)?.manga_id,
            mangaSlug: manga?.slug,
            mangaTitle: manga?.title,
            mangaCoverImageUrl: manga?.cover_image_url,
            chapterId: (row as any)?.chapter_id,
            chapterNumber: Number((row as any)?.chapter_number || 0),
            timestamp: String((row as any)?.read_at || ''),
        } satisfies UserActivityFeedItem
    })

    return mapUserActivityItems(items, owner)
}

function mapUserActivityItem(item: UserActivityFeedItem, owner: ActivityOwner): FollowActivityItem | null {
    const mangaId = item.mangaId?.trim()
    const mangaTitle = item.mangaTitle?.trim()
    const timestamp = item.timestamp
    if (!mangaId || !mangaTitle || !timestamp) return null

    const chapterNumber = Number(item.chapterNumber || 0)
    const routeHint = buildPublicMangaPath({ id: mangaId, slug: item.mangaSlug, title: mangaTitle })

    return {
        id: `own:${item.type}:${item.id}`,
        eventType: item.type === 'comment' ? 'user_comment' : 'user_read',
        actorType: 'user',
        actorUserId: owner.id,
        actorName: owner.username,
        actorUsername: owner.username,
        actorAvatarUrl: owner.avatar,
        actorFrameType: owner.frameType || 'default',
        mangaId,
        mangaSlug: item.mangaSlug,
        mangaTitle,
        mangaCoverImageUrl: item.mangaCoverImageUrl || undefined,
        chapterId: item.chapterId || undefined,
        chapterNumber: Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : undefined,
        commentId: item.commentId,
        routeHint,
        summary: item.type === 'comment'
            ? txa('{title} serisine yorum yaptı.', { title: mangaTitle })
            : Number.isFinite(chapterNumber) && chapterNumber > 0
                ? txa('{title} {number}. bölümünü okudu.', { title: mangaTitle, number: chapterNumber })
                : txa('{title} bir bölümünü okudu.', { title: mangaTitle }),
        createdAt: timestamp,
    }
}

function mergeActivityItems(ownItems: FollowActivityItem[], followedItems: FollowActivityItem[]) {
    const seen = new Set<string>()
    return [...ownItems, ...followedItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .filter((item) => {
            if (seen.has(item.id)) return false
            seen.add(item.id)
            return true
        })
}


export default HomePage
