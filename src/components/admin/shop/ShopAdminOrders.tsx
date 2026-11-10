import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Gift, Inbox, Loader2, Receipt, RotateCcw, Search } from 'lucide-react'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { shopAdmin, type ShopAdminOrder } from '@/services/shopAdminService'
import { toast } from '@/services/toastService'
import { TYPE_LABEL } from '@/pages/shop/shopFormat'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { StateChip } from './ShopAdminKit'
import { formatDateTime, formatNumber } from './shopAdminFormat'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Orders desk: search (code, product, user), status views, paged
 * list + selected order panel. Refund: coins return, the cosmetic leaves the buyer's
 * inventory / Premium time; the reason is required and recorded.
 */

type Status = 'all' | 'completed' | 'refunded'

export const ORDERS_PER_PAGE = 20

const SOURCE: Record<string, string> = { get list() { return txa('Liste fiyatı') }, get discount() { return txa('İndirim') }, get daily_deal() { return txa('Günün fırsatı') } }

const STATUS_VIEWS: Array<{ value: Status, label: string }> = [
  { value: 'all', get label() { return txa('Tümü') } },
  { value: 'completed', get label() { return txa('Tamamlanan') } },
  { value: 'refunded', get label() { return txa('İade edilen') } },
]

function Stat({ label, value, tone }: { label: string, value: ReactNode, tone?: 'amber' }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-[14px] font-bold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-300')}>{value}</dd>
    </div>
  )
}

function Person({ person }: { person: ShopAdminOrder['buyer'] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {person.avatar ? <img src={person.avatar} alt="" loading="lazy" className="size-6 shrink-0 rounded-full border border-border bg-muted object-cover" /> : <span className="size-6 shrink-0 rounded-full bg-muted" />}
      <span className="truncate text-[13px] font-semibold">@{person.username}</span>
    </span>
  )
}

function OrderDetailPane({ order, layout, onRefund }: { order: ShopAdminOrder, layout: 'desk' | 'sheet', onRefund: () => void }) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Sipariş ayrıntısı')}
      data-testid="shop-order-detail"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <StateChip state={order.status} />
            {order.isGift ? <span className="flex items-center gap-1 rounded-md bg-violet-500/12 px-1.5 py-px text-[10.5px] font-bold text-violet-700 dark:text-violet-300"><Gift className="size-3" />{txa('Hediye')}</span> : null}
          </span>
          <h2 className="mt-1 line-clamp-2 break-words text-[17px] font-bold tracking-tight [overflow-wrap:anywhere]">{order.title}</h2>
          <span className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground">{order.code} · {formatDateTime(order.createdAt)}</span>
        </span>
        {order.status === 'completed' ? (
          <Button size={layout === 'desk' ? 'sm' : 'default'} variant="outline" className={cn('shrink-0 gap-1.5', layout === 'sheet' && 'mr-8')} onClick={onRefund} data-testid="shop-order-refund"><RotateCcw className="size-4" />{txa('İade et')}</Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/50 sm:grid-cols-3 [&>*]:bg-card">
          <Stat label={txa('Ödenen')} value={`${formatNumber(order.paid)} Coin`} tone="amber" />
          <Stat label={txa('Liste fiyatı')} value={`${formatNumber(order.listPrice)} Coin`} />
          <Stat label={txa('Fiyat kaynağı')} value={SOURCE[order.source] ?? order.source} />
        </dl>

        <section className="space-y-2">
          <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{order.isGift ? txa('Alan → alıcı') : txa('Alan')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Person person={order.buyer} />
            {order.isGift ? <><span className="text-muted-foreground">→</span><Person person={order.recipient} /></> : null}
          </div>
          {order.message ? <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] italic [overflow-wrap:anywhere]">“{order.message}”</p> : null}
        </section>

        <section>
          <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Verilenler')}</h3>
          {order.premiumDays ? (
            <p className="text-[13px]">{txa('{v1} gün Premium', { v1: order.premiumDays })}</p>
          ) : order.granted.length ? (
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60 text-[12.5px]">
              {order.granted.map((grant) => (
                <li key={grant.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate font-mono">{grant.identifier}</span>
                  <span className="shrink-0 text-muted-foreground">{TYPE_LABEL[grant.type as keyof typeof TYPE_LABEL] ?? grant.type}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted-foreground">{txa('Kayıt yok.')}</p>}
        </section>

        {order.status === 'refunded' ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3" data-testid="shop-order-refund-state">
            <p className="text-[12.5px] font-bold text-amber-700 dark:text-amber-300">{txa('{v1} tarihinde iade edildi', { v1: formatDateTime(order.refundedAt) })}</p>
            {order.refundReason ? <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-5 [overflow-wrap:anywhere]">{order.refundReason}</p> : null}
          </section>
        ) : null}
      </div>
    </section>
  )
}

export function ShopAdminOrders({ revision = 0 }: { revision?: number }) {
  const desk = useDeskLayout()
  const [status, setStatus] = useState<Status>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useShopQuery(`shop-admin-orders-${status}-${query}`, () => shopAdmin.orders(query || null, status === 'all' ? null : status))
  const [page, setPage] = useState(1)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [refunding, setRefunding] = useState<ShopAdminOrder | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (revision > 0) reload()
    // Yalniz Yenile'ye basilinca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  // Searches on the server as you type (with a short delay).
  useEffect(() => {
    const next = search.trim()
    if (next === query) return undefined
    const handle = window.setTimeout(() => { setQuery(next); setPage(1) }, 300)
    return () => window.clearTimeout(handle)
  }, [query, search])

  const orders = data ?? []
  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageRows = orders.slice((safePage - 1) * ORDERS_PER_PAGE, safePage * ORDERS_PER_PAGE)
  const focused = pageRows.find((order) => order.id === focusedId) ?? null

  useEffect(() => {
    if (focused) {
      lastIndexRef.current = pageRows.indexOf(focused)
      return
    }
    if (!desk || !data) return
    const next = pageRows[Math.min(lastIndexRef.current, pageRows.length - 1)]
    if (next) setFocusedId(next.id)
  }, [data, desk, focused, pageRows])

  const select = (order: ShopAdminOrder) => {
    setFocusedId(order.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = focused ? pageRows.indexOf(focused) : -1
    const next = pageRows[Math.max(0, Math.min(pageRows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setFocusedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-order-id="${next.id}"]`)?.focus())
  }

  const refund = async () => {
    if (!refunding || reason.trim().length < 3) return
    setBusy(true)
    try {
      const result = await shopAdmin.refund(refunding.id, reason.trim())
      toast.success(txa('{v1} iade edildi: {v2} Coin geri yüklendi.', { v1: result.orderCode, v2: formatNumber(result.refunded) }))
      setRefunding(null)
      setReason('')
      reload()
    } catch (reasonError) {
      toast.error(reasonError instanceof Error ? txa(reasonError.message) : txa('İade edilemedi.'))
    } finally {
      setBusy(false)
    }
  }

  const detail = focused ? <OrderDetailPane order={focused} layout={desk ? 'desk' : 'sheet'} onRefund={() => { setSheetOpen(false); setReason(''); setRefunding(focused) }} /> : null

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="shop-admin-orders">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1" role="radiogroup" aria-label={txa('Sipariş durumu')}>
          {STATUS_VIEWS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="radio"
              aria-checked={status === entry.value}
              onClick={() => { setStatus(entry.value); setPage(1) }}
              data-testid={`shop-orders-view-${entry.value}`}
              className={cn('h-7 rounded-lg px-3 text-[12.5px] font-semibold transition-colors', status === entry.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} placeholder={txa('Sipariş kodu, ürün ya da kullanıcı')} aria-label={txa('Siparişlerde ara')} className="h-9 pl-9 text-[13px]" />
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="shop-orders-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && !data ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="shop-orders-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Receipt className="size-5" /></span>
              <span className="text-[13px] font-semibold">{query ? txa('Aramaya uyan sipariş yok') : txa('Bu görünümde sipariş yok')}</span>
              <span className="max-w-[36ch] text-[12px] text-muted-foreground">{txa('Eski mağaza siparişleri coin defterinde (Ekonomi → Cüzdan) görünür.')}</span>
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Siparişler')} onKeyDown={handleListKey} ref={listRef} data-testid="shop-orders-list">
              {pageRows.map((order) => {
                const current = order.id === focusedId
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => select(order)}
                      aria-current={current ? 'true' : undefined}
                      data-order-id={order.id}
                      data-testid={`shop-orders-row-${order.id}`}
                      className={cn(
                        'relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50',
                        current && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{order.title}</span>
                          {order.isGift ? <Gift className="size-3.5 shrink-0 text-violet-500" aria-label={txa('Hediye')} /> : null}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          <span className="font-mono">{order.code}</span> · @{order.buyer.username}{order.isGift ? ` → @${order.recipient.username}` : ''}
                        </span>
                        {order.status === 'refunded' ? <span className="mt-1 flex"><StateChip state="refunded" className="h-5 px-2 text-[10.5px]" /></span> : null}
                      </span>
                      <span className="shrink-0 self-start text-right">
                        <span className="block text-[12px] font-bold tabular-nums text-amber-600 dark:text-amber-300">{formatNumber(order.paid)}</span>
                        <span className="block text-[11px] tabular-nums text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {orders.length > ORDERS_PER_PAGE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{(safePage - 1) * ORDERS_PER_PAGE + 1}–{Math.min(orders.length, safePage * ORDERS_PER_PAGE)} / {orders.length.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir sipariş seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Sipariş ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Siparişi incele ya da iade et.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <Dialog open={Boolean(refunding)} onOpenChange={(open) => { if (!open && !busy) setRefunding(null) }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] sm:max-w-[460px]" data-testid="shop-order-refund-dialog">
          <DialogHeader>
            <DialogTitle>{txa('Siparişi iade et')}</DialogTitle>
            <DialogDescription>{refunding ? `${refunding.code} · ${refunding.title}` : ''}</DialogDescription>
          </DialogHeader>
          {refunding ? (
            <p className="rounded-xl bg-amber-500/[0.08] px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900 dark:text-amber-100">
              {txa('@{v1} kullanıcısına {v2} geri yüklenir;', { v1: refunding.buyer.username, v2: txa('{v1} Coin', { v1: formatNumber(refunding.paid) }) })}{' '}
              {refunding.premiumDays
                ? txa('{v1} günlük Premium süresi geri alınır.', { v1: refunding.premiumDays })
                : txa('verilen {v1} kozmetik @{v2} envanterinden çıkarılır (kuşanılmışsa çıkarılır).', { v1: refunding.granted.length, v2: refunding.recipient.username })}
              {' '}{txa('Kullanıcıya bildirim gider.')}
            </p>
          ) : null}
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder={txa('İade nedeni (zorunlu, kayda geçer)')} aria-label={txa('İade nedeni')} data-testid="shop-order-refund-reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)} disabled={busy}>{txa('Vazgeç')}</Button>
            <Button variant="destructive" className="gap-1.5" onClick={() => { void refund() }} disabled={busy || reason.trim().length < 3} data-testid="shop-order-refund-confirm">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{txa('İade et')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
