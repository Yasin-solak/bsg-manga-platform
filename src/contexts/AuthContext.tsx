import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode, type Context } from 'react'
import {
    fetchCurrentUser,
    isMfaRequiredError,
    isSessionReplacedError,
    signInWithEmail,
    signOut,
    verifyPendingMfaChallenge,
    type AppUser,
    type PendingMfaChallenge,
} from '@/services/authService'
import { supabase } from '@/services/supabase'
import { isAbortError } from '@/services/supabaseError'
import { getE2EMockAuthUser, setE2ERuntimeCurrentUser } from '@/testing/e2eMocks'
import { toast } from '@/services/toastService'
import {
    clearCurrentAuthSessionSnapshotCache,
    clearMfaStateSummaryCache,
} from '@/services/authService/shared'
import {
    clearMyAccountEconomySnapshotCache,
    primeMyAccountEconomySnapshotCache,
} from '@/services/selfAccountEconomyService'
import { clearAdminUserOverviewSnapshotCache } from '@/services/adminUserService/overviewSnapshot'
import { clearCurrentUserIdentityCache } from '@/services/userService/selfIdentity'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { touchMyPresence } from '@/services/userPresenceService'
import { shouldSuppressAuthFocusSync } from '@/lib/nativeFileDialogFocus'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { settleAuthBootstrap } from './settleAuthBootstrap'

export interface CurrentUser {
    id: string
    authUserId: string
    username: string
    displayName?: string
    avatar: string
    role?: 'admin' | 'user' | 'moderator'
    isBanned?: boolean
    isActive?: boolean
    stones: number
    ownedItems: any
    premiumExpiresAt?: string | null
    frameType: string | null
    activeProfileEffectId?: string | null
    onboardingCompletedAt?: string | null
    birthDate?: string | null
}

interface AuthContextValue {
    currentUser: CurrentUser | null
    pendingMfa: PendingMfaChallenge | null
    updateCurrentUser: (patch: Partial<CurrentUser>) => void
    isAdmin: boolean
    signIn: (email: string, password: string, options?: { persistAcrossBrowserRestart?: boolean }) => Promise<void>
    verifyMfa: (code: string) => Promise<void>
    cancelPendingMfa: () => Promise<void>
    signOut: () => Promise<void>
    loading: boolean
}

interface SyncCurrentUserOptions {
    allowDuringAuthFlow?: boolean
    force?: boolean
}

interface ClearAuthRuntimeCachesOptions {
    clearEconomy?: boolean
}

type AuthContextGlobalScope = typeof globalThis & {
    __BSGMANGA_AUTH_CONTEXT__?: Context<AuthContextValue | null>
}

const authContextGlobalScope = globalThis as AuthContextGlobalScope
const ACTIVE_SESSION_GUARD_INTERVAL_MS = 60_000
const PRESENCE_HEARTBEAT_INTERVAL_MS = 60_000
const SYNC_CURRENT_USER_THROTTLE_MS = 1_500
const authContextLogger = createScopedLogger('AuthContext')

const AuthContext = authContextGlobalScope.__BSGMANGA_AUTH_CONTEXT__
    ?? createContext<AuthContextValue | null>(null)

if (!authContextGlobalScope.__BSGMANGA_AUTH_CONTEXT__) {
    authContextGlobalScope.__BSGMANGA_AUTH_CONTEXT__ = AuthContext
}

function mapAppUserToCurrentUser(appUser: AppUser): CurrentUser {
    return {
        id: appUser.id,
        authUserId: appUser.authUserId,
        username: appUser.username,
        displayName: appUser.displayName || appUser.username,
        avatar: appUser.avatar,
        role: appUser.role,
        isBanned: appUser.isBanned,
        isActive: appUser.isActive,
        stones: appUser.stones,
        ownedItems: appUser.ownedItems,
        premiumExpiresAt: appUser.premiumExpiresAt,
        frameType: appUser.frameType,
        activeProfileEffectId: appUser.activeProfileEffectId,
        onboardingCompletedAt: appUser.onboardingCompletedAt,
        /*
         * Layout's GATES look at these two fields. Since this is an allowlist,
         * a field forgotten here silently stays null: the birth date was being
         * written to the database but never reached the context, so the gate
         * asked again on every launch.
         */
        birthDate: appUser.birthDate ?? null,
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
    const [pendingMfa, setPendingMfa] = useState<PendingMfaChallenge | null>(null)
    const [loading, setLoading] = useState(true)
    const authSignInFlowRef = useRef(false)
    const authMfaVerifyFlowRef = useRef(false)
    const deferredPostSignInSyncRef = useRef(false)
    const syncCurrentUserRef = useRef<(options?: SyncCurrentUserOptions) => Promise<void>>(async () => { })
    const currentUserRef = useRef<CurrentUser | null>(null)
    const pendingMfaRef = useRef<PendingMfaChallenge | null>(null)
    const sessionGuardChannelRef = useRef<RealtimeChannel | null>(null)
    const sessionGuardRealtimeFallbackLoggedForRef = useRef<string | null>(null)
    const syncRequestIdRef = useRef(0)
    const syncCurrentUserInFlightRef = useRef<Promise<void> | null>(null)
    const lastSyncCurrentUserSettledAtRef = useRef(0)

    useEffect(() => {
        currentUserRef.current = currentUser
        if (currentUser) {
            primeMyAccountEconomySnapshotCache({
                id: currentUser.id,
                stones: currentUser.stones,
                ownedItems: currentUser.ownedItems || {},
                premiumExpiresAt: currentUser.premiumExpiresAt ?? null,
            })
        }
    }, [currentUser])

    useEffect(() => {
        pendingMfaRef.current = pendingMfa
    }, [pendingMfa])

    useEffect(() => {
        if (!currentUser?.id || getE2EMockAuthUser()) return

        const sendHeartbeat = () => {
            if (document.visibilityState === 'visible') void touchMyPresence()
        }
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') sendHeartbeat()
        }

        sendHeartbeat()
        const intervalId = window.setInterval(sendHeartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('focus', sendHeartbeat)

        return () => {
            window.clearInterval(intervalId)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('focus', sendHeartbeat)
        }
    }, [currentUser?.id])

    const clearAuthRuntimeCaches = useCallback((options: ClearAuthRuntimeCachesOptions = {}) => {
        clearAdminUserOverviewSnapshotCache()
        clearCurrentUserIdentityCache()
        clearCurrentAuthSessionSnapshotCache()
        clearMfaStateSummaryCache()
        if (options.clearEconomy !== false) {
            clearMyAccountEconomySnapshotCache()
        }
    }, [])

    useEffect(() => {
        const e2eMockUser = getE2EMockAuthUser()
        if (!e2eMockUser) return

        setE2ERuntimeCurrentUser(currentUser
            ? {
                id: currentUser.id,
                username: currentUser.username,
                stones: currentUser.stones,
                ownedItems: currentUser.ownedItems || {},
                premiumExpiresAt: currentUser.premiumExpiresAt ?? null,
            }
            : null)
    }, [currentUser])

    useEffect(() => {
        const e2eMockUser = getE2EMockAuthUser()
        if (e2eMockUser || !currentUser?.authUserId) {
            const existingChannel = sessionGuardChannelRef.current
            if (existingChannel) {
                sessionGuardChannelRef.current = null
                void supabase.removeChannel(existingChannel)
            }
            sessionGuardRealtimeFallbackLoggedForRef.current = null
            return
        }

        const existingChannel = sessionGuardChannelRef.current
        if (existingChannel) {
            sessionGuardChannelRef.current = null
            void supabase.removeChannel(existingChannel)
        }

        const channel = supabase
            .channel(`session-guard:${currentUser.authUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'auth_session_events',
                    filter: `auth_user_id=eq.${currentUser.authUserId}`,
                },
                () => {
                    void syncCurrentUserRef.current({ force: true })
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    sessionGuardRealtimeFallbackLoggedForRef.current = null
                    return
                }

                if (status === 'CHANNEL_ERROR') {
                    const fallbackKey = currentUser.authUserId
                    if (sessionGuardRealtimeFallbackLoggedForRef.current === fallbackKey) return

                    sessionGuardRealtimeFallbackLoggedForRef.current = fallbackKey
                    authContextLogger.debug({
                        event: 'session-guard-channel-fallback',
                        message: 'session guard realtime kanali baglanamadi; periyodik oturum senkronu devrede.',
                        context: {
                            authUserId: currentUser.authUserId,
                            fallbackIntervalMs: ACTIVE_SESSION_GUARD_INTERVAL_MS,
                        },
                    })
                }
            })

        sessionGuardChannelRef.current = channel

        return () => {
            if (sessionGuardChannelRef.current === channel) {
                sessionGuardChannelRef.current = null
            }
            void supabase.removeChannel(channel)
        }
    }, [currentUser?.authUserId])

    useEffect(() => {
        let isMounted = true
        let authSignedOut = false
        let syncInterval: number | null = null
        const e2eMockUser = getE2EMockAuthUser()

        if (e2eMockUser) {
            setCurrentUser(e2eMockUser)
            setPendingMfa(null)
            setLoading(false)
            return () => {
                isMounted = false
            }
        }

        const syncCurrentUser = async (options: SyncCurrentUserOptions = {}) => {
            if (!options.force) {
                if (syncCurrentUserInFlightRef.current) {
                    await syncCurrentUserInFlightRef.current
                    return
                }

                const now = Date.now()
                if (now - lastSyncCurrentUserSettledAtRef.current < SYNC_CURRENT_USER_THROTTLE_MS) {
                    return
                }
            }

            const requestId = ++syncRequestIdRef.current
            const requestContext = createRequestContext('AuthContext', 'sync-current-user', {
                syncRequestId: requestId,
            })

            let syncPromise: Promise<void> | null = null
            syncPromise = (async () => {
                if ((authSignInFlowRef.current || authMfaVerifyFlowRef.current) && options.allowDuringAuthFlow !== true) {
                    return
                }

                if (pendingMfaRef.current && options.allowDuringAuthFlow !== true) {
                    return
                }

                try {
                    const appUser = await fetchCurrentUser()
                    if (!isMounted || requestId !== syncRequestIdRef.current) return
                    if ((authSignInFlowRef.current || authMfaVerifyFlowRef.current) && options.allowDuringAuthFlow !== true) {
                        return
                    }
                    setPendingMfa(null)
                    const resolvedUser = appUser ? mapAppUserToCurrentUser(appUser) : null
                    currentUserRef.current = resolvedUser
                    setCurrentUser(resolvedUser)
                } catch (err) {
                    if (!isMounted || requestId !== syncRequestIdRef.current) return
                    if ((authSignInFlowRef.current || authMfaVerifyFlowRef.current) && options.allowDuringAuthFlow !== true) {
                        return
                    }
                    if (isMfaRequiredError(err)) {
                        setPendingMfa(err.challenge)
                        setCurrentUser(null)
                        return
                    }
                    if (isAbortError(err)) {
                        return
                    }
                    setPendingMfa(null)
                    if (isSessionReplacedError(err)) {
                        toast.info('Bu hesap baska bir cihazda acildigi icin oturumunuz kapatildi.')
                    } else {
                        const userMessage = toUserFacingErrorMessage(err, 'Oturum bilgileri yuklenemedi.')
                        authContextLogger.error({
                            event: requestContext.event,
                            message: userMessage,
                            context: toRequestContextLogContext(requestContext, {
                                allowDuringAuthFlow: options.allowDuringAuthFlow === true,
                                force: options.force === true,
                                hasPendingMfa: Boolean(pendingMfaRef.current),
                            }),
                            error: err,
                        })
                    }
                    // Gecici auth/RPC sapmalarinda mevcut oturumu dusurmuyoruz.
                    // Neden: guardli rotalarda anlik negatif hydration sonucu /giris yonlendirmesi olusuyordu.
                    if (isMounted && !currentUserRef.current) setCurrentUser(null)
                } finally {
                    if (syncCurrentUserInFlightRef.current === syncPromise) {
                        syncCurrentUserInFlightRef.current = null
                    }
                    lastSyncCurrentUserSettledAtRef.current = Date.now()
                }
            })()

            syncCurrentUserInFlightRef.current = syncPromise
            await syncPromise
        }
        syncCurrentUserRef.current = syncCurrentUser

        void (async () => {
            const settle = () => settleAuthBootstrap(
                () => syncCurrentUser({ force: true }),
                () => syncRequestIdRef.current,
                () => isMounted && !authSignedOut,
            )
            await settle()
            if (!isMounted || authSignedOut) return
            if (!currentUserRef.current && !pendingMfaRef.current) {
                const { data: sessionData, error: sessionError } = await supabase.auth.getSession().catch(() => ({ data: { session: null }, error: null }))
                if (!sessionError && sessionData.session?.access_token) {
                    // Note: during a hard reload the first bootstrap round can briefly return null even
                    // when the session token is ready in storage. To keep guards from producing false
                    // negatives, we give one short second chance on first launch only.
                    await new Promise((resolve) => window.setTimeout(resolve, 180))
                    await settle()
                }
            }
            if (isMounted) setLoading(false)
        })()

        const scheduleSyncCurrentUser = () => {
            // Calling auth methods again from inside a Supabase callback can deadlock the client.
            window.setTimeout(() => {
                if (isMounted && !authSignedOut) void syncCurrentUserRef.current({ force: true })
            }, 0)
        }

        const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
            // INITIAL_SESSION is the first notice of the current session; it does not cancel the open bootstrap query.
            if (event === 'INITIAL_SESSION') return
            syncRequestIdRef.current += 1
            lastSyncCurrentUserSettledAtRef.current = 0
            // We do not reset the economy snapshot on events that keep the same user, such as token refresh.
            // Why: during brief RPC gaps the sidebar coin balance was dropping to 0.
            const shouldClearEconomyCache =
                event === 'SIGNED_OUT'
                || event === 'SIGNED_IN'
                || event === 'USER_UPDATED'
            clearAuthRuntimeCaches({ clearEconomy: shouldClearEconomyCache })
            if ((authSignInFlowRef.current || authMfaVerifyFlowRef.current)
                && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'MFA_CHALLENGE_VERIFIED')) {
                deferredPostSignInSyncRef.current = true
                return
            }
            if (event === 'SIGNED_OUT') {
                // A definite sign-out is not re-queried: cleaning up a missing session also produces SIGNED_OUT.
                authSignedOut = true
                currentUserRef.current = null
                pendingMfaRef.current = null
                setPendingMfa(null)
                setCurrentUser(null)
                setLoading(false)
                return
            }
            authSignedOut = false
            scheduleSyncCurrentUser()
        })

        const handleVisibilitySync = () => {
            if (document.visibilityState === 'visible' && currentUserRef.current) {
                void syncCurrentUser({ force: true })
            }
        }

        const handleWindowFocus = () => {
            if (currentUserRef.current) {
                if (shouldSuppressAuthFocusSync()) {
                    return
                }
                void syncCurrentUser()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilitySync)
        window.addEventListener('focus', handleWindowFocus)
        syncInterval = window.setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return
            }
            if (currentUserRef.current) {
                void syncCurrentUser()
            }
        }, ACTIVE_SESSION_GUARD_INTERVAL_MS)

        return () => {
            isMounted = false
            if (syncInterval != null) {
                window.clearInterval(syncInterval)
            }
            document.removeEventListener('visibilitychange', handleVisibilitySync)
            window.removeEventListener('focus', handleWindowFocus)
            authListener.subscription.unsubscribe()
        }
    }, [clearAuthRuntimeCaches])

    const updateCurrentUser = useCallback((patch: Partial<CurrentUser>) => {
        setCurrentUser((prev) => (prev ? { ...prev, ...patch } : null))
    }, [])

    const handleSignIn = useCallback(async (
        email: string,
        password: string,
        options?: { persistAcrossBrowserRestart?: boolean },
    ) => {
        authSignInFlowRef.current = true
        deferredPostSignInSyncRef.current = false
        setPendingMfa(null)

        let flowError: unknown = null
        let signInCompleted = false
        try {
            syncRequestIdRef.current += 1
            const result = await signInWithEmail(email, password, options)
            if (result.status === 'mfa_required') {
                setCurrentUser(null)
                setPendingMfa(result.challenge)
                return
            }

            signInCompleted = true
            setPendingMfa(null)
            setCurrentUser(mapAppUserToCurrentUser(result.user))
        } catch (error) {
            flowError = error
        } finally {
            authSignInFlowRef.current = false

            if ((flowError === null && signInCompleted) || deferredPostSignInSyncRef.current) {
                try {
                    await syncCurrentUserRef.current({ allowDuringAuthFlow: true })
                } catch (syncError) {
                    if (flowError === null && !signInCompleted) {
                        flowError = syncError
                    } else {
                        const requestContext = createRequestContext('AuthContext', 'post-sign-in-sync-warning', {
                            deferredSync: deferredPostSignInSyncRef.current,
                        })
                        authContextLogger.warn({
                            event: requestContext.event,
                            message: 'oturum sonrasi ek senkron uyari verdi.',
                            context: toRequestContextLogContext(requestContext),
                            error: syncError,
                        })
                    }
                }
            }

            deferredPostSignInSyncRef.current = false
        }

        if (flowError) {
            throw flowError
        }
    }, [])

    const handleVerifyMfa = useCallback(async (code: string) => {
        const activeChallenge = pendingMfaRef.current
        if (!activeChallenge) {
            throw new Error('Bekleyen 2FA dogrulamasi bulunamadi.')
        }

        authMfaVerifyFlowRef.current = true
        deferredPostSignInSyncRef.current = false

        let flowError: unknown = null
        try {
            syncRequestIdRef.current += 1
            const verifiedUser = await verifyPendingMfaChallenge(activeChallenge, code)
            setPendingMfa(null)
            setCurrentUser(mapAppUserToCurrentUser(verifiedUser))
        } catch (error) {
            flowError = error
        } finally {
            authMfaVerifyFlowRef.current = false

            if (flowError === null || deferredPostSignInSyncRef.current) {
                try {
                    await syncCurrentUserRef.current({ allowDuringAuthFlow: true })
                } catch (syncError) {
                    if (flowError === null) {
                        flowError = syncError
                    } else {
                        const requestContext = createRequestContext('AuthContext', 'post-mfa-sync-warning', {
                            deferredSync: deferredPostSignInSyncRef.current,
                        })
                        authContextLogger.warn({
                            event: requestContext.event,
                            message: 'mfa sonrasi ek senkron uyari verdi.',
                            context: toRequestContextLogContext(requestContext),
                            error: syncError,
                        })
                    }
                }
            }

            deferredPostSignInSyncRef.current = false
        }

        if (flowError) {
            throw flowError
        }
    }, [])

    const handleCancelPendingMfa = useCallback(async () => {
        syncRequestIdRef.current += 1
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        clearAuthRuntimeCaches()
        lastSyncCurrentUserSettledAtRef.current = 0
        setPendingMfa(null)
        setCurrentUser(null)
    }, [clearAuthRuntimeCaches])

    const handleSignOut = useCallback(async () => {
        await signOut()
        clearAuthRuntimeCaches()
        lastSyncCurrentUserSettledAtRef.current = 0
        setPendingMfa(null)
        setCurrentUser(null)
    }, [clearAuthRuntimeCaches])

    const isAdmin = currentUser?.role === 'admin'

    return (
        <AuthContext.Provider
            value={{
                currentUser,
                pendingMfa,
                updateCurrentUser,
                isAdmin,
                signIn: handleSignIn,
                verifyMfa: handleVerifyMfa,
                cancelPendingMfa: handleCancelPendingMfa,
                signOut: handleSignOut,
                loading,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
