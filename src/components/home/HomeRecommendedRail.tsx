import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { getRecommendedMangasBySource, type RecommendedManga, type RecommendationSource } from '@/services/recommendationService'
import { HomeRecommendationSkeleton } from './HomeRecommendationSkeleton'
import { DesktopCover, DesktopRating } from './desktop/DesktopPoster'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

export function HomeRecommendedRail({ mangas, reasons = [] }: { mangas: Manga[]; reasons?: RecommendedManga[] }) {
  const section = useRef<HTMLElement>(null)
  const [skeletonHeight, setSkeletonHeight] = useState<number>()
  const [tab, setTab] = useState<'all' | RecommendationSource>('all')
  const [filtered, setFiltered] = useState<{ source: RecommendationSource; rows: RecommendedManga[] } | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const tx = useTx()
  useEffect(() => {
    setError(false)
    if (tab === 'all') return
    const controller = new AbortController()
    setFiltered(null)
    void getRecommendedMangasBySource(tab, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setFiltered({ source: tab, rows }) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [tab, attempt])
  const loading = tab !== 'all' && filtered?.source !== tab && !error
  const rows = tab === 'all'
    ? mangas.map(manga => ({ manga, matched: reasons.find(r => r.manga.id === manga.id)?.matchedGenres || [] }))
    : filtered?.source === tab ? filtered.rows.map(row => ({ manga: row.manga, matched: row.matchedGenres })) : []
  const hero = rows[0]
  const why = (row: typeof rows[number]) => row.matched.length ? `${row.matched.slice(0, 2).map(genre => tx(genre)).join(' · ')} ${tab === 'reading' ? tx('okuma geçmişinden') : tab === 'genres' ? tx('seçtiğin türlerden') : tx('ilgi alanlarından')}` : tx('Keşfedebileceğin serilerden')
  return <section ref={section} data-testid="home-recommended-rail" className="dh-panel dh-recommend"><header className="dh-heading dh-heading-rule"><div><h2>{tx('SENİN İÇİN')}</h2><p>{tx('Okuma zevkine yeni bir hikâye kat.')}</p></div><div className="dh-tabs">{([['all', txa('Tümü')], ['reading', txa('Okuduklarına göre')], ['genres', txa('Sevdiğin türler')]] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => {
      if (id === tab) return
      setSkeletonHeight(section.current?.querySelector('.dh-recommend-body')?.getBoundingClientRect().height)
      setFiltered(null); setError(false); setTab(id)
    }}>{tx(label)}</button>)}</div></header>
    {loading ? <HomeRecommendationSkeleton minHeight={skeletonHeight} /> : error ? <div className="dh-empty" role="alert">{tx('Öneriler yüklenemedi.')} <button onClick={() => setAttempt(value => value + 1)}>{tx('Tekrar dene')}</button></div> : hero ? <div className="dh-recommend-body"><Link className="dh-recommend-hero" to={buildPublicMangaPath(hero.manga)}><DesktopCover manga={hero.manga} /><div><small>{why(hero)}</small><h3>{hero.manga.title}</h3><p className="dh-recommend-meta"><DesktopRating manga={hero.manga} /> · {hero.manga.genres?.slice(0, 2).join(' · ')} · {hero.manga.lastChapter}</p><p className="dh-description">{hero.manga.description}</p><span className="dh-read">{tx('Oku')}</span></div></Link>
    <div className="dh-recommend-list">{rows.slice(1, 5).map((row, i) => <Link to={buildPublicMangaPath(row.manga)} key={row.manga.id}><b>{i + 2}</b><DesktopCover manga={row.manga} /><div><h3>{row.manga.title}</h3><p>{why(row)}</p></div></Link>)}</div></div> : <p className="dh-empty">{tab === 'genres' ? tx('Seçtiğin türlere uygun yeni seri bulunamadı. Tür tercihin yoksa önce sevdiğin türleri seçmelisin.') : tx('Okuma geçmişine uygun yeni seri bulunamadı. Seri okudukça öneriler oluşur.')} {tx('Tümü sekmesinden diğer serileri keşfedebilirsin.')}</p>}
  </section>
}
