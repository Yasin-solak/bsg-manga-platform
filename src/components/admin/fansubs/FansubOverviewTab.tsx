import { Link } from '@/i18n/router'
import {
  Activity,
  BookOpen,
  ExternalLink,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { AdminManagedFansub } from '@/services/adminService'
import { compactNumber, dateTimeText } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubOverviewTabProps {
  totalMembers: number
  activeMembers: number
  leftMembers: number
  coinBalance: number
  updatedAt?: string
  statsLoading: boolean
  fansub?: AdminManagedFansub
}

export function FansubOverviewTab({
  totalMembers,
  activeMembers,
  leftMembers,
  coinBalance,
  statsLoading,
  fansub,
}: FansubOverviewTabProps) {
  const retentionRate = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0
  const activeMangaCount = fansub?.mangaCount ?? 0
  const recentActivity: Array<{ id: string; summary: string; createdAt?: string | null }> = []

  return (
    <div className="space-y-3" data-testid="admin-fansub-overview-tab">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Users} label={txa('Toplam Üye')} value={statsLoading ? '…' : compactNumber(totalMembers)} helper={txa('{v1} aktif · {v2} ayrılan', { v1: activeMembers.toLocaleString(intlLocale()), v2: leftMembers.toLocaleString(intlLocale()) })} />
        <StatCard icon={BookOpen} label={txa('Aktif seri')} value={compactNumber(activeMangaCount)} helper={txa('{v1} toplam seri', { v1: fansub?.mangaCount ?? activeMangaCount })} />
        <StatCard icon={TrendingUp} label={txa('Takipçiler')} value={compactNumber(fansub?.followerCount)} helper={txa('Kayıtlı takipçi')} />
        <StatCard icon={ShieldAlert} label={txa('Açık İnceleme')} value={compactNumber(fansub?.pendingReviewCount)} helper={txa('Düzeltme bekleyen kayıt')} tone="warning" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,0.85fr)]">
        <AdminSurface className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{txa('Fansub Sağlığı')}</h3>
          <div className="mt-4 space-y-4">
            <HealthRow label={txa('Üye devamlılığı')} value={retentionRate} helper={totalMembers > 0 ? txa('Kayıtlı üyelik geçmişi') : txa('Henüz üyelik kanıtı yok')} />
            <HealthRow label={txa('Aktiflik durumu')} value={fansub?.isActive ? 100 : 0} helper={fansub?.isActive ? txa('Yayına açık') : txa('Pasif')} />
            <HealthRow
              label={txa('İçerik onay oranı')}
              value={0}
              helper={txa('İçerik onay modeli bekleniyor')}
            />
          </div>
        </AdminSurface>

        <AdminSurface className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{txa('Açıklama / Hakkında')}</h3>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {fansub?.description || txa('Fansub açıklaması bulunmuyor.')}
          </p>
          <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{txa('Kurucu')}</dt>
              <dd className="font-medium text-foreground">{fansub?.manager ? `@${fansub.manager.username}` : txa('Kayıt yok')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{txa('Yetkili sayısı')}</dt>
              <dd className="font-medium tabular-nums text-foreground">{fansub?.moderatorCount ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{txa('Coin bakiyesi')}</dt>
              <dd className="font-medium tabular-nums text-foreground">{coinBalance.toLocaleString(intlLocale())}</dd>
            </div>
          </dl>
        </AdminSurface>

        <AdminSurface className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{txa('Kurucu ve yetkililer')}</h3>
          {fansub?.manager ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
              {fansub.manager.avatarUrl ? (
                <img loading="lazy" decoding="async" src={fansub.manager.avatarUrl} alt="" className="size-10 rounded-full border border-border object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Users className="size-4" aria-hidden="true" /></span>
              )}
              <div className="min-w-0">
                <strong className="block truncate text-sm text-foreground">@{fansub.manager.username}</strong>
                <Badge variant="outline" className="mt-1">{txa('Kurucu')}</Badge>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">{txa('Aktif kurucu kaydı bulunmuyor.')}</p>
          )}
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
            {txa('Toplam {v1} aktif üye, {v2} yetkili.', { v1: fansub?.memberCount ?? activeMembers, v2: fansub?.moderatorCount ?? 0 })}
          </p>
        </AdminSurface>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminSurface className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{txa('Son etkinlikler')}</h3>
          </div>
          {recentActivity.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{txa('Kayıtlı etkinlik bulunmuyor.')}</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{activity.summary}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{dateTimeText(activity.createdAt || undefined)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSurface>

        <AdminSurface className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{txa('Hızlı İşlemler')}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fansub ? (
              <Button type="button" variant="outline" className="min-h-11 justify-between" asChild>
                <Link to={`/fansub/${encodeURIComponent(fansub.slug)}`} target="_blank" rel="noreferrer">
                  {txa('Fansubu Görüntüle')} <ExternalLink className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11 justify-start" disabled>
              <Activity className="size-4" aria-hidden="true" /> {txa('Yönetim işlemleri sekmelerde')}
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
            {txa('Üye rolleri, manga durumları ve ekonomi kayıtları ilgili sekmelerde denetlenebilir şekilde yönetilir.')}
          </p>
        </AdminSurface>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  helper: string
  tone?: 'warning'
}) {
  return (
    <AdminSurface className="p-4">
      <div className="flex items-center gap-3">
        <span className={tone === 'warning'
          ? 'flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <strong className="block text-xl tabular-nums text-foreground">{value}</strong>
        </div>
      </div>
      <p className="mt-3 truncate text-[10px] text-muted-foreground">{helper}</p>
    </AdminSurface>
  )
}

function HealthRow({ label, value, helper }: { label: string; value: number; helper: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{txa('%{v1}', { v1: clamped })}</span>
      </div>
      <Progress value={clamped} className="h-1.5" />
      <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>
    </div>
  )
}
