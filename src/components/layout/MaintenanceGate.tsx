import { useEffect, useState, type ReactNode } from 'react'
import { Wrench } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { isFeatureEnabled, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { txa } from '@/i18n/activeLocale'

/**
 * Maintenance mode gate.
 *
 * **FAILS OPEN.** If the flag cannot be read the site stays OPEN. We did the opposite on security
 * gates (unreadable flag = closed); here it is deliberately reversed: closing the
 * whole site because of a network error would be a bigger outage than what maintenance
 * mode tries to prevent.
 *
 * **Admin ALWAYS gets in.** If the person who enabled maintenance locked themselves out,
 * they could not turn it back off.
 *
 * Flag changes are listened to LIVE: users do not need to refresh
 * for the mode to end.
 */

const MAINTENANCE_FLAG = 'system.maintenance'

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth()
  const { isAdminResolved } = useResolvedAdminAccess(currentUser)
  const [maintenance, setMaintenance] = useState(false)

  const isAdmin = currentUser?.role === 'admin' || isAdminResolved

  useEffect(() => {
    let cancelled = false

    const read = async (forceRefresh = false) => {
      // `false` if unreadable: the site stays open.
      const enabled = await isFeatureEnabled(MAINTENANCE_FLAG, false, forceRefresh).catch(() => false)
      if (!cancelled) setMaintenance(enabled)
    }

    void read()
    const unsubscribe = listenFeatureFlagUpdates((payload) => {
      if (payload.key !== MAINTENANCE_FLAG) return
      void read(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // No decision before the session resolves: an admin briefly seeing the maintenance screen
  // would panic the person trying to turn it off.
  if (!maintenance || loading || isAdmin) return <>{children}</>

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4" data-testid="maintenance-gate">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Wrench className="mx-auto size-10 text-muted-foreground/50" aria-hidden="true" />
        <h1 className="mt-4 font-heading text-xl text-foreground">{txa('Kısa bir bakımdayız')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {txa('BSG Manga şu anda bakım modunda. Kısa süre içinde geri döneceğiz;')}
          {txa('birazdan tekrar deneyebilirsin.')}
        </p>
      </div>
    </div>
  )
}
