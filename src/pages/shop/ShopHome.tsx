import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Bell, BellRinging, CaretLeft, CaretRight, Crown, Lightning } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { PREMIUM_PERKS } from '@/data/premiumPerks'
import { usePremiumPerks } from '@/lib/premiumPerks'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { fetchShopCatalog, fetchShopStorefront, toggleShopReminder, type ShopCampaign, type ShopCard, type ShopSeasonSummary, type ShopStorefront } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { PREMIUM_PERK_ICONS } from './premiumPerkIcons'
import { ShopCountdown } from './ShopCountdown'
import { ShopCardRow, ShopShelf } from './ShopShelf'
import { ShopCardStage } from './ShopShowTile'
import { ShopThumb } from './ShopThumb'
import { discountPercent, formatCoin, formatDateTime, formatDay, formatRemaining, TYPE_LABEL, TYPE_PLURAL, TYPE_SLUG } from './shopFormat'
import { useShopLiveCard } from './shopLive'
import { useShopProductLink } from './shopProductLink'
import { useShopQuery } from './useShopQuery'
import { txa } from '@/i18n/activeLocale'

/*
 * Explore (desktop, inspired by Steam / Discord stores): a tight auto-rotating "Featured"
 * showcase on top (campaign, deal of the day, season, new arrival, Premium), banner collection
 * blocks (a dark island in every theme), shelves by type, on sale, seasons, best sellers /
 * coming soon and a Premium band. No scrolling rows. Surfaces are neutral; color comes from products and banners.
 */

// Profil arka plani satilmaz (urun karari).
const SHELF_TYPES = ['frame', 'profile_effect', 'bundle'] as const

const SHELF_COPY: Record<(typeof SHELF_TYPES)[number], string> = {
  get frame() { return txa('Avatarının etrafında durur; yorumlarda, profilinde ve kartında görünür.') },
  get profile_effect() { return txa('Profil kartını açan herkes için canlı bir sahne.') },
  get bundle() { return txa('Birlikte alınca daha ucuz; sende olan parçalar fiyattan düşülür.') },
}

const CAMPAIGN_KIND: Record<string, string> = {
  get launch() { return txa('Yeni koleksiyon') },
  get sale() { return txa('İndirim') },
  get limited() { return txa('Sınırlı süre') },
  get premium_month() { return txa('Premium ayı') },
  event: 'Etkinlik',
}

const SPOTLIGHT_MS = 8000

type Slide =
  | { key: string, kind: 'campaign', label: string, campaign: ShopCampaign }
  | { key: string, kind: 'deal', label: string, card: ShopCard, percent: number, endsAt: string }
  | { key: string, kind: 'season', label: string, season: ShopSeasonSummary }
  | { key: string, kind: 'product', label: string, card: ShopCard }
  | { key: string, kind: 'premium', label: string, card: ShopCard }

function buildSlides(data: ShopStorefront): Slide[] {
  const slides: Slide[] = []
  if (data.hero) slides.push({ key: `c-${data.hero.id}`, kind: 'campaign', label: data.hero.name, campaign: data.hero })
  if (data.dailyDeal) slides.push({ key: 'deal', kind: 'deal', label: txa('Günün fırsatı'), card: data.dailyDeal.card, percent: data.dailyDeal.percent, endsAt: data.dailyDeal.endsAt })
  // A season whose campaign is in the showcase does not become a second slide.
  const heroSeason = data.hero?.season?.slug ?? null
  for (const season of data.seasons.filter((entry) => entry.live && entry.slug !== heroSeason).slice(0, 2)) slides.push({ key: `s-${season.id}`, kind: 'season', label: season.name, season })
  const fresh = data.newArrivals.find((card) => card.id !== data.dailyDeal?.card.id && !card.locked)
  if (fresh) slides.push({ key: `p-${fresh.id}`, kind: 'product', label: txa('Yeni geldi'), card: fresh })
  if (data.premium) slides.push({ key: 'premium', kind: 'premium', label: txa('Premium'), card: data.premium })
  return slides
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <span className='flex w-fit items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-background'>{children}</span>
}

function PriceLine({ card }: { card: ShopCard }) {
  const percent = discountPercent(card.quote)
  return (
    <span className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
      <span className='text-[22px] font-black tabular-nums leading-none'>{formatCoin(card.quote.price)} <span className='text-[12px] font-bold text-muted-foreground'>{txa('Coin')}</span></span>
      {card.quote.price < card.quote.listPrice && <span className='text-[13px] tabular-nums text-muted-foreground line-through'>{formatCoin(card.quote.listPrice)}</span>}
      {percent > 0 && <span className='rounded-md bg-foreground px-1.5 py-0.5 text-[12px] font-black text-background'>{txa('-%{v1}', { v1: percent })}</span>}
      {card.quote.memberPrice !== null && (
        <span className='flex items-center gap-1 text-[12px] font-semibold text-muted-foreground'><Crown weight='fill' size={12} />{txa('Premium ile')} <b className='tabular-nums text-foreground'>{formatCoin(card.quote.memberPrice)}</b></span>
      )}
    </span>
  )
}

// Solda sahne (koleksiyon afisi ya da urun makul boyutta, ortada); sagda sikica bilgi paneli.
function SpotlightSlide({ slide }: { slide: Slide }) {
  const instanceId = useId()
  const control = useShopLiveCard<HTMLDivElement>(`spotlight:${slide.key}:${instanceId}`)
  const productLink = useShopProductLink()

  let media: React.ReactNode = null
  let info: React.ReactNode = null

  if (slide.kind === 'campaign' || slide.kind === 'season') {
    const banner = resolveStoreAssetUrl(slide.kind === 'campaign' ? slide.campaign.banner : slide.season.banner)
    const products = slide.kind === 'campaign' ? slide.campaign.products : []
    const target = slide.kind === 'season'
      ? `/magaza/sezon/${slide.season.slug}`
      : slide.campaign.season ? `/magaza/sezon/${slide.campaign.season.slug}` : products[0] ? productLink(products[0].slug) : '/magaza/katalog'
    const endsAt = slide.kind === 'campaign' ? slide.campaign.endsAt : slide.season.endsAt
    media = banner
      ? <img src={banner} alt='' className='absolute inset-0 size-full object-cover object-[72%_50%]' />
      : <span className='absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,color-mix(in_oklch,var(--foreground)_10%,transparent),transparent_60%)]' />
    info = (
      <>
        <Kicker>{slide.kind === 'season' ? txa('Sezon') : CAMPAIGN_KIND[slide.campaign.kind] ?? txa('Koleksiyon')}</Kicker>
        <h2 className='text-[26px] font-black leading-[1.02] tracking-[-0.02em]'>{slide.kind === 'campaign' ? slide.campaign.headline ?? slide.campaign.name : slide.season.name}</h2>
        {(slide.kind === 'campaign' ? slide.campaign.body : slide.season.tagline) && (
          <p className='line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground'>{slide.kind === 'campaign' ? slide.campaign.body : slide.season.tagline}</p>
        )}
        {products.length > 0 && (
          <div className='flex gap-2'>
            {products.slice(0, 5).map((card) => (
              <Link key={card.id} to={productLink(card.slug)} className='overflow-hidden rounded-lg ring-1 ring-border/70 transition hover:ring-foreground/40' aria-label={card.title ?? TYPE_LABEL[card.type]}>
                <ShopThumb card={card} className='size-11' fit='contain' />
              </Link>
            ))}
          </div>
        )}
        <div className='flex items-center gap-3 pt-1'>
          <Link to={target} className='flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-[13.5px] font-extrabold text-background'>
            {slide.kind === 'season' ? txa('Sezonu keşfet') : txa('Koleksiyonu gör')}<ArrowRight weight='bold' size={13} />
          </Link>
          {formatRemaining(endsAt) && <span className='text-[12.5px] font-semibold text-muted-foreground'>{txa('Bitmesine')} <b className='text-foreground'>{formatRemaining(endsAt)}</b></span>}
        </div>
      </>
    )
  } else {
    const card = slide.card
    const wide = card.kind === 'bundle'
    media = slide.kind === 'premium'
      ? <ShopCardStage card={card} live={control.live} playSession={control.playSession} size='hero' />
      : (
        <>
          <span aria-hidden className='absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_60%)]' />
          <div className='absolute inset-0 flex items-center justify-center'>
            {/* Urun karttaki olcusunde: buyutulmez, sahnenin ortasinda durur. */}
            <div className={cn('relative', wide ? 'h-[200px] w-[420px]' : 'size-[210px]')}>
              <ShopCardStage card={card} live={control.live} playSession={control.playSession} size={wide ? 'wide' : 'tall'} />
            </div>
          </div>
        </>
      )
    const href = slide.kind === 'premium' ? '/magaza/premium' : productLink(card.slug)
    info = (
      <>
        <Kicker>
          {slide.kind === 'deal' ? <><Lightning weight='fill' size={12} />{txa('Günün fırsatı')}</> : slide.kind === 'premium' ? <><Crown weight='fill' size={12} />{txa('Premium')}</> : txa('Yeni geldi')}
        </Kicker>
        <h2 className='text-[26px] font-black leading-[1.02] tracking-[-0.02em]'>{slide.kind === 'premium' ? txa('Profilin, bir üst seviye.') : card.title ?? TYPE_LABEL[card.type]}</h2>
        <p className='line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground'>
          {slide.kind === 'premium'
            ? txa('{v1} gün boyunca Premium ayrıcalıkları. Solda adın Premium ile böyle görünür.', { v1: card.premiumDays ?? 30 })
            : slide.kind === 'deal'
              ? `${TYPE_LABEL[card.type]}. ${txa('Her gece yarısı başka bir parça indirime girer.')}`
              : `${TYPE_LABEL[card.type]}${card.seasonName ? ` · ${card.seasonName}` : ''}. ${txa('Üzerine gel, canlı gör.')}`}
        </p>
        <PriceLine card={card} />
        <div className='flex flex-wrap items-center gap-3 pt-1'>
          <Link to={href} className='flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-[13.5px] font-extrabold text-background'>
            {slide.kind === 'premium' ? txa('Premium’u keşfet') : txa('İncele')}<ArrowRight weight='bold' size={13} />
          </Link>
          {slide.kind === 'deal' && <span className='flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground'>{txa('Bitmesine')} <ShopCountdown target={slide.endsAt} compact className='font-black text-foreground' /></span>}
        </div>
      </>
    )
  }

  return (
    <div className='grid h-full grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]'>
      <div ref={control.ref} {...control.handlers} className='relative isolate overflow-hidden bg-foreground/[0.03]' data-live={control.live ? 'true' : 'false'}>
        {media}
      </div>
      <div className='flex min-w-0 flex-col justify-center gap-3 border-l border-border/60 px-6 pb-10 pt-6'>{info}</div>
    </div>
  )
}

function ShopSpotlight({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count])

  useEffect(() => {
    if (paused || count < 2) return undefined
    const timer = window.setTimeout(() => go(index + 1), SPOTLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [count, go, index, paused])

  if (count === 0) return null
  const slide = slides[Math.min(index, count - 1)]

  return (
    <section
      className='relative h-[288px] overflow-hidden rounded-[20px] border border-border/70 bg-card'
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription='carousel'
      aria-label={txa('Öne çıkanlar')}
      data-testid='shop-hero'
    >
      <div key={slide.key} className='h-full animate-in fade-in duration-500' aria-live='polite'>
        <SpotlightSlide slide={slide} />
      </div>
      {count > 1 && (
        <div className='absolute bottom-4 right-6 flex items-center gap-1' role='tablist' aria-label={txa('Öne çıkan seç')}>
          <button type='button' onClick={() => go(index - 1)} aria-label={txa('Önceki')} className='flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground'><CaretLeft weight='bold' size={13} /></button>
          {slides.map((entry, slideIndex) => (
            <button
              key={entry.key}
              type='button'
              role='tab'
              aria-selected={slideIndex === index}
              aria-label={entry.label}
              title={entry.label}
              onClick={() => go(slideIndex)}
              className={cn('h-1.5 rounded-full transition-all', slideIndex === index ? 'w-5 bg-foreground' : 'w-1.5 bg-foreground/25 hover:bg-foreground/50')}
            />
          ))}
          <button type='button' onClick={() => go(index + 1)} aria-label={txa('Sonraki')} className='flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground'><CaretRight weight='bold' size={13} /></button>
        </div>
      )}
    </section>
  )
}

// Steam collection block: the banner is dark so the block is a "dark island" in every theme (cards included);
// name / description / time on the left, a non-scrolling card row on the right (as many as fit, the rest in See all).
function CollectionBlock({ campaign }: { campaign: ShopCampaign }) {
  const banner = resolveStoreAssetUrl(campaign.banner)
  const remaining = formatRemaining(campaign.endsAt)
  const productLink = useShopProductLink()
  const target = campaign.season ? `/magaza/sezon/${campaign.season.slug}` : campaign.products[0] ? productLink(campaign.products[0].slug) : '/magaza/katalog'
  return (
    <section className='dark relative isolate overflow-hidden rounded-[20px] border border-border bg-card text-foreground' data-shop-collection={campaign.slug}>
      {banner && <img src={banner} alt='' className='absolute inset-0 -z-20 size-full object-cover object-[75%_50%]' />}
      <span aria-hidden className='absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--card)_0%,color-mix(in_oklch,var(--card)_88%,transparent)_30%,color-mix(in_oklch,var(--card)_45%,transparent)_62%,color-mix(in_oklch,var(--card)_70%,transparent)_100%)]' />
      <div className='grid grid-cols-[minmax(220px,260px)_minmax(0,1fr)] items-center gap-6 p-6'>
        <div className='flex flex-col gap-2.5'>
          <span className='text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground'>{CAMPAIGN_KIND[campaign.kind] ?? txa('Koleksiyon')}</span>
          <h2 className='text-[24px] font-black leading-[1.05] tracking-[-0.02em]'>{campaign.headline ?? campaign.name}</h2>
          {campaign.body && <p className='line-clamp-3 text-[13px] leading-relaxed text-muted-foreground'>{campaign.body}</p>}
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2 pt-1'>
            <Link to={target} className='flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13px] font-extrabold text-background'>
              {txa('Tümünü gör ({count})', { count: campaign.products.length })}<ArrowRight weight='bold' size={12} />
            </Link>
            {remaining && <span className='text-[12px] font-semibold text-muted-foreground'>{txa('Ayrılmasına')} <b className='text-foreground'>{remaining}</b></span>}
          </div>
        </div>
        <ShopCardRow cards={campaign.products} minTile={170} />
      </div>
    </section>
  )
}

// Sezon karti da afisli: her temada koyu ada.
function SeasonTile({ season }: { season: ShopSeasonSummary }) {
  const banner = resolveStoreAssetUrl(season.banner)
  return (
    <Link to={`/magaza/sezon/${season.slug}`} className='dark group relative isolate flex h-[150px] flex-col justify-end overflow-hidden rounded-[18px] border border-border bg-card p-5 text-foreground'>
      {banner && <img src={banner} alt='' className='absolute inset-0 -z-20 size-full object-cover object-[72%_50%] transition-transform duration-500 group-hover:scale-105' />}
      <span aria-hidden className='absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--card)_0%,color-mix(in_oklch,var(--card)_70%,transparent)_45%,transparent_100%)]' />
      <span className='text-[11px] font-extrabold uppercase tracking-[0.12em]' style={{ color: season.accent ?? undefined }}>
        {season.live ? `${formatDay(season.endsAt)} bitiyor` : txa('{v1} başlıyor', { v1: formatDay(season.startsAt) })}
      </span>
      <span className='mt-1 text-[22px] font-black tracking-tight'>{season.name}</span>
      {season.grantCount > 0 && <span className='mt-0.5 text-[12.5px] font-semibold text-muted-foreground'>{txa('{owned}/{total} parça sende', { owned: season.ownedCount, total: season.grantCount })}</span>}
    </Link>
  )
}

function ComingSoon({ campaign }: { campaign: ShopCampaign }) {
  const { currentUser } = useAuth()
  const [reminded, setReminded] = useState(campaign.reminded)
  const toggle = async () => {
    if (!currentUser) { toast.info(txa('Hatırlatma için giriş yapmalısın.')); return }
    try {
      const next = await toggleShopReminder('campaign', campaign.id)
      setReminded(next)
      if (next) toast.success(txa('Başladığında haber vereceğiz.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Hatırlatma kaydedilemedi.'))
    }
  }
  return (
    <li className='flex items-center gap-3 py-3'>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[14px] font-bold'>{campaign.headline ?? campaign.name}</span>
        <span className='block text-[12px] text-muted-foreground'>{formatDateTime(campaign.startsAt)}</span>
      </span>
      <button type='button' onClick={() => { void toggle() }} aria-pressed={reminded} className={cn('flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold', reminded ? 'bg-foreground text-background' : 'bg-accent')}>
        {reminded ? <BellRinging weight='fill' size={14} /> : <Bell size={14} />}{reminded ? txa('Hatırlatılacak') : txa('Haber ver')}
      </button>
    </li>
  )
}

function RowHead({ title, action }: { title: string, action?: { label: string, to: string } }) {
  return (
    <div className='flex items-center gap-3'>
      <h2 className='flex-none text-[15px] font-black uppercase tracking-[0.08em]'>{title}</h2>
      {action && <Link to={action.to} className='flex h-6 flex-none items-center rounded-md bg-foreground/[0.08] px-2 text-[12px] font-bold text-foreground/80 hover:bg-foreground/15'>{action.label}</Link>}
      <span aria-hidden className='h-px flex-1 bg-border/70' />
    </div>
  )
}

// Like Nitro: Premium's enabled perks, price and one CTA.
function PremiumBand({ card }: { card: ShopCard }) {
  const perks = usePremiumPerks()
  const active = PREMIUM_PERKS.filter((perk) => perks.isEnabled(perk.key)).slice(0, 6)
  const memberPercent = perks.isEnabled('member_pricing') ? perks.value('member_pricing') : null
  return (
    <section className='relative isolate overflow-hidden rounded-[24px] border border-border/70 bg-card' data-shop-premium-band>
      <Crown weight='fill' aria-hidden size={260} className='absolute -right-10 -top-16 -z-10 text-foreground/[0.04]' />
      <div className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8 p-8'>
        <div className='flex min-w-0 flex-col gap-4'>
          <Kicker><Crown weight='fill' size={12} />{txa('Premium')}</Kicker>
          <h2 className='text-[32px] font-black leading-[1] tracking-[-0.02em]'>{txa('Daha fazlasının kilidini aç.')}</h2>
          {memberPercent && <p className='text-[14px] text-foreground/75'>{txa('Premium üyeler mağazadaki her şeyi')} <b className='text-foreground'>{txa('%{v1} daha ucuza', { v1: memberPercent })}</b> {txa('alır.')}</p>}
          <ul className='flex flex-wrap gap-2'>
            {active.map((perk) => {
              const PerkIcon = PREMIUM_PERK_ICONS[perk.key]
              return (
                <li key={perk.key} className='flex h-9 items-center gap-2 rounded-full bg-foreground/[0.07] px-3.5 text-[13px] font-semibold'>
                  <PerkIcon weight='fill' size={15} />{perk.label}
                </li>
              )
            })}
          </ul>
        </div>
        <div className='flex flex-col items-end gap-3'>
          <span className='flex items-baseline gap-1.5'>
            <span className='text-[30px] font-black tabular-nums leading-none'>{formatCoin(card.quote.price)}</span>
            <span className='text-[13px] font-bold text-muted-foreground'>{txa('Coin / {v1} gün', { v1: card.premiumDays ?? 30 })}</span>
          </span>
          <Link to='/magaza/premium' className='flex h-12 items-center gap-2 rounded-xl bg-foreground px-6 text-[14.5px] font-extrabold text-background'>
            {txa('Premium’u keşfet')}<ArrowRight weight='bold' size={15} />
          </Link>
        </div>
      </div>
    </section>
  )
}

export function ShopHome() {
  const { data, loading, error, reload } = useShopQuery('storefront', fetchShopStorefront)
  const catalog = useShopQuery('shop-home-catalog', () => fetchShopCatalog({ limit: 96, sort: 'newest' }))
  const productLink = useShopProductLink()

  const shelves = useMemo(() => {
    const items = catalog.data?.items ?? []
    return SHELF_TYPES.map((type) => ({ type, cards: items.filter((card) => card.type === type) })).filter((shelf) => shelf.cards.length > 0)
  }, [catalog.data])
  const onSale = useMemo(() => (catalog.data?.items ?? []).filter((card) => card.quote.price < card.quote.listPrice && card.quote.reason !== 'owned'), [catalog.data])
  const slides = useMemo(() => (data ? buildSlides(data) : []), [data])
  // A campaign in the showcase (featured) does not get a second block right below; each collection once.
  const collections = data
    ? data.rows.filter((campaign, index, list) => campaign.products.length > 0 && campaign.id !== data.hero?.id && list.findIndex((entry) => entry.id === campaign.id) === index)
    : []

  if (loading && !data) {
    return (
      <div className='flex flex-col gap-8' aria-busy='true'>
        <div className='h-[392px] animate-pulse rounded-[22px] bg-muted/40' />
        <div className='flex gap-3.5'>{[0, 1, 2, 3, 4].map((key) => <div key={key} className='size-[216px] animate-pulse rounded-xl bg-muted/40' />)}</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className='flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border px-6 py-16 text-center'>
        <span className='font-bold'>{txa('Mağaza yüklenemedi')}</span>
        <span className='text-[13px] text-muted-foreground'>{error}</span>
        <button type='button' onClick={reload} className='rounded-full bg-foreground px-4 py-2 text-[13px] font-bold text-background'>{txa('Tekrar dene')}</button>
      </div>
    )
  }

  return (
    <div className='flex min-w-0 flex-col gap-11' data-testid='shop-home'>
      <ShopSpotlight slides={slides} />

      {collections.map((campaign) => <CollectionBlock key={campaign.id} campaign={campaign} />)}

      {shelves.map((shelf) => (
        <ShopShelf
          key={shelf.type}
          title={TYPE_PLURAL[shelf.type]}
          description={SHELF_COPY[shelf.type]}
          cards={shelf.cards}
          action={{ label: txa('Tümünü gör ({v1})', { v1: catalog.data?.typeCounts[shelf.type] ?? shelf.cards.length }), to: `/magaza/katalog?tur=${TYPE_SLUG[shelf.type]}` }}
        />
      ))}

      {onSale.length > 0 && (
        <ShopShelf title={txa('İndirimdekiler')} description={txa('Fiyatı düşen parçalar; indirimler üst üste binmez, en ucuzu uygulanır.')} cards={onSale} action={{ label: txa('Tümünü gör'), to: '/magaza/katalog?filtre=sale' }} />
      )}

      {data.seasons.length > 0 && (
        <section className='flex flex-col gap-3'>
          <RowHead title={txa('Sezonlar')} />
          <div className='grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4'>{data.seasons.map((season) => <SeasonTile key={season.id} season={season} />)}</div>
        </section>
      )}

      <section className='grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'>
        {data.topSellers.length > 0 && (
          <div className='flex flex-col gap-3'>
            <RowHead title={txa('Bu hafta en çok giyilenler')} action={{ label: txa('Tümünü gör'), to: '/magaza/katalog?sirala=popular' }} />
            <ol className='flex flex-col divide-y divide-border/60 rounded-[18px] border border-border/70 bg-card px-4'>
              {data.topSellers.map(({ rank, card }) => (
                <li key={card.id}>
                  <Link to={productLink(card.slug)} className='flex items-center gap-4 py-3 text-inherit hover:opacity-80'>
                    <span className='w-7 text-center text-[22px] font-black tabular-nums text-muted-foreground'>{rank}</span>
                    <ShopThumb card={card} className='size-12 flex-none rounded-xl' fit='contain' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[14.5px] font-bold'>{card.title}</span>
                      <span className='block text-[12px] text-muted-foreground'>{TYPE_LABEL[card.type]}</span>
                    </span>
                    <span className='text-[14px] font-extrabold tabular-nums'>{formatCoin(card.quote.price)} <span className='text-[11px] font-bold text-muted-foreground'>{txa('Coin')}</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className='flex flex-col gap-3'>
          <RowHead title={txa('Yakında')} />
          <div className='rounded-[18px] border border-border/70 bg-card px-4'>
            {data.comingSoon.length ? (
              <ul className='divide-y divide-border/60'>{data.comingSoon.map((campaign) => <ComingSoon key={campaign.id} campaign={campaign} />)}</ul>
            ) : (
              <p className='py-5 text-[13px] text-muted-foreground'>{txa('Yeni koleksiyon duyurulunca burada görünür; başladığında haber vermemizi isteyebilirsin.')}</p>
            )}
          </div>
        </div>
      </section>

      {data.premium && <PremiumBand card={data.premium} />}
    </div>
  )
}
