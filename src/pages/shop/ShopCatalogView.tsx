import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from '@/i18n/router'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { fetchShopCatalog, SHOP_RARITIES, type ShopCard, type ShopCatalogQuery } from '@/services/shopService'
import { ShopShowTile, shopTileSize } from './ShopShowTile'
import { formatCoin, RARITY_META, TYPE_PLURAL, TYPE_SLUG, typeFromSlug } from './shopFormat'
import { useShopQuery } from './useShopQuery'
import { txa } from '@/i18n/activeLocale'

/*
 * Catalog (like a Steam category page): category / filter title from the left rail, a toolbar on top
 * (type, status filters, rarity, season, sort), a card grid below. Filters are in the address
 * bar (shareable), pages of 48, budget by balance.
 */

// Square card 1 column, bundle 2 columns (same row height); the grid fills without gaps.
function CatalogGrid({ cards, className }: { cards: ShopCard[], className?: string }) {
  return (
    <div className={cn('grid grid-flow-dense grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 [&>*]:min-w-0', className)} data-shop-grid='catalog'>
      {cards.map((card) => {
        const size = shopTileSize(card)
        return <ShopShowTile key={card.id} card={card} size={size} className={cn('w-full', size === 'wide' && 'col-span-2')} />
      })}
    </div>
  )
}

const PAGE = 48
const SORTS: Array<{ value: NonNullable<ShopCatalogQuery['sort']>, label: string }> = [
  { value: 'featured', get label() { return txa('Öne çıkanlar') } },
  { value: 'newest', get label() { return txa('En yeni') } },
  { value: 'popular', get label() { return txa('En çok satan') } },
  { value: 'price_asc', get label() { return txa('Fiyat: artan') } },
  { value: 'price_desc', get label() { return txa('Fiyat: azalan') } },
]
const FILTERS = [
  { value: 'sale', get label() { return txa('İndirimde') }, auth: false },
  { value: 'limited', get label() { return txa('Sınırlı süre / stok') }, auth: false },
  { value: 'unowned', get label() { return txa('Sahip olmadıklarım') }, auth: true },
  { value: 'wishlist', get label() { return txa('İstek listem') }, auth: true },
] as const

const TYPE_COPY: Record<string, string> = {
  get frame() { return txa('Avatarının etrafında durur; yorumlarda, profilinde ve kartında görünür.') },
  get profile_effect() { return txa('Profil kartını açan herkes için canlı bir sahne.') },
  get bundle() { return txa('Birlikte alınca daha ucuz; sende olan parçalar fiyattan düşülür.') },
}

function pageTitle(type: ReturnType<typeof typeFromSlug>, filters: string[], sort: string | null) {
  if (type) return TYPE_PLURAL[type]
  if (filters.length === 1) {
    if (filters[0] === 'sale') return txa('İndirimdekiler')
    if (filters[0] === 'wishlist') return txa('İstek listem')
    if (filters[0] === 'unowned') return txa('Sahip olmadıklarım')
    if (filters[0] === 'limited') return txa('Sınırlı süre')
  }
  if (sort === 'newest') return txa('Yeni gelenler')
  if (sort === 'popular') return txa('Çok satanlar')
  return txa('Tüm ürünler')
}

function Pill({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn('flex h-9 flex-none items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold transition-colors', active ? 'bg-foreground text-background' : 'bg-foreground/[0.06] text-foreground/75 hover:bg-foreground/10 hover:text-foreground')}
    >
      {children}
    </button>
  )
}

const SELECT = 'h-9 rounded-lg border border-border/70 bg-card px-2.5 text-[13px] font-semibold outline-none focus:border-foreground/40'

export function ShopCatalogView() {
  const { currentUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const [extra, setExtra] = useState<ShopCard[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const type = typeFromSlug(params.get('tur'))
  const balance = currentUser?.stones ?? null
  const filters = (params.get('filtre') ?? '').split(',').filter(Boolean)

  const query = useMemo<ShopCatalogQuery>(() => ({
    type,
    rarity: (SHOP_RARITIES as readonly string[]).includes(params.get('nadirlik') ?? '') ? params.get('nadirlik') as ShopCatalogQuery['rarity'] : null,
    season: params.get('sezon'),
    sort: (params.get('sirala') as ShopCatalogQuery['sort']) ?? 'featured',
    filters: (params.get('filtre') ?? '').split(',').filter(Boolean) as ShopCatalogQuery['filters'],
    maxPrice: params.get('butce') === '1' && balance !== null ? balance : null,
    search: params.get('q'),
    limit: PAGE,
  }), [balance, params, type])
  const key = JSON.stringify(query)
  const { data, loading, error } = useShopQuery(key, () => fetchShopCatalog(query))

  useEffect(() => { setExtra([]) }, [key])

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(name)
    else next.set(name, value)
    setParams(next, { replace: true })
  }
  const toggleFilter = (value: string) => {
    const next = filters.includes(value) ? filters.filter((entry) => entry !== value) : [...filters, value]
    setParam('filtre', next.length ? next.join(',') : null)
  }

  const loadMore = async () => {
    if (!data) return
    setLoadingMore(true)
    try {
      const next = await fetchShopCatalog({ ...query, offset: data.items.length + extra.length })
      setExtra((current) => [...current, ...next.items])
    } finally {
      setLoadingMore(false)
    }
  }

  const items = data ? [...data.items, ...extra] : []
  const totalAll = data ? Object.values(data.typeCounts).reduce((sum, value) => sum + value, 0) : 0
  const search = params.get('q')
  const budget = params.get('butce') === '1'
  const anyFilter = ['nadirlik', 'sezon', 'filtre', 'butce', 'q', 'sirala'].some((name) => params.get(name))

  return (
    <div className='flex flex-col gap-6' data-testid='shop-catalog'>
      <header className='flex flex-col gap-1.5'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <h1 className='text-[32px] font-black leading-none tracking-[-0.02em]'>{pageTitle(type, filters, params.get('sirala'))}</h1>
          {search && (
            <button type='button' onClick={() => setParam('q', null)} className='flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-bold'>
              <MagnifyingGlass size={13} />“{search}”<X size={12} />
            </button>
          )}
        </div>
        <p className='text-[13.5px] text-muted-foreground'>
          {data ? txa('{v1} ürün', { v1: data.total }) : txa('Yükleniyor…')}{type && TYPE_COPY[type] ? ` · ${TYPE_COPY[type]}` : ''}
        </p>
      </header>

      <div className='flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3' data-shop-catalog-toolbar>
        <div className='flex flex-wrap items-center gap-1.5'>
          {([null, 'frame', 'profile_effect', 'bundle'] as const).map((value) => {
            const active = type === value
            const count = value ? data?.typeCounts[value] ?? 0 : totalAll
            if (value && !count && !active) return null
            return (
              <Pill key={value ?? 'all'} active={active} onClick={() => setParam('tur', value ? TYPE_SLUG[value] : null)}>
                {value ? TYPE_PLURAL[value] : txa('Tümü')}<span className='opacity-60'>{count}</span>
              </Pill>
            )
          })}
          <span aria-hidden className='mx-1 h-6 w-px bg-border/70' />
          {FILTERS.filter((filter) => !filter.auth || currentUser).map((filter) => (
            <Pill key={filter.value} active={filters.includes(filter.value)} onClick={() => toggleFilter(filter.value)}>{filter.label}</Pill>
          ))}
          {currentUser && balance !== null && (
            <Pill active={budget} onClick={() => setParam('butce', budget ? null : '1')}>{txa('Bütçeme uyanlar')} <span className='opacity-60'>{formatCoin(balance)}</span></Pill>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <select aria-label={txa('Nadirlik')} value={params.get('nadirlik') ?? ''} onChange={(event) => setParam('nadirlik', event.target.value || null)} className={SELECT}>
            <option value=''>{txa('Tüm nadirlikler')}</option>
            {[...SHOP_RARITIES].reverse().map((value) => <option key={value} value={value}>{RARITY_META[value].label}</option>)}
          </select>
          {(data?.seasons.length ?? 0) > 0 && (
            <select aria-label={txa('Sezon')} value={params.get('sezon') ?? ''} onChange={(event) => setParam('sezon', event.target.value || null)} className={SELECT}>
              <option value=''>{txa('Tüm sezonlar')}</option>
              {data?.seasons.map((season) => <option key={season.slug} value={season.slug}>{season.name}</option>)}
            </select>
          )}
          <label className='ml-auto flex items-center gap-2 text-[12.5px] font-bold text-muted-foreground'>
            {txa('Sırala')}
            <select value={params.get('sirala') ?? 'featured'} onChange={(event) => setParam('sirala', event.target.value === 'featured' ? null : event.target.value)} className={SELECT}>
              {SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
            </select>
          </label>
          {anyFilter && <button type='button' onClick={() => setParams(type ? new URLSearchParams({ tur: TYPE_SLUG[type] }) : new URLSearchParams(), { replace: true })} className='h-9 rounded-lg bg-transparent px-2 text-[12.5px] font-bold text-muted-foreground hover:text-foreground'>{txa('Temizle')}</button>}
        </div>
      </div>

      {error && <p className='rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground'>{error}</p>}
      {loading && !data ? (
        <div className='grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'>
          {Array.from({ length: 10 }, (_, index) => <div key={index} className='aspect-square animate-pulse rounded-xl bg-muted/40' />)}
        </div>
      ) : items.length ? (
        <CatalogGrid cards={items} className={cn('transition-opacity', loading && 'opacity-60')} />
      ) : (
        <div className='flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border px-6 py-16 text-center'>
          <span className='font-bold'>{filters.includes('wishlist') ? txa('İstek listen boş') : txa('Bu filtrelere uyan ürün yok')}</span>
          <span className='text-[13px] text-muted-foreground'>{filters.includes('wishlist') ? txa('Kartlardaki kalbe dokunarak ekleyebilirsin; indirime girince haber veririz.') : txa('Filtreleri değiştirip tekrar dene.')}</span>
          <button type='button' onClick={() => setParams(new URLSearchParams(), { replace: true })} className='text-[13px] font-bold underline underline-offset-4'>{txa('Tüm ürünleri göster')}</button>
        </div>
      )}
      {data && items.length < data.total && (
        <button type='button' onClick={() => { void loadMore() }} disabled={loadingMore} className='mx-auto h-11 rounded-xl border border-border bg-card px-6 text-[13.5px] font-bold disabled:opacity-50'>
          {loadingMore ? txa('Yükleniyor…') : txa('Daha fazla göster ({v1})', { v1: data.total - items.length })}
        </button>
      )}
    </div>
  )
}
