import { useTopBarOverride } from './TopBarOverrideContext'

/**
 * The old global top bar was removed: search moved to AppSidebar as GlobalSearchCommand, notifications +
 * account menu as AccountTopBarActions. This component renders as a thin
 * strip only on pages with a TopBarOverride record (e.g. shop navigation);
 * otherwise it is not visible.
 */
export function TopSearchBar() {
  const topBarOverride = useTopBarOverride()

  if (!topBarOverride) return null

  return (
    <header className="sticky top-14 z-[60] border-b border-border bg-background/95 backdrop-blur-xl lg:top-0">
      <div className="flex min-h-[74px] w-full max-w-[1640px] flex-wrap items-center gap-3 px-4 py-2 sm:px-6 md:flex-nowrap">
        <div className="min-w-0 flex-1 basis-full md:basis-auto">
          {topBarOverride.content}
        </div>
      </div>
    </header>
  )
}
