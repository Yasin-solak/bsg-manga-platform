import { Link } from '@/i18n/router'
import { PencilLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FANSUB_PINNED_NOTICE_MAX_COUNT,
  getFansubNoticeActionTargetOption,
  resolveFansubNoticeActionTargetHref,
  type FansubNoticeActionTarget,
} from '@/lib/fansubNotices'
import { buildPublicFansubPath } from '@/lib/routes'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import type {
  FansubNotificationBroadcast,
  FansubPinnedNotice,
} from '@/services/fansubNoticeService'
import type { FansubNoticeEditorValue } from './FansubNoticeComposerDialog'
import {
  getDefaultNoticeTargetSelection,
  type FansubNoticeTargetOptionMap,
} from './fansubNoticeTargetOptions'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type FansubYonetNoticesTabProps = {
  fansubId: string
  fansubSlug?: string
  fansubName: string
  isBoostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
}

export type NotificationFormState = {
  title: string
  message: string
  routeTarget: FansubNoticeActionTarget
  targetEntityId: string
}

export const DEFAULT_NOTIFICATION_TARGET: FansubNoticeActionTarget = 'mangalar'

export function createEmptyTargetOptionMap(): FansubNoticeTargetOptionMap {
  return {
    mangalar: [],
    bolumler: [],
    listeler: [],
  }
}

export function createNoticeEditorValue(
  targetOptions: FansubNoticeTargetOptionMap,
  notice: FansubPinnedNotice | null,
  slotIndex: number,
): FansubNoticeEditorValue {
  if (notice) {
    return {
      slotIndex: notice.slotIndex,
      title: notice.title,
      body: notice.body,
      actionTarget: notice.actionTarget,
      targetEntityId: notice.targetEntityId || '',
      isActive: notice.isActive,
    }
  }

  const defaultSelection = getDefaultNoticeTargetSelection(targetOptions)
  return {
    slotIndex,
    title: '',
    body: '',
    actionTarget: defaultSelection?.target || DEFAULT_NOTIFICATION_TARGET,
    targetEntityId: defaultSelection?.targetEntityId || '',
    isActive: true,
  }
}

export function createNotificationFormState(targetOptions: FansubNoticeTargetOptionMap): NotificationFormState {
  const defaultSelection = getDefaultNoticeTargetSelection(targetOptions, DEFAULT_NOTIFICATION_TARGET)
  return {
    title: '',
    message: '',
    routeTarget: defaultSelection?.target || DEFAULT_NOTIFICATION_TARGET,
    targetEntityId: defaultSelection?.targetEntityId || '',
  }
}

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function formatRelativeMinutes(value: number) {
  if (value <= 1) return txa('1 dakika')
  return `${value} dakika`
}

export function resolveTierLockCopy(isBoostEnabled: boolean, requiredLevel: 1 | 2, feature: 'notice' | 'notification' = 'notice') {
  if (!isBoostEnabled) {
    return {
      badge: txa('Takviye kapalı'),
      description: txa('Takviye sistemi şu an site genelinde kapalı; bu alan geçici olarak kullanılamıyor.'),
    }
  }

  return {
    badge: txa('Seviye {v1} takviye gerekir', { v1: requiredLevel }),
    description: feature === 'notification'
      ? txa('Takipçilere özel bildirim Seviye {v1} takviyeyle açılır. Okurların fansubunu takviye ettikçe seviye yükselir.', { v1: requiredLevel })
      : txa('Yeni duyuru yayınlamak için Seviye {v1} takviye gerekir. Var olan duyuruları yine de yayından kaldırabilir ya da silebilirsin.', { v1: requiredLevel }),
  }
}

export function buildPublicFansubHref(fansubId: string, fansubSlug?: string) {
  return buildPublicFansubPath({ id: fansubId, slug: fansubSlug })
}

export function findNextAvailableNoticeSlot(notices: FansubPinnedNotice[]) {
  for (let slotIndex = 0; slotIndex < FANSUB_PINNED_NOTICE_MAX_COUNT; slotIndex += 1) {
    if (!notices.some((notice) => notice.slotIndex === slotIndex)) {
      return slotIndex
    }
  }
  return null
}

export function getBroadcastTargetHref(
  fansubId: string,
  fansubSlug: string | undefined,
  routeTarget: FansubNoticeActionTarget,
  routeHint?: string | null,
) {
  return resolveFansubNoticeActionTargetHref({ id: fansubId, slug: fansubSlug }, routeTarget, routeHint)
}

export function NoticeLockCard({
  fansubId,
  fansubSlug,
  copy,
}: {
  fansubId: string
  fansubSlug?: string
  copy: ReturnType<typeof resolveTierLockCopy>
}) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-400/45 bg-amber-500/5 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Badge variant="outline" className="rounded-full border-amber-400/45 bg-background/70">
            {copy.badge}
          </Badge>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to={buildPublicFansubHref(fansubId, fansubSlug)}>{txa('Takviye sayfası')}</Link>
        </Button>
      </div>
    </div>
  )
}

export function RuleChip({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

export function NoticeSummaryCard({
  notice,
  onEdit,
}: {
  notice: FansubPinnedNotice
  onEdit: () => void
}) {
  const actionOption = getFansubNoticeActionTargetOption(notice.actionTarget)
  const targetLabel = notice.actionLabel?.trim() || actionOption.label
  const targetPath = notice.actionUrl?.trim() || '-'
  const summaryTitle = normalizeText(notice.title)
  const summaryBody = normalizeText(notice.body)

  return (
    <article className="flex h-full min-h-[208px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={notice.isActive ? 'default' : 'outline'} className="rounded-full">
              {notice.isActive ? txa('Aktif') : txa('Pasif')}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {actionOption.label}
            </Badge>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onEdit} className="shrink-0">
          <PencilLine className="size-4" />
          {txa('Duzenle')}
        </Button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-1.5">
        <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere]" title={summaryTitle}>
          {summaryTitle}
        </h4>
        <p
          className="line-clamp-3 overflow-hidden text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]"
          title={summaryBody}
        >
          {summaryBody}
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <div className="min-w-0 space-y-1">
          <p className="truncate" title={txa('Hedef: {v1}', { v1: targetLabel })}>
            {txa('Hedef:')}{' '}{targetLabel}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground/80" title={targetPath}>
            {txa('Yol:')}{' '}{targetPath}
          </p>
        </div>
        <span className="shrink-0 text-right">
          {txa('Guncelleme:')}{' '}{formatDateTime(notice.updatedAt)}
        </span>
      </div>
    </article>
  )
}

export function buildDuplicateBroadcastMatch(
  broadcasts: FansubNotificationBroadcast[],
  notificationForm: NotificationFormState,
  nowMs: number,
  duplicateWindowHours: number,
) {
  const normalizedNotificationTitle = normalizeText(notificationForm.title)
  const normalizedNotificationMessage = normalizeText(notificationForm.message)

  const hasDuplicateNotificationInWindow = broadcasts.some((broadcast) => {
    const createdAtMs = new Date(broadcast.createdAt).getTime()
    if (!Number.isFinite(createdAtMs)) return false
    const withinDuplicateWindow = nowMs - createdAtMs < duplicateWindowHours * 60 * 60 * 1000
    if (!withinDuplicateWindow) return false

    return (
      normalizeText(broadcast.title).toLowerCase() === normalizedNotificationTitle.toLowerCase()
      && normalizeText(broadcast.message).toLowerCase() === normalizedNotificationMessage.toLowerCase()
      && broadcast.routeTarget === notificationForm.routeTarget
      && (broadcast.targetEntityId || '') === notificationForm.targetEntityId
    )
  })

  return {
    normalizedNotificationTitle,
    normalizedNotificationMessage,
    hasDuplicateNotificationInWindow,
  }
}
