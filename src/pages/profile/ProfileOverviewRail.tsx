import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  BookOpen,
  Clock3,
  Layers,
  Link2,
  ListOrdered,
  Sparkles,
  Users,
} from 'lucide-react'
import { formatRelativeTime } from './helpers'
import type { ActivityFeedItem, FavoriteGenre, MockUser } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

type ProfileOverviewRailProps = {
  canViewProfileStats: boolean
  favoriteGenresSorted: FavoriteGenre[]
  latestActivities: ActivityFeedItem[]
  ownedBadgeCount: number
  profileListCount: number
  user: MockUser
}

function CompactMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

export default function ProfileOverviewRail({
  canViewProfileStats,
  favoriteGenresSorted,
  latestActivities,
  ownedBadgeCount,
  profileListCount,
  user,
}: ProfileOverviewRailProps) {
  const recentActivities = latestActivities.slice(0, 3)
  const socialLinksPreview = user.socialLinks.slice(0, 3)
  const topGenres = favoriteGenresSorted.slice(0, 3)

  return (
    <aside className="space-y-4">
      <Card className="overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txa('Profil paneli')}</p>
            <h2 className="text-lg font-semibold text-foreground">{txa('Varlık özeti')}</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <CompactMetric label={txa('Rozet')} value={ownedBadgeCount.toLocaleString(intlLocale())} />
            <CompactMetric label={txa('Liste')} value={profileListCount.toLocaleString(intlLocale())} />
            <CompactMetric label={txa('Fansub')} value={user.followingFansubs.length.toLocaleString(intlLocale())} />
            <CompactMetric
              label={txa('Takipçi')}
              value={canViewProfileStats ? user.stats.followers.toLocaleString(intlLocale()) : txa('Gizli')}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txa('Sosyal kanal')}</p>
            <h3 className="text-lg font-semibold text-foreground">{txa('Bağlantı modülü')}</h3>
          </div>

          {socialLinksPreview.length > 0 ? (
            <div className="space-y-3">
              {socialLinksPreview.map((link, index) => (
                <div
                  key={`${link.platform}-${link.username}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{link.platform}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">{link.username}</p>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <Link2 className="size-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              {txa('Henüz sosyal bağlantı eklenmemiş.')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.1),transparent_42%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.25))] shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{txa('Canlı modüller')}</p>
            <h3 className="text-lg font-semibold text-foreground">{txa('Hızlı bakış')}</h3>
          </div>

          {topGenres.length > 0 ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4 text-primary" />
                {txa('Favori türler')}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topGenres.map((genre) => (
                  <Badge key={genre.name} variant="secondary" className="h-7 rounded-full px-3">
                    {genre.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BookOpen className="size-4 text-primary" />
                {txa('Okuma')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {txa('{v1} toplam islem', { v1: user.stats.reading.toLocaleString(intlLocale()) })}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="size-4 text-primary" />
                {txa('Fansub')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {user.followingFansubs.length.toLocaleString(intlLocale())}{' '}{txa('takip')}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ListOrdered className="size-4 text-primary" />
                {txa('Listeler')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {profileListCount.toLocaleString(intlLocale())}{' '}{txa('kayit')}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="flex items-center gap-2">
              <Clock3 className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{txa('Son hareketler')}</span>
            </div>
            {recentActivities.length > 0 ? (
              <div className="mt-3 space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="m-0 text-sm text-foreground">
                        {activity.type === 'read'
                          ? `${activity.mangaTitle || txa('Manga')} okundu`
                          : txa('{v1} yorumlandi', { v1: activity.targetLabel || txa('İçerik') })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(activity.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{txa('Henüz görüntülenecek hareket yok.')}</p>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Layers className="size-4 text-primary" />
              {txa('Kozmetik varlık')}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {txa('{v1} cerceve ve {v2} arka plan tanimli.', { v1: user.ownedFrames.length.toLocaleString(intlLocale()), v2: user.ownedBackgrounds.length.toLocaleString(intlLocale()) })}
            </p>
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
