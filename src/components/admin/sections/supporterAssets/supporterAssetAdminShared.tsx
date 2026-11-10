import { Clock3, Sticker } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FansubSupporterAssetMedia from '@/components/community/FansubSupporterAssetMedia'
import { getFansubBoostDowngradeRule } from '@/lib/fansubBoostCapabilityGovernance'
import { cn } from '@/lib/utils'
import type {
  AdminSupporterAssetActivityRow,
  AdminSupporterAssetActor,
  AdminSupporterAssetCapabilityPolicyRow,
  AdminSupporterAssetLatestRow,
} from '@/services/adminSupporterAssetControlService'
import type { FansubSupporterAssetKind } from '@/services/fansubSupporterAssetService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const CAPABILITY_PLACEMENT_OPTIONS = [
  { value: 'core', get label() { return txa('Herkese açık') } },
  { value: 'tier:1', get label() { return txa('Seviye 1') } },
  { value: 'tier:2', get label() { return txa('Seviye 2') } },
  { value: 'tier:3', get label() { return txa('Seviye 3') } },
  { value: 'disabled', get label() { return txa('Kapalı') } },
] as const

export function formatNumberTr(value: number) {
  return new Intl.NumberFormat(intlLocale()).format(value)
}

export function formatDateTimeTr(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function formatRelativeAge(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return txa('şimdi')
  if (diffMinutes < 60) return txa('{v1} dk', { v1: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return txa('{v1} sa', { v1: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return txa('{v1} gün', { v1: diffDays })
  const diffMonths = Math.floor(diffDays / 30)
  return txa('{v1} ay', { v1: diffMonths })
}

export function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function encodePolicyPlacement(
  row: Pick<AdminSupporterAssetCapabilityPolicyRow, 'placementType' | 'tierLevel'>,
) {
  if (row.placementType === 'tier') return `tier:${row.tierLevel ?? 1}`
  return row.placementType
}

export function tierTone(level: number) {
  if (level >= 3) return 'default'
  if (level >= 1) return 'secondary'
  return 'outline'
}

export function policyPlacementTone(value: string): 'default' | 'secondary' | 'outline' {
  if (value === 'Core') return 'secondary'
  if (value === 'Kapalı' || value === txa('Kapalı')) return 'outline'
  return 'default'
}

export function activityTone(eventType: AdminSupporterAssetActivityRow['eventType']) {
  if (eventType === 'upload') return 'secondary'
  if (eventType === 'archive') return 'outline'
  return 'default'
}

function actorInitials(actor: AdminSupporterAssetActor | null) {
  if (!actor?.username) return '?'
  return actor.username.slice(0, 2).toUpperCase()
}

export function ActorChip({
  actor,
  fallback = txa('Bilinmiyor'),
  compact = false,
}: {
  actor: AdminSupporterAssetActor | null
  fallback?: string
  compact?: boolean
}) {
  if (!actor) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="h-3 w-3" />
        {fallback}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      <Avatar size={compact ? 'sm' : 'default'}>
        {actor.avatarUrl ? <AvatarImage src={actor.avatarUrl} alt={actor.username} /> : null}
        <AvatarFallback>{actorInitials(actor)}</AvatarFallback>
      </Avatar>
      <span className="truncate text-foreground">{actor.username}</span>
    </span>
  )
}

export function ActivityBadge({ row }: { row: AdminSupporterAssetActivityRow }) {
  return (
    <Badge variant={activityTone(row.eventType)} className="h-5 px-1.5 text-[10px]">
      {row.eventLabel}
    </Badge>
  )
}

export function CapabilityPlacementCard({
  row,
  saving,
  onChange,
}: {
  row: AdminSupporterAssetCapabilityPolicyRow
  saving: boolean
  onChange: (row: AdminSupporterAssetCapabilityPolicyRow, nextValue: string) => void
}) {
  const downgradeRule = getFansubBoostDowngradeRule(row.capabilityKey)

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
            <Badge variant={policyPlacementTone(row.placementLabel)} className="h-5 px-1.5 text-[10px]">
              {CAPABILITY_PLACEMENT_OPTIONS.find((option) => option.value === encodePolicyPlacement(row))?.label ?? row.placementLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{row.summary}</p>
          <p className="text-[11px] text-muted-foreground">{row.where}</p>
        </div>

        <div className="w-full max-w-[132px]">
          <Select
            value={encodePolicyPlacement(row)}
            onValueChange={(value) => onChange(row, value)}
            disabled={saving}
          >
            <SelectTrigger className="h-8 w-full rounded-lg text-xs">
              <SelectValue placeholder={txa('Katman')} />
            </SelectTrigger>
            <SelectContent align="end">
              {CAPABILITY_PLACEMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Kullanan ekip')}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatNumberTr(row.liveFansubCount)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Seviyesi yeten')}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatNumberTr(row.eligibleFansubCount)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Seviye yetmezse')}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{downgradeRule.shortLabel}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{downgradeRule.detail}</p>
        </div>
      </div>
    </div>
  )
}

export function LatestAssetCard({
  asset,
  onOpen,
}: {
  asset: AdminSupporterAssetLatestRow
  onOpen: (assetId: string) => void
}) {
  const statusLabel = asset.isArchived
    ? txa('Arşivde')
    : asset.isUsable
      ? txa('Kullanılabilir')
      : asset.isWithinQuota
        ? txa('Sınır içinde')
        : txa('Sınır dışında')

  return (
    <button
      type="button"
      onClick={() => onOpen(asset.assetId)}
      className="rounded-2xl border border-border/70 bg-background/70 p-3 text-left transition hover:border-primary/30 hover:bg-background"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
          <FansubSupporterAssetMedia
            asset={asset}
            className="h-full w-full rounded-none bg-transparent"
            imageClassName={asset.assetKind === 'emoji' ? 'object-cover' : 'object-contain'}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{asset.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">/{asset.fansubSlug || asset.fansubName}</p>
            </div>
            <Badge variant={asset.assetKind === 'emoji' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px]">
              {asset.assetKind === 'emoji' ? txa('Emoji') : txa('Çıkartma')}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant={tierTone(asset.tierLevel)} className="h-5 px-1.5 text-[10px]">
              {asset.tierLevel === 0 ? txa('Temel') : `Seviye ${asset.tierLevel}`}
            </Badge>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5',
                asset.isArchived
                  ? 'border-border/70 bg-muted/20 text-muted-foreground'
                  : asset.isUsable
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : asset.isWithinQuota
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-border/70 bg-muted/20 text-muted-foreground',
              )}
            >
              {statusLabel}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
              {txa('Sürüm {v1}', { v1: asset.currentRevisionNumber ?? 1 })}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground">
            <span className="truncate">{asset.shortcode}</span>
            <span>{formatRelativeAge(asset.updatedAt || asset.createdAt)}</span>
          </div>

          <div className="pt-1">
            <ActorChip actor={asset.currentRevisionCreatedBy || asset.createdBy} compact fallback={txa('Bilinmiyor')} />
          </div>
        </div>
      </div>
    </button>
  )
}

export function EmptyState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  )
}

export function MetaItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

export function MiniPreview({
  asset,
  className,
}: {
  asset: AdminSupporterAssetLatestRow
  className?: string
}) {
  return (
    <div className={cn('flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/20', className)}>
      <FansubSupporterAssetMedia
        asset={asset}
        className="h-full w-full rounded-none bg-transparent"
        imageClassName={asset.assetKind === 'emoji' ? 'object-cover' : 'object-contain'}
        fallbackClassName="text-muted-foreground"
      />
    </div>
  )
}

export function AssetKindLabel({ kind }: { kind: FansubSupporterAssetKind }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Sticker className="h-3 w-3" />
      {kind === 'emoji' ? txa('Emoji') : txa('Çıkartma')}
    </span>
  )
}
