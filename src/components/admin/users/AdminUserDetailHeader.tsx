import { BadgeCheck, CalendarDays, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { AdminManagedUser, AdminUserDetail } from '@/services/adminUserService'
import type { AdminUserProgression } from '@/services/userProgressionService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  formatCompactDate,
  getUserPresence,
  presenceDotClass,
  roleBadgeVariant,
  roleLabel,
  trustBandLabel,
  type AdminUserTrustView,
} from './adminUsersUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminUserDetailHeaderProps {
  detail: AdminUserDetail
  user: AdminManagedUser
  progression: AdminUserProgression | null
  trust: AdminUserTrustView
  isRefreshing: boolean
  onRefresh: () => void
  onClose: () => void
}

export function AdminUserDetailHeader({
  detail,
  user,
  progression,
  trust,
  isRefreshing,
  onRefresh,
  onClose,
}: AdminUserDetailHeaderProps) {
  const displayName = detail.profile.displayName?.trim() || detail.profile.username
  const presence = getUserPresence(user)
  const levelNumber = progression?.levelNumber
  const levelLabel = levelNumber
    ? `Seviye ${levelNumber}`
    : detail.profile.level || txa('Seviye bilgisi yok')
  const verificationLabel = user.isVerified === true
    ? txa('Doğrulanmış')
    : user.isVerified === false ? txa('Doğrulanmamış') : txa('Bilinmiyor')

  return (
    <header className="relative shrink-0 border-b border-border bg-card/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 bg-card/90"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          <span className="hidden sm:inline">{txa('Yenile')}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 bg-card/90"
          onClick={onClose}
          aria-label={txa('Detaylı kullanıcı bilgilerini kapat')}
        >
          <X className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{txa('Kapat')}</span>
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 pr-20 sm:pr-36 xl:grid-cols-[17.5rem_minmax(20rem,1fr)_25rem] xl:items-end xl:gap-6 xl:pr-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <img
              src={detail.profile.avatarUrl}
              alt={txa('{v1} profil görseli', { v1: displayName })}
              className="size-18 rounded-full border-2 border-card object-cover shadow-sm ring-1 ring-border sm:size-24"
              decoding="async"
            />
            <span
              className={cn(
                'absolute bottom-1 right-0.5 size-4 rounded-full border-[3px] border-card sm:size-5',
                presenceDotClass(presence.status),
              )}
              aria-label={txa('Kullanıcı durumu: {v1}', { v1: presence.label })}
              role="img"
            />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {displayName}
              </h2>
              {user.isVerified === true ? (
                <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={txa('Doğrulanmış hesap')} />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">@{detail.profile.username}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span title={detail.profile.id}>{txa('Kullanıcı ID: {v1}', { v1: detail.profile.id.slice(0, 8) })}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden="true" />
                {txa('Katılım: {v1}', { v1: formatCompactDate(detail.profile.createdAt) })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 xl:pb-1">
          <Badge variant={roleBadgeVariant(detail.profile.role)}>{roleLabel(detail.profile.role)}</Badge>
          <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300">
            {levelLabel}
          </Badge>
          <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
            <ShieldCheck className="size-3" aria-hidden="true" /> {verificationLabel}
          </Badge>
          {detail.profile.isBanned ? <Badge variant="destructive">{txa('Banlı')}</Badge> : null}
        </div>

        <div className="grid grid-cols-3 gap-0 border-t border-border/70 pt-3 xl:border-t-0 xl:pt-12">
          <HeaderMetric label={txa('Doğrulama')} value={verificationLabel} tone={user.isVerified === true ? 'positive' : 'neutral'} />
          <div className="min-w-0 border-l border-border pl-4 pr-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{txa('Güven Skoru')}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{trust.score ?? '—'} / 100</span>
            </div>
            <Progress value={trust.score ?? 0} className="mt-2 h-1.5" aria-label={txa('Güven skoru {v1}', { v1: trust.score ?? 0 })} />
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{trustBandLabel(trust.band)}</p>
          </div>
          <HeaderMetric label={txa('Son Aktivite')} value={presence.label} tone={presence.status === 'online' ? 'positive' : 'neutral'} />
        </div>
      </div>
    </header>
  )
}

function HeaderMetric({ label, value, tone }: { label: string; value: string; tone: 'positive' | 'neutral' }) {
  return (
    <div className="min-w-0 border-l border-border px-4 first:border-l-0 first:pl-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 truncate text-xs font-semibold',
        tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
      )}>
        {value}
      </p>
    </div>
  )
}
