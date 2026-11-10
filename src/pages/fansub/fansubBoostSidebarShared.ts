// Pure helpers shared between the boost sidebar and overview.
// Kept in a separate module since they are non-components (HMR fast-refresh friendly).

import type {
  FansubBoostSnapshot,
  FansubBoostSupporterPreview,
} from '@/services/fansubBoostService'
import type { FansubDonationActivityItem } from '@/services/fansubService'
import { intlLocale } from '@/i18n/activeLocale'

export type SidebarContributionEntry = {
  userId: string
  username: string
  usernameSlug?: string
  avatarUrl: string | null
  source: 'boost' | 'donation' | 'hybrid'
  highestActivePlanCode: string | null
  hasRecentDonation: boolean
  donationAmount30d: number
  donationCount30d: number
}

export function buildSidebarContributionEntries(
  supporters: FansubBoostSupporterPreview[],
  recentDonations: FansubDonationActivityItem[],
): SidebarContributionEntry[] {
  const entries = new Map<string, SidebarContributionEntry>()

  supporters.forEach((supporter) => {
    entries.set(supporter.supporterUserId, {
      userId: supporter.supporterUserId,
      username: supporter.username,
      usernameSlug: supporter.usernameSlug,
      avatarUrl: supporter.avatarUrl,
      source: 'boost',
      highestActivePlanCode: supporter.highestActivePlanCode,
      hasRecentDonation: false,
      donationAmount30d: 0,
      donationCount30d: 0,
    })
  })

  recentDonations.forEach((donation) => {
    if (!donation.donor?.id || !donation.donor.username) return
    const amount = Math.max(0, Number(donation.amount) || 0)
    const existing = entries.get(donation.donor.id)

    if (existing) {
      entries.set(donation.donor.id, {
        ...existing,
        source: 'hybrid',
        hasRecentDonation: true,
        donationAmount30d: existing.donationAmount30d + amount,
        donationCount30d: existing.donationCount30d + 1,
      })
      return
    }

    entries.set(donation.donor.id, {
      userId: donation.donor.id,
      username: donation.donor.username,
      usernameSlug: donation.donor.usernameSlug,
      avatarUrl: donation.donor.avatarUrl || null,
      source: 'donation',
      highestActivePlanCode: null,
      hasRecentDonation: true,
      donationAmount30d: amount,
      donationCount30d: 1,
    })
  })

  const sourceOrder: Record<SidebarContributionEntry['source'], number> = {
    hybrid: 3,
    boost: 2,
    donation: 1,
  }
  const planOrder: Record<string, number> = { top: 3, mega: 2, monthly: 1 }

  return Array.from(entries.values()).sort((a, b) => {
    const sourceDiff = sourceOrder[b.source] - sourceOrder[a.source]
    if (sourceDiff !== 0) return sourceDiff

    const aWeight = Number(a.highestActivePlanCode !== null) + Number(a.hasRecentDonation)
    const bWeight = Number(b.highestActivePlanCode !== null) + Number(b.hasRecentDonation)
    if (bWeight !== aWeight) return bWeight - aWeight

    const planDiff = (planOrder[b.highestActivePlanCode || ''] || 0) - (planOrder[a.highestActivePlanCode || ''] || 0)
    if (planDiff !== 0) return planDiff

    return b.donationAmount30d - a.donationAmount30d
  })
}

export function resolveAdminAlert(snapshot: FansubBoostSnapshot | null, isFansubAdmin: boolean) {
  if (!isFansubAdmin || !snapshot || snapshot.tierLevel <= 0 || !snapshot.lastGrantExpiresAt) return null

  const expiresDate = new Date(snapshot.lastGrantExpiresAt)
  const now = new Date()
  const daysRemaining = Math.max(0, Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  if (daysRemaining > 7) return null

  return {
    isUrgent: daysRemaining <= 3,
    daysRemaining,
  }
}

export function resolveTierProtectionInfo(snapshot: FansubBoostSnapshot | null, isFansubAdmin: boolean) {
  if (!isFansubAdmin || !snapshot || snapshot.tierLevel <= 0 || !snapshot.lastGrantExpiresAt) return null

  const expiresDate = new Date(snapshot.lastGrantExpiresAt)
  const now = new Date()
  const totalMs = expiresDate.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(totalMs / (1000 * 60 * 60 * 24)))
  const formattedDate = expiresDate.toLocaleDateString(intlLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return {
    daysRemaining,
    formattedDate,
    isExpired: totalMs <= 0,
  }
}
