import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, Inbox, Plus, Search, X } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { shopAdmin, type ShopAdminProduct, type ShopAdminSeason, type ShopAdminSettings, type ShopStatus } from '@/services/shopAdminService'
import { toast } from '@/services/toastService'
import { ShopPreview } from '@/pages/shop/ShopPreview'
import { TYPE_LABEL } from '@/pages/shop/shopFormat'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { ShopAdminProductEditor } from './ShopAdminProductEditor'
import { StateChip } from './ShopAdminKit'
import { ShopProductDetailPane } from './ShopProductDetailPane'
import { ADMIN_RARITY, formatNumber, ISSUE_LABEL, toPreviewCard } from './shopAdminFormat'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Products (and Bundles) desk: status views (with counts), search, paged
 * list + selected product panel; editing is in a detail editor, status
 * changes and bulk actions go through a dialog explaining the result.
 */

type Filter = 'all' | 'live' | 'upcoming' | 'draft' | 'issues' | 'ended' | 'archived'

export const PRODUCTS_PER_PAGE = 20

const FILTERS: Array<{ value: Filter, label: string }> = [
  { value: 'all', get label() { return txa('Tümü') } },
  { value: 'live', get label() { return txa('Satışta') } },
  { value: 'upcoming', get label() { return txa('Planlandı') } },
  { value: 'draft', get label() { return txa('Taslak') } },
  { value: 'issues', get label() { return txa('Sorunlu') } },
  { value: 'ended', get label() { return txa('Bitti') } },
  { value: 'archived', get label() { return txa('Arşiv') } },
]

const STATUS_CONSEQUENCE: Record<ShopStatus, string> = {
  get published() { return txa('Satış penceresi başladıysa ürün hemen mağazada görünür ve satın alınabilir; başlamadıysa "Planlandı" olur.') },
  get draft() { return txa('Ürün mağazadan kalkar ve satın alınamaz. Daha önce alanların envanteri etkilenmez.') },
  get archived() { return txa('Ürün mağazadan kalkar ve listelerde Arşiv\'e taşınır. Satılmış ürünler silinmez, arşivlenir; alanların envanteri etkilenmez.') },
}

const STATUS_ACTION: Record<ShopStatus, { title: string, label: string, bulk: string }> = {
  published: { get title() { return txa('Yayınla') }, get label() { return txa('Yayınla') }, bulk: 'publish' },
  draft: { get title() { return txa('Taslağa al') }, get label() { return txa('Taslağa al') }, bulk: 'draft' },
  archived: { get title() { return txa('Arşivle') }, get label() { return txa('Arşivle') }, bulk: 'archive' },
}

async function loadAll() {
  const [active, archived] = await Promise.all([shopAdmin.products('all'), shopAdmin.products('archived')])
  return [...active, ...archived]
}

function Tick({ checked, indeterminate = false, label, onChange }: { checked: boolean, indeterminate?: boolean, label: string, onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => { if (node) node.indeterminate = indeterminate }}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer accent-primary"
    />
  )
}

export function ShopAdminProducts({ mode, seasons, settings, openProductId, onOpenedProduct, revision = 0 }: {
  mode: 'all' | 'bundle'
  seasons: ShopAdminSeason[]
  settings: ShopAdminSettings | null
  openProductId?: string | null
  onOpenedProduct?: () => void
  /** Refresh from the parent section; the list reloads when it increments. */
  revision?: number
}) {
  const desk = useDeskLayout()
  const { data, loading, error, reload } = useShopQuery('shop-admin-products', loadAll)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<{ product: ShopAdminProduct | null, kind: ShopAdminProduct['kind'] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  const all = useMemo(() => data ?? [], [data])
  const scoped = useMemo(() => all.filter((product) => mode === 'all' || product.kind === 'bundle'), [all, mode])

  useEffect(() => {
    if (revision > 0) reload()
    // Yalniz Yenile'ye basilinca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  useEffect(() => {
    if (!openProductId || !data) return
    const target = data.find((product) => product.id === openProductId)
    if (target) {
      setFocusedId(target.id)
      setEditing({ product: target, kind: target.kind })
    }
    onOpenedProduct?.()
  }, [data, onOpenedProduct, openProductId])

  const matches = (product: ShopAdminProduct, value: Filter) => {
    if (value === 'all') return product.status !== 'archived'
    if (value === 'archived') return product.status === 'archived'
    if (value === 'draft') return product.status === 'draft'
    if (value === 'issues') return product.status !== 'archived' && product.issues.some((issue) => issue.level === 'error')
    return product.state === value
  }
  const count = (value: Filter) => scoped.filter((product) => matches(product, value)).length
  const query = search.trim().toLocaleLowerCase(intlLocale())
  const rows = scoped.filter((product) => matches(product, filter) && (!query || product.title.toLocaleLowerCase(intlLocale()).includes(query) || product.slug.includes(query)))
  const totalPages = Math.max(1, Math.ceil(rows.length / PRODUCTS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * PRODUCTS_PER_PAGE, safePage * PRODUCTS_PER_PAGE)
  const focused = pageRows.find((product) => product.id === focusedId) ?? null
  const selectedRows = scoped.filter((product) => selected.includes(product.id))
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((product) => selected.includes(product.id))

  // On desktop a selection always exists: when the selected product leaves the view, the same position opens.
  useEffect(() => {
    if (focused) {
      lastIndexRef.current = pageRows.indexOf(focused)
      return
    }
    if (!desk || !data) return
    const next = pageRows[Math.min(lastIndexRef.current, pageRows.length - 1)]
    if (next) setFocusedId(next.id)
  }, [data, desk, focused, pageRows])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  const select = (product: ShopAdminProduct) => {
    setFocusedId(product.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = focused ? pageRows.indexOf(focused) : -1
    const next = pageRows[Math.max(0, Math.min(pageRows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setFocusedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-product-id="${next.id}"]`)?.focus())
  }

  const changeFilter = (value: Filter) => {
    setFilter(value)
    setPage(1)
    setSelected([])
  }

  const askStatus = (targets: ShopAdminProduct[], status: ShopStatus) => {
    const list = targets.filter((product) => product.status !== status)
    if (!list.length) return
    const action = STATUS_ACTION[status]
    const withErrors = status === 'published' ? list.filter((product) => product.issues.some((issue) => issue.level === 'error')).length : 0
    setConfirm({
      title: list.length > 1 ? txa('{v1} ürünü {v2}', { v1: list.length, v2: action.label.toLocaleLowerCase(intlLocale()) }) : txa('Ürünü {v1}', { v1: action.label.toLocaleLowerCase(intlLocale()) }),
      subject: list.slice(0, 3).map((product) => product.title).join(', ') + (list.length > 3 ? txa(' ve {v1} ürün daha', { v1: list.length - 3 }) : ''),
      consequence: (
        <>
          {STATUS_CONSEQUENCE[status]}
          {withErrors ? <span className="mt-2 block font-semibold text-rose-700 dark:text-rose-300">{txa('{v1} üründe hata var (ör. görsel ya da içerik eksik); yine de yayınlanır.', { v1: withErrors })}</span> : null}
        </>
      ),
      confirmLabel: action.label,
      destructive: status === 'archived',
      run: async () => {
        setBusy(true)
        try {
          if (list.length === 1) await shopAdmin.setStatus('product', list[0].id, status)
          else await shopAdmin.bulkProducts(list.map((product) => product.id), action.bulk)
          toast.success(list.length > 1 ? txa('{v1} ürün güncellendi.', { v1: list.length }) : txa('{v1}: {v2} tamam.', { v1: list[0].title, v2: action.label.toLocaleLowerCase(intlLocale()) }))
          setSelected([])
          reload()
        } catch (reason) {
          toast.error(reason instanceof Error ? txa(reason.message) : txa('Ürün durumu değiştirilemedi.'))
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const setSeason = async (seasonId: string | null) => {
    if (!selected.length) return
    setBusy(true)
    try {
      const changed = await shopAdmin.bulkProducts(selected, 'set_season', { seasonId })
      toast.success(seasonId ? txa('{v1} ürün sezona atandı.', { v1: changed }) : txa('{v1} ürün sezondan çıkarıldı.', { v1: changed }))
      setSelected([])
      reload()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('Toplu işlem yapılamadı.'))
    } finally {
      setBusy(false)
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const detail = focused ? (
    <ShopProductDetailPane
      product={focused}
      layout={desk ? 'desk' : 'sheet'}
      busy={busy}
      onEdit={() => { setSheetOpen(false); setEditing({ product: focused, kind: focused.kind }) }}
      onSetStatus={(status) => askStatus([focused], status)}
    />
  ) : null

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="shop-admin-products">
      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Ürün durumları')}>
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {FILTERS.map((entry) => {
            const active = filter === entry.value
            const value = data ? count(entry.value) : null
            return (
              <button key={entry.value} type="button" aria-pressed={active} onClick={() => changeFilter(entry.value)} data-testid={`shop-products-view-${entry.value}`} className={cn('relative px-4 py-2.5 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{entry.label}</span>
                <span className={cn('block text-[18px] font-black leading-tight tabular-nums', entry.value === 'issues' && value ? 'text-rose-600 dark:text-rose-300' : null)}>{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} maxLength={120} placeholder={txa('Ürün adı ya da adresi')} aria-label={txa('Ürünlerde ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing({ product: null, kind: mode === 'bundle' ? 'bundle' : 'cosmetic' })} data-testid="shop-product-new">
          <Plus className="size-4" />{mode === 'bundle' ? txa('Yeni paket') : txa('Yeni ürün')}
        </Button>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="shop-products-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {pageRows.length > 0 ? (
            <div className="flex min-h-11 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-[12px]" data-testid="shop-products-bulk">
              <Tick checked={allOnPageSelected} indeterminate={selected.length > 0 && !allOnPageSelected} label={txa('Sayfadaki ürünleri seç')} onChange={(checked) => setSelected(checked ? pageRows.map((product) => product.id) : [])} />
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{txa('{v1} ürün', { v1: rows.length.toLocaleString(intlLocale()) })}</span>
              ) : (
                <>
                  <span className="font-semibold">{txa('{v1} seçili', { v1: selected.length })}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={busy} data-testid="shop-products-bulk-menu">{txa('İşlemler')}</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={() => askStatus(selectedRows, 'published')}>{txa('Yayınla…')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => askStatus(selectedRows, 'draft')}>{txa('Taslağa al…')}</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => askStatus(selectedRows, 'archived')}>{txa('Arşivle…')}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => { void setSeason(null) }}>{txa('Sezondan çıkar')}</DropdownMenuItem>
                        {seasons.map((season) => <DropdownMenuItem key={season.id} onSelect={() => { void setSeason(season.id) }}>{txa('Sezona ata: {v1}', { v1: season.name })}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="icon-sm" variant="ghost" aria-label={txa('Seçimi temizle')} onClick={() => setSelected([])}><X className="size-3.5" /></Button>
                  </span>
                </>
              )}
            </div>
          ) : null}
          {loading && !data ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="shop-products-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></span>
              <span className="text-[13px] font-semibold">{query ? txa('Aramaya uyan ürün yok') : mode === 'bundle' && filter === 'all' ? txa('Henüz paket yok') : txa('Bu görünümde ürün yok')}</span>
              {mode === 'bundle' && filter === 'all' && !query ? <span className="max-w-[32ch] text-[12px] text-muted-foreground">{txa('"Yeni paket" ile iki ya da daha fazla kozmetiği birlikte sat.')}</span> : null}
              {filter !== 'all' ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => changeFilter('all')}>{txa('Tümünü göster')}</Button> : null}
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Ürünler')} onKeyDown={handleListKey} ref={listRef} data-testid="shop-products-list">
              {pageRows.map((product) => {
                const current = product.id === focusedId
                const firstError = product.issues.find((issue) => issue.level === 'error')
                return (
                  <li key={product.id} className={cn('relative flex items-center gap-3 pl-4 transition-colors hover:bg-muted/40', current && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}>
                    <Tick checked={selected.includes(product.id)} label={txa('{v1} seç', { v1: product.title })} onChange={(checked) => setSelected((list) => (checked ? [...list, product.id] : list.filter((id) => id !== product.id)))} />
                    <button
                      type="button"
                      onClick={() => select(product)}
                      aria-current={current ? 'true' : undefined}
                      data-product-id={product.id}
                      data-testid={`shop-products-row-${product.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-4 text-left outline-none focus-visible:bg-muted/50"
                    >
                      <ShopPreview card={toPreviewCard(product)} variant="thumb" className="size-10 flex-none rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{product.title}</span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {TYPE_LABEL[product.type]} · <span className={ADMIN_RARITY[product.rarity].ink}>{ADMIN_RARITY[product.rarity].label}</span>
                          {product.orders ? txa(' · {v1} satış', { v1: formatNumber(product.orders) }) : ''}
                        </span>
                        {product.state !== 'live' || firstError ? (
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            {product.state !== 'live' ? <StateChip state={product.state} className="h-5 px-2 text-[10.5px]" /> : null}
                            {firstError ? <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300"><CircleAlert className="size-3.5" />{ISSUE_LABEL[firstError.code] ?? firstError.code}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 self-start pt-0.5 text-[12px] font-bold tabular-nums text-amber-600 dark:text-amber-300">{formatNumber(product.basePrice)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {rows.length > PRODUCTS_PER_PAGE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{(safePage - 1) * PRODUCTS_PER_PAGE + 1}–{Math.min(rows.length, safePage * PRODUCTS_PER_PAGE)} / {rows.length.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={safePage <= 1} onClick={() => { setSelected([]); setPage(safePage - 1) }}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={safePage >= totalPages} onClick={() => { setSelected([]); setPage(safePage + 1) }}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir ürün seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Ürün ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Ürünü incele, düzenle ya da durumunu değiştir.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />

      {editing ? (
        <ShopAdminProductEditor
          open
          product={editing.product}
          initialKind={editing.kind}
          onClose={() => setEditing(null)}
          onSaved={reload}
          allProducts={all}
          seasons={seasons}
          settings={settings}
        />
      ) : null}
    </div>
  )
}
