import { useMemo } from 'react'
import {
  ArrowRight,
  Check,
  Crown,
  Lock,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubTierShowcaseProps = {
  snapshot: FansubBoostSnapshot | null
  fansubName: string
  onBoost?: () => void
  className?: string
}

// Tier color and style schema
const TIER_CONFIG: Record<number, {
  gradient: string
  gradientFrom: string
  gradientTo: string
  border: string
  text: string
  bg: string
  glow: string
  ringColor: string
  icon: typeof Crown
  label: string
  description: string
}> = {
  0: {
    gradient: 'from-zinc-600 to-zinc-700',
    gradientFrom: 'rgb(82, 82, 91)',
    gradientTo: 'rgb(63, 63, 70)',
    border: 'border-zinc-500/30',
    text: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    glow: '',
    ringColor: 'stroke-zinc-500',
    icon: Shield,
    get label() { return txa('Başlangıç') },
    get description() { return txa('Bu fansub henüz takviye almadı') },
  },
  1: {
    gradient: 'from-blue-500 to-cyan-500',
    gradientFrom: 'rgb(59, 130, 246)',
    gradientTo: 'rgb(6, 182, 212)',
    border: 'border-blue-400/40',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    glow: 'shadow-blue-500/20',
    ringColor: 'stroke-blue-500',
    icon: Zap,
    get label() { return txa('Yükselen') },
    get description() { return txa('Temel supporter ayrıcalıkları aktif') },
  },
  2: {
    gradient: 'from-violet-500 to-purple-500',
    gradientFrom: 'rgb(139, 92, 246)',
    gradientTo: 'rgb(168, 85, 247)',
    border: 'border-violet-400/40',
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    glow: 'shadow-violet-500/25',
    ringColor: 'stroke-violet-500',
    icon: Star,
    get label() { return txa('Güçlenmiş') },
    get description() { return txa('Gelişmiş vitrin ve özel rozetler') },
  },
  3: {
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    gradientFrom: 'rgb(251, 191, 36)',
    gradientTo: 'rgb(244, 63, 94)',
    border: 'border-amber-400/50',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    glow: 'shadow-amber-500/30',
    ringColor: 'stroke-amber-500',
    icon: Crown,
    get label() { return txa('Efsane') },
    get description() { return txa('Maksimum ayrıcalık ve görünürlük') },
  },
}

function getTierConfig(level: number) {
  return TIER_CONFIG[level] ?? TIER_CONFIG[0]
}

// Circular progress indicator
function TierProgressRing({
  progress,
  tierLevel,
  size = 160,
  strokeWidth = 12,
}: {
  progress: number
  tierLevel: number
  size?: number
  strokeWidth?: number
}) {
  const config = getTierConfig(tierLevel)
  const Icon = config.icon
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Arka plan çemberi */}
      <svg
        width={size}
        height={size}
        className="rotate-[-90deg]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* İlerleme çemberi */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#tierGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="tierGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.gradientFrom} />
            <stop offset="100%" stopColor={config.gradientTo} />
          </linearGradient>
        </defs>
      </svg>

      {/* Merkez içerik */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn(
          'flex size-16 items-center justify-center rounded-2xl',
          `bg-gradient-to-br ${config.gradient}`,
          tierLevel > 0 && `shadow-lg ${config.glow}`,
          tierLevel === 3 && 'animate-pulse',
        )}>
          <Icon className="size-8 text-white" />
        </div>
        <span className={cn('mt-2 text-2xl font-bold', config.text)}>
          {tierLevel}
        </span>
      </div>
    </div>
  )
}

// Benefit list item
function BenefitItem({
  text,
  unlocked,
  highlight = false,
}: {
  text: string
  unlocked: boolean
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
      unlocked
        ? highlight
          ? 'bg-primary/10'
          : 'bg-card/60'
        : 'bg-muted/5 opacity-60',
    )}>
      <span className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
        unlocked
          ? 'bg-primary/20 text-primary'
          : 'bg-muted/30 text-muted-foreground',
      )}>
        {unlocked ? (
          <Check className="size-3" />
        ) : (
          <Lock className="size-3" />
        )}
      </span>
      <span className={cn(
        'text-sm leading-6',
        unlocked ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {text}
      </span>
    </div>
  )
}

export default function FansubTierShowcase({
  snapshot,
  fansubName,
  onBoost,
  className,
}: FansubTierShowcaseProps) {
  const tierLevel = snapshot?.tierLevel ?? 0
  const config = getTierConfig(tierLevel)
  const nextTierConfig = getTierConfig(Math.min(tierLevel + 1, 3))

  // Current and future benefits
  const currentBenefits = useMemo(() => {
    const benefits = snapshot?.capabilities?.currentBenefits
    if (Array.isArray(benefits)) {
      return benefits.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    }
    return []
  }, [snapshot?.capabilities?.currentBenefits])

  const nextBenefits = useMemo(() => {
    const benefits = snapshot?.capabilities?.nextTierBenefits
    if (Array.isArray(benefits)) {
      return benefits.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    }
    return []
  }, [snapshot?.capabilities?.nextTierBenefits])

  // Progress hesaplama
  const progressPercent = snapshot?.tierProgressPercent ?? 0
  const remainingPower = snapshot?.nextTierRemainingPower ?? 0
  const isMaxTier = tierLevel >= 3

  const tierLabel = snapshot?.capabilities?.tierLabel || config.label
  const nextTierSummary = snapshot?.capabilities?.nextTierSummary || txa('Sonraki seviyede yeni özellikler açılacak')

  return (
    <Card className={cn(
      'relative overflow-hidden rounded-[28px] border-border/60 bg-background',
      className,
    )}>
      {/* Arka plan dekorasyonu */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          background: `radial-gradient(circle at top right, ${config.gradientFrom}15, transparent 50%)`,
        }}
      />

      {/* Tier 3 shimmer efekti */}
      {tierLevel === 3 && (
        <div
          className="pointer-events-none absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-amber-400/5 to-transparent"
          style={{ backgroundSize: '200% 100%' }}
          aria-hidden
        />
      )}

      <div className="relative p-6">
        {/* Başlık */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Badge
              variant="outline"
              className={cn(
                'mb-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]',
                config.border,
                config.bg,
                config.text,
              )}
            >
              <Sparkles className="mr-1.5 size-3" />
              {txa('Takviye Durumu')}
            </Badge>
            <h2 className="text-xl font-bold text-foreground">
              {txa('{v1} Vitrini', { v1: fansubName })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
          </div>

          {/* Destekçi sayısı */}
          {snapshot && snapshot.activeSupporterCount > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5">
              <Users className="size-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {snapshot.activeSupporterCount.toLocaleString(intlLocale())}
              </span>
            </div>
          )}
        </div>

        {/* Ana içerik - 2 sütun */}
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          {/* Sol: Progress ring */}
          <div className="flex flex-col items-center gap-4">
            <TierProgressRing
              progress={isMaxTier ? 100 : progressPercent}
              tierLevel={tierLevel}
            />

            {/* Tier etiketi */}
            <div className="text-center">
              <span className={cn('text-lg font-bold', config.text)}>
                {tierLabel}
              </span>
              {!isMaxTier && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {txa('Sonraki seviyeye')}{' '}
                  <span className="font-semibold text-foreground">
                    {remainingPower.toLocaleString(intlLocale())}
                  </span>{' '}
                  {txa('güç')}
                </p>
              )}
            </div>

            {/* Aktif güç */}
            {snapshot && (
              <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {txa('Aktif Güç')}
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
                  {snapshot.activePower.toLocaleString(intlLocale())}
                </p>
              </div>
            )}
          </div>

          {/* Sağ: Faydalar */}
          <div className="space-y-4">
            {/* Mevcut faydalar */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Check className="size-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {txa('Aktif Özellikler')}
                </span>
              </div>
              <div className="space-y-2">
                {currentBenefits.length > 0 ? (
                  currentBenefits.map((benefit, idx) => (
                    <BenefitItem
                      key={`current-${idx}`}
                      text={benefit}
                      unlocked
                      highlight={idx === 0}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-4 text-center text-sm text-muted-foreground">
                    {txa('İlk takviye ile temel özellikler açılacak')}
                  </div>
                )}
              </div>
            </div>

            {/* Sonraki tier faydaları */}
            {!isMaxTier && nextBenefits.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <ArrowRight className={cn('size-4', nextTierConfig.text)} />
                  <span className="text-sm font-semibold text-foreground">
                    {txa("Seviye {level}'de Açılacak", { level: tierLevel + 1 })}
                  </span>
                </div>
                <div className="space-y-2">
                  {nextBenefits.slice(0, 3).map((benefit, idx) => (
                    <BenefitItem
                      key={`next-${idx}`}
                      text={benefit}
                      unlocked={false}
                    />
                  ))}
                </div>
                {nextBenefits.length > 3 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {txa('+{v1} daha fazla özellik...', { v1: nextBenefits.length - 3 })}
                  </p>
                )}
              </div>
            )}

            {/* Max tier mesajı */}
            {isMaxTier && (
              <div className={cn(
                'rounded-xl border p-4',
                'border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5',
              )}>
                <div className="flex items-center gap-3">
                  <Crown className="size-6 text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-400">
                      {txa('Maksimum Seviye')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {txa('Bu fansub en yüksek takviye kademesinde')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alt: Progress bar ve CTA */}
        {!isMaxTier && (
          <div className="mt-6 space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {txa('Seviye {v1} → Seviye {v2}', { v1: tierLevel, v2: tierLevel + 1 })}
                </span>
                <span className="font-semibold text-foreground">
                  %{Math.round(progressPercent)}
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/30">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    `bg-gradient-to-r ${config.gradient}`,
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* CTA */}
            <Button
              type="button"
              onClick={onBoost}
              className={cn(
                'h-12 w-full rounded-xl text-sm font-semibold text-white shadow-lg',
                `bg-gradient-to-r ${config.gradient}`,
                tierLevel > 0 && config.glow,
              )}
            >
              <TrendingUp className="size-4" />
              {nextTierSummary}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
