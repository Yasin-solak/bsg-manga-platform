/*
  Magaza v3 okur fixture'lari: shopService zod semalarina (cardSchema, storefrontSchema,
  catalogSchema, productSchema) uyar. Asset referanslari canli R2 magazasindaki gercek dosyalar.
*/

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
type CardType = 'frame' | 'background' | 'profile_effect' | 'bundle' | 'premium'

const DAY = 86_400_000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

export const SHOP_FRAME_ASSETS = [
  { key: 'iskambil', name: 'Iskambil', live: 'store-assets://frames/live/1788898808565-pij38yib.png', poster: 'store-assets://frames/posters/1788898777768-a4dpc4md.webp' },
  { key: 'fermuar', name: 'Fermuar Canavari', live: 'store-assets://frames/live/1789151796475-9cqh5wg2.png', poster: 'store-assets://frames/posters/1789151767556-m5chi2xj.webp' },
  { key: 'ejder', name: 'Harbi Uyuyan Ejder', live: 'store-assets://frames/live/1789151863132-atomok14.png', poster: 'store-assets://frames/posters/1789151846267-f2afp69z.webp' },
  { key: 'panel', name: 'Panel', live: 'store-assets://frames/live/1789151831562-mhygmy6m.png', poster: 'store-assets://frames/posters/1789151819349-mmdx6efv.webp' },
  { key: 'kurbaga', name: 'Ac Kurbaga', live: 'store-assets://frames/live/1789312990387-qcfnzncm.png', poster: 'store-assets://frames/posters/1789312988459-0j58q5x5.webp' },
  { key: 'megumi', name: 'Megumi', live: 'store-assets://frames/live/1780158644481-0l1h10rl.png', poster: 'store-assets://frames/posters/1780158640673-mktq7qa0.webp' },
] as const

export const SHOP_BACKGROUND_SAVAS = 'store-assets://backgrounds/1770981736985-ok2ne8om.mp4'

export const SHOP_EFFECT_ASSETS = [
  { id: 'item-effect-iskeletor', name: 'Iskeletor', card: 'store-assets://profile-effects/card-asset/1783629919381-21ylk5ds.webp', loop: 'store-assets://profile-effects/hover-loop/1783630047171-e1r1qh3t.png' },
  { id: 'item-effect-efet1', name: 'Efet1', card: 'store-assets://profile-effects/card-asset/1782489802194-75ymcd58.webp', loop: 'store-assets://profile-effects/hover-loop/1782491779943-wi4avdg3.png' },
] as const

function quote(price: number, options: Partial<{ listPrice: number, reason: string | null, purchasable: boolean, state: string, ownedCount: number, grantCount: number, source: string, discountLabel: string | null }> = {}) {
  const listPrice = options.listPrice ?? price
  return {
    listPrice,
    price,
    source: options.source ?? (price < listPrice ? 'discount' : 'list'),
    discountId: null,
    discountLabel: options.discountLabel ?? null,
    partial: (options.ownedCount ?? 0) > 0,
    ownedCount: options.ownedCount ?? 0,
    grantCount: options.grantCount ?? 1,
    purchasable: options.purchasable ?? true,
    reason: options.reason ?? null,
    state: options.state ?? 'live',
  }
}

type Grant = { id: string, type: string, identifier: string, name: string, imageKey: null, assetUrl: string | null, posterUrl: string | null }

function card(input: {
  id: string
  type: CardType
  title: string | null
  rarity: Rarity
  grants: Grant[]
  quote: ReturnType<typeof quote>
  kind?: 'cosmetic' | 'bundle' | 'premium'
  locked?: boolean
  cover?: string | null
  availableFrom?: string | null
  availableUntil?: string | null
  stockLeft?: number | null
  premiumDays?: number | null
  wished?: boolean
  seasonName?: string | null
}) {
  return {
    id: input.id,
    slug: input.id,
    kind: input.kind ?? (input.type === 'bundle' ? 'bundle' : input.type === 'premium' ? 'premium' : 'cosmetic'),
    type: input.type,
    title: input.title,
    subtitle: null,
    rarity: input.rarity,
    cover: input.cover ?? null,
    locked: input.locked ?? false,
    seasonSlug: input.seasonName ? 'kis-sezonu' : null,
    seasonName: input.seasonName ?? null,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? null,
    stockLeft: input.stockLeft ?? null,
    premiumDays: input.premiumDays ?? null,
    tags: [],
    wished: input.wished ?? false,
    quote: input.quote,
    grants: input.grants,
  }
}

const frameGrant = (asset: (typeof SHOP_FRAME_ASSETS)[number]): Grant => ({
  id: `item-frame-${asset.key}`, type: 'frame', identifier: `frame-${asset.key}`, name: asset.name, imageKey: null, assetUrl: asset.live, posterUrl: asset.poster,
})
const builtInFrameGrant: Grant = { id: 'item-frame-builtin-2', type: 'frame', identifier: 'avatarframe2', name: 'Klasik Alev', imageKey: null, assetUrl: null, posterUrl: null }
const savasGrant: Grant = { id: 'item-bg-savas', type: 'background', identifier: 'bg-savas', name: 'Savas', imageKey: null, assetUrl: SHOP_BACKGROUND_SAVAS, posterUrl: null }
const neonGrant: Grant = { id: 'item-bg-neon', type: 'background', identifier: 'bg-neon', name: 'Neon Dongu', imageKey: null, assetUrl: '/backgrounds/anime-neon-loop.webm', posterUrl: null }
const effectGrant = (asset: (typeof SHOP_EFFECT_ASSETS)[number]): Grant => ({
  id: asset.id, type: 'profile_effect', identifier: asset.id, name: asset.name, imageKey: null, assetUrl: asset.card, posterUrl: asset.card,
})

const RARITIES: Rarity[] = ['legendary', 'epic', 'rare', 'epic', 'common', 'legendary']

export const frameCards = SHOP_FRAME_ASSETS.map((asset, index) => card({
  id: `cerceve-${asset.key}`,
  type: 'frame',
  title: asset.name,
  rarity: RARITIES[index],
  grants: [frameGrant(asset)],
  quote: index === 1 ? quote(720, { listPrice: 900 }) : index === 4 ? quote(0, { reason: 'owned', purchasable: false }) : quote(450 + index * 120),
  wished: index === 2,
  stockLeft: index === 3 ? 12 : null,
  seasonName: index < 2 ? 'Kis Sezonu' : null,
}))

export const builtInFrameCard = card({ id: 'cerceve-klasik-alev', type: 'frame', title: 'Klasik Alev', rarity: 'rare', grants: [builtInFrameGrant], quote: quote(300) })

export const backgroundCards = [
  card({ id: 'arka-plan-savas', type: 'background', title: 'Savas', rarity: 'legendary', grants: [savasGrant], quote: quote(1200) }),
  card({ id: 'arka-plan-neon', type: 'background', title: 'Neon Dongu', rarity: 'epic', grants: [neonGrant], quote: quote(800, { listPrice: 1000 }) }),
]

export const effectCards = SHOP_EFFECT_ASSETS.map((asset, index) => card({
  id: `efekt-${asset.id}`, type: 'profile_effect', title: asset.name, rarity: index ? 'epic' : 'legendary', grants: [effectGrant(asset)], quote: quote(950 + index * 100),
}))

export const bundleCard = card({
  id: 'paket-kis-savascisi',
  type: 'bundle',
  title: 'Kis Savascisi Paketi',
  rarity: 'legendary',
  grants: [frameGrant(SHOP_FRAME_ASSETS[0]), savasGrant, effectGrant(SHOP_EFFECT_ASSETS[0])],
  quote: quote(1600, { listPrice: 2400, ownedCount: 1, grantCount: 3, source: 'bundle' }),
  seasonName: 'Kis Sezonu',
})

export const premiumCard = card({ id: 'premium-30', type: 'premium', title: 'Premium 30 gun', rarity: 'legendary', grants: [], quote: quote(1500), premiumDays: 30 })

export const lockedCard = card({
  id: 'gizli-cerceve',
  type: 'frame',
  title: null,
  rarity: 'epic',
  grants: [],
  locked: true,
  availableFrom: iso(3 * DAY + 5 * 3_600_000),
  quote: quote(0, { purchasable: false, reason: 'upcoming', state: 'upcoming' }),
})

const premiumMonthProducts = [
  card({ id: 'premium-ay-megumi', type: 'frame', title: 'Megumi (Premium)', rarity: 'legendary', grants: [frameGrant(SHOP_FRAME_ASSETS[5])], quote: quote(0, { purchasable: false, reason: 'premium_only' }) }),
  card({ id: 'premium-ay-efet', type: 'profile_effect', title: 'Efet1 (Premium)', rarity: 'epic', grants: [effectGrant(SHOP_EFFECT_ASSETS[1])], quote: quote(0, { purchasable: false, reason: 'premium_only' }) }),
  card({ id: 'premium-ay-neon', type: 'background', title: 'Neon Dongu (Premium)', rarity: 'epic', grants: [neonGrant], quote: quote(0, { purchasable: false, reason: 'premium_only' }) }),
]

function campaign(id: string, name: string, kind: string, products: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id, slug: id, name, kind, headline: name, body: null, banner: null, bannerMobile: null, focus: 'center',
    startsAt: iso(-DAY), endsAt: iso(6 * DAY), reminded: false, season: null, products, ...extra,
  }
}

const wallet = { balance: 4200, isPremium: false, premiumExpiresAt: null }

export const allCatalogCards = [bundleCard, ...frameCards, builtInFrameCard, ...backgroundCards, ...effectCards, lockedCard]

export const storefront = {
  hero: campaign('kis-savascilari', 'Kis savascilari geldi', 'launch', [bundleCard, frameCards[0], backgroundCards[0]], {
    body: 'Yeni cerceveler, savas arka plani ve iskeletor efekti. Ustune gel, kendi avatarinla canli gor.',
    endsAt: iso(4 * DAY),
  }),
  rows: [
    campaign('one-cikanlar', 'One cikanlar', 'launch', [bundleCard, frameCards[1], effectCards[0], backgroundCards[0], frameCards[2], lockedCard, frameCards[3]]),
    campaign('premium-ayi', 'Bu ayin Premium seti', 'premium_month', premiumMonthProducts),
  ],
  comingSoon: [],
  dailyDeal: { percent: 20, endsAt: iso(10 * 3_600_000), card: frameCards[1] },
  newArrivals: [effectCards[1], frameCards[4], backgroundCards[1], frameCards[5], builtInFrameCard],
  topSellers: [
    { rank: 1, card: frameCards[0] },
    { rank: 2, card: backgroundCards[0] },
    { rank: 3, card: effectCards[0] },
  ],
  seasons: [],
  premium: premiumCard,
  wallet,
}

export const catalog = {
  total: allCatalogCards.length,
  items: allCatalogCards,
  typeCounts: { frame: frameCards.length + 2, background: 2, profile_effect: 2, bundle: 1 },
  seasons: [],
  wallet,
}

export function productFor(slug: string) {
  const found = [...allCatalogCards, premiumCard, ...premiumMonthProducts].find((entry) => entry.slug === slug)
  if (!found) return null
  return {
    card: found,
    description: 'Canli onizleme fixture urunu.',
    hero: null,
    giftable: true,
    bundleMode: 'proportional',
    audience: 'everyone',
    reminded: false,
    season: null,
    owners: 128,
    parts: found.type === 'bundle' ? found.grants.map((grant, index) => ({ itemId: grant.id, owned: index === 0, product: null })) : [],
    bundles: [],
    related: [frameCards[2], backgroundCards[1], effectCards[1], frameCards[3]],
    wallet,
  }
}

export const profileEffectAssetRows = SHOP_EFFECT_ASSETS.map((asset) => ({
  item_id: asset.id,
  poster_asset_url: asset.card,
  modal_backdrop_asset_url: null,
  card_intro_asset_url: null,
  card_loop_asset_url: asset.loop,
  profile_asset_url: asset.card,
  profile_intro_asset_url: null,
  profile_loop_asset_url: asset.loop,
  hover_asset_url: asset.card,
  hover_intro_asset_url: null,
  hover_loop_asset_url: asset.loop,
  media_meta: null,
  effect_manifest: null,
  is_active: true,
  created_at: iso(-10 * DAY),
  updated_at: iso(-10 * DAY),
}))

export const premiumOffer = {
  premium_item: { id: 'premium-item', identifier: 'premium-pass', name: 'Premium', price: 1500 },
  duration_days: 30,
  public_unlock_delay_hours: 36,
}
