import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  Archive, ArchiveRestore, ChevronLeft, ChevronRight, ExternalLink, Flag, Hash, Loader2, Lock, MoreHorizontal, Search, ShieldCheck,
} from 'lucide-react'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  communityAdmin,
  type CommunityAdminMember,
  type CommunityAdminServer,
  type CommunityMemberOperation,
  type CommunityMemberStateFilter,
} from '@/services/communityAdminService'
import { toast } from '@/services/toastService'
import { ArchiveDialog, MemberActionDialog, type MemberActionTarget } from './CommunityActionDialogs'
import {
  JOIN_MODE_LABEL, KIND_LABEL, auditLabel, communityRelativeAge, formatBytes, formatCommunityDate, formatUntil, initialsOf, isTimedOut,
} from './communityAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type DetailTab = 'overview' | 'members' | 'audit'
const MEMBER_PAGE = 25

const MEMBER_FILTERS: Array<[CommunityMemberStateFilter, string]> = [
  ['active', 'Aktif'],
  ['timeout', 'Kısıtlı'],
  ['banned', 'Yasaklı'],
  ['left', 'Ayrılan'],
  ['all', 'Tümü'],
]

function Pill({ tone, children }: { tone?: 'emerald' | 'amber' | 'rose' | 'sky', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'emerald' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
        : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
          : tone === 'rose' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
            : tone === 'sky' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
              : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Stat({ value, label, tone }: { value: string | number, label: string, tone?: 'rose' | 'amber' }) {
  return (
    <span className={cn('rounded-lg bg-muted/50 px-2.5 py-1', tone === 'rose' && 'bg-rose-500/10', tone === 'amber' && 'bg-amber-500/10')}>
      <b className={cn('font-bold tabular-nums text-foreground', tone === 'rose' && 'text-rose-700 dark:text-rose-300', tone === 'amber' && 'text-amber-700 dark:text-amber-300')}>
        {typeof value === 'number' ? value.toLocaleString(intlLocale()) : value}
      </b> {label}
    </span>
  )
}

export function ServerAvatar({ name, url, large = false }: { name: string, url: string | null, large?: boolean }) {
  const box = large ? 'size-11 text-[14px]' : 'size-9 text-[12px]'
  return url
    ? <img src={url} alt="" loading="lazy" decoding="async" className={cn(box, 'shrink-0 rounded-xl border border-border bg-muted object-cover')} />
    : <span className={cn(box, 'flex shrink-0 items-center justify-center rounded-xl bg-primary/10 font-black text-primary')} aria-hidden="true">{initialsOf(name)}</span>
}

/**
 * Server details (the desk's right panel / drawer on narrow screens). A site admin sees channels,
 * roles, members and action history even without being a member;
 * member actions and archive are here.
 */
export function CommunityServerDetail({ serverId, layout, siteOpen, onChanged, onShowReports }: {
  serverId: string
  /** desk: islemler basligin saginda; sheet: altta sabit. */
  layout: 'desk' | 'sheet'
  /** With community closed the site page is closed to everyone; "Open on site" is not shown. */
  siteOpen: boolean
  onChanged: () => void
  onShowReports: (serverId: string) => void
}) {
  const [detail, setDetail] = useState<CommunityAdminServer | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [memberState, setMemberState] = useState<CommunityMemberStateFilter>('active')
  const [draftSearch, setDraftSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOffset, setMemberOffset] = useState(0)
  const [members, setMembers] = useState<{ total: number, rows: CommunityAdminMember[] } | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [action, setAction] = useState<MemberActionTarget | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setTab('overview'); setMemberState('active'); setDraftSearch(''); setMemberSearch(''); setMemberOffset(0) }, [serverId])

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    communityAdmin.server(serverId, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setDetail(value) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? txa(reason.message) : txa('Sunucu alınamadı.')) })
    return () => controller.abort()
  }, [serverId, revision])

  useEffect(() => {
    const timer = setTimeout(() => setMemberSearch(draftSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [draftSearch])
  useEffect(() => { setMemberOffset(0) }, [memberState, memberSearch])

  useEffect(() => {
    if (tab !== 'members') return
    const controller = new AbortController()
    setMembersLoading(true)
    communityAdmin.members({ serverId, search: memberSearch, state: memberState, offset: memberOffset }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setMembers(value) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) toast.error(reason instanceof Error ? txa(reason.message) : txa('Üyeler alınamadı.')) })
      .finally(() => { if (!controller.signal.aborted) setMembersLoading(false) })
    return () => controller.abort()
  }, [serverId, tab, memberState, memberSearch, memberOffset, revision])

  const current = detail?.id === serverId ? detail : null

  const runMemberAction = async (minutes?: number) => {
    if (!action) return
    setBusy(true)
    try {
      await communityAdmin.moderate(action.serverId, action.userId, action.operation, minutes)
      const done: Record<CommunityMemberOperation, string> = {
        timeout: minutes ? txa('Üye kısıtlandı.') : txa('Kısıtlama kaldırıldı.'),
        kick: txa('Üye sunucudan çıkarıldı.'),
        ban: txa('Üye yasaklandı.'),
        unban: txa('Yasak kaldırıldı.'),
      }
      toast.success(done[action.operation])
      setAction(null)
      setRevision((value) => value + 1)
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('İşlem tamamlanamadı.'))
    } finally {
      setBusy(false)
    }
  }

  const runArchive = async () => {
    if (!current) return
    setBusy(true)
    try {
      await communityAdmin.archive(current, !current.archived_at)
      toast.success(current.archived_at ? txa('Sunucu arşivden çıkarıldı.') : txa('Sunucu arşivlendi.'))
      setArchiveOpen(false)
      setRevision((value) => value + 1)
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('İşlem tamamlanamadı.'))
    } finally {
      setBusy(false)
    }
  }

  if (!current) {
    return (
      <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 rounded-[20px] border border-border/70 bg-card/60 px-6 py-16 text-center text-[13px] text-muted-foreground max-xl:h-full max-xl:rounded-none max-xl:border-0" data-testid="admin-community-server-detail">
        {error ? (<>{error}<Button size="sm" variant="outline" onClick={() => setRevision((value) => value + 1)}>{txa('Tekrar dene')}</Button></>) : <Loader2 className="size-5 animate-spin" />}
      </section>
    )
  }

  const archived = Boolean(current.archived_at)
  const archiveButton = (
    <Button variant="outline" size={layout === 'desk' ? 'sm' : 'default'} disabled={busy} onClick={() => setArchiveOpen(true)} className="gap-1.5" data-testid="admin-community-archive">
      {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}{archived ? txa('Arşivden çıkar') : txa('Arşivle')}
    </Button>
  )
  const channelsByCategory = current.channels.reduce<Record<string, CommunityAdminServer['channels']>>((groups, channel) => {
    const key = channel.category?.trim() || txa('Kanallar')
    groups[key] = [...(groups[key] ?? []), channel]
    return groups
  }, {})

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Sunucu ayrıntısı')}
      data-testid="admin-community-server-detail"
    >
      <header className="border-b border-border/60 px-5 py-3.5">
        <div className="flex items-start gap-3">
          <ServerAvatar name={current.name} url={current.avatar_url} large />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Pill tone={current.kind === 'fansub' ? 'sky' : undefined}>{KIND_LABEL[current.kind]}</Pill>
              {archived ? <Pill tone="amber">{txa('Arşivlendi')}</Pill> : null}
              {current.fansub && current.fansub.is_active === false ? <Pill tone="rose">{txa('Fansub pasif')}</Pill> : null}
              <span className="text-[11.5px] text-muted-foreground">{JOIN_MODE_LABEL[current.join_mode]}</span>
            </span>
            <h2 className="mt-1 truncate text-[17px] font-bold tracking-tight">{current.name}</h2>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {txa('Sahibi')}{' '}
              {current.owner ? <AdminEntityHoverCard kind="user" entityKey={current.owner.id}>@{current.owner.username ?? txa('üye')}</AdminEntityHoverCard> : '—'}
              {current.fansub ? <>{' · '}<AdminEntityHoverCard kind="fansub" entityKey={current.fansub.id}>{current.fansub.name}</AdminEntityHoverCard></> : null}
              {' · '}{formatCommunityDate(current.created_at)}
            </span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
            {layout === 'desk' ? archiveButton : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-community-server-more"><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {siteOpen ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/topluluk?sunucu=${current.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Sitede aç')}</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onShowReports(current.id)}><Flag className="size-4" />{txa('Şikâyetlerini göster')}</DropdownMenuItem>
                {current.fansub?.slug ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={`/fansub/${current.fansub.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Fansub sayfası')}</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-muted-foreground" data-testid="admin-community-server-stats">
          <Stat value={current.members.active} label={txa('aktif üye')} />
          {current.members.timeout ? <Stat value={current.members.timeout} label={txa('kısıtlı')} tone="amber" /> : null}
          {current.members.banned ? <Stat value={current.members.banned} label={txa('yasaklı')} tone="rose" /> : null}
          <Stat value={current.messages_7d} label={txa('mesaj (7 gün)')} />
          <Stat value={current.messages_total} label={txa('mesaj (toplam)')} />
          {current.reports_open ? <Stat value={current.reports_open} label={txa('açık şikâyet')} tone="rose" /> : null}
        </div>
      </header>

      <div role="tablist" aria-label={txa('Sunucu ayrıntısı bölümleri')} className="flex shrink-0 gap-1 border-b border-border/60 px-4">
        {([['overview', txa('Genel'), null], ['members', txa('Üyeler'), current.members.active], ['audit', txa('Geçmiş'), current.audit.length]] as Array<[DetailTab, string, number | null]>).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`admin-community-server-tab-${id}`}
            className={cn('relative inline-flex h-10 items-center gap-1.5 px-2.5 text-[13px] font-semibold transition-colors', tab === id ? 'text-foreground after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
            {count != null ? <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] tabular-nums">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'overview' ? (
          <div className="flex flex-col gap-5">
            {current.description?.trim() ? <p className="whitespace-pre-wrap break-words text-[13px] text-foreground [overflow-wrap:anywhere]">{current.description}</p> : null}
            <section>
              <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Kanallar ({v1})', { v1: current.channels.length })}</h3>
              {current.channels.length ? Object.entries(channelsByCategory).map(([category, channels]) => (
                <div key={category} className="mb-2">
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{category}</p>
                  <ul className="flex flex-col gap-1">
                    {channels.map((channel) => (
                      <li key={channel.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-[12.5px]">
                        {channel.is_private ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={txa('Özel kanal')} /> : <Hash className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
                        {channel.series ? <span className="hidden truncate text-[11.5px] text-muted-foreground sm:inline"><AdminEntityHoverCard kind="manga" entityKey={channel.series.id}>{channel.series.title}</AdminEntityHoverCard></span> : null}
                        {channel.archived_at ? <Pill tone="amber">{txa('Arşiv')}</Pill> : null}
                        {channel.slowmode_seconds ? <Pill>{txa('Yavaş mod')}</Pill> : null}
                        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{txa('{v1} mesaj · {v2}', { v1: channel.messages.toLocaleString(intlLocale()), v2: communityRelativeAge(channel.last_message_at) })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )) : <p className="text-[12.5px] text-muted-foreground">{txa('Kanal yok.')}</p>}
            </section>
            <section>
              <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Roller ({v1})', { v1: current.roles.length })}</h3>
              <div className="flex flex-wrap gap-1.5">
                {current.roles.map((role) => (
                  <span key={role.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-0.5 text-[12px]">
                    <span className="size-2 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />
                    {role.is_default ? txa('Herkes') : role.name}
                    <span className="tabular-nums text-muted-foreground">{role.members}</span>
                  </span>
                ))}
              </div>
            </section>
            <section className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px] sm:grid-cols-3">
              <div><p className="text-[11px] font-semibold text-muted-foreground">{txa('Dosya kullanımı')}</p><p>{formatBytes(current.storage_bytes)}</p></div>
              <div><p className="text-[11px] font-semibold text-muted-foreground">{txa('Etkin davet')}</p><p>{current.invites_active}</p></div>
              <div><p className="text-[11px] font-semibold text-muted-foreground">{txa('Bekleyen başvuru')}</p><p>{current.join_requests}</p></div>
            </section>
          </div>
        ) : null}

        {tab === 'members' ? (
          <div className="flex flex-col gap-3" data-testid="admin-community-members">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1" role="group" aria-label={txa('Üye durumu')}>
                {MEMBER_FILTERS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={memberState === value} onClick={() => setMemberState(value)} className={cn('rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors', memberState === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{txa(label)}</button>
                ))}
              </div>
              <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} maxLength={80} placeholder={txa('Üye ara')} aria-label={txa('Sunucu üyelerinde ara')} className="h-8 pl-8 text-[12.5px]" />
              </div>
            </div>
            {!members && membersLoading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : null}
            {members && !members.rows.length ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">{txa('Bu filtrede üye yok.')}</p> : null}
            {members?.rows.length ? (
              <ul className={cn('flex flex-col divide-y divide-border/50 rounded-xl border border-border/60', membersLoading && 'opacity-60')}>
                {members.rows.map((member) => {
                  const timedOut = isTimedOut(member.timeout_until)
                  const target = (operation: CommunityMemberOperation): MemberActionTarget => ({ serverId: current.id, serverName: current.name, userId: member.user_id, username: member.username, operation, timedOut })
                  return (
                    <li key={member.user_id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`admin-community-member-${member.user_id}`}>
                      {member.avatar_url ? <img src={member.avatar_url} alt="" className="size-8 shrink-0 rounded-full border border-border object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{initialsOf(member.username)}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px]">
                          <AdminEntityHoverCard kind="user" entityKey={member.user_id}><b className="font-semibold">@{member.username}</b></AdminEntityHoverCard>
                          {member.is_owner ? <Pill tone="sky">{txa('Sahip')}</Pill> : null}
                          {member.state === 'banned' ? <Pill tone="rose">{txa('Yasaklı')}</Pill> : member.state !== 'active' ? <Pill>{txa('Ayrıldı')}</Pill> : null}
                          {timedOut ? <Pill tone="amber">{txa('Kısıtlı · {v1}', { v1: formatUntil(member.timeout_until) })}</Pill> : null}
                          {member.roles.slice(0, 2).map((role) => <span key={role.name} className="text-[11px]" style={{ color: role.color }}>{role.name}</span>)}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">{txa('Son mesaj {v1} · katıldı {v2}', { v1: communityRelativeAge(member.last_message_at), v2: communityRelativeAge(member.joined_at) })}</span>
                      </span>
                      {/* Menu pencere acar: modal menu kapanirken govdede pointer-events: none birakiyordu. */}
                      {member.is_owner ? null : (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label={txa('@{v1} işlemleri', { v1: member.username })} data-testid="admin-community-member-more"><MoreHorizontal className="size-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {member.state === 'active' ? <DropdownMenuItem onSelect={() => setAction(target('timeout'))}>{timedOut ? txa('Kısıtlamayı değiştir…') : txa('Süreli kısıtla…')}</DropdownMenuItem> : null}
                            {member.state === 'active' ? <DropdownMenuItem onSelect={() => setAction(target('kick'))}>{txa('Sunucudan çıkar…')}</DropdownMenuItem> : null}
                            {member.state !== 'banned' ? <DropdownMenuItem variant="destructive" onSelect={() => setAction(target('ban'))}>{txa('Yasakla…')}</DropdownMenuItem> : null}
                            {member.state === 'banned' ? <DropdownMenuItem onSelect={() => setAction(target('unban'))}>{txa('Yasağı kaldır…')}</DropdownMenuItem> : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {members && members.total > MEMBER_PAGE ? (
              <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span className="tabular-nums">{memberOffset + 1}–{Math.min(members.total, memberOffset + MEMBER_PAGE)} / {members.total}</span>
                <span className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={memberOffset === 0} onClick={() => setMemberOffset(Math.max(0, memberOffset - MEMBER_PAGE))}><ChevronLeft className="size-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={memberOffset + MEMBER_PAGE >= members.total} onClick={() => setMemberOffset(memberOffset + MEMBER_PAGE)}><ChevronRight className="size-4" /></Button>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'audit' ? (
          current.audit.length ? (
            <ul className="flex flex-col gap-1.5" data-testid="admin-community-audit">
              {current.audit.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-[12.5px]">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{auditLabel(entry)}</span>
                    {typeof entry.details?.label === 'string' && entry.details.label ? <span className="text-muted-foreground"> · @{entry.details.label}</span> : null}
                    <span className="block text-[11.5px] text-muted-foreground">
                      {entry.actor_username ? `@${entry.actor_username}` : txa('Sistem')} · {formatCommunityDate(entry.created_at)}
                      {entry.site_admin ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-primary"><ShieldCheck className="size-3" />{txa('site yöneticisi')}</span> : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12.5px] text-muted-foreground">{txa('Kayıtlı işlem yok.')}</p>
        ) : null}
      </div>

      {layout === 'sheet' ? <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/80 px-5 py-3">{archiveButton}</footer> : null}

      <MemberActionDialog target={action} busy={busy} onCancel={() => setAction(null)} onConfirm={(minutes) => { void runMemberAction(minutes) }} />
      <ArchiveDialog server={archiveOpen ? { name: current.name, archived } : null} busy={busy} onCancel={() => setArchiveOpen(false)} onConfirm={() => { void runArchive() }} />
    </section>
  )
}
