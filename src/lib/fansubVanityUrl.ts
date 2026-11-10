import { FANSUB_VANITY_URL_COOLDOWN_DAYS } from '@/services/fansubService'

const DAY_MS = 24 * 60 * 60 * 1000

export interface FansubVanityUrlGovernanceState {
  canChange: boolean
  cooldownEndsAt?: string
  lastChangedAt?: string
  remainingDays: number
}

export function resolveFansubVanityUrlGovernance(
  lastChangedAt?: string | null,
  now = new Date(),
): FansubVanityUrlGovernanceState {
  if (!lastChangedAt) {
    return {
      canChange: true,
      remainingDays: 0,
    }
  }

  const parsedLastChangedAt = new Date(lastChangedAt)
  if (Number.isNaN(parsedLastChangedAt.getTime())) {
    return {
      canChange: true,
      remainingDays: 0,
    }
  }

  const cooldownEndsAt = new Date(parsedLastChangedAt.getTime() + (FANSUB_VANITY_URL_COOLDOWN_DAYS * DAY_MS))
  const remainingMs = cooldownEndsAt.getTime() - now.getTime()

  return {
    canChange: remainingMs <= 0,
    cooldownEndsAt: cooldownEndsAt.toISOString(),
    lastChangedAt,
    remainingDays: remainingMs <= 0 ? 0 : Math.ceil(remainingMs / DAY_MS),
  }
}

export function isFansubVanityUrlChangeLocked(
  currentSlug: string | null | undefined,
  nextSlug: string | null | undefined,
  lastChangedAt?: string | null,
) {
  const normalizedCurrentSlug = (currentSlug || '').trim().toLowerCase()
  const normalizedNextSlug = (nextSlug || '').trim().toLowerCase()
  if (!normalizedNextSlug || normalizedCurrentSlug === normalizedNextSlug) return false
  return !resolveFansubVanityUrlGovernance(lastChangedAt).canChange
}

export function formatFansubVanityUrlGovernanceDate(value?: string | null) {
  if (!value) return null

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate)
}

export function buildFansubVanityUrlLockedMessage(lastChangedAt?: string | null) {
  const governance = resolveFansubVanityUrlGovernance(lastChangedAt)
  const nextChangeDateLabel = formatFansubVanityUrlGovernanceDate(governance.cooldownEndsAt)

  if (!governance.canChange && nextChangeDateLabel) {
    return `Ozel URL ${FANSUB_VANITY_URL_COOLDOWN_DAYS} gunde bir degistirilebilir. Sonraki degisim ${nextChangeDateLabel} tarihinde acilir.`
  }

  return `Ozel URL ${FANSUB_VANITY_URL_COOLDOWN_DAYS} gunde bir degistirilebilir.`
}
