import { useEffect, useState } from 'react'
import { CheckCircle, Crown, Heart, MoonStars, Sparkle, X } from '@phosphor-icons/react'
import { listMangas } from '@/services/mangaService'
import type { Manga } from '@/types'
import { cn } from '@/lib/utils'
import { ExploreMobileCard } from './ExploreMobileCard'
import type { ExploreData } from './useExploreData'
import { intlLocale, txa } from '@/i18n/activeLocale'

// Chapter counts are not in the catalog, so verifiable states are used instead of a duration claim.
const MOODS = [
  { id: 'completed', get label() { return txa('Baştan sona') }, get note() { return txa('Bitmiş seriler') }, icon: CheckCircle, genres: [], status: 'completed' },
  { id: 'new', get label() { return txa('Yeni keşifler') }, get note() { return txa('Yeni eklenenler') }, icon: Sparkle, genres: [], status: 'new' },
  { id: 'night', get label() { return txa('Gece ürpertisi') }, get note() { return txa('Korku · Gizem') }, icon: MoonStars, genres: ['horror', 'mystery'], status: 'all' },
  { id: 'soft', get label() { return txa('Hafif & tatlı') }, get note() { return txa('Okul · Romantizm') }, icon: Heart, genres: ['school', 'romance'], status: 'all' },
  { id: 'epic', get label() { return txa('Destansı') }, get note() { return txa('Fantastik · Aksiyon') }, icon: Crown, genres: ['fantasy', 'action'], status: 'all' },
]
export function ExploreMobileMoods({ resolveGenreQueryValues }: Pick<ExploreData, 'resolveGenreQueryValues'>) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<Manga[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const active = MOODS.find(m => m.id === activeId)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setLoading(true); setError(false); setItems([])
    void listMangas({ genres: resolveGenreQueryValues(active.genres), status: active.status, sort: 'rating', limit: 6 }, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setItems(result.data); setCount(result.count) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [active, resolveGenreQueryValues, retry])
  return <section aria-label={txa('Bugün havam')}>
    <div className="flex items-start justify-between">
      <div><h2 className="explore-mobile-heading">{txa('Bugün havam')}</h2><p className="explore-mobile-note">{txa('Bir hava seç, sana uygun seriler altta çıkar')}</p></div>
      {active && <button className="flex min-h-11 items-center gap-1 text-xs font-bold" onClick={() => setActiveId(null)}><X size={14} />{txa('Temizle')}</button>}
    </div>
    <div className="explore-mobile-rail mt-3 gap-2">
      {MOODS.map(({ id, label, note, icon: Icon }) => <button key={id} type="button" aria-pressed={activeId === id}
        onClick={() => setActiveId(activeId === id ? null : id)}
        className={cn('flex min-h-[84px] w-[118px] shrink-0 snap-start flex-col items-start justify-center gap-[3px] rounded-[15px] border px-3 py-2.5 text-left', activeId === id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
        <Icon size={17} weight="bold" className="mb-0.5" /><span className="text-xs font-black">{txa(label)}</span><span className="text-[10px] font-bold text-muted-foreground">{note}</span>
      </button>)}
    </div>
    {active && <div className="mt-3.5 rounded-[18px] border border-primary/30 bg-primary/10 p-3.5" aria-live="polite" aria-busy={loading}>
      <h3 className="text-[13.5px] font-black">{txa(active.label)}</h3>
      {error ? <div role="alert" className="py-3 text-sm">{txa('Seriler yüklenemedi.')} <button className="min-h-11 font-bold underline" onClick={() => setRetry(x => x + 1)}>{txa('Tekrar dene')}</button></div> : <>
        <p className="mt-1 text-[11px] font-bold text-primary">{loading ? txa('Seriler aranıyor…') : txa('{count} seri eşleşti · puana göre sıralı', { count: count.toLocaleString(intlLocale()) })}</p>
        {!loading && !items.length && <p className="py-4 text-xs text-muted-foreground">{txa('Bu havada henüz seri yok. Başka bir hava dene.')}</p>}
        <div className="hide-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
          {loading ? [0, 1, 2].map(i => <div key={i} className="h-[150px] w-28 shrink-0 animate-pulse rounded-2xl bg-muted" />) : items.map(m => <ExploreMobileCard key={m.id} manga={m} compact />)}
        </div>
      </>}
    </div>}
  </section>
}
