import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import {
  listAdminAuditLogs,
  listAdminFeatureFlags,
  normalizeFeatureFlagKey,
  setAdminFeatureFlag,
  type AdminAuditLogItem,
  type AdminFeatureFlagItem,
} from '@/services/adminOpsService'
import {
  listAdminSecurityAlerts,
  type SecurityAlertItem,
} from '@/services/adminSecurityService'
import { createScopedLogger } from '@/services/logger'
import { toast } from '@/services/toastService'
import { convertExistingCoversToWebP, type ConversionProgress } from '@/services/storageService/bulkWebpConverter'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowRight, ImageDown } from 'lucide-react'
import AdminOpsSecuritySection from './ops/AdminOpsSecuritySection'
import AdminOpsStatusSection from './ops/AdminOpsStatusSection'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { AdminOpsTabs } from './ops/AdminOpsTabs'
import { AdminOpsFeatureFlagStats, type FeatureFlagFilter } from './ops/AdminOpsFeatureFlagStats'
import { AdminOpsFeatureFlagCreateCard } from './ops/AdminOpsFeatureFlagCreateCard'
import { AdminOpsFeatureFlagToolbar } from './ops/AdminOpsFeatureFlagToolbar'
import { AdminOpsFeatureFlagList } from './ops/AdminOpsFeatureFlagList'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminOpsAuditStats } from './ops/AdminOpsAuditStats'
import { AdminOpsAuditFiltersCard } from './ops/AdminOpsAuditFiltersCard'
import { AdminOpsAuditFeed } from './ops/AdminOpsAuditFeed'
import {
  DEFAULT_NEW_FLAG_FORM,
  buildFlagDraftMap,
  toErrorMessage,
  type FeatureFlagDraft,
  type NewFeatureFlagFormState,
  type OpsTab,
} from './ops/adminOpsUtils'
import { txa, intlLocale } from '@/i18n/activeLocale'

const adminOpsLogger = createScopedLogger('admin.opsSection')

const OPS_TAB_TO_HASH: Record<OpsTab, string> = {
  status: 'durum',
  feature_flags: 'feature-flags',
  audit_logs: 'audit-logs',
  security: 'security',
}

/** Filtre etiketi tabloda gosterilir: daraltilmis liste sessizce daralmamali. */
const FLAG_FILTER_LABELS: Record<FeatureFlagFilter, string> = {
  all: '',
  get enabled() { return txa('Aktif') },
  get disabled() { return txa('Pasif') },
  get public() { return txa('Public') },
}

function opsTabFromHash(hash: string): OpsTab {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase()
  if (normalized === 'durum') return 'status'
  if (normalized === 'audit-logs') return 'audit_logs'
  if (normalized === 'security') return 'security'
  return 'feature_flags'
}

function AdminOpsSection() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = useMemo(
    () => opsTabFromHash(location.hash),
    [location.hash],
  )

  const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlagItem[]>([])
  const [featureFlagDrafts, setFeatureFlagDrafts] = useState<
    Record<string, FeatureFlagDraft>
  >({})
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(true)
  const [featureFlagsError, setFeatureFlagsError] = useState<string | null>(null)
  const [savingFlagId, setSavingFlagId] = useState<string | null>(null)
  /** Counter boxes are filters; the selected one narrows the list. */
  const [flagFilter, setFlagFilter] = useState<FeatureFlagFilter>('all')
  const [flagSearch, setFlagSearch] = useState('')
  const [newFlagForm, setNewFlagForm] =
    useState<NewFeatureFlagFormState>(DEFAULT_NEW_FLAG_FORM)
  const [creatingFlag, setCreatingFlag] = useState(false)
  /** New flag form; a panel opened by a button in the handoff. */
  const [createFormOpen, setCreateFormOpen] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditResourceFilter, setAuditResourceFilter] = useState('all')
  const [auditLimit, setAuditLimit] = useState(120)

  /*
   * The open alarm summary is loaded HERE for the tab bar and page title.
   *
   * Status and Security tabs make their own alarm calls; this third call must be
   * independent of the tab: the badge should show without the user ever entering
   * that tab. It stays `null` while the count is unknown, since an empty badge would read
   * as "zero alarms".
   */
  const [openAlerts, setOpenAlerts] = useState<SecurityAlertItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    listAdminSecurityAlerts({ status: 'open' })
      .then((rows) => { if (!cancelled) setOpenAlerts(rows) })
      .catch((error) => {
        // The badge is not decoration, but it does not stop the page either: if the alarm count cannot be
        // read, no badge is shown (an empty badge would read as "zero alarms").
        // The error is not swallowed; it goes to the structured log.
        adminOpsLogger.error({
          event: 'open-alerts-badge',
          message: txa('Açık alarm sayısı yüklenemedi.'),
          error,
        })
        if (!cancelled) setOpenAlerts(null)
      })
    return () => { cancelled = true }
  }, [])

  const criticalAlertCount = (openAlerts ?? []).filter((item) => item.severity === 'critical').length

  // Bulk WebP conversion
  const [webpRunning, setWebpRunning] = useState(false)
  const [webpProgress, setWebpProgress] = useState<ConversionProgress | null>(null)

  useEffect(() => {
    if (location.hash) return
    navigate(
      {
        pathname: location.pathname,
        hash: `#${OPS_TAB_TO_HASH.feature_flags}`,
      },
      { replace: true },
    )
  }, [location.hash, location.pathname, navigate])

  const loadFeatureFlags = useCallback(async () => {
    setFeatureFlagsLoading(true)
    setFeatureFlagsError(null)
    try {
      const rows = await listAdminFeatureFlags()
      setFeatureFlags(rows)
      setFeatureFlagDrafts(buildFlagDraftMap(rows))
    } catch (error) {
      console.error('[AdminOpsSection] loadFeatureFlags error', error)
      setFeatureFlags([])
      setFeatureFlagDrafts({})
      setFeatureFlagsError(toErrorMessage(error, txa('Bayrak listesi yüklenemedi.')))
    } finally {
      setFeatureFlagsLoading(false)
    }
  }, [])

  /**
   * Fetches the audit record.
   *
   * `overrides` is required: pressing a chip starts the fetch before filter state
   * commits; reading state would bring data for the PREVIOUS filter and the click
   * would seem to do nothing.
   */
  const loadAuditLogs = useCallback(async (overrides?: {
    action?: string
    resourceType?: string
    search?: string
    limit?: number
  }) => {
    const action = overrides?.action ?? auditActionFilter
    const resourceType = overrides?.resourceType ?? auditResourceFilter
    const search = overrides?.search ?? auditSearch
    const limit = overrides?.limit ?? auditLimit

    setAuditLoading(true)
    setAuditError(null)
    try {
      const rows = await listAdminAuditLogs({
        limit,
        search,
        action: action === 'all' ? undefined : action,
        resourceType: resourceType === 'all' ? undefined : resourceType,
      })
      setAuditLogs(rows)
      setAuditLoaded(true)
    } catch (error) {
      console.error('[AdminOpsSection] loadAuditLogs error', error)
      setAuditLogs([])
      setAuditLoaded(false)
      setAuditError(toErrorMessage(error, txa('Denetim kayıtları yüklenemedi.')))
    } finally {
      setAuditLoading(false)
    }
  }, [auditActionFilter, auditLimit, auditResourceFilter, auditSearch])

  useEffect(() => {
    void loadFeatureFlags()
  }, [loadFeatureFlags])

  useEffect(() => {
    if (activeTab !== 'audit_logs' || auditLoaded || auditLoading) return
    void loadAuditLogs()
  }, [activeTab, auditLoaded, auditLoading, loadAuditLogs])

  const flagStats = useMemo(() => {
    const total = featureFlags.length
    const enabled = featureFlags.filter((item) => item.isEnabled).length
    const disabled = total - enabled
    const publicCount = featureFlags.filter((item) => item.isPublic).length
    return { total, enabled, disabled, publicCount }
  }, [featureFlags])

  /**
   * Gorunen bayraklar: kutulardan secilen filtre + arama.
   *
   * 22 bayrak arasinda aradigini bulmak goz taramasi demekti; sayaclar da
   * oluydu. Ikisi birlestirildi.
   */
  const visibleFlags = useMemo(() => {
    const term = flagSearch.trim().toLocaleLowerCase(intlLocale())
    return featureFlags.filter((item) => {
      if (flagFilter === 'enabled' && !item.isEnabled) return false
      if (flagFilter === 'disabled' && item.isEnabled) return false
      if (flagFilter === 'public' && !item.isPublic) return false
      if (!term) return true
      return item.key.toLocaleLowerCase(intlLocale()).includes(term)
        || item.label.toLocaleLowerCase(intlLocale()).includes(term)
    })
  }, [featureFlags, flagFilter, flagSearch])

  /** Zaman daraltmasi ISTEMCI tarafinda: RPC pencere parametresi almiyor. */
  const [auditRecentOnly, setAuditRecentOnly] = useState(false)
  /** Islem dagilimi paneli; sayac kutusundan acilir. */
  const [auditActionsOpen, setAuditActionsOpen] = useState(false)

  const auditRecentCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return auditLogs.filter((item) => {
      const at = new Date(item.createdAt).getTime()
      return !Number.isNaN(at) && at >= cutoff
    }).length
  }, [auditLogs])

  const visibleAuditLogs = useMemo(() => {
    if (!auditRecentOnly) return auditLogs
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return auditLogs.filter((item) => {
      const at = new Date(item.createdAt).getTime()
      return !Number.isNaN(at) && at >= cutoff
    })
  }, [auditLogs, auditRecentOnly])

  /** Cok gorulen islem once: dagilim listesi uzun kuyrukla baslamamali. */
  const auditActionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of auditLogs) {
      counts.set(item.action, (counts.get(item.action) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action, 'tr'))
  }, [auditLogs])

  const auditFilterActive =
    auditActionFilter !== 'all'
    || auditResourceFilter !== 'all'
    || !!auditSearch.trim()
    || auditRecentOnly

  const auditActions = useMemo(() => {
    return Array.from(new Set(auditLogs.map((item) => item.action))).sort((a, b) =>
      a.localeCompare(b, 'tr'),
    )
  }, [auditLogs])

  const auditResourceTypes = useMemo(() => {
    return Array.from(new Set(auditLogs.map((item) => item.resourceType))).sort(
      (a, b) => a.localeCompare(b, 'tr'),
    )
  }, [auditLogs])

  function updateDraft(flagId: string, patch: Partial<FeatureFlagDraft>) {
    setFeatureFlagDrafts((prev) => ({
      ...prev,
      [flagId]: {
        ...(prev[flagId] || {
          label: '',
          description: '',
          isEnabled: false,
          rolloutPercent: 0,
          isPublic: false,
        }),
        ...patch,
      },
    }))
  }

  /**
   * Saves the flag.
   *
   * `patch` is required: the switch on the card starts the write before draft state
   * commits; reading only the draft would send the OLD value and the switch would
   * visibly flip while changing nothing.
   *
   * ALL fields are sent every time: `set_feature_flag` is a full overwrite, not a patch.
   * A field left out returns to its default; maintenance mode once silently
   * stopped being public because of this.
   */
  /*
   * The switch in the list saves instantly (turning on needs no confirm). Turning off and enabling
   * maintenance mode affect the whole site, so they pass a confirm stating the result;
   * on cancel the switch returns to its old state. The maintenance card used to ask for confirmation
   * while the same flag could be turned on from the list in one click.
   */
  const [flagConfirm, setFlagConfirm] = useState<(AdminConfirmRequest & { flagId: string, previous: boolean }) | null>(null)
  const [flagConfirmBusy, setFlagConfirmBusy] = useState(false)

  function requestSaveFlag(flag: AdminFeatureFlagItem, patch?: Partial<FeatureFlagDraft>) {
    const next = patch?.isEnabled
    // Ending maintenance stays one step: ending an outage should be easier than starting one (same as the maintenance card).
    const risky = next !== undefined && next !== flag.isEnabled
      && (flag.key === 'system.maintenance' ? next === true : next === false)
    if (!risky) {
      void handleSaveFlag(flag, patch)
      return
    }
    const maintenanceOn = flag.key === 'system.maintenance' && next === true
    setFlagConfirm({
      flagId: flag.id,
      previous: flag.isEnabled,
      title: maintenanceOn ? txa('Siteyi bakım moduna al') : txa('"{v1}" kapat', { v1: flag.label || flag.key }),
      subject: flag.key,
      consequence: maintenanceOn
        ? txa('Kayıtlı kullanıcılar dahil herkes bakım ekranını görür; yalnız adminler siteyi kullanabilir. Hemen geçerli olur.')
        : txa('Bu özellik hemen tüm kullanıcılar için kapanır{v1}. Veriler silinmez; yeniden açınca geri gelir.', { v1: flag.description ? ` (${flag.description})` : '' }),
      confirmLabel: maintenanceOn ? txa('Bakım moduna al') : txa('Kapat'),
      destructive: true,
      run: () => handleSaveFlag(flag, patch),
    })
  }

  function cancelFlagConfirm() {
    if (flagConfirm) updateDraft(flagConfirm.flagId, { isEnabled: flagConfirm.previous })
    setFlagConfirm(null)
  }

  async function runFlagConfirm() {
    if (!flagConfirm) return
    setFlagConfirmBusy(true)
    try {
      await flagConfirm.run()
      setFlagConfirm(null)
    } finally {
      setFlagConfirmBusy(false)
    }
  }

  async function handleSaveFlag(flag: AdminFeatureFlagItem, patch?: Partial<FeatureFlagDraft>) {
    const base = featureFlagDrafts[flag.id]
    if (!base) return
    const draft = { ...base, ...patch }

    setSavingFlagId(flag.id)
    try {
      await setAdminFeatureFlag({
        key: flag.key,
        label: draft.label,
        description: draft.description,
        isEnabled: draft.isEnabled,
        rolloutPercent: draft.rolloutPercent,
        isPublic: draft.isPublic,
        metadata: flag.metadata || {},
      })
      toast.success(txa('"{v1}" güncellendi.', { v1: flag.label || flag.key }))
      await loadFeatureFlags()
    } catch (error) {
      console.error('[AdminOpsSection] handleSaveFlag error', error)
      toast.error(toErrorMessage(error, txa('Bayrak kaydedilemedi.')))
    } finally {
      setSavingFlagId(null)
    }
  }

  async function handleCreateFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedKey = normalizeFeatureFlagKey(newFlagForm.key)
    if (!normalizedKey) {
      toast.warning(txa('Geçerli bir bayrak anahtarı gir.'))
      return
    }

    setCreatingFlag(true)
    try {
      await setAdminFeatureFlag({
        key: normalizedKey,
        label: newFlagForm.label,
        description: newFlagForm.description,
        isEnabled: newFlagForm.isEnabled,
        rolloutPercent: newFlagForm.rolloutPercent,
        isPublic: newFlagForm.isPublic,
        metadata: {},
      })
      toast.success(txa('"{v1}" oluşturuldu.', { v1: normalizedKey }))
      setNewFlagForm(DEFAULT_NEW_FLAG_FORM)
      setCreateFormOpen(false)
      await loadFeatureFlags()
    } catch (error) {
      console.error('[AdminOpsSection] handleCreateFlag error', error)
      toast.error(toErrorMessage(error, txa('Yeni bayrak oluşturulamadı.')))
    } finally {
      setCreatingFlag(false)
    }
  }

  async function handleRefreshAudit() {
    await loadAuditLogs()
  }

  function handleResetAuditFilters() {
    setAuditSearch('')
    setAuditActionFilter('all')
    setAuditResourceFilter('all')
    setAuditLimit(120)
    // Clearing is NOT JUST resetting state: if a list fetched with a server-side filter
    // stays on screen, it feels like "I cleared it but it is still narrowed".
    void loadAuditLogs({ action: 'all', resourceType: 'all', search: '', limit: 120 })
  }

  function handleTabChange(tab: OpsTab) {
    navigate({
      pathname: location.pathname,
      hash: `#${OPS_TAB_TO_HASH[tab]}`,
    })
  }

  return (
    <section className="flex flex-col gap-4">
      {/*
        Kritik alarm sayfanin USTUNDE, sekmeden bagimsiz. Guvenlik sekmesine
        girmeyi bekleyen bir uyari, uyari degildir.
      */}
      {criticalAlertCount > 0 ? (
        <button
          type="button"
          onClick={() => handleTabChange('security')}
          className="flex w-full items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-left transition-colors hover:bg-destructive/15"
          data-testid="admin-ops-critical-banner"
        >
          <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold text-destructive">
            {txa('{v1} kritik alarm acik', { v1: criticalAlertCount })}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-destructive">
            {txa('Güvenliğe git')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
        </button>
      ) : null}

      <AdminSectionHeader
        title={txa('Operasyon Merkezi')}
        // The description must cover ALL tabs; the previous text described only two
        // and Status/Security looked added later.
        description={txa('Sistemin teknik yüzü: çalışma durumu ve bakım modu, özellik bayrakları, admin hareket kaydı ve güvenlik olayları.')}
      />

      <AdminOpsTabs
        activeTab={activeTab}
        onChange={handleTabChange}
        activeFlagCount={featureFlagsLoading ? undefined : flagStats.enabled}
        openAlarmCount={openAlerts === null ? undefined : openAlerts.length}
      />

      {activeTab === 'status' && (
        <>
          <AdminOpsStatusSection onOpenTab={handleTabChange} />

          {/*
            Toplu kapak donusumu GUVENLIK sekmesinde duruyordu; depolama isi
            olan bir toplu job'in guvenlik olaylariyla ilgisi yok ve orada
            olmasi sekmenin ne oldugunu bulaniklastiriyordu. Durum sekmesi
            zaten sistemin calisma yuzeyi (bakim modu burada), toplu bakim
            isleri de buraya ait.
          */}
            <AdminSurface className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ImageDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <h3 className="m-0 font-heading text-sm text-foreground">{txa('Toplu WebP dönüştürme')}</h3>
                    <p className="m-0 mt-0.5 max-w-prose text-[11px] leading-4 text-muted-foreground">
                      {txa('Mevcut PNG/JPEG manga kapaklarını WebP\'ye çevirir; ortalama %60-80 boyut tasarrufu sağlar.')}
                      {txa('Uzun sürebilir, sekmeyi açık bırakın.')}
                    </p>
                  </div>
                </div>

              <Button
                onClick={async () => {
                  setWebpRunning(true)
                  setWebpProgress(null)
                  try {
                    await convertExistingCoversToWebP(setWebpProgress)
                    toast.success(txa('WebP dönüşüm tamamlandı!'))
                  } catch (err) {
                    toast.error(txa('Dönüşüm sırasında hata oluştu'))
                    console.error('[WebP] Bulk conversion error', err)
                  } finally {
                    setWebpRunning(false)
                  }
                }}
                disabled={webpRunning}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                {webpRunning ? txa('Dönüştürülüyor...') : txa('Dönüşümü başlat')}
              </Button>
              </div>

              {webpProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{webpProgress.current}</span>
                    <span className="font-medium">
                      {webpProgress.completed}/{webpProgress.total}
                    </span>
                  </div>
                  {webpProgress.total > 0 && (
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${(webpProgress.completed / webpProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                  {webpProgress.savedKB > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {txa('Toplam tasarruf: {v1} KB', { v1: webpProgress.savedKB })}
                    </p>
                  )}
                  {webpProgress.errors.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-destructive">
                        {webpProgress.errors.length}{' '}{txa('hata')}
                      </summary>
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {webpProgress.errors.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </AdminSurface>
        </>
      )}

      {activeTab === 'feature_flags' && (
        <>
          <AdminOpsFeatureFlagStats
            total={flagStats.total}
            enabled={flagStats.enabled}
            disabled={flagStats.disabled}
            publicCount={flagStats.publicCount}
            activeFilter={flagFilter}
            onFilterChange={setFlagFilter}
          />

          <AdminOpsFeatureFlagToolbar
            search={flagSearch}
            onSearchChange={setFlagSearch}
            filterLabel={FLAG_FILTER_LABELS[flagFilter]}
            onClearFilter={() => setFlagFilter('all')}
            shownCount={visibleFlags.length}
            totalCount={flagStats.total}
            createOpen={createFormOpen}
            onToggleCreate={() => setCreateFormOpen((current) => !current)}
            onReload={() => {
              void loadFeatureFlags()
            }}
            loading={featureFlagsLoading}
          />

          {/* Olusturma formu KAPALI baslar: gunde bir kullanilan bir yazma
              araci, her acilista listenin onunu kesmemeli. */}
          {createFormOpen ? (
            <AdminOpsFeatureFlagCreateCard
              creatingFlag={creatingFlag}
              newFlagForm={newFlagForm}
              setNewFlagForm={setNewFlagForm}
              onSubmit={(event) => {
                void handleCreateFlag(event)
              }}
            />
          ) : null}

          <AdminOpsFeatureFlagList
            featureFlags={visibleFlags}
            drafts={featureFlagDrafts}
            loading={featureFlagsLoading}
            error={featureFlagsError}
            savingFlagId={savingFlagId}
            filterLabel={FLAG_FILTER_LABELS[flagFilter]}
            search={flagSearch}
            onClearFilters={() => {
              setFlagFilter('all')
              setFlagSearch('')
            }}
            onUpdateDraft={updateDraft}
            onSaveFlag={requestSaveFlag}
          />
        </>
      )}

      {activeTab === 'audit_logs' && (
        <>
          <AdminOpsAuditStats
            shownCount={visibleAuditLogs.length}
            recentCount={auditRecentCount}
            actionTypeCount={auditActionCounts.length}
            limit={auditLimit}
            filterActive={auditFilterActive}
            recentOnly={auditRecentOnly}
            actionsOpen={auditActionsOpen}
            onClearFilters={() => {
              setAuditRecentOnly(false)
              handleResetAuditFilters()
            }}
            onToggleRecent={() => setAuditRecentOnly((current) => !current)}
            onToggleActions={() => setAuditActionsOpen((current) => !current)}
          />

          <AdminOpsAuditFiltersCard
            auditSearch={auditSearch}
            auditActionFilter={auditActionFilter}
            auditResourceFilter={auditResourceFilter}
            auditLimit={auditLimit}
            auditActions={auditActions}
            auditResourceTypes={auditResourceTypes}
            auditLoading={auditLoading}
            actionsOpen={auditActionsOpen}
            actionCounts={auditActionCounts}
            onPickAction={(action) => {
              setAuditActionFilter(action)
              void loadAuditLogs({ action })
            }}
            onAuditSearchChange={setAuditSearch}
            onAuditActionFilterChange={setAuditActionFilter}
            onAuditResourceFilterChange={setAuditResourceFilter}
            onAuditLimitChange={setAuditLimit}
            onRefresh={() => {
              void handleRefreshAudit()
            }}
            onReset={handleResetAuditFilters}
          />

          <AdminOpsAuditFeed
            auditLoading={auditLoading}
            auditError={auditError}
            auditLoaded={auditLoaded}
            auditLogs={visibleAuditLogs}
            recentOnly={auditRecentOnly}
          />
        </>
      )}

      {activeTab === 'security' && <AdminOpsSecuritySection />}

      <AdminConfirmDialog request={flagConfirm} busy={flagConfirmBusy} onCancel={cancelFlagConfirm} onConfirm={() => { void runFlagConfirm() }} />
    </section>
  )
}

export default AdminOpsSection
