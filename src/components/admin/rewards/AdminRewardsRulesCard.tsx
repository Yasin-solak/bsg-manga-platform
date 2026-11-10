import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { FansubRewardRankRule, FansubRewardViewTier } from '@/services/rewardService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatNumber, type TierFormState } from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

/**
 * Tracks unsaved rows: an edited row is marked "unsaved", cleared when saving
 * finishes (savingId returns from the row to null). In old cards
 * "Deactivate" only changed the screen and it was unclear it was not saved.
 */
function useDirtyRows(savingId: string | null) {
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const previous = useRef<string | null>(null)
  useEffect(() => {
    const done = previous.current
    if (done && savingId === null) setDirty((set) => { const next = new Set(set); next.delete(done); return next })
    previous.current = savingId
  }, [savingId])
  return { dirty, mark: (id: string) => setDirty((set) => new Set(set).add(id)) }
}

function SaveButton({ id, savingId, dirty, onSave }: { id: string, savingId: string | null, dirty: boolean, onSave: () => void }) {
  return (
    <Button size="sm" variant={dirty ? 'default' : 'ghost'} className="h-8 w-[72px] text-[12px]" disabled={!dirty || savingId === id} onClick={onSave}>
      {savingId === id ? <Loader2 className="size-3.5 animate-spin" /> : dirty ? txa('Kaydet') : txa('Kayıtlı')}
    </Button>
  )
}

/** Rank rewards and view tiers: inline editing with an unsaved marker. */
export function AdminRewardsRulesCard({
  configLoading,
  rankRules,
  savingRankId,
  onUpdateRule,
  onSaveRule,
  viewTiers,
  savingTierId,
  newTier,
  newTierSaving,
  onUpdateTier,
  onSaveTier,
  onChangeNewTier,
  onCreateTier,
}: {
  configLoading: boolean
  rankRules: FansubRewardRankRule[]
  savingRankId: string | null
  onUpdateRule: (ruleId: string, patch: Partial<FansubRewardRankRule>) => void
  onSaveRule: (rule: FansubRewardRankRule) => void
  viewTiers: FansubRewardViewTier[]
  savingTierId: string | null
  newTier: TierFormState
  newTierSaving: boolean
  onUpdateTier: (tierId: string, patch: Partial<FansubRewardViewTier>) => void
  onSaveTier: (tier: FansubRewardViewTier) => void
  onChangeNewTier: (patch: Partial<TierFormState>) => void
  onCreateTier: () => void
}) {
  const ranks = useDirtyRows(savingRankId)
  const tiers = useDirtyRows(savingTierId)
  const unsaved = ranks.dirty.size + tiers.dirty.size

  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid="rewards-rules">
      <header className="flex items-center gap-2 border-b border-border/60 px-5 py-3.5">
        <span className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">{txa('Ödül kuralları')}</h2>
          <span className="block text-[12px] text-muted-foreground">{txa('Sıralama ödülü ilk sıralara; görüntülenme ödülü eşiği geçen her fansuba.')}</span>
        </span>
        {unsaved ? <span className="rounded-md bg-amber-500/12 px-1.5 py-px text-[11px] font-bold text-amber-700 dark:text-amber-300" data-testid="rewards-rules-unsaved">{txa('{v1} kaydedilmemiş değişiklik', { v1: unsaved })}</span> : null}
      </header>

      {configLoading ? (
        <div className="flex flex-col gap-2 p-4">{[0, 1, 2].map((index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-muted/40" />)}</div>
      ) : (
        <div className="divide-y divide-border/60">
          <div className="px-5 py-3">
            <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Sıralama ödülü')}</h3>
            {rankRules.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{txa('Kural yok.')}</p> : (
              <ul className="divide-y divide-border/50">
                {rankRules.map((rule) => (
                  <li key={rule.id} className={cn('flex items-center gap-3 py-1.5', !rule.isActive && 'opacity-60')}>
                    <span className="w-8 shrink-0 text-[13px] font-bold tabular-nums">#{rule.rankPosition}</span>
                    <Input
                      type="number"
                      min={0}
                      aria-label={txa('{v1}. sıra coin', { v1: rule.rankPosition })}
                      className="h-8 w-32 text-[13px] tabular-nums"
                      value={rule.coinReward}
                      onChange={(event) => { onUpdateRule(rule.id, { coinReward: Math.max(0, Number(event.target.value || 0)) }); ranks.mark(rule.id) }}
                    />
                    <span className="text-[12px] text-muted-foreground">coin</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Switch checked={rule.isActive} aria-label={txa('{v1}. sıra etkin', { v1: rule.rankPosition })} onCheckedChange={(checked) => { onUpdateRule(rule.id, { isActive: checked }); ranks.mark(rule.id) }} />
                      <SaveButton id={rule.id} savingId={savingRankId} dirty={ranks.dirty.has(rule.id)} onSave={() => onSaveRule(rule)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 py-3">
            <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Görüntülenme kademeleri')}</h3>
            <div className="flex gap-2 pb-1 text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
              <span className="w-24">{txa('Ad')}</span><span className="w-24">{txa('En az okunma')}</span><span className="w-3" /><span className="w-24">{txa('Coin')}</span>
            </div>
            <ul className="divide-y divide-border/50 overflow-x-auto">
              {viewTiers.map((tier) => (
                <li key={tier.id} className={cn('flex items-center gap-2 py-1.5', !tier.isActive && 'opacity-60')}>
                  <Input aria-label={txa('Kademe adı')} className="h-8 w-24 text-[13px]" value={tier.label} onChange={(event) => { onUpdateTier(tier.id, { label: event.target.value }); tiers.mark(tier.id) }} />
                  <Input type="number" min={0} aria-label={txa('{v1} en az okunma', { v1: tier.label })} className="h-8 w-24 text-[13px] tabular-nums" value={tier.minViews} onChange={(event) => { onUpdateTier(tier.id, { minViews: Math.max(0, Number(event.target.value || 0)) }); tiers.mark(tier.id) }} />
                  <span className="text-[12px] text-muted-foreground">→</span>
                  <Input type="number" min={0} aria-label={`${tier.label} coin`} className="h-8 w-24 text-[13px] tabular-nums" value={tier.coinReward} onChange={(event) => { onUpdateTier(tier.id, { coinReward: Math.max(0, Number(event.target.value || 0)) }); tiers.mark(tier.id) }} />
                  <span className="ml-auto flex items-center gap-2">
                    <Switch checked={tier.isActive} aria-label={`${tier.label} etkin`} onCheckedChange={(checked) => { onUpdateTier(tier.id, { isActive: checked }); tiers.mark(tier.id) }} />
                    <SaveButton id={tier.id} savingId={savingTierId} dirty={tiers.dirty.has(tier.id)} onSave={() => onSaveTier(tier)} />
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2 py-1.5" data-testid="rewards-new-tier">
                <Input placeholder={txa('Yeni kademe')} aria-label={txa('Yeni kademe adı')} className="h-8 w-24 text-[13px]" value={newTier.label} onChange={(event) => onChangeNewTier({ label: event.target.value })} />
                <Input type="number" min={0} aria-label={txa('Yeni kademe en az okunma')} className="h-8 w-24 text-[13px] tabular-nums" value={newTier.minViews} onChange={(event) => onChangeNewTier({ minViews: Math.max(0, Number(event.target.value || 0)) })} />
                <span className="text-[12px] text-muted-foreground">→</span>
                <Input type="number" min={0} aria-label={txa('Yeni kademe coin')} className="h-8 w-24 text-[13px] tabular-nums" value={newTier.coinReward} onChange={(event) => onChangeNewTier({ coinReward: Math.max(0, Number(event.target.value || 0)) })} />
                <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 text-[12px]" disabled={newTierSaving || !newTier.label.trim()} onClick={onCreateTier}>
                  {newTierSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{txa('Ekle')}
                </Button>
              </li>
            </ul>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">{txa('Bir fansub geçtiği tüm kademelerin ödülünü alır. Örnek:')} {viewTiers[0] ? txa('{v1} okunma → {v2} coin', { v1: formatNumber(viewTiers[0].minViews), v2: formatNumber(viewTiers[0].coinReward) }) : '—'}.</p>
          </div>
        </div>
      )}
    </section>
  )
}
