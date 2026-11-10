import { ArrowUpRight, Sparkles, Users, Zap } from 'lucide-react'
import { resolveFansubBoostMilestoneState } from '@/lib/fansubBoostPresentation'
import { cn } from '@/lib/utils'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import {
  TONE_STYLES,
  countTotalActiveFeatures,
  type TierDefinition,
  type TierTone,
} from './fansubBoostConstants'
import { txa } from '@/i18n/activeLocale'

type FansubBoostHeroBannerProps = {
  snapshot: FansubBoostSnapshot | null
  tiers: TierDefinition[]
  coreFeatureCount: number
}

function resolveTierTone(tierLevel: number): TierTone {
  if (tierLevel >= 3) return 'amber'
  if (tierLevel >= 2) return 'violet'
  return 'rose'
}

function TierProgressCircle({
  progress,
  tierLevel,
  isMaxTier,
}: {
  progress: number
  tierLevel: number
  isMaxTier: boolean
}) {
  const size = 112
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const fillPercent = isMaxTier ? 100 : Math.min(100, Math.max(2, progress))
  const strokeDashoffset = circumference - (fillPercent / 100) * circumference
  const tone = resolveTierTone(tierLevel)
  const toneStyle = TONE_STYLES[tone]
  const gradientId = `boost-v2-hero-${tierLevel}`

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone === 'rose' ? '#fb7185' : tone === 'violet' ? '#a78bfa' : '#fbbf24'} />
            <stop offset="100%" stopColor={tone === 'rose' ? '#e879f9' : tone === 'violet' ? '#818cf8' : '#f97316'} />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Zap className={cn('size-6', toneStyle.text)} />
        <span className={cn('mt-0.5 text-2xl font-bold tabular-nums', toneStyle.text)}>
          {tierLevel}
        </span>
      </div>
    </div>
  )
}

function TierSegmentBar({
  activePower,
  tierLevel,
  tiers,
}: {
  activePower: number
  tierLevel: number
  tiers: TierDefinition[]
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {tiers.map((tier) => {
        const tone = TONE_STYLES[tier.tone]
        const isUnlocked = tierLevel >= tier.level
        const isNext = tierLevel + 1 === tier.level
        const previousThreshold = tier.level > 1
          ? (tiers.find((item) => item.level === tier.level - 1)?.threshold ?? 0)
          : 0
        const range = tier.threshold - previousThreshold
        const progress = isUnlocked
          ? 100
          : isNext && range > 0
            ? Math.min(100, Math.max(0, ((activePower - previousThreshold) / range) * 100))
            : 0

        return (
          <div
            key={tier.level}
            className={cn(
              'rounded-2xl border px-3 py-3',
              isUnlocked
                ? `${tone.border} bg-gradient-to-r ${tone.soft}`
                : isNext
                  ? `${tone.border} bg-card/85`
                  : 'border-border/50 bg-muted/[0.14]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-sm font-semibold', isUnlocked || isNext ? 'text-foreground' : 'text-muted-foreground')}>
                {tier.title}
              </span>
              <span className={cn('text-[11px] font-semibold', isUnlocked ? tone.text : isNext ? tone.text : 'text-muted-foreground/70')}>
                {isUnlocked ? txa('Açık') : isNext ? txa('Sıradaki') : `${tier.threshold}+`}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/20">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  isUnlocked || isNext ? `bg-gradient-to-r ${tone.gradient}` : 'bg-transparent',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
              {tier.teaser.map((item) => txa(item)).join(' / ')}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function StatPill({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Zap
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-2xl border px-3 py-2.5',
      accent ? 'border-primary/20 bg-primary/6' : 'border-border/55 bg-background/70',
    )}>
      <Icon className={cn('size-3.5', accent ? 'text-primary' : 'text-muted-foreground')} />
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className={cn('text-sm font-semibold', accent ? 'text-primary' : 'text-foreground')}>{value}</div>
      </div>
    </div>
  )
}

export default function FansubBoostHeroBanner({
  snapshot,
  tiers,
  coreFeatureCount,
}: FansubBoostHeroBannerProps) {
  const tierLevel = snapshot?.tierLevel ?? 0
  const activePower = snapshot?.activePower ?? 0
  const supporterCount = snapshot?.activeSupporterCount ?? 0
  const nextTierRemainingPower = snapshot?.nextTierRemainingPower ?? Math.max((tiers[0]?.threshold ?? 3) - activePower, 0)
  const progressPercent = snapshot?.tierProgressPercent ?? 0
  const isMaxTier = tierLevel >= tiers.length
  const tone = resolveTierTone(tierLevel)
  const toneStyle = TONE_STYLES[tone]
  const currentTierTitle = tiers.find((item) => item.level === tierLevel)?.title ?? txa('Başlangıç')
  const nextTierTitle = tiers.find((item) => item.level === tierLevel + 1)?.title ?? txa('Tüm katmanlar açık')
  const milestone = resolveFansubBoostMilestoneState(snapshot, undefined, tiers)

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        aria-hidden
        style={{
          background: `radial-gradient(ellipse at top left, ${
            tone === 'rose' ? 'rgba(251,113,133,0.16)' : tone === 'violet' ? 'rgba(167,139,250,0.16)' : 'rgba(251,191,36,0.16)'
          }, transparent 58%), radial-gradient(ellipse at bottom right, ${
            tone === 'rose' ? 'rgba(232,121,249,0.10)' : tone === 'violet' ? 'rgba(129,140,248,0.10)' : 'rgba(249,115,22,0.10)'
          }, transparent 55%)`,
        }}
      />

      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-5 xl:grid-cols-[auto_minmax(0,1fr)_280px] xl:items-center">
          <TierProgressCircle
            progress={progressPercent}
            tierLevel={tierLevel}
            isMaxTier={isMaxTier}
          />

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  {txa('Core acik')}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                  toneStyle.border,
                  toneStyle.bg,
                  toneStyle.text,
                )}>
                  <Sparkles className="size-3" />
                  {tierLevel > 0 ? `${currentTierTitle}` : txa('Boost başlangıcı')}
                </span>
              </div>

              <div>
                <h1 className="max-w-2xl text-[1.55rem] font-semibold tracking-tight text-foreground sm:text-[1.8rem]">
                  {txa('Temel araçlar açık. Takviye, görünür vitrin katmanlarını ve prestiji büyütür.')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {txa('Bu sayfa artık kilitlenen temel hakları değil, takviye ile gelen görünür farkı anlatır. Destekçi etkisi, kimlik ve prestij katmanları burada birikir.')}
                </p>
              </div>
            </div>

            <TierSegmentBar activePower={activePower} tierLevel={tierLevel} tiers={tiers} />
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <StatPill icon={Zap} label={txa('Aktif güç')} value={String(activePower)} accent />
            <StatPill icon={Users} label={txa('Destekçi')} value={String(supporterCount)} />
            <StatPill icon={ArrowUpRight} label={txa('Core')} value={`${coreFeatureCount} arac`} />
            <StatPill
              icon={Sparkles}
              label={txa('Boost')}
              value={`${countTotalActiveFeatures(snapshot?.capabilities, tiers)} katman`}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {!isMaxTier ? (
            <>
              <span>
                {txa('Sonraki katman:')}{' '}<span className="font-semibold text-foreground">{nextTierTitle}</span>
              </span>
              <span>
                {txa('Kalan guc:')}{' '}<span className="font-semibold text-foreground">{nextTierRemainingPower}</span>
              </span>
              <span className="w-full text-muted-foreground/80">
                <span className="font-medium text-foreground">{milestone.title}</span>
                {' / '}
                {milestone.detail}
              </span>
            </>
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {milestone.title}. {milestone.detail}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
