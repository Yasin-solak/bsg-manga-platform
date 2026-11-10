import { CheckCircle2 } from 'lucide-react'
import type { CoreFeature } from './fansubBoostConstants'
import { txa } from '@/i18n/activeLocale'

export default function FansubBoostCoreBenefits({
  coreFeatures,
}: {
  coreFeatures: CoreFeature[]
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-background px-5 py-5 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            {txa('Core acik')}
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{txa('Temel katman herkese açık')}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {txa('Boost artik temel araci saklayan bir kilit degil. Bu katman zaten acik; takviye kalan vitrin ve prestij farkini buyutur.')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {coreFeatures.length > 0 ? coreFeatures.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.id}
                className="rounded-[20px] border border-border/60 bg-muted/[0.14] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{feature.summary}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {txa('Core')}
                  </span>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{feature.detail}</p>
              </article>
            )
          }) : (
            <div className="rounded-[20px] border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground sm:col-span-2">
              {txa('Temel katmanda şu an listelenecek bir özellik yok.')}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
