import { Link } from '@/i18n/router'
import { Star } from '@phosphor-icons/react'
import { buildPublicMangaPath } from '@/lib/routes'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

export function SearchResultCard({ manga }: { manga: Manga }) {
  return <Link to={buildPublicMangaPath(manga)} className="flex gap-3 rounded-2xl border border-border bg-card p-2.5 transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <img src={manga.coverImage} alt="" loading="lazy" className="h-[92px] w-[66px] shrink-0 rounded-[11px] border border-border object-cover" />
    <div className="flex min-w-0 flex-1 flex-col">
      <h3 className="text-[14.5px] font-black tracking-[-.01em]">{manga.title}</h3>
      <div className="mt-2 flex flex-wrap gap-1">{manga.genres?.slice(0, 2).map(genre => <span key={genre} className="rounded-[7px] bg-muted px-[7px] py-[3px] text-[10.5px] font-bold text-muted-foreground">{genre}</span>)}</div>
      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-2 text-[11.5px] font-bold text-muted-foreground">
        {typeof manga.rating === 'number' && <span className="inline-flex items-center gap-1 text-amber-500"><Star size={12} weight="fill" />{manga.rating.toFixed(1)}</span>}
        <span>{manga.lastChapter ? txa('Son bölüm: {chapter}', { chapter: manga.lastChapter }) : txa('Henüz bölüm yok')}</span>
        {manga.status && <span>{manga.status === 'completed' ? txa('Tamamlandı') : manga.status === 'hiatus' ? txa('Ara verdi') : txa('Devam ediyor')}</span>}
      </div>
    </div>
  </Link>
}
