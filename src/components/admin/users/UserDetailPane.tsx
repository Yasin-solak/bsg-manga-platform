import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  Activity, Ban, BookOpen, ExternalLink, FileUser, History, Loader2, MessageSquare, MoreHorizontal, Package, ShieldOff, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AdminUserRole } from '@/services/adminUserService'
import type { AdminUserDetailTab } from './adminUserDetailTabs'
import {
  formatDate,
  formatRelativeTime,
  getPrimaryFansub,
  getUserDisplayName,
  getUserPresence,
  getUserTrust,
  presenceDotClass,
  roleLabel,
  trustBandLabel,
  userLevelLabel,
  type AdminManagedUserView,
} from './adminUsersUtils'
import { ROLE_OPTIONS, roleTone } from './usersSectionViews'
import { txa, intlLocale } from '@/i18n/activeLocale'

export function UserAvatar({ user, large = false }: { user: AdminManagedUserView, large?: boolean }) {
  const presence = getUserPresence(user)
  return (
    <span className="relative shrink-0">
      <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" className={cn(large ? 'size-14' : 'size-9', 'rounded-full border border-border bg-muted object-cover')} />
      <span className={cn('absolute bottom-0 right-0 rounded-full border-2 border-card', large ? 'size-3.5' : 'size-2.5', presenceDotClass(presence.status))} aria-hidden="true" />
    </span>
  )
}

export function UserTag({ tone, children }: { tone?: 'rose' | 'amber' | 'sky' | 'emerald' | 'violet', children: ReactNode }) {
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

function Stat({ label, value, tone, title }: { label: string, value: ReactNode, tone?: 'amber' | 'rose' | 'emerald', title?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd
        title={title}
        className={cn(
          'mt-0.5 truncate text-[14px] font-bold tabular-nums',
          tone === 'amber' && 'text-amber-600 dark:text-amber-300',
          tone === 'rose' && 'text-rose-600 dark:text-rose-300',
          tone === 'emerald' && 'text-emerald-600 dark:text-emerald-300',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * Selected user (the desk's right panel / drawer on narrow screens): identity, ban
 * status, summary, role and team. Activity, reading, comments, ownership and
 * moderation history are in a detail window.
 */
export function UserDetailPane({ user, layout, currentUserId, busy, previewLoading, onChangeRole, onToggleBan, onOpenDetail }: {
  user: AdminManagedUserView
  layout: 'desk' | 'sheet'
  currentUserId?: string
  busy: boolean
  previewLoading: boolean
  onChangeRole: (role: AdminUserRole) => void
  onToggleBan: () => void
  onOpenDetail: (tab: AdminUserDetailTab) => void
}) {
  const size = layout === 'desk' ? 'sm' : 'default'
  const isSelf = currentUserId === user.id
  const presence = getUserPresence(user)
  const trust = getUserTrust(user)
  const primaryFansub = getPrimaryFansub(user)
  const extraFansubs = Math.max(0, (user.fansubCount ?? 0) - 1)

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Kullanıcı ayrıntısı')}
      data-testid="admin-user-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <UserAvatar user={user} large />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <UserTag tone={roleTone(user.role)}>{roleLabel(user.role)}</UserTag>
            {user.isBanned ? <UserTag tone="rose">{txa('Banlı')}</UserTag> : null}
            {isSelf ? <UserTag>{txa('Bu sensin')}</UserTag> : null}
            {user.isVerified === false ? <UserTag tone="amber">{txa('E-posta doğrulanmamış')}</UserTag> : null}
          </span>
          <h2 className="mt-1 truncate text-[17px] font-bold tracking-tight">{getUserDisplayName(user)}</h2>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            @{user.username} · {presence.status === 'online' || presence.status === 'idle' ? presence.label.toLocaleLowerCase(intlLocale()) : txa('son hareket {v1}', { v1: formatRelativeTime(user.lastActivityAt ?? user.lastSeenAt).toLocaleLowerCase(intlLocale()) })}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-1.5', layout === 'sheet' && 'mr-8')}>
          {layout === 'desk' ? (
            <Button size={size} variant="outline" className="gap-1.5" onClick={() => onOpenDetail('profil')} data-testid="admin-user-open-detail">
              <FileUser className="size-4" />{txa('Ayrıntılar')}
            </Button>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={txa('Diğer işlemler')} data-testid="admin-user-more"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to={`/profil/${encodeURIComponent(user.username)}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{txa('Profili aç')}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOpenDetail('aktivite')}><Activity className="size-4" />{txa('Etkinlik')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('okuma')}><BookOpen className="size-4" />{txa('Okuma')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('yorumlar')}><MessageSquare className="size-4" />{txa('Yorumlar')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('sahiplikler')}><Package className="size-4" />{txa('Sahiplikler')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenDetail('moderasyon')}><History className="size-4" />{txa('Moderasyon geçmişi')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.isBanned
                ? <DropdownMenuItem disabled={busy} onSelect={onToggleBan} data-testid="admin-user-unban"><ShieldOff className="size-4" />{txa('Banı kaldır…')}</DropdownMenuItem>
                : <DropdownMenuItem variant="destructive" disabled={busy || isSelf} onSelect={onToggleBan} data-testid="admin-user-ban"><Ban className="size-4" />{txa('Banla…')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {previewLoading ? <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground" role="status"><Loader2 className="size-3.5 animate-spin" />{txa('Güncel özet yükleniyor…')}</p> : null}

        {user.isBanned ? (
          <section className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-3.5 py-3" data-testid="admin-user-ban-state">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-rose-700 dark:text-rose-300">
                {user.banUntil ? txa('{v1} tarihine kadar banlı', { v1: formatDate(user.banUntil) }) : txa('Kalıcı olarak banlı')}
              </span>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" disabled={busy} onClick={onToggleBan}><ShieldOff className="size-3.5" />{txa('Banı kaldır')}</Button>
            </div>
            {user.banReason?.trim() ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[12.5px] leading-5 [overflow-wrap:anywhere]">{user.banReason}</p> : null}
            {user.bannedAt ? <p className="mt-1 text-[11px] text-muted-foreground">{txa('Ban tarihi {v1}', { v1: formatDate(user.bannedAt) })}</p> : null}
          </section>
        ) : null}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/50 sm:grid-cols-3 [&>*]:bg-card" data-testid="admin-user-stats">
          <Stat label={txa('Seviye')} value={userLevelLabel(user)} />
          <Stat
            label={txa('Güven')}
            value={trust.score == null ? '—' : `${trust.score} · ${trustBandLabel(trust.band)}`}
            tone={trust.band === 'low' ? 'rose' : trust.band === 'review' ? 'amber' : trust.band === 'trusted' ? 'emerald' : undefined}
          />
          <Stat label={txa('Durum')} value={presence.label} tone={presence.status === 'online' ? 'emerald' : presence.status === 'blocked' ? 'rose' : undefined} />
          <Stat label={txa('E-posta')} value={user.isVerified === undefined ? txa('Bilinmiyor') : user.isVerified ? txa('Doğrulanmış') : txa('Doğrulanmamış')} tone={user.isVerified === false ? 'amber' : undefined} />
          <Stat label={txa('Kayıt')} value={formatRelativeTime(user.createdAt)} title={formatDate(user.createdAt)} />
          <Stat label={txa('Kimlik')} value={`…${user.id.slice(-8)}`} title={user.id} />
        </dl>

        <section data-testid="admin-user-role">
          <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Rol')}</h3>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/50 p-1" role="radiogroup" aria-label={txa('Kullanıcı rolü')}>
            {ROLE_OPTIONS.map((option) => {
              const active = user.role === option.id
              const blocked = isSelf && option.id !== 'admin'
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy || active || blocked}
                  title={blocked ? txa('Kendi admin rolünü düşüremezsin') : undefined}
                  onClick={() => onChangeRole(option.id)}
                  data-testid={`admin-user-role-${option.id}`}
                  className={cn(
                    'h-8 rounded-lg text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed',
                    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground disabled:opacity-50',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {isSelf ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{txa('Kendi admin rolünü buradan düşüremezsin.')}</p> : null}
        </section>

        <section data-testid="admin-user-fansub">
          <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="size-3.5" />{txa('Ekip')}</h3>
          {primaryFansub ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{primaryFansub.name}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {primaryFansub.role === 'admin' ? txa('Ekip yöneticisi') : primaryFansub.role === 'moderator' ? txa('Ekip moderatörü') : txa('Ekip üyesi')}
                  {extraFansubs > 0 ? txa(' · {v1} ekip daha', { v1: extraFansubs }) : ''}
                </span>
              </span>
              <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px]">
                <Link to={`/fansub/${encodeURIComponent(primaryFansub.slug || primaryFansub.id)}`} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" />{txa('Aç')}</Link>
              </Button>
              {extraFansubs > 0 ? <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => onOpenDetail('fansub')}>{txa('Tümü')}</Button> : null}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{txa('Herhangi bir fansub ekibinde değil.')}</p>
          )}
        </section>

        {layout === 'sheet' ? (
          <Button variant="outline" className="w-full gap-1.5" onClick={() => onOpenDetail('profil')}><FileUser className="size-4" />{txa('Ayrıntılı bilgiler')}</Button>
        ) : null}
      </div>
    </section>
  )
}
