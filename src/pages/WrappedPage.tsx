import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import WrappedBadgeShelf from '@/components/wrapped/WrappedBadgeShelf'
import WrappedHeroControls from '@/components/wrapped/WrappedHeroControls'
import WrappedIdentityStage from '@/components/wrapped/WrappedIdentityStage'
import WrappedMangaMosaic from '@/components/wrapped/WrappedMangaMosaic'
import WrappedRecapPoster from '@/components/wrapped/WrappedRecapPoster'
import WrappedSpotlightCards from '@/components/wrapped/WrappedSpotlightCards'
import WrappedStoryDeck from '@/components/wrapped/WrappedStoryDeck'
import type { WrappedPeriodOption } from '@/components/wrapped/wrappedUiTypes'
import { useAuth } from '@/contexts/AuthContext'
import { buildPublicMangaPath } from '@/lib/routes'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { toast } from '@/services/toastService'
import { buildWrappedPersona, buildWrappedStorySlides } from '@/services/wrappedPersonaService'
import { listUserWrappedSummary, type WrappedPeriod, type WrappedSummary } from '@/services/wrappedService'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PERIOD_OPTIONS: readonly WrappedPeriodOption[] = [
    { value: '30d', get label() { return txa('30 Gün') } },
    { value: '90d', get label() { return txa('90 Gün') } },
    { value: '365d', get label() { return txa('365 Gün') } },
    { value: 'all', get label() { return txa('Tüm Zaman') } },
] as const

function formatDateTime(value?: string) {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleString(intlLocale())
}

function sanitizeForCopy(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .trim()
}

function WrappedPage() {
    const { currentUser } = useAuth()
    const [period, setPeriod] = useState<WrappedPeriod>('30d')
    const [summary, setSummary] = useState<WrappedSummary | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [storyIndex, setStoryIndex] = useState(0)
    const [autoPlay, setAutoPlay] = useState(false)

    const loadSummary = useCallback(async () => {
        if (!currentUser?.id) return
        setLoading(true)
        setError(null)
        try {
            const nextSummary = await listUserWrappedSummary(currentUser.id, period)
            setSummary(nextSummary)
        } catch (loadError) {
            console.error('[WrappedPage] loadSummary error', loadError)
            setSummary(null)
            setError(toAppErrorMessage(loadError, txa('Okuma özeti yüklenemedi.')))
        } finally {
            setLoading(false)
        }
    }, [currentUser?.id, period])

    useEffect(() => {
        if (!currentUser?.id) return
        void loadSummary()
    }, [currentUser?.id, loadSummary])

    const weekdayMax = useMemo(() => {
        const maxValue = summary?.weekdayActivity.reduce((max, item) => Math.max(max, item.count), 0) || 0
        return maxValue > 0 ? maxValue : 1
    }, [summary?.weekdayActivity])

    const achievementBadges = useMemo(() => {
        if (!summary) return [] as string[]
        const badges = [] as string[]
        if (summary.totalReadMangas >= 80) badges.push(txa('Portal Bekçisi'))
        if (summary.totalReadMangas >= 40) badges.push(txa('Bölüm Yağmuru'))
        if (summary.totalFollowedMangas >= 25) badges.push(txa('Koleksiyon Mimarı'))
        if (summary.mangaCommentsCount >= 15) badges.push(txa('Topluluk Ateşi'))
        if (summary.topGenres.length >= 5) badges.push(txa('Tür Gezgini'))
        if (!badges.length) badges.push(txa('Yeni Sezon Başlangıcı'))
        return badges.slice(0, 6)
    }, [summary])

    const persona = useMemo(() => {
        if (!summary) return null
        return buildWrappedPersona(summary)
    }, [summary])

    const storySlides = useMemo(() => {
        if (!summary || !currentUser?.username || !persona) return []
        return buildWrappedStorySlides(summary, currentUser.username, persona)
    }, [currentUser?.username, persona, summary])

    useEffect(() => {
        setStoryIndex(0)
        setAutoPlay(false)
    }, [period, summary?.generatedAt])

    useEffect(() => {
        if (!autoPlay || storySlides.length < 2) return
        const timer = window.setInterval(() => {
            setStoryIndex((prev) => (prev >= storySlides.length - 1 ? 0 : prev + 1))
        }, 4200)
        return () => window.clearInterval(timer)
    }, [autoPlay, storySlides.length])

    useEffect(() => {
        function onKeydown(event: KeyboardEvent) {
            if (storySlides.length < 2) return
            if (event.key === 'ArrowRight') {
                setAutoPlay(false)
                setStoryIndex((prev) => (prev >= storySlides.length - 1 ? 0 : prev + 1))
            } else if (event.key === 'ArrowLeft') {
                setAutoPlay(false)
                setStoryIndex((prev) => (prev <= 0 ? storySlides.length - 1 : prev - 1))
            }
        }

        window.addEventListener('keydown', onKeydown)
        return () => window.removeEventListener('keydown', onKeydown)
    }, [storySlides.length])

    const summaryShareText = useMemo(() => {
        if (!summary || !currentUser?.username) return ''
        const topGenre = summary.topGenres[0]?.genre || '-'
        const topFansub = summary.topFansubs[0]?.fansubName || '-'
        return sanitizeForCopy(
            `${currentUser.username} | BSG Manga Wrapped (${summary.periodLabel})\n`
            + `${txa('Okunan manga: {v1}', { v1: summary.totalReadMangas })}\n`
            + `${txa('Takip edilen seri: {v1}', { v1: summary.totalFollowedMangas })}\n`
            + `${txa('En cok okunan tur: {v1}', { v1: topGenre })}\n`
            + `${txa('En cok okunan fansub: {v1}', { v1: topFansub })}\n`
            + `${txa('Ortalama son bolum: {v1}', { v1: summary.avgLastChapter })}\n`
            + txa('Son okuma: {v1}', { v1: formatDateTime(summary.latestReadAt) }),
        )
    }, [currentUser?.username, summary])

    const handleCopyWrappedSummary = useCallback(async () => {
        if (!summaryShareText) {
            toast.error(txa('Paylaşım metni oluşturulamadı.'))
            return
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(summaryShareText)
                toast.success(txa('Wrapped özeti panoya kopyalandı.'))
                return
            }
            throw new Error(txa('Pano kullanılamıyor'))
        } catch (copyError) {
            console.error('[WrappedPage] handleCopyWrappedSummary error', copyError)
            toast.error(txa('Panoya kopyalama başarısız oldu.'))
        }
    }, [summaryShareText])

    const handleSelectStory = useCallback((nextIndex: number) => {
        setAutoPlay(false)
        setStoryIndex(nextIndex)
    }, [])

    const handleStoryPrev = useCallback(() => {
        setAutoPlay(false)
        setStoryIndex((prev) => Math.max(0, prev - 1))
    }, [])

    const handleStoryNext = useCallback(() => {
        setAutoPlay(false)
        setStoryIndex((prev) => (storySlides.length ? Math.min(storySlides.length - 1, prev + 1) : 0))
    }, [storySlides.length])

    if (!currentUser) {
        return (
            <div
                className="min-h-screen py-5 pb-8"
                style={{
                    background:
                        'radial-gradient(circle at 12% 15%, rgba(255, 214, 0, 0.12) 0%, transparent 38%), radial-gradient(circle at 88% 5%, rgba(198, 40, 40, 0.15) 0%, transparent 42%), #2d2d2d',
                }}
            >
                <div className="container flex flex-col gap-4">
                    <section className="rounded-lg border-[3px] border-black bg-secondary text-white px-6 py-6 text-center shadow-comic">
                        <h1 className="m-0 mb-2 text-3xl text-primary">{txa('Okuma Özeti')}</h1>
                        <p className="m-0 mb-4 text-white/92">{txa('Wrapped özeti görebilmek için önce giriş yapmalısın.')}</p>
                        <Link
                            to="/giris"
                            className="inline-flex items-center justify-center rounded-md border-2 border-black bg-primary px-4 py-2.5 font-heading text-black shadow-[2px_2px_0_black] tracking-[0.06em]"
                        >
                            {txa('Giriş Yap')}
                        </Link>
                    </section>
                </div>
            </div>
        )
    }

    return (
        <div
            className="min-h-screen py-5 pb-8"
            style={{
                background:
                    'radial-gradient(circle at 12% 15%, rgba(255, 214, 0, 0.12) 0%, transparent 38%), radial-gradient(circle at 88% 5%, rgba(198, 40, 40, 0.15) 0%, transparent 42%), #2d2d2d',
            }}
        >
            <div className="container flex flex-col gap-4">
                <WrappedHeroControls
                    avatarUrl={currentUser.avatar}
                    username={currentUser.username}
                    periodLabel={summary?.periodLabel || txa('Dönem seçerek özeti yenileyebilirsin.')}
                    period={period}
                    periodOptions={PERIOD_OPTIONS}
                    loading={loading}
                    onPeriodChange={setPeriod}
                    onRefresh={() => { void loadSummary() }}
                    onCopy={() => { void handleCopyWrappedSummary() }}
                />

                {error && (
                    <section className="rounded-lg border-[3px] border-black bg-[#ffe3e3] px-3 py-3 text-[#7b1010] shadow-comic">
                        <p className="m-0 text-sm">{error}</p>
                    </section>
                )}

                <WrappedStoryDeck
                    slides={storySlides}
                    loading={loading}
                    storyIndex={storyIndex}
                    autoPlay={autoPlay}
                    onSelectStory={handleSelectStory}
                    onPrev={handleStoryPrev}
                    onNext={handleStoryNext}
                    onToggleAutoPlay={() => setAutoPlay((prev) => !prev)}
                />

                <section className="grid gap-3 grid-cols-[1.1fr_1fr] max-[980px]:grid-cols-1">
                    {persona ? (
                        <WrappedIdentityStage persona={persona} />
                    ) : (
                        <article className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                            <header className="mb-3"><h2 className="m-0 text-2xl text-primary">{txa('Okuyucu Kimliği')}</h2></header>
                            <p className="m-0 text-sm text-white/88">{txa('Kimlik kartı oluşturuluyor...')}</p>
                        </article>
                    )}
                    <WrappedRecapPoster
                        username={currentUser.username}
                        summary={summary}
                        onCopy={() => { void handleCopyWrappedSummary() }}
                    />
                </section>

                <WrappedBadgeShelf badges={achievementBadges} />

                <WrappedMangaMosaic mangas={summary?.recentMangas || []} />

                <section className="grid gap-3 grid-cols-2 max-[860px]:grid-cols-1">
                    <article className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                        <header className="mb-3">
                            <h2 className="m-0 text-2xl text-primary">{txa('Hızlı Özet')}</h2>
                        </header>
                        {loading && !summary ? (
                            <p className="m-0 text-sm text-white/88">{txa('Veriler yükleniyor...')}</p>
                        ) : summary?.highlights?.length ? (
                            <ul className="m-0 p-0 list-none flex flex-col gap-2">
                                {summary.highlights.map((item) => (
                                    <li
                                        key={item}
                                        className="rounded-md border-2 border-black bg-black/30 px-3 py-2.5 text-sm"
                                    >
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="m-0 text-sm text-white/88">{txa('Bu dönem için özet verisi yok.')}</p>
                        )}
                    </article>

                    <article className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                        <header className="mb-3">
                            <h2 className="m-0 text-2xl text-primary">{txa('Aktivite Günleri')}</h2>
                        </header>
                        {loading && !summary ? (
                            <p className="m-0 text-sm text-white/88">{txa('Veriler yükleniyor...')}</p>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {(summary?.weekdayActivity || []).map((item) => (
                                    <div
                                        key={item.dayIndex}
                                        className="grid grid-cols-[56px_1fr_36px] items-center gap-2"
                                    >
                                        <span className="text-xs text-white/88">{item.label}</span>
                                        <div className="h-3 rounded-full border border-black bg-white/20 overflow-hidden">
                                            <i
                                                className="block h-full bg-gradient-to-r from-[#ffd600] to-[#ffec80]"
                                                style={{ width: `${Math.max(6, (item.count / weekdayMax) * 100)}%` }}
                                            />
                                        </div>
                                        <strong className="text-[13px] text-primary text-right">{item.count}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>
                </section>

                <details className="group rounded-lg border-2 border-black bg-black/30 px-2.5 py-3 pb-3">
                    <summary className="mb-2.5 cursor-pointer font-heading text-primary tracking-wide select-none group-open:mb-3">
                        {txa('Ham istatistiklere bak')}
                    </summary>
                    <section className="grid grid-cols-6 gap-3 max-[1120px]:grid-cols-3 max-[620px]:grid-cols-2">
                        <article className="flex min-h-[104px] flex-col justify-center gap-1.5 rounded-lg border-[3px] border-black bg-[#111318] p-3 text-white shadow-comic">
                            <span className="text-xs text-white/80">{txa('Okunan Manga')}</span>
                            <strong className="text-xl text-primary leading-tight break-words">
                                {(summary?.totalReadMangas || 0).toLocaleString(intlLocale())}
                            </strong>
                        </article>
                        <article className="flex min-h-[104px] flex-col justify-center gap-1.5 rounded-lg border-[3px] border-black bg-[#111318] p-3 text-white shadow-comic">
                            <span className="text-xs text-white/80">{txa('Takip Edilen Seri')}</span>
                            <strong className="text-xl text-primary leading-tight break-words">
                                {(summary?.totalFollowedMangas || 0).toLocaleString(intlLocale())}
                            </strong>
                        </article>
                        <article className="flex min-h-[104px] flex-col justify-center gap-1.5 rounded-lg border-[3px] border-black bg-[#111318] p-3 text-white shadow-comic">
                            <span className="text-xs text-white/80">{txa('Manga Yorumları')}</span>
                            <strong className="text-xl text-primary leading-tight break-words">
                                {(summary?.mangaCommentsCount || 0).toLocaleString(intlLocale())}
                            </strong>
                        </article>
                        <article className="flex min-h-[104px] flex-col justify-center gap-1.5 rounded-lg border-[3px] border-black bg-[#111318] p-3 text-white shadow-comic">
                            <span className="text-xs text-white/80">{txa('Ortalama Son Bölüm')}</span>
                            <strong className="text-xl text-primary leading-tight break-words">
                                {summary?.avgLastChapter ? `${summary.avgLastChapter}` : '-'}
                            </strong>
                        </article>
                        <article className="flex min-h-[104px] flex-col justify-center gap-1.5 rounded-lg border-[3px] border-black bg-[#111318] p-3 text-white shadow-comic">
                            <span className="text-xs text-white/80">{txa('Son Okuma')}</span>
                            <strong className="text-xl text-primary leading-tight break-words">
                                {formatDateTime(summary?.latestReadAt)}
                            </strong>
                        </article>
                    </section>

                    <div className="mt-3">
                        <WrappedSpotlightCards
                            topGenres={summary?.topGenres || []}
                            topFansubs={summary?.topFansubs || []}
                        />
                    </div>
                </details>

                <section className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
                    <header className="mb-3">
                        <h2 className="m-0 text-2xl text-primary">{txa('Son Okuduğun Mangalar')}</h2>
                    </header>
                    {loading && !summary ? (
                        <p className="m-0 text-sm text-white/88">{txa('Veriler yükleniyor...')}</p>
                    ) : summary?.recentMangas?.length ? (
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                            {summary.recentMangas.map((item) => (
                                <Link
                                    key={item.mangaId}
                                    to={buildPublicMangaPath({ id: item.mangaId, slug: item.slug, title: item.title })}
                                    className="grid grid-cols-[78px_1fr] gap-2.5 rounded-md border-2 border-black bg-black/30 p-2 transition-transform duration-150 hover:-translate-y-0.5 hover:scale-[1.01]"
                                >
                                    <div className="h-[108px] w-[78px] overflow-hidden rounded-md border border-white/25 bg-[#111]">
                                        {item.coverImageUrl ? (
                                            <img
                                                src={item.coverImageUrl}
                                                alt={item.title}
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[11px] text-white/70">
                                                {txa('Kapak yok')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <strong className="text-primary leading-tight">{item.title}</strong>
                                        <span className="text-xs text-white/86">
                                            {item.chapterNumber != null ? `${item.chapterNumber}. bolum` : txa('Bölüm bilgisi yok')}
                                        </span>
                                        <span className="text-xs text-white/86">{item.fansubName || txa('Fansub bilgisi yok')}</span>
                                        <span className="text-xs text-white/86">{formatDateTime(item.readAt)}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="m-0 text-sm text-white/88">{txa('Bu dönem için okuma kaydı bulunamadı.')}</p>
                    )}
                </section>
            </div>
        </div>
    )
}

export default WrappedPage
