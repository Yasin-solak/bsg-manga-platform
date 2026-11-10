import { Card, CardContent } from '@/components/ui/card'
import {
  buildProfileHeroIdentityItems,
  buildProfileHeroPulseItems,
  buildProfileHeroSocialItems,
} from './profileHeroStandards'
import type { ActivityFeedItem, FavoriteGenre, MockUser } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileHeroSupportPanelProps = {
  canViewProfileStats: boolean
  favoriteGenresSorted: FavoriteGenre[]
  latestActivities: ActivityFeedItem[]
  profileListCount: number
  user: MockUser
}

export default function ProfileHeroSupportPanel({
  canViewProfileStats,
  favoriteGenresSorted,
  latestActivities,
  profileListCount,
  user,
}: ProfileHeroSupportPanelProps) {
  const identityItems = buildProfileHeroIdentityItems({
    canViewProfileStats,
    user,
  })
  const socialItems = buildProfileHeroSocialItems(user)
  const pulseItems = buildProfileHeroPulseItems({
    favoriteGenresSorted,
    latestActivities,
    profileListCount,
  })

  return (
    <Card className="overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-sm">
      <CardContent className="space-y-6 p-5">
        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Kimlik')}</p>
          <div className="space-y-1">
            {identityItems.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 border-b border-border/40 py-3 last:border-b-0 last:pb-0 first:pt-0"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Bağlantılar')}</p>
          {socialItems.length > 0 ? (
            <div className="space-y-1">
              {socialItems.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 border-b border-border/40 py-3 last:border-b-0 last:pb-0 first:pt-0"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <p className="truncate text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-4 text-sm text-muted-foreground">
              {txa('Henüz sosyal bağlantı eklenmemiş.')}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Profil ritmi')}</p>
          <div className="grid grid-cols-3 gap-2">
            {pulseItems.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/70 bg-background/40 px-3 py-3"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5 text-primary" />
                    <span>{item.label}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{item.value}</p>
                </div>
              )
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
