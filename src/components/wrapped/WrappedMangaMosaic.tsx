import { Link } from '@/i18n/router'
import type { WrappedMangaCard } from '@/services/wrappedService'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface WrappedMangaMosaicProps {
    mangas: WrappedMangaCard[]
}

function WrappedMangaMosaic({ mangas }: WrappedMangaMosaicProps) {
    const rows = mangas.slice(0, 6)

    return (
        <section className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#1b1f29] to-[#242b38] p-4 text-white shadow-comic">
            <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-2xl text-primary">{txa('Sezon Kolajı')}</h2>
                <span className="text-xs text-white/80">{txa('{`${v1} manga`}', { v1: rows.length })}</span>
            </header>
            {rows.length === 0 ? (
                <p className="m-0 text-white/88">{txa('Kolaj oluşması için okuma verisi gerekiyor.')}</p>
            ) : (
                <div className="grid grid-cols-6 gap-2.5 max-[920px]:grid-cols-2">
                    {rows.map((row, index) => {
                        const sizeNum = (index % 4) + 1
                        const isLarge = sizeNum === 1 || sizeNum === 2
                        return (
                            <Link
                                key={`${row.mangaId}-${index}`}
                                to={buildPublicMangaPath({ id: row.mangaId, slug: row.slug, title: row.title })}
                                className={cn(
                                    'relative min-h-[128px] overflow-hidden rounded-md border-2 border-black bg-[#111]',
                                    isLarge
                                        ? 'col-span-3 min-h-[220px] max-[920px]:col-span-1 max-[920px]:min-h-[188px]'
                                        : 'col-span-2 max-[920px]:col-span-1 max-[920px]:min-h-[188px]',
                                )}
                            >
                                {row.coverImageUrl ? (
                                    <img
                                        src={row.coverImageUrl}
                                        alt={row.title}
                                        loading="lazy"
                                        className="h-full w-full object-cover transition-transform duration-150 hover:scale-105"
                                    />
                                ) : (
                                    <div className="flex min-h-[120px] w-full items-center justify-center text-xs text-white/70">
                                        {txa('Kapak yok')}
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2.5 pt-4">
                                    <strong className="text-sm text-primary">{row.title}</strong>
                                    <span className="text-[11px] text-white/86">
                                        {row.chapterNumber != null ? `${row.chapterNumber}. bolum` : txa('Bölüm yok')}
                                    </span>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

export default WrappedMangaMosaic
