import { Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExtraPerkDefinition } from './fansubBoostConstants'
import { txa } from '@/i18n/activeLocale'

type FansubBoostPerksGridProps = {
  perks: ExtraPerkDefinition[]
  activePower: number
  onPerkClick: (perkId: string) => void
}

function CompactPerkCard({
  perk,
  unlocked,
  onClick,
}: {
  perk: ExtraPerkDefinition
  unlocked: boolean
  onClick: () => void
}) {
  const Icon = perk.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-start gap-3 rounded-[18px] border p-4 text-left transition-all duration-200',
        'hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.22)]',
        unlocked
          ? 'border-primary/20 bg-primary/[0.03] hover:border-primary/35'
          : 'border-border/50 bg-card/40 hover:border-border/70',
      )}
    >
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-2xl transition-colors',
        unlocked ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground/55',
      )}>
        <Icon className="size-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'text-sm font-semibold',
            unlocked ? 'text-foreground' : 'text-muted-foreground',
          )}>
            {perk.title}
          </span>
          <span className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            unlocked
              ? 'border-emerald-400/30 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'border-border/50 bg-muted/20 text-muted-foreground/60',
          )}>
            {unlocked ? <Check className="size-2.5" /> : <Lock className="size-2.5" />}
            {perk.requirement}+
          </span>
        </div>
        <p className={cn(
          'mt-1 text-xs leading-6',
          unlocked ? 'text-muted-foreground' : 'text-muted-foreground/55',
        )}>
          {perk.summary}
        </p>
      </div>
    </button>
  )
}

export default function FansubBoostPerksGrid({
  perks,
  activePower,
  onPerkClick,
}: FansubBoostPerksGridProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{txa('Öne çıkan takviye farkları')}</p>
        <h2 className="text-lg font-semibold text-foreground">{txa('Kalan takviye katmanları')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {txa('Temel araçlar zaten açık. Bu liste, takviye geldikçe sayfada en hissedilir hangi farkların ortaya çıktığını özetler.')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {perks.length > 0 ? perks.map((perk) => (
          <CompactPerkCard
            key={perk.id}
            perk={perk}
            unlocked={activePower >= perk.requirement}
            onClick={() => onPerkClick(perk.id)}
          />
        )) : (
          <div className="rounded-[18px] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground sm:col-span-2">
            {txa('Şu an takviye katmanına bağlı bir fark listelenmiyor.')}
          </div>
        )}
      </div>
    </section>
  )
}
