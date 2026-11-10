/**
 * FansubYonetKasaTab v2: studio 'Vault' tab.
 *
 * The balance comes from fansubs.coin_balance (the studio reads it separately), transactions from the
 * fansub_transactions ledger. If the ledger total disagrees with the balance the difference
 * is shown openly (some old purchases may not be in the ledger).
 *
 * Layout: a one-row balance strip on top, a paged transaction table below
 * (no long scrolling) with income sources + inventory summary beside it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Coins,
  Gift,
  HandHeart,
  Info,
  MagnifyingGlass,
  Package,
  ShoppingBag,
  Storefront,
  Ticket,
  Trophy,
  Wallet,
  type Icon,
} from '@phosphor-icons/react'
import { getFansubTransactions, listFansubInventory } from '@/services/fansubService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Panel, PanelEmpty, ToneIcon, type PanelTone } from '@/pages/profile/ProfileTabKit'
import { toErrorText } from './useFansubYonetState'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubTx = Awaited<ReturnType<typeof getFansubTransactions>>[number]
type FansubInventoryItem = Awaited<ReturnType<typeof listFansubInventory>>[number]
type TxKind = 'donation' | 'showcase' | 'reward' | 'code' | 'purchase' | 'gift' | 'other'
type KasaFilter = 'all' | 'income' | 'spend'

interface FansubYonetKasaTabProps {
  fansubId: string
  coinBalance: number
  /** Bakiye yeniden okunur (kasa yenilenince). */
  onRefreshBalance?: () => void | Promise<void>
}

const KIND_META: Record<TxKind, { label: string; icon: Icon; tone: PanelTone; bar: string }> = {
  donation: { get label() { return txa('Okur bağışı') }, icon: HandHeart, tone: 'emerald', bar: 'bg-emerald-400' },
  showcase: { get label() { return txa('Vitrin bağışı') }, icon: Storefront, tone: 'sky', bar: 'bg-sky-400' },
  reward: { get label() { return txa('Görev ödülü') }, icon: Trophy, tone: 'amber', bar: 'bg-amber-400' },
  code: { get label() { return txa('Kod kullanımı') }, icon: Ticket, tone: 'violet', bar: 'bg-violet-400' },
  purchase: { get label() { return txa('Mağaza alımı') }, icon: ShoppingBag, tone: 'rose', bar: 'bg-rose-400' },
  gift: { get label() { return txa('Üye hediyesi') }, icon: Gift, tone: 'primary', bar: 'bg-primary' },
  other: { get label() { return txa('Diğer') }, icon: Coins, tone: 'neutral', bar: 'bg-muted-foreground/50' },
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  get frame() { return txa('Çerçeve') },
  get background() { return txa('Arka plan') },
  get pattern() { return txa('Desen') },
  get profile_effect() { return txa('Profil efekti') },
  get name_style() { return txa('İsim stili') },
  get badge() { return txa('Rozet') },
}

const PAGE_SIZE = 10

/** Derives a readable type and short detail from the ledger's raw type + description. */
function describeTx(tx: FansubTx): { kind: TxKind; detail: string } {
  const text = (tx.description || '').trim()
  const quoted = text.match(/"([^"]+)"/)?.[1]
  if (tx.type === 'donation') {
    const note = text.split(' - ').slice(1).join(' - ').trim()
    return { kind: 'donation', detail: note ? `“${note}”` : txa('Mesaj yok') }
  }
  if (tx.type.startsWith('reward_')) return { kind: 'reward', detail: quoted || text || txa('Ödül') }
  if (tx.type === 'redeem') return { kind: 'code', detail: text.replace(/^Kod kullanimi:\s*/i, '') || txa('Kod') }
  if (tx.type === 'purchase') {
    if (tx.amount > 0) return { kind: 'showcase', detail: txa('Vitrindeki ürüne destek') }
    if (tx.amount === 0) {
      const value = text.match(/deger:\s*(\d+)/i)?.[1]
      return { kind: 'gift', detail: value ? txa('Bir üye {v1} coin değerinde ürün aldı', { v1: Number(value).toLocaleString(intlLocale()) }) : txa('Bir üye fansub için ürün aldı') }
    }
    return { kind: 'purchase', detail: text.match(/urun:\s*([^)]+)/i)?.[1]?.trim() || text || txa('Ürün') }
  }
  return { kind: 'other', detail: text || tx.type }
}

const fmt = (value: number) => Math.round(value).toLocaleString(intlLocale())
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))}`

function shortDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const today = new Date()
  const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000)
  const time = date.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return txa('Bugün {v1}', { v1: time })
  if (diff === 1) return txa('Dün {v1}', { v1: time })
  return date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Son 6 ayin gelir / gider dagilimi. */
function monthlyFlow(transactions: FansubTx[]) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString(intlLocale(), { month: 'short' }), income: 0, spend: 0 }
  })
  for (const tx of transactions) {
    const date = new Date(tx.createdAt)
    const bucket = months.find((month) => month.key === `${date.getFullYear()}-${date.getMonth()}`)
    if (!bucket) continue
    if (tx.amount > 0) bucket.income += tx.amount
    else bucket.spend += Math.abs(tx.amount)
  }
  return months
}

export default function FansubYonetKasaTab({ fansubId, coinBalance, onRefreshBalance }: FansubYonetKasaTabProps) {
  const [transactions, setTransactions] = useState<FansubTx[]>([])
  const [inventory, setInventory] = useState<FansubInventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<KasaFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [showAllInventory, setShowAllInventory] = useState(false)

  const load = useCallback(async () => {
    if (!fansubId) return
    setLoading(true)
    setError(null)
    void onRefreshBalance?.()
    try {
      const [txRows, invRows] = await Promise.all([getFansubTransactions(fansubId), listFansubInventory(fansubId)])
      setTransactions(txRows)
      setInventory(invRows)
    } catch (err) {
      setError(toErrorText(err, txa('Kasa verileri yüklenemedi.')))
    } finally {
      setLoading(false)
    }
  }, [fansubId, onRefreshBalance])

  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => transactions.map((tx) => ({ tx, ...describeTx(tx) })), [transactions])

  const totals = useMemo(() => {
    let income = 0, spend = 0, income30 = 0, spend30 = 0
    const since = Date.now() - 30 * 86_400_000
    const byKind = new Map<TxKind, number>()
    for (const { tx, kind } of rows) {
      const recent = new Date(tx.createdAt).getTime() >= since
      if (tx.amount > 0) {
        income += tx.amount
        if (recent) income30 += tx.amount
        byKind.set(kind, (byKind.get(kind) || 0) + tx.amount)
      } else {
        spend += Math.abs(tx.amount)
        if (recent) spend30 += Math.abs(tx.amount)
      }
    }
    const sources = [...byKind.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount)
    return { income, spend, income30, spend30, ledger: income - spend, sources }
  }, [rows])

  const flow = useMemo(() => monthlyFlow(transactions), [transactions])
  const flowMax = Math.max(1, ...flow.map((month) => Math.max(month.income, month.spend)))
  const ledgerGap = coinBalance - totals.ledger

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(intlLocale())
    return rows.filter(({ tx, kind, detail }) => {
      if (filter === 'income' && tx.amount <= 0) return false
      if (filter === 'spend' && tx.amount >= 0) return false
      if (!term) return true
      return `${KIND_META[kind].label} ${detail}`.toLocaleLowerCase(intlLocale()).includes(term)
    })
  }, [rows, filter, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const visibleInventory = showAllInventory ? inventory : inventory.slice(0, 8)

  return (
    <div className="flex flex-col gap-4" data-testid="studio-kasa">
      {/* Bakiye seridi: bakiye + 30 gun + 6 ay mini grafik tek satirda. */}
      <section className="grid gap-4 rounded-[20px] border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.12] via-card/70 to-card/60 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,300px)] lg:items-center">
        <div className="min-w-0">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-amber-600 dark:text-amber-300"><Wallet size={15} weight="fill" />{txa('Kasa bakiyesi')}</span>
          <span className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[34px] font-black leading-none tracking-tight tabular-nums" data-testid="studio-kasa-balance">{fmt(coinBalance)}</span>
            <span className="text-[13px] font-semibold text-muted-foreground">coin</span>
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-[12px] lg:border-x lg:border-border/50 lg:px-6">
          <div><dt className="text-muted-foreground">{txa('30 gün gelir')}</dt><dd className="text-[16px] font-black tabular-nums text-emerald-500">{signed(totals.income30)}</dd></div>
          <div><dt className="text-muted-foreground">{txa('30 gün gider')}</dt><dd className="text-[16px] font-black tabular-nums text-rose-500">{signed(-totals.spend30)}</dd></div>
          <div><dt className="text-muted-foreground">{txa('Varlık')}</dt><dd className="text-[16px] font-black tabular-nums">{fmt(inventory.length)}</dd></div>
        </dl>
        <div className="flex items-end gap-3">
          <div className="flex h-[54px] flex-1 items-end gap-2" aria-label={txa('Son 6 ay gelir ve gider')}>
            {flow.map((month) => (
              <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${month.label}: +${fmt(month.income)} / −${fmt(month.spend)}`}>
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <span className="w-1/2 max-w-[9px] rounded-t-sm bg-emerald-400/80" style={{ height: `${(month.income / flowMax) * 100}%`, minHeight: month.income ? 2 : 0 }} />
                  <span className="w-1/2 max-w-[9px] rounded-t-sm bg-rose-400/80" style={{ height: `${(month.spend / flowMax) * 100}%`, minHeight: month.spend ? 2 : 0 }} />
                </div>
                <span className="text-[10px] capitalize leading-none text-muted-foreground">{month.label}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="icon-sm" className="flex-none rounded-full" disabled={loading} onClick={() => void load()} aria-label={txa('Kasayı yenile')}>
            <ArrowClockwise size={14} className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
        {!loading && transactions.length > 0 && ledgerGap !== 0 && (
          <p className="flex items-start gap-2 text-[11.5px] text-muted-foreground lg:col-span-3">
            <Info size={13} weight="fill" className="mt-0.5 flex-none" />
            {txa('Hareket defterinin toplamı {v1} coin; bakiyeyle arasında {v2} coin fark var. Eski bazı harcamalar (takviye, mağaza) deftere yazılmamış olabilir.', { v1: fmt(totals.ledger), v2: signed(ledgerGap) })}
          </p>
        )}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title={txa('Hareketler')} icon={Coins} tone="primary" meta={txa('{v1} kayıt', { v1: fmt(filtered.length) })} className="xl:col-span-8" testId="studio-kasa-ledger">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-full border border-border/70 bg-background/40 p-0.5" role="tablist" aria-label={txa('Hareket filtresi')}>
              {([['all', txa('Tümü')], ['income', txa('Gelir')], ['spend', txa('Gider')]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => { setFilter(key); setPage(0) }}
                  className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', filter === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative sm:ml-auto sm:w-52">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder={txa('Ara: bağış, ürün, görev…')} className="h-8 rounded-full pl-8 text-[12.5px]" />
            </label>
          </div>

          {loading && !transactions.length ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">{txa('Yükleniyor…')}</p>
          ) : error ? (
            <p className="py-8 text-center text-[13px] text-destructive">{error}</p>
          ) : !filtered.length ? (
            <PanelEmpty
              icon={Wallet}
              title={transactions.length ? txa('Eşleşen hareket yok') : txa('Kasa henüz boş')}
              hint={transactions.length ? txa('Filtreyi ya da aramayı değiştir.') : txa('Okur bağışları, vitrin destekleri ve görev ödülleri burada listelenir.')}
              className="py-8"
            />
          ) : (
            <>
              <ul className="divide-y divide-border/50">
                {pageRows.map(({ tx, kind, detail }) => {
                  const meta = KIND_META[kind]
                  return (
                    <li key={tx.id} className="flex items-center gap-3 py-2">
                      <ToneIcon icon={meta.icon} tone={meta.tone} size="sm" />
                      <span className="w-28 flex-none truncate text-[12.5px] font-semibold sm:w-32">{meta.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground" title={tx.description || undefined}>{detail}</span>
                      <span className="hidden w-24 flex-none text-right text-[11.5px] text-muted-foreground sm:block">{shortDate(tx.createdAt)}</span>
                      <span className={cn('w-16 flex-none text-right text-[13px] font-black tabular-nums', tx.amount > 0 ? 'text-emerald-500' : tx.amount < 0 ? 'text-rose-500' : 'text-muted-foreground')}>
                        {tx.amount === 0 ? '0' : signed(tx.amount)}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {pageCount > 1 && (
                <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-[12px] text-muted-foreground">
                  <span className="tabular-nums">{fmt(safePage * PAGE_SIZE + 1)}–{fmt(Math.min(filtered.length, (safePage + 1) * PAGE_SIZE))} / {fmt(filtered.length)}</span>
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label={txa('Önceki sayfa')}><CaretLeft size={14} /></Button>
                    <span className="tabular-nums">{safePage + 1} / {pageCount}</span>
                    <Button variant="ghost" size="icon-sm" className="rounded-full" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label={txa('Sonraki sayfa')}><CaretRight size={14} /></Button>
                  </span>
                </div>
              )}
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Panel title={txa('Gelir kaynakları')} icon={HandHeart} tone="emerald" meta={txa('Toplam {v1} coin', { v1: fmt(totals.income) })}>
            {!totals.sources.length ? (
              <p className="text-[12.5px] text-muted-foreground">{txa('Henüz gelir yok. Okurlar profilinden bağış yaptıkça burada dağılım görünür.')}</p>
            ) : (
              <>
                <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
                  {totals.sources.map((source) => (
                    <span key={source.kind} className={KIND_META[source.kind].bar} style={{ width: `${(source.amount / Math.max(1, totals.income)) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
                  {totals.sources.map((source) => (
                    <li key={source.kind} className="flex items-center gap-2">
                      <span className={cn('size-2 flex-none rounded-full', KIND_META[source.kind].bar)} />
                      <span className="text-muted-foreground">{KIND_META[source.kind].label}</span>
                      <b className="ml-auto tabular-nums">{fmt(source.amount)}</b>
                      <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{txa('%{v1}', { v1: Math.round((source.amount / Math.max(1, totals.income)) * 100) })}</span>
                    </li>
                  ))}
                </ul>
                {totals.spend > 0 && (
                  <p className="mt-3 border-t border-border/50 pt-2 text-[12px] text-muted-foreground">{txa('Mağazada harcanan:')} <b className="tabular-nums text-foreground">{fmt(totals.spend)}</b> coin</p>
                )}
              </>
            )}
          </Panel>

          <Panel title={txa('Envanter')} icon={Package} tone="violet" meta={`${fmt(inventory.length)} kozmetik`}>
            {loading && !inventory.length ? null : !inventory.length ? (
              <p className="text-[12.5px] text-muted-foreground">{txa('Mağazadan fansub için alınan kozmetikler burada görünür.')}</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {visibleInventory.map((item) => (
                    <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted" title={`${item.name || item.identifier} · ${ITEM_TYPE_LABEL[item.type] || item.type}`}>
                      {item.customAssetUrl || item.image
                        ? <img src={item.customAssetUrl || item.image} alt={item.name || item.identifier} loading="lazy" decoding="async" className="size-full object-cover" />
                        : <span className="flex size-full items-center justify-center text-muted-foreground"><Package size={18} /></span>}
                    </div>
                  ))}
                </div>
                {inventory.length > 8 && (
                  <Button variant="ghost" size="sm" className="mt-2 w-full rounded-full" onClick={() => setShowAllInventory((value) => !value)}>
                    {showAllInventory ? txa('Daha az göster') : txa('Tümünü göster ({v1})', { v1: fmt(inventory.length) })}
                  </Button>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
