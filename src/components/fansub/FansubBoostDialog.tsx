import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  listActiveFansubBoostPlans,
  purchaseFansubBoost,
  type FansubBoostPlan,
  type FansubBoostSnapshot,
  type FansubBoostSupporterState,
  type PurchaseFansubBoostResult,
} from '@/services/fansubBoostService'
import { toast } from '@/services/toastService'
import { Check, Loader2, Sparkles, Zap } from 'lucide-react'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PLAN_ACCENT_MAP: Record<string, { gradient: string; border: string; glow: string }> = {
  monthly: {
    gradient: 'from-blue-500/90 to-indigo-600/90',
    border: 'border-blue-500/40',
    glow: 'shadow-blue-500/20',
  },
  mega: {
    gradient: 'from-violet-500/90 to-purple-600/90',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/20',
  },
  top: {
    gradient: 'from-amber-400/90 to-orange-500/90',
    border: 'border-amber-400/40',
    glow: 'shadow-amber-400/20',
  },
  violet: {
    gradient: 'from-violet-500/90 to-indigo-600/90',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/20',
  },
  purple: {
    gradient: 'from-fuchsia-500/90 to-violet-600/90',
    border: 'border-fuchsia-500/40',
    glow: 'shadow-fuchsia-500/20',
  },
  amber: {
    gradient: 'from-amber-400/90 to-orange-500/90',
    border: 'border-amber-400/40',
    glow: 'shadow-amber-400/20',
  },
}

function resolvePlanAccent(code: string) {
  return PLAN_ACCENT_MAP[code] ?? PLAN_ACCENT_MAP.monthly
}

type FansubBoostDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubId: string
  fansubName: string
  currentUserCoins: number
  plans?: FansubBoostPlan[]
  snapshot?: FansubBoostSnapshot | null
  supporterState?: FansubBoostSupporterState | null
  onPurchaseSuccess: (result: PurchaseFansubBoostResult) => void
}

export default function FansubBoostDialog({
  open,
  onOpenChange,
  fansubId,
  fansubName,
  currentUserCoins,
  plans: planProp = [],
  snapshot = null,
  supporterState = null,
  onPurchaseSuccess,
}: FansubBoostDialogProps) {
  const [plans, setPlans] = useState<FansubBoostPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null)
  const [supporterNote, setSupporterNote] = useState('')
  const [purchasing, setPurchasing] = useState(false)

  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) ?? null
  const canAfford = selectedPlan ? currentUserCoins >= selectedPlan.coinCost : false
  const selectedPlanAccent = resolvePlanAccent(selectedPlan?.metadata.accent || selectedPlan?.code || 'monthly')
  const selectedSupporterSummary = supporterState?.rewardCapabilities?.rewardSummary
    || selectedPlan?.metadata.supporterBenefitSummary
    || txa('Takviye veren kullanıcı, destekçi kimliği ve görünürlük katmanları kazanır.')
  const selectedSupporterHighlights = Array.isArray(supporterState?.rewardCapabilities?.rewardHighlights)
    ? supporterState.rewardCapabilities.rewardHighlights.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      if (planProp.length > 0) {
        setPlans(planProp)
        setPlansError(null)
        setPlansLoading(false)
        setSelectedPlanCode((prev) => prev || planProp[0]?.code || null)
        return
      }

      setPlansLoading(true)
      setPlansError(null)
      try {
        const result = await listActiveFansubBoostPlans()
        if (cancelled) return
        setPlans(result)
        setSelectedPlanCode((prev) => prev || result[0]?.code || null)
      } catch {
        if (!cancelled) setPlansError(txa('Takviye planları yüklenemedi.'))
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [open, planProp])

  useEffect(() => {
    if (!open) {
      setSupporterNote('')
      setSelectedPlanCode(null)
    }
  }, [open])

  const handlePurchase = async () => {
    if (!selectedPlan || purchasing) return

    setPurchasing(true)
    try {
      const result = await purchaseFansubBoost({
        fansubId,
        planCode: selectedPlan.code,
        supporterNote: supporterNote.trim() || null,
      })
      onPurchaseSuccess(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : txa('Takviye satın alma işlemi başarısız oldu.'),
      )
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!purchasing) onOpenChange(value) }}>
      <DialogContent className='sm:max-w-[760px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Zap className='size-5 text-primary' />
            {txa('Fansub Takviyesi')}
          </DialogTitle>
          <DialogDescription>
            <span className='font-medium text-foreground'>{fansubName}</span>
            {' '}
            {txa('fansubunu takviye ederek tier gücünü artırabilir, destekçi kimliğini görünür hale getirebilirsin.')}
          </DialogDescription>
        </DialogHeader>

        <div className='rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground'>
          {txa('Bakiyen:')}
          {' '}
          <span className='font-semibold text-foreground'>{currentUserCoins.toLocaleString(intlLocale())} coin</span>
        </div>

        {plansLoading ? (
          <div className='flex items-center justify-center py-10 text-muted-foreground'>
            <Loader2 className='size-5 animate-spin' />
            <span className='ml-2 text-sm'>{txa('Planlar yükleniyor...')}</span>
          </div>
        ) : plansError ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
            {plansError}
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-3'>
            {plans.map((plan) => {
              const accent = resolvePlanAccent(plan.metadata.accent || plan.code)
              const isSelected = selectedPlanCode === plan.code
              const affordable = currentUserCoins >= plan.coinCost

              return (
                <button
                  key={plan.id}
                  type='button'
                  disabled={purchasing}
                  onClick={() => setSelectedPlanCode(plan.code)}
                  className={cn(
                    'relative flex flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-center transition-all duration-200',
                    'bg-card/60 backdrop-blur-sm hover:bg-card/80',
                    isSelected
                      ? `${accent.border} ring-2 ring-primary/30 ${accent.glow} shadow-lg`
                      : 'border-border/50 hover:border-border/80',
                    !affordable && 'opacity-50',
                  )}
                >
                  <div className={cn(
                    'flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    accent.gradient,
                  )}>
                    <Zap className='size-5' />
                  </div>

                  <div className='space-y-1'>
                    {plan.metadata.eyebrow ? (
                      <p className='text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
                        {plan.metadata.eyebrow}
                      </p>
                    ) : null}
                    <p className='text-sm font-semibold text-foreground'>{plan.name}</p>
                  </div>

                  <p className='text-2xl font-bold tracking-tight text-foreground'>
                    +{plan.boostPower}
                    <span className='ml-1 text-xs font-medium text-muted-foreground'>{txa('guc')}</span>
                  </p>

                  <p className='text-xs text-muted-foreground'>{txa('{v1} gun', { v1: plan.durationDays })}</p>

                  <div className={cn(
                    'mt-1 rounded-full px-3 py-1 text-xs font-semibold',
                    isSelected
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted/60 text-muted-foreground',
                  )}>
                    {plan.coinCost.toLocaleString(intlLocale())} coin
                  </div>

                  {(plan.metadata.summary || plan.description) ? (
                    <p className='mt-1 text-[11px] leading-4 text-muted-foreground/80'>
                      {plan.metadata.summary || plan.description}
                    </p>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}

        {selectedPlan ? (
          <div className='grid gap-3 lg:grid-cols-[1.08fr_0.92fr]'>
            <div className={cn('rounded-2xl border p-4', selectedPlanAccent.border)}>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>
                    {selectedPlan.metadata.eyebrow || txa('Plan özeti')}
                  </p>
                  <h3 className='mt-1 text-lg font-semibold text-foreground'>{selectedPlan.name}</h3>
                </div>
                {selectedPlan.metadata.badgeLabel ? (
                  <Badge className='rounded-full bg-background/70 text-foreground'>
                    {selectedPlan.metadata.badgeLabel}
                  </Badge>
                ) : null}
              </div>

              <p className='mt-3 text-sm leading-6 text-muted-foreground'>
                {selectedPlan.metadata.summary || selectedPlan.description}
              </p>

              <Separator className='my-4 bg-border/60' />

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='rounded-2xl bg-muted/25 px-3 py-3'>
                  <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Fansuba açar')}</p>
                  <p className='mt-1.5 text-sm leading-6 text-foreground/90'>
                    {selectedPlan.metadata.fansubBenefitSummary || txa('Fansubun takviye gücü ilerler ve yeni vitrin katmanları açılır.')}
                  </p>
                </div>
                <div className='rounded-2xl bg-muted/25 px-3 py-3'>
                  <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Sana kazandirir')}</p>
                  <p className='mt-1.5 text-sm leading-6 text-foreground/90'>
                    {selectedPlan.metadata.supporterBenefitSummary || txa('Destekçi kimliği, rozet ve görünürlük katmanları açılır.')}
                  </p>
                </div>
              </div>
            </div>

            <div className='rounded-2xl border border-border/60 bg-card/50 p-4'>
              <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Bu fansubda şu an')}</p>
              <h3 className='mt-1 text-lg font-semibold text-foreground'>
                {snapshot?.capabilities?.tierHeadline || txa('Takviye seviyesi ilerledikçe yeni araçlar açılır.')}
              </h3>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {snapshot?.capabilities?.nextTierCallout || txa('Takviye, bir sonraki seviyeye kalan gücü kapatıp daha zengin fansub yüzeyleri açar.')}
              </p>

              <div className='mt-4 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3'>
                <p className='text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>{txa('Destekçi etkisi')}</p>
                <p className='mt-1.5 text-sm leading-6 text-foreground/90'>{selectedSupporterSummary}</p>
              </div>

              {selectedSupporterHighlights.length > 0 ? (
                <div className='mt-4 space-y-2'>
                  {selectedSupporterHighlights.slice(0, 3).map((highlight) => (
                    <div key={highlight} className='flex items-start gap-2.5 text-sm text-muted-foreground'>
                      <Check className='mt-0.5 size-3.5 shrink-0 text-primary' />
                      <span className='leading-6'>{highlight}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className='space-y-1.5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {txa('Destekçi notu')}
            {' '}
            <span className='text-muted-foreground/60'>{txa('(opsiyonel)')}</span>
          </p>
          <Textarea
            value={supporterNote}
            maxLength={220}
            onChange={(event) => setSupporterNote(event.target.value)}
            placeholder={txa('Destek mesaji birakabilirsin.')}
            disabled={purchasing}
            className='resize-none'
            rows={2}
          />
          <p className='text-right text-[11px] text-muted-foreground/60'>
            {supporterNote.length}/220
          </p>
        </div>

        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='outline'
            disabled={purchasing}
            onClick={() => onOpenChange(false)}
            className='rounded-xl'
          >
            {txa('Vazgeç')}
          </Button>

          <Button
            type='button'
            disabled={purchasing || !selectedPlan || !canAfford}
            onClick={handlePurchase}
            className={cn(
              'rounded-xl px-6 font-semibold shadow-md transition-all',
              'bg-gradient-to-r from-violet-500 to-indigo-600 text-white',
              'hover:from-violet-600 hover:to-indigo-700',
              'disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none',
            )}
          >
            {purchasing ? (
              <><Loader2 className='size-4 animate-spin' /> {txa('İşleniyor...')}</>
            ) : !canAfford && selectedPlan ? (
              txa('Yetersiz bakiye')
            ) : selectedPlan ? (
              <>
                <Sparkles className='size-4' />
                {selectedPlan.metadata.ctaLabel || txa('{v1} coin ile takviye et', { v1: selectedPlan.coinCost.toLocaleString(intlLocale()) })}
              </>
            ) : (
              txa('Plan seç')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
