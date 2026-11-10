import type { ShopAdminProduct } from '@/services/shopAdminService'
import type { ShopCard, ShopRarity } from '@/services/shopService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Shop Control shared labels, formats and form helpers. */

export type ShopAdminTab = 'overview' | 'products' | 'merch' | 'discounts' | 'bundles' | 'schedule' | 'economy' | 'premium' | 'orders' | 'name-effects'

/** Masa duzenli sekmeler (liste + ayrinti, ekran yuksekligine sabitlenir); bkz. AdminPage DESK_SECTIONS. */
export const SHOP_DESK_TABS: ShopAdminTab[] = ['products', 'bundles', 'orders']

export const INPUT = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-[13.5px] outline-none focus:border-primary/60 disabled:opacity-60'
export const TEXTAREA = 'w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-primary/60'
export const BTN_PRIMARY = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-primary-foreground disabled:opacity-50'
export const BTN_GHOST = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-bold text-foreground disabled:opacity-50'
export const BTN_DANGER = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-500/15 px-4 text-[13px] font-bold text-rose-600 dark:text-rose-300 disabled:opacity-50'

export const STATE_META: Record<string, { label: string, tone: string }> = {
  live: { get label() { return txa('Yayında') }, tone: 'bg-primary/15 text-primary' },
  published: { get label() { return txa('Yayında') }, tone: 'bg-primary/15 text-primary' },
  upcoming: { get label() { return txa('Planlandı') }, tone: 'bg-violet-400/15 text-violet-600 dark:text-violet-300' },
  scheduled: { get label() { return txa('Planlandı') }, tone: 'bg-violet-400/15 text-violet-600 dark:text-violet-300' },
  draft: { get label() { return txa('Taslak') }, tone: 'bg-foreground/10 text-muted-foreground' },
  ended: { get label() { return txa('Bitti') }, tone: 'bg-foreground/5 text-muted-foreground/70' },
  sold_out: { get label() { return txa('Tükendi') }, tone: 'bg-amber-400/15 text-amber-600 dark:text-amber-300' },
  archived: { get label() { return txa('Arşiv') }, tone: 'bg-foreground/5 text-muted-foreground/60' },
  completed: { get label() { return txa('Tamamlandı') }, tone: 'bg-primary/15 text-primary' },
  refunded: { get label() { return txa('İade') }, tone: 'bg-amber-400/15 text-amber-600 dark:text-amber-300' },
}

/** Rarity label and color for admin screens (readable in light and dark themes). */
export const ADMIN_RARITY: Record<ShopRarity, { label: string, ink: string }> = {
  legendary: { get label() { return txa('Efsanevi') }, ink: 'text-amber-600 dark:text-amber-300' },
  epic: { get label() { return txa('Destansı') }, ink: 'text-violet-600 dark:text-violet-300' },
  rare: { get label() { return txa('Nadir') }, ink: 'text-sky-600 dark:text-sky-300' },
  common: { get label() { return txa('Yaygın') }, ink: 'text-muted-foreground' },
}

export const AUDIENCE_LABEL: Record<ShopAdminProduct['audience'], string> = {
  get everyone() { return txa('Herkes') },
  get premium() { return txa('Yalnız Premium') },
  get reward_only() { return txa('Yalnız ödül') },
}

export const CAMPAIGN_KINDS = [
  { value: 'launch', get label() { return txa('Lansman') } },
  { value: 'sale', get label() { return txa('İndirim') } },
  { value: 'limited', get label() { return txa('Sınırlı süre') } },
  { value: 'premium_month', get label() { return txa('Premium ayı') } },
  { value: 'event', get label() { return txa('Etkinlik') } },
] as const

export const PLACEMENTS = [
  { value: 'hero', get label() { return txa('Ana vitrin (tek yuva)') } },
  { value: 'collection_row', get label() { return txa('Koleksiyon rafı') } },
  { value: 'coming_soon', get label() { return txa('Başlamadan "Yakında" rafı') } },
] as const

export const ISSUE_LABEL: Record<string, string> = {
  get no_grants() { return txa('İçerik yok') },
  get bundle_small() { return txa('Pakette tek parça var') },
  get free() { return txa('Ücretsiz ve herkese açık') },
  get no_image() { return txa('Görsel eksik') },
  get band() { return txa('Fiyat bandın dışında') },
  get short_description() { return txa('Açıklama çok kısa') },
}

export const ECONOMY_LABEL: Record<string, string> = {
  get coin_code() { return txa('Coin kodları') },
  get reward_task() { return txa('Görev ödülleri') },
  get reading_streak() { return txa('Okuma serisi') },
  get premium_compensation() { return txa('Premium telafisi') },
  get admin_and_refund() { return txa('Admin düzeltmesi ve iade') },
  get shop_order() { return txa('Mağaza satın alma') },
  get item_purchase_request() { return txa('Eski mağaza satın alma') },
  get item_gift() { return txa('Eski mağaza hediye') },
  package_event: 'Eski paket',
  get premium_gift() { return txa('Eski Premium hediye') },
  get admin_adjustment() { return txa('Admin düzeltmesi') },
  get coin_code_credit() { return txa('Coin kodu') },
}

export function economyLabel(key: string) {
  return ECONOMY_LABEL[key] ?? key
}

export function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(intlLocale())
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

/** ISO -> datetime-local girdisi (yerel saat). */
export function toLocalInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** datetime-local girdisi -> ISO (bos ise null). */
export function fromLocalInput(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' }

export function slugify(value: string, suffix = true) {
  const base = value
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => TR_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 56) || 'urun'
  return suffix ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base
}

/** Yonetim satirindan okur onizleme karti (fiyat = liste fiyati). */
export function toPreviewCard(product: Pick<ShopAdminProduct, 'id' | 'slug' | 'kind' | 'type' | 'title' | 'subtitle' | 'rarity' | 'cover' | 'basePrice' | 'grants' | 'premiumDays'>): ShopCard {
  return {
    id: product.id,
    slug: product.slug,
    kind: product.kind,
    type: product.type,
    title: product.title,
    subtitle: product.subtitle,
    rarity: product.rarity,
    cover: product.cover,
    locked: false,
    seasonSlug: null,
    seasonName: null,
    availableFrom: null,
    availableUntil: null,
    stockLeft: null,
    premiumDays: product.premiumDays,
    tags: [],
    wished: false,
    grants: product.grants,
    quote: {
      listPrice: product.basePrice,
      price: product.basePrice,
      source: 'list',
      discountId: null,
      discountLabel: null,
      memberPrice: null,
      earlyAccess: false,
      partial: false,
      ownedCount: 0,
      grantCount: product.grants.length,
      purchasable: true,
      reason: null,
      state: 'live',
    },
  }
}
