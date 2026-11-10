import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Wrench } from 'lucide-react'
import {
  listAdminFeatureFlags,
  setAdminFeatureFlag,
} from '@/services/adminOpsService'
import { notifyFeatureFlagUpdated } from '@/services/featureFlagService'
import { toast } from '@/services/toastService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Maintenance mode switch.
 *
 * **Why a separate box, not a row in the Feature Flags tab.** Maintenance mode closes the
 * WHOLE site to visitors in one click; as one row among dozens of flags it would be easy
 * to turn on by accident. Here it has its own box, its result is written and
 * TURNING ON takes two steps.
 *
 * Turning off is one step: ending an outage should always be easier than starting
 * one.
 *
 * The flag system is used underneath; a separate mechanism would create a second
 * source of truth.
 */

const MAINTENANCE_FLAG = 'system.maintenance'

/**
 * `is_public` must be sent as true on EVERY write.
 *
 * `set_feature_flag` is a FULL OVERWRITE, not a PATCH: an unsent field falls to
 * its default. The first version of the card sent only `isEnabled`, and
 * every turn-on silently made the flag NOT PUBLIC. Result:
 * `get_runtime_feature_flags` does not return a non-public flag to anon users, the gate fails open and
 * maintenance mode did not work for EXACTLY ITS TARGET AUDIENCE:
 * the admin thought it was on while visitors browsed the site.
 */
const MAINTENANCE_IS_PUBLIC = true

export function AdminOpsMaintenanceCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [label, setLabel] = useState(txa('Bakım modu'))
  const [description, setDescription] = useState('')
  const [rolloutPercent, setRolloutPercent] = useState(100)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      const flags = await listAdminFeatureFlags()
      const flag = flags.find((item) => item.key === MAINTENANCE_FLAG)
      if (flag?.label) setLabel(flag.label)
      // Existing fields are CARRIED: since a write is a full overwrite,
      // every unsent field is lost.
      setDescription(flag?.description ?? '')
      setRolloutPercent(flag?.rolloutPercent ?? 100)
      setEnabled(flag?.isEnabled ?? false)
    } catch {
      setEnabled(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const apply = async (next: boolean) => {
    setSaving(true)
    try {
      // If the flag row does not exist the same call creates it; written with key+label so no
      // separate setup step is needed.
      //
      // ALL fields are sent: `set_feature_flag` is a full overwrite, not a patch.
      // A missing field falls to its default and maintenance mode silently
      // breaks (see MAINTENANCE_IS_PUBLIC).
      await setAdminFeatureFlag({
        key: MAINTENANCE_FLAG,
        label,
        description,
        rolloutPercent,
        isPublic: MAINTENANCE_IS_PUBLIC,
        isEnabled: next,
      })
      setEnabled(next)
      setConfirming(false)
      // Acik sekmeler yenilenmeden haberdar olsun.
      notifyFeatureFlagUpdated(MAINTENANCE_FLAG, next)
      toast.success(next ? txa('Bakım modu açıldı.') : txa('Bakım modu kapatıldı.'))
    } catch {
      toast.error(txa('Bakım modu değiştirilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminSurface
      className={cn('space-y-3 p-4', enabled && 'border-amber-500/40 bg-amber-500/5')}
      data-testid="admin-ops-maintenance"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 flex items-center gap-1.5 font-heading text-sm text-foreground">
          <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
          {txa('Bakim modu')}
        </h3>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            enabled ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
          )}
        >
          {enabled === null ? txa('bilinmiyor') : enabled ? txa('açık') : txa('kapalı')}
        </span>
      </div>

      <p className="m-0 text-[11px] leading-4 text-muted-foreground">
        {txa('Acikken site ziyaretcilere kapanir;')}{' '}<strong className="text-foreground">{txa('adminler girmeye devam eder')}</strong>.
        {txa('Bayrak okunamazsa site acik kalir.')}
      </p>

      {confirming ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="m-0 flex items-start gap-1.5 text-[11px] leading-4 text-foreground">
            <AlertTriangle className="mt-px size-3 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{txa('Tüm ziyaretçiler bakım ekranını görecek. Emin misin?')}</span>
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {enabled ? (
          // Kapatmak TEK adim: kesintiyi bitirmek baslatmaktan kolay olmali.
          <Button type="button" size="sm" className="min-h-11" disabled={saving} onClick={() => { void apply(false) }}>
            {txa('Bakim modunu kapat')}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant={confirming ? 'default' : 'outline'}
              className="min-h-11"
              disabled={saving || enabled === null}
              onClick={() => (confirming ? void apply(true) : setConfirming(true))}
            >
              {confirming ? txa('Evet, bakım moduna al') : txa('Bakım moduna al')}
            </Button>
            {confirming ? (
              <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setConfirming(false)}>
                {txa('Vazgec')}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </AdminSurface>
  )
}
