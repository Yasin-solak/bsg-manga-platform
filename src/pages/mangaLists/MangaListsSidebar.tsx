import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Flame, Sparkles, Tags, Users, type LucideIcon } from 'lucide-react'
import { AnnouncementsPanel } from '@/components/announcements/AnnouncementsPanel'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import { UserHoverCard } from '@/components/common/UserHoverCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MangaListSummary } from '@/services/mangaListService'
import {
  formatCompactNumber,
  getWeeklyListScore,
  MangaListCoverStack,
} from '@/pages/mangaLists/mangaListsPage.shared'
import { PremiumPromoCard } from '@/components/common/PremiumPromoCard'
import { txa } from '@/i18n/activeLocale'

export type ListCuratorSummary = {
  id: string
  username: string
  avatar: string
  frameType?: string
  listCount: number
  score: number
}

type MangaListsSidebarProps = {
  weeklyList: MangaListSummary | null
  popularTags: Array<{ id: string; label: string; count: number }>
  curators: ListCuratorSummary[]
  stats: {
    publicLists: number
    totalItems: number
    activeCurators: number
  }
}

export function MangaListsSidebar({
  weeklyList,
  popularTags,
  curators,
  stats,
}: MangaListsSidebarProps) {
  return (
    <aside data-page-right-sidebar className="space-y-4 xl:sticky xl:top-4">
      <AnnouncementsPanel />
      <WeeklyListCard list={weeklyList} />
      <PopularTagsCard tags={popularTags} />
      <CuratorsCard curators={curators} />
      <ListStatsCard stats={stats} />
      <PremiumPromoCard />
    </aside>
  )
}

function SidebarCard({
  title,
  icon: Icon,
  children,
  actionLabel,
  actionTo,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  actionLabel?: string
  actionTo?: string
}) {
  return (
    <Card className="gap-0 overflow-hidden border-border/70 bg-card/85 py-0 shadow-[0_18px_50px_rgba(0,0,0,.18)]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
        <CardTitle className="inline-flex items-center gap-2 text-sm font-black">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        {actionLabel && actionTo ? (
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground">
            <Link to={actionTo}>
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-4 pt-2">{children}</CardContent>
    </Card>
  )
}

function WeeklyListCard({ list }: { list: MangaListSummary | null }) {
  return (
    <SidebarCard title={txa('BU HAFTANIN LİSTESİ')} icon={Flame}>
      {!list ? (
        <p className="py-4 text-xs text-muted-foreground">{txa('Haftalık liste için henüz yeterli veri yok.')}</p>
      ) : (
        <div className="space-y-3">
          <Link to={`/listeler/${list.id}`} className="group block">
            <div className="space-y-2">
              <h3 className="line-clamp-2 text-base font-black leading-tight group-hover:text-primary">{list.title}</h3>
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {txa('Haftalık puan, yorum hareketi ve güncellik kuralına göre öne çıktı.')}
              </p>
              <div className="-mt-1 overflow-visible rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top,rgba(239,68,68,.20),transparent_48%),#080808] px-2 pt-2">
                <MangaListCoverStack item={list} className="h-48 max-w-[272px]" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-lg border border-border/60 bg-background/55 px-2 py-1.5">
                  {list.itemsCount} manga
                </span>
                <span className="rounded-lg border border-border/60 bg-background/55 px-2 py-1.5">
                  {list.ratingAvg.toFixed(1)}{' '}{txa('puan')}
                </span>
                <span className="rounded-lg border border-border/60 bg-background/55 px-2 py-1.5">
                  {Math.round(getWeeklyListScore(list))}{' '}{txa('hafta')}
                </span>
              </div>
            </div>
          </Link>
          <Button asChild className="w-full gap-2 rounded-xl">
            <Link to={`/listeler/${list.id}`}>
              {txa('Listeyi Aç')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </SidebarCard>
  )
}

function PopularTagsCard({ tags }: { tags: Array<{ id: string; label: string; count: number }> }) {
  return (
    <SidebarCard title={txa('POPÜLER ETİKETLER')} icon={Tags}>
      {tags.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{txa('Etiket verisi bulunamadı.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 10).map((tag) => (
            <Link
              key={tag.id}
              to={`/listeler?kategori=${tag.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              #{tag.label}
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag.count}</span>
            </Link>
          ))}
        </div>
      )}
    </SidebarCard>
  )
}

function CuratorsCard({ curators }: { curators: ListCuratorSummary[] }) {
  return (
    <SidebarCard title={txa('AKTİF KÜRATÖRLER')} icon={Users}>
      {curators.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{txa('Aktif küratör verisi yok.')}</p>
      ) : (
        <div className="space-y-2">
          {curators.slice(0, 5).map((curator, index) => (
            <UserHoverCard
              key={curator.id}
              id={curator.id}
              username={curator.username}
              avatar={curator.avatar}
              frameType={curator.frameType || 'default'}
              sideOffset={12}
            >
              <Link
                to={`/profil/${curator.username}`}
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/45 p-2 transition-colors hover:border-primary/35 hover:bg-accent/25"
              >
                <span className="w-5 text-center text-xs font-black text-primary">{index + 1}</span>
                <AvatarFrame
                  src={curator.avatar}
                  alt={curator.username}
                  frameType={curator.frameType || 'default'}
                  size={34}
                  animated={true}
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-xs font-black group-hover:text-primary">@{curator.username}</p>
                  <p className="text-[11px] text-muted-foreground">{txa('{v1} liste', { v1: curator.listCount })}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[10px] font-bold text-muted-foreground">
                  {txa('küratör')}
                </span>
              </Link>
            </UserHoverCard>
          ))}
        </div>
      )}
    </SidebarCard>
  )
}

function ListStatsCard({
  stats,
}: {
  stats: {
    publicLists: number
    totalItems: number
    activeCurators: number
  }
}) {
  const rows = [
    { label: txa('Açık liste'), value: stats.publicLists, icon: Sparkles },
    { label: txa('Listelenen manga'), value: stats.totalItems, icon: Flame },
    { label: txa('Aktif küratör'), value: stats.activeCurators, icon: Users },
  ]

  return (
    <SidebarCard title={txa('LİSTE İSTATİSTİKLERİ')} icon={Sparkles}>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div key={row.label} className="rounded-xl border border-border/60 bg-background/55 p-2.5 text-center">
              <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
              <p className="text-sm font-black text-foreground">{formatCompactNumber(row.value)}</p>
              <p className="text-[10px] leading-4 text-muted-foreground">{txa(row.label)}</p>
            </div>
          )
        })}
      </div>
    </SidebarCard>
  )
}
