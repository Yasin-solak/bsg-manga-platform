import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Link, useNavigate } from '@/i18n/router'
import { Coins, Crown, MagnifyingGlass, SquaresFour, Storefront, TShirt } from '@phosphor-icons/react'
import RedeemCodeActivationPanel from '@components/common/RedeemCodeActivationPanel'
import UserRewardTasksPanel from '@components/common/UserRewardTasksPanel'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { formatCoin } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/* Shop top strip: search; on narrow screens (left rail hidden) also sections and balance. */

const TABS = [
  { to: '/magaza', get label() { return txa('Vitrin') }, icon: Storefront, match: (path: string) => path === '/magaza' || path.startsWith('/magaza/sezon') },
  { to: '/magaza/katalog', get label() { return txa('Katalog') }, icon: SquaresFour, match: (path: string) => path.startsWith('/magaza/katalog') || path.startsWith('/magaza/urun') },
  { to: '/magaza/premium', get label() { return txa('Premium') }, icon: Crown, match: (path: string) => path.startsWith('/magaza/premium') },
  { to: '/magaza/murek', get label() { return txa('Mürek') }, icon: TShirt, match: (path: string) => path.startsWith('/magaza/murek') },
]

export function EarnDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { currentUser, updateCurrentUser } = useAuth()
  const [tab, setTab] = useState<'tasks' | 'code'>('tasks')
  const setBalance = (stones: number) => updateCurrentUser({ stones })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[88vh] max-w-[640px] overflow-y-auto'>
        <DialogTitle className='text-lg font-extrabold'>{txa('Coin kazan')}</DialogTitle>
        <div className='grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1'>
          {([['tasks', txa('Görevler')], ['code', txa('Kod kullan')]] as const).map(([key, label]) => (
            <button key={key} type='button' onClick={() => setTab(key)} className={cn('h-9 rounded-lg text-[13px] font-bold', tab === key ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'tasks'
          ? <UserRewardTasksPanel currentUserId={currentUser?.id} onBalanceChange={setBalance} compact />
          : <RedeemCodeActivationPanel compact variant='store' currentUserId={currentUser?.id} onUserBalanceChange={setBalance} />}
      </DialogContent>
    </Dialog>
  )
}

export function ShopHeader() {
  const { currentUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const initialQuery = new URLSearchParams(location.search).get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [earnOpen, setEarnOpen] = useState(false)

  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = query.trim()
    navigate(value ? `/magaza/katalog?q=${encodeURIComponent(value)}` : '/magaza/katalog')
  }

  return (
    <div className='flex w-full flex-wrap items-center gap-2 md:flex-nowrap' data-testid='shop-header'>
      <nav aria-label={txa('Mağaza')} className='flex items-center gap-1 lg:hidden'>
        {TABS.map((tab) => {
          const active = tab.match(location.pathname.replace(/\/+$/, '') || '/magaza')
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-bold transition-colors',
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <tab.icon weight={active ? 'fill' : 'regular'} size={16} className={undefined} />
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <form onSubmit={submit} className='order-last flex min-w-0 basis-full items-center md:order-none md:ml-auto md:max-w-[460px] lg:ml-0 md:flex-1 md:basis-auto'>
        <label className='relative flex w-full items-center'>
          <MagnifyingGlass size={15} className='pointer-events-none absolute left-3 text-muted-foreground' />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={txa('Mağazada ara: çerçeve, efekt, koleksiyon')}
            aria-label={txa('Mağazada ara')}
            className='h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13.5px] outline-none focus:border-foreground/40'
          />
        </label>
      </form>
      {currentUser && (
        <div className='ml-auto flex items-center gap-2 rounded-xl border border-border/70 bg-card py-1 pl-3 pr-1 md:ml-0 lg:hidden'>
          <Coins weight='fill' size={17} />
          <span className='text-[14px] font-extrabold tabular-nums' data-testid='shop-wallet-balance'>{formatCoin(currentUser.stones ?? 0)}</span>
          <button type='button' onClick={() => setEarnOpen(true)} className='h-8 rounded-lg bg-foreground px-3 text-[12.5px] font-extrabold text-background'>
            {txa('Coin kazan')}
          </button>
        </div>
      )}
      <EarnDialog open={earnOpen} onOpenChange={setEarnOpen} />
    </div>
  )
}
