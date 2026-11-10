import { useCallback, useEffect, useMemo, useState } from 'react'
import FansubCard from '@components/common/FansubCard'
import { listFansubs } from '@/services/fansubService'
import {
    getDailyTopMangas,
    getPublicFansubTierPreview,
    toRewardErrorMessage,
    type FansubMonthlyRewardPreviewRow,
    type FansubTierDailyManga,
} from '@/services/rewardService'
import type { Fansub } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { intlLocale, txa } from '@/i18n/activeLocale'

function getCurrentMonthStart() {
    const now = new Date()
    const year = now.getFullYear()
    const month = `${now.getMonth() + 1}`.padStart(2, '0')
    return `${year}-${month}-01`
}

function toMonthInputValue(monthStart: string) {
    return monthStart.slice(0, 7)
}

function fromMonthInputValue(value: string) {
    const trimmed = value.trim()
    if (!/^\d{4}-\d{2}$/.test(trimmed)) return getCurrentMonthStart()
    return `${trimmed}-01`
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString(intlLocale())
}

const RANK_REWARD_PREVIEW = [
    { rank: 1, coin: 12000 },
    { rank: 2, coin: 9000 },
    { rank: 3, coin: 6500 },
    { rank: 4, coin: 4500 },
    { rank: 5, coin: 3000 },
]

const VIEW_TIER_PREVIEW = [
    { get label() { return txa('10K Okunma') }, coin: 1200 },
    { get label() { return txa('25K Okunma') }, coin: 2500 },
    { get label() { return txa('50K Okunma') }, coin: 6000 },
    { get label() { return txa('100K Okunma') }, coin: 14000 },
]

function FansubTierPage() {
    const [monthStart, setMonthStart] = useState(getCurrentMonthStart)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [leaderboardRows, setLeaderboardRows] = useState<FansubMonthlyRewardPreviewRow[]>([])
    const [dailyMangas, setDailyMangas] = useState<FansubTierDailyManga[]>([])
    const [fansubCatalog, setFansubCatalog] = useState<Fansub[]>([])
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

    const loadPageData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [fansubRows, mangaRows, fansubCatalogResult] = await Promise.all([
                getPublicFansubTierPreview(monthStart, 20),
                getDailyTopMangas(5),
                listFansubs(),
            ])
            setLeaderboardRows(fansubRows)
            setDailyMangas(mangaRows)
            setFansubCatalog(fansubCatalogResult.data || [])
            setLastSyncAt(new Date().toISOString())
        } catch (loadError) {
            console.error('[FansubTierPage] loadPageData error', loadError)
            setLeaderboardRows([])
            setDailyMangas([])
            setFansubCatalog([])
            setError(toRewardErrorMessage(loadError, txa('Fansub tier verileri yuklenemedi.')))
        } finally {
            setLoading(false)
        }
    }, [monthStart])

    useEffect(() => {
        void loadPageData()
    }, [loadPageData])

    const monthLabel = useMemo(() => {
        const parsed = new Date(`${monthStart}T00:00:00`)
        if (Number.isNaN(parsed.getTime())) return monthStart
        return parsed.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' })
    }, [monthStart])

    const fansubById = useMemo(() => {
        const map = new Map<string, Fansub>()
        fansubCatalog.forEach((fansub) => map.set(fansub.id, fansub))
        return map
    }, [fansubCatalog])

    const rankedFansubs = useMemo(() => leaderboardRows.map((row, index) => {
        const rank = row.rankPosition || index + 1
        const existing = fansubById.get(row.fansubId)
        const fallback: Fansub = {
            id: row.fansubId,
            name: row.fansubName,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(row.fansubId)}`,
            mangaCount: 0,
            followerCount: 0,
            frameType: 'default',
            primaryColor: '#C62828',
            secondaryColor: '#8E1F1F',
        }
        return {
            rank,
            row,
            fansub: existing || fallback,
        }
    }), [leaderboardRows, fansubById])

    const candidateFansubs = useMemo(() => [...fansubCatalog]
        .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
        .slice(0, 6), [fansubCatalog])
    const orderedRankedFansubs = useMemo(() => [...rankedFansubs].sort((a, b) => a.rank - b.rank), [rankedFansubs])
    const firstPlaceFansub = useMemo(() => orderedRankedFansubs.find((item) => item.rank === 1) || orderedRankedFansubs[0] || null, [orderedRankedFansubs])
    const secondTierFansubs = useMemo(() => orderedRankedFansubs.filter((item) => item.rank === 2 || item.rank === 3), [orderedRankedFansubs])
    const thirdTierFansubs = useMemo(() => orderedRankedFansubs.filter((item) => item.rank === 4 || item.rank === 5), [orderedRankedFansubs])
    const remainingFansubs = useMemo(() => orderedRankedFansubs.filter((item) => item.rank > 5), [orderedRankedFansubs])

    const renderRankedCard = (rankedItem: (typeof rankedFansubs)[number], variant: 'podium' | 'default' = 'default') => {
        const { rank, row, fansub } = rankedItem
        return (
            <article key={row.fansubId} className={cn(
                'relative flex flex-col gap-2.5',
                variant === 'podium' && 'rounded-lg border-2 border-white/25 bg-white/5 p-2',
                rank === 1 && 'border-amber-400/60',
                rank === 2 && 'border-slate-300/70',
                rank === 3 && 'border-amber-200/75'
            )}>
                <span className={cn(
                    'absolute left-3 top-3 z-10 min-w-[56px] rounded-full border-2 border-border px-2.5 py-1 text-center text-base font-bold shadow-sm',
                    rank === 1 && 'bg-gradient-to-br from-amber-400 to-amber-200 text-foreground',
                    rank === 2 && 'bg-gradient-to-br from-slate-300 to-slate-100 text-foreground',
                    rank === 3 && 'bg-gradient-to-br from-amber-300 to-amber-100 text-foreground',
                    rank > 3 && 'bg-muted text-foreground'
                )}>{`#${rank}`}</span>
                <FansubCard
                    id={fansub.id}
                    slug={fansub.slug}
                    name={fansub.name}
                    avatar={fansub.avatar}
                    mangaCount={fansub.mangaCount}
                    followerCount={fansub.followerCount}
                    frameType={fansub.frameType}
                    primaryColor={fansub.primaryColor}
                    secondaryColor={fansub.secondaryColor}
                    profileBackgroundStyle={fansub.profileBackgroundStyle}
                    profileBackgroundVideoUrl={fansub.profileBackgroundVideoUrl}
                    profilePatternStyle={fansub.profilePatternStyle}
                    canUploadStaticBackground={fansub.canUploadStaticBackground}
                    canUploadVideoBackground={fansub.canUploadVideoBackground}
                />
                <div className={cn(
                    'flex flex-col gap-1.5 rounded-lg border-2 border-border p-2.5',
                    variant === 'podium' ? 'bg-black/55' : 'bg-black/45'
                )}>
                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                        <span>{txa('Toplam Okunma')}</span>
                        <strong className="text-amber-100">{formatNumber(row.totalViews)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                        <span>{txa('Sıra Ödülü')}</span>
                        <strong className="text-amber-100">{txa('+{v1} coin', { v1: formatNumber(row.rankCoinReward) })}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                        <span>{txa('Tier Ödülü')}</span>
                        <strong className="text-amber-100">{txa('+{v1} coin', { v1: formatNumber(row.tierCoinReward) })}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                        <span>{txa('Toplam Ödül')}</span>
                        <strong className="text-lime-300">{txa('+{v1} coin', { v1: formatNumber(row.totalCoinReward) })}</strong>
                    </div>
                    {row.tierLabels.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {row.tierLabels.map((label) => (
                                <Badge key={`${row.fansubId}-${label}`} variant="secondary" className="rounded-full border border-border bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                    {label}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </article>
        )
    }

    return (
        <div className="min-h-screen bg-background py-5 pb-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6">
                <section className="relative overflow-hidden rounded-xl border-2 border-border bg-secondary p-5 text-foreground after:absolute after:inset-0 after:bg-primary/10 after:pointer-events-none">
                    <h1 className="relative z-10 mb-2 text-[clamp(1.6rem,2.5vw,2.3rem)] font-bold text-primary">{txa('Fansub Tier ve Odul Tablosu')}</h1>
                    <p className="relative z-10 m-0 max-w-[840px]">
                        {txa('Aylık fansub ödül sıralaması burada canlı izlenir.')}
                        {txa('Ayrıca son 24 saatin en çok okunan 5 mangası günlük olarak yenilenir.')}
                    </p>
                    <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
                        <label htmlFor="fansub-tier-month" className="text-sm font-semibold">{txa('Aylik Donem')}</label>
                        <Input
                            id="fansub-tier-month"
                            type="month"
                            value={toMonthInputValue(monthStart)}
                            onChange={(event) => setMonthStart(fromMonthInputValue(event.target.value))}
                            className="w-auto rounded-lg border-2 border-border px-2.5 py-1.5 text-sm"
                        />
                        <Button type="button" onClick={() => { void loadPageData() }} disabled={loading} size="sm">
                            {loading ? txa('Yukleniyor...') : txa('Yenile')}
                        </Button>
                    </div>
                    <div className="relative z-10 mt-3 flex flex-wrap gap-3 text-xs text-white/90">
                        <span>{txa('Dönem: {v1}', { v1: monthLabel })}</span>
                        <span>{txa('Son senkron: {v1}', { v1: lastSyncAt ? new Date(lastSyncAt).toLocaleString(intlLocale()) : '-' })}</span>
                    </div>
                </section>

                {error && (
                    <p className="m-0 rounded-lg border-2 border-border bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </p>
                )}

                <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                    <article className="rounded-xl border-2 border-border bg-secondary p-4 text-foreground">
                        <header className="mb-3 flex items-baseline justify-between gap-2">
                            <h2 className="m-0 text-xl font-bold text-primary">{txa('Aylik Fansub Odul Siralamasi')}</h2>
                            <span className="text-xs text-white/90">{txa('{`${v1} fansub`}', { v1: formatNumber(leaderboardRows.length) })}</span>
                        </header>
                        {loading ? (
                            <p className="m-0 text-sm text-white/90">{txa('Siralama yukleniyor...')}</p>
                        ) : leaderboardRows.length === 0 ? (
                            <div className="flex flex-col gap-3">
                                <p className="m-0 text-sm text-white/90">
                                    {txa('Bu ay için ödül sıralaması oluşmadı.')}
                                    {txa('Veriler birikene kadar ödül planını buradan takip edebilirsin.')}
                                </p>
                                {candidateFansubs.length > 0 && (
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),280px))] justify-center gap-4">
                                        {candidateFansubs.map((fansub) => (
                                            <article key={`candidate-${fansub.id}`} className="relative flex flex-col gap-2.5 opacity-90 saturate-[0.92]">
                                                <span className="absolute left-3 top-3 z-10 rounded-full border-2 border-border bg-slate-100 px-2.5 py-1 text-center text-[13px] font-bold text-foreground">{txa('Aday')}</span>
                                                <FansubCard
                                                    id={fansub.id}
                                                    slug={fansub.slug}
                                                    name={fansub.name}
                                                    avatar={fansub.avatar}
                                                    mangaCount={fansub.mangaCount}
                                                    followerCount={fansub.followerCount}
                                                    frameType={fansub.frameType}
                                                    primaryColor={fansub.primaryColor}
                                                    secondaryColor={fansub.secondaryColor}
                                                    profileBackgroundStyle={fansub.profileBackgroundStyle}
                                                    profileBackgroundVideoUrl={fansub.profileBackgroundVideoUrl}
                                                    profilePatternStyle={fansub.profilePatternStyle}
                                                    canUploadStaticBackground={fansub.canUploadStaticBackground}
                                                    canUploadVideoBackground={fansub.canUploadVideoBackground}
                                                />
                                                <div className="flex flex-col gap-1.5 rounded-lg border-2 border-border bg-black/35 p-2.5">
                                                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                                                        <span>{txa('Durum')}</span>
                                                        <strong className="text-amber-100">{txa('Veri Bekleniyor')}</strong>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 text-xs text-white/90">
                                                        <span>{txa('Hedef')}</span>
                                                        <strong className="text-amber-100">{txa('Ilk odul dongusune gir')}</strong>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {firstPlaceFansub && (
                                    <div className="flex justify-center">
                                        <div className="w-full max-w-[320px] md:max-w-[320px]">
                                            {renderRankedCard(firstPlaceFansub, 'podium')}
                                        </div>
                                    </div>
                                )}
                                {secondTierFansubs.length > 0 && (
                                    <div className="grid grid-cols-1 gap-4 justify-center md:grid-cols-[repeat(2,minmax(220px,280px))]">
                                        {secondTierFansubs.map((item) => renderRankedCard(item, 'podium'))}
                                    </div>
                                )}
                                {thirdTierFansubs.length > 0 && (
                                    <div className="grid grid-cols-1 gap-4 justify-center md:grid-cols-[repeat(2,minmax(220px,280px))]">
                                        {thirdTierFansubs.map((item) => renderRankedCard(item, 'default'))}
                                    </div>
                                )}
                                {remainingFansubs.length > 0 && (
                                    <div className="grid grid-cols-1 gap-3 justify-center sm:grid-cols-[repeat(auto-fit,minmax(min(100%,220px),260px))]">
                                        {remainingFansubs.map((item) => renderRankedCard(item, 'default'))}
                                    </div>
                                )}
                            </div>
                        )}
                    </article>

                    <article className="rounded-xl border-2 border-border bg-secondary p-4 text-foreground">
                        <header className="mb-3 flex items-baseline justify-between gap-2">
                            <h2 className="m-0 text-xl font-bold text-primary">{txa('Gunluk Top 5 Manga')}</h2>
                            <span className="text-xs text-white/90">{txa('Son 24 saat')}</span>
                        </header>
                        {loading ? (
                            <p className="m-0 text-sm text-white/90">{txa('Gunluk top manga yukleniyor...')}</p>
                        ) : dailyMangas.length === 0 ? (
                            <div className="flex flex-col gap-3">
                                <p className="m-0 text-sm text-white/90">{txa('Son 24 saatte gosterilecek okuma verisi yok.')}</p>
                                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <li key={`placeholder-${index}`} className="grid grid-cols-[auto_64px_1fr] items-center gap-2 rounded-lg border-2 border-border bg-white/10 p-2">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-primary text-lg font-bold text-primary-foreground">{index + 1}</span>
                                            <div className="h-[86px] w-16 overflow-hidden rounded-lg border border-white/35 bg-black">
                                                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">{txa('Bekleniyor')}</div>
                                            </div>
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <strong className="text-primary">{txa('Aday Manga #{v1}', { v1: index + 1 })}</strong>
                                                <span className="text-xs text-white/90">{txa('Gunluk okuma verisi olustukca bu alan dolar.')}</span>
                                                <span className="text-xs text-white/90">{txa('Ilk sirayi almak icin aktif yayin + duzenli bolum ritmi tuttur.')}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                {dailyMangas.map((manga, index) => (
                                    <li key={manga.id} className="grid grid-cols-[auto_64px_1fr] items-center gap-2 rounded-lg border-2 border-border bg-black/35 p-2">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-primary text-lg font-bold text-primary-foreground">{index + 1}</span>
                                        <div className="h-[86px] w-16 overflow-hidden rounded-lg border border-white/35 bg-black">
                                            {manga.coverImageUrl ? (
                                                <img src={manga.coverImageUrl} alt={manga.title} loading="lazy" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">{txa('Kapak yok')}</div>
                                            )}
                                        </div>
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <strong className="text-primary">{manga.title}</strong>
                                            <span className="text-xs text-white/90">{txa('Günlük okuma: {v1}', { v1: formatNumber(manga.dailyViews) })}</span>
                                            <span className="text-xs text-white/90">{txa('Toplam görüntülenme: {v1}', { v1: formatNumber(manga.totalViews) })}</span>
                                            {manga.lastChapterNumber != null && (
                                                <span className="text-xs text-white/90">{txa('Son bölüm: {v1}', { v1: formatNumber(manga.lastChapterNumber) })}</span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </article>
                </section>

                <section className="rounded-xl border-2 border-border bg-secondary p-4 text-foreground">
                    <header className="mb-3 flex items-baseline justify-between gap-2">
                        <h2 className="m-0 text-xl font-bold text-primary">{txa('Odul Rehberi')}</h2>
                        <span className="text-xs text-white/90">{txa('Guncel odul plani')}</span>
                    </header>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                        <section className="rounded-lg border-2 border-border bg-black/35 p-3">
                            <h3 className="mb-2 m-0 text-lg font-bold text-primary">{txa('Top 5 Sira Odulleri')}</h3>
                            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                                {RANK_REWARD_PREVIEW.map((item) => (
                                    <li key={`reward-rank-${item.rank}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5">
                                        <strong className="text-[13px] text-amber-100">{`${item.rank}.`}</strong>
                                        <span className="text-xs font-bold text-lime-300">{`+${formatNumber(item.coin)}`}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                        <section className="rounded-lg border-2 border-border bg-black/35 p-3">
                            <h3 className="mb-2 m-0 text-lg font-bold text-primary">{txa('Okunma Tierleri')}</h3>
                            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                                {VIEW_TIER_PREVIEW.map((item) => (
                                    <li key={`reward-tier-${item.label}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5">
                                        <strong className="text-[13px] text-amber-100">{item.label}</strong>
                                        <span className="text-xs font-bold text-lime-300">{`+${formatNumber(item.coin)}`}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </section>
            </div>
        </div>
    )
}

export default FansubTierPage
