import {
  canRenderFansubFoundingSupporterIdentity,
  canRenderFansubSupporterStreakIdentity,
  type FansubBoostCapabilityResolutionState,
} from '@/lib/fansubBoostCapabilityGovernance'
import { BOOST_TIERS, type TierDefinition } from '@/pages/fansub/fansubBoostConstants'
import type {
  FansubBoostCapabilities,
  FansubBoostRewardCapabilities,
  FansubBoostSnapshot,
} from '@/services/fansubBoostService'
import { txa } from '@/i18n/activeLocale'

function toPositiveInteger(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric)
}

export function resolveFansubBoostSupporterStatusLine(
  rewardCapabilities: FansubBoostRewardCapabilities | null | undefined,
  boostCapabilities?: Partial<FansubBoostCapabilities> | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  const explicitLine = typeof rewardCapabilities?.supporterStatusLine === 'string'
    ? rewardCapabilities.supporterStatusLine.trim()
    : ''
  const canUseFoundingIdentity = canRenderFansubFoundingSupporterIdentity(boostCapabilities, resolutionState)
  const canUseStreakIdentity = canRenderFansubSupporterStreakIdentity(boostCapabilities, resolutionState)

  if (explicitLine && (canUseFoundingIdentity || canUseStreakIdentity)) return explicitLine

  const foundingLabel = canUseFoundingIdentity && typeof rewardCapabilities?.foundingLabel === 'string'
    ? rewardCapabilities.foundingLabel.trim()
    : ''
  const streakCount = canUseStreakIdentity ? toPositiveInteger(rewardCapabilities?.streakCount) : 0

  if (foundingLabel && streakCount >= 2) {
    return `${foundingLabel} / ${streakCount} donemlik seri`
  }
  if (foundingLabel) return foundingLabel
  if (streakCount >= 2) return `${streakCount} donemlik destek serisi`
  return null
}

export function resolveFansubBoostSupporterIdentityBadgeLabel(
  rewardCapabilities: FansubBoostRewardCapabilities | null | undefined,
  fallbackLabel: string,
  boostCapabilities?: Partial<FansubBoostCapabilities> | null,
  resolutionState: FansubBoostCapabilityResolutionState = 'resolved',
) {
  const canUseFoundingIdentity = canRenderFansubFoundingSupporterIdentity(boostCapabilities, resolutionState)
  const canUseStreakIdentity = canRenderFansubSupporterStreakIdentity(boostCapabilities, resolutionState)
  const explicitBadge = typeof rewardCapabilities?.identityBadgeLabel === 'string'
    ? rewardCapabilities.identityBadgeLabel.trim()
    : ''

  if (explicitBadge && (canUseFoundingIdentity || canUseStreakIdentity)) {
    return explicitBadge
  }

  const foundingLabel = canUseFoundingIdentity && typeof rewardCapabilities?.foundingLabel === 'string'
    ? rewardCapabilities.foundingLabel.trim()
    : ''

  if (foundingLabel) return foundingLabel
  return fallbackLabel
}

export type FansubBoostMilestoneState = {
  isMaxTier: boolean
  currentTierTitle: string
  nextTierLevel: number | null
  nextTierTitle: string
  remainingPower: number
  title: string
  detail: string
  teaser: string[]
  shareText: string
}

export function resolveFansubBoostMilestoneState(
  snapshot: FansubBoostSnapshot | null,
  fansubName?: string,
  tiers: TierDefinition[] = BOOST_TIERS,
): FansubBoostMilestoneState {
  const tierLevel = snapshot?.tierLevel ?? 0
  const activePower = snapshot?.activePower ?? 0
  const currentTierTitle = tiers.find((tier) => tier.level === tierLevel)?.title ?? 'Baslangic'
  const nextTier = tiers.find((tier) => tier.level === (snapshot?.nextTierLevel ?? tierLevel + 1)) ?? null

  if (!nextTier) {
    const shareText = fansubName
      ? txa('{v1} tum boost katmanlarini acti. Yeni takviyeler supporter kimligini ve mevcut prestiji koruyor.', { v1: fansubName })
      : 'Tum boost katmanlari acik. Yeni takviyeler supporter kimligini ve mevcut prestiji korur.'

    return {
      isMaxTier: true,
      currentTierTitle,
      nextTierLevel: null,
      nextTierTitle: 'Tum katmanlar acik',
      remainingPower: 0,
      title: txa('Tum boost katmanlari acik'),
      detail: 'Bu noktadan sonra yeni takviyeler supporter ritmini, kimligi ve mevcut prestiji korur.',
      teaser: [],
      shareText,
    }
  }

  const remainingPower = snapshot?.nextTierRemainingPower ?? Math.max(nextTier.threshold - activePower, 0)
  const teaser = nextTier.teaser.slice(0, 3)
  const shareText = fansubName
    ? `${fansubName} icin siradaki hedef ${nextTier.title}. ${remainingPower} guc daha gelirse ${teaser.join(', ')} aciliyor.`
    : `${nextTier.title} icin ${remainingPower} guc kaldi.`

  return {
    isMaxTier: false,
    currentTierTitle,
    nextTierLevel: nextTier.level,
    nextTierTitle: nextTier.title,
    remainingPower,
    title: txa('Sonraki hedef: {v1}', { v1: nextTier.title }),
    detail: `${remainingPower} guc kaldi. ${teaser.join(' / ')}`,
    teaser,
    shareText,
  }
}
