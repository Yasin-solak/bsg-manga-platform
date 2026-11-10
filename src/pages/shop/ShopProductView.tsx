import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Link, Navigate, useSearchParams } from '@/i18n/router'
import { ArrowCounterClockwise, Bell, BellRinging, CheckCircle, Gift, Heart, Pause, Play, Sparkle, X } from '@phosphor-icons/react'
import { AvatarFrame } from '@components/common/AvatarFrame'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { fetchShopProduct, toggleShopReminder, toggleShopWishlist, type ShopCard, type ShopGrant, type ShopProduct } from '@/services/shopService'
import { getStoreProfileEffectAssetMap } from '@/services/storeProfileEffectService'
import { toast } from '@/services/toastService'
import { ShopCountdown } from './ShopCountdown'
import { ShopBackgroundStage } from './ShopBackgroundStage'
import { ShopBundleStage } from './ShopBundleStage'
import { ShopShelf } from './ShopShelf'
import { ShopEffectStage } from './ShopEffectStage'
import { ShopFrameStage } from './ShopFrameStage'
import { ShopLockedStage } from './ShopLockedStage'
import { ShopPremiumStage } from './ShopPremiumStage'
import { ShopPrice } from './ShopPrice'
import { ShopThumb } from './ShopThumb'
import { findGrant } from './shopCardLayout'
import { usePrefersReducedMotion } from './shopLive'
import { ShopPurchaseDialog } from './ShopPurchaseDialog'
import { discountPercent, formatCoin, formatDateTime, priceSourceLabel, RARITY_META, reasonLabel, TYPE_LABEL } from './shopFormat'
import { SHOP_PRODUCT_PARAM, shopProductFallbackHref, useCloseShopProduct, useShopProductLink } from './shopProductLink'
import { useShopQuery } from './useShopQuery'
import { intlLocale, txa } from '@/i18n/activeLocale'

type PreviewMode = 'profile' | 'card' | 'comment'

function useEffectAssets(grant: ShopGrant | undefined) {
  const [assets, setAssets] = useState<StoreProfileEffectAssets | null>(null)
  useEffect(() => {
    if (!grant) return undefined
    let cancelled = false
    void getStoreProfileEffectAssetMap([grant.id]).then(({ data }) => { if (!cancelled) setAssets(data.get(grant.id) ?? null) })
    return () => { cancelled = true }
  }, [grant])
  return assets
}

function Media({ src, play, className }: { src?: string, play: boolean, className?: string }) {
  if (!src) return null
  return resolveAssetMediaType(src) === 'video'
    ? <video key={play ? 'play' : 'still'} src={play ? src : `${src}#t=0.1`} muted loop autoPlay={play} playsInline preload='metadata' className={className} />
    : <img src={src} alt='' className={className} />
}

// Large stage: shows the product on the reader's own profile / hover card / comment.
function Stage({ card, mode, hero, live, playSession }: { card: ShopCard, mode: PreviewMode, hero: string | null, live: boolean, playSession: number }) {
  const { currentUser } = useAuth()
  const frame = card.grants.find((grant) => grant.type === 'frame')
  const background = card.grants.find((grant) => grant.type === 'background')
  const effect = card.grants.find((grant) => grant.type === 'profile_effect')
  const effectAssets = useEffectAssets(live ? effect : undefined)
  const backdrop = resolveStoreAssetUrl(background?.assetUrl ?? background?.posterUrl) ?? resolveStoreAssetUrl(hero ?? card.cover)
  const name = currentUser?.displayName || currentUser?.username || txa('Sen')
  const avatar = (size: number) => (
    <AvatarFrame
      src={currentUser?.avatar}
      alt={name}
      frameType={frame?.identifier ?? 'default'}
      size={size}
      customOverlayUrl={resolveStoreAssetUrl(frame?.assetUrl)}
      posterOverlayUrl={resolveStoreAssetUrl(frame?.posterUrl)}
      disableStoreLookup={Boolean(frame)}
      hoverPlayback={frame && live ? 'always' : 'never'}
    />
  )

  if (card.locked || mode === 'profile') {
    return <LiveStage card={card} live={live} playSession={playSession} />
  }

  if (mode === 'card') {
    return (
      <div className='absolute inset-0 flex items-center justify-center p-6'>
        <Media src={backdrop} play={live} className='absolute inset-0 size-full object-cover opacity-30 blur-md' />
        <div className='relative w-[320px] overflow-hidden rounded-[20px] border border-white/15 bg-background/85 shadow-2xl backdrop-blur'>
          <div className='relative h-28 overflow-hidden bg-muted'>
            <Media src={backdrop} play={live} className='size-full object-cover' />
            {live && effectAssets && <ProfileEffectLayer assets={effectAssets} surface='hover' className='absolute inset-0' />}
          </div>
          <div className='flex flex-col gap-2 px-5 pb-5'>
            <div className='-mt-10'>{avatar(88)}</div>
            <span className='text-[18px] font-black'>{name}</span>
            <span className='text-[12px] text-muted-foreground'>{txa('@{v1} · hover kartında böyle görünür', { v1: currentUser?.username ?? 'okur' })}</span>
            <div className='mt-1 grid grid-cols-2 gap-2'><span className='h-8 rounded-lg bg-foreground/80' /><span className='h-8 rounded-lg bg-muted' /></div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'comment') {
    return (
      <div className='absolute inset-0 flex flex-col justify-center gap-3 p-6 sm:p-10'>
        <Media src={backdrop} play={live} className='absolute inset-0 size-full object-cover opacity-20 blur-sm' />
        <div className='relative flex gap-3 rounded-2xl border border-white/10 bg-background/85 p-4 backdrop-blur'>
          <span className='flex-none'>{avatar(56)}</span>
          <span className='flex flex-col gap-1'>
            <b className='text-[14px]'>{name}</b>
            <span className='text-[13.5px] text-foreground/80'>{txa('Bu bölümdeki son sahne tüm seriyi değiştirdi. Herkes okumalı.')}</span>
          </span>
        </div>
        <div className='relative flex gap-3 rounded-2xl border border-white/5 bg-background/60 p-4 opacity-75 backdrop-blur'>
          <span className='size-10 flex-none rounded-full bg-muted' />
          <span className='flex flex-col gap-1'><b className='text-[14px]'>{txa('Başka bir okur')}</b><span className='text-[13.5px] text-foreground/70'>{txa('Kesinlikle katılıyorum.')}</span></span>
        </div>
      </div>
    )
  }

  return null
}

// Profile view: a large version of the cards' live scene (same components, same language).
function LiveStage({ card, live, playSession }: { card: ShopCard, live: boolean, playSession: number }) {
  if (card.locked) return <ShopLockedStage card={card} live={live} />
  const frame = findGrant(card, 'frame')
  const background = findGrant(card, 'background')
  const effect = findGrant(card, 'profile_effect')
  if (card.kind === 'bundle') return <ShopBundleStage card={card} live={live} playSession={playSession} />
  if (card.kind === 'premium') return <ShopPremiumStage days={card.premiumDays} live={live} />
  if (card.type === 'frame' && frame) return <ShopFrameStage grant={frame} live={live} playSession={playSession} scale={0.5} />
  if (card.type === 'background') return <ShopBackgroundStage grant={background} cover={card.cover} live={live} playSession={playSession} />
  if (card.type === 'profile_effect' && effect) return <ShopEffectStage grant={effect} cover={card.cover} live={live} playSession={playSession} cardClassName='h-[94%]' />
  return <ShopBackgroundStage grant={undefined} cover={card.cover} live={false} playSession={0} overlay={false} />
}

function Fact({ label, value }: { label: string, value: string }) {
  return (
    <div className='flex justify-between gap-4 py-2 text-[13px]'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right font-semibold'>{value}</span>
    </div>
  )
}

function ProductBody({ product, onChanged }: { product: ShopProduct, onChanged: () => void }) {
  const { currentUser } = useAuth()
  const { card } = product
  const [mode, setMode] = useState<PreviewMode>('profile')
  // Detay sahnesi kendiliginden canli; hareket azaltma tercihinde oynat dugmesini bekler.
  const reducedMotion = usePrefersReducedMotion()
  const [paused, setPaused] = useState<boolean | null>(null)
  const [playSession, setPlaySession] = useState(1)
  const live = !(paused ?? reducedMotion)
  const [dialog, setDialog] = useState<'self' | 'gift' | null>(null)
  const [wished, setWished] = useState(card.wished)
  const [reminded, setReminded] = useState(product.reminded)
  const rarity = RARITY_META[card.rarity]
  const quote = card.quote
  const percent = discountPercent(quote)
  const sourceLabel = priceSourceLabel(quote)
  const blocked = !quote.purchasable ? reasonLabel(quote.reason) : null
  const balance = currentUser?.stones ?? null
  const modes: Array<[PreviewMode, string]> = card.type === 'frame' || card.kind === 'bundle'
    ? [['profile', txa('Profil')], ['card', txa('Hover kartı')], ['comment', txa('Yorumda')]]
    : [['profile', txa('Profil')], ['card', txa('Hover kartı')]]
  const completeBundle = product.bundles.find((bundle) => bundle.quote.purchasable)
  const productLink = useShopProductLink()

  const requireAuth = (action: string) => {
    if (currentUser) return true
    toast.info(txa('{v1} için giriş yapmalısın.', { v1: action }))
    return false
  }
  const toggleWish = async () => {
    if (!requireAuth(txa('İstek listesi'))) return
    try { setWished(await toggleShopWishlist(card.id)) } catch (error) { toast.error(error instanceof Error ? error.message : txa('Kaydedilemedi.')) }
  }
  const toggleRemind = async () => {
    if (!requireAuth(txa('Hatırlatma'))) return
    try {
      const next = await toggleShopReminder('product', card.id)
      setReminded(next)
      if (next) toast.success(txa('Satışa çıktığında haber vereceğiz.'))
    } catch (error) { toast.error(error instanceof Error ? error.message : txa('Kaydedilemedi.')) }
  }

  return (
    <div className='flex flex-col gap-8'>
      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-7'>
        <div className='flex min-w-0 flex-col gap-4'>
          {!card.locked && (
            <div className='flex w-fit gap-1 rounded-xl border border-border/70 bg-card p-1' role='tablist' aria-label={txa('Önizleme')}>
              {modes.map(([value, label]) => (
                <button key={value} type='button' role='tab' aria-selected={mode === value} onClick={() => setMode(value)} className={cn('h-9 rounded-lg px-4 text-[13px] font-bold', mode === value ? 'bg-foreground text-background' : 'bg-transparent text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className='relative aspect-[16/11] overflow-hidden rounded-[22px] border border-border/70 bg-background'>
            <Stage card={card} mode={mode} hero={product.hero} live={live} playSession={playSession} />
            {!card.locked && (
              <div className='absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2'>
                <span className='truncate rounded-full bg-black/60 px-3 py-1 text-[11.5px] font-bold text-white backdrop-blur'>{txa('Kendi avatarınla canlı önizleme')}</span>
                <span className='flex flex-none gap-1.5'>
                  <button type='button' onClick={() => setPaused(live)} aria-pressed={live} aria-label={live ? txa('Önizlemeyi durdur') : txa('Önizlemeyi oynat')} className='flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur' data-shop-detail-toggle>
                    {live ? <Pause weight='fill' size={14} /> : <Play weight='fill' size={14} />}
                  </button>
                  <button type='button' onClick={() => { setPaused(false); setPlaySession((value) => value + 1) }} aria-label={txa('Baştan oynat')} className='flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur'>
                    <ArrowCounterClockwise weight='bold' size={14} />
                  </button>
                </span>
              </div>
            )}
          </div>
          {card.kind === 'bundle' && product.parts.length > 0 && (
            <section className='flex flex-col gap-3'>
              <div className='flex items-baseline justify-between'>
                <h2 className='text-[16px] font-extrabold'>{txa('Paketin içindekiler')}</h2>
                <span className='text-[12.5px] text-muted-foreground'>{txa('{total} parça · {owned} tanesi sende', { total: product.parts.length, owned: product.parts.filter((part) => part.owned).length })}</span>
              </div>
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                {product.parts.map((part) => {
                  const grant = card.grants.find((entry) => entry.id === part.itemId)
                  return (
                    <div key={part.itemId} className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3', part.owned ? 'border-foreground/40' : 'border-border/70')}>
                      {part.product ? <ShopThumb card={part.product} className='size-14 flex-none rounded-xl' /> : <span className='size-14 flex-none rounded-xl bg-muted' />}
                      <span className='min-w-0'>
                        <span className='block truncate text-[13.5px] font-bold'>{grant?.name ?? part.product?.title}</span>
                        <span className={cn('block text-[12px]', part.owned ? 'text-foreground' : 'text-muted-foreground')}>
                          {part.owned ? txa('Sende') : grant ? TYPE_LABEL[grant.type as keyof typeof TYPE_LABEL] ?? '' : ''}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <aside className='flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start'>
          <div className='flex flex-col gap-4 rounded-[22px] border border-border/70 bg-card p-6'>
            <div className='flex flex-wrap gap-2'>
              <span className='rounded-full bg-foreground/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground/80'>{rarity.label}</span>
              {percent > 0 && <span className='rounded-full bg-foreground px-2.5 py-1 text-[11px] font-extrabold text-background'>{txa('-%{v1}', { v1: percent })}</span>}
              {card.availableUntil && quote.state === 'live' && (
                <span className='flex items-center gap-1 rounded-full bg-foreground/10 px-2.5 py-1 text-[11px] font-extrabold text-foreground'>
                  {txa('Kalan')}{' '}<ShopCountdown target={card.availableUntil} compact />
                </span>
              )}
            </div>
            <div>
              <h1 className='text-3xl font-black leading-tight tracking-tight'>{card.title ?? txa('Gizli parça')}</h1>
              <p className='mt-1 text-[13.5px] text-muted-foreground'>
                {card.subtitle ?? TYPE_LABEL[card.type]}
                {product.season && <> · <Link to={`/magaza/sezon/${product.season.slug}`} className='font-bold text-foreground underline-offset-4 hover:underline'>{product.season.name}</Link></>}
              </p>
            </div>
            {product.description && <p className='whitespace-pre-line text-[14px] leading-relaxed text-foreground/80'>{product.description}</p>}

            {card.locked || quote.state === 'upcoming' ? (
              <div className='flex flex-col gap-3 rounded-2xl bg-muted/40 p-4'>
                <span className='text-[13px] text-muted-foreground'>{txa('Satışa çıkış:')} <b className='text-foreground'>{formatDateTime(card.availableFrom)}</b></span>
                {card.availableFrom && <ShopCountdown target={card.availableFrom} className='[&>span]:bg-foreground/[0.06] [&>span>span:last-child]:text-muted-foreground' />}
                <button type='button' onClick={() => { void toggleRemind() }} aria-pressed={reminded} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-extrabold', reminded ? 'bg-foreground/10 text-foreground' : 'bg-foreground text-background')}>
                  {reminded ? <BellRinging weight='fill' size={16} /> : <Bell size={16} />}
                  {reminded ? txa('Haber vereceğiz') : txa('Çıkınca haber ver')}
                </button>
              </div>
            ) : (
              <>
                <div className='flex flex-col gap-2 rounded-2xl bg-muted/40 p-4'>
                  <ShopPrice card={card} size='lg' />
                  {sourceLabel && <span className='text-[12.5px] text-foreground/75'>{txa('{v1} uygulandı', { v1: sourceLabel })}</span>}
                  {quote.partial && <span className='text-[12.5px] text-foreground/75'>{txa('Sende olan {v1} parça fiyattan düşüldü', { v1: quote.ownedCount })}</span>}
                  {balance !== null && quote.purchasable && (
                    <span className='flex justify-between border-t border-border/60 pt-2 text-[12.5px]'>
                      <span className='text-muted-foreground'>{txa('Satın alınca kalan')}</span>
                      <b className={balance - quote.price < 0 ? 'text-muted-foreground line-through' : 'text-foreground'}>{formatCoin(balance - quote.price)}</b>
                    </span>
                  )}
                </div>
                {quote.reason === 'owned' ? (
                  <div className='flex items-center justify-center gap-2 rounded-xl bg-foreground/10 py-3 text-[14px] font-bold text-foreground'>
                    <CheckCircle weight='fill' size={18} />{txa('Bu ürün envanterinde')}
                  </div>
                ) : (
                  <button type='button' disabled={!quote.purchasable} onClick={() => { if (requireAuth(txa('Satın alma'))) setDialog('self') }} className='flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground text-[14.5px] font-extrabold text-background disabled:opacity-45' data-testid='shop-buy'>
                    {blocked ?? txa('Satın al · {v1} Coin', { v1: formatCoin(quote.price) })}
                  </button>
                )}
                <div className='grid grid-cols-2 gap-2'>
                  <button type='button' disabled={!product.giftable || quote.state !== 'live'} onClick={() => { if (requireAuth(txa('Hediye'))) setDialog('gift') }} className='flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[13.5px] font-bold disabled:opacity-40'>
                    <Gift size={16} />{txa('Hediye et')}
                  </button>
                  <button type='button' onClick={() => { void toggleWish() }} aria-pressed={wished} className={cn('flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[13.5px] font-bold', wished && 'text-foreground')}>
                    <Heart weight={wished ? 'fill' : 'regular'} size={16} />{wished ? txa('Listende') : txa('İstek listesi')}
                  </button>
                </div>
              </>
            )}
          </div>

          {completeBundle && (
            <Link to={productLink(completeBundle.slug)} className='flex items-center gap-3 rounded-[20px] border border-border/70 bg-card p-4 text-inherit hover:border-foreground/25'>
              <ShopThumb card={completeBundle} className='size-14 flex-none rounded-xl' />
              <span className='min-w-0 flex-1'>
                <span className='block text-[13.5px] font-extrabold'>{txa('Seti tamamla: {v1}', { v1: completeBundle.title ?? '' })}</span>
                <span className='block text-[12px] text-muted-foreground'>
                  {completeBundle.quote.partial ? txa('Sendekiler düşülür · {v1} Coin', { v1: formatCoin(completeBundle.quote.price) }) : `${formatCoin(completeBundle.quote.price)} Coin`}
                </span>
              </span>
              <Sparkle weight='fill' size={18} />
            </Link>
          )}

          <div className='rounded-[20px] border border-border/70 bg-card px-5 py-2 divide-y divide-border/60'>
            <Fact label={txa('Tür')} value={TYPE_LABEL[card.type]} />
            <Fact label={txa('Süre')} value={card.kind === 'premium' ? txa('{v1} gün', { v1: card.premiumDays ?? 30 }) : txa('Kalıcı')} />
            {card.availableUntil && <Fact label={txa('Satış sonu')} value={formatDateTime(card.availableUntil)} />}
            {card.stockLeft !== null && <Fact label={txa('Kalan stok')} value={String(card.stockLeft)} />}
            {product.owners !== null && product.owners > 0 && <Fact label={txa('Sahip olan')} value={`${product.owners.toLocaleString(intlLocale())} okur`} />}
            <Fact label={txa('Hediye')} value={product.giftable ? txa('Hediye edilebilir') : txa('Hediye edilemez')} />
          </div>
        </aside>
      </div>

      {product.related.length > 0 && (
        <section className='flex flex-col gap-4'>
          <ShopShelf title={product.season ? `${product.season.name} sezonundan` : txa('Benzer ürünler')} cards={product.related} />
        </section>
      )}

      {dialog && (
        <ShopPurchaseDialog
          card={card}
          open
          initialMode={dialog}
          giftable={product.giftable}
          onOpenChange={(open) => { if (!open) setDialog(null) }}
          onPurchased={() => onChanged()}
        />
      )}
    </div>
  )
}

// Product window: opens over the current shop page when ?urun=<slug> exists.
export function ShopProductModal() {
  const [params] = useSearchParams()
  const slug = params.get(SHOP_PRODUCT_PARAM)
  const close = useCloseShopProduct()
  return (
    <Dialog open={Boolean(slug)} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent
        className='w-[min(1240px,calc(100vw-48px))] max-w-none gap-0 overflow-hidden rounded-[28px] border-border/70 p-0 sm:max-w-none'
        showCloseButton={false}
        data-testid='shop-product'
      >
        <DialogTitle className='sr-only'>{txa('Ürün detayı')}</DialogTitle>
        <DialogDescription className='sr-only'>{txa('Ürünün canlı önizlemesi, fiyatı ve satın alma seçenekleri')}</DialogDescription>
        <button type='button' onClick={close} aria-label={txa('Kapat')} className='absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75'>
          <X weight='bold' size={15} />
        </button>
        <div className='max-h-[calc(100vh-48px)] overflow-y-auto p-6' data-shop-product-scroll>
          {slug && <ProductModalBody slug={slug} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProductModalBody({ slug }: { slug: string }) {
  const { data, loading, error, reload } = useShopQuery(`product:${slug}`, () => fetchShopProduct(slug))
  if (loading && !data) {
    return (
      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]'>
        <div className='aspect-[16/11] animate-pulse rounded-[22px] bg-muted/40' />
        <div className='h-[420px] animate-pulse rounded-[22px] bg-muted/40' />
      </div>
    )
  }
  if (error) return <p className='rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground'>{error}</p>
  if (!data) {
    return (
      <div className='flex flex-col items-center gap-2 px-6 py-16 text-center'>
        <span className='font-bold'>{txa('Bu ürün mağazada yok')}</span>
        <span className='text-[13px] text-muted-foreground'>{txa('Satıştan kalkmış ya da bağlantı hatalı olabilir.')}</span>
      </div>
    )
  }
  return <ProductBody key={data.card.id} product={data} onChanged={reload} />
}

/** Eski /magaza/urun/:slug adresi: vitrinde pencereyle acilir. */
export function ShopProductRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={shopProductFallbackHref(slug)} replace />
}
