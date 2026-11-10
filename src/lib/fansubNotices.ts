import { buildPathWithQuery, buildPublicFansubPath } from './routes'
import { txa } from '@/i18n/activeLocale'

export const FANSUB_PINNED_NOTICE_MAX_COUNT = 3
export const FANSUB_PINNED_NOTICE_TITLE_MAX = 80
export const FANSUB_PINNED_NOTICE_BODY_MAX = 280
export const FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX = 80
export const FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX = 220
export const FANSUB_SPECIAL_NOTIFICATION_COOLDOWN_MINUTES = 15
export const FANSUB_SPECIAL_NOTIFICATION_DAILY_LIMIT = 6
export const FANSUB_SPECIAL_NOTIFICATION_DUPLICATE_WINDOW_HOURS = 12

export const FANSUB_DETAIL_NOTICE_TAB = 'duyurular'
export const FANSUB_DETAIL_MANGAS_TAB = 'mangalar'
export const FANSUB_DETAIL_RELEASES_TAB = 'yayinlar'

export const FANSUB_NOTICE_ACTION_TARGETS = [
  'mangalar',
  'bolumler',
  'listeler',
] as const

export type FansubNoticeActionTarget = (typeof FANSUB_NOTICE_ACTION_TARGETS)[number]

export type FansubNoticeActionTargetOption = {
  value: FansubNoticeActionTarget
  label: string
  description: string
  actionLabel: string
}

export type FansubNoticeTargetChoice = {
  id: string
  label: string
  routeHint: string
}

export const FANSUB_NOTICE_ACTION_TARGET_OPTIONS: FansubNoticeActionTargetOption[] = [
  {
    value: 'mangalar',
    get label() { return txa('Mangalar') },
    get description() { return txa('Belirli bir manga detayina yonlendirir.') },
    actionLabel: 'Manga detayina git',
  },
  {
    value: 'bolumler',
    get label() { return txa('Bolumler') },
    get description() { return txa('Belirli bir bolum okuma sayfasina yonlendirir.') },
    actionLabel: 'Bolumu ac',
  },
  {
    value: 'listeler',
    get label() { return txa('Listeler') },
    get description() { return txa('Belirli bir manga listesi detayina yonlendirir.') },
    actionLabel: 'Listeyi ac',
  },
]

function isFansubNoticeActionTarget(value: string): value is FansubNoticeActionTarget {
  return FANSUB_NOTICE_ACTION_TARGETS.includes(value as FansubNoticeActionTarget)
}

export function normalizeFansubNoticeActionTarget(value: string | null | undefined): FansubNoticeActionTarget {
  const normalized = value?.trim().toLowerCase() || ''
  return isFansubNoticeActionTarget(normalized) ? normalized : 'mangalar'
}

export function getFansubNoticeActionTargetOption(target: FansubNoticeActionTarget) {
  return FANSUB_NOTICE_ACTION_TARGET_OPTIONS.find((option) => option.value === target)
    || FANSUB_NOTICE_ACTION_TARGET_OPTIONS[0]
}

export function buildFansubDetailTabPath(
  fansub: { id?: string | null; slug?: string | null },
  tab: string,
) {
  return buildPathWithQuery(buildPublicFansubPath(fansub), { tab })
}

export function resolveFansubNoticeActionTargetHref(
  fansub: { id?: string | null; slug?: string | null },
  target: FansubNoticeActionTarget,
  actionUrl?: string | null,
) {
  const normalizedActionUrl = typeof actionUrl === 'string' ? actionUrl.trim() : ''
  if (normalizedActionUrl) return normalizedActionUrl

  if (target === 'listeler') return '/listeler'
  if (target === 'bolumler') return buildFansubDetailTabPath(fansub, FANSUB_DETAIL_RELEASES_TAB)
  return buildFansubDetailTabPath(fansub, FANSUB_DETAIL_MANGAS_TAB)
}

export function resolveFansubNoticeActionLabel(
  target: FansubNoticeActionTarget,
  actionLabel?: string | null,
) {
  const normalizedActionLabel = typeof actionLabel === 'string' ? actionLabel.trim() : ''
  if (normalizedActionLabel) return normalizedActionLabel
  return getFansubNoticeActionTargetOption(target).actionLabel
}
