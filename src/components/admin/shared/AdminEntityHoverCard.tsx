import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { BadgeCheck, ExternalLink, Loader2 } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import {
  getAdminEntityCard,
  type AdminEntityCard,
  type AdminEntityKind,
  type AdminFansubCard,
  type AdminMangaCard,
  type AdminUserCard,
} from '@/services/adminEntityCardService'
import { intlLocale, txa } from '@/i18n/activeLocale'

type CardState =
  | { key: string, status: 'loading' }
  | { key: string, status: 'ready', card: AdminEntityCard | null }
  | { key: string, status: 'error' }

const SITE_ROLE: Record<string, string> = { get admin() { return txa('Admin') }, get moderator() { return txa('Moderatör') }, get user() { return txa('Üye') } }
const TEAM_ROLE: Record<string, string> = { get owner() { return txa('Kurucu') }, get admin() { return txa('Yönetici') }, get moderator() { return txa('Moderatör') }, get member() { return txa('Üye') } }
const SERIES_TYPE: Record<string, string> = { get manga() { return txa('Manga') }, get manhwa() { return txa('Manhwa') }, get manhua() { return txa('Manhua') }, get webtoon() { return txa('Webtoon') }, get yerli() { return txa('Yerli') } }
const SERIES_STATUS: Record<string, string> = { get ongoing() { return txa('Devam ediyor') }, get completed() { return txa('Tamamlandı') }, get hiatus() { return txa('Ara verildi') } }

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

function relativeTime(value?: string | null) {
  if (!value) return 'yok'
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (!Number.isFinite(days)) return 'yok'
  if (days < 1) return txa('bugün')
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  if (days < 365) return txa('{v1} ay önce', { v1: Math.floor(days / 30) })
  return txa('{v1} yıl önce', { v1: Math.floor(days / 365) })
}

function Stat({ label, value }: { label: string, value: number | null }) {
  return (
    <span className="min-w-0 px-2 py-1.5 text-center">
      <b className="block text-[14px] font-black tabular-nums text-foreground">{value == null ? '—' : value.toLocaleString(intlLocale())}</b>
      <span className="block truncate text-[10.5px] text-muted-foreground">{label}</span>
    </span>
  )
}

function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid auto-cols-fr grid-flow-col divide-x divide-border/60 rounded-xl bg-muted/40">{children}</div>
}

function Pill({ children, tone = 'muted' }: { children: ReactNode, tone?: 'muted' | 'rose' | 'amber' | 'primary' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    primary: 'bg-primary/12 text-primary',
  }
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10.5px] font-semibold', tones[tone])}>{children}</span>
}

function Initials({ name, className }: { name: string, className?: string }) {
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase(intlLocale())
  return <span className={cn('flex shrink-0 items-center justify-center bg-primary/15 text-[13px] font-black text-primary', className)} aria-hidden="true">{letters || '?'}</span>
}

function CardLink({ to, children }: { to: string, children: ReactNode }) {
  return (
    <Link to={to} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
      {children}
      <ExternalLink className="size-3.5" />
    </Link>
  )
}

function FansubCardBody({ card }: { card: AdminFansubCard }) {
  return (
    <>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {card.avatar_url
            ? <img src={card.avatar_url} alt="" className="size-11 shrink-0 rounded-xl border border-border object-cover" />
            : <Initials name={card.name} className="size-11 rounded-xl" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[14px] font-bold text-foreground">
              <span className="truncate">{card.name}</span>
              {card.is_verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={txa('Doğrulanmış ekip')} /> : null}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">/{card.slug} · {formatDate(card.created_at)}{' '}{txa('kuruldu')}</p>
            {card.is_active === false ? <span className="mt-1 inline-flex"><Pill tone="rose">{txa('Pasif')}</Pill></span> : null}
          </div>
        </div>
        {card.description ? <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{card.description}</p> : null}
        <StatRow>
          <Stat label={txa('Seri')} value={card.manga_count} />
          <Stat label={txa('Bölüm')} value={card.chapter_count} />
          <Stat label={txa('Üye')} value={card.member_count} />
          <Stat label={txa('Takipçi')} value={card.follower_count} />
        </StatRow>
        <p className="text-[11.5px] text-muted-foreground">
          {txa('Son bölüm:')} <b className="font-semibold text-foreground">{relativeTime(card.last_chapter_at)}</b>
          {card.admins.length ? <> {txa('· Yönetici:')} <b className="font-semibold text-foreground">{card.admins.slice(0, 2).join(', ')}{card.admins.length > 2 ? ` +${card.admins.length - 2}` : ''}</b></> : null}
        </p>
      </div>
      <CardLink to={`/fansub/${card.slug}`}>{txa('Fansub sayfası')}</CardLink>
    </>
  )
}

function UserCardBody({ card }: { card: AdminUserCard }) {
  const title = card.display_name?.trim() || card.username
  return (
    <>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {card.avatar_url
            ? <img src={card.avatar_url} alt="" className="size-11 shrink-0 rounded-full border border-border object-cover" />
            : <Initials name={title} className="size-11 rounded-full" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-foreground">{title}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{txa('@{v1} · {v2} katıldı', { v1: card.username, v2: formatDate(card.created_at) })}</p>
            <span className="mt-1 flex flex-wrap gap-1">
              <Pill tone={card.role === 'admin' || card.role === 'moderator' ? 'primary' : 'muted'}>{SITE_ROLE[card.role ?? ''] ?? txa('Üye')}</Pill>
              {card.is_banned ? <Pill tone="rose">{card.ban_until ? txa('Yasaklı · {v1}', { v1: formatDate(card.ban_until) }) : txa('Yasaklı')}</Pill> : null}
              {card.is_premium ? <Pill tone="amber">{txa('Destekçi')}</Pill> : null}
            </span>
          </div>
        </div>
        {card.fansubs.length ? (
          <span className="flex flex-wrap gap-1">
            {card.fansubs.slice(0, 3).map((team) => <Pill key={team.slug}>{team.name} · {TEAM_ROLE[team.role ?? ''] ?? txa('Üye')}</Pill>)}
            {card.fansubs.length > 3 ? <Pill>+{card.fansubs.length - 3}</Pill> : null}
          </span>
        ) : null}
        <StatRow>
          <Stat label={txa('Yorum')} value={card.comment_count} />
          <Stat label={txa('Raporlandı')} value={card.reports_received} />
          <Stat label={txa('Rapor etti')} value={card.reports_filed} />
        </StatRow>
        <p className="text-[11.5px] text-muted-foreground">
          {txa('Son giriş:')} <b className="font-semibold text-foreground">{relativeTime(card.last_login_at)}</b>
          {card.reports_pending ? <> · <b className="font-semibold text-rose-600 dark:text-rose-300">{txa('{v1} bekleyen rapor', { v1: card.reports_pending })}</b></> : null}
        </p>
      </div>
      <CardLink to={`/profil/${encodeURIComponent(card.username)}`}>{txa('Profil')}</CardLink>
    </>
  )
}

function MangaCardBody({ card }: { card: AdminMangaCard }) {
  const meta = [card.fansub_name, SERIES_TYPE[card.series_type ?? ''], SERIES_STATUS[card.status ?? '']].filter(Boolean).join(' · ')
  return (
    <>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <img src={card.cover_image_url || buildCoverPlaceholder(card.title)} alt="" className="h-[68px] w-12 shrink-0 rounded-lg border border-border object-cover" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">{card.title}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{meta || '—'}</p>
            <span className="mt-1 flex flex-wrap gap-1">
              {card.is_mature ? <Pill tone="rose">+18</Pill> : null}
              {card.is_approved === false ? <Pill tone="amber">{txa('Onay bekliyor')}</Pill> : null}
              {card.is_active === false ? <Pill tone="rose">{txa('Pasif')}</Pill> : null}
              {(card.genres ?? []).slice(0, 3).map((genre) => <Pill key={genre}>{genre}</Pill>)}
            </span>
          </div>
        </div>
        <StatRow>
          <Stat label={txa('Bölüm')} value={card.chapter_count} />
          <Stat label={txa('Takipçi')} value={card.follower_count} />
          <Stat label={txa('Okunma')} value={card.total_views} />
        </StatRow>
        <p className="text-[11.5px] text-muted-foreground">
          {txa('Son bölüm:')} <b className="font-semibold text-foreground">{relativeTime(card.last_chapter_at)}</b> {txa('· Eklendi:')} <b className="font-semibold text-foreground">{formatDate(card.created_at)}</b>
        </p>
      </div>
      {card.is_approved !== false ? <CardLink to={`/manga/${card.slug}`}>{txa('Seri sayfası')}</CardLink> : null}
    </>
  )
}

/**
 * Admin info card: a short summary on hovering a fansub, user or series name (or
 * keyboard focus); data loads on first open. Without a key the name stays plain
 * text. Inside a button (list row) use `focusable={false}` to avoid nested
 * focusable elements.
 */
export function AdminEntityHoverCard({ kind, entityKey, children, className, focusable = true }: {
  kind: AdminEntityKind
  /** Id, address or name (users can also be @name). */
  entityKey?: string | null
  children: ReactNode
  className?: string
  focusable?: boolean
}) {
  const key = entityKey?.trim() || ''
  const stateKey = `${kind}:${key}`
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<CardState | null>(null)

  useEffect(() => {
    if (!open || !key) return undefined
    let active = true
    setState((current) => (current?.key === stateKey && current.status === 'ready' ? current : { key: stateKey, status: 'loading' }))
    getAdminEntityCard(kind, key)
      .then((card) => { if (active) setState({ key: stateKey, status: 'ready', card }) })
      .catch(() => { if (active) setState({ key: stateKey, status: 'error' }) })
    return () => { active = false }
  }, [open, kind, key, stateKey])

  if (!key) return <span className={className}>{children}</span>

  const current = state?.key === stateKey ? state : null
  let body: ReactNode = (
    <p className="flex items-center gap-2 px-4 py-3 text-[12.5px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{txa('Yükleniyor…')}</p>
  )
  if (current?.status === 'error') body = <p className="px-4 py-3 text-[12.5px] text-destructive">{txa('Bilgi kartı yüklenemedi.')}</p>
  if (current?.status === 'ready') {
    const card = current.card
    if (!card) body = <p className="px-4 py-3 text-[12.5px] text-muted-foreground">{txa('Kayıt bulunamadı.')}</p>
    else if (card.kind === 'fansub') body = <FansubCardBody card={card} />
    else if (card.kind === 'user') body = <UserCardBody card={card} />
    else body = <MangaCardBody card={card} />
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={350} closeDelay={120}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className={cn('cursor-default rounded-sm underline decoration-muted-foreground/40 decoration-dotted underline-offset-[3px] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50', className)}
          data-testid={`admin-entity-${kind}`}
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[300px] overflow-hidden rounded-2xl p-0" data-testid="admin-entity-card">
        {body}
      </HoverCardContent>
    </HoverCard>
  )
}
