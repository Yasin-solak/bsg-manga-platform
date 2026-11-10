import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type {
  FansubBoostPlan,
  FansubBoostSnapshot,
  FansubBoostSupporterPreview,
  FansubBoostSupporterState,
} from '@/services/fansubBoostService'
import { ArrowUpRight, Check, Sparkles, Zap } from 'lucide-react'
import FansubBoostStatusBar from './FansubBoostStatusBar'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubBoostValuePanelProps = {
  fansubName: string
  snapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  plans: FansubBoostPlan[]
  onBoost: () => void
  className?: string
}

const PLAN_ACCENT_STYLES: Record<string, {
  panel: string
  badge: string
}> = {
  violet: {
    panel: 'border-violet-500/25 bg-violet-500/[0.08]',
    badge: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  },
  purple: {
    panel: 'border-fuchsia-500/25 bg-fuchsia-500/[0.08]',
    badge: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200',
  },
  amber: {
    panel: 'border-amber-500/25 bg-amber-500/[0.08]',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  },
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function resolvePlanAccent(code?: string) {
  if (!code) return PLAN_ACCENT_STYLES.violet
  return PLAN_ACCENT_STYLES[code] ?? PLAN_ACCENT_STYLES.violet
}

function buildSupporterHighlights(
  supporterState: FansubBoostSupporterState | null,
  plans: FansubBoostPlan[],
): string[] {
  const rewardHighlights = asStringList(supporterState?.rewardCapabilities?.rewardHighlights)
  if (rewardHighlights.length > 0) return rewardHighlights

  return plans
    .map((plan) => plan.metadata.supporterBenefitSummary)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3)
}

export default function FansubBoostValuePanel({
  fansubName,
  snapshot,
  supporterState,
  supporterPreview,
  plans,
  onBoost,
  className,
}: FansubBoostValuePanelProps) {
  const currentBenefits = asStringList(snapshot?.capabilities?.currentBenefits)
  const nextBenefits = asStringList(snapshot?.capabilities?.nextTierBenefits)
  const supporterHighlights = buildSupporterHighlights(supporterState, plans)
  const tierHeadline = snapshot?.capabilities?.tierHeadline
    || txa('Boost seviyesi bu fansubun vitrin gucunu belirler.')
  const tierSummary = snapshot?.capabilities?.tierSummary
    || txa('Takviye, fansubun gorunurlugunu ve supporter katmanlarini adim adim acar.')
  const nextTierSummary = snapshot?.capabilities?.nextTierSummary
    || txa('Bir sonraki seviye yeni vitrin ve supporter katmanlari acar.')
  const nextTierCallout = snapshot?.capabilities?.nextTierCallout
    || txa('Seviye atladikca yeni kimlik ve vitrin haklari acilir.')
  const supporterLabel = supporterState?.rewardCapabilities?.rewardLabel || txa('Supporter olarak ne alirsin')
  const supporterSummary = supporterState?.rewardCapabilities?.rewardSummary
    || txa('Takviye veren kullanici sadece guc vermez; gorunen bir supporter kimligi de kazanir.')

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[30px] border-border/70 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--card)/0.98)_58%,hsl(var(--background))_100%)]',
        className,
      )}
    >
      <div className='relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6'>
        <div
          className='pointer-events-none absolute inset-0 opacity-70'
          aria-hidden
          style={{
            background:
              'radial-gradient(circle at top right, hsl(var(--primary) / 0.18), transparent 28%), radial-gradient(circle at bottom left, rgba(249,115,22,0.12), transparent 26%)',
          }}
        />

        <div className='relative flex flex-col gap-6'>
          <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start'>
            <div className='space-y-5'>
              <div className='space-y-3'>
                <Badge variant='outline' className='rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-primary'>
                  {txa('Fansub Takviyesi')}
                </Badge>
                <div className='space-y-2'>
                  <h2 className='max-w-[15ch] text-3xl font-semibold leading-[1.02] tracking-tight text-foreground sm:text-[2.15rem]'>
                    {tierHeadline}
                  </h2>
                  <p className='max-w-[68ch] text-sm leading-7 text-muted-foreground sm:text-[15px]'>
                    <span className='font-medium text-foreground'>{fansubName}</span>
                    {' '}
                    {txa('icin boost; sadece coin harcamasi degil, vitrin gucu, supporter gorunurlugu ve sonraki unlock zinciridir.')}
                  </p>
                  <p className='max-w-[68ch] text-sm leading-7 text-muted-foreground'>
                    {tierSummary}
                  </p>
                </div>
              </div>

              <div className='grid gap-4 lg:grid-cols-2'>
                <section className='rounded-[24px] border border-border/70 bg-background/45 p-4 backdrop-blur-sm'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Su an acik')}</p>
                      <h3 className='mt-1 text-base font-semibold text-foreground'>{txa('Mevcut seviye faydalari')}</h3>
                    </div>
                    <Badge variant='outline' className='rounded-full border-border/60 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground'>
                      {txa('Seviye {v1}', { v1: snapshot?.tierLevel ?? 0 })}
                    </Badge>
                  </div>

                  <div className='mt-4 space-y-3'>
                    {currentBenefits.length > 0 ? currentBenefits.map((benefit) => (
                      <div key={benefit} className='flex items-start gap-3 rounded-2xl bg-card/55 px-3 py-3'>
                        <span className='mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                          <Check className='size-3.5' />
                        </span>
                        <p className='text-sm leading-6 text-muted-foreground'>{benefit}</p>
                      </div>
                    )) : (
                      <div className='rounded-2xl border border-dashed border-border/60 bg-card/35 px-4 py-4 text-sm leading-6 text-muted-foreground'>
                        {txa('Bu fansub henuz boost seviyesini acmadi. Ilk takviyeler supporter listesi ve temel vitrin katmanlarini baslatir.')}
                      </div>
                    )}
                  </div>
                </section>

                <section className='rounded-[24px] border border-border/70 bg-background/45 p-4 backdrop-blur-sm'>
                  <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Sonraki unlock')}</p>
                  <h3 className='mt-1 text-base font-semibold text-foreground'>{nextTierSummary}</h3>
                  <p className='mt-2 text-sm leading-6 text-muted-foreground'>{nextTierCallout}</p>

                  <div className='mt-4 space-y-3'>
                    {nextBenefits.length > 0 ? nextBenefits.map((benefit) => (
                      <div key={benefit} className='flex items-start gap-3 rounded-2xl bg-card/55 px-3 py-3'>
                        <span className='mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400'>
                          <ArrowUpRight className='size-3.5' />
                        </span>
                        <p className='text-sm leading-6 text-muted-foreground'>{benefit}</p>
                      </div>
                    )) : (
                      <div className='rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/[0.06] px-4 py-4 text-sm leading-6 text-amber-100/85'>
                        {txa('Bu fansub su anda en yuksek boost kademesinde.')}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className='flex flex-col gap-4'>
              <div className='rounded-[24px] border border-border/70 bg-background/60 p-4 backdrop-blur-sm'>
                <FansubBoostStatusBar snapshot={snapshot} />
                <div className='mt-4 grid grid-cols-2 gap-3 text-sm'>
                  <div className='rounded-2xl border border-border/60 bg-card/55 p-3'>
                    <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Aktif guc')}</p>
                    <p className='mt-1 text-xl font-semibold text-foreground'>
                      {snapshot?.activePower?.toLocaleString(intlLocale()) ?? '0'}
                    </p>
                  </div>
                  <div className='rounded-2xl border border-border/60 bg-card/55 p-3'>
                    <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Destekci')}</p>
                    <p className='mt-1 text-xl font-semibold text-foreground'>
                      {snapshot?.activeSupporterCount?.toLocaleString(intlLocale()) ?? '0'}
                    </p>
                  </div>
                </div>
                <Button
                  type='button'
                  onClick={onBoost}
                  className='mt-4 h-11 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-950/20 transition-transform hover:translate-y-[-1px] hover:from-violet-600 hover:to-indigo-700'
                >
                  <Zap className='size-4' />
                  {txa('Takviye seceneklerini ac')}
                </Button>
              </div>

              <div className='rounded-[24px] border border-border/70 bg-background/45 p-4 backdrop-blur-sm'>
                <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Supporter degeri')}</p>
                <h3 className='mt-1 text-base font-semibold text-foreground'>{supporterLabel}</h3>
                <p className='mt-2 text-sm leading-6 text-muted-foreground'>{supporterSummary}</p>

                {supporterHighlights.length > 0 ? (
                  <div className='mt-4 space-y-2'>
                    {supporterHighlights.map((highlight) => (
                      <div key={highlight} className='flex items-start gap-2.5 text-sm text-muted-foreground'>
                        <Sparkles className='mt-0.5 size-3.5 shrink-0 text-primary' />
                        <span className='leading-6'>{highlight}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {supporterPreview.length > 0 ? (
                  <div className='mt-4 rounded-2xl border border-border/60 bg-card/55 px-3 py-3 text-sm text-muted-foreground'>
                    {txa('{v1} gorunen supporter ve {v2} toplam aktif destekci bu seviye gucunu tasiyor.', { v1: supporterPreview.length, v2: snapshot?.activeSupporterCount?.toLocaleString(intlLocale()) ?? '0' })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {plans.length > 0 ? (
            <>
              <Separator className='bg-border/60' />
              <section className='space-y-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Takviye paketleri')}</p>
                  <h3 className='mt-1 text-base font-semibold text-foreground'>{txa('Hangi paket neyi ilerletiyor')}</h3>
                </div>

                <div className='grid gap-3 md:grid-cols-3'>
                  {plans.slice(0, 3).map((plan) => {
                    const accent = resolvePlanAccent(plan.metadata.accent)
                    return (
                      <article
                        key={plan.id}
                        className={cn(
                          'flex h-full flex-col rounded-[22px] border px-4 py-4 backdrop-blur-sm',
                          accent.panel,
                        )}
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div>
                            <p className='text-[10px] uppercase tracking-[0.16em] text-muted-foreground'>
                              {plan.metadata.eyebrow || txa('Takviye')}
                            </p>
                            <h4 className='mt-1 text-base font-semibold text-foreground'>{plan.name}</h4>
                          </div>
                          <Badge className={cn('rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]', accent.badge)}>
                            {plan.metadata.badgeLabel || txa('Plan')}
                          </Badge>
                        </div>

                        <div className='mt-4 flex items-end justify-between gap-3'>
                          <div>
                            <p className='text-3xl font-semibold tracking-tight text-foreground'>+{plan.boostPower}</p>
                            <p className='text-xs uppercase tracking-[0.18em] text-muted-foreground'>{txa('{v1} gun', { v1: plan.durationDays })}</p>
                          </div>
                          <div className='text-right'>
                            <p className='text-sm font-semibold text-foreground'>{plan.coinCost.toLocaleString(intlLocale())} coin</p>
                            <p className='text-xs text-muted-foreground'>{plan.metadata.ctaLabel || txa('Takviye ver')}</p>
                          </div>
                        </div>

                        <p className='mt-3 text-sm leading-6 text-muted-foreground'>
                          {plan.metadata.summary || plan.description}
                        </p>
                      </article>
                    )
                  })}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
