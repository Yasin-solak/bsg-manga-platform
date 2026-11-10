import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import type {
  AdminFansubInventoryItem,
  AdminFansubMemberHistoryStats,
  AdminFansubTransactionRecord,
  AdminFansubTransactionTypeFilter,
} from '@/services/adminService'
import type { CSSProperties } from 'react'
import { isVideoAssetUrl } from '@/services/assetUrlService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type DetailTab = 'overview' | 'members' | 'mangas' | 'economy' | 'moderation'
export type MemberDraft = { role: 'admin' | 'moderator' | 'member'; teamTag: string }

export const FANSUBS_PER_PAGE = 20
export const MANGAS_PER_PAGE = 15
export const MEMBERS_PER_PAGE = 15
export const INVENTORY_PER_PAGE = 15
export const TRANSACTIONS_PER_PAGE = 15
export const EMPTY_STATS: AdminFansubMemberHistoryStats = { active: 0, left: 0, total: 0 }
export const TRANSACTION_TYPE_OPTIONS: Array<{ value: AdminFansubTransactionTypeFilter; label: string }> = [
  { value: 'all', get label() { return txa('Tüm türler') } },
  { value: 'redeem', get label() { return txa('Kod kullanımı') } },
  { value: 'purchase', get label() { return txa('Satın alma') } },
  { value: 'reward_view', get label() { return txa('Okuma ödülü') } },
  { value: 'reward_rank', get label() { return txa('Sıralama ödülü') } },
  { value: 'reward_task', get label() { return txa('Görev ödülü') } },
  { value: 'donation', get label() { return txa('Bagis') } },
  { value: 'system', get label() { return txa('Sistem') } },
]

/** "3 hr ago", "12 days ago", or a short date when older. */
export function fansubRelativeAge(value?: string | null, now = Date.now()) {
  const ts = value ? Date.parse(value) : Number.NaN
  if (Number.isNaN(ts)) return '—'
  const minutes = Math.max(0, Math.floor((now - ts) / 60_000))
  if (minutes < 60) return txa('{v1} dk önce', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa önce', { v1: hours })
  const days = Math.floor(hours / 24)
  if (days <= 30) return txa('{v1} gün önce', { v1: days })
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(intlLocale(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function trustBandLabel(band: string) {
  if (band === 'trusted') return txa('Güvenilir')
  if (band === 'review') return txa('İncelemeli')
  if (band === 'high-risk') return txa('Riskli')
  if (band === 'standard') return txa('Standart')
  return txa('Veri yetersiz')
}

export function errText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return txa(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return txa(message)
  }
  return fallback
}

export function dateText(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(intlLocale())
}

export function dateTimeText(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(intlLocale())
}

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size))
}

export function detailTabLabel(tab: DetailTab) {
  if (tab === 'overview') return txa('Genel')
  if (tab === 'members') return txa('Üyeler')
  if (tab === 'mangas') return txa('Seriler')
  if (tab === 'economy') return txa('Ekonomi')
  return txa('Yönetim geçmişi')
}

export function compactNumber(value?: number | null) {
  const normalized = Number(value || 0)
  return new Intl.NumberFormat(intlLocale(), {
    notation: normalized >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(normalized)
}

export function relativeDateText(value?: string) {
  if (!value) return txa('Kayıt yok')
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return txa('Kayıt yok')
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  if (minutes < 1) return txa('Şimdi')
  if (minutes < 60) return txa('{v1} dk önce', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} saat önce', { v1: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  return dateText(value)
}

export function transactionTypeText(type: AdminFansubTransactionRecord['type']) {
  if (type === 'redeem') return txa('Kod kullanımı')
  if (type === 'purchase') return txa('Satın alma')
  if (type === 'reward_view') return txa('Okuma ödülü')
  if (type === 'reward_rank') return txa('Sıralama ödülü')
  if (type === 'reward_task') return txa('Görev ödülü')
  if (type === 'donation') return txa('Bagis')
  return txa('Sistem')
}

export function coinAmountText(amount: number) {
  const normalized = Number.isFinite(amount) ? amount : 0
  const sign = normalized > 0 ? '+' : ''
  return `${sign}${normalized.toLocaleString(intlLocale())}`
}

const TRANSPARENT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+'
const KNOWN_FRAME_TYPES = new Set<FrameType>([
  'default',
  'christmas',
  'halloween',
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
  'fire',
  'ice',
  'neon',
  'gold',
  'rainbow',
])
const INVENTORY_PATTERN_PRESETS: Record<string, string> = {
  dots: 'radial-gradient(circle, rgba(0, 0, 0, 0.55) 2px, transparent 2px) 0 0 / 14px 14px',
  stripes: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.55) 0, rgba(0, 0, 0, 0.55) 2px, transparent 2px, transparent 14px)',
  grid: 'linear-gradient(rgba(0, 0, 0, 0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.45) 1px, transparent 1px)',
  halftone: 'radial-gradient(circle at 25% 75%, rgba(0, 0, 0, 0.55) 2px, transparent 2px), radial-gradient(circle at 75% 25%, rgba(0, 0, 0, 0.55) 2px, transparent 2px)',
  zigzag: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.5) 0, rgba(0, 0, 0, 0.5) 8px, transparent 8px, transparent 16px)',
  waves: 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0, rgba(0, 0, 0, 0.55) 2px, transparent 2px, transparent 8px)',
}
const INVENTORY_BACKGROUND_PRESETS: Record<string, string> = {
  space: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
  city: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e8ba3 100%)',
  nature: 'linear-gradient(135deg, #134e5e 0%, #71b280 50%, #a8e6cf 100%)',
  ocean: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4facfe 100%)',
  sunset: 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)',
  neon: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
}

function isDirectPreviewUrl(value?: string) {
  return !!value && /^(https?:|data:|blob:|\/)/i.test(value)
}

function isVideoPreviewUrl(value?: string) {
  return isVideoAssetUrl(value)
}

export function renderInventoryStoreItemPreview(storeItem?: AdminFansubInventoryItem['storeItem']) {
  const boxStyle: CSSProperties = {
    width: 36,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#141414',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  }

  if (!storeItem) {
    return <div style={boxStyle}>?</div>
  }

  const identifier = (storeItem.identifier || '').trim().toLowerCase()
  const directAssetUrl = isDirectPreviewUrl(storeItem.imageUrl) ? storeItem.imageUrl : undefined

  if (storeItem.type === 'frame') {
    const isKnownFrame = KNOWN_FRAME_TYPES.has((identifier || 'default') as FrameType)
    return (
      <div style={boxStyle}>
        <AvatarFrame
          src={TRANSPARENT_AVATAR}
          alt={storeItem.name}
          frameType={(isKnownFrame ? (identifier as FrameType) : identifier || 'default')}
          size={30}
          animated={true}
          customOverlayUrl={!isKnownFrame ? directAssetUrl : undefined}
        />
      </div>
    )
  }

  if (storeItem.type === 'background') {
    if (directAssetUrl && isVideoPreviewUrl(directAssetUrl)) {
      return <video style={boxStyle} src={directAssetUrl} autoPlay loop muted playsInline />
    }
    const background = directAssetUrl
      ? `center / cover no-repeat url(${directAssetUrl})`
      : INVENTORY_BACKGROUND_PRESETS[identifier] || 'linear-gradient(135deg, #111827 0%, #1f2937 100%)'
    return <div style={{ ...boxStyle, background }} />
  }

  if (storeItem.type === 'pattern') {
    const background = directAssetUrl
      ? `top left / 16px 16px repeat url(${directAssetUrl})`
      : INVENTORY_PATTERN_PRESETS[identifier] || INVENTORY_PATTERN_PRESETS.dots
    return <div style={{ ...boxStyle, background, backgroundColor: '#e5d7b8' }} />
  }

  if (storeItem.type === 'badge') {
    if (directAssetUrl) {
      return <img loading="lazy" decoding="async" src={directAssetUrl} alt={storeItem.name} className="h-[52px] w-9 shrink-0 rounded-md border border-border object-cover" />
    }
    return <div style={boxStyle}>{txa('Badge')}</div>
  }

  return <div style={boxStyle}>{txa('Item')}</div>
}
