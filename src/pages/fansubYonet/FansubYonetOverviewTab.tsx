/**
 * FansubYonetOverviewTab: studio v2 overview.
 *
 * Layout: a one-row metric strip on top; growth + publishing line + team on the left,
 * to-dos (pending work + next steps by state), boost,
 * server and shortcuts on the right. Tight enough to leave no empty space even with little data.
 *
 * Data:
 * - summary (analytics) and community (community v2 summary) come from the page level;
 * sidebar badges use the same data.
 * - cockpit + timeseries + team applications are fetched in this tab; if one errors
 * panels keep working with an empty state.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BookOpen, ChatsCircle, FilePlus, Megaphone, RocketLaunch, UsersThree } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { buildPublicFansubPath } from '@/lib/routes'
import {
  getFansubManageActivityTimeseries,
  getFansubManageOverviewCockpit,
  type FansubCommunityV2Summary,
  type FansubManageActivityTimeseries,
  type FansubManageAnalyticsSummary,
  type FansubManageOverviewCockpit,
} from '@/services/fansubManageService'
import {
  listFansubJoinRequestsForManagement,
  reviewFansubJoinRequest,
  type FansubJoinRequest,
} from '@/services/fansubMembershipService'
import { toast } from '@/services/toastService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import type { Fansub } from '@/types'
import { toErrorText, type FansubYonetTab } from './useFansubYonetState'
import {
  AttentionPanel,
  BoostPanel,
  type FansubStudioNextStep,
  GrowthPanel,
  KpiRow,
  PipelinePanel,
  QuickActionsPanel,
  ServerPanel,
  TeamActivityPanel,
} from './FansubYonetOverviewPanels'
import { txa } from '@/i18n/activeLocale'

interface FansubYonetOverviewTabProps {
  fansub: Fansub
  fansubId: string
  isBoostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
  summary: FansubManageAnalyticsSummary | null
  summaryLoading: boolean
  summaryError: string | null
  community: FansubCommunityV2Summary | null
  canCreateContent: boolean
  /** Tab permissions: panel shortcuts go only to tabs that can open. */
  canOpenTab: (tab: FansubYonetTab) => boolean
  reloadToken: number
  onReloadSummary: () => void
  onNavigateTab: (tab: FansubYonetTab) => void
  onCreateManga: () => void
  onCreateChapter: () => void
}

const EMPTY_COCKPIT: FansubManageOverviewCockpit = {
  pipeline: { draft: 0, pending: 0, scheduled: 0, published: 0, problem: 0 },
  approvalQueue: [],
  upcoming: [],
  team: { total: 0, admins: 0, moderators: 0, members: 0, tags: [] },
  community: { commentsToday: 0 },
}

export default function FansubYonetOverviewTab({
  fansub,
  fansubId,
  isBoostEnabled,
  boostSnapshot,
  summary,
  summaryLoading,
  summaryError,
  community,
  canCreateContent,
  canOpenTab,
  reloadToken,
  onReloadSummary,
  onNavigateTab,
  onCreateManga,
  onCreateChapter,
}: FansubYonetOverviewTabProps) {
  const [cockpit, setCockpit] = useState<FansubManageOverviewCockpit | null>(null)
  const [timeseries, setTimeseries] = useState<FansubManageActivityTimeseries | null>(null)
  const [joinRequests, setJoinRequests] = useState<FansubJoinRequest[]>([])
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const loadCockpit = useCallback(async () => {
    const [cockpitResult, seriesResult, joinResult] = await Promise.all([
      getFansubManageOverviewCockpit(fansubId).catch(() => null),
      getFansubManageActivityTimeseries(fansubId, 30).catch(() => null),
      listFansubJoinRequestsForManagement(fansubId, 'pending').catch(() => []),
    ])
    setCockpit(cockpitResult)
    setTimeseries(seriesResult)
    setJoinRequests(joinResult)
  }, [fansubId])

  useEffect(() => {
    void loadCockpit()
  }, [loadCockpit, reloadToken])

  const handleReviewJoinRequest = useCallback(async (requestId: string, action: 'approve' | 'reject') => {
    setReviewingId(requestId)
    try {
      await reviewFansubJoinRequest(requestId, action)
      setJoinRequests((previous) => previous.filter((request) => request.id !== requestId))
      toast.success(action === 'approve' ? txa('Başvuru onaylandı.') : txa('Başvuru reddedildi.'))
      onReloadSummary()
    } catch (err) {
      toast.error(toErrorText(err, txa('Başvuru işlenemedi.')))
    } finally {
      setReviewingId(null)
    }
  }, [onReloadSummary])

  if (summaryLoading && !summary) {
    return (
      <section className="flex min-h-[260px] items-center justify-center gap-2 rounded-[20px] border border-border/70 bg-card/60 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {txa('Stüdyo yükleniyor…')}
      </section>
    )
  }

  if (summaryError && !summary) {
    return (
      <section className="flex flex-col gap-3 rounded-[20px] border border-destructive/40 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{txa('Genel bakış yüklenemedi')}</p>
          <p className="text-sm text-muted-foreground">{summaryError}</p>
        </div>
        <Button type="button" variant="outline" onClick={onReloadSummary}>{txa('Tekrar dene')}</Button>
      </section>
    )
  }

  const data = cockpit ?? EMPTY_COCKPIT
  const visibleJoinRequests = canOpenTab('uyelik') ? joinRequests : []
  const showBoost = isBoostEnabled && Boolean(boostSnapshot)

  // The panel should guide even with little data: at most three suggestions by state.
  const nextSteps: FansubStudioNextStep[] = []
  if (canCreateContent && (summary?.overview.totalMangaCount || 0) === 0) {
    nextSteps.push({ id: 'manga', icon: BookOpen, tone: 'violet', title: txa('İlk serini ekle'), hint: txa('Okurlar seni serilerinle bulur.'), onClick: onCreateManga })
  } else if (canCreateContent && (summary?.momentum.newChapters30d || 0) === 0) {
    nextSteps.push({ id: 'chapter', icon: FilePlus, tone: 'primary', title: txa('Yeni bölüm yükle'), hint: txa('30 gündür yeni bölüm yok; takipçiler bekliyor.'), onClick: onCreateChapter })
  }
  if (!community?.server && canOpenTab('topluluk')) {
    nextSteps.push({ id: 'server', icon: ChatsCircle, tone: 'emerald', title: txa('Sunucunu aç'), hint: txa('Okurlarınla kanallarda buluş.'), onClick: () => onNavigateTab('topluluk') })
  }
  if (showBoost && (boostSnapshot?.activeSupporterCount || 0) === 0 && canOpenTab('takviye')) {
    nextSteps.push({ id: 'boost', icon: RocketLaunch, tone: 'amber', title: txa('İlk destekçini kazan'), hint: txa('Takviye seviyesi duyuru ve tema özelliklerini açar.'), onClick: () => onNavigateTab('takviye') })
  }
  if (data.team.total > 0 && data.team.total <= 1 && canOpenTab('uyelik')) {
    nextSteps.push({ id: 'team', icon: UsersThree, tone: 'sky', title: txa('Ekip arkadaşı ekle'), hint: txa('Çeviri ve dizgi işini paylaş.'), onClick: () => onNavigateTab('uyelik') })
  }
  if (canOpenTab('duyurular')) {
    nextSteps.push({ id: 'notice', icon: Megaphone, tone: 'amber', title: txa('Takipçilerine duyuru yaz'), hint: txa('Takvimi ya da yenilikleri profilde sabitle.'), onClick: () => onNavigateTab('duyurular') })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="studio-overview">
      <KpiRow
        overview={summary?.overview}
        momentum={summary?.momentum}
        boostEnabled={showBoost}
        boostSnapshot={boostSnapshot}
        community={community}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GrowthPanel timeseries={timeseries} community={community} />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <PipelinePanel cockpit={data} onNavigateTab={onNavigateTab} />
            <TeamActivityPanel cockpit={data} activity={summary?.recentActivity || []} onNavigateTab={onNavigateTab} />
            <ServerPanel community={community} canOpenTab={canOpenTab('topluluk')} onNavigateTab={onNavigateTab} className="md:col-span-2 2xl:col-span-1" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <AttentionPanel
            pendingChapters={summary?.statuses.chapters.pending || 0}
            problemChapters={data.pipeline.problem}
            pendingJoinRequests={visibleJoinRequests.length}
            serverJoinRequests={community?.stats.pendingJoinRequests || 0}
            serverReports={community?.stats.openReports || 0}
            joinRequests={visibleJoinRequests}
            reviewingId={reviewingId}
            nextSteps={nextSteps}
            onReview={handleReviewJoinRequest}
            onNavigateTab={onNavigateTab}
          />
          {showBoost && (
            <BoostPanel snapshot={boostSnapshot} fansubName={fansub.name} canOpenTab={canOpenTab('takviye')} onNavigateTab={onNavigateTab} />
          )}
          <QuickActionsPanel
            canCreateContent={canCreateContent}
            canWriteNotice={canOpenTab('duyurular')}
            publicHref={buildPublicFansubPath({ id: fansubId, slug: fansub.slug })}
            serverId={community?.enabled ? community.server?.id ?? null : null}
            onCreateManga={onCreateManga}
            onCreateChapter={onCreateChapter}
            onNavigateTab={onNavigateTab}
          />
        </div>
      </div>
    </div>
  )
}
