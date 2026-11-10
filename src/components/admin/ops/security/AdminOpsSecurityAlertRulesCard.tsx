import { useState } from 'react'
import { BellOff } from 'lucide-react'
import type {
  SecurityAlertMuteItem,
  SecurityAlertRuleItem,
  SecuritySeverity,
} from '@/services/adminSecurityService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { severityBadgeClass } from './adminOpsSecurityUtils'
import {
  formatDateTime,
  formatRemaining,
  initialDraft,
  scopeLabel,
  type RuleDraftState,
} from './adminOpsSecurityAlertsUtils'
import { txa } from '@/i18n/activeLocale'

/**
 * Alarm rules: the row list from the handoff.
 *
 * It used to be a nine-column table with window/threshold/dedupe number inputs open on
 * every row: WHAT THE RULE DOES (how many events in how many minutes trigger it)
 * got lost among three inputs. Now a rule reads as a SENTENCE, and
 * numbers open on edit.
 *
 * The on/off switch moved forward; it is the only thing done in daily use.
 */

interface AdminOpsSecurityAlertRulesCardProps {
  rulesLoading: boolean
  rulesError: string | null
  rules: SecurityAlertRuleItem[]
  drafts: Record<string, RuleDraftState>
  savingRuleId: string | null
  mutes: SecurityAlertMuteItem[]
  mutesLoading: boolean
  mutesError: string | null
  mutesByEventSource: Map<string, SecurityAlertMuteItem>
  muteBusyKey: string | null
  onReload: () => void
  onUpdateRuleDraft: (ruleId: string, patch: Partial<RuleDraftState>) => void
  onMute: (rule: SecurityAlertRuleItem, durationMinutes: 15 | 60 | 1440) => void
  onClearMute: (rule: SecurityAlertRuleItem) => void
  /** Saves; if `patch` is given it applies WITHOUT WAITING for the draft commit. */
  onSaveRule: (rule: SecurityAlertRuleItem, patch?: Partial<RuleDraftState>) => void
}

export function AdminOpsSecurityAlertRulesCard({
  rulesLoading,
  rulesError,
  rules,
  drafts,
  savingRuleId,
  mutes,
  mutesLoading,
  mutesError,
  mutesByEventSource,
  muteBusyKey,
  onReload,
  onUpdateRuleDraft,
  onMute,
  onClearMute,
  onSaveRule,
}: AdminOpsSecurityAlertRulesCardProps) {
  const [openRuleId, setOpenRuleId] = useState<string | null>(null)
  const activeRuleCount = rules.filter((rule) => rule.isActive).length

  return (
    <AdminSurface className="p-4" data-testid="admin-ops-security-rules">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="m-0 font-heading text-base text-foreground">{txa('Alarm kurallari')}</h2>
          <p className="m-0 mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {txa('Kapatilan kural yeni alarm uretmez; mevcut alarmlar listede kalir.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {txa('{v1} / {v2} kural acik', { v1: activeRuleCount, v2: rules.length })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReload}
            disabled={rulesLoading || mutesLoading || Boolean(muteBusyKey)}
          >
            {rulesLoading || mutesLoading ? txa('Yükleniyor…') : txa('Yenile')}
          </Button>
        </div>
      </div>

      {/* Aktif sessize almalar yalnizca VARSA gorunur; bos bir kutu her
          acilista yer kaplayip hicbir sey soylemiyordu. */}
      {!mutesLoading && !mutesError && mutes.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
          <BellOff className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          {mutes.map((item) => (
            <span
              key={item.id}
              className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px]"
            >
              <strong className="text-foreground">{item.eventType}</strong>
              <span className="ml-1 text-muted-foreground">
                {item.source || txa('tüm kaynaklar')} · {formatRemaining(item.remainingSeconds)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {mutesError ? (
        <p className="mb-3 text-sm text-muted-foreground">{mutesError}</p>
      ) : null}

      {rulesError ? (
        <p className="m-0 text-sm text-muted-foreground">{rulesError}</p>
      ) : rulesLoading ? (
        <p className="m-0 text-sm text-muted-foreground">{txa('Alarm kuralları yükleniyor…')}</p>
      ) : rules.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{txa('Tanımlı alarm kuralı yok.')}</p>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => {
            const draft = drafts[rule.id] || initialDraft(rule)
            const muteKey = `${rule.eventType}::${rule.source || ''}`
            const activeMute = mutesByEventSource.get(muteKey)
            const muteBusy = muteBusyKey === muteKey
            const detailOpen = openRuleId === rule.id
            const saving = savingRuleId === rule.id

            return (
              <div key={rule.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px]">
                    <strong
                      className={cn(
                        'block font-mono text-[13px]',
                        draft.isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {rule.eventType}
                    </strong>
                    <small className="text-[11px] text-muted-foreground">
                      {scopeLabel(rule)} · {rule.source || txa('tüm kaynaklar')}
                    </small>
                  </div>

                  {/* Kural bir CUMLE: uc sayi kutusu ayni bilgiyi soyluyordu
                      ama okumak icin ucunu birlestirmek gerekiyordu. */}
                  <p className="m-0 min-w-[200px] flex-1 text-xs text-muted-foreground">
                    {txa('{v1} dakikada {v2} olay ·', { v1: draft.windowMinutes, v2: draft.thresholdCount })}
                    {' '}{draft.dedupeMinutes}{' '}{txa('dk tekrar susturma')}
                  </p>

                  <Badge
                    variant="outline"
                    className={cn('font-semibold uppercase', severityBadgeClass(draft.severity))}
                  >
                    {draft.severity}
                  </Badge>

                  {activeMute ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400"
                    >
                      {txa('Sessiz')}
                    </Badge>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.isActive}
                      disabled={saving}
                      onCheckedChange={(next) => {
                        onUpdateRuleDraft(rule.id, { isActive: next })
                        onSaveRule(rule, { isActive: next })
                      }}
                      aria-label={txa('{v1} kuralini ac kapat', { v1: rule.eventType })}
                    />
                    <span
                      className={cn(
                        'w-10 text-[11px] font-semibold',
                        draft.isActive ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {saving ? '...' : draft.isActive ? txa('Açık') : txa('Kapali')}
                    </span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={detailOpen ? 'default' : 'outline'}
                    onClick={() => setOpenRuleId(detailOpen ? null : rule.id)}
                  >
                    {detailOpen ? txa('Kapat') : txa('Ayarla')}
                  </Button>
                </div>

                {detailOpen ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        {txa('Pencere (dk)')}
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={draft.windowMinutes}
                          onChange={(event) =>
                            onUpdateRuleDraft(rule.id, {
                              windowMinutes: Math.min(1440, Math.max(1, Number(event.target.value || 1))),
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        {txa('Esik (olay)')}
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          value={draft.thresholdCount}
                          onChange={(event) =>
                            onUpdateRuleDraft(rule.id, {
                              thresholdCount: Math.min(1000, Math.max(1, Number(event.target.value || 1))),
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        {txa('Dedupe (dk)')}
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={draft.dedupeMinutes}
                          onChange={(event) =>
                            onUpdateRuleDraft(rule.id, {
                              dedupeMinutes: Math.min(1440, Math.max(1, Number(event.target.value || 1))),
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        {txa('Onem')}
                        <select
                          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                          value={draft.severity}
                          onChange={(event) =>
                            onUpdateRuleDraft(rule.id, {
                              severity: event.target.value as SecuritySeverity,
                            })
                          }
                        >
                          <option value="low">{txa('Low')}</option>
                          <option value="medium">{txa('Medium')}</option>
                          <option value="high">{txa('High')}</option>
                          <option value="critical">{txa('Critical')}</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[11px] font-semibold text-muted-foreground">
                          {txa('Sessize al:')}
                        </span>
                        <Button type="button" size="sm" variant="outline" disabled={muteBusy} onClick={() => onMute(rule, 15)}>
                          {txa('15dk')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={muteBusy} onClick={() => onMute(rule, 60)}>
                          1s
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={muteBusy} onClick={() => onMute(rule, 1440)}>
                          24s
                        </Button>
                        {activeMute ? (
                          <>
                            <Button type="button" size="sm" variant="outline" disabled={muteBusy} onClick={() => onClearMute(rule)}>
                              {txa('Kaldir')}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDateTime(activeMute.mutedUntil)}
                            </span>
                          </>
                        ) : null}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={() => onSaveRule(rule)}
                      >
                        {saving ? txa('Kaydediliyor...') : txa('Kurali kaydet')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </AdminSurface>
  )
}
