import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { CheckCircle, Coins, Gift, MagnifyingGlass, ShoppingBag, SpinnerGap, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { REFUND_POLICY_PATH, STORE_RULES_PATH } from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { searchGlobalEntities, type GlobalSearchUserItem } from '@/services/globalSearchService'
import { purchaseShopProduct, quoteShopProduct, type ShopCard, type ShopPurchaseResult, type ShopQuote } from '@/services/shopService'
import { ShopThumb } from './ShopThumb'
import { formatCoin, newRequestKey, priceSourceLabel, reasonLabel, TYPE_LABEL } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Purchase / gift confirmation. The price always comes from the server (shop_quote): on a gift bundle pieces the recipient
 * owns are deducted. The request key is fixed while the window is open (a double click is one order).
 */

const OWNED_KEY: Record<string, string> = { frame: 'frames', background: 'backgrounds', profile_effect: 'profile_effects' }

export function ShopPurchaseDialog({ card, open, onOpenChange, initialMode = 'self', giftable = true, onPurchased }: {
  card: ShopCard
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: 'self' | 'gift'
  giftable?: boolean
  onPurchased?: (result: ShopPurchaseResult, gift: boolean) => void
}) {
  const { currentUser, updateCurrentUser } = useAuth()
  const [mode, setMode] = useState<'self' | 'gift'>(initialMode)
  const [recipient, setRecipient] = useState<GlobalSearchUserItem | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchUserItem[]>([])
  const [message, setMessage] = useState('')
  const [quote, setQuote] = useState<ShopQuote>(card.quote)
  const [quoting, setQuoting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ShopPurchaseResult | null>(null)
  const requestKey = useMemo(() => (open ? newRequestKey() : ''), [open])
  // After a purchase the parent refreshes data; the window resets only on opening.
  const cardQuoteRef = useRef(card.quote)
  cardQuoteRef.current = card.quote

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setRecipient(null)
    setQuery('')
    setMessage('')
    setError(null)
    setDone(null)
    setQuote(cardQuoteRef.current)
  }, [initialMode, open])

  // When the recipient changes the price recalculates from the recipient's inventory.
  useEffect(() => {
    if (!open) return undefined
    const target = mode === 'gift' ? recipient?.id ?? null : null
    if (mode === 'gift' && !target) return undefined
    let cancelled = false
    setQuoting(true)
    quoteShopProduct(card.id, target)
      .then((next) => { if (!cancelled) setQuote(next) })
      .catch(() => { /* kart fiyatiyla devam */ })
      .finally(() => { if (!cancelled) setQuoting(false) })
    return () => { cancelled = true }
  }, [card.id, mode, open, recipient?.id])

  useEffect(() => {
    if (mode !== 'gift' || recipient || query.trim().length < 2) {
      setResults([])
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchGlobalEntities(query, 6, controller.signal)
        .then((found) => setResults(found.users.filter((user) => user.id !== currentUser?.id)))
        .catch(() => setResults([]))
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [currentUser?.id, mode, query, recipient])

  const balance = currentUser?.stones ?? 0
  const after = balance - quote.price
  const blocked = !quote.purchasable ? reasonLabel(quote.reason) : null
  const canSubmit = Boolean(currentUser) && quote.purchasable && after >= 0 && !submitting && !quoting && (mode === 'self' || Boolean(recipient))

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await purchaseShopProduct({
        productId: card.id,
        requestKey,
        recipientUserId: mode === 'gift' ? recipient?.id : null,
        message: mode === 'gift' ? message : null,
      })
      const patch: Parameters<typeof updateCurrentUser>[0] = { stones: result.balance }
      if (mode === 'self') {
        if (result.premiumExpiresAt) patch.premiumExpiresAt = result.premiumExpiresAt
        if (result.granted.length && currentUser) {
          const owned = { ...(currentUser.ownedItems ?? {}) } as Record<string, string[]>
          for (const grant of result.granted) {
            const key = OWNED_KEY[grant.type]
            if (key) owned[key] = [...new Set([...(owned[key] ?? []), grant.identifier])]
          }
          patch.ownedItems = owned
        }
      }
      updateCurrentUser(patch)
      setDone(result)
      onPurchased?.(result, mode === 'gift')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : txa('Satın alma tamamlanamadı.'))
    } finally {
      setSubmitting(false)
    }
  }

  const sourceLabel = priceSourceLabel(quote)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className='max-w-[460px] gap-0 overflow-hidden p-0' data-testid='shop-purchase-dialog'>
        <div className='relative h-40'>
          <ShopThumb card={card} fit={card.type === 'frame' || card.type === 'profile_effect' ? 'contain' : 'cover'} className='absolute inset-0' />
          <span aria-hidden className='absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent' />
          <div className='absolute bottom-3 left-5 right-5'>
            <DialogTitle className='text-xl font-extrabold tracking-tight'>{card.title}</DialogTitle>
            <DialogDescription className='text-[12.5px] text-muted-foreground'>{TYPE_LABEL[card.type]}</DialogDescription>
          </div>
        </div>

        {done ? (
          <div className='flex flex-col items-center gap-3 px-6 pb-6 pt-4 text-center'>
            <CheckCircle weight='fill' size={44} />
            <span className='text-lg font-extrabold'>{mode === 'gift' ? txa('Hediye gönderildi') : txa('Envanterine eklendi')}</span>
            <span className='text-[13px] text-muted-foreground'>
              {txa('Sipariş {code} · {paid} Coin ödendi · kalan bakiye {balance}', { code: done.orderCode, paid: formatCoin(done.paid), balance: formatCoin(done.balance) })}
            </span>
            {mode === 'self' && card.kind !== 'premium' && (
              <Link to={currentUser ? `/profil/${currentUser.username}` : '/'} className='mt-1 rounded-full bg-foreground px-4 py-2 text-[13px] font-bold text-background'>
                {txa('Profilinde kuşan')}
              </Link>
            )}
            <button type='button' onClick={() => onOpenChange(false)} className='text-[13px] font-bold text-muted-foreground hover:text-foreground'>{txa('Kapat')}</button>
          </div>
        ) : (
          <div className='flex flex-col gap-4 px-5 pb-5 pt-3'>
            {giftable && (
              <div className='grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1'>
                {([['self', txa('Kendime'), ShoppingBag], ['gift', txa('Hediye et'), Gift]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type='button'
                    onClick={() => { setMode(key); setError(null) }}
                    className={cn('flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-bold transition-colors', mode === key ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground')}
                  >
                    <Icon weight={mode === key ? 'fill' : 'regular'} size={14} />{label}
                  </button>
                ))}
              </div>
            )}

            {mode === 'gift' && (
              <div className='flex flex-col gap-2'>
                {recipient ? (
                  <div className='flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2'>
                    <img src={recipient.avatar} alt='' className='size-8 rounded-full object-cover' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[13.5px] font-bold'>{recipient.displayName}</span>
                      <span className='block truncate text-[12px] text-muted-foreground'>@{recipient.username}</span>
                    </span>
                    <button type='button' aria-label={txa('Alıcıyı değiştir')} onClick={() => setRecipient(null)} className='flex size-7 items-center justify-center rounded-full bg-transparent text-muted-foreground hover:bg-accent'>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className='relative flex items-center'>
                    <MagnifyingGlass size={15} className='pointer-events-none absolute left-3 text-muted-foreground' />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={txa('Kime hediye edeceksin? Kullanıcı adı ara')}
                      aria-label={txa('Hediye alıcısı ara')}
                      className='h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[13.5px] outline-none focus:border-foreground/40'
                    />
                  </label>
                )}
                {!recipient && results.length > 0 && (
                  <ul className='max-h-48 overflow-y-auto rounded-xl border border-border bg-popover p-1'>
                    {results.map((user) => (
                      <li key={user.id}>
                        <button type='button' onClick={() => { setRecipient(user); setQuery('') }} className='flex w-full items-center gap-2.5 rounded-lg bg-transparent px-2 py-1.5 text-left hover:bg-accent'>
                          <img src={user.avatar} alt='' className='size-7 rounded-full object-cover' />
                          <span className='min-w-0 truncate text-[13px] font-semibold'>{user.displayName}</span>
                          <span className='truncate text-[12px] text-muted-foreground'>@{user.username}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {recipient && (
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value.slice(0, 200))}
                    placeholder={txa('Not ekle (isteğe bağlı)')}
                    aria-label={txa('Hediye notu')}
                    rows={2}
                    className='resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40'
                  />
                )}
              </div>
            )}

            <div className='flex flex-col gap-2 rounded-xl bg-muted/40 p-3.5 text-[13.5px]'>
              {quote.price < quote.listPrice && (
                <div className='flex justify-between'><span className='text-muted-foreground'>{txa('Liste fiyatı')}</span><span className='line-through text-muted-foreground'>{formatCoin(quote.listPrice)}</span></div>
              )}
              {sourceLabel && <div className='flex justify-between'><span className='text-muted-foreground'>{sourceLabel}</span><span className='text-foreground'>{txa('uygulandı')}</span></div>}
              {quote.partial && (
                <div className='flex justify-between'><span className='text-muted-foreground'>{mode === 'gift' ? txa('Alıcıda olan parçalar') : txa('Sende olan parçalar')}</span><span className='text-foreground'>{txa('{v1}/{v2} düşüldü', { v1: quote.ownedCount, v2: quote.grantCount })}</span></div>
              )}
              <div className='flex items-baseline justify-between border-t border-border/70 pt-2'>
                <span className='font-bold'>{txa('Ödenecek')}</span>
                <span className='flex items-center gap-1 text-xl font-extrabold tabular-nums text-foreground'>
                  {quoting ? <SpinnerGap size={16} className='animate-spin' /> : <Coins weight='fill' size={17} />}
                  {formatCoin(quote.price)}
                </span>
              </div>
              <div className='flex justify-between text-[12.5px]'><span className='text-muted-foreground'>{txa('Bakiyen')}</span><span className='tabular-nums'>{formatCoin(balance)}</span></div>
              <div className='flex justify-between text-[12.5px]'>
                <span className='text-muted-foreground'>{txa('Sonra kalan')}</span>
                <span className={cn('font-bold tabular-nums', after < 0 ? 'text-muted-foreground line-through' : 'text-foreground')}>{formatCoin(after)}</span>
              </div>
            </div>

            {!currentUser && <p className='text-center text-[13px] text-muted-foreground'>{txa('Satın almak için giriş yapmalısın.')}</p>}
            {blocked && <p className='text-center text-[13px] font-semibold text-foreground'>{mode === 'gift' && quote.reason === 'owned' ? txa('Alıcıda bu ürün zaten var.') : blocked}</p>}
            {after < 0 && quote.purchasable && <p className='text-center text-[13px] text-muted-foreground'>{txa('Bakiyen yetmiyor. Görev ve kodlarla Coin kazanabilirsin.')}</p>}
            {error && <p className='text-center text-[13px] text-foreground' role='alert'>{error}</p>}

            <button
              type='button'
              onClick={() => { void submit() }}
              disabled={!canSubmit}
              className='flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground text-[14.5px] font-extrabold text-background transition-opacity disabled:opacity-45'
              data-testid='shop-purchase-confirm'
            >
              {submitting && <SpinnerGap size={16} className='animate-spin' />}
              {mode === 'gift' ? txa('Hediye et') : txa('Satın al')} · {formatCoin(quote.price)}{' '}{txa('Coin')}
            </button>
            <p className='text-center text-[11.5px] leading-relaxed text-muted-foreground' data-testid='shop-purchase-policy'>
              {txa('Devam ederek')}{' '}<Link to={STORE_RULES_PATH} className='font-semibold text-foreground hover:underline'>{txa('Mağaza ve Coin Kuralları')}</Link>{' '}{txa('ile')}{' '}
              <Link to={REFUND_POLICY_PATH} className='font-semibold text-foreground hover:underline'>{txa('İade Politikası')}</Link>{txa("'nı kabul etmiş olursun.")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
