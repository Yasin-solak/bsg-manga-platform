import type { WrappedSummary } from './wrappedService'
import type { WrappedStorySlide } from '@/components/wrapped/wrappedUiTypes'
import { txa } from '@/i18n/activeLocale'

export interface WrappedPersonaProfile {
    seasonTitle: string
    archetypeTitle: string
    archetypeDescription: string
    auraLevel: 'Bronz' | 'Gumus' | 'Altin' | 'Efsane'
    auraScore: number
    signatureTags: string[]
    narrativeLine: string
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function formatCompact(value: number) {
    if (!Number.isFinite(value)) return '0'
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString('tr-TR')
}

const GENRE_SEASON_MAP: Record<string, string> = {
    aksiyon: 'Alevli Aksiyon Sezonu',
    macera: 'Harita Avcisi Sezonu',
    fantastik: 'Fantastik Portallar Sezonu',
    dramatik: 'Duygu Yogunlugu Sezonu',
    komedi: 'Kahkaha Sezonu',
    romantik: 'Kalp Atisi Sezonu',
}

function normalizeGenreKey(value: string | undefined) {
    return (value || '').trim().toLocaleLowerCase('tr-TR')
}

function resolveAuraLevel(score: number): WrappedPersonaProfile['auraLevel'] {
    if (score >= 85) return 'Efsane'
    if (score >= 65) return 'Altin'
    if (score >= 40) return 'Gumus'
    return 'Bronz'
}

function buildArchetype(summary: WrappedSummary) {
    const socialScore = summary.mangaCommentsCount
    const diversityScore = summary.topGenres.length
    const readScore = summary.totalReadMangas

    if (readScore >= 70) {
        return {
            title: txa('Portal Bekcisi'),
            description: txa('Uzun seri maratonlarinda kaybolup bolum evrenlerini tek tek fetheden okuyucu.'),
        }
    }
    if (socialScore >= 18) {
        return {
            title: txa('Topluluk Kaptani'),
            description: txa('Sadece okumayan; yorum ve postlarla toplulugu canli tutan merkez oyuncu.'),
        }
    }
    if (diversityScore >= 5) {
        return {
            title: txa('Tur Kasifi'),
            description: txa('Tek bir koridora kapanmayan, yeni tur kapilarini acan kesif odakli okuyucu.'),
        }
    }
    if (summary.topFansubs.length >= 3) {
        return {
            title: txa('Fansub Gezgini'),
            description: txa('Farkli ekiplerin cesitli ceviri dillerini takip eden esnek rota ustasi.'),
        }
    }
    return {
        title: txa('Sessiz Koleksiyoncu'),
        description: txa('Stabil ve sakin tempoda ama istikrarla ilerleyen guvenli okuma profili.'),
    }
}

export function buildWrappedPersona(summary: WrappedSummary): WrappedPersonaProfile {
    const topGenre = summary.topGenres[0]?.genre
    const seasonFromGenre = GENRE_SEASON_MAP[normalizeGenreKey(topGenre)]
    const seasonTitle = seasonFromGenre || txa('{v1} Okuma Sezonu', { v1: summary.periodLabel })

    const archetype = buildArchetype(summary)
    const auraRaw = (summary.totalReadMangas * 1.1)
        + (summary.totalFollowedMangas * 0.6)
        + (summary.mangaCommentsCount * 1.4)
    const auraScore = clamp(Math.round(auraRaw), 8, 99)
    const auraLevel = resolveAuraLevel(auraScore)

    const signatureTags = [] as string[]
    if (summary.topGenres[0]?.genre) signatureTags.push(summary.topGenres[0].genre)
    if (summary.topFansubs[0]?.fansubName) signatureTags.push(summary.topFansubs[0].fansubName)
    if (summary.weekdayActivity?.length) {
        const peakDay = [...summary.weekdayActivity].sort((a, b) => b.count - a.count)[0]
        if (peakDay?.count > 0) signatureTags.push(`${peakDay.label} Ritmi`)
    }
    if (signatureTags.length < 3) {
        signatureTags.push('Manga Akisi')
    }

    const narrativeLine = `${summary.periodLabel} doneminde ${formatCompact(summary.totalReadMangas)} manga ile ${auraLevel.toLocaleLowerCase('tr-TR')} seviyede bir iz biraktin.`

    return {
        seasonTitle,
        archetypeTitle: archetype.title,
        archetypeDescription: archetype.description,
        auraLevel,
        auraScore,
        signatureTags: signatureTags.slice(0, 4),
        narrativeLine,
    }
}

export function buildWrappedStorySlides(summary: WrappedSummary, username: string, persona: WrappedPersonaProfile): WrappedStorySlide[] {
    const topGenre = summary.topGenres[0]
    const topFansub = summary.topFansubs[0]
    const firstCover = summary.recentMangas[0]?.coverImageUrl
    const secondCover = summary.recentMangas[1]?.coverImageUrl
    const thirdCover = summary.recentMangas[2]?.coverImageUrl
    const busiestDay = [...summary.weekdayActivity].sort((a, b) => b.count - a.count)[0]

    return [
        {
            id: 'opening',
            kicker: 'SEZON GIRISI',
            title: `${username} icin ${persona.seasonTitle}`,
            description: persona.narrativeLine,
            primaryValue: `${persona.auraScore}/100 Aura`,
            secondaryValue: `${persona.auraLevel} Seviye`,
            chips: persona.signatureTags,
            quote: txa('{v1}, bu sezon cizgilerin arasinda guclu bir iz birakti.', { v1: username }),
            backgroundImageUrl: firstCover,
            theme: 'flare',
        },
        {
            id: 'identity',
            kicker: 'OKUYUCU KIMLIGI',
            title: persona.archetypeTitle,
            description: persona.archetypeDescription,
            primaryValue: `${formatCompact(summary.totalReadMangas)} manga`,
            secondaryValue: `${formatCompact(summary.totalFollowedMangas)} takip`,
            quote: `Kimlik etiketi: ${persona.archetypeTitle}`,
            backgroundImageUrl: secondCover,
            theme: 'violet',
        },
        {
            id: 'genre-heart',
            kicker: 'TUR NABZI',
            title: topGenre ? `${topGenre.genre} kalp atisinda` : txa('Tur imzasi olusmadi'),
            description: topGenre
                ? `Bu donemin baskin turu ${topGenre.genre}. Ikinci planda ${summary.topGenres[1]?.genre || 'farkli tatlar'} var.`
                : txa('Biraz daha okuma kaydi ile tur imzasi otomatik sekillenecek.'),
            primaryValue: topGenre ? `${formatCompact(topGenre.count)} okuma` : '0',
            secondaryValue: 'Tur odak noktasi',
            chips: summary.topGenres.slice(0, 4).map((item) => item.genre),
            backgroundImageUrl: thirdCover,
            theme: 'sunset',
        },
        {
            id: 'fansub-link',
            kicker: 'EKIP BAGLANTISI',
            title: topFansub ? `${topFansub.fansubName} en guclu eslikci` : txa('Fansub izi olusmadi'),
            description: topFansub
                ? txa('Bu donemde en cok bu ekibin ritmiyle devam ettin.')
                : txa('Fansub dagilimi olusmasi icin kayitlarin artmasi yeterli.'),
            primaryValue: topFansub ? `${formatCompact(topFansub.readCount)} okuma` : '0',
            secondaryValue: topFansub ? txa('En cok okunan fansub') : undefined,
            chips: summary.topFansubs.slice(0, 4).map((item) => item.fansubName),
            theme: 'cyber',
        },
        {
            id: 'rhythm',
            kicker: 'HAFTALIK RITIM',
            title: busiestDay ? `${busiestDay.label} gunu zirve noktasi` : txa('Ritim olusmadi'),
            description: busiestDay
                ? `En yuksek tempo ${busiestDay.label} gununde geldi.`
                : txa('Ritim karti icin birkac okuma daha gerekli.'),
            primaryValue: busiestDay ? `${formatCompact(busiestDay.count)} okuma` : '0',
            secondaryValue: 'Gun bazli patlama',
            stats: summary.weekdayActivity.map((item) => ({
                label: item.label,
                value: formatCompact(item.count),
            })),
            theme: 'mint',
        },
    ]
}
