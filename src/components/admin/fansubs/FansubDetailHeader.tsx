import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, BookOpen, Coins, Calendar } from 'lucide-react'
import type { AdminManagedFansub } from '@/services/adminService'
import { dateText, type DetailTab } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubDetailHeaderProps {
  fansub: AdminManagedFansub
  tab: DetailTab
  onTabChange: (tab: DetailTab) => void
}

const TAB_ITEMS: { value: DetailTab; label: string }[] = [
  { value: 'overview', get label() { return txa('Genel') } },
  { value: 'members', get label() { return txa('Uyeler') } },
  { value: 'mangas', get label() { return txa('Mangalar') } },
  { value: 'economy', get label() { return txa('Ekonomi') } },
]

// ── Fansub detail header ──
// Banner-style profile card: large avatar, name, description, metrics and tab menu
export function FansubDetailHeader({ fansub, tab, onTabChange }: FansubDetailHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Profil kartı — gradient arka plan ile */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4">
        <div className="flex gap-4">
          <img loading="lazy" decoding="async"
            src={fansub.avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover shadow-lg"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-bold text-foreground">{fansub.name}</h2>
              <Badge
                variant={fansub.isActive ? 'default' : 'destructive'}
                className="shrink-0"
              >
                {fansub.isActive ? txa('Aktif') : txa('Pasif')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">@{fansub.slug}</p>
            {fansub.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{fansub.description}</p>
            )}
          </div>
        </div>

        {/* Metrik mini-kartları */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <MetricPill icon={BookOpen} label={txa('Manga')} value={fansub.mangaCount} />
          <MetricPill icon={Users} label={txa('Takipci')} value={fansub.followerCount} />
          <MetricPill icon={Coins} label={txa('Coin')} value={fansub.coinBalance} />
          <MetricPill icon={Calendar} label={txa('Kuruluş')} value={dateText(fansub.createdAt)} isText />
        </div>
      </div>

      {/* Sekmeler */}
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as DetailTab)}>
        <TabsList className="w-full justify-start">
          {TAB_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

// ── Small metric indicator ──
// Compact data presentation inside the header
function MetricPill({
  icon: Icon,
  label,
  value,
  isText,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  isText?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-background/50 px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <strong className="block truncate text-xs font-bold text-foreground">
          {isText ? value : (value as number).toLocaleString(intlLocale())}
        </strong>
      </div>
    </div>
  )
}
