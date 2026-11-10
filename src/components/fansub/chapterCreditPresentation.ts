import { FANSUB_DETAIL_MANGAS_TAB } from '@/lib/fansubNotices'
import {
  buildPathWithQuery,
  buildPublicFansubPath,
} from '@/lib/routes'
import {
  clampFansubChapterCreditSupporterCount,
  resolveFansubChapterCreditFallbackCopy,
  type FansubChapterCreditCtaTarget,
} from '@/lib/fansubChapterCredit'
import {
  canRenderFansubChapterEndCredit,
  canRenderFansubDiscoverBadge,
  canRenderFansubGoldFrame,
  resolveVisibleFansubNameStyle,
} from '@/lib/fansubBoostCapabilityGovernance'
import { resolveFansubBoostSupporterIdentityBadgeLabel } from '@/lib/fansubBoostPresentation'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import type { ChapterFansub, Fansub } from '@/types'
import type { FansubBoostSnapshot, FansubBoostSupporterPreview } from '@/services/fansubBoostService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type ChapterCreditPresentationSupporter = {
  id: string
  username: string
  avatarUrl: string | null
  href: string
  badgeLabel: string
  activeFansubIdentityTag: FansubIdentityTagPresentation | null
}

export type ChapterCreditPresentation = {
  fansub: {
    id: string
    name: string
    slug?: string | null
    avatarUrl?: string | null
    activeNameStyle?: ChapterFansub['activeNameStyle'] | Fansub['activeNameStyle']
    hasDiscoverBadge: boolean
    hasGoldFrame: boolean
  }
  badgeLabel: string
  eyebrowLabel: string
  title: string
  body: string
  ctaLabel: string | null
  ctaHref: string | null
  metrics: Array<{
    label: string
    value: string
  }>
  supporters: ChapterCreditPresentationSupporter[]
  hiddenSupporterCount: number
  isMinimal: boolean
}

export type ChapterCreditPresentationConfigInput = {
  title?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaTarget?: FansubChapterCreditCtaTarget | null
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: number
}

type PresentationFansubInput = Pick<ChapterFansub, 'id' | 'name' | 'slug' | 'avatar' | 'activeNameStyle'>
  | Pick<Fansub, 'id' | 'name' | 'slug' | 'avatar' | 'activeNameStyle' | 'hasDiscoverBadge' | 'hasGoldFrame'>

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(intlLocale(), {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

function resolveTierLabel(snapshot: FansubBoostSnapshot | null) {
  const raw = snapshot?.capabilities?.tierLabel
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  if (snapshot && snapshot.tierLevel > 0) return `Seviye ${snapshot.tierLevel}`
  return txa('Temel')
}

function resolveSupporterPlanLabel(planCode: string | null | undefined) {
  if (planCode === 'top') return txa('Efsane')
  if (planCode === 'mega') return txa('Mega')
  return txa('Destekci')
}

function resolveSupporterIdentityBadge(
  supporter: FansubBoostSupporterPreview,
  snapshot: FansubBoostSnapshot | null,
) {
  return resolveFansubBoostSupporterIdentityBadgeLabel(
    supporter.rewardCapabilities,
    resolveSupporterPlanLabel(supporter.highestActivePlanCode),
    snapshot?.capabilities,
    snapshot ? 'resolved' : 'unknown',
  )
}

function buildCtaHref(
  fansub: { id: string; slug?: string | null },
  ctaTarget: FansubChapterCreditCtaTarget | null | undefined,
) {
  if (!ctaTarget) return null

  const publicFansubPath = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })
  if (ctaTarget === 'takviye') return buildPathWithQuery(publicFansubPath, { tab: 'takviye' })
  if (ctaTarget === 'mangalar') return buildPathWithQuery(publicFansubPath, { tab: FANSUB_DETAIL_MANGAS_TAB })
  return publicFansubPath
}

export function buildChapterCreditPresentation({
  badgeLabel = txa('Bolum sonu'),
  eyebrowLabel = txa('Kapanis seridi'),
  fansub,
  config,
  snapshot,
  supporters,
}: {
  badgeLabel?: string
  eyebrowLabel?: string
  fansub: PresentationFansubInput
  config: ChapterCreditPresentationConfigInput
  snapshot: FansubBoostSnapshot | null
  supporters: FansubBoostSupporterPreview[]
}): ChapterCreditPresentation {
  if (!canRenderFansubChapterEndCredit(snapshot?.capabilities, snapshot ? 'resolved' : 'unknown')) {
    throw new Error(txa('Kapanis seridi capability olarak kapali.'))
  }

  const fallback = resolveFansubChapterCreditFallbackCopy(fansub.name)
  const ctaHref = buildCtaHref(fansub, config.ctaTarget)
  const normalizedMaxSupporterCount = Math.min(
    clampFansubChapterCreditSupporterCount(config.maxSupporterCount),
    2,
  )

  const visibleSupporters = config.showSupporters
    ? supporters
      .filter((supporter) => supporter.rewardCapabilities?.canAppearInCreditPage === true)
      .slice(0, normalizedMaxSupporterCount)
      .map((supporter) => ({
        id: supporter.supporterUserId,
        username: supporter.username,
        avatarUrl: supporter.avatarUrl,
        href: `/profil/${encodeURIComponent(supporter.usernameSlug)}`,
        badgeLabel: resolveSupporterIdentityBadge(supporter, snapshot),
        activeFansubIdentityTag: supporter.activeFansubIdentityTag ?? null,
      }))
    : []

  const hiddenSupporterCount = config.showSupporters
    ? Math.max(
        0,
        supporters.filter((supporter) => supporter.rewardCapabilities?.canAppearInCreditPage === true).length
        - visibleSupporters.length,
      )
    : 0

  const metrics = config.showMetrics
    ? [
        {
          label: txa('Destek seviyesi'),
          value: resolveTierLabel(snapshot),
        },
        {
          label: txa('Destekci'),
          value: formatCompactNumber(snapshot?.activeSupporterCount || 0),
        },
      ]
    : []

  const title = config.title?.trim() || fallback.title
  const body = config.body?.trim() || fallback.body
  const ctaLabel = ctaHref ? (config.ctaLabel?.trim() || fallback.ctaLabel) : null

  return {
    fansub: {
      id: fansub.id,
      name: fansub.name,
      slug: fansub.slug,
      avatarUrl: 'avatar' in fansub ? fansub.avatar || null : null,
      activeNameStyle: resolveVisibleFansubNameStyle(
        fansub.activeNameStyle,
        snapshot?.capabilities,
        snapshot ? 'resolved' : 'unknown',
      ),
      hasDiscoverBadge: canRenderFansubDiscoverBadge(snapshot?.capabilities, snapshot ? 'resolved' : 'unknown')
        && ('hasDiscoverBadge' in fansub ? fansub.hasDiscoverBadge === true : snapshot?.capabilities?.hasDiscoverBadge === true),
      hasGoldFrame: canRenderFansubGoldFrame(snapshot?.capabilities, snapshot ? 'resolved' : 'unknown')
        && ('hasGoldFrame' in fansub ? fansub.hasGoldFrame === true : snapshot?.capabilities?.hasGoldFrame === true),
    },
    badgeLabel,
    eyebrowLabel,
    title,
    body,
    ctaLabel,
    ctaHref,
    metrics,
    supporters: visibleSupporters,
    hiddenSupporterCount,
    isMinimal: metrics.length === 0 && visibleSupporters.length === 0 && !ctaHref,
  }
}
