import { BadgeCheck, Check, Crown, Lock, Sparkles, Star, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TONE_STYLES,
  getTierState,
  type TierDefinition,
} from './fansubBoostConstants'
import { txa } from '@/i18n/activeLocale'

type FansubBoostTierRoadmapProps = {
  tiers: TierDefinition[]
  currentTierLevel: number
  activePower: number
  onTierClick: (level: number) => void
}

function resolveNodeIcon(level: number) {
  if (level >= 3) return Crown
  if (level >= 2) return Star
  return Zap
}

function TierNode({
  tier,
  state,
  activePower,
  onClick,
  isLast,
}: {
  tier: TierDefinition
  state: 'unlocked' | 'unlockable' | 'locked'
  activePower: number
  onClick: () => void
  isLast: boolean
}) {
  const tone = TONE_STYLES[tier.tone]
  const isUnlocked = state === 'unlocked'
  const isUnlockable = state === 'unlockable'
  const NodeIcon = resolveNodeIcon(tier.level)
  const remaining = Math.max(tier.threshold - activePower, 0)

  return (
    <div className="flex flex-1 flex-col items-center gap-0">
      <div className="relative flex w-full items-center">
        <div className={cn(
          'h-0.5 flex-1',
          isUnlocked || isUnlockable ? `bg-gradient-to-r ${tone.gradient}` : 'bg-border/30',
        )} />

        <button
          type="button"
          onClick={onClick}
          className={cn(
            'group relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full border-[3px] transition-all duration-300',
            isUnlocked
              ? `border-transparent bg-gradient-to-br ${tone.gradient} shadow-xl ${tone.glow} hover:scale-105`
              : isUnlockable
                ? `${tone.border} bg-gradient-to-br ${tone.gradient} opacity-90 shadow-lg ${tone.glow} hover:scale-105`
                : 'border-border/30 bg-card/70 hover:border-border/50',
          )}
        >
          {isUnlocked ? (
            <BadgeCheck className="size-7 text-white drop-shadow-md" />
          ) : isUnlockable ? (
            <NodeIcon className="size-7 text-white/90 drop-shadow-md" />
          ) : (
            <Lock className="size-5 text-muted-foreground/40" />
          )}

          {isUnlockable ? (
            <span className={cn(
              'pointer-events-none absolute -inset-1 rounded-full border-2 animate-ping opacity-25',
              tone.border,
            )} />
          ) : null}
        </button>

        {!isLast ? (
          <div className={cn(
            'h-0.5 flex-1',
            isUnlocked ? `bg-gradient-to-r ${tone.gradient}` : 'bg-border/30',
          )} />
        ) : (
          <div className="h-0.5 flex-1 bg-transparent" />
        )}
      </div>

      <button
        type="button"
        onClick={onClick}
        className={cn(
          'mt-3 flex w-full flex-col rounded-[20px] border p-4 text-left transition-all duration-200',
          'hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,0.25)]',
          isUnlocked
            ? `${tone.border} bg-gradient-to-b ${tone.soft} shadow-md ${tone.glow}`
            : isUnlockable
              ? `${tone.border} bg-card/90 shadow-sm`
              : 'border-border/30 bg-card/40 opacity-70',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex size-7 items-center justify-center rounded-full text-xs font-bold',
              isUnlocked ? `bg-gradient-to-br ${tone.gradient} text-white shadow-sm` : tone.badge,
            )}>
              {tier.level}
            </span>
            <span className={cn(
              'text-sm font-bold tracking-tight',
              isUnlocked ? 'text-foreground' : isUnlockable ? tone.text : 'text-muted-foreground',
            )}>
              {tier.title}
            </span>
          </div>

          {isUnlocked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="size-3" />
              {txa('Açık')}
            </span>
          ) : isUnlockable ? (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', tone.bg, tone.text)}>
              <Sparkles className="size-3" />
              {txa('Sıradaki')}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">{txa('Kilitli')}</span>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {tier.teaser.map((item) => (
            <div key={txa(item)} className="flex items-start gap-2">
              <Check className={cn(
                'mt-0.5 size-3.5 shrink-0',
                isUnlocked ? 'text-emerald-500' : isUnlockable ? tone.text : 'text-muted-foreground/30',
              )} />
              <span className={cn(
                'text-xs leading-relaxed',
                isUnlocked || isUnlockable ? 'text-muted-foreground' : 'text-muted-foreground/45',
              )}>
                {item}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-2.5">
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              {txa('{v1}+ güç', { v1: tier.threshold })}
            </span>
            <span className="text-border/60">·</span>
            <span>{tier.features.length}{' '}{txa('katman')}</span>
          </div>
          <span className={cn(
            'text-[11px] font-semibold',
            isUnlocked ? 'text-emerald-600 dark:text-emerald-400' : isUnlockable ? tone.text : 'text-muted-foreground/45',
          )}>
            {isUnlocked ? txa('Hazır') : isUnlockable ? `${remaining} kaldi` : txa('Beklemede')}
          </span>
        </div>
      </button>
    </div>
  )
}

export default function FansubBoostTierRoadmap({
  tiers,
  currentTierLevel,
  activePower,
  onTierClick,
}: FansubBoostTierRoadmapProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{txa('Takviye katmanları')}</p>
          <h2 className="text-lg font-semibold text-foreground">{txa('Temel katmandan sonra gelen görünür fark')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {txa('Bu merdiven temel araci acmak icin degil; sayfaya destek geldikce hangi gorunur katmanlarin devreye girecegini anlatir.')}
          </p>
        </div>
        <div className="rounded-full border border-border/55 bg-muted/[0.12] px-3 py-1 text-[11px] text-muted-foreground">
          {txa('Şu an {v1}. takviye katmanındasın', { v1: currentTierLevel })}
        </div>
      </div>

      <div className="hidden gap-3 sm:flex">
        {tiers.map((tier, index) => (
          <TierNode
            key={tier.level}
            tier={tier}
            state={getTierState(tier.level, currentTierLevel)}
            activePower={activePower}
            onClick={() => onTierClick(tier.level)}
            isLast={index === tiers.length - 1}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {tiers.map((tier) => {
          const state = getTierState(tier.level, currentTierLevel)
          const tone = TONE_STYLES[tier.tone]
          const isUnlocked = state === 'unlocked'
          const isUnlockable = state === 'unlockable'
          const NodeIcon = resolveNodeIcon(tier.level)

          return (
            <button
              key={tier.level}
              type="button"
              onClick={() => onTierClick(tier.level)}
              className={cn(
                'flex items-center gap-3 rounded-[18px] border p-3.5 text-left transition-all',
                isUnlocked
                  ? `${tone.border} bg-gradient-to-r ${tone.soft} shadow-md ${tone.glow}`
                  : isUnlockable
                    ? `${tone.border} bg-card/90 shadow-sm`
                    : 'border-border/30 bg-card/40 opacity-70',
              )}
            >
              <div className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full',
                isUnlocked ? `bg-gradient-to-br ${tone.gradient} shadow-md` : isUnlockable ? `bg-gradient-to-br ${tone.gradient} opacity-80` : 'border border-border/30 bg-card',
              )}>
                {isUnlocked ? (
                  <BadgeCheck className="size-5 text-white" />
                ) : isUnlockable ? (
                  <NodeIcon className="size-5 text-white/90" />
                ) : (
                  <Lock className="size-4 text-muted-foreground/40" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-bold', isUnlocked || isUnlockable ? 'text-foreground' : 'text-muted-foreground')}>
                    {tier.title}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {tier.teaser.map((item) => txa(item)).join(' · ')}
                </p>
              </div>

              <span className={cn(
                'shrink-0 text-[10px] font-semibold',
                isUnlocked ? 'text-emerald-500' : isUnlockable ? tone.text : 'text-muted-foreground/45',
              )}>
                {isUnlocked ? txa('Açık') : isUnlockable ? txa('Sıradaki') : `${tier.threshold}+`}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
