import { Link } from '@/i18n/router'
import { Badge } from '@/components/ui/badge'
import { buildPublicMangaPath } from '@/lib/routes'
import { similarReasonLabel } from '@/pages/mangaDetail/mangaDetailSimilar'
import type { RelatedMangaSuggestion } from '@/services/mangaService'
import { txa } from '@/i18n/activeLocale'

interface RelatedMangaPanelProps {
  items: RelatedMangaSuggestion[]
  /** Gerekce satirindaki tur etiketlerini bicimlendirir. */
  formatGenreLabel?: (genre: string) => string
  title?: string
  emptyText?: string
  loading?: boolean
  idleText?: string
  deferred?: boolean
}

function RelatedMangaPanel({
  items,
  title = txa('İlişkili Mangalar'),
  emptyText = txa('Henüz ilişkili manga bulunmuyor.'),
  loading = false,
  idleText = txa('İlgili öneriler sayfayla etkileşime geçildiğinde hazırlanacak.'),
  deferred = false,
  formatGenreLabel = (genre) => genre,
}: RelatedMangaPanelProps) {
  const visibleItems = items.slice(0, 8)

  return (
    <section
      className='sticky top-[88px] overflow-hidden rounded-xl border border-border bg-card lg:min-h-[calc(100vh-120px)]'
      aria-label={title}
    >
      <div className='border-b border-border bg-muted/50 px-4 py-3'>
        <h2 className='text-base font-bold tracking-tight text-foreground'>{title}</h2>
      </div>

      {visibleItems.length === 0 ? (
        <p className='px-5 py-5 text-sm leading-relaxed text-muted-foreground'>
          {loading ? txa('İlgili öneriler hazırlanıyor...') : deferred ? idleText : emptyText}
        </p>
      ) : (
        <div className='max-h-[calc(100vh-185px)] overflow-y-auto p-3 sm:grid sm:grid-cols-2 sm:gap-3 lg:flex lg:flex-col'>
          {visibleItems.map(({ manga: item, matchedGenres }) => (
            <Link
              to={buildPublicMangaPath({ id: item.id, slug: item.slug, title: item.title })}
              key={item.id}
              className='grid grid-cols-[72px_1fr] gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-accent lg:grid-cols-[96px_1fr]'
            >
              <div className='relative aspect-[3/4] overflow-hidden rounded-md border border-border'>
                <img
                  loading='lazy'
                  decoding='async'
                  src={item.coverImage}
                  alt={item.title}
                  className='h-full w-full object-cover'
                />
                {item.isNew ? (
                  <Badge variant='default' className='absolute left-1 top-1 px-1.5 py-0 text-[10px]'>
                    {txa('YENI')}
                  </Badge>
                ) : null}
              </div>

              <div className='flex min-w-0 flex-col justify-center gap-1'>
                <h3 className='line-clamp-2 text-sm font-semibold leading-snug text-foreground'>{item.title}</h3>
                {item.rating != null ? (
                  <span className='text-xs text-muted-foreground'>
                    {txa('Puan:')}{' '}{item.rating.toFixed(1)}
                  </span>
                ) : null}
                <span
                  className='truncate text-[10.5px] font-bold text-primary'
                  data-testid='related-manga-reason'
                >
                  {similarReasonLabel(matchedGenres, formatGenreLabel)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default RelatedMangaPanel
