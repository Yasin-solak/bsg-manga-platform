import { Link } from '@/i18n/router'
import { ArrowRight, Plus } from '@phosphor-icons/react'
import type { Manga } from '@/types'
import { buildPublicMangaPath, EXPLORE_PATH } from '@/lib/routes'
import { DesktopCover } from './desktop/DesktopPoster'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

export interface HomeContinueReadingProgress { chapterLabel?: string; progressPercent?: number; chapterPath?: string }
export function HomeContinueReading({ mangas, progressByMangaId = {} }: { mangas: Manga[]; progressByMangaId?: Record<string, HomeContinueReadingProgress> }) {
  const tx = useTx()
  return <section className="dh-panel"><header className="dh-heading"><h2>{tx('DEVAM ET')}</h2><Link to="/kutuphane">{tx('Tümünü Gör')} <ArrowRight /></Link></header>
    <div className="dh-rail">
      {mangas.map(manga => {
        const progress = progressByMangaId[manga.id]
        const raw = progress?.progressPercent ?? 0
        const percent = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 0
        return <Link key={manga.id} to={progress?.chapterPath || buildPublicMangaPath(manga)} className="dh-resume">
          <div className="dh-resume-art"><DesktopCover manga={manga} /><div className="dh-resume-progress"><b>{progress?.chapterLabel || manga.lastChapter || tx('Okumaya devam et')}</b><div><span><i style={{ width: `${percent}%` }} /></span><small>{txa('%{v1}', { v1: percent })}</small></div></div></div>
          <h3>{manga.title}</h3>
        </Link>
      })}
      <Link to={EXPLORE_PATH} className="dh-discover"><span><Plus size={20} /></span><b>{tx('Devam etmek için serileri keşfet')}</b></Link>
    </div>
  </section>
}
