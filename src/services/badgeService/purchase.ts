import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { isFeatureEnabled } from '../featureFlagService'
import { buildInactiveFeatureMessage } from '../inactiveFeatureToast'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'

const badgePurchaseLogger = createScopedLogger('badgeService/purchase')

export async function purchaseBadgeForUser(
    _userId: string,
    badgeId: string,
): Promise<{ success: boolean; error?: string }> {
    const requestContext = createRequestContext('badgeService/purchase', 'purchaseBadgeForUser', { badgeId })
    const isStorePurchaseEnabled = await isFeatureEnabled('economy.store_purchase', false)
    if (!isStorePurchaseEnabled) {
        return { success: false, error: buildInactiveFeatureMessage('Magaza satin alma') }
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('purchase_user_badge', {
                p_badge_id: badgeId,
            }),
            signal,
        ),
        { label: 'badgeService.purchaseBadgeForUser' },
    )
    if (error) {
        badgePurchaseLogger.warn({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Rozet satin alma basarisiz.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        const message = String(error.message || '').trim()
        return { success: false, error: message || 'Rozet satin alma basarisiz' }
    }
    return { success: true }
}

export async function purchaseBadgeForFansub(
    fansubId: string,
    badgeId: string,
    _payerId: string,
    paymentSource: 'user' | 'fansub',
): Promise<{ success: boolean; error?: string }> {
    const requestContext = createRequestContext('badgeService/purchase', 'purchaseBadgeForFansub', {
        fansubId,
        badgeId,
        paymentSource,
    })
    const isStorePurchaseEnabled = await isFeatureEnabled('economy.store_purchase', false)
    if (!isStorePurchaseEnabled) {
        return { success: false, error: buildInactiveFeatureMessage('Magaza satin alma') }
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('purchase_fansub_badge', {
                p_fansub_id: fansubId,
                p_badge_id: badgeId,
                p_payment_source: paymentSource,
            }),
            signal,
        ),
        { label: 'badgeService.purchaseBadgeForFansub' },
    )
    if (error) {
        badgePurchaseLogger.warn({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Fansub rozeti satin alma basarisiz.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        const message = String(error.message || '').trim()
        return { success: false, error: message || 'Rozet satin alma basarisiz' }
    }
    return { success: true }
}
