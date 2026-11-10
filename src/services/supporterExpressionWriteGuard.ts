import { getFansubSupporterAssetTokenRegex } from '@/lib/fansubSupporterAssetTokens'
import { isPremiumPerkEnabled } from '@/lib/premiumPerks'
import { isPremiumActive } from './premiumPackagePublicService'
import { getMyAccountEconomySnapshot } from './selfAccountEconomyService'

function hasSupporterExpressionToken(value: string) {
  const normalized = value.trim()
  if (!normalized) return false
  return getFansubSupporterAssetTokenRegex().test(normalized)
}

export async function ensureSupporterExpressionWriteAllowed(value: string) {
  if (!hasSupporterExpressionToken(value)) {
    return value.trim()
  }

  if (!isPremiumPerkEnabled('fansub_expressions')) {
    throw new Error('Fansub emoji ve cikartmalari su anda kapali.')
  }

  const accountSnapshot = await getMyAccountEconomySnapshot()
  if (isPremiumActive(accountSnapshot?.premiumExpiresAt ?? null)) {
    return value.trim()
  }

  throw new Error('Fansub emoji ve cikartmalarini kullanmak icin premium gerekli.')
}
