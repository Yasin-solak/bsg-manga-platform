import type { FansubTransaction } from '@/types'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { resolveStoreAssetUrl } from '../assetUrlService'
import { isFeatureEnabled } from '../featureFlagService'
import { buildInactiveFeatureMessage } from '../inactiveFeatureToast'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { redeemCoinCode as redeemCoinCodeShared } from '../redeemCodeService'
import { getCurrentAuthUserId } from '../authService/shared'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'

export type FansubDonationActivityItem = {
  id: string
  amount: number
  note: string | null
  createdAt: string
  donor: {
    id: string
    username: string
    usernameSlug?: string
    avatarUrl?: string
  } | null
}

export interface ListFansubDonationActivityOptions {
  limit?: number
  recentDays?: number
  signal?: AbortSignal
}

const fansubEconomyLogger = createScopedLogger('fansubService/economy')

function parseLegacyDonationNote(description?: string | null) {
  const text = (description || '').trim()
  if (!text) return null

  const separatorIndex = text.indexOf(' - ')
  if (separatorIndex === -1) return null

  const candidate = text.slice(separatorIndex + 3).trim()
  return candidate || null
}

export async function listFansubInventory(fansubId: string) {
  const requestContext = createRequestContext('fansubService/economy', 'listFansubInventory', { fansubId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_inventory')
        .select(`
          id,
          store_item_id,
          store_items (
            id,
            name,
            type,
            image_key,
            identifier,
            custom_asset_url,
            poster_asset_url
          )
        `)
        .eq('fansub_id', fansubId),
      signal,
    ),
    { label: 'fansubService.listFansubInventory' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub envanteri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return data.map((row: any) => {
    const resolvedImage =
      resolveStoreAssetUrl(row.store_items?.image_key) || row.store_items?.image_key || row.store_items?.identifier

    return {
      id: row.id,
      storeItemId: row.store_item_id,
      name: row.store_items?.name,
      type: row.store_items?.type,
      identifier: row.store_items?.identifier,
      image: resolvedImage,
      customAssetUrl: resolveStoreAssetUrl(row.store_items?.custom_asset_url) || undefined,
      posterAssetUrl: resolveStoreAssetUrl(row.store_items?.poster_asset_url) || undefined,
    }
  })
}

export async function addFansubInventoryItem(fansubId: string, storeItemId: string) {
  const requestContext = createRequestContext('fansubService/economy', 'addFansubInventoryItem', {
    fansubId,
    storeItemId,
  })
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_inventory')
        .insert({
          fansub_id: fansubId,
          store_item_id: storeItemId,
        }),
      signal,
    ),
    { label: 'fansubService.addFansubInventoryItem' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub envanterine urun eklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return true
}

export async function removeFansubInventoryItem(fansubId: string, itemId: string) {
  const requestContext = createRequestContext('fansubService/economy', 'removeFansubInventoryItem', {
    fansubId,
    itemId,
  })
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_inventory')
        .delete()
        .match({ fansub_id: fansubId, store_item_id: itemId }),
      signal,
    ),
    { label: 'fansubService.removeFansubInventoryItem' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub envanter urunu kaldirilamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return true
}

export async function getFansubTransactions(fansubId: string): Promise<FansubTransaction[]> {
  const requestContext = createRequestContext('fansubService/economy', 'getFansubTransactions', { fansubId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_transactions')
        .select('id, fansub_id, amount, type, description, created_at')
        .eq('fansub_id', fansubId)
        .order('created_at', { ascending: false }),
      signal,
    ),
    { label: 'fansubService.getFansubTransactions' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub islem gecmisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return data.map((entry: any) => ({
    id: entry.id,
    fansubId: entry.fansub_id,
    amount: entry.amount,
    type: entry.type,
    description: entry.description,
    createdAt: entry.created_at,
  }))
}

export async function listFansubDonationActivity(
  fansubId: string,
  options: ListFansubDonationActivityOptions = {},
): Promise<FansubDonationActivityItem[]> {
  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.min(100, Math.max(1, Math.floor(options.limit as number)))
    : 20
  const normalizedRecentDays = Number.isFinite(options.recentDays)
    ? Math.min(365, Math.max(1, Math.floor(options.recentDays as number)))
    : null
  const cutoffIso = normalizedRecentDays
    ? new Date(Date.now() - normalizedRecentDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const requestContext = createRequestContext('fansubService/economy', 'listFansubDonationActivity', {
    fansubId,
    limit: normalizedLimit,
    recentDays: normalizedRecentDays,
  })
  const query = supabase
    .from('fansub_transactions')
    .select(`
      id,
      amount,
      description,
      donation_note,
      created_at,
      created_by,
      donor:created_by (
        id,
        username,
        username_slug,
        avatar_url
      )
    `)
    .eq('fansub_id', fansubId)
    .eq('type', 'donation')
    .order('created_at', { ascending: false })
    .limit(normalizedLimit)

  if (cutoffIso) {
    query.gte('created_at', cutoffIso)
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(query, signal),
    { label: 'fansubService.listFansubDonationActivity', signal: options.signal },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bagis gecmisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return (data || []).map((row: any) => {
    const donorRow = Array.isArray(row.donor) ? row.donor[0] : row.donor
    const normalizedNote = typeof row.donation_note === 'string' && row.donation_note.trim()
      ? row.donation_note.trim()
      : parseLegacyDonationNote(row.description)

    return {
      id: row.id,
      amount: Number(row.amount) || 0,
      note: normalizedNote,
      createdAt: row.created_at,
      donor: donorRow
        ? {
          id: donorRow.id,
          username: donorRow.username,
          usernameSlug: donorRow.username_slug || undefined,
          avatarUrl: donorRow.avatar_url || undefined,
        }
        : null,
    }
  })
}

export async function redeemCode(fansubId: string, code: string) {
  const isCoinCodeEnabled = await isFeatureEnabled('economy.coin_codes', false)
  if (!isCoinCodeEnabled) {
    throw new Error('Coin kodu aktivasyonu su anda aktif degil.')
  }

  const authUserId = await getCurrentAuthUserId()
  if (!authUserId) {
    throw new Error('Bu islem icin giris yapmalisiniz.')
  }

  await redeemCoinCodeShared({
    userId: authUserId,
    code,
    target: 'fansub',
    fansubId,
  })

  return true
}

export async function purchaseItem(fansubId: string, storeItemId: string) {
  const isStorePurchaseEnabled = await isFeatureEnabled('economy.store_purchase', false)
  if (!isStorePurchaseEnabled) {
    throw new Error(buildInactiveFeatureMessage('Magaza satin alma'))
  }

  const isFansubWalletPurchaseEnabled = await isFeatureEnabled(
    'economy.fansub_wallet_purchase',
    false,
  )
  if (!isFansubWalletPurchaseEnabled) {
    throw new Error(buildInactiveFeatureMessage('Fansub kasasi ile satin alma'))
  }

  const requestContext = createRequestContext('fansubService/economy', 'purchaseItem', {
    fansubId,
    storeItemId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('purchase_fansub_store_item', {
        p_fansub_id: fansubId,
        p_item_id: storeItemId,
      }),
      signal,
    ),
    { label: 'fansubService.purchaseItem' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub satin alma islemi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw new Error(error.message || 'Fansub satin alma islemi basarisiz oldu.')
  }

  const payload = (data || {}) as { new_fansub_balance?: number }
  const newFansubBalance = Number(payload.new_fansub_balance)

  return {
    success: true,
    newFansubBalance: Number.isFinite(newFansubBalance) ? newFansubBalance : null,
  }
}

export async function purchaseItemForFansubUsingUserWallet(
  fansubId: string,
  storeItemId: string,
) {
  const isStorePurchaseEnabled = await isFeatureEnabled('economy.store_purchase', false)
  if (!isStorePurchaseEnabled) {
    throw new Error(buildInactiveFeatureMessage('Magaza satin alma'))
  }

  const isFansubWalletPurchaseEnabled = await isFeatureEnabled(
    'economy.fansub_wallet_purchase',
    false,
  )
  if (!isFansubWalletPurchaseEnabled) {
    throw new Error(buildInactiveFeatureMessage('Fansub icin satin alma'))
  }

  const requestContext = createRequestContext('fansubService/economy', 'purchaseItemForFansubUsingUserWallet', {
    fansubId,
    storeItemId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc(
        'purchase_fansub_store_item_with_user_wallet',
        {
          p_fansub_id: fansubId,
          p_item_id: storeItemId,
        },
      ),
      signal,
    ),
    { label: 'fansubService.purchaseItemForFansubUsingUserWallet' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub icin satin alma basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw new Error(error.message || 'Fansub icin satin alma basarisiz oldu.')
  }

  const payload = (data || {}) as { new_user_stones?: number }
  const newUserBalance = Number(payload.new_user_stones)

  return {
    success: true,
    // Neden null: payload eksikse bakiye 0'a cekilmesin; cagiran taraf
    // kendi fallback hesabini (mevcut bakiye - fiyat) kullanir.
    newUserBalance: Number.isFinite(newUserBalance) ? newUserBalance : null,
  }
}

export async function donateToFansub(
  fansubId: string,
  amount: number,
  note?: string,
  confirmationText?: string,
) {
  const isFansubDonationEnabled = await isFeatureEnabled('economy.fansub_donations', false)
  if (!isFansubDonationEnabled) {
    throw new Error(buildInactiveFeatureMessage('Fansub bagis sistemi'))
  }

  const normalizedAmount = Math.floor(Number(amount))
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Bagis tutari sifirdan buyuk olmalidir.')
  }

  if (normalizedAmount > 100000) {
    throw new Error('Tek seferde en fazla 100000 coin bagis yapabilirsiniz.')
  }

  const normalizedNote = typeof note === 'string' ? note.trim().slice(0, 140) : ''
  const typedConfirmationText = typeof confirmationText === 'string'
    ? confirmationText.trim().replace(/\s+/g, ' ')
    : ''
  // The server accepts only ONAYLIYORUM; CONFIRM typed in the English UI is converted to it.
  const normalizedConfirmationText = typedConfirmationText === 'CONFIRM' ? 'ONAYLIYORUM' : typedConfirmationText

  if (!normalizedConfirmationText) {
    throw new Error('Bagis onayi icin sadece ONAYLIYORUM yazmalisiniz.')
  }

  const requestContext = createRequestContext('fansubService/economy', 'donateToFansub', {
    fansubId,
    amount: normalizedAmount,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('donate_to_fansub', {
        p_fansub_id: fansubId,
        p_amount: normalizedAmount,
        p_note: normalizedNote || null,
        p_confirmation_text: normalizedConfirmationText,
      }),
      signal,
    ),
    { label: 'fansubService.donateToFansub' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bagisi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw new Error(error.message || 'Fansub bagisi basarisiz oldu.')
  }

  const payload = (data || {}) as {
    amount?: number
    new_fansub_balance?: number
    new_user_stones?: number
  }

  const newFansubBalance = Number(payload.new_fansub_balance)
  const newUserBalance = Number(payload.new_user_stones)
  const donatedAmount = Number(payload.amount)

  return {
    success: true,
    amount: Number.isFinite(donatedAmount) ? donatedAmount : normalizedAmount,
    newFansubBalance: Number.isFinite(newFansubBalance) ? newFansubBalance : 0,
    newUserBalance: Number.isFinite(newUserBalance) ? newUserBalance : 0,
  }
}

export async function equipPurchasedItem(
  fansubId: string,
  itemId: string,
  type: 'frame' | 'background' | 'pattern' | 'profile_effect',
) {
  const requestContext = createRequestContext('fansubService/economy', 'equipPurchasedItem', {
    fansubId,
    itemId,
    type,
  })
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('equip_fansub_inventory_item', {
        p_fansub_id: fansubId,
        p_item_id: itemId,
        p_type: type,
      }),
      signal,
    ),
    { label: 'fansubService.equipPurchasedItem' },
  )

  if (error) {
    fansubEconomyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub kozmetigi kullanilamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return true
}


