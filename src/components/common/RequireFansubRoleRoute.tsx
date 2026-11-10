import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Navigate } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { getMyFansubRole } from '@/services/fansubMembershipService'
import { getMyFansubPermissions, type FansubPermission } from '@/services/fansubRolesService'
import { getFansubByIdentifier } from '@/services/fansubService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { txa } from '@/i18n/activeLocale'

type FansubMemberRole = 'admin' | 'moderator' | 'member'

interface RequireFansubRoleRouteProps {
    children: ReactElement
    allowedRoles: FansubMemberRole[]
    /**
     * If given, access depends on the permission, not the role: a fansub admin or a member with this
     * permission (from Roles and Permissions) enters; allowedRoles is checked only for 'admin'.
     */
    requiredPermission?: FansubPermission
}

const requireFansubRoleRouteLogger = createScopedLogger('RequireFansubRoleRoute')

function RequireFansubRoleRoute({ children, allowedRoles, requiredPermission }: RequireFansubRoleRouteProps) {
    const { currentUser, loading } = useAuth()
    const { id: fansubId } = useParams<{ id: string }>()
    const location = useLocation()
    const { isAdminResolved, resolvingAdminAccess } = useResolvedAdminAccess(currentUser)

    const [roleLoading, setRoleLoading] = useState(true)
    const [currentFansubRole, setCurrentFansubRole] = useState<FansubMemberRole | null>(null)
    const [resolvedFansubId, setResolvedFansubId] = useState<string | null>(null)
    const [permissionGranted, setPermissionGranted] = useState(false)

    const safeAllowedRoles = useMemo(
        () => Array.from(new Set(allowedRoles)),
        [allowedRoles],
    )

    useEffect(() => {
        let isMounted = true

        async function loadRole() {
            if (loading) return
            if (!currentUser || !fansubId) {
                if (isMounted) {
                    setCurrentFansubRole(null)
                    setResolvedFansubId(null)
                    setRoleLoading(false)
                }
                return
            }

            // If the URL parameter is a UUID, identity resolution and the role query use the same id;
            // running both calls in parallel saves a full network round on the critical path.
            // With a slug parameter the role query waits for the resolved id,
            // so they stay serial.
            const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fansubId)
            const eagerRolePromise = looksLikeUuid
                ? getMyFansubRole(fansubId, currentUser.id).catch(() => null)
                : null

            let actualFansubId = fansubId
            try {
                const fansub = await getFansubByIdentifier(fansubId)
                actualFansubId = fansub.id
                if (isMounted) setResolvedFansubId(fansub.id)
            } catch (error) {
                const requestContext = createRequestContext('RequireFansubRoleRoute', 'resolve-fansub-error', {
                    fansubId,
                    userId: currentUser.id,
                })
                requireFansubRoleRouteLogger.warn({
                    event: requestContext.event,
                    message: 'fansub kimligi cozumlenemedi.',
                    context: toRequestContextLogContext(requestContext),
                    error,
                })
                if (isMounted) {
                    setCurrentFansubRole(null)
                    setResolvedFansubId(null)
                    setRoleLoading(false)
                }
                return
            }

            if (currentUser.role === 'admin' || isAdminResolved) {
                if (isMounted) {
                    setCurrentFansubRole('admin')
                    setRoleLoading(false)
                }
                return
            }

            try {
                const role = eagerRolePromise && actualFansubId === fansubId
                    ? await eagerRolePromise
                    : await getMyFansubRole(actualFansubId, currentUser.id)
                if (!isMounted) return
                if (role === 'admin' || role === 'moderator' || role === 'member') {
                    setCurrentFansubRole(role)
                } else {
                    setCurrentFansubRole(null)
                }
                if (requiredPermission && role && role !== 'admin') {
                    const permissions = await getMyFansubPermissions(actualFansubId).catch(() => new Set<FansubPermission>())
                    if (isMounted) setPermissionGranted(permissions.has(requiredPermission))
                } else if (isMounted) {
                    setPermissionGranted(false)
                }
            } catch (error) {
                const requestContext = createRequestContext('RequireFansubRoleRoute', 'load-role-error', {
                    fansubId,
                    resolvedFansubId: actualFansubId,
                    userId: currentUser.id,
                })
                requireFansubRoleRouteLogger.warn({
                    event: requestContext.event,
                    message: 'fansub rol yukleme uyari verdi.',
                    context: toRequestContextLogContext(requestContext),
                    error,
                })
                if (!isMounted) return
                setCurrentFansubRole(null)
            } finally {
                if (isMounted) setRoleLoading(false)
            }
        }

        setRoleLoading(true)
        void loadRole()

        return () => {
            isMounted = false
        }
        // Not: currentUser nesnesi periyodik oturum senkronunda yeniden uretiliyor.
        // Obje referansina bagli kalirsak efekt her sync'te tekrar kosup tam ekran
        // "Yetki kontrolu" gosterir ve cocuk sayfayi remount eder (sekme gecisinde
        // flash + studio'nun yeniden "yukleniyor"a dusmesi). Bu yuzden yalnizca
        // primitive kimlik/rol degisimini izliyoruz.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fansubId, isAdminResolved, loading, currentUser?.id, currentUser?.role, requiredPermission])

    const fansubRoleGrantsAccess = requiredPermission
        ? currentFansubRole === 'admin' || permissionGranted
        : currentFansubRole !== null && safeAllowedRoles.includes(currentFansubRole)

    if (loading || roleLoading) {
        return <div className="admin-route-loading">{txa('Yetki kontrolü yapılıyor...')}</div>
    }

    if (!currentUser) {
        return <Navigate to="/giris" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
    }

    if (!fansubId) {
        return <Navigate to="/fansublar" replace />
    }

    // If the fansub role grants access, DO NOT WAIT for site admin resolution: admin rights
    // only ADD access, never restrict it. So a regular fansub admin
    // (the typical invited user) never feels the admin role RPC's delay;
    // admin resolution finishes in the background.
    if (fansubRoleGrantsAccess) {
        if (resolvedFansubId && fansubId !== resolvedFansubId) {
            const suffix = location.pathname.match(/^\/fansub\/[^/]+(.*)$/)?.[1] ?? ''
            return <Navigate to={`/fansub/${resolvedFansubId}${suffix}${location.search}${location.hash}`} replace />
        }
        return children
    }

    if (resolvingAdminAccess) {
        return <div className="admin-route-loading">{txa('Yetki kontrolü yapılıyor...')}</div>
    }

    if (currentUser.role === 'admin' || isAdminResolved) {
        if (resolvedFansubId && fansubId !== resolvedFansubId) {
            const suffix = location.pathname.match(/^\/fansub\/[^/]+(.*)$/)?.[1] ?? ''
            return <Navigate to={`/fansub/${resolvedFansubId}${suffix}${location.search}${location.hash}`} replace />
        }
        return children
    }

    return <Navigate to={`/fansub/${fansubId}`} replace />
}

export default RequireFansubRoleRoute
