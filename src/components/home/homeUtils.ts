import type { CommunityPost } from '@/types'
import type { FollowActivityItem } from '@/services/followFeedService'
import { intlLocale, txa } from '@/i18n/activeLocale'

// ── Relative time format ──
export function formatRelativeTime(dateValue: string) {
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return txa('Şimdi')

    const diffMs = date.getTime() - Date.now()
    const absMs = Math.abs(diffMs)

    const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })
    const minuteMs = 60 * 1000
    const hourMs = 60 * minuteMs
    const dayMs = 24 * hourMs

    if (absMs < minuteMs) return rtf.format(Math.round(diffMs / 1000), 'second')
    if (absMs < hourMs) return rtf.format(Math.round(diffMs / minuteMs), 'minute')
    if (absMs < dayMs) return rtf.format(Math.round(diffMs / hourMs), 'hour')
    return rtf.format(Math.round(diffMs / dayMs), 'day')
}

// ── Community engagement score ──
export function getCommunityEngagementScore(post: CommunityPost) {
    const likes = Number(post.likes || 0)
    const comments = Number(post.comments || 0)
    return likes + comments * 2
}

// ── Follow feed helpers ──
export function getFollowEventLabel(eventType: string) {
    switch (eventType) {
        case 'user_read': return txa('Okuma')
        case 'user_comment': return txa('Yorum')
        case 'fansub_new_chapter': return txa('Yeni bölüm')
        case 'fansub_new_manga': return txa('Yeni manga')
        default: return txa('Etkinlik')
    }
}

export function getFollowActorRoute(item: FollowActivityItem) {
    if (item.actorType === 'user') {
        const username = (item.actorUsername || item.actorName || '').trim()
        if (!username) return null
        return `/profil/${encodeURIComponent(username)}`
    }
    const fansubIdentifier = (item.actorFansubId || item.actorUsername || '').trim()
    if (!fansubIdentifier) return null
    return `/fansub/${encodeURIComponent(fansubIdentifier)}`
}

export function getFollowActorToneClass(actorType: string) {
    if (actorType === 'fansub') return 'text-primary'
    return 'text-sky-400'
}

export function stripFollowActorPrefix(summary: string, actorName: string) {
    const safeSummary = (summary || '').trim()
    const safeActorName = (actorName || '').trim()
    if (!safeSummary || !safeActorName) return null
    const summaryLower = safeSummary.toLocaleLowerCase('tr-TR')
    const actorLower = safeActorName.toLocaleLowerCase('tr-TR')
    if (!summaryLower.startsWith(actorLower)) return null
    return safeSummary.slice(safeActorName.length).trimStart()
}

// ── Genre list (static) ──
export const QUICK_GENRES = [
    { slug: 'aksiyon', get label() { return txa('Aksiyon') }, emoji: '⚔️' },
    { slug: 'romantizm', get label() { return txa('Romantizm') }, emoji: '💕' },
    { slug: 'fantastik', get label() { return txa('Fantastik') }, emoji: '🔮' },
    { slug: 'korku', get label() { return txa('Korku') }, emoji: '👻' },
    { slug: 'isekai', label: 'Isekai', emoji: '🌀' },
    { slug: 'komedi', get label() { return txa('Komedi') }, emoji: '😆' },
    { slug: 'macera', get label() { return txa('Macera') }, emoji: '🗺️' },
    { slug: 'drama', get label() { return txa('Drama') }, emoji: '🎭' },
    { slug: 'bilim-kurgu', get label() { return txa('Bilim Kurgu') }, emoji: '🚀' },
    { slug: 'gerilim', get label() { return txa('Gerilim') }, emoji: '🔪' },
] as const
