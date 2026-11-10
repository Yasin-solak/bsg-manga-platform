import { type ReactElement, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Navigate } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { getAdminUserOverviewSnapshot } from '@/services/adminUserService/overviewSnapshot'
import { txa } from '@/i18n/activeLocale'

interface RequireAdminRouteProps {
    children: ReactElement
}

function RequireAdminRoute({ children }: RequireAdminRouteProps) {
    const { currentUser, loading } = useAuth()
    const location = useLocation()
    const { isAdminResolved, resolvingAdminAccess } = useResolvedAdminAccess(currentUser)
    const [authoritativeAdminAccess, setAuthoritativeAdminAccess] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false

        if (!currentUser?.id) {
            setAuthoritativeAdminAccess(null)
            return
        }

        if (currentUser.role === 'admin' || isAdminResolved) {
            setAuthoritativeAdminAccess(true)
            return
        }

        if (loading || resolvingAdminAccess) {
            setAuthoritativeAdminAccess(null)
            return
        }

        setAuthoritativeAdminAccess(null)

        // Why: even if the role chain is late on a hard reload of /admin, when the admin RPC
        // succeeds we do not send the user home on a false negative.
        void (async () => {
            try {
                await getAdminUserOverviewSnapshot({ force: true })
                if (cancelled) return
                setAuthoritativeAdminAccess(true)
            } catch {
                if (cancelled) return
                setAuthoritativeAdminAccess(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [currentUser?.id, currentUser?.role, isAdminResolved, loading, resolvingAdminAccess])

    const hasResolvedAdminAccess = currentUser?.role === 'admin'
        || isAdminResolved
        || authoritativeAdminAccess === true
    const probingAuthoritativeAdminAccess = Boolean(
        currentUser?.id
        && !loading
        && !resolvingAdminAccess
        && !hasResolvedAdminAccess
        && authoritativeAdminAccess === null,
    )

    if (loading || resolvingAdminAccess || probingAuthoritativeAdminAccess) {
        return <div className="admin-route-loading">{txa('Yetki kontrolü yapılıyor...')}</div>
    }

    if (!currentUser) {
        return <Navigate to="/giris" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
    }

    if (!hasResolvedAdminAccess) {
        return <Navigate to="/" replace />
    }

    return children
}

export default RequireAdminRoute
