import { Copy, Sparkles, Target, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { resolveFansubBoostMilestoneState } from '@/lib/fansubBoostPresentation'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { toast } from '@/services/toastService'
import type { TierDefinition } from './fansubBoostConstants'
import { txa } from '@/i18n/activeLocale'

type FansubBoostMilestoneCardProps = {
  fansubName: string
  snapshot: FansubBoostSnapshot | null
  isFansubAdmin?: boolean
  tiers: TierDefinition[]
}

export default function FansubBoostMilestoneCard({
  fansubName,
  snapshot,
  isFansubAdmin = false,
  tiers,
}: FansubBoostMilestoneCardProps) {
  const milestone = resolveFansubBoostMilestoneState(snapshot, fansubName, tiers)

  const handleCopy = async () => {
    if (!navigator?.clipboard) {
      toast.error(txa('Panoya kopyalama bu cihazda desteklenmiyor.'))
      return
    }

    try {
      await navigator.clipboard.writeText(milestone.shareText)
      toast.success(txa('Kilometre taşı metni panoya kopyalandı.'))
    } catch {
      toast.error(txa('Kilometre taşı metni kopyalanamadı.'))
    }
  }

  return (
    <section className="rounded-[24px] border border-border/60 bg-card/55 px-4 py-4 backdrop-blur-sm sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-border/60 bg-background/75">
              <Target className="mr-1 size-3" />
              {txa('Hedef ritmi')}
            </Badge>
            <Badge variant="outline" className="rounded-full border-border/60 bg-background/75 text-muted-foreground">
              {milestone.isMaxTier ? txa('Tüm katmanlar açık') : txa('{v1} güç kaldı', { v1: milestone.remainingPower })}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">{milestone.title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {milestone.detail}
            </p>
          </div>

          {milestone.teaser.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {milestone.teaser.map((item) => (
                <span
                  key={txa(item)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <Sparkles className="size-3 text-primary/80" />
                  <span className="truncate">{item}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-2xl border border-border/60 bg-background/75 px-3.5 py-3 lg:max-w-[320px]">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Zap className="size-3.5 text-primary" />
            {txa('Paylaşım metni')}
          </div>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
            {milestone.shareText}
          </p>

          {isFansubAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 gap-1.5"
              onClick={() => void handleCopy()}
            >
              <Copy className="size-3.5" />
              {txa('Metni kopyala')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
