import { Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getFansubBoostDowngradeRule } from '@/lib/fansubBoostCapabilityGovernance'
import type { AdminFeatureFlagItem } from '@/services/adminOpsService'
import type { AdminBoostCapabilityPolicyRow, AdminBoostTierRow } from '@/services/adminBoostControlService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Takviye v2 ortak parcalari: sistem anahtarlari, seviye etiketleri, ayricalik satiri. */

export interface RuntimeFlagSpec {
  key: string
  label: string
  hint: string
  /** Kapatmanin sonucu (onay penceresinde). */
  offConsequence: string
}

export const RUNTIME_FLAG_SPECS: RuntimeFlagSpec[] = [
  {
    key: 'boost.system',
    get label() { return txa('Takviye sistemi') },
    get hint() { return txa('Takviye verme, seviyeler ve ayrıcalıklar.') },
    get offConsequence() { return txa('Okurlar fansublara takviye veremez ve takviyeyle açılan ayrıcalıklar sitede çalışmaz. Mevcut takviye kayıtları silinmez.') },
  },
  {
    key: 'economy.fansub_donations',
    get label() { return txa('Fansub bağışı') },
    get hint() { return txa('Okurların fansub kasasına coin bağışlaması.') },
    get offConsequence() { return txa('Bağış düğmeleri kalkar ve yeni bağış yapılamaz. Önceki bağışlar ve kasa bakiyeleri etkilenmez.') },
  },
  {
    key: 'boost.fansub_manage_tab',
    get label() { return txa('Stüdyo takviye sekmesi') },
    get hint() { return txa('Fansub stüdyosundaki takviye sekmesi.') },
    get offConsequence() { return txa('Ekipler stüdyoda takviye sekmesini görmez. Takviye ve ayrıcalıklar çalışmaya devam eder.') },
  },
]

export const CAPABILITY_PLACEMENT_OPTIONS = [
  { value: 'core', get label() { return txa('Herkese açık') } },
  { value: 'tier:1', get label() { return txa('Seviye 1') } },
  { value: 'tier:2', get label() { return txa('Seviye 2') } },
  { value: 'tier:3', get label() { return txa('Seviye 3') } },
  { value: 'disabled', get label() { return txa('Kapalı') } },
] as const

export function placementLabel(value: string) {
  return CAPABILITY_PLACEMENT_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function tierName(level: number) {
  return level <= 0 ? txa('Temel') : txa('Seviye {v1}', { v1: level })
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function formatNumberTr(value: number) {
  return new Intl.NumberFormat(intlLocale()).format(value)
}

export function formatRelativeAge(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return txa('şimdi')
  if (diffMinutes < 60) return txa('{v1} dk önce', { v1: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return txa('{v1} sa önce', { v1: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return txa('{v1} gün önce', { v1: diffDays })
  return txa('{v1} ay önce', { v1: Math.floor(diffDays / 30) })
}

export function encodePolicyPlacement(row: Pick<AdminBoostCapabilityPolicyRow, 'placementType' | 'tierLevel'>) {
  if (row.placementType === 'tier') return `tier:${row.tierLevel ?? 1}`
  return row.placementType
}

export function buildFlagMap(flags: AdminFeatureFlagItem[]) {
  return flags.reduce<Record<string, AdminFeatureFlagItem>>((acc, item) => {
    acc[item.key] = item
    return acc
  }, {})
}

export function RuntimeFlagRow({ flag, spec, saving, onToggle }: {
  flag?: AdminFeatureFlagItem
  spec: RuntimeFlagSpec
  saving: boolean
  onToggle: (nextValue: boolean) => void
}) {
  const isEnabled = flag?.isEnabled === true
  const rolloutPercent = typeof flag?.rolloutPercent === 'number' ? flag.rolloutPercent : 100
  return (
    <li className="flex items-center gap-3 px-5 py-3" data-testid={`boost-flag-${spec.key}`}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold">{spec.label}</span>
          <span className={cn('rounded-md px-1.5 py-px text-[10.5px] font-bold', isEnabled ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{isEnabled ? txa('Açık') : txa('Kapalı')}</span>
          {isEnabled && rolloutPercent < 100 ? <span className="rounded-md bg-sky-500/12 px-1.5 py-px text-[10.5px] font-bold text-sky-700 dark:text-sky-300">{txa('kullanıcıların %{v1}\'i', { v1: rolloutPercent })}</span> : null}
        </span>
        <span className="block text-[12px] text-muted-foreground">{spec.hint}</span>
      </span>
      {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      <Switch checked={isEnabled} disabled={saving || !flag} onCheckedChange={onToggle} aria-label={txa('{v1} durumu', { v1: spec.label })} />
    </li>
  )
}

export function TierRow({ row, totalFansubs, threshold }: { row: AdminBoostTierRow, totalFansubs: number, threshold?: number }) {
  const ratio = totalFansubs > 0 ? Math.min(100, (row.fansubCount / totalFansubs) * 100) : 0
  return (
    <li className="px-5 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="font-semibold">{tierName(row.tierLevel)}{threshold != null ? <span className="font-normal text-muted-foreground"> {txa('· {v1}+ güç', { v1: formatNumberTr(threshold) })}</span> : null}</span>
        <span className="tabular-nums text-muted-foreground">{txa('{v1} ekip · {v2} destekçi', { v1: formatNumberTr(row.fansubCount), v2: formatNumberTr(row.totalSupporters) })}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} /></div>
    </li>
  )
}

export function CapabilityRow({ row, saving, onChange }: {
  row: AdminBoostCapabilityPolicyRow
  saving: boolean
  onChange: (row: AdminBoostCapabilityPolicyRow, nextValue: string) => void
}) {
  const downgradeRule = getFansubBoostDowngradeRule(row.capabilityKey)
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-2.5" data-testid={`boost-capability-row-${row.capabilityKey}`}>
      <span className="min-w-[200px] flex-1">
        <span className="block truncate text-[13px] font-semibold">{row.label}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground" title={downgradeRule.detail}>{txa('{v1} · seviye yetmezse: {v2}', { v1: row.where || row.surfaceGroup, v2: downgradeRule.shortLabel.toLocaleLowerCase(intlLocale()) })}</span>
      </span>
      <span className="w-[86px] shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground" title={txa('Kullanan ekip / seviyesi yeten ekip')}>
        <b className="text-[13px] text-foreground">{formatNumberTr(row.liveFansubCount)}</b> / {formatNumberTr(row.eligibleFansubCount)}
      </span>
      <Select value={encodePolicyPlacement(row)} onValueChange={(value) => onChange(row, value)} disabled={saving}>
        <SelectTrigger data-testid={`boost-capability-select-${row.capabilityKey}`} className="h-8 w-[136px] text-[12.5px]" aria-label={txa('{v1} seviyesi', { v1: row.label })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {CAPABILITY_PLACEMENT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </li>
  )
}
