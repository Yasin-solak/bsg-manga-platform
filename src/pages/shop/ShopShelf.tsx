import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { cn } from '@/lib/utils'
import type { ShopCard } from '@/services/shopService'
import { ShopShowTile, shopTileSize } from './ShopShowTile'

/*
 * Shelf (like a Steam Points Shop row): an uppercase title, "See all (N)", a thin line, a short
 * description and cards. No scrolling (user decision): in one-row mode as many cards as fit the width are
 * drawn (width is measured), the rest in "See all"; in wrap mode all cards stack.
 * A single product is square (1 column), a bundle two columns.
 */

const ROW_GAP = 14

function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) return undefined
    const measure = () => setWidth(node.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, width] as const
}

/** Cards fitting one row (bundle two columns); order is kept, a wide card that does not fit is skipped. */
function takeRow(cards: ShopCard[], columns: number) {
  const row: ShopCard[] = []
  let used = 0
  for (const card of cards) {
    const span = shopTileSize(card) === 'wide' && columns > 1 ? 2 : 1
    if (used + span > columns) continue
    row.push(card)
    used += span
    if (used === columns) break
  }
  return row
}

/** Non-scrolling card row: one row (as many cards as fit are drawn) or a wrapping grid. */
export function ShopCardRow({ cards, wrap = false, minTile = 190, className }: { cards: ShopCard[], wrap?: boolean, minTile?: number, className?: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const columns = width > 0 ? Math.max(1, Math.floor((width + ROW_GAP) / (minTile + ROW_GAP))) : 4
  const visible = wrap ? cards : takeRow(cards, columns)
  return (
    <div
      ref={ref}
      className={cn('grid gap-3.5 [&>*]:min-w-0', className)}
      style={{ gridTemplateColumns: wrap ? `repeat(auto-fill, minmax(${minTile}px, 1fr))` : `repeat(${columns}, minmax(0, 1fr))` }}
      data-shop-card-row={wrap ? 'wrap' : 'single'}
    >
      {visible.map((card) => {
        const size = shopTileSize(card)
        return <ShopShowTile key={card.id} card={card} size={size} className={cn('w-full', size === 'wide' && columns > 1 && 'col-span-2')} />
      })}
    </div>
  )
}

export function ShopShelf({ title, kicker, description, cards, action, aside, wrap = false }: {
  title: string
  kicker?: ReactNode
  description?: ReactNode
  cards: ShopCard[]
  action?: { label: string, to: string }
  aside?: ReactNode
  wrap?: boolean
}) {
  if (cards.length === 0) return null
  return (
    <section className='flex min-w-0 flex-col gap-3' data-testid='shop-shelf'>
      {(title || action || aside) && (
        <div className='flex flex-col gap-1.5'>
          <div className='flex items-center gap-3'>
            {kicker && <span className='flex-none text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground'>{kicker}</span>}
            {title && <h2 className='flex-none text-[15px] font-black uppercase tracking-[0.08em]'>{title}</h2>}
            {action && (
              <Link to={action.to} className='flex h-6 flex-none items-center rounded-md bg-foreground/[0.08] px-2 text-[12px] font-bold text-foreground/80 transition-colors hover:bg-foreground/15 hover:text-foreground'>
                {action.label}
              </Link>
            )}
            <span aria-hidden className='h-px min-w-6 flex-1 bg-border/70' />
            {aside}
          </div>
          {description && <p className='text-[13px] text-muted-foreground'>{description}</p>}
        </div>
      )}
      <ShopCardRow cards={cards} wrap={wrap} />
    </section>
  )
}
