import { isFeatureEnabled } from '../featureFlagService'
import { supabase } from '../supabase'
import {
  friendlyRedeemError,
  isMissingRedeemRpc,
  normalizeRedeemCode,
  redeemCoinCodeLegacy,
  RpcRedeemResponse,
} from './shared'
import type { RedeemCoinCodeInput, RedeemCoinCodeResult } from './types'
import { txa } from '@/i18n/activeLocale'

class RedeemRejectedError extends Error {}

export async function redeemCoinCode(input: RedeemCoinCodeInput): Promise<RedeemCoinCodeResult> {
  const isCoinCodeEnabled = await isFeatureEnabled('economy.coin_codes', false)
  if (!isCoinCodeEnabled) {
    throw new Error(txa('Coin kodu aktivasyonu şu anda kapalı.'))
  }

  if (!input.userId) {
    throw new Error(txa('Kod kullanmak için giriş yapmalısın.'))
  }

  const normalizedCode = normalizeRedeemCode(input.code)
  if (!normalizedCode) {
    throw new Error(txa('Kod bos olamaz.'))
  }

  try {
    const { data, error } = await supabase.rpc('redeem_coin_code', {
      p_code: normalizedCode,
      p_target_type: input.target,
      p_fansub_id: input.target === 'fansub' ? input.fansubId || null : null,
    })

    if (error) throw error

    const payload = (data || {}) as RpcRedeemResponse
    // A rejected attempt (invalid, expired, already used, rate limited) is recorded and returned as an error.
    if (payload.success === false) throw new RedeemRejectedError(payload.error || txa('Kod kullanılamadı.'))
    const targetType = payload.target_type === 'fansub' ? 'fansub' : 'user'

    return {
      targetType,
      codeId: String(payload.code_id || ''),
      code: String(payload.code || normalizedCode),
      creditedValue: Number(payload.credited_value || 0),
      newBalance: Number(payload.new_balance || 0),
      redeemedAt: typeof payload.redeemed_at === 'string' ? payload.redeemed_at : new Date().toISOString(),
      fansubId: typeof payload.fansub_id === 'string' ? payload.fansub_id : undefined,
    }
  } catch (error) {
    if (error instanceof RedeemRejectedError) throw error
    if (isMissingRedeemRpc(error)) {
      return redeemCoinCodeLegacy(input, normalizedCode)
    }
    throw new Error(friendlyRedeemError(error, txa('Kod kullanılamadı. Biraz sonra tekrar dene.')))
  }
}
