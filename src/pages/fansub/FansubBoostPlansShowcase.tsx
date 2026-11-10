import { useMemo } from 'react'
import {
  ArrowRight,
  Check,
  Crown,
  Gift,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { FansubBoostPlan, FansubBoostSnapshot } from '@/services/fansubBoostService'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubBoostPlansShowcaseProps = {
  plans: FansubBoostPlan[]
  snapshot: FansubBoostSnapshot | null
  fansubName: string
  currentUserCoins?: number
  onSelectPlan?: (plan: FansubBoostPlan) => void
  onBoost?: () => void
  className?: string
}

// Plan style schema
const PLAN_THEMES: Record<string, {
  gradient: string
  gradientBg: string
  border: string
  text: string
  bg: string
  glow: string
  icon: typeof Zap
  popular?: boolean
}> = {
  blue: {
    gradient: 'from-blue-500 to-cyan-500',
    gradientBg: 'from-blue-500/15 to-cyan-500/10',
    border: 'border-blue-400/40',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    glow: 'shadow-blue-500/20',
    icon: Zap,
  },
  violet: {
    gradient: 'from-violet-500 to-purple-500',
    gradientBg: 'from-violet-500/15 to-purple-500/10',
    border: 'border-violet-400/40',
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    glow: 'shadow-violet-500/25',
    icon: Star,
    popular: true,
  },
  amber: {
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    gradientBg: 'from-amber-500/15 via-orange-500/10 to-rose-500/5',
    border: 'border-amber-400/50',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    glow: 'shadow-amber-500/30',
    icon: Crown,
  },
}

function getPlanTheme(accent: string | undefined) {
  if (!accent) return PLAN_THEMES.blue
  return PLAN_THEMES[accent] ?? PLAN_THEMES.blue
}

// Perk list item
function BenefitListItem({
  text,
  accent,
}: {
  text: string
  accent: string
}) {
  const theme = getPlanTheme(accent)
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
        theme.bg,
      )}>
        <Check className={cn('size-2.5', theme.text)} />
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
    </div>
  )
}

// Plan card
function PlanCard({
  plan,
  theme,
  isAffordable,
  onSelect,
}: {
  plan: FansubBoostPlan
  theme: ReturnType<typeof getPlanTheme>
  isAffordable: boolean
  onSelect?: () => void
}) {
  const Icon = theme.icon
  const isPopular = theme.popular

  // Fansub and supporter perks
  const fansubBenefit = plan.metadata.fansubBenefitSummary
  const supporterBenefit = plan.metadata.supporterBenefitSummary

  return (
    <Card className={cn(
      'relative flex h-full flex-col overflow-hidden rounded-[24px] border-2 transition-all hover:shadow-xl',
      theme.border,
      isPopular && 'ring-2 ring-offset-2 ring-offset-background',
      isPopular && theme.text.replace('text-', 'ring-'),
    )}>
      {/* Popular badge */}
      {isPopular && (
        <div className={cn(
          'absolute -right-8 top-6 rotate-45 px-10 py-1 text-[10px] font-bold uppercase tracking-wider text-white',
          `bg-gradient-to-r ${theme.gradient}`,
        )}>
          {txa('Popüler')}
        </div>
      )}

      {/* Arka plan dekorasyonu */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-50',
          `bg-gradient-to-br ${theme.gradientBg}`,
        )}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col p-5">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <div className={cn(
              'flex size-12 items-center justify-center rounded-xl',
              `bg-gradient-to-br ${theme.gradient}`,
              `shadow-lg ${theme.glow}`,
            )}>
              <Icon className="size-6 text-white" />
            </div>
            {plan.metadata.badgeLabel && (
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider',
                  theme.border,
                  theme.bg,
                  theme.text,
                )}
              >
                {plan.metadata.badgeLabel}
              </Badge>
            )}
          </div>

          <div className="mt-4">
            {plan.metadata.eyebrow && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {plan.metadata.eyebrow}
              </p>
            )}
            <h3 className="mt-1 text-xl font-bold text-foreground">{plan.name}</h3>
          </div>
        </div>

        {/* Fiyat ve güç */}
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className={cn('text-3xl font-bold tabular-nums', theme.text)}>
              +{plan.boostPower.toLocaleString(intlLocale())}
            </p>
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              {txa('güç / {v1} gün', { v1: plan.durationDays })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-foreground tabular-nums">
              {plan.coinCost.toLocaleString(intlLocale())}
            </p>
            <p className="text-xs text-muted-foreground">coin</p>
          </div>
        </div>

        <Separator className="mb-4 bg-border/50" />

        {/* Açıklama */}
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {plan.metadata.summary || plan.description}
        </p>

        {/* Avantajlar */}
        <div className="flex-1 space-y-4">
          {/* Fansub'a katkı */}
          {fansubBenefit && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <TrendingUp className="size-3" />
                {txa("Fansub'a Katkı")}
              </div>
              <BenefitListItem text={fansubBenefit} accent={plan.metadata.accent || 'blue'} />
            </div>
          )}

          {/* Supporter'a kazanım */}
          {supporterBenefit && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Gift className="size-3" />
                {txa('Sana Kazanım')}
              </div>
              <BenefitListItem text={supporterBenefit} accent={plan.metadata.accent || 'blue'} />
            </div>
          )}
        </div>

        {/* CTA Button */}
        <Button
          type="button"
          onClick={onSelect}
          disabled={!isAffordable}
          className={cn(
            'mt-5 h-12 w-full rounded-xl text-sm font-semibold',
            isAffordable
              ? cn(
                'text-white shadow-lg',
                `bg-gradient-to-r ${theme.gradient}`,
                theme.glow,
              )
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isAffordable ? (
            <>
              <Zap className="size-4" />
              {plan.metadata.ctaLabel || txa('Takviye Ver')}
            </>
          ) : (
            txa('Yetersiz Coin')
          )}
        </Button>
      </div>
    </Card>
  )
}

export default function FansubBoostPlansShowcase({
  plans,
  snapshot,
  fansubName,
  currentUserCoins = 0,
  onSelectPlan,
  onBoost,
  className,
}: FansubBoostPlansShowcaseProps) {
  // Sort plans (by sortOrder)
  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3)
  }, [plans])

  const tierLevel = snapshot?.tierLevel ?? 0

  if (sortedPlans.length === 0) {
    return null
  }

  return (
    <Card className={cn(
      'overflow-hidden rounded-[28px] border-border/60 bg-background',
      className,
    )}>
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <Badge
              variant="outline"
              className="mb-2 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary"
            >
              <Sparkles className="mr-1.5 size-3" />
              {txa('Takviye Paketleri')}
            </Badge>
            <h2 className="text-xl font-bold text-foreground">
              {txa('{v1}\'u Destekle', { v1: fansubName })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {txa("Takviye vererek fansub'un büyümesine katkıda bulun ve özel ayrıcalıklar kazan")}
            </p>
          </div>

          {/* Mevcut bakiye */}
          {currentUserCoins > 0 && (
            <div className="shrink-0 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-center">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {txa('Bakiye')}
              </p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {currentUserCoins.toLocaleString(intlLocale())}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Plan kartları */}
      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {sortedPlans.map((plan) => {
            const theme = getPlanTheme(plan.metadata.accent)
            const isAffordable = currentUserCoins >= plan.coinCost

            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                theme={theme}
                isAffordable={isAffordable}
                onSelect={() => onSelectPlan?.(plan)}
              />
            )
          })}
        </div>

        {/* Alt bilgi */}
        <div className="mt-6 flex items-center justify-between rounded-xl border border-border/50 bg-card/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <ArrowRight className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {txa('Mevcut Seviye: {v1}', { v1: tierLevel })}
              </p>
              <p className="text-xs text-muted-foreground">
                {txa('Takviyeler toplam güce eklenir ve seviye atlatır')}
              </p>
            </div>
          </div>

          {onBoost && (
            <Button
              type="button"
              onClick={onBoost}
              variant="outline"
              className="rounded-xl"
            >
              {txa('Tüm Seçenekler')}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// Compact plan summary, for use outside the page
export function PlanSummaryCard({
  plan,
  onSelect,
}: {
  plan: FansubBoostPlan
  onSelect?: () => void
}) {
  const theme = getPlanTheme(plan.metadata.accent)
  const Icon = theme.icon

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-md',
        theme.border,
        theme.bg,
      )}
    >
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg',
        `bg-gradient-to-br ${theme.gradient}`,
      )}>
        <Icon className="size-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{plan.name}</p>
        <p className="text-xs text-muted-foreground">
          {txa('+{power} güç · {coin} coin', { power: plan.boostPower, coin: plan.coinCost.toLocaleString(intlLocale()) })}
        </p>
      </div>
      <ArrowRight className={cn('size-4 shrink-0', theme.text)} />
    </button>
  )
}
