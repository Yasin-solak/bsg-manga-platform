import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowCounterClockwise, Check, Coins, Lock, ShoppingBagOpen, TShirt } from '@phosphor-icons/react'
import '@/components/games/arcade.css'
import { Murek } from '@/components/murek/Murek'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  buyMurekItem,
  equipMurek,
  getMurekShop,
  previewMurekLook,
  toMurekErrorMessage,
  type MurekItem,
  type MurekItemKind,
  type MurekLook,
  type MurekShop,
} from '@/services/murekService'
import { toast } from '@/services/toastService'
import { formatCoin } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Closet: colors and accessories for the mascot Mürek. Clicking a piece TRIES it on stage
 * (without buying); an owned piece equips in one click, others are bought with coins (two-step confirm).
 * Fully cosmetic; in games and on the home page your Mürek appears with this look.
 */

const RARITY: Record<MurekItem['rarity'], { label: string, dot: string, ring: string }> = {
  common: { get label() { return txa('Yaygın') }, dot: 'bg-zinc-400', ring: 'ring-zinc-400/40' },
  rare: { get label() { return txa('Nadir') }, dot: 'bg-sky-400', ring: 'ring-sky-400/50' },
  epic: { get label() { return txa('Destansı') }, dot: 'bg-violet-400', ring: 'ring-violet-400/60' },
  legendary: { get label() { return txa('Efsanevi') }, dot: 'bg-amber-400', ring: 'ring-amber-400/70' },
}

const KIND_TABS: Array<{ id: MurekItemKind, label: string }> = [
  { id: 'color', get label() { return txa('Renkler') } },
  { id: 'accessory', get label() { return txa('Aksesuarlar') } },
]

function tileLook(item: MurekItem): MurekLook {
  return item.kind === 'color'
    ? { color: item.id, colorHex: item.data.hex ?? '#7c6cff', animated: item.data.animated ?? null, accessory: null, colorName: item.name, accessoryName: null }
    : { color: 'mor', colorHex: '#7c6cff', animated: null, accessory: item.id, colorName: null, accessoryName: item.name }
}

export function ShopMurekView() {
  const { currentUser, updateCurrentUser } = useAuth()
  const [shop, setShop] = useState<MurekShop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<MurekItemKind>('color')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMurekShop()
      .then((next) => { if (!cancelled) setShop(next) })
      .catch((loadError) => { if (!cancelled) setError(toMurekErrorMessage(loadError)) })
    return () => { cancelled = true }
  }, [currentUser?.id])

  const owned = useMemo(() => new Set(shop?.owned ?? ['mor']), [shop?.owned])
  const selected = shop?.items.find((item) => item.id === selectedId) ?? null
  const equipped = shop?.look
  const preview = equipped ? previewMurekLook(equipped, selected) : null
  const items = (shop?.items ?? []).filter((item) => item.kind === kind)
  const isEquipped = (item: MurekItem) => (item.kind === 'color' ? equipped?.color === item.id : equipped?.accessory === item.id)

  const apply = (next: MurekShop, message: string) => {
    setShop(next)
    if (typeof next.balance === 'number') updateCurrentUser({ stones: next.balance })
    toast.success(message)
  }

  const buy = async (item: MurekItem) => {
    if (confirming !== item.id) { setConfirming(item.id); return }
    setBusy(true)
    try {
      apply(await buyMurekItem(item.id), txa('{v1} dolabında ve kuşanıldı!', { v1: item.name }))
      setConfirming(null)
    } catch (buyError) {
      toast.error(toMurekErrorMessage(buyError))
    } finally {
      setBusy(false)
    }
  }

  const wear = async (item: MurekItem | null, slot?: MurekItemKind) => {
    if (!equipped) return
    setBusy(true)
    try {
      const color = item?.kind === 'color' ? item.id : slot === 'color' ? 'mor' : equipped.color
      const accessory = item?.kind === 'accessory' ? item.id : slot === 'accessory' ? null : equipped.accessory
      apply(await equipMurek(color, accessory), item ? txa('{v1} kuşanıldı.', { v1: item.name }) : txa('Mürek sadeleşti.'))
    } catch (equipError) {
      toast.error(toMurekErrorMessage(equipError))
    } finally {
      setBusy(false)
    }
  }

  const balance = shop?.balance ?? currentUser?.stones ?? 0

  return (
    <div className='arcade space-y-6' data-testid='shop-murek'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <p className='m-0 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--arcade-ink)]'>{txa('Mağaza')}</p>
          <h1 className='m-0 text-3xl font-black tracking-tight'>{txa('Mürek Dolabı')}</h1>
          <p className='m-0 mt-1 text-sm text-muted-foreground'>{txa('Mürek\'ini giydir. Oyunlarda ve ana sayfada senin Mürek\'in böyle görünür. Tamamen kozmetik.')}</p>
        </div>
        {currentUser && (
          <span className='inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-black' data-testid='shop-murek-balance'>
            <Coins className='size-4 text-amber-500' weight='fill' />{formatCoin(balance)}
          </span>
        )}
      </div>

      {error ? (
        <p className='rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground'>{error}</p>
      ) : (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start'>
          {/* Sahne: secili parcayi dener; altinda o parcaya gore aksiyon. */}
          <div className='px-frame arcade-stage overflow-hidden lg:sticky lg:top-24' data-tone='ink'>
            <div className='flex h-[300px] flex-col items-center justify-end pb-6'>
              {preview ? (
                <Murek mood={selected && !owned.has(selected.id) ? 'cheer' : 'happy'} motion='bob' size={180} color={preview.colorHex} accessory={preview.accessory} animated={preview.animated} title={txa('Mürek önizleme')} />
              ) : (
                <span className='h-[180px] w-[180px] animate-pulse rounded-3xl bg-muted/40' />
              )}
              <div className='arcade-ground mt-2 w-48' />
            </div>
            <div className='space-y-3 border-t-[3px] border-[var(--arcade-line)] bg-card p-4'>
              {selected ? (
                <>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='m-0 text-lg font-black'>{selected.name}</p>
                      <p className='m-0 text-[13px] text-muted-foreground'>{selected.description}</p>
                    </div>
                    <span className='inline-flex shrink-0 items-center gap-1.5 text-[11px] font-black text-muted-foreground'><span className={cn('size-2 rounded-full', RARITY[selected.rarity].dot)} />{RARITY[selected.rarity].label}</span>
                  </div>
                  {!currentUser ? (
                    <Link to='/giris' className='px-btn w-[calc(100%-6px)]'>{txa('Satın almak için giriş yap')}</Link>
                  ) : isEquipped(selected) ? (
                    <div className='flex gap-2'>
                      <span className='px-btn flex-1' data-variant='ghost'><Check className='size-4' />{txa('Kuşanılı')}</span>
                      {selected.id !== 'mor' && <button type='button' className='px-btn' data-variant='ghost' disabled={busy} onClick={() => void wear(null, selected.kind)}>{txa('Çıkar')}</button>}
                    </div>
                  ) : owned.has(selected.id) ? (
                    <button type='button' className='px-btn w-[calc(100%-6px)]' disabled={busy} onClick={() => void wear(selected)} data-testid='shop-murek-wear'><TShirt className='size-4' />{txa('Kuşan')}</button>
                  ) : (
                    <button
                      type='button'
                      className='px-btn w-[calc(100%-6px)]'
                      data-variant={confirming === selected.id ? 'coin' : undefined}
                      disabled={busy || balance < selected.price}
                      onClick={() => void buy(selected)}
                      data-testid='shop-murek-buy'
                    >
                      <ShoppingBagOpen className='size-4' />
                      {balance < selected.price ? txa('{v1} coin eksik', { v1: formatCoin(selected.price - balance) }) : confirming === selected.id ? txa('Onayla · {v1} coin', { v1: formatCoin(selected.price) }) : txa('Satın al · {v1} coin', { v1: formatCoin(selected.price) })}
                    </button>
                  )}
                </>
              ) : (
                <div className='flex items-center justify-between gap-3'>
                  <p className='m-0 text-sm text-muted-foreground'>{txa('Bir parçaya dokun, Mürek\'in üstünde dene.')}</p>
                  {currentUser && equipped && (equipped.color !== 'mor' || equipped.accessory) && (
                    <button type='button' className='px-btn' data-variant='ghost' disabled={busy} onClick={() => void equipMurek('mor', null).then((next) => apply(next, txa('Mürek varsayılan haline döndü.'))).catch((resetError) => toast.error(toMurekErrorMessage(resetError)))}>
                      <ArrowCounterClockwise className='size-4' />{txa('Sıfırla')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className='min-w-0 space-y-4'>
            <div className='inline-flex rounded-xl bg-muted/60 p-1' role='tablist'>
              {KIND_TABS.map((tab) => (
                <button key={tab.id} type='button' role='tab' aria-selected={kind === tab.id} onClick={() => { setKind(tab.id); setConfirming(null) }} className={cn('h-9 rounded-lg px-4 text-[13px] font-bold', kind === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4' data-testid='shop-murek-grid'>
              {!shop && Array.from({ length: 8 }, (_, index) => <span key={index} className='h-[190px] animate-pulse rounded-2xl bg-muted/40' />)}
              {items.map((item) => {
                const look = tileLook(item)
                const mine = owned.has(item.id)
                const active = selectedId === item.id
                return (
                  <button
                    key={item.id}
                    type='button'
                    onClick={() => { setSelectedId(active ? null : item.id); setConfirming(null) }}
                    className={cn('group relative flex flex-col items-center rounded-2xl border bg-card p-3 text-left transition-transform hover:-translate-y-0.5', active ? 'border-[var(--arcade-ink)] ring-2 ring-[var(--arcade-ink)]/40' : 'border-border')}
                    data-testid='shop-murek-item'
                    data-murek-item={item.id}
                    aria-pressed={active}
                  >
                    <span className={cn('arcade-stage flex h-[110px] w-full items-end justify-center rounded-xl pb-2 ring-1', RARITY[item.rarity].ring)}>
                      <Murek mood='happy' motion={active ? 'bob' : 'none'} size={78} color={look.colorHex} accessory={look.accessory} animated={look.animated} />
                    </span>
                    <span className='mt-2.5 flex w-full items-center gap-1.5'>
                      <span className={cn('size-2 shrink-0 rounded-full', RARITY[item.rarity].dot)} />
                      <span className='truncate text-[13.5px] font-black'>{item.name}</span>
                    </span>
                    <span className='mt-1 flex w-full items-center justify-between text-[12px] font-bold'>
                      {isEquipped(item) ? (
                        <span className='inline-flex items-center gap-1 text-[var(--arcade-good)]'><Check className='size-3.5' weight='bold' />{txa('Kuşanılı')}</span>
                      ) : mine ? (
                        <span className='text-muted-foreground'>{txa('Dolabında')}</span>
                      ) : (
                        <span className='inline-flex items-center gap-1'><Coins className='size-3.5 text-amber-500' weight='fill' />{formatCoin(item.price)}</span>
                      )}
                      {!mine && balance < item.price && currentUser && <Lock className='size-3.5 text-muted-foreground' />}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className='m-0 text-[12px] text-muted-foreground'>{txa('Coin\'i oyunlardan, görevlerden ve okuma serisinden kazanabilirsin. Rastgele kutu yok: ne görüyorsan onu alırsın.')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
