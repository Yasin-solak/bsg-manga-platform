/**
 * Closing credit v2 presentation model (pure function).
 *
 * The data model is KEPT (fansubChapterCreditService): title/body/CTA, metric and
 * supporter settings stay the fansub's own preference. What changes is presentation and two
 * behaviors:
 *
 * 1. **Supporter ceiling**: the v1 presentation overrode the fansub's setting with
 * `Math.min(maxSupporterCount, 2)`; even a fansub choosing 6 supporters saw 2.
 * v2 respects the setting (clipped to 1..6). The closing credit is a social proof area;
 * a two-person ceiling defeated that.
 * 2. **Capability off is absence, not an error**: the v1 builder threw
 * and callers needed try/catch. v2 returns null (no credit shown),
 * because "this fansub has no credit" is a normal state, not an
 * error.
 *
 * The fansub's own CTA (fansub/boost/manga) stays here; platform boost/donation
 * actions are in a SEPARATE strip (readerV2EndSequenceEngine): one is
 * editorial, the other a platform function.
 */

import { buildPathWithQuery, buildPublicFansubPath } from '@/lib/routes'
import { FANSUB_DETAIL_MANGAS_TAB } from '@/lib/fansubNotices'
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
import type { ChapterFansub } from '@/types'
import type { FansubBoostSnapshot, FansubBoostSupporterPreview } from '@/services/fansubBoostService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export interface ReaderV2CreditSupporter {
  id: string
  username: string
  avatarUrl: string | null
  href: string
  badgeLabel: string
  identityTag: FansubIdentityTagPresentation | null
}

export interface ReaderV2CreditPresentation {
  fansub: {
    id: string
    name: string
    slug?: string | null
    avatarUrl: string | null
    href: string
    activeNameStyle: ChapterFansub['activeNameStyle']
    hasDiscoverBadge: boolean
    hasGoldFrame: boolean
  }
  title: string
  body: string
  ctaLabel: string | null
  ctaHref: string | null
  metrics: Array<{ label: string; value: string }>
  supporters: ReaderV2CreditSupporter[]
  hiddenSupporterCount: number
}

export interface ReaderV2CreditConfigInput {
  title?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaTarget?: FansubChapterCreditCtaTarget | null
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: number
}

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

export function buildReaderV2CreditPresentation({
  fansub,
  config,
  snapshot,
  supporters,
}: {
  fansub: Pick<ChapterFansub, 'id' | 'name' | 'slug' | 'avatar' | 'activeNameStyle'>
  config: ReaderV2CreditConfigInput | null
  snapshot: FansubBoostSnapshot | null
  supporters: FansubBoostSupporterPreview[]
}): ReaderV2CreditPresentation | null {
  if (!config) return null

  const capabilityState = snapshot ? 'resolved' : 'unknown'
  if (!canRenderFansubChapterEndCredit(snapshot?.capabilities, capabilityState)) return null

  const fallback = resolveFansubChapterCreditFallbackCopy(fansub.name)
  const eligibleSupporters = supporters.filter(
    (supporter) => supporter.rewardCapabilities?.canAppearInCreditPage === true,
  )

  // Fansubun secimi gecerlidir; v1'deki 2'lik sert tavan kaldirildi.
  const visibleLimit = config.showSupporters
    ? clampFansubChapterCreditSupporterCount(config.maxSupporterCount)
    : 0

  const visibleSupporters: ReaderV2CreditSupporter[] = eligibleSupporters
    .slice(0, visibleLimit)
    .map((supporter) => ({
      id: supporter.supporterUserId,
      username: supporter.username,
      avatarUrl: supporter.avatarUrl,
      href: `/profil/${encodeURIComponent(supporter.usernameSlug)}`,
      badgeLabel: resolveFansubBoostSupporterIdentityBadgeLabel(
        supporter.rewardCapabilities,
        resolveSupporterPlanLabel(supporter.highestActivePlanCode),
        snapshot?.capabilities,
        capabilityState,
      ),
      identityTag: supporter.activeFansubIdentityTag ?? null,
    }))

  const metrics = config.showMetrics
    ? [
        { label: txa('Destek seviyesi'), value: resolveTierLabel(snapshot) },
        { label: txa('Destekci'), value: formatCompactNumber(snapshot?.activeSupporterCount || 0) },
      ]
    : []

  const ctaHref = buildCtaHref(fansub, config.ctaTarget)

  return {
    fansub: {
      id: fansub.id,
      name: fansub.name,
      slug: fansub.slug,
      avatarUrl: fansub.avatar || null,
      href: buildPublicFansubPath({ id: fansub.id, slug: fansub.slug }),
      activeNameStyle: resolveVisibleFansubNameStyle(
        fansub.activeNameStyle,
        snapshot?.capabilities,
        capabilityState,
      ),
      hasDiscoverBadge: canRenderFansubDiscoverBadge(snapshot?.capabilities, capabilityState)
        && snapshot?.capabilities?.hasDiscoverBadge === true,
      hasGoldFrame: canRenderFansubGoldFrame(snapshot?.capabilities, capabilityState)
        && snapshot?.capabilities?.hasGoldFrame === true,
    },
    title: config.title?.trim() || fallback.title,
    body: config.body?.trim() || fallback.body,
    ctaLabel: ctaHref ? (config.ctaLabel?.trim() || fallback.ctaLabel) : null,
    ctaHref,
    metrics,
    supporters: visibleSupporters,
    hiddenSupporterCount: Math.max(0, eligibleSupporters.length - visibleSupporters.length),
  }
}
