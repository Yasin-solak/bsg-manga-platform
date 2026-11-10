import type { WrappedSummary } from '@/services/wrappedService'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface WrappedRecapPosterProps {
    username: string
    summary: WrappedSummary | null
    onCopy: () => void
}

function formatDateTime(value?: string) {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleString(intlLocale())
}

function WrappedRecapPoster({ username, summary, onCopy }: WrappedRecapPosterProps) {
    const topGenre = summary?.topGenres?.[0]?.genre || '-'
    const topFansub = summary?.topFansubs?.[0]?.fansubName || '-'

    return (
        <section className="rounded-lg border-[3px] border-black bg-[#111318] p-4 text-white shadow-comic">
            <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-2xl text-primary">{txa('Paylaşım Kartı')}</h2>
                <button
                    type="button"
                    onClick={onCopy}
                    className="rounded-md border-2 border-black bg-white/10 px-2.5 py-1.5 font-heading tracking-wide text-white"
                >
                    {txa('Metni Kopyala')}
                </button>
            </header>
            <article className="rounded-lg border-2 border-black bg-gradient-to-br from-[#3e216f] via-[#7f4cc8] to-[#c760ff] p-4">
                <p className="m-0 text-xs uppercase tracking-[0.08em] text-white/85">{txa('BSG Manga Wrapped')}</p>
                <h3 className="mx-0 my-1.5 mt-1.5 text-[clamp(1.4rem,2.8vw,2rem)] text-white">{username}</h3>
                <p className="m-0 text-white/90">{summary?.periodLabel || '-'}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
                    <div className="flex flex-col gap-0.5 rounded-md border border-black/45 bg-black/20 p-2">
                        <span className="text-[11px] text-white/80">{txa('Okunan Manga')}</span>
                        <strong className="break-words text-base text-[#fff5c7]">{summary?.totalReadMangas ?? 0}</strong>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-md border border-black/45 bg-black/20 p-2">
                        <span className="text-[11px] text-white/80">{txa('Takip Edilen')}</span>
                        <strong className="break-words text-base text-[#fff5c7]">
                            {summary?.totalFollowedMangas ?? 0}
                        </strong>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-md border border-black/45 bg-black/20 p-2">
                        <span className="text-[11px] text-white/80">{txa('Top Tür')}</span>
                        <strong className="break-words text-base text-[#fff5c7]">{topGenre}</strong>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-md border border-black/45 bg-black/20 p-2">
                        <span className="text-[11px] text-white/80">{txa('Top Fansub')}</span>
                        <strong className="break-words text-base text-[#fff5c7]">{topFansub}</strong>
                    </div>
                </div>
                <p className="mt-3 text-xs text-white/82">{txa('Son okuma: {v1}', { v1: formatDateTime(summary?.latestReadAt) })}</p>
            </article>
        </section>
    )
}

export default WrappedRecapPoster
