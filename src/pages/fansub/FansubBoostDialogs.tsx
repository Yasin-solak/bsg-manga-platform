// Fansub Boost dialog components:
// - TierDetailDialog: tier detail view (capability-aware)
// - BoostPurchaseDialog: Discord-style one-step boost flow
// - ExtraPerkDialog: extra perk detail view

import {
  Check,
  Clock,
  Info,
  Lightning,
  Lock,
  SpinnerGap,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { FansubBoostPlan, FansubBoostCapabilities } from '@/services/fansubBoostService'
import {
  isCapabilityActive,
  TONE_STYLES,
  type ExtraPerkDefinition,
  type TierDefinition,
  type TierFeature,
} from './fansubBoostConstants'
import { FANSUB_BORDER, FANSUB_RADIUS, FANSUB_SURFACE, FANSUB_TEXT } from './fansubDesignTokens'
import { intlLocale, txa } from '@/i18n/activeLocale'

// ---------------------------------------------------------------------------
// Tier hero image: decorative element with the tier icon in the dialog header
// ---------------------------------------------------------------------------

function TierHeroVisual({ tier }: { tier: TierDefinition }) {
  const toneStyle = TONE_STYLES[tier.tone]
  const HeroIcon = tier.heroIcon

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className={cn(
        'flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br shadow-xl',
        toneStyle.gradient,
      )}>
        <HeroIcon size={40} weight="duotone" className="text-white drop-shadow-md" />
      </div>
      <div className={cn(
        'absolute -bottom-2 h-4 w-16 rounded-full blur-xl opacity-50',
        tier.tone === 'amber' ? 'bg-amber-400' : tier.tone === 'violet' ? 'bg-violet-400' : 'bg-rose-400',
      )} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feature status card: active/coming soon/locked by capability
// ---------------------------------------------------------------------------

function FeatureStatusCard({
  feature,
  isUnlocked,
  capabilities,
  toneText,
}: {
  feature: TierFeature
  isUnlocked: boolean
  capabilities: FansubBoostCapabilities | null | undefined
  toneText: string
}) {
  const Icon = feature.icon
  const isActive = isUnlocked && isCapabilityActive(capabilities, feature.capabilityKey)
  const isComingSoon = feature.status === 'coming_soon'

  let statusLabel: string
  let statusColor: string
  let statusIcon: React.ReactNode
  let cardBorder: string

  if (isActive) {
    statusLabel = txa('Aktif')
    statusColor = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    statusIcon = <Check size={12} weight="bold" />
    cardBorder = 'border-emerald-400/30 dark:border-emerald-500/20'
  } else if (isUnlocked && isComingSoon) {
    statusLabel = txa('Yakında')
    statusColor = 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
    statusIcon = <Clock size={12} weight="duotone" />
    cardBorder = 'border-amber-400/30 dark:border-amber-500/20'
  } else if (isUnlocked) {
    statusLabel = txa('Hazır')
    statusColor = `${toneText} bg-primary/5`
    statusIcon = <Lightning size={12} weight="duotone" />
    cardBorder = FANSUB_BORDER.default
  } else {
    statusLabel = txa('Kilitli')
    statusColor = 'text-muted-foreground/60 bg-muted/30'
    statusIcon = <Lock size={10} weight="fill" />
    cardBorder = FANSUB_BORDER.subtle
  }

  return (
    <div className={cn(
      'group flex items-center gap-3 border px-4 py-3.5 transition-all',
      FANSUB_RADIUS.innerCard,
      cardBorder,
      isActive
        ? 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]'
        : 'bg-background hover:bg-muted/10',
      !isUnlocked && 'opacity-55',
    )}>
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
        isActive
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : isUnlocked
            ? 'bg-primary/10 text-primary'
            : 'bg-muted/50 text-muted-foreground/40',
      )}>
        <Icon size={20} weight="duotone" />
      </div>

      <div className="min-w-0 flex-1">
        <span className={cn(
          'text-sm font-semibold',
          isActive || isUnlocked ? 'text-foreground' : 'text-muted-foreground/60',
        )}>
          {feature.label}
        </span>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {feature.where}
        </p>
      </div>

      <span className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold',
        statusColor,
      )}>
        {statusIcon}
        {statusLabel}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tier Detay Dialog — capability-aware ozellik kartlari
// ---------------------------------------------------------------------------

export function TierDetailDialog({
  open,
  onOpenChange,
  tier,
  state,
  capabilities,
  onActivate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: TierDefinition | null
  state: 'unlocked' | 'unlockable' | 'locked'
  capabilities?: FansubBoostCapabilities | null
  onActivate: () => void
}) {
  if (!tier) return null
  const tone = TONE_STYLES[tier.tone]
  const isUnlocked = state === 'unlocked'

  const sortedFeatures = [...tier.features].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return 0
  })

  const activeCount = tier.features.filter(
    (f) => f.status === 'active' && (isUnlocked ? isCapabilityActive(capabilities, f.capabilityKey) : true),
  ).length
  const comingSoonCount = tier.features.filter((f) => f.status === 'coming_soon').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-[560px] p-0', FANSUB_RADIUS.dialog)}>
        {/* Header — gradient + hero ikon */}
        <div className={cn('relative overflow-hidden rounded-t-[28px] bg-gradient-to-br px-6 pb-8 pt-10', tone.soft)}>
          <tier.heroIcon
            size={140}
            weight="duotone"
            className={cn('absolute -right-6 -top-4 opacity-[0.05]', tone.text)}
          />
          <tier.heroIcon
            size={80}
            weight="duotone"
            className={cn('absolute -left-4 bottom-0 opacity-[0.03]', tone.text)}
          />

          <TierHeroVisual tier={tier} />

          <DialogHeader className="mt-5 text-center">
            <DialogTitle className={cn('text-3xl font-bold', tone.text)}>
              {txa('Seviye {v1}', { v1: tier.level })}
            </DialogTitle>
            <DialogDescription className="mt-3 flex flex-wrap items-center justify-center gap-2.5 text-sm text-muted-foreground">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                isUnlocked ? `${tone.border} ${tone.bg} ${tone.text}` : 'border-border/60 bg-muted/20',
              )}>
                <Lightning size={12} weight="fill" />
                {txa('{v1}+ güç', { v1: tier.threshold })}
              </span>
              <span>{txa('{v1} aktif özellik', { v1: activeCount })}</span>
              {comingSoonCount > 0 && (
                <>
                  <span className="text-border/60">·</span>
                  <span>{comingSoonCount}{' '}{txa('yakinda')}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Durum etiketi */}
        <div className="flex justify-center -mt-3.5 relative z-10">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-md',
            state === 'unlocked'
              ? `${tone.badge} border-transparent`
              : state === 'unlockable'
                ? 'border-primary/20 bg-primary/10 text-primary'
                : cn(FANSUB_BORDER.default, FANSUB_SURFACE.card, 'text-muted-foreground'),
          )}>
            {state === 'unlocked' ? <Check size={12} weight="bold" /> : state === 'unlockable' ? <Lightning size={12} weight="fill" /> : <Lock size={10} weight="fill" />}
            {state === 'unlocked' ? txa('Açık') : state === 'unlockable' ? txa('Sıradaki seviye') : txa('Kilitli')}
          </span>
        </div>

        {/* Ozellikler basligi */}
        <div className="px-6 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {txa('Bu seviyedeki özellikler')}
          </p>
        </div>

        {/* Ozellik kartlari */}
        <div className="max-h-[320px] space-y-2 overflow-y-auto px-6 pb-2 pt-2">
          {sortedFeatures.length > 0 ? (
            sortedFeatures.map((feature) => (
              <FeatureStatusCard
                key={feature.capabilityKey}
                feature={feature}
                isUnlocked={isUnlocked}
                capabilities={capabilities}
                toneText={tone.text}
              />
            ))
          ) : (
            <div className={cn('border border-dashed px-4 py-5 text-center', FANSUB_RADIUS.innerCard, FANSUB_BORDER.default, FANSUB_TEXT.body)}>
              {txa('Bu katmanda şu an politikayla bağlı bir özellik yok.')}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className={cn('border-t px-6 py-4', FANSUB_BORDER.subtle)}>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {state !== 'unlocked' && (
              <p className="text-center text-xs text-muted-foreground">
                {state === 'unlockable'
                  ? txa('Takviye vererek bu seviyeyi acabilirsin.')
                  : txa('Bu seviyeyi açmak için önce Seviye {v1}\'i tamamlayın.', { v1: tier.level - 1 })}
              </p>
            )}
            <Button
              className={cn(
                'w-full gap-2 h-11 rounded-xl font-semibold',
                'bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:from-violet-600 hover:to-indigo-700 shadow-md',
              )}
              onClick={onActivate}
            >
              <Lightning size={16} weight="fill" />
              {txa('Takviye Et')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Discord-style Boost dialog: one plan, quantity picker, large hero
// ---------------------------------------------------------------------------

const BOOST_MIN_QUANTITY = 1
const BOOST_MAX_QUANTITY = 10

export type BoostProgressInfo = {
  activePower: number
  currentTierLevel: number
  nextTierLevel: number | null
  nextTierRequiredPower: number | null
  nextTierRemainingPower: number
  tierProgressPercent: number
}

export function BoostPurchaseDialog({
  open,
  onOpenChange,
  fansubName,
  plan,
  quantity,
  onQuantityChange,
  currentUserCoins,
  supporterNote,
  onSupporterNoteChange,
  isSubmitting,
  onSubmit,
  progress,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubName: string
  plan: FansubBoostPlan | null
  quantity: number
  onQuantityChange: (q: number) => void
  currentUserCoins: number
  supporterNote: string
  onSupporterNoteChange: (note: string) => void
  isSubmitting: boolean
  onSubmit: () => void
  progress?: BoostProgressInfo | null
}) {
  if (!plan) return null

  const unitCost = plan.coinCost
  const totalCost = unitCost * quantity
  const totalPower = plan.boostPower * quantity
  const affordable = currentUserCoins >= totalCost
  const NOTE_MAX = 220

  const powerAfterBoost = (progress?.activePower ?? 0) + totalPower
  const nextRequired = progress?.nextTierRequiredPower ?? null
  const nextLevel = progress?.nextTierLevel ?? null
  const willLevelUp = nextRequired !== null && powerAfterBoost >= nextRequired

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSubmitting) onOpenChange(v) }}>
      <DialogContent className={cn('max-w-[480px] p-0', FANSUB_RADIUS.dialog)}>
        {/* Hero — Discord-tarz buyuk gorsel alan */}
        <div className="relative flex flex-col items-center overflow-hidden rounded-t-[28px] bg-gradient-to-b from-violet-600 via-indigo-600 to-blue-700 px-6 pb-6 pt-8">
          {/* Dekoratif arka plan elementleri */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-white/[0.08] blur-3xl" />
            <Lightning size={200} weight="duotone" className="absolute -left-10 -top-6 text-white/[0.04]" />
            <Lightning size={160} weight="duotone" className="absolute -bottom-4 -right-8 text-white/[0.04]" />
          </div>

          {/* Merkez ikon */}
          <div className="relative">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-white/15 shadow-2xl backdrop-blur-sm">
              <Lightning size={44} weight="fill" className="text-white drop-shadow-lg" />
            </div>
            <div className="absolute -bottom-1 left-1/2 h-3 w-14 -translate-x-1/2 rounded-full bg-violet-300/30 blur-xl" />
          </div>

          <DialogHeader className="relative mt-4 text-center">
            <DialogTitle className="text-lg font-bold tracking-tight text-white">
              {txa('Fansub Takviyesi')}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-white/70">
              {txa('Takviye vererek')}{' '}<span className="font-semibold text-white">{fansubName}</span>{' '}{txa('fansubunun')}
              {txa('yeni özellikler açmasına yardım et.')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-5">
          {/* Adet secici — Discord tarzi */}
          <div className={cn('flex items-center justify-between border px-4 py-3.5', FANSUB_RADIUS.innerCard, FANSUB_BORDER.default, FANSUB_SURFACE.card)}>
            <div className="flex items-center gap-3">
              {/* Azalt */}
              <button
                type="button"
                disabled={isSubmitting || quantity <= BOOST_MIN_QUANTITY}
                onClick={() => onQuantityChange(Math.max(BOOST_MIN_QUANTITY, quantity - 1))}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg border text-base font-bold transition-colors',
                  quantity <= BOOST_MIN_QUANTITY
                    ? cn(FANSUB_BORDER.subtle, 'text-muted-foreground/30 cursor-not-allowed')
                    : cn(FANSUB_BORDER.default, 'text-foreground hover:bg-muted/30'),
                )}
              >
                &minus;
              </button>

              {/* Adet gostergesi */}
              <span className="min-w-[2rem] text-center text-lg font-bold text-foreground">
                {quantity}
              </span>

              {/* Artir */}
              <button
                type="button"
                disabled={isSubmitting || quantity >= BOOST_MAX_QUANTITY}
                onClick={() => onQuantityChange(Math.min(BOOST_MAX_QUANTITY, quantity + 1))}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg border text-base font-bold transition-colors',
                  quantity >= BOOST_MAX_QUANTITY
                    ? cn(FANSUB_BORDER.subtle, 'text-muted-foreground/30 cursor-not-allowed')
                    : cn(FANSUB_BORDER.default, 'text-foreground hover:bg-muted/30'),
                )}
              >
                +
              </button>
            </div>

            <div className="text-right text-sm">
              <span className="text-muted-foreground">{txa('Takviye')}</span>
              {' '}
              <span className="font-bold text-foreground">{unitCost.toLocaleString(intlLocale())} coin</span>
              <span className="text-muted-foreground"> / Aylik</span>
            </div>
          </div>

          {/* Ara toplam */}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium text-muted-foreground">{txa('Ara Toplam')}</span>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">{totalCost.toLocaleString(intlLocale())} coin</span>
              <span className="ml-1 text-xs text-muted-foreground">{txa('/ Ay')}</span>
            </div>
          </div>

          {/* Ilerleme onizleme */}
          {progress ? (
            <div className={cn('border px-4 py-2.5', FANSUB_RADIUS.button, FANSUB_BORDER.subtle, FANSUB_SURFACE.muted)}>
              {nextLevel !== null ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        willLevelUp
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                          : 'bg-gradient-to-r from-violet-400 to-indigo-500',
                      )}
                      style={{
                        width: `${Math.min(100, nextRequired ? (powerAfterBoost / nextRequired) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                  <span className={cn(
                    'whitespace-nowrap text-[11px] font-semibold',
                    willLevelUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                  )}>
                    {willLevelUp
                      ? txa('Seviye {v1} açılır!', { v1: nextLevel })
                      : txa('Seviye {v1}\'e {v2} güç', { v1: nextLevel, v2: (nextRequired ?? 0) - powerAfterBoost })}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {txa('Tüm seviyeler açık. Takviye mevcut seviyeyi korur.')}
                </p>
              )}
            </div>
          ) : null}

          {/* Destekci notu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="boost-supporter-note">
                {txa('Destekçi notu')}
                <span className="ml-1 text-muted-foreground/50">{txa('(opsiyonel)')}</span>
              </label>
              <span className="text-[10px] text-muted-foreground/50">{supporterNote.length}/{NOTE_MAX}</span>
            </div>
            <textarea
              id="boost-supporter-note"
              value={supporterNote}
              maxLength={NOTE_MAX}
              onChange={(e) => onSupporterNoteChange(e.target.value)}
              disabled={isSubmitting}
              placeholder={txa('Destek mesaji birakabilirsin.')}
              rows={2}
              className={cn('w-full resize-none border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50', FANSUB_RADIUS.input, FANSUB_BORDER.default, FANSUB_SURFACE.card)}
            />
          </div>

          {/* Footer — Discord tarzi: Bos Ver / Takviye Et */}
          <DialogFooter className="gap-2 pt-1">
            <Button
              variant="ghost"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {txa('Boş Ver')}
            </Button>
            <Button
              onClick={onSubmit}
              disabled={isSubmitting || !affordable}
              className={cn(
                'rounded-xl px-6 font-semibold gap-2',
                'bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:from-violet-600 hover:to-indigo-700 shadow-md',
                'disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none',
              )}
            >
              {isSubmitting ? (
                <><SpinnerGap size={16} weight="bold" className="animate-spin" /> {txa('İşleniyor...')}</>
              ) : !affordable ? (
                txa('Yetersiz bakiye')
              ) : (
                txa('Takviye Et')
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Extra Perk detail dialog: shows the detail items of one perk
// ---------------------------------------------------------------------------

export function ExtraPerkDialog({
  open,
  onOpenChange,
  perk,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  perk: ExtraPerkDefinition | null
}) {
  if (!perk) return null
  const Icon = perk.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-[520px] p-0', FANSUB_RADIUS.dialog)}>
        <div className="rounded-t-[28px] bg-[linear-gradient(135deg,rgba(168,85,247,0.12),rgba(255,255,255,0.9))] px-6 pb-5 pt-6 dark:bg-[linear-gradient(135deg,rgba(168,85,247,0.18),rgba(24,24,27,0.98))]">
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Icon size={28} weight="duotone" className="text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold text-foreground">{perk.title}</div>
              <div className="text-sm text-muted-foreground">{txa('{count}+ güç gerekir', { count: perk.requirement })}</div>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-6 pb-6">
          {perk.details.map((item) => (
            <div key={txa(item)} className={cn('flex items-start gap-2 border px-3 py-3 text-sm text-foreground', FANSUB_RADIUS.innerCard, FANSUB_BORDER.default, FANSUB_SURFACE.card)}>
              <Info size={16} weight="duotone" className="mt-0.5 shrink-0 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
