import type { StoreItem } from '@/data/storeProducts'
import type { ActivePremiumOffer } from '@/services/premiumPackagePublicService'
import {
    LIST_TITLE_MAX_LENGTH,
    MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
} from '@/services/mangaListService/shared.constants'
import type { MangaListDetail } from '@/services/mangaListService/types'
import type { Fansub, Manga } from '@/types'
import {
    createDefaultE2EMockReleaseScheduleEntries,
    type E2EMockReleaseScheduleEntry,
    type E2EMockReleaseScheduleOptions,
} from './e2eReleaseScheduleFixtures'

export type {
    E2EMockReleaseScheduleEntry,
    E2EMockReleaseScheduleOptions,
} from './e2eReleaseScheduleFixtures'

export interface E2EMockAuthUser {
    id: string
    authUserId: string
    username: string
    displayName?: string
    avatar: string
    role: 'admin' | 'user' | 'moderator'
    isBanned?: boolean
    isActive?: boolean
    stones: number
    ownedItems: Record<string, unknown>
    frameType: string | null
    onboardingCompletedAt?: string | null
    birthDate?: string | null
    premiumExpiresAt?: string | null
}

export interface E2EMockStoreFansubOption {
    id: string
    name: string
    coin_balance: number
    inventory: string[]
}

export interface E2EMockStoreData {
    items: StoreItem[]
    activePremiumOffer?: ActivePremiumOffer | null
    adminFansubs: E2EMockStoreFansubOption[]
    ownedBadgeIds: string[]
    isCoinRedeemEnabled: boolean
    isFansubWalletPurchaseEnabled: boolean
    isStorePurchaseEnabled: boolean
}

export interface E2EMockConfig {
    mockAuthUser?: E2EMockAuthUser
    /**
     * Flag values.
     *
     * E2E mode used to pin some flags, which made the surface behind a flag
     * (e.g. the operations center) completely untestable in e2e. A spec can now
     * turn on any flag it wants; if none is given, the old defaults stay.
     */
    mockFeatureFlags?: Record<string, boolean>
    mockStoreData?: E2EMockStoreData
    mockReleaseScheduleEntries?: E2EMockReleaseScheduleEntry[]
    mockFansubs?: Fansub[]
    mockFansubMangasByFansubId?: Record<string, Manga[]>
    mockMangaListDetails?: Record<string, MangaListDetail>
}

export interface E2ERuntimeCurrentUserSnapshot {
    id: string
    username: string
    stones: number
    ownedItems: Record<string, unknown>
    premiumExpiresAt?: string | null
}

declare global {
    interface Window {
        __BSGMANGA_E2E__?: E2EMockConfig
        __BSGMANGA_E2E_RUNTIME__?: {
            currentUser: E2ERuntimeCurrentUserSnapshot | null
        }
    }
}

export const E2E_QUERY_PARAM_KEY = 'e2e'
export const E2E_QUERY_PARAM_VALUE = '1'
export const E2E_MANGA_LIST_LIMIT_DETAIL_ID = 'e2e-manga-list-limit-detail'
export const E2E_ADMIN_USER_ID = '71000000-0000-4000-8000-000000000001'

function canRunE2EModeInRuntime() {
    return import.meta.env.DEV || import.meta.env.MODE === 'test'
}

function hasE2EQueryParam() {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get(E2E_QUERY_PARAM_KEY) === E2E_QUERY_PARAM_VALUE
}

function getDefaultE2EMockAuthUser(): E2EMockAuthUser {
    return {
        id: E2E_ADMIN_USER_ID,
        authUserId: 'e2e-auth-user-1',
        username: 'e2e_admin',
        displayName: 'E2E Yonetici',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=e2e-admin',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: 25000,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], profile_effects: [], premium: [] },
        frameType: 'default',
        onboardingCompletedAt: new Date().toISOString(),
        birthDate: '1998-04-12',
        premiumExpiresAt: null,
    }
}

function getDefaultE2EMockStoreData(): E2EMockStoreData {
    const items: StoreItem[] = [
        { id: 'e2e-frame-default', name: 'E2E Default Frame', description: 'Varsayilan test cercevesi.', price: 250, currency: 'Coin', type: 'frame', frameType: 'default', isPopular: true, isActive: true },
        { id: 'e2e-frame-neon', name: 'E2E Neon Frame', description: 'Parlak neon cerceve.', price: 420, currency: 'Coin', type: 'frame', frameType: 'neon', isPopular: true, isActive: true },
        { id: 'e2e-frame-fire', name: 'E2E Fire Frame', description: 'Ates temali cerceve.', price: 460, currency: 'Coin', type: 'frame', frameType: 'fire', isNew: true, isActive: true },
        { id: 'e2e-frame-ice', name: 'E2E Ice Frame', description: 'Buz temali cerceve.', price: 440, currency: 'Coin', type: 'frame', frameType: 'ice', isActive: true },
        { id: 'e2e-profile-effect-rose', identifier: 'e2e-profile-effect-rose', name: 'E2E Karanlik Gul Efekti', description: 'Profil efekti karti, satin alma ve hediye modali akisini test eder.', price: 375, currency: 'Coin', type: 'profile_effect', themeName: 'Nocturne', isPopular: true, isActive: true },
        { id: 'e2e-badge-1', name: 'E2E Badge Alpha', description: 'Ilk test rozeti.', price: 180, currency: 'Coin', type: 'badge', image: 'https://api.dicebear.com/7.x/shapes/svg?seed=e2e-badge-1', isPopular: true, isActive: true },
        { id: 'e2e-badge-2', name: 'E2E Badge Beta', description: 'Ikinci test rozeti.', price: 210, currency: 'Coin', type: 'badge', image: 'https://api.dicebear.com/7.x/shapes/svg?seed=e2e-badge-2', isActive: true },
        { id: 'e2e-pattern-1', name: 'E2E Pattern Dots', description: 'Nokta test patterni.', price: 120, currency: 'Coin', type: 'pattern', image: 'dots', isActive: true },
        { id: 'e2e-pattern-2', name: 'E2E Pattern Grid', description: 'Grid test patterni.', price: 130, currency: 'Coin', type: 'pattern', image: 'grid', isActive: true },
        { id: 'e2e-background-1', name: 'E2E Background Space', description: 'Uzay test arka plani.', price: 300, currency: 'Coin', type: 'background', image: 'space', isActive: true },
        { id: 'e2e-background-2', name: 'E2E Background City', description: 'Sehir test arka plani.', price: 320, currency: 'Coin', type: 'background', image: 'city', isNew: true, isActive: true },
        { id: 'e2e-premium-1', identifier: 'namefx-pass', name: 'E2E Premium', description: 'Premium test urunu.', price: 600, currency: 'Coin', type: 'premium', icon: 'P', isActive: true },
    ]


    return {
        items,
        activePremiumOffer: {
            premiumItem: { id: 'e2e-premium-1', identifier: 'namefx-pass', name: 'E2E Premium', description: 'Premium test urunu.', price: 600 },
            durationDays: 30,
            publicUnlockDelayHours: 36,
        },
        adminFansubs: [{ id: 'e2e-fansub-1', name: 'E2E Fansub', coin_balance: 18000, inventory: [] }],
        ownedBadgeIds: [],
        isCoinRedeemEnabled: true,
        isFansubWalletPurchaseEnabled: true,
        isStorePurchaseEnabled: true,
    }
}

type E2EFansubScenario = {
    id: string
    name: string
    slug: string
    description?: string
    mangaCount: number
    followerCount: number
    createdDaysAgo: number
    avatarSeed: string
    avatarBase: string
    avatarAccent: string
    avatarInk?: string
    backgroundStyle?: string
    customBackgroundAssetUrl?: string
    canUploadStaticBackground?: boolean
    canUploadVideoBackground?: boolean
    profilePatternStyle?: string
    hasDiscoverBadge?: boolean
    hasGoldFrame?: boolean
    hasFullNameStyle?: boolean
    frameType?: Fansub['frameType']
    primaryColor?: string
    secondaryColor?: string
    activeNameStyle?: Fansub['activeNameStyle']
}

const E2E_DAY_MS = 86_400_000

const E2E_FANSUB_BACKGROUND_STYLES = {
    acid:
        'radial-gradient(circle at 16% 22%, rgba(57,255,20,0.92) 0 16%, transparent 17%), repeating-linear-gradient(135deg, #ff00a8 0 10px, #111827 10px 22px, #39ff14 22px 34px)',
    pastel:
        'linear-gradient(110deg, #f8fafc 0%, #fef3c7 38%, #fbcfe8 72%, #bae6fd 100%)',
    mangaPanel:
        'linear-gradient(90deg, rgba(6,8,14,0.24), rgba(239,68,68,0.18)), repeating-linear-gradient(90deg, #111827 0 2px, #020617 2px 28px)',
    striped:
        'repeating-linear-gradient(45deg, #f97316 0 9px, #020617 9px 18px, #22d3ee 18px 27px), linear-gradient(120deg, #111827, #7f1d1d)',
    lowContrast:
        'linear-gradient(135deg, #fafafa, #f5f5f4 42%, #fde68a)',
    deepBlue:
        'radial-gradient(circle at 72% 18%, rgba(56,189,248,0.7), transparent 28%), linear-gradient(135deg, #020617 0%, #172554 54%, #0f172a 100%)',
    redBlack:
        'radial-gradient(circle at 22% 24%, rgba(239,68,68,0.82), transparent 34%), linear-gradient(120deg, #050505, #450a0a 48%, #111827)',
    noisyGrid:
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 15px), repeating-linear-gradient(90deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 17px), linear-gradient(135deg, #111827, #312e81)',
    yellowPop:
        'radial-gradient(circle at 78% 24%, rgba(250,204,21,0.9), transparent 30%), linear-gradient(120deg, #1f2937, #713f12 52%, #020617)',
    cold:
        'linear-gradient(135deg, #e0f2fe 0%, #0f172a 42%, #1e3a8a 100%)',
    emptyBlack:
        'linear-gradient(180deg, #000000, #050505)',
}

const E2E_FANSUB_PATTERN_STYLES = [
    'radial-gradient(circle at 12px 12px, rgba(255,255,255,0.16) 0 2px, transparent 3px)',
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 12px)',
    'repeating-linear-gradient(45deg, rgba(239,68,68,0.18) 0 2px, transparent 2px 14px)',
]

const E2E_FANSUB_NAME_STYLE_PRESETS: Array<NonNullable<Fansub['activeNameStyle']>> = [
    { version: 1, fontId: 'bold', effectId: 'neon', colorId: 'violet', secondaryColorId: 'cyan' },
    { version: 1, fontId: 'mono', effectId: 'glitch', colorId: 'white', secondaryColorId: 'pink' },
    { version: 1, fontId: 'serif', effectId: 'gradient', colorId: 'gold', secondaryColorId: 'copper' },
    { version: 1, fontId: 'comic', effectId: 'comic', colorId: 'white', secondaryColorId: 'sunset' },
    { version: 1, fontId: 'tech', effectId: 'arc', colorId: 'cyan', secondaryColorId: 'blue' },
    { version: 1, fontId: 'round', effectId: 'pop', colorId: 'pink', secondaryColorId: 'gold' },
    { version: 1, fontId: 'display', effectId: 'prism', colorId: 'rainbow', secondaryColorId: 'white' },
    { version: 1, fontId: 'neo', effectId: 'solid', colorId: 'crimson', secondaryColorId: 'neutral' },
]

const E2E_FANSUB_SCENARIOS: E2EFansubScenario[] = [
    { id: 'e2e-fansub-full-about', name: 'Nocturne E2E Scan', slug: 'nocturne-e2e-scan', description: 'Kalite kontrol, redaksiyon, temizleme, dizgi, terim birligi, haftalik yayin planlama, bolum teslim kontrolu, okur geri bildirimi, ekip ici rol dagilimi, arsiv duzeni, seri takip notlari ve uzun hakkinda siniri testi icin bilincli olarak doldurulmus e2e fansub aciklamasi.', mangaCount: 28, followerCount: 12400, createdDaysAgo: 14, avatarSeed: 'nocturne', avatarBase: '#111827', avatarAccent: '#ef4444', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.mangaPanel, canUploadStaticBackground: true, hasGoldFrame: true, frameType: 'avatarframe1', primaryColor: '#ef4444', secondaryColor: '#0f172a' },
    { id: 'e2e-fansub-acid-pop', name: 'Asit Neon Scan', slug: 'asit-neon-scan', description: 'Bilincli olarak sert neon renklerle hazirlanmis arka plan ve avatar uyumsuzlugu testi.', mangaCount: 19, followerCount: 4300, createdDaysAgo: 8, avatarSeed: 'acid-pop', avatarBase: '#39ff14', avatarAccent: '#ff00a8', avatarInk: '#111827', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.acid, canUploadStaticBackground: true, hasDiscoverBadge: true, hasFullNameStyle: true, frameType: 'neon', primaryColor: '#39ff14', secondaryColor: '#ff00a8', activeNameStyle: { version: 1, fontId: 'display', effectId: 'prism', colorId: 'rainbow', secondaryColorId: 'pink' } },
    { id: 'e2e-fansub-very-long-name', name: 'CokUzunIsimliFansubTopluluguTestIcinKesintisizYaziyor', slug: 'cok-uzun-isimli-fansub-toplulugu', description: 'Isim kirilma ve truncate davranisini zorlayan, tek kelimelik cok uzun fansub adi.', mangaCount: 13, followerCount: 221, createdDaysAgo: 2, avatarSeed: 'long-name', avatarBase: '#0f172a', avatarAccent: '#facc15', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.striped, canUploadStaticBackground: true, hasDiscoverBadge: true, frameType: 'rainbow', primaryColor: '#facc15', secondaryColor: '#0f172a' },
    { id: 'e2e-fansub-no-background', name: 'Siyah Zemin Ekibi', slug: 'siyah-zemin-ekibi', description: 'Arka plan yuklemeyen fansub. Liste ve hover tema zemininde kalmali.', mangaCount: 8, followerCount: 980, createdDaysAgo: 31, avatarSeed: 'no-bg', avatarBase: '#020617', avatarAccent: '#64748b', hasGoldFrame: true, frameType: 'gold', primaryColor: '#ef4444', secondaryColor: '#020617' },
    { id: 'e2e-fansub-locked-background', name: 'Kilitli Arka Plan Test', slug: 'kilitli-arka-plan-test', description: 'Arka plan stili var ama takviye capability kapali. Sayfa bu gorseli yok saymali.', mangaCount: 5, followerCount: 76, createdDaysAgo: 44, avatarSeed: 'locked-bg', avatarBase: '#18181b', avatarAccent: '#fb7185', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.redBlack, canUploadStaticBackground: false, frameType: 'fire', primaryColor: '#fb7185', secondaryColor: '#111827' },
    { id: 'e2e-fansub-low-contrast', name: 'Soluk Pastel Arka Plan', slug: 'soluk-pastel-arka-plan', description: 'Acik tema ve dusuk kontrastli yuklenmis arka plan kontrolu.', mangaCount: 16, followerCount: 18000, createdDaysAgo: 97, avatarSeed: 'pastel', avatarBase: '#f8fafc', avatarAccent: '#f59e0b', avatarInk: '#1f2937', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.pastel, canUploadStaticBackground: true, frameType: 'ice', primaryColor: '#f59e0b', secondaryColor: '#f8fafc' },
    { id: 'e2e-fansub-zero-release', name: 'Sifir Icerik Laboratuvari', slug: 'sifir-icerik-laboratuvari', description: 'Takipci var fakat onayli yayinlanmis bolum yok. Son hareketlerde gorunmemeli.', mangaCount: 0, followerCount: 640, createdDaysAgo: 4, avatarSeed: 'zero', avatarBase: '#312e81', avatarAccent: '#a78bfa', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.deepBlue, canUploadStaticBackground: true, primaryColor: '#a78bfa', secondaryColor: '#020617' },
    { id: 'e2e-fansub-huge-numbers', name: 'Dev Arsiv Ceviri Kulubu', slug: 'dev-arsiv-ceviri-kulubu', description: 'Kisa aciklama, cok yuksek takipci ve seri sayisi.', mangaCount: 64, followerCount: 1250000, createdDaysAgo: 365, avatarSeed: 'huge', avatarBase: '#7f1d1d', avatarAccent: '#facc15', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.yellowPop, canUploadStaticBackground: true, hasGoldFrame: true, hasDiscoverBadge: true, frameType: 'gold', primaryColor: '#facc15', secondaryColor: '#7f1d1d' },
    { id: 'e2e-fansub-tiny-name', name: 'Q', slug: 'q', description: 'Tek harfli fansub adi, avatar ve hover isim hizasi testi.', mangaCount: 3, followerCount: 9, createdDaysAgo: 1, avatarSeed: 'q', avatarBase: '#020617', avatarAccent: '#22d3ee', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.cold, canUploadStaticBackground: true, frameType: 'avatarframe2', primaryColor: '#22d3ee', secondaryColor: '#020617' },
    { id: 'e2e-fansub-empty-description', name: 'Aciklamasiz Ekip', slug: 'aciklamasiz-ekip', description: '', mangaCount: 11, followerCount: 1520, createdDaysAgo: 70, avatarSeed: 'empty-desc', avatarBase: '#171717', avatarAccent: '#ef4444', canUploadStaticBackground: false, primaryColor: '#ef4444', secondaryColor: '#171717' },
    { id: 'e2e-fansub-grid-noise', name: 'Grid Noise Team', slug: 'grid-noise-team', description: 'Cok katmanli grid arka planla metin okunurlugu ve crop davranisi.', mangaCount: 22, followerCount: 3610, createdDaysAgo: 19, avatarSeed: 'grid-noise', avatarBase: '#111827', avatarAccent: '#38bdf8', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.noisyGrid, canUploadStaticBackground: true, profilePatternStyle: E2E_FANSUB_PATTERN_STYLES[1], hasDiscoverBadge: true, frameType: 'avatarframe3', primaryColor: '#38bdf8', secondaryColor: '#111827' },
    { id: 'e2e-fansub-red-on-red', name: 'Kirmizi Ustu Kirmizi', slug: 'kirmizi-ustu-kirmizi', description: 'Ayni hue ailesinde secimler yapildiginda buton ve isim dengesi testi.', mangaCount: 14, followerCount: 2870, createdDaysAgo: 62, avatarSeed: 'red-red', avatarBase: '#450a0a', avatarAccent: '#ef4444', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.redBlack, canUploadStaticBackground: true, hasFullNameStyle: true, frameType: 'fire', primaryColor: '#ef4444', secondaryColor: '#991b1b', activeNameStyle: { version: 1, fontId: 'serif', effectId: 'gradient', colorId: 'crimson', secondaryColorId: 'sunset' } },
    { id: 'e2e-fansub-custom-asset', name: 'Kapak Gorselli Ekip', slug: 'kapak-gorselli-ekip', description: 'Custom asset fallback yolu gercek bir public gorsel ile denenir.', mangaCount: 17, followerCount: 5400, createdDaysAgo: 21, avatarSeed: 'custom-asset', avatarBase: '#0f172a', avatarAccent: '#fb7185', customBackgroundAssetUrl: '/covers/optimized/dragon-court.webp', canUploadStaticBackground: true, frameType: 'halloween', primaryColor: '#fb7185', secondaryColor: '#0f172a' },
    { id: 'e2e-fansub-bright-white', name: 'Bembeyaz Tema Denemesi', slug: 'bembeyaz-tema-denemesi', description: 'Light mode beyaz zemin davranisini ve koyu yaziyi zorlar.', mangaCount: 9, followerCount: 420, createdDaysAgo: 53, avatarSeed: 'white', avatarBase: '#ffffff', avatarAccent: '#111827', avatarInk: '#111827', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.lowContrast, canUploadStaticBackground: true, primaryColor: '#111827', secondaryColor: '#ffffff' },
    { id: 'e2e-fansub-broken-balance', name: 'Uyumsuz Renk Atolyesi', slug: 'uyumsuz-renk-atolyesi', description: 'Avatar, arka plan ve rozet renkleri bilerek farkli ailelerden secildi.', mangaCount: 6, followerCount: 333, createdDaysAgo: 120, avatarSeed: 'broken-balance', avatarBase: '#ffedd5', avatarAccent: '#7c3aed', avatarInk: '#111827', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.acid, canUploadStaticBackground: true, hasDiscoverBadge: true, frameType: 'rainbow', primaryColor: '#7c3aed', secondaryColor: '#ffedd5' },
    { id: 'e2e-fansub-compact-1', name: 'Lumiere E2E Scan', slug: 'lumiere-e2e-scan', description: 'Dram ve romantik serilerde duzenli ceviri yapan ekip.', mangaCount: 7, followerCount: 7100, createdDaysAgo: 34, avatarSeed: 'lumiere', avatarBase: '#18181b', avatarAccent: '#f59e0b', customBackgroundAssetUrl: '/backgrounds/optimized/bg-city-glow.webp', canUploadStaticBackground: true, frameType: 'gold', primaryColor: '#f59e0b', secondaryColor: '#171717' },
    { id: 'e2e-fansub-compact-2', name: 'Void E2E Scan', slug: 'void-e2e-scan', description: 'Bilim kurgu ve dogaustu projelerde hizli yayin akisi.', mangaCount: 11, followerCount: 8900, createdDaysAgo: 5, avatarSeed: 'void', avatarBase: '#020617', avatarAccent: '#a855f7', customBackgroundAssetUrl: '/backgrounds/optimized/bg-night-alley.webp', canUploadStaticBackground: true, hasDiscoverBadge: true, frameType: 'neon', primaryColor: '#a855f7', secondaryColor: '#020617' },
    { id: 'e2e-fansub-muted', name: 'Sessiz Arsiv', slug: 'sessiz-arsiv', description: 'Arka plansiz, rozetsiz ve dusuk aktiviteyle sakin kart testi.', mangaCount: 2, followerCount: 38, createdDaysAgo: 240, avatarSeed: 'muted', avatarBase: '#1f2937', avatarAccent: '#9ca3af', primaryColor: '#9ca3af', secondaryColor: '#111827' },
    { id: 'e2e-fansub-new-hot', name: 'Yeni Alev Ekibi', slug: 'yeni-alev-ekibi', description: 'Yeni fansublar filtresinde ustte cikmasi gereken taze kayit.', mangaCount: 12, followerCount: 1280, createdDaysAgo: 0, avatarSeed: 'new-hot', avatarBase: '#7f1d1d', avatarAccent: '#f97316', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.redBlack, canUploadStaticBackground: true, frameType: 'fire', primaryColor: '#f97316', secondaryColor: '#7f1d1d' },
    { id: 'e2e-fansub-old-giant', name: 'Eski Dev Ekip', slug: 'eski-dev-ekip', description: 'Cok eski olmasina ragmen hala yuksek toplam ceviri sayisi olan ekip.', mangaCount: 48, followerCount: 92000, createdDaysAgo: 920, avatarSeed: 'old-giant', avatarBase: '#111827', avatarAccent: '#fde047', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.deepBlue, canUploadStaticBackground: true, hasGoldFrame: true, hasFullNameStyle: true, frameType: 'gold', primaryColor: '#fde047', secondaryColor: '#111827', activeNameStyle: { version: 1, fontId: 'serif', effectId: 'gradient', colorId: 'gold', secondaryColorId: 'white' } },
    { id: 'e2e-fansub-one-shot', name: 'Tek Bolum Denemesi', slug: 'tek-bolum-denemesi', description: 'Sadece tek seri ve az bolumle kart alt metriği testi.', mangaCount: 1, followerCount: 17, createdDaysAgo: 15, avatarSeed: 'one-shot', avatarBase: '#0f172a', avatarAccent: '#e879f9', primaryColor: '#e879f9', secondaryColor: '#0f172a' },
    { id: 'e2e-fansub-many-followers-no-activity', name: 'Kalabalik Ama Sessiz', slug: 'kalabalik-ama-sessiz', description: 'Yuksek takipcili ama az icerikli ekip siralama etkisini test eder.', mangaCount: 1, followerCount: 55000, createdDaysAgo: 180, avatarSeed: 'silent-large', avatarBase: '#111827', avatarAccent: '#22c55e', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.emptyBlack, canUploadStaticBackground: true, primaryColor: '#22c55e', secondaryColor: '#111827' },
    { id: 'e2e-fansub-pattern-only', name: 'Pattern Deneme Ekibi', slug: 'pattern-deneme-ekibi', description: 'Hover icinde pattern katmani gorunurlugunu dener.', mangaCount: 10, followerCount: 2400, createdDaysAgo: 76, avatarSeed: 'pattern-only', avatarBase: '#312e81', avatarAccent: '#c084fc', profilePatternStyle: E2E_FANSUB_PATTERN_STYLES[2], primaryColor: '#c084fc', secondaryColor: '#312e81' },
    { id: 'e2e-fansub-blue-cold', name: 'Buz Mavi Kolektif', slug: 'buz-mavi-kolektif', description: 'Soguk tonlu yuklenmis arka plan ve sade avatar kombinasyonu.', mangaCount: 24, followerCount: 7600, createdDaysAgo: 41, avatarSeed: 'blue-cold', avatarBase: '#0c4a6e', avatarAccent: '#bae6fd', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.cold, canUploadStaticBackground: true, frameType: 'ice', primaryColor: '#38bdf8', secondaryColor: '#0c4a6e' },
    { id: 'e2e-fansub-cluttered-copy', name: 'Cok Uzun Aciklama Ekibi', slug: 'cok-uzun-aciklama-ekibi', description: 'Bu ekip hakkinda metni bilerek cok uzun tutuldu. Editorluk, balon temizleme, redaksiyon, yayin planlama, seri devralma, arsivleme, kaynak kontrolu, haftalik raporlama ve okur geri bildirimi gibi tum alanlari tek paragrafta anlatiyor.', mangaCount: 15, followerCount: 3100, createdDaysAgo: 27, avatarSeed: 'clutter-copy', avatarBase: '#1f2937', avatarAccent: '#f472b6', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.noisyGrid, canUploadStaticBackground: true, hasDiscoverBadge: true, primaryColor: '#f472b6', secondaryColor: '#1f2937' },
    { id: 'e2e-fansub-avatar-clash', name: 'Avatar Carpismasi', slug: 'avatar-carpismasi', description: 'Avatar rengi ile arka planin bilerek cakistigi senaryo.', mangaCount: 18, followerCount: 690, createdDaysAgo: 66, avatarSeed: 'avatar-clash', avatarBase: '#ff00a8', avatarAccent: '#39ff14', avatarInk: '#111827', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.acid, canUploadStaticBackground: true, frameType: 'avatarframe4', primaryColor: '#ff00a8', secondaryColor: '#39ff14' },
    { id: 'e2e-fansub-no-avatar-looking', name: 'Minimal Avatar', slug: 'minimal-avatar', description: 'Neredeyse bos gorunen avatarla liste tarama testi.', mangaCount: 4, followerCount: 115, createdDaysAgo: 11, avatarSeed: 'minimal-avatar', avatarBase: '#050505', avatarAccent: '#0a0a0a', avatarInk: '#525252', primaryColor: '#737373', secondaryColor: '#050505' },
    { id: 'e2e-fansub-gold-on-yellow', name: 'Altin Ustu Altin', slug: 'altin-ustu-altin', description: 'Gold frame ve sari arka plan birlikteyken hover/rozet dengesi.', mangaCount: 20, followerCount: 18500, createdDaysAgo: 88, avatarSeed: 'gold-yellow', avatarBase: '#713f12', avatarAccent: '#facc15', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.yellowPop, canUploadStaticBackground: true, hasGoldFrame: true, hasDiscoverBadge: true, frameType: 'gold', primaryColor: '#facc15', secondaryColor: '#713f12' },
    { id: 'e2e-fansub-mid-table', name: 'Orta Sira Ekip', slug: 'orta-sira-ekip', description: 'Ne cok iyi ne kotu, orta tablo kart dengesi.', mangaCount: 12, followerCount: 1450, createdDaysAgo: 137, avatarSeed: 'mid-table', avatarBase: '#0f172a', avatarAccent: '#ef4444', primaryColor: '#ef4444', secondaryColor: '#0f172a' },
    { id: 'e2e-fansub-random-local', name: 'Yerel Deney Toplulugu', slug: 'yerel-deney-toplulugu', description: 'Kucuk takipci kitlesi, guclu renkler ve kisa aciklama.', mangaCount: 6, followerCount: 300, createdDaysAgo: 22, avatarSeed: 'local-test', avatarBase: '#064e3b', avatarAccent: '#34d399', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.striped, canUploadStaticBackground: true, primaryColor: '#34d399', secondaryColor: '#064e3b' },
    { id: 'e2e-fansub-long-spaced', name: 'Bosluklu Uzun Fansub Ismi Deneme Ekibi', slug: 'bosluklu-uzun-fansub-ismi-deneme-ekibi', description: 'Bosluklu uzun isimlerde satir ve hover hizasini dener.', mangaCount: 9, followerCount: 890, createdDaysAgo: 55, avatarSeed: 'long-spaced', avatarBase: '#581c87', avatarAccent: '#f0abfc', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.deepBlue, canUploadStaticBackground: true, hasFullNameStyle: true, primaryColor: '#f0abfc', secondaryColor: '#581c87', activeNameStyle: { version: 1, fontId: 'display', effectId: 'gradient', colorId: 'violet', secondaryColorId: 'cyan' } },
    { id: 'e2e-fansub-locked-custom-asset', name: 'Kilitli Asset Gorunmemeli', slug: 'kilitli-asset-gorunmemeli', description: 'Custom asset var ama static background hakki yok; kart siyah/beyaz zemin kullanmali.', mangaCount: 10, followerCount: 610, createdDaysAgo: 111, avatarSeed: 'locked-asset', avatarBase: '#18181b', avatarAccent: '#60a5fa', customBackgroundAssetUrl: '/covers/optimized/phantom-guild.webp', canUploadStaticBackground: false, primaryColor: '#60a5fa', secondaryColor: '#18181b' },
    { id: 'e2e-fansub-final-edge', name: 'Son Kenar Durum Ekibi', slug: 'son-kenar-durum-ekibi', description: 'Listenin son sayfalarinda yuklenen kart ve popover kontrolu icin ekstra senaryo.', mangaCount: 23, followerCount: 2750, createdDaysAgo: 150, avatarSeed: 'final-edge', avatarBase: '#111827', avatarAccent: '#fb7185', backgroundStyle: E2E_FANSUB_BACKGROUND_STYLES.mangaPanel, canUploadStaticBackground: true, frameType: 'halloween', primaryColor: '#fb7185', secondaryColor: '#111827' },
]

function createE2EDataSvgUrl(svg: string) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`
}

function createE2EFansubAvatarUrl(scenario: E2EFansubScenario) {
    const hash = [...scenario.avatarSeed].reduce((total, char) => total + char.charCodeAt(0), 0)
    const initials = escapeSvgText(
        scenario.name
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word[0])
            .join('')
            .slice(0, 3)
            .toUpperCase() || 'E2E',
    )
    const ink = scenario.avatarInk || '#ffffff'
    const accentShape = hash % 3 === 0
        ? `<circle cx="112" cy="48" r="42" fill="${scenario.avatarAccent}" opacity="0.9"/>`
        : hash % 3 === 1
            ? `<rect x="96" y="18" width="74" height="74" rx="18" fill="${scenario.avatarAccent}" opacity="0.9" transform="rotate(12 133 55)"/>`
            : `<path d="M118 15 L174 86 L102 112 Z" fill="${scenario.avatarAccent}" opacity="0.9"/>`
    const pattern = hash % 2 === 0
        ? '<path d="M12 126 C48 88 80 150 126 102 C148 78 166 88 188 64" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="12" stroke-linecap="round"/>'
        : '<g opacity="0.22"><circle cx="40" cy="42" r="8" fill="#ffffff"/><circle cx="76" cy="120" r="5" fill="#ffffff"/><circle cx="154" cy="138" r="10" fill="#ffffff"/></g>'
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
          <rect width="192" height="192" rx="96" fill="${scenario.avatarBase}"/>
          ${pattern}
          ${accentShape}
          <circle cx="96" cy="96" r="82" fill="none" stroke="${scenario.avatarAccent}" stroke-opacity="0.64" stroke-width="6"/>
          <text x="96" y="111" text-anchor="middle" fill="${ink}" font-family="Arial, sans-serif" font-size="${initials.length > 2 ? 42 : 54}" font-weight="900">${initials}</text>
        </svg>
    `
    return createE2EDataSvgUrl(svg)
}

function createE2EDateDaysAgo(daysAgo: number) {
    return new Date(Date.now() - Math.max(0, daysAgo) * E2E_DAY_MS).toISOString()
}

function shouldUseE2ENameStyle(scenario: E2EFansubScenario, index: number) {
    return scenario.hasFullNameStyle === true || index % 4 === 1 || index % 7 === 0
}

function resolveE2EFansubNameStyle(scenario: E2EFansubScenario, index: number) {
    if (!shouldUseE2ENameStyle(scenario, index)) return undefined
    return scenario.activeNameStyle || E2E_FANSUB_NAME_STYLE_PRESETS[index % E2E_FANSUB_NAME_STYLE_PRESETS.length]
}

function getDefaultE2EMockFansubs(): Fansub[] {
    const now = new Date().toISOString()

    return E2E_FANSUB_SCENARIOS.map((scenario, index) => ({
        id: scenario.id,
        name: scenario.name,
        slug: scenario.slug,
        avatar: createE2EFansubAvatarUrl(scenario),
        description: scenario.description,
        mangaCount: scenario.mangaCount,
        followerCount: scenario.followerCount,
        hasDiscoverBadge: scenario.hasDiscoverBadge,
        hasGoldFrame: scenario.hasGoldFrame,
        hasFullNameStyle: shouldUseE2ENameStyle(scenario, index),
        canUploadStaticBackground: scenario.canUploadStaticBackground,
        canUploadVideoBackground: scenario.canUploadVideoBackground,
        frameType: scenario.frameType,
        primaryColor: scenario.primaryColor,
        secondaryColor: scenario.secondaryColor,
        customBackgroundAssetUrl: scenario.customBackgroundAssetUrl,
        profileBackgroundStyle: scenario.backgroundStyle,
        profilePatternStyle: scenario.profilePatternStyle,
        activeNameStyle: resolveE2EFansubNameStyle(scenario, index),
        createdAt: createE2EDateDaysAgo(scenario.createdDaysAgo),
        updatedAt: now,
    }))
}

const E2E_MANGA_TITLE_POOL = [
    'Kizil Nobet',
    'Gece Katlari',
    'Ejder Mahkemesi',
    'Hayalet Lonca',
    'Ay Isigi Akademisi',
    'Gokyuzu Tapinagi',
    'Kirik Tac',
    'Sessiz Kule',
    'Pasli Kalkan',
    'Derin Arsiv',
]

function createE2ESlug(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'e2e'
}

function createE2EMockMangasForFansub(scenario: E2EFansubScenario): Manga[] {
    const previewCount = Math.min(10, Math.max(0, scenario.mangaCount))
    return Array.from({ length: previewCount }, (_, index) => {
        const titleSeed = E2E_MANGA_TITLE_POOL[(index + scenario.id.length) % E2E_MANGA_TITLE_POOL.length]
        const title = index === 0 && scenario.id === 'e2e-fansub-very-long-name'
            ? 'Cok Uzun Seri Adi Kart Popover Satir Kirilma Denemesi'
            : `${titleSeed} ${index + 1}`
        const mangaId = `${scenario.id}-manga-${index + 1}`
        return {
            id: mangaId,
            slug: createE2ESlug(`${scenario.slug}-${title}`),
            title,
            coverImage: createE2ECoverImageUrl(title, mangaId),
            lastChapter: `${Math.max(1, scenario.mangaCount * 3 - index)}. Bolum`,
            lastChapterTitle: index % 3 === 0 ? 'E2E uzun bolum basligi testi' : undefined,
        }
    })
}

function getDefaultE2EMockFansubMangasByFansubId(): Record<string, Manga[]> {
    return Object.fromEntries(
        E2E_FANSUB_SCENARIOS.map((scenario) => [
            scenario.id,
            createE2EMockMangasForFansub(scenario),
        ]),
    )
}

const E2E_COVER_PALETTES = [
    ['#172554', '#38bdf8', '#ecfeff'],
    ['#3b0764', '#f472b6', '#fff1f2'],
    ['#064e3b', '#34d399', '#ecfdf5'],
    ['#7f1d1d', '#fb7185', '#fff7ed'],
    ['#312e81', '#a78bfa', '#f5f3ff'],
    ['#1f2937', '#facc15', '#fefce8'],
]

function escapeSvgText(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function createE2ECoverImageUrl(title: string, id: string) {
    const paletteIndex = Math.abs([...id].reduce((total, char) => total + char.charCodeAt(0), 0)) % E2E_COVER_PALETTES.length
    const [base, accent, ink] = E2E_COVER_PALETTES[paletteIndex]
    const coverTitle = escapeSvgText(title.split(' ').slice(0, 3).join(' '))
    const code = escapeSvgText(id.replace(/[^a-z0-9]+/gi, ' ').trim().slice(0, 18).toUpperCase())
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="460" viewBox="0 0 320 460">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${base}"/>
              <stop offset="1" stop-color="#020617"/>
            </linearGradient>
            <radialGradient id="flare" cx="70%" cy="18%" r="70%">
              <stop offset="0" stop-color="${accent}" stop-opacity="0.95"/>
              <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="320" height="460" rx="26" fill="url(#bg)"/>
          <rect x="20" y="20" width="280" height="420" rx="20" fill="url(#flare)" opacity="0.9"/>
          <path d="M38 330 C92 286 130 370 184 316 C221 279 249 301 286 263 L286 440 L38 440 Z" fill="${accent}" opacity="0.34"/>
          <circle cx="250" cy="82" r="46" fill="${accent}" opacity="0.35"/>
          <circle cx="84" cy="146" r="38" fill="#ffffff" opacity="0.12"/>
          <text x="34" y="58" fill="${ink}" font-family="Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="3">E2E MANGA</text>
          <text x="34" y="238" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="900">
            <tspan x="34" dy="0">${coverTitle}</tspan>
          </text>
          <text x="34" y="398" fill="${ink}" font-family="Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="2">${code}</text>
        </svg>
    `.trim()

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function createE2ELimitText(seed: string, maxLength: number) {
    let value = ''
    while (value.length + seed.length + (value ? 1 : 0) <= maxLength) {
        value = value ? `${value} ${seed}` : seed
    }
    return value.padEnd(maxLength, '.')
}

function createE2EMockMangaListLimitDetail(): MangaListDetail {
    const listTitle = createE2ELimitText('Karakter siniri e2e liste basligi', LIST_TITLE_MAX_LENGTH)
    const listDescription = createE2ELimitText(
        'Bu e2e liste aciklamasi maksimum alanlari, uzun tur etiketlerini, uzun notlari, puan ve bolum kolon hizasini ayni anda zorlamak icin hazirlandi.',
        1200,
    )
    const noteSeed = 'Bu seri sinir testinde liste notu alaninin son karakterlerine kadar dolu kalmasi, tablo satir yuksekligi, iki satir kesme davranisi ve mobil kirilma kontrolu icin eklendi.'
    const denseGenreSet = [
        'Fantastik',
        'Aksiyon',
        'Dogaustu',
        'Macera',
        'Gizem',
        'Dram',
        'Psikolojik',
        'Okul',
        'Slice of Life',
        'Bilim Kurgu',
    ]
    const titles = [
        'KesintisizCokUzunMangaBasligiSatirKirilmaVeTruncateDavranisiDenemesi',
        'Bosluklu Cok Uzun Manga Basligi Liste Satirinda Denge Koruma Testi',
        'Kisa',
        'Orta Uzunlukta Fantastik Akademi Arsivi',
        'Puan ve Okunma Degeri Cok Yuksek Seri',
        'Bolum Basligi Sinir Denemesi',
        'Tur Etiketi Kalabalik Olan Manga',
        'Kapak Kolaji Kontrast Testi',
        'Son Satir Hizalama Denemesi',
        'Mobil Dar Alan Satir Testi',
        'Notu Olmayan Fallback Gerekce',
        'Final Kenar Durum Manga',
    ]

    const items = titles.map((title, index) => {
        const mangaId = `e2e-limit-manga-${String(index + 1).padStart(2, '0')}`
        return {
            id: `e2e-limit-item-${String(index + 1).padStart(2, '0')}`,
            mangaId,
            position: index + 1,
            note: index === 10 ? undefined : createE2ELimitText(noteSeed, MANGA_LIST_ITEM_NOTE_MAX_LENGTH),
            title,
            slug: createE2ESlug(title),
            coverImage: createE2ECoverImageUrl(title, mangaId),
            lastChapter: `${999 - index}. Bolum`,
            isNew: index % 5 === 0,
            rating: Number(Math.max(1, 5 - index * 0.18).toFixed(1)),
            views: 999_999 - index * 72_345,
            genres: denseGenreSet.map((_, genreIndex) => denseGenreSet[(index + genreIndex) % denseGenreSet.length]),
        }
    })

    return {
        id: E2E_MANGA_LIST_LIMIT_DETAIL_ID,
        title: listTitle,
        description: listDescription,
        isPublic: true,
        ownerId: E2E_ADMIN_USER_ID,
        ownerUsername: 'e2e_sinir_testi_icin_uzun_kullanici_adi',
        ownerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=e2e-list-limit-owner',
        ownerFrameType: 'default',
        categoryId: 'fantasy',
        coverMangaId: items[0]?.mangaId,
        coverMangaTitle: items[0]?.title,
        coverMangaSlug: items[0]?.slug,
        coverImage: items[0]?.coverImage,
        previewImages: items.slice(0, 5).map((item) => item.coverImage),
        itemsCount: items.length,
        ratingsCount: 99999,
        ratingAvg: 4.95,
        commentsCount: 128,
        createdAt: createE2EDateDaysAgo(365),
        updatedAt: createE2EDateDaysAgo(1),
        items,
        myRating: null,
        canEdit: true,
    }
}

export function getE2EMockReleaseScheduleEntries(
    options: E2EMockReleaseScheduleOptions = {},
): E2EMockReleaseScheduleEntry[] | null {
    if (!isE2EModeEnabled()) return null

    const entries = window.__BSGMANGA_E2E__?.mockReleaseScheduleEntries
        ?? createDefaultE2EMockReleaseScheduleEntries(createE2ECoverImageUrl)
    const start = options.from ? new Date(options.from) : new Date()
    const startTime = Number.isNaN(start.getTime()) ? 0 : start.getTime()
    const safeDaysAhead = typeof options.daysAhead === 'number' && Number.isFinite(options.daysAhead)
        ? Math.max(1, Math.floor(options.daysAhead))
        : 30
    const endTime = startTime + safeDaysAhead * 86_400_000
    const safeLimit = typeof options.limit === 'number' && Number.isFinite(options.limit)
        ? Math.max(1, Math.floor(options.limit))
        : entries.length

    return entries
        .filter((entry) => {
            if (options.fansubId && entry.fansubId !== options.fansubId) return false
            const publishTime = new Date(entry.publishAt).getTime()
            return Number.isFinite(publishTime) && publishTime >= startTime && publishTime < endTime
        })
        .slice(0, safeLimit)
}

export function isE2EModeEnabled() {
    if (!canRunE2EModeInRuntime()) return false
    return hasE2EQueryParam()
}

export function getE2EModeQueryParamEntry(): [string, string] | null {
    if (!isE2EModeEnabled()) return null
    return [E2E_QUERY_PARAM_KEY, E2E_QUERY_PARAM_VALUE]
}

export function getE2EMockFeatureFlags(): Record<string, boolean> | null {
    if (!isE2EModeEnabled()) return null
    return window.__BSGMANGA_E2E__?.mockFeatureFlags ?? null
}

export function getE2EMockAuthUser(): E2EMockAuthUser | null {
    if (!isE2EModeEnabled()) return null
    return window.__BSGMANGA_E2E__?.mockAuthUser ?? getDefaultE2EMockAuthUser()
}

export function getE2EMockStoreData(): E2EMockStoreData | null {
    if (!isE2EModeEnabled()) return null
    const fallback = getDefaultE2EMockStoreData()
    const configured = window.__BSGMANGA_E2E__?.mockStoreData
    if (!configured) return fallback

    return {
        ...fallback,
        ...configured,
    }
}

export function getE2EMockFansubs(): Fansub[] | null {
    if (!isE2EModeEnabled()) return null
    return window.__BSGMANGA_E2E__?.mockFansubs ?? getDefaultE2EMockFansubs()
}

export function getE2EMockFansubMangas(fansubId: string): Manga[] | null {
    if (!isE2EModeEnabled()) return null
    const mangaMap = window.__BSGMANGA_E2E__?.mockFansubMangasByFansubId ?? getDefaultE2EMockFansubMangasByFansubId()
    return mangaMap[fansubId] ?? []
}

export function getE2EMockMangaListDetail(listId: string): MangaListDetail | null {
    if (!isE2EModeEnabled()) return null
    const configuredDetail = window.__BSGMANGA_E2E__?.mockMangaListDetails?.[listId]
    if (configuredDetail) return configuredDetail
    if (listId === E2E_MANGA_LIST_LIMIT_DETAIL_ID) return createE2EMockMangaListLimitDetail()
    return null
}

export function setE2ERuntimeCurrentUser(snapshot: E2ERuntimeCurrentUserSnapshot | null) {
    if (typeof window === 'undefined' || !isE2EModeEnabled()) return

    window.__BSGMANGA_E2E_RUNTIME__ = {
        currentUser: snapshot
            ? {
                ...snapshot,
                ownedItems: { ...snapshot.ownedItems },
            }
            : null,
    }
}
