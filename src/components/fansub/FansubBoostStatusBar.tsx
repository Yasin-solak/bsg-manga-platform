import { cn } from '@/lib/utils'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { Sparkles, Zap } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

// Tier visual mapping: if tier labels and colors cannot come from the backend capability,
// a minimal fallback is used here.
// But tier THRESHOLDS are not kept here; progress calculation comes from the backend.
const TIER_DISPLAY: Record<number, { label: string; accent: string; barColor: string }> = {
  0: { get label() { return txa('Temel') }, accent: 'text-muted-foreground', barColor: 'from-slate-400/60 to-slate-500/60' },
  1: { get label() { return txa('Yukselen') }, accent: 'text-blue-500', barColor: 'from-blue-400 to-indigo-500' },
  2: { get label() { return txa('Guclenmis') }, accent: 'text-violet-500', barColor: 'from-violet-400 to-purple-500' },
  3: { get label() { return txa('Efsane') }, accent: 'text-amber-500', barColor: 'from-amber-400 to-orange-500' },
}

type FansubBoostStatusBarProps = {
  snapshot: FansubBoostSnapshot | null
  className?: string
}

export default function FansubBoostStatusBar({
  snapshot,
  className,
}: FansubBoostStatusBarProps) {
  if (!snapshot) return null

  const tier = snapshot.tierLevel
  const display = TIER_DISPLAY[tier] ?? TIER_DISPLAY[0]!
  const capabilityLabel = typeof snapshot.capabilities?.tierLabel === 'string'
    ? snapshot.capabilities.tierLabel
    : null
  const isMaxTier = snapshot.nextTierLevel == null
  const fillPercent = isMaxTier
    ? 100
    : Math.min(100, Math.max(4, snapshot.tierProgressPercent || 0))
  const remaining = snapshot.nextTierRemainingPower

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Tier rozeti + guc bilgisi */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Zap className={cn('size-3.5', display.accent)} />
          <span className={cn('text-xs font-semibold', display.accent)}>
            {txa('Seviye {v1}', { v1: tier })}
          </span>
          <span className="text-[11px] text-muted-foreground">
            · {capabilityLabel || display.label}
          </span>
        </div>

        <span className="text-[11px] text-muted-foreground">
          {snapshot.activePower}{' '}{txa('guc')}
          {snapshot.activeSupporterCount > 0 && (
            <> {txa('· {v1} destekci', { v1: snapshot.activeSupporterCount })}</>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-[8px] overflow-hidden rounded-full bg-black/10">
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out',
            display.barColor,
            isMaxTier && 'animate-shimmer',
          )}
          style={{ width: `${fillPercent}%` }}
        />
        {/* Tier 3 shimmer overlay */}
        {isMaxTier && (
          <div
            className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.2)_50%,transparent_100%)] bg-[length:200%_100%] animate-[shimmer_2.5s_ease-in-out_infinite]"
            aria-hidden
          />
        )}
      </div>

      {/* Sonraki tier mesaji */}
      {!isMaxTier ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="size-3 text-primary/60" />
          {txa('{v1} guc daha ile Seviye {v2}', { v1: remaining, v2: snapshot.nextTierLevel ?? 0 })}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-amber-500/80">
          <Sparkles className="size-3" />
          {txa('Efsane seviyeye ulastiniz')}
        </p>
      )}
    </div>
  )
}
