import { Link } from '@/i18n/router'
import { Star } from '@phosphor-icons/react'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

export function DesktopCover({ manga, className = '' }: { manga: Pick<Manga, 'title' | 'coverImage'>; className?: string }) {
  return <img className={className} src={optimizePublicImageUrl(manga.coverImage) || manga.coverImage || buildCoverPlaceholder(manga.title)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = buildCoverPlaceholder(manga.title) }} />
}
export function DesktopRating({ manga }: { manga: Manga }) {
  return <span className="dh-rating"><Star weight="fill" size={12} />{typeof manga.rating === 'number' ? manga.rating.toFixed(1) : '—'}</span>
}
export function DesktopPoster({ manga, rank }: { manga: Manga; rank: number }) {
  const tx = useTx()
  return <Link to={buildPublicMangaPath(manga)} className="dh-poster">
    <div className="dh-poster-art"><DesktopCover manga={manga} />
      {manga.status && <span className="dh-status"><i />{manga.status === 'completed' ? tx('Tamamlandı') : manga.status === 'hiatus' ? tx('Ara Verildi') : tx('Devam Ediyor')}</span>}
      <strong className="dh-rank">{rank}</strong>
      {manga.lastChapter && <span className="dh-last">{manga.lastChapter}</span>}
      <span className="dh-poster-hover">{tx('Oku')}</span>
    </div>
    <h3>{manga.title}</h3><div className="dh-poster-meta"><DesktopRating manga={manga} /><span>·</span><span>{manga.genres?.slice(0, 2).map(genre => txa(genre)).join(' · ')}</span></div>
  </Link>
}
