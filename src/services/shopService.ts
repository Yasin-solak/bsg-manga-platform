import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'
import { txa } from '@/i18n/activeLocale'

/*
 * Shop v3 (shop_*) reader service. All reads and purchases use security definer RPCs;
 * price, discount, bundle ratio and purchasability are calculated on the server (shop_quote).
 */

export const SHOP_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
export type ShopRarity = (typeof SHOP_RARITIES)[number]
export type ShopProductType = 'frame' | 'background' | 'profile_effect' | 'bundle' | 'premium'

const nullableString = z.string().nullable().optional().transform((value) => value ?? null)
// System product texts are Turkish as data; they appear in the active language on screen.
const displayText = z.string().transform((value) => txa(value))
const displayNullable = nullableString.transform((value) => (value ? txa(value) : value))
const nullableNumber = z.number().nullable().optional().transform((value) => value ?? null)

const quoteSchema = z.object({
  listPrice: z.number(),
  price: z.number(),
  source: z.string(),
  discountId: nullableString,
  discountLabel: nullableString,
  // A "with Premium" price for non-Premium users (if the member price is on and cheaper), shop early access for Premium.
  memberPrice: nullableNumber,
  earlyAccess: z.boolean().optional().transform((value) => value ?? false),
  partial: z.boolean(),
  ownedCount: z.number(),
  grantCount: z.number(),
  purchasable: z.boolean(),
  reason: nullableString,
  state: z.string(),
})
export type ShopQuote = z.infer<typeof quoteSchema>

const grantSchema = z.object({
  id: z.string(),
  type: z.string(),
  identifier: z.string(),
  name: displayText,
  imageKey: nullableString,
  assetUrl: nullableString,
  posterUrl: nullableString,
})
export type ShopGrant = z.infer<typeof grantSchema>

const cardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: z.enum(['cosmetic', 'bundle', 'premium']),
  type: z.enum(['frame', 'background', 'profile_effect', 'bundle', 'premium']),
  title: displayNullable,
  subtitle: displayNullable,
  rarity: z.enum(SHOP_RARITIES),
  cover: nullableString,
  locked: z.boolean(),
  seasonSlug: nullableString,
  seasonName: nullableString,
  availableFrom: nullableString,
  availableUntil: nullableString,
  stockLeft: nullableNumber,
  premiumDays: nullableNumber,
  tags: z.array(z.string()).default([]),
  wished: z.boolean(),
  quote: quoteSchema,
  grants: z.array(grantSchema).default([]),
})
export type ShopCard = z.infer<typeof cardSchema>

const walletSchema = z.object({
  balance: z.number(),
  isPremium: z.boolean(),
  premiumExpiresAt: nullableString,
}).nullable().optional().transform((value) => value ?? null)
export type ShopWallet = z.infer<typeof walletSchema>

const seasonSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: displayText,
  tagline: nullableString,
  accent: nullableString,
  banner: nullableString,
  bannerMobile: nullableString,
  startsAt: z.string(),
  endsAt: z.string(),
  live: z.boolean(),
  productCount: z.number(),
  grantCount: z.number(),
  ownedCount: z.number(),
  description: displayNullable,
})
export type ShopSeasonSummary = z.infer<typeof seasonSummarySchema>

const campaignSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: displayText,
  kind: z.string(),
  headline: nullableString,
  body: nullableString,
  banner: nullableString,
  bannerMobile: nullableString,
  focus: z.enum(['left', 'center', 'right']).catch('center'),
  startsAt: z.string(),
  endsAt: z.string(),
  reminded: z.boolean(),
  season: z.object({ slug: z.string(), name: z.string(), accent: nullableString }).nullable().optional().transform((value) => value ?? null),
  products: z.array(cardSchema).default([]),
})
export type ShopCampaign = z.infer<typeof campaignSchema>

const storefrontSchema = z.object({
  hero: campaignSchema.nullable(),
  rows: z.array(campaignSchema),
  comingSoon: z.array(campaignSchema),
  dailyDeal: z.object({ percent: z.number(), endsAt: z.string(), card: cardSchema }).nullable(),
  newArrivals: z.array(cardSchema),
  topSellers: z.array(z.object({ rank: z.number(), card: cardSchema })),
  seasons: z.array(seasonSummarySchema),
  premium: cardSchema.nullable(),
  wallet: walletSchema,
})
export type ShopStorefront = z.infer<typeof storefrontSchema>

const catalogSchema = z.object({
  total: z.number(),
  items: z.array(cardSchema),
  typeCounts: z.record(z.number()).default({}),
  seasons: z.array(z.object({ slug: z.string(), name: z.string() })).default([]),
  wallet: walletSchema,
})
export type ShopCatalog = z.infer<typeof catalogSchema>

const productSchema = z.object({
  card: cardSchema,
  description: displayNullable,
  hero: nullableString,
  giftable: z.boolean(),
  bundleMode: z.enum(['proportional', 'fixed', 'exclusive']),
  audience: z.enum(['everyone', 'premium', 'reward_only']),
  reminded: z.boolean(),
  season: seasonSummarySchema.nullable(),
  owners: nullableNumber,
  parts: z.array(z.object({ itemId: z.string(), owned: z.boolean(), product: cardSchema.nullable() })),
  bundles: z.array(cardSchema),
  related: z.array(cardSchema),
  wallet: walletSchema,
})
export type ShopProduct = z.infer<typeof productSchema>

const seasonPageSchema = z.object({
  season: seasonSummarySchema,
  drops: z.array(z.object({ startsAt: z.string(), state: z.enum(['live', 'upcoming']), items: z.array(cardSchema) })),
  bundles: z.array(cardSchema),
  wallet: walletSchema,
})
export type ShopSeasonPage = z.infer<typeof seasonPageSchema>

const purchaseSchema = z.object({
  orderId: z.string(),
  orderCode: z.string(),
  paid: z.number(),
  balance: z.number(),
  granted: z.array(z.object({ id: z.string(), type: z.string(), identifier: z.string() })),
  premiumExpiresAt: nullableString,
  idempotentReplay: z.boolean(),
})
export type ShopPurchaseResult = z.infer<typeof purchaseSchema>

export class ShopError extends Error {}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, label: string): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ShopError(txa('Magaza verisi okunamadi ({v1}).', { v1: label }))
  }
  return parsed.data
}

// A purchase can take longer; on timeout the request key stays the same, so a retry
// does not create a double order (the server returns the first result).
async function call<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T, z.ZodTypeDef, unknown>, timeoutMs?: number): Promise<T> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(fn, args), signal),
    { label: `shop.${fn}`, timeoutMs },
  )
  if (error) throw new ShopError(error.message)
  return parse(schema, data, fn)
}

export function fetchShopStorefront() {
  return call('shop_storefront', {}, storefrontSchema)
}

export interface ShopCatalogQuery {
  type?: ShopProductType | null
  rarity?: ShopRarity | null
  season?: string | null
  sort?: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'popular'
  filters?: Array<'unowned' | 'sale' | 'limited' | 'wishlist'>
  maxPrice?: number | null
  search?: string | null
  limit?: number
  offset?: number
}

export function fetchShopCatalog(query: ShopCatalogQuery = {}) {
  return call('shop_catalog', {
    p_type: query.type ?? null,
    p_rarity: query.rarity ?? null,
    p_season: query.season ?? null,
    p_sort: query.sort ?? 'featured',
    p_filters: query.filters ?? [],
    p_max_price: query.maxPrice ?? null,
    p_search: query.search ?? null,
    p_limit: query.limit ?? 48,
    p_offset: query.offset ?? 0,
  }, catalogSchema)
}

export async function fetchShopProduct(slug: string) {
  return call('shop_product', { p_slug: slug }, productSchema.nullable())
}

export async function fetchShopSeason(slug: string) {
  return call('shop_season', { p_slug: slug }, seasonPageSchema.nullable())
}

export function quoteShopProduct(productId: string, recipientUserId?: string | null) {
  return call('shop_quote', { p_product_id: productId, p_recipient_user_id: recipientUserId ?? null }, quoteSchema)
}

export function purchaseShopProduct(input: { productId: string, requestKey: string, recipientUserId?: string | null, message?: string | null }) {
  return call('shop_purchase', {
    p_product_id: input.productId,
    p_request_key: input.requestKey,
    p_recipient_user_id: input.recipientUserId ?? null,
    p_gift_message: input.message ?? null,
  }, purchaseSchema, 20_000)
}

const navSignalSchema = z.object({
  campaign: z.object({ title: z.string(), kind: z.string(), endsAt: z.string() }).nullable().optional().transform((value) => value ?? null),
  season: z.object({ name: z.string(), endsAt: z.string() }).nullable().optional().transform((value) => value ?? null),
  discountPercent: nullableNumber,
  discountEndsAt: nullableString,
  dealPercent: nullableNumber,
  dealEndsAt: nullableString,
})
export type ShopNavSignal = z.infer<typeof navSignalSchema>

/** Sidebar Magaza butonu: canli kampanya / sezon / indirim / gunun firsati (hafif sorgu). */
export function fetchShopNavSignal() {
  return call('shop_nav_signal', {}, navSignalSchema)
}

const premiumExpressionSchema = z.object({
  id: z.string(),
  assetKind: z.enum(['emoji', 'sticker']),
  assetRef: z.string(),
  label: z.string(),
  presentation: z.unknown().optional(),
  fansubName: z.string(),
  fansubSlug: z.string().nullable().optional().transform((value) => value ?? null),
})
export type PremiumShowcaseExpression = z.infer<typeof premiumExpressionSchema>

/** Premium page: a selection of real emoji / stickers uploaded by fansubs. */
export function fetchPremiumShowcaseExpressions(limit = 12) {
  return call('premium_showcase_expressions', { p_limit: limit }, z.array(premiumExpressionSchema))
}

export function toggleShopWishlist(productId: string) {
  return call('shop_toggle_wishlist', { p_product_id: productId }, z.boolean())
}

export function toggleShopReminder(kind: 'product' | 'campaign', id: string) {
  return call('shop_toggle_reminder', { p_target_kind: kind, p_target_id: id }, z.boolean())
}
