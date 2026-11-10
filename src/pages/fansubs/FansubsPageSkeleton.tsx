import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface FansubsPageSkeletonProps {
  showFansubRequestAction: boolean
}

function SkeletonPill({ className }: { className?: string }) {
  return <Skeleton className={cn('h-11 rounded-xl bg-muted/45', className)} />
}

function SidebarRowSkeleton({ withRank = false }: { withRank?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1.5">
      {withRank ? <Skeleton className="h-5 w-5 shrink-0 rounded-full bg-muted/40" /> : null}
      <Skeleton className="h-8 w-8 shrink-0 rounded-full bg-muted/45" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-[72%] bg-muted/40" />
        <Skeleton className="h-2.5 w-[44%] bg-muted/30" />
      </div>
    </div>
  )
}

function SidebarPanelSkeleton({ rows = 4, ranked = false }: { rows?: number; ranked?: boolean }) {
  return (
    <section className="rounded-lg border border-border/80 bg-card/70 p-3 dark:border-white/10 dark:bg-black/28">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 rounded-full bg-primary/25" />
        <Skeleton className="h-4 w-28 bg-muted/45" />
      </div>
      <div className="mt-3 space-y-1">
        {Array.from({ length: rows }).map((_, index) => (
          <SidebarRowSkeleton key={index} withRank={ranked} />
        ))}
      </div>
    </section>
  )
}

function DirectoryCardSkeleton() {
  return (
    <div className="h-[300px] overflow-hidden rounded-lg border border-border/85 bg-card/85 dark:border-white/10">
      <Skeleton className="h-[92px] rounded-none bg-muted/35" />
      <div className="flex h-[208px] flex-col p-3">
        <div className="-mt-11 flex items-end gap-3">
          <Skeleton className="h-[72px] w-[72px] rounded-full bg-muted/45" />
          <div className="min-w-0 flex-1 pb-2">
            <Skeleton className="h-4 w-[68%] bg-muted/45" />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full bg-muted/35" />
          <Skeleton className="h-3 w-[82%] bg-muted/30" />
        </div>
        <div className="mt-auto grid grid-cols-3 gap-1.5">
          <Skeleton className="h-4 bg-muted/30" />
          <Skeleton className="h-4 bg-muted/30" />
          <Skeleton className="h-4 bg-muted/30" />
        </div>
        <Skeleton className="mt-3 h-9 rounded-md bg-muted/35" />
      </div>
    </div>
  )
}

function WeeklyLeaderSkeleton() {
  return (
    <section className="relative isolate overflow-hidden rounded-lg border border-border/80 bg-card dark:border-white/10 lg:h-[300px]">
      <Skeleton className="absolute inset-0 rounded-none bg-muted/30" />
      <div className="relative z-10 flex min-h-[300px] flex-col gap-5 p-5 lg:block lg:h-full lg:min-h-0">
        <Skeleton className="h-28 w-28 shrink-0 rounded-full bg-muted/50 lg:absolute lg:left-8 lg:top-1/2 lg:-translate-y-1/2" />
        <div className="min-w-0 space-y-4 lg:absolute lg:left-[220px] lg:right-6 lg:top-12">
          <Skeleton className="h-7 w-[260px] max-w-full bg-muted/55" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-[560px] max-w-full bg-muted/40" />
            <Skeleton className="h-3.5 w-[420px] max-w-[82%] bg-muted/35" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:absolute lg:bottom-[42px] lg:left-[220px] lg:right-[220px]">
          <SkeletonPill className="h-7 w-[108px] bg-muted/45" />
          <SkeletonPill className="h-7 w-[96px] bg-muted/45" />
          <SkeletonPill className="h-7 w-[86px] bg-muted/45" />
          <SkeletonPill className="h-7 w-[96px] bg-muted/45" />
        </div>
        <div className="mt-auto flex shrink-0 flex-col gap-2 sm:flex-row lg:absolute lg:bottom-6 lg:right-5 lg:mt-0 lg:w-[178px] lg:flex-col">
          <Skeleton className="h-[42px] rounded-md bg-muted/45" />
          <Skeleton className="h-10 rounded-md bg-muted/35" />
        </div>
      </div>
    </section>
  )
}

export function FansubsPageSkeleton({ showFansubRequestAction }: FansubsPageSkeletonProps) {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label={txa('Fansublar yükleniyor')}>
      <div className="fixed left-[260px] right-[260px] top-4 z-40 hidden min-w-0 items-center gap-3 xl:flex">
        <Skeleton className="h-11 w-[420px] shrink-0 rounded-xl bg-muted/35" />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <SkeletonPill className="w-[104px]" />
          <SkeletonPill className="w-[150px]" />
          <SkeletonPill className="w-[178px]" />
          <SkeletonPill className="w-[150px]" />
          {showFansubRequestAction ? <SkeletonPill className="w-[124px] bg-primary/25" /> : null}
        </div>
      </div>

      <div className="w-full px-5 py-4">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <main className="space-y-3">
            <div className="space-y-4 pt-1">
              <div className="flex items-end gap-5">
                <Skeleton className="h-9 w-36 bg-muted/45" />
                <Skeleton className="h-4 w-[520px] max-w-[60vw] bg-muted/35" />
              </div>
              <div className="flex gap-2 overflow-hidden xl:hidden">
                <SkeletonPill className="h-10 w-24" />
                <SkeletonPill className="h-10 w-32" />
                <SkeletonPill className="h-10 w-36" />
              </div>
            </div>

            <WeeklyLeaderSkeleton />

            <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <DirectoryCardSkeleton key={index} />
              ))}
            </section>
          </main>

          <aside className="space-y-3 xl:sticky xl:top-20">
            <SidebarPanelSkeleton rows={5} ranked />
            <SidebarPanelSkeleton rows={4} />
            <SidebarPanelSkeleton rows={3} />
            <section className="rounded-lg border border-border/80 bg-card/70 p-3 dark:border-white/10 dark:bg-black/28">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded-full bg-primary/25" />
                <Skeleton className="h-4 w-28 bg-muted/45" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Skeleton className="h-16 rounded-md bg-muted/30" />
                <Skeleton className="h-16 rounded-md bg-muted/30" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
