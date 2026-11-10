import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  BadgeCheck, BookOpen, Coins, ExternalLink, EyeOff, History, LayoutDashboard, Loader2, MessagesSquare, MoreHorizontal, RotateCcw,
  ShieldCheck, Users,
} from 'lucide-react'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { sectionToAdminPath } from '@/pages/admin/adminRoutes'
import type { AdminManagedFansub } from '@/services/adminService'
import { communityAdmin, type CommunityAdminFansubServer } from '@/services/communityAdminService'
import type { DetailTab } from './fansubManagementUtils'
import { fansubRelativeAge, trustBandLabel } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function FansubAvatar({ fansub, large = false }: { fansub: Pick<AdminManagedFansub, 'avatarUrl' | 'name'>, large?: boolean }) {
  const box = large ? 'size-14 rounded-2xl' : 'size-9 rounded-xl'
  return <img src={fansub.avatarUrl} alt="" loading="lazy" decoding="async" className={cn(box, 'shrink-0 border border-border bg-muted object-cover')} />
}

export function FansubTag({ tone, children }: { tone?: 'rose' | 'amber' | 'sky' | 'emerald' | 'violet', children: ReactNode }) {
  return (
    <span className={cn(
      'rounded-md px-1.5 py-px text-[10.5px] font-bold',
      tone === 'rose' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
        : tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
          : tone === 'sky' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
            : tone === 'emerald' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
              : tone === 'violet' ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
                : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Stat({ label, value, tone }: { label: string, value: ReactNode, tone?: 'amber' | 'rose' }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-[15px] font-bold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-300', tone === 'rose' && 'text-rose-600 dark:text-rose-300')}>{value}</dd>
    </div>
  )
}

const JOIN_MODE_LABEL: Record<CommunityAdminFansubServer['join_mode'], string> = {
  get open() { return txa('Herkes katılabilir') },
  get invite() { return txa('Davetle katılım') },
  get request() { return txa('Başvuruyla katılım') },
}

/**
 * The fansub's community server (community_v2). A summary for the site admin; full
 * management is in Admin > Community (this server opens directly).
 */
function FansubCommunityBlock({ fansub }: { fansub: AdminManagedFansub }) {
  const [state, setState] = useState<{ fansubId: string, server: CommunityAdminFansubServer | null, error: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    communityAdmin.fansubServer(fansub.id, controller.signal)
      .then((server) => { if (!controller.signal.aborted) setState({ fansubId: fansub.id, server, error: '' }) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setState({ fansubId: fansub.id, server: null, error: reason instanceof Error ? txa(reason.message) : txa('Topluluk bilgisi alınamadı.') }) })
    return () => controller.abort()
  }, [fansub.id])

  const current = state?.fansubId === fansub.id ? state : null
  return (
    <section data-testid="admin-fansub-community">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground"><MessagesSquare className="size-3.5" />{txa('Topluluk')}</h3>
      {!current ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
      ) : current.error ? (
        <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{current.error}</p>
      ) : !current.server ? (
        <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] text-muted-foreground" data-testid="admin-fansub-community-none">
          {txa('Bu fansubun topluluk sunucusu yok. Ekip yöneticisi stüdyodaki Sunucu sekmesinden açabilir.')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{current.server.name}</span>
              <span className="block text-[11.5px] text-muted-foreground">
                {JOIN_MODE_LABEL[current.server.join_mode]} · {txa('son mesaj {v1}', { v1: fansubRelativeAge(current.server.last_message_at) })}
              </span>
            </span>
            {current.server.archived_at ? <FansubTag tone="amber">{txa('Arşivlendi')}</FansubTag> : null}
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]">
              <Link to={`${sectionToAdminPath('community')}?sunucu=${current.server.id}`} data-testid="admin-fansub-community-open">{txa('Topluluk sayfasında aç')}</Link>
            </Button>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border/50 sm:grid-cols-5">
            <Stat label={txa('Üye')} value={current.server.members_active.toLocaleString(intlLocale())} />
            <Stat label={txa('Mesaj (7 gün)')} value={current.server.messages_7d.toLocaleString(intlLocale())} />
            <Stat label={txa('Kanal')} value={current.server.channels.toLocaleString(intlLocale())} />
            <Stat label={txa('Açık şikâyet')} value={current.server.reports_open.toLocaleString(intlLocale())} tone={current.server.reports_open > 0 ? 'rose' : undefined} />
            <Stat label={txa('Başvuru')} value={current.server.join_requests.toLocaleString(intlLocale())} tone={current.server.join_requests > 0 ? 'amber' : undefined} />
          </dl>
          {current.server.members_timeout || current.server.members_banned ? (
            <p className="border-t border-border/60 px-3.5 py-2 text-[11.5px] text-muted-foreground">
              {current.server.members_timeout ? txa('{v1} kısıtlı üye', { v1: current.server.members_timeout }) : ''}
              {current.server.members_timeout && current.server.members_banned ? ' · ' : ''}
              {current.server.members_banned ? txa('{v1} yasaklı', { v1: current.server.members_banned }) : ''}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * Selected fansub (the desk's right panel / drawer on narrow screens). Status, summary,
 * community server; members, series, economy and history are in a detail management
 * window.
 */
export function FansubDetailPane({ fansub, layout, busy, trustAvailable, onSetActive, onOpenDetail }: {
  fansub: AdminManagedFansub
  layout: 'desk' | 'sheet'
  busy: boolean
  trustAvailable: boolean
  onSetActive: (active: boolean) => void
  onOpenDetail: (tab: DetailTab) => void
}) {
  const size = layout === 'desk' ? 'sm' : 'default'
  const trust = fansub.trust
  const primary = fansub.isActive ? (
    <Button size={size} variant="outline" onClick={() => onOpenDetail('members')} className="gap-1.5" data-testid="admin-fansub-open-members"><Users className="size-4" />{txa('Üyeler')}</Button>
  ) : (
    <Button size={size} disabled={busy} onClick={() => onSetActive(true)} className="gap-1.5" data-testid="admin-fansub-activate">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{txa('Etkinleştir')}
    </Button>
  )

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Fansub ayrıntısı')}
      data-testid="admin-fansub-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <FansubAvatar fansub={fansub} large />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {!fansub.isActive ? <FansubTag tone="rose">{txa('Pasif')}</FansubTag> : null}
            {fansub.isVerified ? <FansubTag tone="sky"><BadgeCheck className="mr-0.5 inline size-3" />{txa('Doğrulanmış')}</FansubTag> : null}
            {fansub.boostLevel ? <FansubTag tone="violet">{txa('Takviye {v1}. seviye', { v1: fansub.boostLevel })}</FansubTag> : null}
            {fansub.pendingReviewCount ? <FansubTag tone="amber">{txa('{v1} düzeltme bekliyor', { v1: fansub.pendingReviewCount })}</FansubTag> : null}
          </span>
          <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold tracking-tight [overflow-wrap:anywhere]">{fansub.name}</h2>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {fansub.manager ? <>{txa('Yönetici')} <AdminEntityHoverCard kind="user" entityKey={fansub.manager.id}>@{fansub.manager.username}</AdminEntityHoverCard> · </> : txa('Yöneticisi yok · ')}
            {txa('son hareket')}{' '}{fansubRelativeAge(fansub.lastActivityAt)}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? primary : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-fansub-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to={buildPublicFansubPath(fansub)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Fansub sayfası')}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/fansub/${fansub.id}/yonet`} target="_blank" rel="noreferrer"><LayoutDashboard className="size-4" />{txa('Stüdyoyu aç')}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOpenDetail('mangas')}><BookOpen className="size-4" />{txa('Seriler')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('economy')}><Coins className="size-4" />{txa('Ekonomi')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('moderation')}><History className="size-4" />{txa('Yönetim geçmişi')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {fansub.isActive
                ? <DropdownMenuItem variant="destructive" onSelect={() => onSetActive(false)} data-testid="admin-fansub-deactivate"><EyeOff className="size-4" />{txa('Pasife al…')}</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onSetActive(true)}><RotateCcw className="size-4" />{txa('Etkinleştir')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {fansub.description?.trim() ? <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-6 [overflow-wrap:anywhere]">{fansub.description}</p> : null}

        <dl className="grid grid-cols-3 divide-x divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 [&>*:nth-child(-n+3)]:border-t-0" data-testid="admin-fansub-stats">
          <Stat label={txa('Üye')} value={(fansub.memberCount ?? 0).toLocaleString(intlLocale())} />
          <Stat label={txa('Moderatör')} value={(fansub.moderatorCount ?? 0).toLocaleString(intlLocale())} />
          <Stat label={txa('Seri')} value={fansub.mangaCount.toLocaleString(intlLocale())} />
          <Stat label={txa('Takipçi')} value={fansub.followerCount.toLocaleString(intlLocale())} />
          <Stat label={txa('Kasa')} value={`${fansub.coinBalance.toLocaleString(intlLocale())} coin`} />
          <Stat label={txa('Düzeltme bekleyen')} value={(fansub.pendingReviewCount ?? 0).toLocaleString(intlLocale())} tone={fansub.pendingReviewCount ? 'amber' : undefined} />
        </dl>

        <FansubCommunityBlock fansub={fansub} />

        {trustAvailable && trust ? (
          <section data-testid="admin-fansub-trust">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="size-3.5" />{txa('Güven skoru')}</h3>
            <div className="flex items-center gap-3">
              <span className="text-[20px] font-black tabular-nums">{trust.score ?? '—'}<span className="text-[12px] font-semibold text-muted-foreground"> / 100</span></span>
              <FansubTag tone={trust.band === 'trusted' ? 'emerald' : trust.band === 'high-risk' ? 'rose' : trust.band === 'review' ? 'amber' : undefined}>{trustBandLabel(trust.band)}</FansubTag>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, trust.score ?? 0))}%` }} /></div>
            {trust.components.length ? (
              <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted-foreground">
                {trust.components.slice(0, 4).map((component) => <li key={component.key} className="flex justify-between gap-3"><span className="truncate">{component.label}</span><span className="tabular-nums">{component.points > 0 ? '+' : ''}{component.points}</span></li>)}
              </ul>
            ) : null}
          </section>
        ) : null}

        <p className="text-[11.5px] text-muted-foreground">{txa('Kuruldu {v1} · adres /{v2}', { v1: fansubRelativeAge(fansub.createdAt), v2: fansub.slug || fansub.id.slice(0, 8) })}</p>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-card/80 px-5 py-3">
        {layout === 'sheet' ? primary : null}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onOpenDetail('overview')} data-testid="admin-fansub-open-manage"><ShieldCheck className="size-4" />{txa('Ayrıntılı yönetim')}</Button>
      </footer>
    </section>
  )
}
