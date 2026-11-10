import { Link } from '@/i18n/router'
import { BookmarkSimple, Check, CheckCircle, Sparkle, Star } from '@phosphor-icons/react'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { cn } from '@/lib/utils'
import { useExploreSaves } from './exploreSaveContext'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ExploreMobileCard({ manga, reason, rail = false, compact = false }: {
  manga: Manga; reason?: string; rail?: boolean; compact?: boolean
}) {
  const { saved, pending, ready, toggle } = useExploreSaves()
  const isSaved = saved.has(manga.id)
  const badge = manga.status === 'completed' ? txa('TAMAMLANDI') : manga.isNew ? txa('YENİ') : null
  return <article className={cn('min-w-0', rail && 'w-[136px] shrink-0 snap-start', compact && 'w-28 shrink-0 snap-start')}>
    <div className="relative">
      <Link to={buildPublicMangaPath(manga)} className="block overflow-hidden rounded-2xl border border-border bg-muted" aria-label={txa('{title} seri detayını aç', { title: manga.title })}>
        <img src={optimizePublicImageUrl(manga.coverImage) || buildCoverPlaceholder(manga.title)} alt={manga.title}
          loading="lazy" decoding="async" className="aspect-[136/182] w-full object-cover"
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = buildCoverPlaceholder(manga.title) }} />
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-lg bg-black/75 px-2 py-1 text-[11px] font-extrabold text-white">
          {manga.rating != null && <span className="flex items-center gap-1 text-amber-300"><Star weight="fill" size={11} />{manga.rating.toLocaleString(intlLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</span>}
          <span className="truncate">{manga.lastChapter || txa('Henüz bölüm yok')}</span>
        </div>
      </Link>
      {badge && <span className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-48px)] items-center gap-1 rounded-full bg-black/80 px-1.5 py-1 text-[8px] font-extrabold text-white">
        {manga.status === 'completed' ? <CheckCircle size={10} weight="fill" /> : <Sparkle size={10} weight="fill" />}<span className="truncate">{txa(badge)}</span>
      </span>}
      {!compact && <button type="button" aria-label={`${manga.title}: ${isSaved ? txa('kütüphaneden çıkar') : txa('kütüphaneye ekle')}`} aria-pressed={isSaved}
        disabled={!ready || pending.has(manga.id)} onClick={() => toggle(manga.id)}
        className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-full disabled:opacity-40">
        <span className={cn('flex size-[30px] items-center justify-center rounded-full', isSaved ? 'bg-primary text-primary-foreground' : 'bg-black/70 text-white')}>
          {isSaved ? <Check size={16} weight="bold" /> : <BookmarkSimple size={16} weight="bold" />}
        </span>
      </button>}
    </div>
    <Link to={buildPublicMangaPath(manga)} className="mt-2 block text-[13px] font-extrabold leading-[1.3] hover:text-primary">
      <span className="line-clamp-2">{manga.title}</span>
    </Link>
    <p className={cn('m-0 mt-[3px] truncate text-[11px] font-bold', reason ? 'text-primary' : 'text-muted-foreground')}>
      {reason || (manga.status === 'completed' ? txa('Baştan sona hazır') : manga.genres?.slice(0, 2).join(' · '))}
    </p>
  </article>
}
