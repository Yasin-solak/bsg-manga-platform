import { AnnouncementsPanel } from '@/components/announcements/AnnouncementsPanel'
import type { Manga } from '@/types'
import type { LatestChapterItem } from '@/services/latestChapterFeedService'
import type { ExploreCollectionConfig } from '@/services/exploreConfigService'
import type { FollowActivityItem } from '@/services/followFeedService/types'
import type { ActiveEvent } from '@/services/rewardService/activeEvents'
import type { HomeContinueReadingProgress } from '../HomeContinueReading'
import { HomeEventCard } from '../HomeEventCard'
import { HomeMobileGreeting } from '../HomeMobileGreeting'
import { HomeMobileHero } from './HomeMobileHero'
import {
  MobileContinueRail,
  MobileForYouRail,
  MobileUpdatesList,
} from './HomeMobileRails'
import {
  MobileCollectionsGrid,
  MobileFriendsRail,
  MobilePremiumCard,
} from './HomeMobileSocial'

/**
 * Mobile home page: section order EXACTLY from the design handoff.
 *
 * Greeting · Hero · Event · Continue · New Chapters · For You ·
 * Friends · Collections · Community · Premium
 *
 * It differs from desktop order in two deliberate ways:
 * - The event card is BELOW the hero (what to read first, then the campaign).
 * - **NO Trending Series.** The handoff does not have it on the home page;
 * ranking is the Explore tab's job. The first rail seen on mobile should be
 * the user-specific one (Continue).
 *
 * The component is SEPARATE from the desktop tree: forcing the desktop template onto mobile
 * with `max-lg:` patches was halving both layouts.
 */

interface HomeMobileProps {
  heroMangas: Manga[]
  heroLoading?: boolean
  activeEvent: ActiveEvent | null
  continueReading: Manga[]
  continueProgress: Record<string, HomeContinueReadingProgress>
  latestChapters: LatestChapterItem[]
  /** Unread chapter summary for followed series. */
  unreadCount: number
  unreadCovers: string[]
  onFocusUnread?: () => void
  recommended: Manga[]
  friends: FollowActivityItem[]
  collections: ExploreCollectionConfig[]
  genreCounts: Record<string, number>
  onSelectCollection: (collection: ExploreCollectionConfig) => void
  isAuthenticated: boolean
  /** Premium uyeligi; erken erisim kilidi yalnizca uye OLMAYANA gosterilir. */
  isPremium: boolean
}

export function HomeMobile({
  heroMangas,
  heroLoading = false,
  activeEvent,
  continueReading,
  continueProgress,
  latestChapters,
  unreadCount,
  unreadCovers,
  onFocusUnread,
  recommended,
  friends,
  collections,
  genreCounts,
  onSelectCollection,
  isAuthenticated,
  isPremium,
}: HomeMobileProps) {
  return (
    <div className="pb-2" data-testid="home-mobile">
      <div className="px-4 pt-4">
        <HomeMobileGreeting
          newChapterCount={unreadCount}
          covers={unreadCovers}
          onFocusUnread={onFocusUnread}
        />
      </div>

      <HomeMobileHero mangas={heroMangas} loading={heroLoading} />
      <AnnouncementsPanel mobile />

      {activeEvent ? (
        <div className="px-4 pt-4">
          <HomeEventCard event={activeEvent} />
        </div>
      ) : null}

      {isAuthenticated ? (
        <MobileContinueRail mangas={continueReading} progressByMangaId={continueProgress} />
      ) : null}

      <MobileUpdatesList items={latestChapters} isPremium={isPremium} />

      {/* Oneri motoru soguk baslangicta az sonuc dondurur; dort altinda ray
          "sana ozel" iddiasini karsilamaz. */}
      {isAuthenticated && recommended.length >= 4 ? (
        <MobileForYouRail mangas={recommended} />
      ) : null}

      {isAuthenticated ? <MobileFriendsRail items={friends} /> : null}

      <MobileCollectionsGrid
        collections={collections}
        genreCounts={genreCounts}
        onSelect={onSelectCollection}
      />

      <MobilePremiumCard />
    </div>
  )
}
