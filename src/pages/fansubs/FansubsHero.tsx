import { BookOpen, Clock3, Compass, Plus, Search, Users, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SORT_OPTIONS, type FansubSort } from './fansubsPageShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubsHeroProps {
  totalFansubs: number
  searchQuery: string
  selectedSort: FansubSort
  onSearchChange: (value: string) => void
  onSortChange: (value: FansubSort) => void
  onClearSearch: () => void
  onOpenFansubRequest: () => void
  showFansubRequestAction: boolean
}

const SORT_ICONS = {
  discover: Compass,
  followers: Users,
  chapters: BookOpen,
  new: Clock3,
} as const

export function FansubsHero({
  totalFansubs,
  searchQuery,
  selectedSort,
  onSearchChange,
  onSortChange,
  onClearSearch,
  onOpenFansubRequest,
  showFansubRequestAction,
}: FansubsHeroProps) {
  return (
    <>
      {/* Ust bar kaldirildiginda toolbar sayfa akisina alindi: kolon genisliginde
          yapisik (sticky) bir serit olarak durur, fixed konumlama kullanilmaz. */}
      <div className="sticky top-0 z-30 hidden min-w-0 items-center gap-3 border-b border-border/60 bg-background/85 py-3 backdrop-blur-xl xl:flex dark:border-white/10" data-testid="fansubs-page-top">
        <div className="relative w-[420px] shrink-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={txa('Manga, yazar, fansub veya kelimeyi ara...')}
            className="h-11 rounded-xl border-white/10 bg-black/45 pl-11 pr-10 text-sm shadow-sm backdrop-blur"
          />
          {searchQuery ? (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={onClearSearch}
              aria-label={txa('Aramayı temizle')}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {SORT_OPTIONS.map((option) => {
            const Icon = SORT_ICONS[option.id]
            const isActive = selectedSort === option.id
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition',
                  isActive
                    ? 'border-primary bg-primary/15 text-primary shadow-[0_0_0_1px_rgba(239,68,68,0.16)]'
                    : 'border-white/10 bg-black/35 text-muted-foreground hover:border-primary/35 hover:text-foreground',
                )}
                onClick={() => onSortChange(option.id)}
              >
                <Icon className="h-4 w-4" />
                {txa(option.label)}
              </button>
            )
          })}
          {showFansubRequestAction ? (
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-primary/70 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_rgba(239,68,68,0.18)] transition hover:bg-primary/90"
              onClick={onOpenFansubRequest}
            >
              <Plus className="h-4 w-4" />
              {txa('Fansub Kur')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:gap-5">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{txa('Fansublar')}</h1>
            <p className="min-w-0 max-w-[720px] pb-1 text-sm text-muted-foreground">
              {txa('Favori fansub topluluklarını keşfet, serileri takip et ve emek veren ekiplere destek ol.')}
            </p>
          </div>
          {/* Dar ekranda baslik+aciklama alani rozeti kirpiyordu; ayni sayi
              hemen alttaki listede "N ekip gorunuyor" olarak zaten var —
              telefonda gizle, sm..xl araliginda goster. */}
          <span className="mt-2 hidden h-9 shrink-0 items-center rounded-xl border border-white/10 bg-black/35 px-3 text-xs font-semibold text-foreground sm:inline-flex xl:hidden">
            {txa('{count} ekip', { count: totalFansubs.toLocaleString(intlLocale()) })}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:hidden">
          {SORT_OPTIONS.map((option) => {
            const Icon = SORT_ICONS[option.id]
            const isActive = selectedSort === option.id
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition',
                  isActive
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-white/10 bg-black/35 text-muted-foreground',
                )}
                onClick={() => onSortChange(option.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {txa(option.label)}
              </button>
            )
          })}
          {showFansubRequestAction ? (
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-primary/70 bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              onClick={onOpenFansubRequest}
            >
              <Plus className="h-3.5 w-3.5" />
              {txa('Fansub Kur')}
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}
