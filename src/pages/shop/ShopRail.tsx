import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { ArrowRight, CaretDoubleLeft, CaretDoubleRight, Coins, Compass, Crown, Gift, Heart, type Icon, Package, Scroll, Sparkle, SealPercent, Star, TShirt, UserCircle } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { STORE_RULES_PATH } from '@/lib/policyRoutes'
import { fetchShopCatalog } from '@/services/shopService'
import { EarnDialog } from './ShopHeader'
import { formatCoin } from './shopFormat'
import { useShopQuery } from './useShopQuery'
import { txa } from '@/i18n/activeLocale'

/*
 * Shop category rail (on the right, can hide): grouped categories, Premium, my account and Coin
 * balance. Hidden, only an icon strip remains; the preference is remembered in the browser. Category counts
 * come from the catalog; an empty category is not listed.
 */

type RailLink = { to: string, label: string, icon: Icon, count?: number | null, match: (path: string, search: URLSearchParams) => boolean }

const COLLAPSE_KEY = 'bsg:shop-rail-collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function catalogMatch(key: string, value: string) {
  return (path: string, search: URLSearchParams) => path === '/magaza/katalog' && search.get(key) === value
}

export function ShopRail() {
  const { currentUser } = useAuth()
  const location = useLocation()
  const [earnOpen, setEarnOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const counts = useShopQuery('shop-rail-counts', () => fetchShopCatalog({ limit: 1 }))
  const typeCounts = counts.data?.typeCounts ?? null
  const path = location.pathname.replace(/\/+$/, '') || '/magaza'
  const search = new URLSearchParams(location.search)

  const toggle = () => setCollapsed((current) => {
    const next = !current
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // Tercih yalniz bu oturumda kalir.
    }
    return next
  })

  const groups: Array<{ title: string, links: RailLink[] }> = [
    {
      title: txa('Öne çıkan'),
      links: [
        { to: '/magaza', label: txa('Keşfet'), icon: Compass, match: (current) => current === '/magaza' || current.startsWith('/magaza/sezon') },
        { to: '/magaza/katalog?filtre=sale', label: txa('İndirimdekiler'), icon: SealPercent, match: catalogMatch('filtre', 'sale') },
        { to: '/magaza/katalog?sirala=newest', label: txa('Yeni gelenler'), icon: Sparkle, match: catalogMatch('sirala', 'newest') },
        { to: '/magaza/katalog?sirala=popular', label: txa('Çok satanlar'), icon: Star, match: catalogMatch('sirala', 'popular') },
      ],
    },
    {
      title: txa('Profil'),
      links: [
        { to: '/magaza/katalog?tur=cerceve', label: txa('Avatar çerçeveleri'), icon: UserCircle, count: typeCounts ? typeCounts.frame ?? 0 : null, match: catalogMatch('tur', 'cerceve') },
        { to: '/magaza/katalog?tur=efekt', label: txa('Profil efektleri'), icon: Sparkle, count: typeCounts ? typeCounts.profile_effect ?? 0 : null, match: catalogMatch('tur', 'efekt') },
        { to: '/magaza/katalog?tur=paket', label: txa('Paketler'), icon: Package, count: typeCounts ? typeCounts.bundle ?? 0 : null, match: catalogMatch('tur', 'paket') },
      ].filter((link) => link.count === null || link.count > 0 || link.match(path, search)),
    },
    {
      title: txa('Premium'),
      links: [
        { to: '/magaza/premium', label: txa('Premium'), icon: Crown, match: (current) => current.startsWith('/magaza/premium') },
      ],
    },
    {
      title: txa('Mürek'),
      links: [
        { to: '/magaza/murek', label: txa('Mürek Dolabı'), icon: TShirt, match: (current) => current.startsWith('/magaza/murek') },
      ],
    },
    {
      title: txa('Hesabım'),
      links: currentUser
        ? [
          { to: '/magaza/katalog?filtre=wishlist', label: txa('İstek listem'), icon: Heart, match: catalogMatch('filtre', 'wishlist') },
          { to: '/magaza/katalog?filtre=unowned', label: txa('Sahip olmadıklarım'), icon: Gift, match: catalogMatch('filtre', 'unowned') },
        ]
        : [],
    },
  ]
  const visibleGroups = groups.filter((group) => group.links.length > 0)

  if (collapsed) {
    return (
      <aside className='sticky top-[88px] hidden w-[52px] flex-none flex-col items-center gap-1 self-start lg:flex' aria-label={txa('Mağaza kategorileri')} data-testid='shop-rail' data-collapsed='true'>
        <button type='button' onClick={toggle} title={txa('Kategorileri göster')} aria-label={txa('Kategorileri göster')} aria-expanded={false} className='mb-2 flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground hover:text-foreground'>
          <CaretDoubleLeft weight='bold' size={16} />
        </button>
        {visibleGroups.map((group, index) => (
          <div key={group.title} className={cn('flex flex-col items-center gap-1', index > 0 && 'mt-1 border-t border-border/60 pt-2')}>
            {group.links.map((link) => {
              const active = link.match(path, search)
              return (
                <Link key={link.to} to={link.to} title={link.label} aria-label={link.label} aria-current={active ? 'page' : undefined} className={cn('flex size-10 items-center justify-center rounded-xl transition-colors', active ? 'bg-accent text-foreground' : 'text-foreground/60 hover:bg-accent/60 hover:text-foreground')}>
                  <link.icon size={19} weight={active ? 'fill' : 'regular'} />
                </Link>
              )
            })}
          </div>
        ))}
        {currentUser && (
          <button type='button' onClick={() => setEarnOpen(true)} title={txa('Bakiye: {v1} Coin · Coin kazan', { v1: formatCoin(currentUser.stones ?? 0) })} aria-label={txa('Coin kazan')} className='mt-2 flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card'>
            <Coins weight='fill' size={18} />
          </button>
        )}
        <EarnDialog open={earnOpen} onOpenChange={setEarnOpen} />
      </aside>
    )
  }

  return (
    <aside className='sticky top-[88px] hidden max-h-[calc(100vh-104px)] w-[224px] flex-none flex-col gap-5 self-start overflow-y-auto pb-2 [scrollbar-width:thin] lg:flex' aria-label={txa('Mağaza kategorileri')} data-testid='shop-rail' data-collapsed='false'>
      <div className='flex items-center justify-between gap-2 pl-3'>
        <span className='text-[13px] font-black uppercase tracking-[0.08em]'>{txa('Kategoriler')}</span>
        <button type='button' onClick={toggle} title={txa('Kategorileri gizle')} aria-label={txa('Kategorileri gizle')} aria-expanded className='flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'>
          <CaretDoubleRight weight='bold' size={15} />
        </button>
      </div>
      <nav className='flex flex-col gap-5'>
        {visibleGroups.map((group) => (
          <div key={group.title} className='flex flex-col gap-0.5'>
            <span className='px-3 pb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground'>{group.title}</span>
            {group.links.map((link) => {
              const active = link.match(path, search)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-semibold transition-colors',
                    active ? 'bg-accent text-foreground' : 'text-foreground/70 hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <link.icon size={17} weight={active ? 'fill' : 'regular'} className='flex-none' />
                  <span className='min-w-0 flex-1 truncate'>{link.label}</span>
                  {typeof link.count === 'number' && link.count > 0 && <span className='text-[12px] font-bold tabular-nums text-muted-foreground'>{link.count}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className='mt-auto flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4'>
        {currentUser ? (
          <>
            <span className='text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground'>{txa('Bakiyen')}</span>
            <span className='flex items-center gap-2 text-[22px] font-black tabular-nums leading-none' data-testid='shop-rail-balance'>
              <Coins weight='fill' size={20} />{formatCoin(currentUser.stones ?? 0)}
            </span>
            <button type='button' onClick={() => setEarnOpen(true)} className='flex h-9 items-center justify-center gap-1.5 rounded-lg bg-foreground text-[13px] font-extrabold text-background'>
              {txa('Coin kazan')}<ArrowRight weight='bold' size={13} />
            </button>
          </>
        ) : (
          <>
            <span className='text-[13.5px] font-bold'>{txa('Coin ile al, profilini giydir.')}</span>
            <span className='text-[12.5px] text-muted-foreground'>{txa('Görevler ve okuma serisiyle Coin kazanılır; gerçek para yok.')}</span>
          </>
        )}
        <Link to={STORE_RULES_PATH} className='flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground'>
          <Scroll size={13} />{txa('Mağaza ve Coin kuralları')}
        </Link>
      </div>
      <EarnDialog open={earnOpen} onOpenChange={setEarnOpen} />
    </aside>
  )
}
