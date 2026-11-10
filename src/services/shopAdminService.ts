import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'
import type { ShopGrant, ShopProductType, ShopRarity } from '@/services/shopService'
import { txa } from '@/i18n/activeLocale'

/* Shop Control (admin) service: all calls are shop_admin_* RPCs (the server checks admin). */

export type ShopStatus = 'draft' | 'published' | 'archived'
export type ShopProductState = 'draft' | 'archived' | 'upcoming' | 'live' | 'ended' | 'sold_out'
export type ShopIssue = { code: string, level: 'error' | 'warn', lo?: number, hi?: number }

export interface ShopAdminProduct {
  id: string
  slug: string
  kind: 'cosmetic' | 'bundle' | 'premium'
  type: ShopProductType
  title: string
  subtitle: string | null
  description: string | null
  rarity: ShopRarity
  basePrice: number
  status: ShopStatus
  state: ShopProductState
  availableFrom: string | null
  availableUntil: string | null
  audience: 'everyone' | 'premium' | 'reward_only'
  stockLimit: number | null
  soldCount: number
  seasonId: string | null
  seasonName: string | null
  cover: string | null
  hero: string | null
  premiumDays: number | null
  bundleMode: 'proportional' | 'fixed' | 'exclusive'
  giftable: boolean
  hideUntilLaunch: boolean
  tags: string[]
  sortWeight: number
  updatedAt: string
  createdAt: string
  grants: ShopGrant[]
  orders: number
  revenue: number
  campaigns: Array<{ id: string, name: string, status: ShopStatus }>
  issues: ShopIssue[]
}

export interface ShopAdminCosmetic {
  id: string
  type: string
  identifier: string
  name: string
  imageKey: string | null
  assetUrl: string | null
  posterUrl: string | null
  legacyPrice: number
  createdAt: string
  owners: number
  products: Array<{ id: string, title: string, kind: string, status: ShopStatus }>
}

export interface ShopAdminSeason {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  accent: string | null
  banner: string | null
  bannerMobile: string | null
  startsAt: string
  endsAt: string
  status: ShopStatus
  state: string
  productCount: number
}

export interface ShopAdminCampaign {
  id: string
  slug: string
  name: string
  kind: 'launch' | 'sale' | 'limited' | 'premium_month' | 'event'
  headline: string | null
  body: string | null
  banner: string | null
  bannerMobile: string | null
  focus: 'left' | 'center' | 'right'
  seasonId: string | null
  startsAt: string
  endsAt: string
  placements: Array<'hero' | 'collection_row' | 'coming_soon'>
  notifyOnStart: boolean
  status: ShopStatus
  state: string
  products: Array<{ id: string, title: string, type: ShopProductType, cover: string | null, price: number, state: ShopProductState }>
}

export interface ShopAdminDiscount {
  id: string
  name: string
  scope: 'product' | 'type' | 'rarity' | 'season' | 'all'
  productIds: string[]
  targetType: string | null
  targetRarity: ShopRarity | null
  seasonId: string | null
  excludeSeasonal: boolean
  discountType: 'percent' | 'fixed_price'
  value: number
  audience: 'everyone' | 'premium'
  startsAt: string | null
  endsAt: string | null
  status: ShopStatus
  state: string
}

export interface ShopAdminSettings {
  purchases_enabled: boolean
  daily_deal_enabled: boolean
  daily_deal_percent: number
  daily_deal_min_rarity: ShopRarity
  rarity_bands: Record<ShopRarity, [number, number]>
  refund_window_hours: number
  updated_at: string
}

export interface ShopAdminPremiumPerk {
  key: string
  enabled: boolean
  config: Record<string, unknown>
  updatedAt: string | null
}

export interface ShopAdminMerch {
  seasons: ShopAdminSeason[]
  campaigns: ShopAdminCampaign[]
  discounts: ShopAdminDiscount[]
  dailyDeals: Array<{ day: string, productId: string | null, percent: number | null, title: string | null, override: boolean }>
  settings: ShopAdminSettings
}

export interface ShopAdminOverview {
  kpis: Record<'products' | 'live' | 'upcoming' | 'drafts' | 'archived' | 'orders7d' | 'coins7d' | 'buyers7d' | 'ordersTotal' | 'coinsAllTime' | 'activePremium', number>
  productIssues: Array<{ id: string, title: string, state: ShopProductState, issues: ShopIssue[] }>
  warnings: { noHero: boolean, heroConflicts: Array<{ a: string, b: string }>, bandWarnings: number }
  upcoming: Array<{ kind: 'campaign' | 'season' | 'discount' | 'product', id: string, title: string, at: string, type: string }>
  recentOrders: Array<{ id: string, code: string, title: string, paid: number, status: string, isGift: boolean, createdAt: string, buyer: string, buyerAvatar: string | null, recipient: string }>
  dailyCoins: Array<{ day: string, coins: number, orders: number }>
  spendMix: Array<{ source: string, coins: number }>
}

export interface ShopAdminOrder {
  id: string
  code: string
  title: string
  kind: string
  productId: string | null
  listPrice: number
  paid: number
  source: string
  isGift: boolean
  message: string | null
  status: 'completed' | 'refunded'
  createdAt: string
  refundedAt: string | null
  refundReason: string | null
  granted: Array<{ id: string, type: string, identifier: string }>
  premiumDays: number | null
  buyer: { id: string, username: string, avatar: string | null }
  recipient: { id: string, username: string, avatar: string | null }
}

export interface ShopAdminWallet {
  matches: Array<{ id: string, username: string, avatar: string | null, balance: number }>
  user: null | {
    id: string
    username: string
    displayName: string | null
    avatar: string | null
    balance: number
    premiumExpiresAt: string | null
    orders: number
    refunds: number
    history: Array<{ at: string, kind: string, entry: string, amount: number, balanceAfter: number | null, note: string | null }>
  }
}

export interface ShopAdminEconomy {
  days: number
  sources: Array<{ key: string, amount: number }>
  totalIn: number
  sinks: Array<{ key: string, amount: number }>
  totalOut: number
  circulation: number
  holders: number
  median: number
  earners: number
  dailyEarnPerEarner: number
  bands: Record<ShopRarity, [number, number]>
  outOfBand: Array<{ id: string, title: string, rarity: ShopRarity, price: number }>
}

// Responses are produced on the server; only the skeleton is validated here (so an empty / unexpected response
// does not silently reach the screen), and field types are carried by TypeScript interfaces.
const listShape = z.array(z.object({}).passthrough())
const objectShape = z.object({}).passthrough()
const idShape = z.string()
const numberShape = z.number()
const voidShape = z.unknown()

async function rpc<T>(fn: string, args: Record<string, unknown>, shape: z.ZodTypeAny): Promise<T> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(fn, args), signal),
    { label: `shopAdmin.${fn}`, timeoutMs: 20_000 },
  )
  if (error) throw new Error(error.message)
  const parsed = shape.safeParse(data)
  if (!parsed.success) throw new Error(txa('Magaza Kontrol yaniti okunamadi ({v1}).', { v1: fn }))
  return parsed.data as T
}

export const shopAdmin = {
  overview: () => rpc<ShopAdminOverview>('shop_admin_overview', {}, objectShape),
  products: (filter = 'all', search: string | null = null) => rpc<ShopAdminProduct[]>('shop_admin_products', { p_filter: filter, p_search: search }, listShape),
  product: (id: string) => rpc<ShopAdminProduct>('shop_admin_product', { p_product_id: id }, objectShape),
  saveProduct: (payload: Record<string, unknown>) => rpc<string>('shop_admin_save_product', { p: payload }, idShape),
  bulkProducts: (ids: string[], action: string, value: Record<string, unknown> = {}) => rpc<number>('shop_admin_bulk_products', { p_ids: ids, p_action: action, p_value: value }, numberShape),
  cosmetics: (search: string | null = null, type: string | null = null) => rpc<ShopAdminCosmetic[]>('shop_admin_cosmetics', { p_search: search, p_type: type }, listShape),
  createCosmetic: (payload: Record<string, unknown>) => rpc<string>('shop_admin_create_cosmetic', { p: payload }, idShape),
  merch: () => rpc<ShopAdminMerch>('shop_admin_merch', {}, objectShape),
  saveSeason: (payload: Record<string, unknown>) => rpc<string>('shop_admin_save_season', { p: payload }, idShape),
  saveCampaign: (payload: Record<string, unknown>) => rpc<string>('shop_admin_save_campaign', { p: payload }, idShape),
  saveDiscount: (payload: Record<string, unknown>) => rpc<string>('shop_admin_save_discount', { p: payload }, idShape),
  setStatus: (kind: 'product' | 'season' | 'campaign' | 'discount', id: string, status: ShopStatus) => rpc<null>('shop_admin_set_status', { p_kind: kind, p_id: id, p_status: status }, voidShape),
  remove: (kind: 'product' | 'season' | 'campaign' | 'discount', id: string) => rpc<null>('shop_admin_delete', { p_kind: kind, p_id: id }, voidShape),
  simulate: (productId: string, at: string, premium: boolean) => rpc<{ final: number, candidates: Array<{ source: string, discountId: string | null, label: string | null, price: number, applied: boolean }> }>('shop_admin_simulate', { p_product_id: productId, p_at: at, p_premium: premium }, objectShape),
  setDailyDeal: (day: string, productId: string | null, percent: number | null) => rpc<null>('shop_admin_set_daily_deal', { p_day: day, p_product_id: productId, p_percent: percent }, voidShape),
  saveSettings: (payload: Partial<ShopAdminSettings>) => rpc<null>('shop_admin_save_settings', { p: payload }, voidShape),
  premiumPerks: () => rpc<ShopAdminPremiumPerk[]>('shop_admin_premium_perks', {}, listShape),
  savePremiumPerk: (key: string, enabled: boolean, config: Record<string, number> = {}) => rpc<null>('shop_admin_save_premium_perk', { p_key: key, p_enabled: enabled, p_config: config }, voidShape),
  orders: (search: string | null = null, status: string | null = null) => rpc<ShopAdminOrder[]>('shop_admin_orders', { p_search: search, p_status: status, p_limit: 200 }, listShape),
  refund: (orderId: string, reason: string) => rpc<{ orderCode: string, refunded: number, buyerBalance: number }>('shop_admin_refund_order', { p_order_id: orderId, p_reason: reason }, objectShape),
  wallet: (query: string) => rpc<ShopAdminWallet>('shop_admin_wallet', { p_query: query }, objectShape),
  adjustBalance: (userId: string, amount: number, reason: string) => rpc<number>('shop_admin_adjust_balance', { p_user_id: userId, p_amount: amount, p_reason: reason }, numberShape),
  economy: (days = 30) => rpc<ShopAdminEconomy>('shop_admin_economy', { p_days: days }, objectShape),
}
