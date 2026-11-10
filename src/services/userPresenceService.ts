import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

const presenceLogger = createScopedLogger('userPresenceService')
const PRESENCE_ERROR_LOG_THROTTLE_MS = 5 * 60 * 1000

let missingRpcWasLogged = false
let lastPresenceErrorLoggedAt = 0
let presenceRequestInFlight: Promise<boolean> | null = null

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.message?.includes('Could not find the function') === true
}

/**
 * Presence is a best-effort signal independent of session security.
 * Why: a heartbeat failure must not interrupt the user's active session or page flow.
 */
async function performPresenceTouch(): Promise<boolean> {
    try {
        const { error } = await withServiceTimeout(
            (signal) => withAbortSignal(supabase.rpc('touch_my_presence'), signal),
            { label: 'Kullanici presence heartbeat kaydi', timeoutMs: 8_000 },
        )

        if (!error) return true
        if (isMissingRpcError(error)) {
            if (!missingRpcWasLogged) {
                missingRpcWasLogged = true
                presenceLogger.debug({
                    event: 'presence-rpc-staged-rollout',
                    message: 'Presence RPC henuz uygulanmamis; oturum akisi heartbeat olmadan devam ediyor.',
                })
            }
            return false
        }
        throw error
    } catch (error) {
        const now = Date.now()
        if (now - lastPresenceErrorLoggedAt >= PRESENCE_ERROR_LOG_THROTTLE_MS) {
            lastPresenceErrorLoggedAt = now
            presenceLogger.warn({
                event: 'presence-heartbeat-failed',
                message: toUserFacingErrorMessage(error, 'Presence heartbeat kaydedilemedi.'),
                error,
            })
        }
        return false
    }
}

export async function touchMyPresence(): Promise<boolean> {
    if (presenceRequestInFlight) return presenceRequestInFlight

    presenceRequestInFlight = performPresenceTouch()
    try {
        return await presenceRequestInFlight
    } finally {
        presenceRequestInFlight = null
    }
}
