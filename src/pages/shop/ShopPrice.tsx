import { cn } from '@/lib/utils'
import type { ShopCard } from '@/services/shopService'
import { formatCoin, reasonLabel } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/* Sunucu fiyati (shop_quote): sahiplik, satin alinamama nedeni, indirimli / liste fiyati, Premium uye fiyati. */

export function ShopPrice({ card, size = 'md' }: { card: ShopCard, size?: 'md' | 'lg' }) {
  const { quote } = card
  if (quote.reason === 'owned') {
    return <span className={cn('font-extrabold text-foreground', size === 'lg' ? 'text-lg' : 'text-[13.5px]')}>{txa('Envanterinde')}</span>
  }
  const blocked = reasonLabel(quote.reason)
  if (!quote.purchasable && blocked && quote.reason !== 'owned_part') {
    return <span className={cn('font-bold text-muted-foreground', size === 'lg' ? 'text-base' : 'text-[13px]')}>{blocked}</span>
  }
  return (
    <span className='flex items-baseline gap-2'>
      <span className={cn('font-black tabular-nums text-foreground', size === 'lg' ? 'text-[28px]' : 'text-[14.5px]')}>
        {formatCoin(quote.price)} <span className={cn('font-bold text-muted-foreground', size === 'lg' ? 'text-[14px]' : 'text-[11px]')}>{txa('Coin')}</span>
      </span>
      {quote.price < quote.listPrice && (
        <span className='text-[12px] text-muted-foreground line-through tabular-nums'>{formatCoin(quote.listPrice)}</span>
      )}
      {quote.memberPrice !== null && (
        <span className='whitespace-nowrap text-[12px] font-bold text-muted-foreground' data-shop-member-price>
          {txa('Premium ile')} <b className='tabular-nums text-foreground'>{formatCoin(quote.memberPrice)}</b>
        </span>
      )}
    </span>
  )
}
