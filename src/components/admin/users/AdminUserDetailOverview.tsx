import { Link } from '@/i18n/router'
import {
  Activity,
  BadgeCheck,
  Ban,
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react'
import type { AdminManagedUser, AdminUserDetail } from '@/services/adminUserService'
import type { AdminUserProgression } from '@/services/userProgressionService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AdminUserProgressionDetail } from './AdminUserProgressionDetail'
import { AdminUserTrustDetailCard } from './AdminUserTrustDetailCard'
import {
  formatCompactDate,
  getUserPresence,
  roleLabel,
  trustBandLabel,
  type AdminUserTrustView,
} from './adminUsersUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminUserDetailOverviewProps {
  detail: AdminUserDetail
  user: AdminManagedUser
  progression: AdminUserProgression | null
  trust: AdminUserTrustView
  isBusy?: boolean
  isSelf?: boolean
  onToggleBan?: (user: AdminManagedUser) => void
  onOpenOwnerships: () => void
  onOpenModeration: () => void
}

export function AdminUserDetailOverview({
  detail,
  user,
  progression,
  trust,
  isBusy = false,
  isSelf = false,
  onToggleBan,
  onOpenOwnerships,
  onOpenModeration,
}: AdminUserDetailOverviewProps) {
  const presence = getUserPresence(user)
  const totalComments = detail.stats.mangaCommentCount
  const ownershipCount = Object.values(detail.inventory).reduce((total, items) => total + items.length, 0)
  const displayedBadges = detail.badges.filter((badge) => badge.isDisplayed)

  return (
    <div className="space-y-2.5" data-testid="admin-user-detail-overview">
      <div className="grid items-stretch gap-2.5 lg:grid-cols-[0.95fr_1.05fr_1.45fr]">
        <OverviewCard title={txa('Profil Özeti')}>
          <DetailList>
            <DetailItem label={txa('Görünen ad')} value={detail.profile.displayName?.trim() || detail.profile.username} />
            <DetailItem label={txa('Kullanıcı etiketi')} value={`@${detail.profile.username}`} />
            <DetailItem label={txa('Rol')} value={roleLabel(detail.profile.role)} />
            <DetailItem label={txa('Seviye')} value={progression ? `${progression.levelNumber} · ${txa(progression.title)}` : (detail.profile.level ? txa(detail.profile.level) : null) || txa('Bilinmiyor')} />
            <DetailItem label={txa('Üyelik süresi')} value={formatMembershipDuration(detail.profile.createdAt)} />
            <DetailItem
              label={txa('Son aktivite')}
              value={presence.label}
              valueClassName={presence.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : undefined}
            />
            <DetailItem label={txa('Yorum katkısı')} value={txa('{v1} yorum', { v1: totalComments })} />
          </DetailList>
        </OverviewCard>

        <OverviewCard title={txa('Hesap Sağlığı')}>
          <DetailList>
            <StatusItem
              label={txa('Hesap durumu')}
              value={detail.profile.isBanned ? txa('Banlı') : detail.profile.isActive ? txa('Aktif') : txa('Pasif')}
              tone={detail.profile.isBanned ? 'negative' : detail.profile.isActive ? 'positive' : 'neutral'}
            />
            <StatusItem
              label={txa('E-posta doğrulaması')}
              value={user.isVerified === true ? txa('Doğrulanmış') : user.isVerified === false ? txa('Doğrulanmamış') : txa('Bilinmiyor')}
              tone={user.isVerified === true ? 'positive' : 'neutral'}
            />
            <StatusItem
              label={txa('Güven bandı')}
              value={trustBandLabel(trust.band)}
              tone={trust.band === 'trusted' ? 'positive' : trust.band === 'low' ? 'negative' : 'neutral'}
            />
            <DetailItem label={txa('Kanıt güveni')} value={trust.confidence === 'unknown' ? txa('Bilinmiyor') : trust.confidence === 'high' ? txa('Yüksek') : trust.confidence === 'medium' ? txa('Orta') : txa('Düşük')} />
            <DetailItem label={txa('Kayıt tarihi')} value={formatCompactDate(detail.profile.createdAt)} />
            <DetailItem label={txa('Fansub üyeliği')} value={detail.stats.fansubMembershipCount.toLocaleString(intlLocale())} />
          </DetailList>
          {detail.profile.isBanned && detail.profile.banReason ? (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs">
              <p className="font-medium text-destructive">{txa('Aktif ban nedeni')}</p>
              <p className="mt-1 leading-5 text-muted-foreground">{detail.profile.banReason}</p>
            </div>
          ) : null}
        </OverviewCard>

        {trust ? <AdminUserTrustDetailCard trust={trust} /> : null}
      </div>

      <div className="grid items-start gap-2.5 lg:grid-cols-[0.95fr_1.05fr_1.45fr]">
        <OverviewCard title={txa('Hızlı İşlemler')}>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="min-h-11 justify-start" asChild>
              <Link to={`/profil/${encodeURIComponent(detail.profile.username)}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" /> {txa('Profili görüntüle')}
              </Link>
            </Button>
            <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={onOpenOwnerships}>
              <BriefcaseBusiness className="size-4" aria-hidden="true" />{' '}{txa('Sahiplikleri incele')}
            </Button>
            <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={onOpenModeration}>
              <ShieldCheck className="size-4" aria-hidden="true" /> {txa('Moderasyon geçmişi')}
            </Button>
            {onToggleBan ? (
              <Button
                type="button"
                variant={detail.profile.isBanned ? 'outline' : 'destructive'}
                className="min-h-11 justify-start"
                disabled={isBusy || (isSelf && !detail.profile.isBanned)}
                onClick={() => onToggleBan(user)}
              >
                {detail.profile.isBanned
                  ? <ShieldOff className="size-4" aria-hidden="true" />
                  : <Ban className="size-4" aria-hidden="true" />}
                {detail.profile.isBanned ? txa('Banı kaldır') : txa('Kullanıcıyı banla')}
              </Button>
            ) : null}
          </div>
        </OverviewCard>

        {progression ? (
          <AdminUserProgressionDetail progression={progression} />
        ) : (
          <OverviewCard title={txa('Seviye İlerlemesi')}>
            <p className="text-xs leading-5 text-muted-foreground">{txa('Seviye özeti bu kullanıcı için henüz üretilemedi.')}</p>
          </OverviewCard>
        )}

        <OverviewCard
          title={txa('Hesap Özeti')}
          action={(
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-primary" onClick={onOpenOwnerships}>
              {txa('Tüm sahiplikler')}
            </Button>
          )}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryMetric icon={BookOpen} label={txa('Okuma kaydı')} value={detail.stats.readingCount} />
            <SummaryMetric icon={MessageCircle} label={txa('Yorum')} value={totalComments} />
            <SummaryMetric icon={Users} label={txa('Takipçi')} value={detail.stats.followers} />
            <SummaryMetric icon={BriefcaseBusiness} label={txa('Sahiplik')} value={ownershipCount} />
            <SummaryMetric icon={BadgeCheck} label={txa('Gösterilen rozet')} value={displayedBadges.length} />
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold text-foreground">{txa('Görünür rozetler')}</p>
            {displayedBadges.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{txa('Kullanıcının profilinde gösterdiği rozet yok.')}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {displayedBadges.slice(0, 6).map((badge) => (
                  <Badge key={badge.badgeId} variant="secondary">{badge.name}</Badge>
                ))}
                {displayedBadges.length > 6 ? <Badge variant="outline">+{displayedBadges.length - 6}</Badge> : null}
              </div>
            )}
          </div>
        </OverviewCard>
      </div>
    </div>
  )
}

function OverviewCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AdminSurface className="h-full p-4">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </AdminSurface>
  )
}

function DetailList({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-2.5 text-xs">{children}</dl>
}

function DetailItem({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right font-medium text-foreground', valueClassName)}>{value}</dd>
    </div>
  )
}

function StatusItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(
        'inline-flex items-center gap-1.5 text-right font-medium',
        tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'negative' && 'text-destructive',
        tone === 'neutral' && 'text-foreground',
      )}>
        <span className={cn(
          'size-1.5 rounded-full',
          tone === 'positive' && 'bg-emerald-500',
          tone === 'negative' && 'bg-destructive',
          tone === 'neutral' && 'bg-muted-foreground/50',
        )} aria-hidden="true" />
        {value}
      </dd>
    </div>
  )
}

function SummaryMetric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{label}</p>
    </div>
  )
}

function formatMembershipDuration(createdAt: string) {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return txa('Bilinmiyor')
  const totalDays = Math.max(0, Math.floor((Date.now() - created) / 86_400_000))
  const years = Math.floor(totalDays / 365)
  const months = Math.floor((totalDays % 365) / 30)
  if (years > 0) return months > 0 ? txa('{v1} yıl, {v2} ay', { v1: years, v2: months }) : txa('{v1} yıl', { v1: years })
  if (months > 0) return txa('{v1} ay', { v1: months })
  return txa('{v1} gün', { v1: totalDays })
}
