import { useRef } from 'react'
import { Link } from '@/i18n/router'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import type { Manga } from '@/types'
import { EXPLORE_PATH } from '@/lib/routes'
import { DesktopPoster } from './desktop/DesktopPoster'
import { useTx } from '@/i18n/LocaleProvider'

export function HomeTrendingGrid({ mangas, loading = false }: { mangas: Manga[]; loading?: boolean }) {
  const row = useRef<HTMLDivElement>(null)
  const tx = useTx()
  return <section className="dh-panel">
    <header className="dh-heading"><h2>{tx('TREND OLAN SERİLER')}</h2><div className="dh-actions">
      <button aria-label={tx('Trend seriler: sola kaydır')} onClick={() => row.current?.scrollBy({ left: -576, behavior: 'smooth' })}><ArrowLeft /></button>
      <button aria-label={tx('Trend seriler: sağa kaydır')} onClick={() => row.current?.scrollBy({ left: 576, behavior: 'smooth' })}><ArrowRight /></button>
      <Link to={EXPLORE_PATH}>{tx('Tümünü Gör')} <ArrowRight /></Link>
    </div></header>
    <div className="dh-rail dh-trending-rail" ref={row}>{mangas.map((manga, i) => <DesktopPoster key={manga.id} manga={manga} rank={i + 1} />)}</div>
    {!mangas.length && <p className="dh-empty">{loading ? tx('Trend seriler yükleniyor…') : tx('Trend seriler henüz yüklenemedi.')}</p>}
  </section>
}
