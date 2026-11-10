/**
 * FansubYonetCommunityTab: studio v2 'Server' tab (community v2).
 *
 * Replaces the old post feed (v1): summarizes the fansub's community server
 * (members, message pulse, channels, pending work) and opens community v2's own management
 * panels (profile, applications, roles, channels, members, reports,
 * invites, action history) embedded in the studio. Permissions come through the server role
 * (allowedManagementTabs); the studio only provides a shell.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  ArrowSquareOut,
  ChatsCircle,
  ClockCounterClockwise,
  Flag,
  Hash,
  LockSimple,
  BookOpen,
  UsersThree,
  ChatCircleDots,
  Sparkle,
  Info,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { allowedManagementTabs } from '@/lib/communityManagementPolicy'
import { StudioAreaChart } from '@/components/fansub/StudioCharts'
import { Panel, PanelEmpty, StatTile } from '@/pages/profile/ProfileTabKit'
import { communityV2, type CommunityServer } from '@/services/communityV2Service'
import type { FansubCommunityV2Summary } from '@/services/fansubManageService'
import { toast } from '@/services/toastService'
import { communityError } from '@/pages/communityV2/communityHelpers'
import { CommunityLoading } from '@/pages/communityV2/CommunityShared'
import { ServerProfilePanel } from '@/pages/communityV2/management/ServerProfilePanel'
import { JoinRequestsPanel } from '@/pages/communityV2/management/JoinRequestsPanel'
import { RolePreviewPanel } from '@/pages/communityV2/management/RolePreviewPanel'
import { RolesPanel } from '@/pages/communityV2/management/RolesPanel'
import { ChannelsPanel } from '@/pages/communityV2/management/ChannelsPanel'
import { MembersPanel } from '@/pages/communityV2/management/MembersPanel'
import { ReportsPanel } from '@/pages/communityV2/management/ReportsPanel'
import { AuditPanel } from '@/pages/communityV2/management/AuditPanel'
import { InvitesPanel } from '@/pages/communityV2/management/InvitesPanel'
import '@/pages/communityV2/communityV2.css'
import './fansubStudioCommunity.css'
import { formatNumber, formatRelative } from './FansubYonetOverviewPanels'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubYonetCommunityTabProps {
  fansubId: string
  community: FansubCommunityV2Summary | null
  communityError: string | null
  onReload: () => Promise<void> | void
}

const JOIN_MODE_LABEL: Record<string, string> = {
  get open() { return txa('Herkese açık') },
  get request() { return txa('Başvuruyla') },
  get invite() { return txa('Yalnız davetle') },
}

function ManagementSection({ serverId, onChanged }: { serverId: string, onChanged: () => void }) {
  const [server, setServer] = useState<CommunityServer | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')

  const refresh = useCallback(async () => {
    try {
      setServer(await communityV2.server(serverId))
      setError('')
    } catch (e) {
      setError(communityError(e))
    }
  }, [serverId])

  useEffect(() => { void refresh() }, [refresh])

  if (error) return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-[13px] text-destructive">{error}</p>
  if (!server) return <div className="cv2"><CommunityLoading /></div>

  const tabs = allowedManagementTabs(server)
  const tab = tabs.some(([id]) => id === selected) ? selected : tabs[0]?.[0]
  if (!tab) {
    return <PanelEmpty icon={LockSimple} title={txa('Yönetim iznin yok')} hint={txa('Sunucu rolün yönetim araçlarını açmıyor. Sunucu sahibi sana yetkili bir rol verebilir.')} />
  }
  const props = { serverId, server, refresh: async () => { await refresh(); onChanged() } }

  return (
    <div className="flex flex-col gap-4">
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label={txa('Sunucu yönetimi bölümleri')}>
        {tabs.map(([id, name]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setSelected(id)}
            className={cn(
              'flex-none rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
              tab === id ? 'border-foreground bg-foreground text-background' : 'border-border/70 text-muted-foreground hover:text-foreground',
            )}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="cv2-dialog cv2-studio-embed" data-testid="studio-community-management">
        <div className="cv2-management-body">
          {tab === 'profile' && <ServerProfilePanel {...props} />}
          {tab === 'requests' && <JoinRequestsPanel {...props} />}
          {tab === 'preview' && <RolePreviewPanel {...props} />}
          {tab === 'roles' && <RolesPanel {...props} />}
          {tab === 'channels' && <ChannelsPanel {...props} />}
          {tab === 'members' && <MembersPanel {...props} />}
          {tab === 'reports' && <ReportsPanel {...props} />}
          {tab === 'invites' && <InvitesPanel {...props} />}
          {tab === 'audit' && <AuditPanel serverId={serverId} roles={server.roles} />}
        </div>
      </div>
    </div>
  )
}

function NoServer({ community, fansubId, onReload }: { community: FansubCommunityV2Summary, fansubId: string, onReload: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      await communityV2.write('create_server', { fansub_id: fansubId })
      toast.success(txa('Sunucun açıldı.'))
      await onReload()
    } catch (e) {
      toast.error(communityError(e))
    } finally {
      setBusy(false)
    }
  }
  const hint = !community.enabled
    ? txa('Topluluk site genelinde şu an kapalı. Açıldığında fansub sunucunu buradan tek tıkla kurabilirsin.')
    : community.canCreate
      ? txa('Sunucunda okurlarınla kanallarda sohbet edersin: seri kanalları, ekibe özel odalar, roller ve moderasyon. Sunucu sahibi sen olursun.')
      : community.adminCount > 1
        ? txa('Fansub sunucusunu yalnızca tek admini olan fansub açabilir; sahiplik o admine geçer.')
        : txa('Fansub sunucusunu fansubun admini açabilir.')
  return (
    <Panel testId="studio-community-empty">
      <PanelEmpty
        icon={ChatsCircle}
        title={txa('Fansub sunucun henüz yok')}
        hint={hint}
        action={community.canCreate && community.enabled
          ? <Button className="mt-3 rounded-full" disabled={busy} onClick={() => void create()}>{busy ? txa('Açılıyor…') : txa('Sunucuyu aç')}</Button>
          : undefined}
        className="border-none py-14"
      />
    </Panel>
  )
}

export default function FansubYonetCommunityTab({ fansubId, community, communityError: loadError, onReload }: FansubYonetCommunityTabProps) {
  if (!community) {
    return loadError
      ? (
          <section className="flex flex-col gap-3 rounded-[20px] border border-destructive/40 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => void onReload()}>{txa('Tekrar dene')}</Button>
          </section>
        )
      : <div className="cv2"><CommunityLoading /></div>
  }

  const server = community.server
  const stats = community.stats

  if (!server) {
    return <NoServer community={community} fansubId={fansubId} onReload={onReload} />
  }

  const pending = stats.pendingJoinRequests + stats.openReports
  const channels = community.channels.filter((channel) => !channel.archived)
  const archivedCount = community.channels.length - channels.length
  const serverHref = `/topluluk?sunucu=${encodeURIComponent(server.id)}`

  return (
    <div className="flex flex-col gap-4" data-testid="studio-community">
      <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-border/70 bg-gradient-to-br from-emerald-500/[0.08] via-card/60 to-card/60 px-5 py-4">
        <span className="flex size-12 flex-none items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-500">
          <ChatsCircle size={26} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-black tracking-tight">{server.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="rounded-full border border-border/70 px-2 py-0.5 font-semibold text-foreground">{JOIN_MODE_LABEL[server.joinMode]}</span>
            {server.createdAt && <span>{txa('{v1} tarihinde açıldı', { v1: new Date(server.createdAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>}
            {server.isOwner && <span className="flex items-center gap-1"><Sparkle size={12} weight="fill" className="text-amber-400" />{txa('Sahibi sensin')}</span>}
          </span>
        </span>
        {community.enabled && (
          <Button asChild variant="outline" className="rounded-full">
            <Link to={serverHref}><ArrowSquareOut size={15} />{txa('Sunucuyu aç')}</Link>
          </Button>
        )}
      </section>

      {!community.enabled && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-amber-700 dark:text-amber-300">
          <Info size={16} weight="fill" className="mt-0.5 flex-none" />
          {txa('Topluluk site genelinde şu an kapalı. Sunucun okurlara görünmüyor ve yönetim araçları topluluk açılınca kullanılabilir.')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={UsersThree} tone="emerald" label={txa('Üye')} value={formatNumber(stats.members)} sub={stats.newMembers7d ? txa('+{v1} bu hafta', { v1: formatNumber(stats.newMembers7d) }) : txa('Bu hafta yeni üye yok')} />
        <StatTile icon={ChatCircleDots} tone="primary" label={txa('Mesaj (7 gün)')} value={formatNumber(stats.messages7d)} sub={txa('{v1} kişi konuştu', { v1: formatNumber(stats.chatters7d) })} />
        <StatTile icon={Hash} tone="violet" label={txa('Kanal')} value={formatNumber(stats.channels)} sub={txa('{v1} özel rol · {v2} davet', { v1: formatNumber(stats.roles), v2: formatNumber(stats.activeInvites) })} />
        <StatTile icon={Flag} tone={pending ? 'rose' : 'neutral'} label={txa('Bekleyen')} value={formatNumber(pending)} sub={txa('{v1} başvuru · {v2} şikâyet', { v1: formatNumber(stats.pendingJoinRequests), v2: formatNumber(stats.openReports) })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel title={txa('Mesaj nabzı')} icon={ChatCircleDots} tone="primary" meta={txa('Son 14 gün')} className="xl:col-span-7">
          <StudioAreaChart data={community.daily.map((day) => day.messages)} height={140} colorClass="text-emerald-400" />
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{community.daily[0] ? new Date(`${community.daily[0].day}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }) : ''}</span>
            <span>{txa('Bugün')}</span>
          </div>
        </Panel>
        <Panel title={txa('Kanallar')} icon={Hash} tone="violet" meta={archivedCount ? txa('{v1} etkin · {v2} arşivde', { v1: channels.length, v2: archivedCount }) : `${channels.length} etkin`} className="xl:col-span-5" flush>
          {channels.length ? (
            <ul className="max-h-[260px] overflow-y-auto px-2">
              {channels.map((channel) => (
                <li key={channel.id}>
                  <Link to={`${serverHref}&kanal=${encodeURIComponent(channel.id)}`} className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-accent/50">
                    {channel.isPrivate ? <LockSimple size={15} className="flex-none text-muted-foreground" /> : channel.mangaTitle ? <BookOpen size={15} className="flex-none text-violet-400" /> : <Hash size={15} className="flex-none text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{channel.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[channel.category, channel.mangaTitle && txa('Seri: {v1}', { v1: channel.mangaTitle }), channel.isPrivate && txa('Özel')].filter(Boolean).join(' · ') || txa('Genel kanal')}
                      </span>
                    </span>
                    <span className="flex-none text-right text-[11px] tabular-nums text-muted-foreground">
                      {channel.messages7d ? <b className="text-foreground">{txa('{v1} mesaj', { v1: formatNumber(channel.messages7d) })}</b> : channel.lastMessageAt ? formatRelative(channel.lastMessageAt) : txa('Sessiz')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-4 text-[12.5px] text-muted-foreground">{txa('Henüz kanal yok. Yönetimden kanal ekleyebilirsin.')}</p>
          )}
        </Panel>
      </div>

      <Panel title={txa('Sunucu yönetimi')} icon={ClockCounterClockwise} tone="emerald" meta={txa('Roller, kanallar, üyeler ve moderasyon')}>
        {!community.enabled
          ? <PanelEmpty icon={LockSimple} title={txa('Topluluk kapalı')} hint={txa('Yönetim araçları topluluk site genelinde açılınca burada çalışır.')} />
          : !server.isMember
            ? <PanelEmpty icon={UsersThree} title={txa('Sunucuya üye değilsin')} hint={txa('Yönetim araçlarını kullanmak için önce sunucuya katıl; yetkilerin sunucu rolünden gelir.')} action={<Button asChild size="sm" className="mt-2 rounded-full"><Link to={serverHref}>{txa('Sunucuya katıl')}</Link></Button>} />
            : <ManagementSection serverId={server.id} onChanged={() => void onReload()} />}
      </Panel>

    </div>
  )
}
