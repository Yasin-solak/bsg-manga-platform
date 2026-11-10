import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearAdminSecurityAlertMute,
  listAdminSecurityAlertMutes,
  listAdminSecurityAlertRules,
  listAdminSecurityAlerts,
  setAdminSecurityAlertMute,
  setAdminSecurityAlertStatus,
  updateAdminSecurityAlertRule,
  type SecurityAlertFilterParams,
  type SecurityAlertItem,
  type SecurityAlertMuteItem,
  type SecurityAlertRuleItem,
  type SecurityAlertStatus,
} from '@/services/adminSecurityService'
import { toast } from '@/services/toastService'
import {
  initialDraft,
  toErrorMessage,
  type AlertStatusFilter,
  type RuleDraftState,
} from './security/adminOpsSecurityAlertsUtils'
import { AdminOpsSecurityAlertRulesCard } from './security/AdminOpsSecurityAlertRulesCard'
import { AdminOpsSecurityActiveAlertsCard } from './security/AdminOpsSecurityActiveAlertsCard'
import { txa } from '@/i18n/activeLocale'

function AdminOpsSecurityAlertsPanel() {
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [rules, setRules] = useState<SecurityAlertRuleItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, RuleDraftState>>({})
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null)

  const [mutes, setMutes] = useState<SecurityAlertMuteItem[]>([])
  const [mutesLoading, setMutesLoading] = useState(false)
  const [mutesError, setMutesError] = useState<string | null>(null)
  const [muteBusyKey, setMuteBusyKey] = useState<string | null>(null)

  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [alertsStatusFilter, setAlertsStatusFilter] =
    useState<AlertStatusFilter>('open')
  const [alertsSearch, setAlertsSearch] = useState('')
  const [alertsLimit, setAlertsLimit] = useState(120)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    setRulesLoading(true)
    setRulesError(null)
    try {
      const rows = await listAdminSecurityAlertRules()
      setRules(rows)
      setDrafts(() => {
        const next: Record<string, RuleDraftState> = {}
        for (const row of rows) {
          next[row.id] = initialDraft(row)
        }
        return next
      })
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] loadRules error', error)
      setRules([])
      setRulesError(toErrorMessage(error, txa('Alarm kuralları yüklenemedi.')))
    } finally {
      setRulesLoading(false)
    }
  }, [])

  const loadMutes = useCallback(async () => {
    setMutesLoading(true)
    setMutesError(null)
    try {
      const rows = await listAdminSecurityAlertMutes()
      setMutes(rows)
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] loadMutes error', error)
      setMutes([])
      setMutesError(toErrorMessage(error, txa('Susturma listesi yüklenemedi.')))
    } finally {
      setMutesLoading(false)
    }
  }, [])

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true)
    setAlertsError(null)
    try {
      const params: SecurityAlertFilterParams = {
        status: alertsStatusFilter,
        limit: alertsLimit,
        search: alertsSearch,
      }
      const rows = await listAdminSecurityAlerts(params)
      setAlerts(rows)
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] loadAlerts error', error)
      setAlerts([])
      setAlertsError(toErrorMessage(error, txa('Alarm listesi yüklenemedi.')))
    } finally {
      setAlertsLoading(false)
    }
  }, [alertsLimit, alertsSearch, alertsStatusFilter])

  useEffect(() => {
    void Promise.all([loadRules(), loadMutes(), loadAlerts()])
  }, [loadAlerts, loadMutes, loadRules])

  const mutesByEventSource = useMemo(() => {
    const map = new Map<string, SecurityAlertMuteItem>()
    for (const item of mutes) {
      map.set(`${item.eventType}::${item.source || ''}`, item)
    }
    return map
  }, [mutes])

  function updateRuleDraft(ruleId: string, patch: Partial<RuleDraftState>) {
    setDrafts((prev) => ({
      ...prev,
      [ruleId]: {
        ...prev[ruleId],
        ...patch,
      },
    }))
  }

  /**
   * Saves the rule.
   *
   * `patch` is required: the on/off switch in the row starts a write before draft state
   * commits. Reading only from `drafts` would send the OLD value;
   * the switch would visibly flip while the rule stayed the same.
   */
  async function handleSaveRule(rule: SecurityAlertRuleItem, patch?: Partial<RuleDraftState>) {
    const draft = { ...(drafts[rule.id] || initialDraft(rule)), ...patch }
    setSavingRuleId(rule.id)
    try {
      const updated = await updateAdminSecurityAlertRule({
        id: rule.id,
        windowMinutes: draft.windowMinutes,
        thresholdCount: draft.thresholdCount,
        dedupeMinutes: draft.dedupeMinutes,
        severity: draft.severity,
        isActive: draft.isActive,
      })
      setRules((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
      setDrafts((prev) => ({
        ...prev,
        [updated.id]: initialDraft(updated),
      }))
      toast.success(txa('Alarm kuralı güncellendi.'))
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] handleSaveRule error', error)
      toast.error(toErrorMessage(error, txa('Alarm kurali kaydedilemedi.')))
    } finally {
      setSavingRuleId(null)
    }
  }

  async function handleMute(
    rule: SecurityAlertRuleItem,
    durationMinutes: 15 | 60 | 1440,
  ) {
    const key = `${rule.eventType}::${rule.source || ''}`
    setMuteBusyKey(key)
    try {
      await setAdminSecurityAlertMute({
        eventType: rule.eventType,
        source: rule.source,
        durationMinutes,
      })
      toast.success(txa('Alarm {v1} dakika susturuldu.', { v1: durationMinutes }))
      await Promise.all([loadMutes(), loadRules(), loadAlerts()])
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] handleMute error', error)
      toast.error(toErrorMessage(error, txa('Alarm susturulamadı.')))
    } finally {
      setMuteBusyKey(null)
    }
  }

  async function handleClearMute(rule: SecurityAlertRuleItem) {
    const key = `${rule.eventType}::${rule.source || ''}`
    setMuteBusyKey(key)
    try {
      const cleared = await clearAdminSecurityAlertMute({
        eventType: rule.eventType,
        source: rule.source,
      })
      if (cleared) {
        toast.success(txa('Mute kaldirildi.'))
      } else {
        toast.info(txa('Aktif susturma kaydı bulunamadı.'))
      }
      await Promise.all([loadMutes(), loadRules(), loadAlerts()])
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] handleClearMute error', error)
      toast.error(toErrorMessage(error, txa('Susturma kaldırılamadı.')))
    } finally {
      setMuteBusyKey(null)
    }
  }

  async function handleSetAlertStatus(alertId: string, status: SecurityAlertStatus) {
    setStatusBusyId(alertId)
    try {
      await setAdminSecurityAlertStatus({
        alertId,
        status,
      })
      toast.success(txa('Alarm durumu güncellendi.'))
      await loadAlerts()
    } catch (error) {
      console.error('[AdminOpsSecurityAlertsPanel] handleSetAlertStatus error', error)
      toast.error(toErrorMessage(error, txa('Alarm durumu güncellenemedi.')))
    } finally {
      setStatusBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminOpsSecurityAlertRulesCard
        rulesLoading={rulesLoading}
        rulesError={rulesError}
        rules={rules}
        drafts={drafts}
        savingRuleId={savingRuleId}
        mutes={mutes}
        mutesLoading={mutesLoading}
        mutesError={mutesError}
        mutesByEventSource={mutesByEventSource}
        muteBusyKey={muteBusyKey}
        onReload={() => {
          void Promise.all([loadRules(), loadMutes()])
        }}
        onUpdateRuleDraft={updateRuleDraft}
        onMute={(rule, durationMinutes) => {
          void handleMute(rule, durationMinutes)
        }}
        onClearMute={(rule) => {
          void handleClearMute(rule)
        }}
        onSaveRule={(rule, patch) => {
          void handleSaveRule(rule, patch)
        }}
      />

      <AdminOpsSecurityActiveAlertsCard
        alertsLoading={alertsLoading}
        alertsError={alertsError}
        alerts={alerts}
        alertsSearch={alertsSearch}
        alertsStatusFilter={alertsStatusFilter}
        alertsLimit={alertsLimit}
        statusBusyId={statusBusyId}
        onAlertsSearchChange={setAlertsSearch}
        onAlertsStatusFilterChange={setAlertsStatusFilter}
        onAlertsLimitChange={setAlertsLimit}
        onReload={() => {
          void loadAlerts()
        }}
        onSetAlertStatus={(alertId, status) => {
          void handleSetAlertStatus(alertId, status)
        }}
      />
    </div>
  )
}

export default AdminOpsSecurityAlertsPanel
