import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  cleanupExpiredBans,
  createAdminSecurityEvent,
  getAdminSecurityOverview,
  listAdminRedeemAnomalyUsers,
  listAdminSecurityEvents,
  type SecurityEventItem,
  type SecurityOverview,
  type SecurityRedeemAnomalyItem,
} from '@/services/adminSecurityService'
import { toast } from '@/services/toastService'
import AdminOpsSecurityAlertsPanel from './AdminOpsSecurityAlertsPanel'
import { AdminOpsSecurityControlsCard } from './security/AdminOpsSecurityControlsCard'
import { AdminOpsSecurityOverviewGrid } from './security/AdminOpsSecurityOverviewGrid'
import { AdminOpsSecurityAnomalyTableCard } from './security/AdminOpsSecurityAnomalyTableCard'
import { AdminOpsSecurityCreateEventCard } from './security/AdminOpsSecurityCreateEventCard'
import { AdminOpsSecurityEventsTableCard } from './security/AdminOpsSecurityEventsTableCard'
import {
  DEFAULT_NEW_EVENT_FORM,
  normalizeEventType,
  normalizeSource,
  toErrorMessage,
  type EventFilterSeverity,
  type NewSecurityEventFormState,
} from './security/adminOpsSecurityUtils'
import { txa } from '@/i18n/activeLocale'

function AdminOpsSecuritySection() {
  const [windowHours, setWindowHours] = useState(24)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overview, setOverview] = useState<SecurityOverview>({
    windowHours: 24,
    totalEvents: 0,
    highEvents: 0,
    criticalEvents: 0,
    pendingReports: 0,
    bannedUsers: 0,
    codeRedemptions: 0,
    suspiciousRedeemers: 0,
  })

  const [events, setEvents] = useState<SecurityEventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsSearch, setEventsSearch] = useState('')
  const [eventsSeverityFilter, setEventsSeverityFilter] =
    useState<EventFilterSeverity>('all')
  const [eventsSourceFilter, setEventsSourceFilter] = useState('all')
  const [eventsLimit, setEventsLimit] = useState(120)

  const [anomalies, setAnomalies] = useState<SecurityRedeemAnomalyItem[]>([])
  const [anomalyLoading, setAnomalyLoading] = useState(false)
  const [anomalyError, setAnomalyError] = useState<string | null>(null)
  const [anomalyMinCount, setAnomalyMinCount] = useState(3)
  const [anomalyLimit, setAnomalyLimit] = useState(20)
  const [cleanupLoading, setCleanupLoading] = useState(false)

  const [newEventForm, setNewEventForm] =
    useState<NewSecurityEventFormState>(DEFAULT_NEW_EVENT_FORM)
  const [newEventSaving, setNewEventSaving] = useState(false)

  const eventsCardRef = useRef<HTMLElement | null>(null)
  const anomalyCardRef = useRef<HTMLElement | null>(null)

  const eventSources = useMemo(() => {
    return Array.from(new Set(events.map((item) => item.source))).sort((a, b) =>
      a.localeCompare(b, 'tr'),
    )
  }, [events])

  /*
   * The feed is limited to the SAME window as the summary.
   *
   * get_security_overview takes a window (p_window_hours), list_security_events does
   * NOT, returning only "last N records". Side by side, pressing a "Critical 2" box could show
   * 5 rows in the list; the summary counted 24 hours, the list all time.
   * If a box is a filter the numbers MUST match, or the panel contradicts
   * itself.
   */
  const eventsInWindow = useMemo(() => {
    const cutoff = Date.now() - windowHours * 60 * 60 * 1000
    return events.filter((item) => {
      const at = new Date(item.createdAt).getTime()
      return Number.isNaN(at) ? true : at >= cutoff
    })
  }, [events, windowHours])

  /*
   * Truncation warning: if the fetch limit was hit AND the oldest fetched record is still
   * inside the window, there are events in the window not shown. Silently showing an
   * incomplete list is worse than showing zero.
   */
  const eventsTruncated = useMemo(() => {
    if (events.length < eventsLimit) return false
    const oldest = events[events.length - 1]
    if (!oldest) return false
    const at = new Date(oldest.createdAt).getTime()
    if (Number.isNaN(at)) return false
    return at >= Date.now() - windowHours * 60 * 60 * 1000
  }, [events, eventsLimit, windowHours])

  const filteredEvents = useMemo(() => {
    const sourceFilter = eventsSourceFilter === 'all' ? '' : eventsSourceFilter
    const search = eventsSearch.trim().toLowerCase()

    return eventsInWindow.filter((item) => {
      const severityMatch =
        eventsSeverityFilter === 'all' || item.severity === eventsSeverityFilter
      const sourceMatch = !sourceFilter || item.source === sourceFilter
      const searchMatch =
        !search ||
        item.eventType.toLowerCase().includes(search) ||
        item.source.toLowerCase().includes(search) ||
        item.message.toLowerCase().includes(search) ||
        JSON.stringify(item.metadata || {}).toLowerCase().includes(search)
      return severityMatch && sourceMatch && searchMatch
    })
  }, [eventsInWindow, eventsSearch, eventsSeverityFilter, eventsSourceFilter])

  /** When a filter is chosen from a box the list must be visible, or it feels like "nothing happened". */
  const focusCard = useCallback((ref: typeof eventsCardRef) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const row = await getAdminSecurityOverview(windowHours)
      setOverview(row)
    } catch (error) {
      console.error('[AdminOpsSecuritySection] loadOverview error', error)
      setOverviewError(toErrorMessage(error, txa('Güvenlik özeti yüklenemedi.')))
    } finally {
      setOverviewLoading(false)
    }
  }, [windowHours])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    setEventsError(null)
    try {
      const rows = await listAdminSecurityEvents({
        limit: eventsLimit,
      })
      setEvents(rows)
    } catch (error) {
      console.error('[AdminOpsSecuritySection] loadEvents error', error)
      setEvents([])
      setEventsError(toErrorMessage(error, txa('Güvenlik olayları yüklenemedi.')))
    } finally {
      setEventsLoading(false)
    }
  }, [eventsLimit])

  const loadAnomalies = useCallback(async () => {
    setAnomalyLoading(true)
    setAnomalyError(null)
    try {
      const rows = await listAdminRedeemAnomalyUsers({
        windowHours,
        minCount: anomalyMinCount,
        limit: anomalyLimit,
      })
      setAnomalies(rows)
    } catch (error) {
      console.error('[AdminOpsSecuritySection] loadAnomalies error', error)
      setAnomalies([])
      setAnomalyError(toErrorMessage(error, txa('Kod kullanım anomalileri yüklenemedi.')))
    } finally {
      setAnomalyLoading(false)
    }
  }, [anomalyLimit, anomalyMinCount, windowHours])

  useEffect(() => {
    void Promise.all([loadOverview(), loadEvents(), loadAnomalies()])
  }, [loadAnomalies, loadEvents, loadOverview])

  async function handleRefreshAll() {
    await Promise.all([loadOverview(), loadEvents(), loadAnomalies()])
  }

  async function handleCleanupExpiredBans() {
    setCleanupLoading(true)
    try {
      const cleanedCount = await cleanupExpiredBans(2000)
      if (cleanedCount > 0) {
        toast.success(txa('{v1} kullanicinin suresi dolan bani otomatik temizlendi.', { v1: cleanedCount }))
      } else {
        toast.info(txa('Temizlenecek süresi dolmuş ban kaydı yok.'))
      }
      await Promise.all([loadOverview(), loadEvents()])
    } catch (error) {
      console.error('[AdminOpsSecuritySection] handleCleanupExpiredBans error', error)
      toast.error(toErrorMessage(error, txa('Suresi dolan banlar temizlenemedi.')))
    } finally {
      setCleanupLoading(false)
    }
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const source = normalizeSource(newEventForm.source)
    const eventType = normalizeEventType(newEventForm.eventType)
    const message = newEventForm.message.trim()
    const targetUserId = newEventForm.targetUserId.trim()

    if (!source || !eventType || !message) {
      toast.warning(txa('Kaynak, event tipi ve mesaj alanlari zorunludur.'))
      return
    }

    let metadata: Record<string, unknown> = {}
    if (newEventForm.metadataText.trim()) {
      try {
        const parsed = JSON.parse(newEventForm.metadataText)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>
        } else {
          toast.warning(txa('Metadata JSON object formatinda olmali.'))
          return
        }
      } catch {
        toast.warning(txa('Ek veri geçerli JSON değil.'))
        return
      }
    }

    setNewEventSaving(true)
    try {
      await createAdminSecurityEvent({
        source,
        eventType,
        severity: newEventForm.severity,
        message,
        targetUserId: targetUserId || undefined,
        metadata,
      })
      toast.success(txa('Güvenlik olayı kaydedildi.'))
      setNewEventForm(DEFAULT_NEW_EVENT_FORM)
      await Promise.all([loadEvents(), loadOverview()])
    } catch (error) {
      console.error('[AdminOpsSecuritySection] handleCreateEvent error', error)
      toast.error(toErrorMessage(error, txa('Güvenlik olayı kaydedilemedi.')))
    } finally {
      setNewEventSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminOpsSecurityControlsCard
        windowHours={windowHours}
        anomalyMinCount={anomalyMinCount}
        anomalyLimit={anomalyLimit}
        eventsLimit={eventsLimit}
        overviewLoading={overviewLoading}
        eventsLoading={eventsLoading}
        anomalyLoading={anomalyLoading}
        cleanupLoading={cleanupLoading}
        onWindowHoursChange={setWindowHours}
        onAnomalyMinCountChange={setAnomalyMinCount}
        onAnomalyLimitChange={setAnomalyLimit}
        onEventsLimitChange={setEventsLimit}
        onRefreshAll={() => {
          void handleRefreshAll()
        }}
        onCleanupExpiredBans={() => {
          void handleCleanupExpiredBans()
        }}
      />

      <AdminOpsSecurityOverviewGrid
        overview={overview}
        loading={overviewLoading}
        severityFilter={eventsSeverityFilter}
        onSeverityFilter={(severity) => {
          setEventsSeverityFilter(severity)
          focusCard(eventsCardRef)
        }}
        onFocusAnomalies={() => focusCard(anomalyCardRef)}
      />

      {overviewError && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{overviewError}</p>
        </div>
      )}

      <AdminOpsSecurityAlertsPanel />

      <AdminOpsSecurityAnomalyTableCard
        ref={anomalyCardRef}
        anomalyLoading={anomalyLoading}
        anomalyError={anomalyError}
        anomalies={anomalies}
        windowHours={windowHours}
        minCount={anomalyMinCount}
      />

      <AdminOpsSecurityCreateEventCard
        newEventForm={newEventForm}
        setNewEventForm={setNewEventForm}
        newEventSaving={newEventSaving}
        onSubmit={(event) => {
          void handleCreateEvent(event)
        }}
      />

      <AdminOpsSecurityEventsTableCard
        ref={eventsCardRef}
        eventsLoading={eventsLoading}
        eventsError={eventsError}
        filteredEvents={filteredEvents}
        windowHours={windowHours}
        windowTotal={eventsInWindow.length}
        truncated={eventsTruncated}
        eventsLimit={eventsLimit}
        onRaiseLimit={() => setEventsLimit((current) => Math.min(400, current + 120))}
        eventsSearch={eventsSearch}
        eventsSeverityFilter={eventsSeverityFilter}
        eventsSourceFilter={eventsSourceFilter}
        eventSources={eventSources}
        setEventsSearch={setEventsSearch}
        setEventsSeverityFilter={setEventsSeverityFilter}
        setEventsSourceFilter={setEventsSourceFilter}
      />
    </div>
  )
}

export default AdminOpsSecuritySection
