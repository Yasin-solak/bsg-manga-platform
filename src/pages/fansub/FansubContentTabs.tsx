import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from '@/i18n/router'
import {
  ArrowUp,
  Bell,
  BookOpen,
  CalendarDays,
  Clock,
  Users,
} from 'lucide-react'
import { Lightning as PhosphorLightning } from '@phosphor-icons/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FANSUB_DETAIL_MANGAS_TAB,
  FANSUB_DETAIL_NOTICE_TAB,
  FANSUB_DETAIL_RELEASES_TAB,
} from '@/lib/fansubNotices'
import { cn } from '@/lib/utils'
import type {
  FansubBoostPlan,
  FansubBoostSnapshot,
  FansubBoostSupporterPreview,
  FansubBoostSupporterState,
  PurchaseFansubBoostResult,
} from '@/services/fansubBoostService'
import type { FansubPinnedNotice } from '@/services/fansubNoticeService'
import type { FansubDonationActivityItem } from '@/services/fansubService'
import type { FansubChapterPreview, FansubMangaShelfItem, FansubMember } from './types'
import FansubBoostTabContent from './FansubBoostTabContent'
import { FansubMangasTab } from './tabs/FansubMangasTab'
import { FansubNoticesTab } from './tabs/FansubNoticesTab'
import { FansubReleasesTab } from './tabs/FansubReleasesTab'
import { FansubScheduleTab } from './tabs/FansubScheduleTab'
import { FansubTeamTab } from './tabs/FansubTeamTab'
import { txa } from '@/i18n/activeLocale'

type FansubContentTabsProps = {
  fansubId: string
  fansubSlug?: string
  fansubName: string
  fansubAvatar?: string | null
  isBoostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  recentDonationPreview: FansubDonationActivityItem[]
  boostPlans: FansubBoostPlan[]
  currentUserCoins: number
  isFansubAdmin?: boolean
  onBoostPurchaseSuccess?: (result: PurchaseFansubBoostResult) => void
  mangas: FansubMangaShelfItem[]
  canSeePending: boolean
  members: FansubMember[]
  chapters: FansubChapterPreview[]
  pinnedNotices: FansubPinnedNotice[]
  /**
   * Profile layout: the tab bar is sticky under the showcase (avatar + name show when stuck),
   * content on the left, the given side column on the right.
   */
  stage: {
    aside: ReactNode
    onTop: () => void
  }
}

// Sekme cubugunun yapistigi yer: mobilde ust cubugun (56px) alti, masaustunde en ust.
const stickyTop = () => (window.matchMedia('(min-width: 1024px)').matches ? 0 : 56)

type TabItem = {
  id: FansubDetailTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

type FansubDetailTab =
  | 'takviye'
  | typeof FANSUB_DETAIL_NOTICE_TAB
  | typeof FANSUB_DETAIL_MANGAS_TAB
  | 'ekip'
  | typeof FANSUB_DETAIL_RELEASES_TAB
  | 'takvim'

function isFansubDetailTab(value: string | null, allowedTabs: FansubDetailTab[]): value is FansubDetailTab {
  return Boolean(value && allowedTabs.includes(value as FansubDetailTab))
}

function buildNextSearchParams(searchParams: URLSearchParams, nextTab: FansubDetailTab, defaultTab: FansubDetailTab) {
  const nextParams = new URLSearchParams(searchParams)
  if (nextTab === defaultTab) {
    nextParams.delete('tab')
  } else {
    nextParams.set('tab', nextTab)
  }
  return nextParams
}

export default function FansubContentTabs({
  fansubId,
  fansubSlug,
  fansubName,
  fansubAvatar,
  isBoostEnabled,
  boostSnapshot,
  supporterState,
  supporterPreview,
  recentDonationPreview,
  boostPlans,
  currentUserCoins,
  isFansubAdmin = false,
  onBoostPurchaseSuccess,
  mangas,
  canSeePending,
  members,
  chapters,
  pinnedNotices,
  stage,
}: FansubContentTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const markerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const [indicator, setIndicator] = useState<{ left: number, width: number } | null>(null)

  const defaultTab: FansubDetailTab = isBoostEnabled ? 'takviye' : FANSUB_DETAIL_MANGAS_TAB
  const allowedTabs = useMemo<FansubDetailTab[]>(() => {
    const nextTabs: FansubDetailTab[] = [
      FANSUB_DETAIL_NOTICE_TAB,
      FANSUB_DETAIL_MANGAS_TAB,
      'ekip',
      FANSUB_DETAIL_RELEASES_TAB,
      'takvim',
    ]
    if (isBoostEnabled) {
      nextTabs.unshift('takviye')
    }
    return nextTabs
  }, [isBoostEnabled])

  const activeTabParam = searchParams.get('tab')
  const activeTab = isFansubDetailTab(activeTabParam, allowedTabs)
    ? activeTabParam
    : defaultTab

  const tabs: TabItem[] = []
  const boostTabBadgeCount = boostSnapshot?.activeSupporterCount ?? 0

  if (isBoostEnabled) {
    tabs.push({
      id: 'takviye',
      label: txa('Takviye'),
      icon: (props: { className?: string }) => <PhosphorLightning size={16} weight="fill" className={props.className} />,
      badge: boostTabBadgeCount > 0 ? boostTabBadgeCount : undefined,
    })
  }

  tabs.push(
    {
      id: FANSUB_DETAIL_NOTICE_TAB,
      label: txa('Duyurular'),
      icon: Bell,
      badge: pinnedNotices.length > 0 ? pinnedNotices.length : undefined,
    },
    {
      id: FANSUB_DETAIL_MANGAS_TAB,
      label: txa('Mangalar'),
      icon: BookOpen,
      badge: mangas.length > 0 ? mangas.length : undefined,
    },
    {
      id: 'ekip',
      label: txa('Ekip'),
      icon: Users,
      badge: members.length > 0 ? members.length : undefined,
    },
    {
      id: FANSUB_DETAIL_RELEASES_TAB,
      label: txa('Son Bölümler'),
      icon: Clock,
      badge: chapters.length > 0 ? chapters.length : undefined,
    },
    {
      id: 'takvim' as const,
      label: txa('Takvim'),
      icon: CalendarDays,
    },
  )

  // Cubuk yapisinca (vitrin kaydi) avatar + isim gorunur.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const top = barRef.current?.getBoundingClientRect().top
      setStuck(top !== undefined && top <= stickyTop() + 1)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // Aktif sekmenin altindaki isikli cizgi: sekme / sayi degisince yeniden olculur.
  const badgeKey = `${pinnedNotices.length}:${mangas.length}:${members.length}:${chapters.length}`
  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current
      const node = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      if (!list || !node) { setIndicator(null); return }
      const box = node.getBoundingClientRect()
      const left = box.left - list.getBoundingClientRect().left + list.scrollLeft
      setIndicator({ left, width: box.width })
      if (left < list.scrollLeft || left + box.width > list.scrollLeft + list.clientWidth) {
        list.scrollTo({ left: Math.max(0, left - 24) })
      }
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    listRef.current?.querySelectorAll('[role="tab"]').forEach((node) => observer?.observe(node))
    let alive = true
    void document.fonts?.ready.then(() => { if (alive) measure() })
    return () => { alive = false; observer?.disconnect() }
  }, [activeTab, badgeKey])

  const changeTab = (nextValue: string) => {
    const nextTab = nextValue as FansubDetailTab
    if (!allowedTabs.includes(nextTab)) return
    setSearchParams(buildNextSearchParams(searchParams, nextTab, defaultTab), { replace: true })
    // With the bar stuck a new tab starts from the top (the page does not jump between short/long tabs).
    const top = markerRef.current?.getBoundingClientRect().top
    if (top !== undefined && top <= stickyTop() + 1) {
      window.scrollTo({ top: window.scrollY + top - stickyTop() })
    }
  }

  // Tabs v2: each tab builds its own panel (in the profile tab language); no outer card.
  const panels = (
    <>
      {isBoostEnabled ? (
        <TabsContent value="takviye" className="m-0">
          <FansubBoostTabContent
            fansubId={fansubId}
            fansubName={fansubName}
            snapshot={boostSnapshot}
            supporterState={supporterState}
            supporterPreview={supporterPreview}
            recentDonationPreview={recentDonationPreview}
            plans={boostPlans}
            currentUserCoins={currentUserCoins}
            isFansubAdmin={isFansubAdmin}
            onPurchaseSuccess={onBoostPurchaseSuccess}
          />
        </TabsContent>
      ) : null}
      <TabsContent value={FANSUB_DETAIL_NOTICE_TAB} className="m-0">
        <FansubNoticesTab fansubId={fansubId} fansubSlug={fansubSlug} fansubName={fansubName} notices={pinnedNotices} />
      </TabsContent>
      <TabsContent value={FANSUB_DETAIL_MANGAS_TAB} className="m-0">
        <FansubMangasTab mangas={mangas} canSeePending={canSeePending} />
      </TabsContent>
      <TabsContent value="ekip" className="m-0">
        <FansubTeamTab members={members} />
      </TabsContent>
      <TabsContent value={FANSUB_DETAIL_RELEASES_TAB} className="m-0">
        <FansubReleasesTab chapters={chapters} fansubId={fansubId} fansubSlug={fansubSlug} />
      </TabsContent>
      <TabsContent value="takvim" className="m-0">
        <FansubScheduleTab fansubId={fansubId} fansubName={fansubName} />
      </TabsContent>
    </>
  )

  return (
    <Tabs value={activeTab} onValueChange={changeTab} className="block" data-fansub-id={fansubId}>
      <div ref={markerRef} className="scroll-mt-14 lg:scroll-mt-0" />
      <div
        ref={barRef}
        className="sticky top-14 z-30 -mx-4 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0"
        data-testid="fansub-sticky-tabs"
      >
        <div className="flex min-h-12 items-center gap-3">
          <span
            className={cn(
              'flex flex-none items-center gap-2 overflow-hidden transition-all duration-200',
              stuck ? 'max-w-[200px] pr-1 opacity-100' : 'max-w-0 opacity-0',
            )}
            aria-hidden={!stuck}
            data-testid="fansub-tabs-identity"
          >
            {fansubAvatar ? <img src={fansubAvatar} alt="" className="size-7 flex-none rounded-full object-cover" /> : null}
            <span className="hidden max-w-[140px] truncate text-[13px] font-bold sm:block">{fansubName}</span>
          </span>
          <div ref={listRef} className="relative min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
            <TabsList
              variant="line"
              className="h-auto justify-start gap-0.5 rounded-none p-0"
              aria-label={txa('Fansub sekmeleri')}
            >
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      'h-12 flex-none gap-2 rounded-lg px-3 text-[13.5px] font-semibold after:hidden',
                      isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    data-testid="fansub-tab"
                  >
                    <Icon className={cn('size-4 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground/70')} />
                    {tab.label}
                    {tab.badge !== undefined && tab.badge > 0 ? (
                      <span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums', isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    ) : null}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {indicator ? (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-0 h-[3px] rounded-t-full bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.7)] transition-[left,width] duration-300 ease-out"
                style={{ left: indicator.left + 10, width: Math.max(0, indicator.width - 20) }}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={stage.onTop}
            title={txa('Vitrine dön')}
            aria-label={txa('Vitrine dön')}
            className="hidden h-9 flex-none items-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3 text-[12.5px] font-bold text-muted-foreground hover:text-foreground sm:flex"
          >
            <ArrowUp className="size-3.5" />
            <span className="hidden 2xl:inline">{txa('Vitrine dön')}</span>
          </button>
        </div>
      </div>

      <div className="mt-6 grid min-h-[calc(100svh-7rem)] content-start items-start gap-6 lg:min-h-[calc(100svh-3.5rem)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <main key={activeTab} className="min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {panels}
        </main>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20" data-fansub-right-column>
          {stage.aside}
        </aside>
      </div>
    </Tabs>
  )
}
