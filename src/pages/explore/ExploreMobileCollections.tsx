import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@/i18n/router'
import { Books, CaretRight, Play, Star } from '@phosphor-icons/react'
import { toast } from '@/services/toastService'
import type { Manga } from '@/types'
import type { MangaListSummary } from '@/services/mangaListService'
import { getExploreLists, getExploreFirstChapter } from '@/services/exploreMobileService'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ExploreMobileLists() {
  const [items, setItems] = useState<MangaListSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    void getExploreLists(controller.signal)
      .then(rows => { if (!controller.signal.aborted) setItems(rows) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])
  return <section>
    <div className="flex items-center justify-between gap-2"><h2 className="explore-mobile-heading">{txa('Listelerden seçkiler')}</h2><Link className="explore-mobile-more" to="/listeler">{txa('Listeler')}<CaretRight size={15} /></Link></div>
    <p className="explore-mobile-note">{txa('Okurların derlediği herkese açık listeler')}</p>
    {error ? <p role="alert" className="text-sm">{txa('Listeler yüklenemedi.')} <button className="min-h-11 font-bold underline" onClick={() => setRetry(x => x + 1)}>{txa('Tekrar dene')}</button></p> :
      <div className="explore-mobile-rail mt-3 gap-3">
        {loading ? [0, 1].map(i => <div key={i} className="h-[204px] w-[224px] shrink-0 animate-pulse rounded-[18px] bg-muted" />) : items.map(list =>
          <Link key={list.id} to={`/listeler/${encodeURIComponent(list.id)}`} className="relative w-[224px] shrink-0 snap-start overflow-hidden rounded-[18px] border border-border bg-card">
            <div className="relative h-[92px] overflow-hidden bg-muted">
              {list.coverImage && <img src={optimizePublicImageUrl(list.coverImage)} alt="" loading="lazy" decoding="async" className="size-full object-cover object-top" />}
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/80 px-2 py-1 text-[9px] font-black text-white"><Books size={11} weight="bold" />{txa('OKUR LİSTESİ')}</span>
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-[13px] font-extrabold">{list.title}</h3>
              <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{list.description}</p>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-bold"><span className="shrink-0">{txa('{v1} seri', { v1: list.itemsCount })}</span>{list.ratingsCount > 0 && <span className="flex shrink-0 items-center gap-1 text-amber-500"><Star size={11} weight="fill" />{list.ratingAvg.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })}</span>}<span className="ml-auto truncate text-muted-foreground">@{list.ownerUsername}</span></div>
            </div>
          </Link>)}
      </div>}
    {!loading && !error && !items.length && <p className="mt-3 rounded-2xl border border-border p-4 text-sm text-muted-foreground">{txa('Henüz paylaşılmış bir liste yok.')} <Link to="/listeler" className="font-bold text-primary">{txa('Listeleri keşfet')}</Link></p>}
  </section>
}

export function ExploreFirstChapter({ mangas }: { mangas: Manga[] }) {
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  async function read(manga: Manga) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller; setBusyId(manga.id)
    try {
      const chapter = await getExploreFirstChapter(manga.id, controller.signal)
      if (controller.signal.aborted) return
      if (!chapter) { toast.info(txa('Bu seride henüz yayımlanmış bölüm yok.')); return }
      navigate(buildPublicChapterPath({ mangaId: manga.id, mangaSlug: manga.slug, mangaTitle: manga.title,
        chapterId: chapter.id, chapterNumber: chapter.chapter_number, fansubId: chapter.fansub_id, forceVersionQuery: true }))
    } catch { if (!controller.signal.aborted) toast.error(txa('Bölüm yüklenemedi. Tekrar dene.')) }
    finally { request.current = null; if (!controller.signal.aborted) setBusyId(null) }
  }
  if (!mangas.length) return null
  return <section><h2 className="explore-mobile-heading">{txa('İlk bölümü dene')}</h2><p className="explore-mobile-note">{txa('Kaydetmeden önce okumaya başla')}</p>
    <div className="mt-3 overflow-hidden rounded-[18px] border border-border bg-card">{mangas.slice(0, 3).map(m => <div key={m.id} className="flex items-center gap-2.5 border-b border-border p-3 last:border-0">
      <Link to={buildPublicMangaPath(m)} className="shrink-0"><img src={optimizePublicImageUrl(m.coverImage) || buildCoverPlaceholder(m.title)} alt={m.title} loading="lazy" className="h-[64px] w-12 rounded-[10px] object-cover" /></Link>
      <div className="min-w-0 flex-1"><Link to={buildPublicMangaPath(m)} className="line-clamp-2 text-[13px] font-extrabold">{m.title}</Link><p className="mt-1 truncate text-[11px] font-semibold text-muted-foreground">{m.genres?.slice(0, 2).join(' · ')}</p></div>
      <button disabled={busyId !== null} onClick={() => void read(m)} aria-label={txa('{title} ilk bölümünü oku', { title: m.title })} className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-primary/10 px-2.5 text-[11px] font-extrabold text-primary disabled:opacity-50"><Play size={13} weight="fill" />{busyId === m.id ? txa('Açılıyor…') : txa('İlk bölüm')}</button>
    </div>)}</div>
  </section>
}
