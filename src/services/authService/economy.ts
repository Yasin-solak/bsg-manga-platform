import { createScopedLogger } from '../logger'
import { getMyAccountEconomySnapshot, type MyAccountEconomySnapshot } from '../selfAccountEconomyService'
import type { AppUser } from './types'

const authEconomyLogger = createScopedLogger('authService/economy')

export function applyAccountEconomyToAppUser(
  appUser: AppUser,
  economy: MyAccountEconomySnapshot | null,
): AppUser {
  if (!economy || economy.id !== appUser.id) {
    return appUser
  }

  return {
    ...appUser,
    stones: economy.stones,
    ownedItems: economy.ownedItems,
    premiumExpiresAt: economy.premiumExpiresAt,
  }
}

export async function hydrateAppUserAccountEconomy(appUser: AppUser): Promise<AppUser> {
  try {
    const economy = await getMyAccountEconomySnapshot()
    return applyAccountEconomyToAppUser(appUser, economy)
  } catch (error) {
    // We keep the current user state even if the economy snapshot has a temporary error.
    // Why: coin/premium info dropping to 0 or null during a brief RPC gap is worse.
    authEconomyLogger.warn('getMyAccountEconomySnapshot failed; mevcut kullanici ekonomi alanlari korunuyor.', error)
    return appUser
  }
}
