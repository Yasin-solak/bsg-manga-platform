import { intlLocale } from '@/i18n/activeLocale'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'

export type AdminFansubWallet = { id: string; name: string; coin_balance: number; inventory: string[] }
export type QuickPanelKey = 'inventory' | 'history' | 'balance' | 'redeem' | 'tasks' | 'security'
export const OPEN_QUICK_PANEL_EVENT = 'bsgmanga:open-quick-panel'
export type OpenQuickPanelEventDetail = { panel: QuickPanelKey }
export type ReadingHistoryRow = {
  id: string
  mangaId?: string
  mangaSlug?: string
  mangaTitle: string
  coverImage?: string
  chapterNumber?: number
  readAt: string
}
export type FansubBalanceRow = {
  id: string
  fansubName: string
  amount: number
  type: string
  description: string
  createdAt: string
  relatedItemName?: string
  relatedItemType?: string
}
export type PersonalOwnedItemRow = {
  identifier: string
  name: string
  type: 'frame' | 'background' | 'pattern' | 'badge' | 'premium'
  customAssetUrl?: string
}

const BACKGROUND_PRESETS: Record<string, string> = {
  space: 'linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 50%,#16213e 100%)',
  city: 'linear-gradient(135deg,#1e3c72 0%,#2a5298 50%,#7e8ba3 100%)',
  nature: 'linear-gradient(135deg,#134e5e 0%,#71b280 50%,#a8e6cf 100%)',
  ocean: 'linear-gradient(135deg,#1e3c72 0%,#2a5298 50%,#4facfe 100%)',
  sunset: 'linear-gradient(135deg,#f093fb 0%,#f5576c 50%,#4facfe 100%)',
  neon: 'linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)',
}

const PATTERN_PRESETS: Record<string, string> = {
  dots: 'radial-gradient(circle,rgba(0,0,0,.55) 2px,transparent 2px) 0 0/14px 14px',
  stripes: 'repeating-linear-gradient(90deg,rgba(0,0,0,.55) 0,rgba(0,0,0,.55) 2px,transparent 2px,transparent 14px)',
  grid: 'linear-gradient(rgba(0,0,0,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.45) 1px,transparent 1px)',
  halftone: 'radial-gradient(circle at 25% 75%,rgba(0,0,0,.55) 2px,transparent 2px),radial-gradient(circle at 75% 25%,rgba(0,0,0,.55) 2px,transparent 2px)',
  zigzag: 'repeating-linear-gradient(45deg,rgba(0,0,0,.5) 0,rgba(0,0,0,.5) 8px,transparent 8px,transparent 16px)',
  waves: 'repeating-linear-gradient(0deg,rgba(0,0,0,.55) 0,rgba(0,0,0,.55) 2px,transparent 2px,transparent 8px)',
}

export function parseOwnedList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

export function formatRef(ref: string) {
  return ref.trim().replace(/[-_]+/g, ' ') || '-'
}

export function formatDateTime(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString(intlLocale())
}

export function readNotificationString(data: Record<string, unknown> | null, key: string) {
  if (!data || typeof data !== 'object') return undefined
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readNotificationNumber(data: Record<string, unknown> | null, key: string) {
  if (!data || typeof data !== 'object') return undefined
  const value = data[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function resolveAssetUrl(value?: string | null) {
  if (!value) return undefined
  const resolved = (resolveStoreAssetUrl(value) || value).trim()
  return resolved || undefined
}

export function isVideoAsset(url?: string) {
  return isVideoAssetUrl(url)
}

export function getBackgroundPreview(id?: string) {
  return (id && BACKGROUND_PRESETS[id]) || BACKGROUND_PRESETS.space
}

export function getPatternPreview(id?: string) {
  return (id && PATTERN_PRESETS[id]) || PATTERN_PRESETS.dots
}

export function blurActiveElement() {
  if (typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) activeElement.blur()
}
