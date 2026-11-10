import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from '@/i18n/router'
import { Flag, Info, MessagesSquare, RefreshCw, Server, Settings2, Users, type LucideIcon } from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { cn } from '@/lib/utils'
import { communityAdmin, type CommunityAdminOverview } from '@/services/communityAdminService'
import { CommunityOperationsPanel } from './community/CommunityOperationsPanel'
import { CommunityReportsDesk } from './community/CommunityReportsDesk'
import { CommunityServersDesk } from './community/CommunityServersDesk'
import { intlLocale, txa } from '@/i18n/activeLocale'

type CommunityTab = 'servers' | 'reports' | 'operations'

const TABS: Array<{ id: CommunityTab, label: string, icon: LucideIcon }> = [
  { id: 'servers', get label() { return txa('Sunucular') }, icon: Server },
  { id: 'reports', get label() { return txa('Şikâyetler') }, icon: Flag },
  { id: 'operations', get label() { return txa('İşletim') }, icon: Settings2 },
]

function StripCell({ icon: Icon, tone, label, value, hint, active, onClick, testId }: {
  icon: LucideIcon
  tone: string
  label: string
  value: number | null
  hint?: ReactNode
  active?: boolean
  onClick?: () => void
  testId: string
}) {
  const body = (
    <>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', tone)}><Icon className="size-[18px]" /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{label}</span>
        <span className="block text-[20px] font-black leading-tight tabular-nums">{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
        {hint ? <span className="block truncate text-[11px] text-muted-foreground">{hint}</span> : null}
      </span>
    </>
  )
  if (!onClick) return <div className="flex items-center gap-3 px-4 py-3" data-testid={testId}>{body}</div>
  return (
    <button type="button" aria-pressed={active} onClick={onClick} data-testid={testId} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
      {body}
      <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
    </button>
  )
}

/**
 * Community v2: site management of the new community system (server / channel / message).
 * Servers: fansub servers and member rooms, members, channels,
 * archive. Reports: message reports from all servers. Operations: quotas
 * and background jobs. Site admin interventions are written to the server's action history with a
 * "site admin" marker; nobody is notified.
 */
export function AdminCommunitySection({ flagsHref = null, onOpenReportsChange }: {
  /** Feature flags page (null if Operations is closed). */
  flagsHref?: string | null
  /** Open report count for the sidebar badge. */
  onOpenReportsChange?: (count: number) => void
}) {
  const desk = useDeskLayout()
  const availability = useCommunityAvailability()
  const [searchParams] = useSearchParams()
  // A server arriving from the Fansubs page (?sunucu=<id>) opens directly.
  const rawServerParam = searchParams.get('sunucu')
  const initialServerId = rawServerParam && /^[0-9a-f-]{36}$/i.test(rawServerParam) ? rawServerParam : null
  const [tab, setTab] = useState<CommunityTab>('servers')
  const [overview, setOverview] = useState<CommunityAdminOverview | null>(null)
  const [overviewError, setOverviewError] = useState('')
  const [revision, setRevision] = useState(0)
  const [reportServer, setReportServer] = useState<{ id: string, name: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    communityAdmin.overview(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setOverview(value)
        setOverviewError('')
        onOpenReportsChange?.(value.reports_open)
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setOverviewError(reason instanceof Error ? txa(reason.message) : txa('Topluluk özeti alınamadı.')) })
    return () => controller.abort()
  }, [revision, onOpenReportsChange])

  const refreshOverview = () => setRevision((value) => value + 1)
  // Refresh also reloads the open tab's list from scratch (the key changes).
  const [listKey, setListKey] = useState(0)
  const siteOpen = availability.enabled

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-community">
      <AdminSectionHeader
        title={txa('Topluluk')}
        description={txa('Sunucular, odalar ve mesaj şikâyetleri: inceleme, üye işlemleri ve arşiv.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" onClick={() => { refreshOverview(); setListKey((value) => value + 1) }}><RefreshCw className="size-3.5" />{txa('Yenile')}</Button>}
      />

      {!availability.loading && !availability.enabled ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200" data-testid="admin-community-closed">
          <Info className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{txa('Topluluk şu an kullanıcılara kapalı: sunucular sitede görünmüyor ve bildirimler durdu. Buradaki kararlar açılışta geçerli olur.')}</span>
          {flagsHref ? <Link to={flagsHref} className="shrink-0 font-semibold underline-offset-2 hover:underline">{txa('Özellik bayrakları →')}</Link> : null}
        </p>
      ) : null}

      {overviewError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{overviewError}</p> : null}

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Topluluk özeti')} data-testid="admin-community-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          <StripCell
            icon={Server}
            tone="bg-primary/10 text-primary"
            label={txa('Sunucular')}
            value={overview?.servers ?? null}
            hint={overview ? txa('{v1} fansub · {v2} oda{v3}', { v1: overview.fansub_servers, v2: overview.rooms, v3: overview.archived ? txa(' · {v1} arşiv', { v1: overview.archived }) : '' }) : null}
            active={tab === 'servers'}
            onClick={() => setTab('servers')}
            testId="admin-community-strip-servers"
          />
          <StripCell icon={Users} tone="bg-sky-500/10 text-sky-500" label={txa('Aktif üye')} value={overview?.members_active ?? null} hint={txa('Tüm sunucularda')} testId="admin-community-strip-members" />
          <StripCell icon={MessagesSquare} tone="bg-emerald-500/10 text-emerald-500" label={txa('Mesaj (7 gün)')} value={overview?.messages_7d ?? null} hint={overview?.queued ? txa('{v1} bildirim kuyrukta', { v1: overview.queued }) : txa('Silinenler hariç')} testId="admin-community-strip-messages" />
          <StripCell
            icon={Flag}
            tone="bg-rose-500/10 text-rose-500"
            label={txa('Açık şikâyet')}
            value={overview?.reports_open ?? null}
            hint={txa('Tüm sunuculardan')}
            active={tab === 'reports'}
            onClick={() => setTab('reports')}
            testId="admin-community-strip-reports"
          />
        </div>
      </section>

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Topluluk bölümleri')}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            data-testid={`admin-community-tab-${item.id}`}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <item.icon className="size-3.5" />{item.label}
            {item.id === 'reports' && overview?.reports_open ? <span className="rounded-full bg-rose-500/15 px-1.5 text-[11px] tabular-nums text-rose-700 dark:text-rose-300">{overview.reports_open}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'servers' ? (
        <CommunityServersDesk
          initialServerId={initialServerId}
          key={`servers-${listKey}`}
          desk={desk}
          siteOpen={siteOpen}
          onChanged={refreshOverview}
          onShowReports={(server) => { setReportServer(server); setTab('reports') }}
        />
      ) : null}
      {tab === 'reports' ? (
        <CommunityReportsDesk
          key={`reports-${listKey}`}
          desk={desk}
          siteOpen={siteOpen}
          server={reportServer}
          onClearServer={() => setReportServer(null)}
          onChanged={refreshOverview}
        />
      ) : null}
      {tab === 'operations' ? <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"><CommunityOperationsPanel key={`ops-${listKey}`} /></div> : null}
    </section>
  )
}

export default AdminCommunitySection
