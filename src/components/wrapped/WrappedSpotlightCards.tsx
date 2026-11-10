import type { WrappedFansubStat, WrappedGenreStat } from '@/services/wrappedService'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface WrappedSpotlightCardsProps {
    topGenres: WrappedGenreStat[]
    topFansubs: WrappedFansubStat[]
}

function formatCompact(value: number) {
    if (!Number.isFinite(value)) return '0'
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString(intlLocale())
}

function calculateBarPercent(value: number, maxValue: number) {
    if (maxValue <= 0) return 8
    return Math.max(8, Math.round((value / maxValue) * 100))
}

function WrappedSpotlightCards({ topGenres, topFansubs }: WrappedSpotlightCardsProps) {
    const maxGenre = topGenres[0]?.count || 0
    const maxFansub = topFansubs[0]?.readCount || 0

    return (
        <section className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
            <article className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                <header className="mb-3 flex items-baseline justify-between gap-2">
                    <h2 className="m-0 text-2xl text-primary">{txa('Tür Spotlight')}</h2>
                    <span className="text-xs text-white/80">{txa('Top tür dağılımı')}</span>
                </header>
                {topGenres.length === 0 ? (
                    <p className="m-0 text-sm text-white/90">{txa('Tür verisi bulunamadı.')}</p>
                ) : (
                    <ul className="m-0 flex flex-col gap-2.5 p-0 list-none">
                        {topGenres.slice(0, 5).map((genre) => (
                            <li key={genre.genre} className="rounded-md border-2 border-black bg-black/30 px-2.5 py-2">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <strong className="break-words text-sm text-[#fff6cb]">{genre.genre}</strong>
                                    <span className="text-[13px] font-bold text-primary">
                                        {formatCompact(genre.count)}
                                    </span>
                                </div>
                                <div className="h-2.5 overflow-hidden rounded-full border border-white/40 bg-white/20">
                                    <i
                                        className="block h-full bg-gradient-to-r from-[#ffd600] via-[#ffd93a] to-[#fff0ad]"
                                        style={{ width: `${calculateBarPercent(genre.count, maxGenre)}%` }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </article>

            <article className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                <header className="mb-3 flex items-baseline justify-between gap-2">
                    <h2 className="m-0 text-2xl text-primary">{txa('Fansub Spotlight')}</h2>
                    <span className="text-xs text-white/80">{txa('Top fansub dagilimi')}</span>
                </header>
                {topFansubs.length === 0 ? (
                    <p className="m-0 text-sm text-white/90">{txa('Fansub verisi bulunamadı.')}</p>
                ) : (
                    <ul className="m-0 flex flex-col gap-2.5 p-0 list-none">
                        {topFansubs.slice(0, 5).map((fansub) => (
                            <li key={fansub.fansubId} className="rounded-md border-2 border-black bg-black/30 px-2.5 py-2">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <strong className="break-words text-sm text-[#fff6cb]">{fansub.fansubName}</strong>
                                    <span className="text-[13px] font-bold text-primary">
                                        {formatCompact(fansub.readCount)}
                                    </span>
                                </div>
                                <div className="h-2.5 overflow-hidden rounded-full border border-white/40 bg-white/20">
                                    <i
                                        className="block h-full bg-gradient-to-r from-[#ffd600] via-[#ffd93a] to-[#fff0ad]"
                                        style={{ width: `${calculateBarPercent(fansub.readCount, maxFansub)}%` }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </article>
        </section>
    )
}

export default WrappedSpotlightCards
