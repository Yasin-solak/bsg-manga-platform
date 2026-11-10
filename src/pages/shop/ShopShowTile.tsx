import { useId, useState, type MouseEvent } from 'react'
import { Link } from '@/i18n/router'
import { Check, Crown, Gift, Heart, Lightning, Pause, Play } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toggleShopWishlist, type ShopCard } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { ShopBackgroundStage } from './ShopBackgroundStage'
import { ShopBundleStage } from './ShopBundleStage'
import { ShopEffectStage } from './ShopEffectStage'
import { ShopFrameStage } from './ShopFrameStage'
import { ShopLockedStage } from './ShopLockedStage'
import { ShopPremiumStage } from './ShopPremiumStage'
import { ShopPurchaseDialog } from './ShopPurchaseDialog'
import { findGrant } from './shopCardLayout'
import { cardBadge, discountPercent, formatCoin, reasonLabel, TYPE_LABEL } from './shopFormat'
import { useShopLiveCard } from './shopLive'
import { useShopProductLink } from './shopProductLink'
import './shopLive.css'
import { txa } from '@/i18n/activeLocale'

/*
 * Product card (Discord shop card logic): the product's scene uses the whole card; name and price sit tightly
 * at the bottom. On hover (or focus / the center card on touch) the product plays live with the reader's own
 * avatar / profile, the price row turns into "Buy with X Coin" + a gift button, the wishlist
 * heart shows. The card is neutral; color comes only from the product. The whole card is one link opening the
 * detail window. A single product is square, a bundle wide (two cards wide).
 */

export type ShopTileSize = 'tall' | 'wide' | 'hero'

export function shopTileSize(card: ShopCard): ShopTileSize {
  return card.type === 'background' || card.kind === 'bundle' ? 'wide' : 'tall'
}

const SIZE_CLASS: Record<ShopTileSize, string> = {
  tall: 'aspect-square',
  wide: 'aspect-[2.07/1]',
  hero: 'aspect-[16/9]',
}

/** The product's live scene (shared by card, showcase scene and collection blocks). */
export function ShopCardStage({ card, live, playSession, size }: { card: ShopCard, live: boolean, playSession: number, size: ShopTileSize }) {
  if (card.locked) return <ShopLockedStage card={card} live={live} />
  if (card.kind === 'premium') return <ShopPremiumStage days={card.premiumDays} live={live} />
  if (card.kind === 'bundle') return <ShopBundleStage card={card} live={live} playSession={playSession} />
  if (card.type !== 'frame' && card.type !== 'background' && card.type !== 'profile_effect') return null
  const grant = findGrant(card, card.type)
  if (!grant) return null
  if (card.type === 'frame') return <ShopFrameStage grant={grant} live={live} playSession={playSession} scale={size === 'tall' ? 0.48 : 0.42} />
  if (card.type === 'background') return <ShopBackgroundStage grant={grant} cover={card.cover} live={live} playSession={playSession} overlay={false} />
  // Efekt mini profil kartinda: kart sahneye tam sigar (efektin tamami gorunur), yanlar ortam isigi.
  if (card.type === 'profile_effect') return <ShopEffectStage grant={grant} cover={card.cover} live={live} playSession={playSession} className='py-[5%]' cardClassName='h-full' ambient />
  return null
}

export function ShopShowTile({ card, size = shopTileSize(card), className }: { card: ShopCard, size?: ShopTileSize, className?: string }) {
  const { currentUser } = useAuth()
  const instanceId = useId()
  const control = useShopLiveCard<HTMLElement>(`${card.id}:${instanceId}`)
  const { live, playSession } = control
  const [wished, setWished] = useState(card.wished)
  const [dialog, setDialog] = useState<'self' | 'gift' | null>(null)
  const badge = cardBadge(card)
  const owned = card.quote.reason === 'owned'
  const canBuy = card.quote.purchasable && !card.locked && !owned
  const blocked = !card.quote.purchasable && !owned ? reasonLabel(card.quote.reason) : null
  const percent = discountPercent(card.quote)
  const productLink = useShopProductLink()
  const href = card.kind === 'premium' ? '/magaza/premium' : productLink(card.slug)

  const guard = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const toggleWish = async (event: MouseEvent) => {
    guard(event)
    if (!currentUser) {
      toast.info(txa('İstek listesi için giriş yapmalısın.'))
      return
    }
    const previous = wished
    setWished(!previous)
    try {
      setWished(await toggleShopWishlist(card.id))
    } catch (error) {
      setWished(previous)
      toast.error(error instanceof Error ? error.message : txa('İstek listesi güncellenemedi.'))
    }
  }

  const open = (mode: 'self' | 'gift') => (event: MouseEvent) => {
    guard(event)
    if (!currentUser) {
      toast.info(mode === 'gift' ? txa('Hediye için giriş yapmalısın.') : txa('Satın almak için giriş yapmalısın.'))
      return
    }
    setDialog(mode)
  }

  // Top left: only a state price cannot explain (owned, coming soon, last stock, time left, early access).
  const corner = card.quote.earlyAccess && !owned
    ? { label: txa('Premium erken erişim'), icon: true }
    : badge && badge.tone !== 'sale' ? { label: badge.label, icon: false } : null

  return (
    <article
      ref={control.ref}
      {...control.handlers}
      className={cn(
        'group/tile relative isolate flex-none overflow-hidden rounded-xl bg-card ring-1 transition-[transform,box-shadow] duration-300',
        SIZE_CLASS[size],
        live ? 'z-[1] -translate-y-0.5 shadow-[0_26px_50px_-26px_rgba(0,0,0,0.95)] ring-foreground/25' : 'ring-border/60',
        className,
      )}
      data-testid='shop-product-card'
      data-shop-card-type={card.locked ? 'locked' : card.type}
      data-live={live ? 'true' : 'false'}
    >
      <div className='absolute inset-x-0 top-0 bottom-[54px] overflow-visible' data-shop-card-media>
        <ShopCardStage card={card} live={live} playSession={playSession} size={size} />
      </div>

      {corner && (
        <span className='pointer-events-none absolute left-2.5 top-2.5 z-[2] flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur'>
          {corner.icon && <Lightning weight='fill' size={11} />}{corner.label}
        </span>
      )}
      <span className='absolute right-2.5 top-2.5 z-[3] flex items-center gap-1.5'>
        {control.manual && (
          <button type='button' onClick={(event) => { guard(event); control.toggle() }} aria-label={live ? txa('Önizlemeyi durdur') : txa('Canlı önizle')} aria-pressed={live} className='flex size-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur' data-shop-live-toggle>
            {live ? <Pause weight='fill' size={12} /> : <Play weight='fill' size={12} />}
          </button>
        )}
        {!card.locked && card.kind !== 'premium' && (
          <button type='button' onClick={toggleWish} aria-label={wished ? txa('İstek listesinden çıkar') : txa('İstek listesine ekle')} aria-pressed={wished} className={cn('flex size-8 items-center justify-center rounded-lg bg-black/55 backdrop-blur transition-[opacity,color]', wished ? 'text-white opacity-100' : 'text-white opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100')}>
            <Heart weight={wished ? 'fill' : 'bold'} size={15} />
          </button>
        )}
      </span>

      {/* Alt bant: ad sabit; fiyat satiri canliyken satin al + hediye dugmesine donusur. */}
      <div className='absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-card from-55% via-card/85 to-transparent px-3 pb-2.5 pt-5'>
        <Link
          to={href}
          className='line-clamp-1 text-[14px] font-semibold leading-snug text-foreground outline-none after:absolute after:inset-0 after:z-[1] after:content-[""] focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-foreground/60'
          data-shop-card-link
        >
          {card.kind === 'bundle' && <b className='font-extrabold'>{txa('{v1} parça', { v1: card.quote.grantCount })} </b>}
          {card.locked ? txa('Gizli parça') : card.title ?? TYPE_LABEL[card.type]}
        </Link>
        <div className='relative mt-0.5 h-8'>
          <div className={cn('absolute inset-0 flex items-center gap-1.5 transition-opacity duration-200', canBuy && 'group-focus-within/tile:opacity-0', canBuy && live && 'opacity-0')}>
            {owned ? <span className='flex items-center gap-1 text-[13px] font-bold text-muted-foreground'><Check weight='bold' size={13} />{txa('Envanterinde')}</span>
              : blocked ? <span className='text-[13px] font-bold text-muted-foreground'>{blocked}</span>
                : (
                  <>
                    <span className='text-[13.5px] font-extrabold tabular-nums'>{formatCoin(card.quote.price)} <span className='text-[11px] font-bold text-muted-foreground'>{txa('Coin')}</span></span>
                    {percent > 0 && <span className='text-[12.5px] font-bold tabular-nums text-foreground/70'>({txa('-%{v1}', { v1: percent })})</span>}
                    {card.quote.memberPrice !== null && (
                      <span className='flex items-center gap-1 text-[12px] font-semibold text-muted-foreground' title={txa('Premium ile {v1} Coin', { v1: formatCoin(card.quote.memberPrice) })} data-shop-member-price>
                        · <Crown weight='fill' size={11} /><span className='tabular-nums'>{formatCoin(card.quote.memberPrice)}</span>
                      </span>
                    )}
                  </>
                )}
          </div>
          {canBuy && (
            <span className={cn('absolute inset-0 z-[3] flex gap-1.5 transition-opacity duration-200', live ? 'opacity-100' : 'pointer-events-none opacity-0 group-focus-within/tile:pointer-events-auto group-focus-within/tile:opacity-100')} data-shop-card-actions>
              <button type='button' onClick={open('self')} className='h-8 min-w-0 flex-1 truncate rounded-lg bg-foreground px-2 text-[12.5px] font-extrabold text-background hover:bg-foreground/90' aria-label={txa('{v1} satın al', { v1: card.title ?? txa('Ürünü') })}>
                {txa('{v1} Coin ile al', { v1: formatCoin(card.quote.price) })}
              </button>
              {card.kind !== 'premium' && (
                <button type='button' onClick={open('gift')} className='flex size-8 flex-none items-center justify-center rounded-lg bg-foreground/15 text-foreground hover:bg-foreground/25' aria-label={txa('Hediye et')}><Gift weight='fill' size={15} /></button>
              )}
            </span>
          )}
        </div>
      </div>

      {dialog && <ShopPurchaseDialog card={card} open initialMode={dialog} onOpenChange={(next) => { if (!next) setDialog(null) }} />}
    </article>
  )
}
