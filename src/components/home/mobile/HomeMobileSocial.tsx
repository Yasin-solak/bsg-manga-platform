import { Link } from '@/i18n/router'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { useEffect, useState } from 'react'
import { BookOpen, Crown } from 'lucide-react'
import type { FollowActivityItem } from '@/services/followFeedService/types'
import type { ExploreCollectionConfig } from '@/services/exploreConfigService'
import { buildPublicMangaPath } from '@/lib/routes'
import { formatRelativeTime } from '../homeUtils'
import { MobileRail, MobileSectionHeader } from './HomeMobilePrimitives'
import { useTx } from '@/i18n/LocaleProvider'
import { useAuth } from '@/contexts/AuthContext'
import { getActivePremiumOffer, isPremiumActive } from '@/services/premiumPackagePublicService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Social and discovery blocks of the mobile home: measures exactly from the handoff.
 *
 * Friends    : 168px card, 30px avatar, 34x46 mini cover below
 * Collections: 2-column grid, 96px height
 * Premium    : promo card, feature chips of the real offer, CTA
 */

/* ------------------------------------------------------------ Arkadaslarin */

interface FriendsRailProps {
  items: FollowActivityItem[]
}

/** Turns the event type into a "what they did" sentence; a raw event name says nothing to the user. */
function verbFor(item: FollowActivityItem): string {
  switch (item.eventType) {
    case 'user_read':
      return txa('okudu')
    case 'user_comment':
      return txa('yorum yaptı')
    case 'fansub_new_chapter':
      return txa('yeni bölüm yayınladı')
    case 'fansub_new_manga':
      return txa('yeni seri ekledi')
    default:
      return txa('hareket etti')
  }
}

export function MobileFriendsRail({ items }: FriendsRailProps) {
  const { enabled } = useCommunityAvailability()
  const tx = useTx()
  const visible = items.filter((item) => item.actorName).slice(0, 8)
  if (visible.length === 0) return null

  return (
    <section data-testid="home-mobile-friends">
      <MobileSectionHeader title={tx('Arkadaşların')} to={enabled ? '/topluluk' : undefined} />
      <MobileRail className="gap-2">
        {visible.map((item) => {
          const to = item.mangaId
            ? buildPublicMangaPath({
                id: item.mangaId,
                slug: item.mangaSlug,
                title: item.mangaTitle ?? '',
              })
            : item.actorUsername
              ? `/profil/${encodeURIComponent(item.actorUsername)}`
              : '/topluluk'

          return (
            <Link
              key={item.id}
              to={to}
              className="flex w-[168px] shrink-0 flex-col rounded-[17px] border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                {item.actorAvatarUrl ? (
                  <img
                    src={item.actorAvatarUrl}
                    alt=""
                    loading="lazy"
                    className="size-[30px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                    {item.actorName.slice(0, 1).toLocaleUpperCase(intlLocale())}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[12.5px] font-black text-foreground">
                    {item.actorUsername ? `@${item.actorUsername}` : item.actorName}
                  </p>
                  <p className="m-0 mt-px text-[10px] font-bold text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
              </div>

              <p className="m-0 mt-2.5 text-[11.5px] font-bold leading-[1.4] text-muted-foreground">
                <strong className="font-black text-foreground">{verbFor(item)}</strong>
                {item.chapterNumber ? ` · ${tx('{number}. bölüm', { number: item.chapterNumber })}` : ''}
              </p>

              {item.mangaTitle ? (
                <div className="mt-auto flex items-center gap-2 pt-2.5">
                  {item.mangaCoverImageUrl ? (
                    <img
                      src={item.mangaCoverImageUrl}
                      alt=""
                      loading="lazy"
                      className="h-[46px] w-[34px] shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <p className="m-0 line-clamp-2 text-[11px] font-extrabold leading-[1.25] text-foreground">
                    {item.mangaTitle}
                  </p>
                </div>
              ) : null}
            </Link>
          )
        })}
      </MobileRail>
    </section>
  )
}

/* ----------------------------------------------------------- Koleksiyonlar */

interface CollectionsGridProps {
  collections: ExploreCollectionConfig[]
  genreCounts: Record<string, number>
  onSelect: (collection: ExploreCollectionConfig) => void
}

export function MobileCollectionsGrid({
  collections,
  genreCounts,
  onSelect,
}: CollectionsGridProps) {
  const tx = useTx()
  const visible = collections.slice(0, 4)
  if (visible.length === 0) return null

  return (
    <section data-testid="home-mobile-collections">
      <MobileSectionHeader title={tx('Koleksiyonlar')} to="/kesfet" />
      {/* Handoff'ta 2 SUTUN: dort koleksiyon tek ekrana sigiyor. Alt alta tam
          genislik bannerlar ayni bilgi icin dort kat dikey yer yiyordu. */}
      <div className="grid grid-cols-2 gap-2 px-4">
        {visible.map((collection) => {
          const count = genreCounts[collection.targetGenreId] ?? 0
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => onSelect(collection)}
              className="relative block h-24 overflow-hidden rounded-2xl border border-border text-left"
            >
              {collection.imageUrl ? (
                <img
                  src={collection.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full bg-muted" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/15" />
              <div className="absolute inset-x-3 bottom-2.5">
                <p className="m-0 text-[13px] font-extrabold text-white">{txa(collection.title)}</p>
                {count > 0 ? (
                  <p className="m-0 mt-px text-[11px] font-semibold text-white/70">
                    {tx('{count} seri', { count })}
                  </p>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- Premium */

type PremiumOffer = NonNullable<Awaited<ReturnType<typeof getActivePremiumOffer>>['data']>

/**
 * Premium promo card: duration and perks come from the real offer.
 * If there is no active offer or the member is already Premium, no card is shown; an offer
 * with no real backing, such as a trial, is not shown either.
 */
export function MobilePremiumCard() {
  const { currentUser } = useAuth()
  const tx = useTx()
  const [offer, setOffer] = useState<PremiumOffer | null>(null)
  useEffect(() => {
    let cancelled = false
    void getActivePremiumOffer()
      .then((result) => { if (!cancelled) setOffer(result.error ? null : result.data) })
      .catch(() => { if (!cancelled) setOffer(null) })
    return () => { cancelled = true }
  }, [])

  if (!offer || isPremiumActive(currentUser?.premiumExpiresAt)) return null

  const perks = [
    tx('{hours} saat erken erişim', { hours: offer.publicUnlockDelayHours }),
    tx('Profil isim stili ve arka plan'),
    tx('Fansub emoji ve çıkartmaları'),
    tx('{days} gün Premium', { days: offer.durationDays }),
  ]

  return (
    <section className="px-4" data-testid="home-mobile-premium">
      <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
            <Crown className="size-5" aria-hidden="true" />
          </span>
          <p className="m-0 text-base font-black text-foreground">{txa('Premium')}</p>
        </div>

        <p className="m-0 mt-2 text-[13px] leading-5 text-muted-foreground">
          {tx('Erken erişimli bölümlere genel yayından {hours} saat önce eriş.', { hours: offer.publicUnlockDelayHours })}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {perks.map((perk) => (
            <span
              key={perk}
              className="flex items-center gap-1.5 rounded-xl bg-card px-2.5 py-2 text-[11.5px] font-bold text-foreground"
            >
              <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {perk}
            </span>
          ))}
        </div>

        <Link
          to="/magaza/premium"
          className="mt-3 flex h-12 items-center justify-center rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground"
        >
          {tx("Premium'u incele")}
        </Link>
      </div>
    </section>
  )
}
