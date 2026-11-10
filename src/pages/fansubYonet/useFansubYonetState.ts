import { intlLocale, txa } from '@/i18n/activeLocale'
/**
 * Shared types, constants and helpers for the Fansub Manage page.
 *
 * Why a separate file: FansubYonetPage.tsx had reached 999 lines;
 * keeping shared logic in one place keeps each tab component independent.
 */

// ─── Tipler ─────────────────────────────────────────────
export type FansubRole = 'admin' | 'moderator' | 'member' | null
export type FansubYonetTab =
    | 'genel'
    // Tarihsel fansub-ici boost paneli. Varsayilan olarak gizlidir ve site-admin rollout flag'i ile acilir.
    | 'takviye'
    | 'uyelik'
    | 'ifadeler'
    | 'mangalar'
    | 'bolumler'
    | 'topluluk'
    | 'duyurular'
    | 'gorevler'
    | 'istatistikler'
    | 'kasa'
    | 'kapanis-kredisi'
    | 'roller'

export const FANSUB_YONET_DEFAULT_TAB: FansubYonetTab = 'genel'

// ─── Sabitler ───────────────────────────────────────────
export const PAGE_SIZE = 12

export const POST_CATEGORY_OPTIONS = [
    'Bolum Tartismasi',
    'Manga Incelemesi',
    'Teori',
    'Fan Icerigi',
    'Soru-Cevap',
    'Genel',
]

export const TABS: { id: FansubYonetTab; label: string }[] = [
    { id: 'genel', get label() { return txa('Genel') } },
    { id: 'takviye', get label() { return txa('Takviye') } },
    { id: 'uyelik', get label() { return txa('Uyelik ve Basvurular') } },
    { id: 'ifadeler', get label() { return txa('Emoji Cikartma ve Etiket') } },
    { id: 'mangalar', get label() { return txa('Mangalar') } },
    { id: 'bolumler', get label() { return txa('Bolumler') } },
    { id: 'topluluk', get label() { return txa('Topluluk') } },
    { id: 'duyurular', get label() { return txa('Duyurular') } },
    { id: 'gorevler', get label() { return txa('Gorevler') } },
    { id: 'istatistikler', get label() { return txa('Istatistikler') } },
    { id: 'kasa', get label() { return txa('Kasa') } },
    { id: 'kapanis-kredisi', get label() { return txa('Kapanis Kredisi') } },
    { id: 'roller', get label() { return txa('Roller ve Izinler') } },
]

/** Safely normalizes a tab value from the hash or external sources. */
export function normalizeFansubYonetTab(value: string | null | undefined): FansubYonetTab {
    const rawValue = value?.trim().toLowerCase()
    if (!rawValue) return FANSUB_YONET_DEFAULT_TAB
    // Eski post akisi (v1) sekmesi topluluk v2 sekmesine tasindi.
    const normalizedValue = rawValue === 'postlar' ? 'topluluk' : rawValue
    return TABS.some((tab) => tab.id === normalizedValue)
        ? (normalizedValue as FansubYonetTab)
        : FANSUB_YONET_DEFAULT_TAB
}

// ─── Helpers ──────────────────────────────

/** Extracts a readable message from an unknown error object */
export function toErrorText(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const value = (error as { message?: unknown }).message
        if (typeof value === 'string' && value.trim()) return value
    }
    return fallback
}

/** Converts an ISO date string to a display format */
export function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString(intlLocale())
}

/** Returns the role label */
export function roleLabel(role: FansubRole): string {
    if (role === 'admin') return txa('Admin')
    if (role === 'moderator') return txa('Moderatör')
    if (role === 'member') return txa('Üye')
    return txa('Site yöneticisi')
}

/** Pagination calculator */
export function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE))
}
