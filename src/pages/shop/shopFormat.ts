import type { ShopCard, ShopProductType, ShopQuote, ShopRarity } from '@/services/shopService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Shop v3 shared labels and formats. */

export const RARITY_META: Record<ShopRarity, { label: string, ink: string, chip: string, glow: string, ring: string, bar: string }> = {
  legendary: { get label() { return txa('Efsanevi') }, ink: 'text-amber-300', chip: 'bg-amber-400/15 text-amber-300', glow: 'rgba(245,185,66,.34)', ring: 'border-amber-400/45', bar: 'bg-gradient-to-r from-amber-300 via-orange-400 to-amber-300' },
  epic: { get label() { return txa('Destansı') }, ink: 'text-violet-300', chip: 'bg-violet-400/15 text-violet-300', glow: 'rgba(196,181,253,.3)', ring: 'border-violet-400/40', bar: 'bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400' },
  rare: { get label() { return txa('Nadir') }, ink: 'text-sky-300', chip: 'bg-sky-400/15 text-sky-300', glow: 'rgba(125,211,252,.26)', ring: 'border-sky-400/35', bar: 'bg-sky-400' },
  common: { get label() { return txa('Yaygın') }, ink: 'text-muted-foreground', chip: 'bg-foreground/10 text-muted-foreground', glow: 'rgba(255,255,255,.08)', ring: 'border-border', bar: 'bg-foreground/20' },
}

export const TYPE_LABEL: Record<ShopProductType, string> = {
  get frame() { return txa('Avatar çerçevesi') },
  get background() { return txa('Profil arka planı') },
  get profile_effect() { return txa('Profil efekti') },
  get bundle() { return txa('Paket') },
  get premium() { return txa('Premium üyelik') },
}

export const TYPE_PLURAL: Record<Exclude<ShopProductType, 'premium'>, string> = {
  get frame() { return txa('Çerçeveler') },
  get background() { return txa('Arka planlar') },
  get profile_effect() { return txa('Profil efektleri') },
  get bundle() { return txa('Paketler') },
}

// For old /magaza/goz-at/* paths and the catalog ?tur= parameter.
export const TYPE_SLUG: Record<Exclude<ShopProductType, 'premium'>, string> = {
  frame: 'cerceve',
  background: 'arka-plan',
  profile_effect: 'efekt',
  bundle: 'paket',
}

export function typeFromSlug(slug: string | null): Exclude<ShopProductType, 'premium'> | null {
  const entry = (Object.entries(TYPE_SLUG) as Array<[Exclude<ShopProductType, 'premium'>, string]>).find(([, value]) => value === slug)
  return entry ? entry[0] : null
}

const REASON_LABEL: Record<string, string> = {
  owned: 'Sende var',
  owned_part: 'Bir parçası sende',
  get premium_only() { return txa('Yalnız Premium') },
  premium_paused: 'Şu an satışta değil',
  reward_only: 'Ödül ürünü',
  get upcoming() { return txa('Yakında') },
  ended: 'Satış bitti',
  sold_out: 'Tükendi',
  empty: 'Satışta değil',
  draft: 'Taslak',
  archived: 'Arşivde',
}

export function reasonLabel(reason: string | null) {
  return reason ? REASON_LABEL[reason] ?? 'Satın alınamaz' : null
}

export function formatCoin(value: number) {
  return value.toLocaleString(intlLocale())
}

export function discountPercent(quote: ShopQuote) {
  if (quote.listPrice <= 0 || quote.price >= quote.listPrice) return 0
  return Math.round((1 - quote.price / quote.listPrice) * 100)
}

export function priceSourceLabel(quote: ShopQuote) {
  if (quote.source === 'daily_deal') return txa('Günün fırsatı')
  if (quote.source === 'discount') return quote.discountLabel ?? txa('İndirim')
  return null
}

/** Kalan sure: "3g 14s", "5s 12dk", "12dk". */
export function formatRemaining(target: string | null, now = Date.now()) {
  if (!target) return null
  const ms = new Date(target).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}g ${hours}s`
  if (hours > 0) return txa('{v1}s {v2}dk', { v1: hours, v2: mins })
  return `${Math.max(mins, 1)}dk`
}

export function countdownParts(target: string, now = Date.now()) {
  const ms = Math.max(0, new Date(target).getTime() - now)
  const total = Math.floor(ms / 1000)
  return [
    { value: Math.floor(total / 86_400), label: txa('gün') },
    { value: Math.floor((total % 86_400) / 3600), label: txa('saat') },
    { value: Math.floor((total % 3600) / 60), label: txa('dk') },
    { value: total % 60, label: txa('sn') },
  ]
}

export function formatDateTime(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString(intlLocale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export function formatDay(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' })
}

/** Kartin sag ust etiketi: sahiplik, indirim, kalan sure, stok. */
export function cardBadge(card: ShopCard, now = Date.now()): { label: string, tone: 'owned' | 'sale' | 'timer' | 'stock' | 'muted' } | null {
  const { quote } = card
  if (quote.reason === 'owned') return { label: txa('Sende'), tone: 'owned' }
  if (card.locked || quote.state === 'upcoming') return { label: card.availableFrom ? formatDay(card.availableFrom) : txa('Yakında'), tone: 'muted' }
  const percent = discountPercent(quote)
  if (percent > 0) return { label: txa('-%{v1}', { v1: percent }), tone: 'sale' }
  if (card.stockLeft !== null && card.stockLeft <= 25) return { label: txa('Son {v1}', { v1: card.stockLeft }), tone: 'stock' }
  const remaining = formatRemaining(card.availableUntil, now)
  if (remaining) return { label: remaining, tone: 'timer' }
  return null
}

export function newRequestKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
