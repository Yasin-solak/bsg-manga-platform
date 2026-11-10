import { buildPreferredPublicMangaSlug } from './slug'
import { buildReaderV2Path } from './readerV2Route'

type QueryValue = string | number | boolean | null | undefined
type PublicMangaRouteInput = {
    id?: string | null
    slug?: string | null
    title?: string | null
}
type PublicFansubRouteInput = {
    id?: string | null
    slug?: string | null
}
type ChapterRouteDisambiguationInput = {
    id?: string | null
    fansub?: PublicFansubRouteInput | null
}
type PublicChapterRouteInput = {
    chapterId?: string | null
    chapterNumber: number
    fansubId?: string | null
    fansubSlug?: string | null
    forceVersionQuery?: boolean
    mangaId?: string | null
    mangaSlug?: string | null
    mangaTitle?: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const EXPLORE_ROUTE_SLUG = 'kesfet'
export const EXPLORE_PATH = `/${EXPLORE_ROUTE_SLUG}`
export const LEGACY_EXPLORE_ROUTE_SLUGS = ['ke\u015ffet', 'kesf', 'explore'] as const
export const ONBOARDING_ROUTE_SLUG = 'hos-geldin'
export const ONBOARDING_PATH = `/${ONBOARDING_ROUTE_SLUG}`
export const LEGACY_ONBOARDING_PATH = '/onboarding'

function sanitizeRouteSegment(value?: string | null) {
    return typeof value === 'string' ? value.trim() : ''
}

function encodeRouteSegment(value: string) {
    return encodeURIComponent(value.trim())
}

export function isUuidLike(value?: string | null) {
    return UUID_PATTERN.test(sanitizeRouteSegment(value))
}

function setQueryParam(params: URLSearchParams, key: string, value: QueryValue) {
    if (value == null) return

    const normalized = typeof value === 'string' ? value.trim() : String(value)
    if (!normalized) return

    params.set(key, normalized)
}

export function buildPathWithQuery(path: string, query: Record<string, QueryValue> = {}) {
    const url = new URL(path, 'http://localhost')
    Object.entries(query).forEach(([key, value]) => setQueryParam(url.searchParams, key, value))
    return `${url.pathname}${url.search}${url.hash}`
}

export function buildExplorePath(query: Record<string, QueryValue> = {}) {
    return buildPathWithQuery(EXPLORE_PATH, query)
}

export function resolvePublicMangaKey(input: PublicMangaRouteInput) {
    const slug = sanitizeRouteSegment(input.slug)
    if (slug) {
        return buildPreferredPublicMangaSlug({
            slug,
            title: sanitizeRouteSegment(input.title),
        })
    }

    const id = sanitizeRouteSegment(input.id)
    return id
}

export function buildPublicMangaPath(input: PublicMangaRouteInput) {
    const key = resolvePublicMangaKey(input)
    return key ? `/manga/${encodeRouteSegment(key)}` : EXPLORE_PATH
}

export function resolvePublicFansubKey(input: PublicFansubRouteInput) {
    const slug = sanitizeRouteSegment(input.slug)
    if (slug) return slug

    const id = sanitizeRouteSegment(input.id)
    return id
}

export function buildPublicFansubPath(input: PublicFansubRouteInput) {
    const key = resolvePublicFansubKey(input)
    return key ? `/fansub/${encodeRouteSegment(key)}` : '/fansublar'
}

/**
 * Query parameter that directly opens the donation dialog on the fansub page.
 *
 * Donating was only opened by a button on the fansub page; donating from the end of a
 * chapter took two steps (page first, then button).
 * The deep link removes that step.
 */
export const FANSUB_DONATE_QUERY_PARAM = 'bagis'

export function buildFansubDonatePath(input: PublicFansubRouteInput) {
    return buildPathWithQuery(buildPublicFansubPath(input), { [FANSUB_DONATE_QUERY_PARAM]: '1' })
}

export function doesChapterRouteNeedVersionQuery(
    versions: ChapterRouteDisambiguationInput[] | undefined | null,
    target: ChapterRouteDisambiguationInput | undefined | null,
) {
    const versionId = sanitizeRouteSegment(target?.id)
    if (!versionId) return false

    if (!versions || versions.length === 0) return true

    const targetFansubKey = resolvePublicFansubKey(target?.fansub || {})
    if (!targetFansubKey) return true

    const sameFansubCount = (versions || []).filter((version) => (
        resolvePublicFansubKey(version.fansub || {}) === targetFansubKey
    )).length

    return sameFansubCount > 1
}

/**
 * OLD reader (v1) chapter path.
 *
 * Only for v1's OWN internal navigation (canonical redirect, previous/next
 * chapter). Since v1 stays in reserve it must work consistently within itself:
 * "next chapter" in the old reader should not jump the user to the new reader.
 * All other links in the app use `buildPublicChapterPath`.
 */
export function buildLegacyPublicChapterPath(input: PublicChapterRouteInput) {
    const chapterNumber = Number(input.chapterNumber)
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
        return buildPublicMangaPath({ id: input.mangaId, slug: input.mangaSlug, title: input.mangaTitle })
    }

    const mangaPath = buildPublicMangaPath({ id: input.mangaId, slug: input.mangaSlug, title: input.mangaTitle })
    const fansubKey = resolvePublicFansubKey({ id: input.fansubId, slug: input.fansubSlug })
    const chapterPath = fansubKey
        ? `${mangaPath}/bolum/${chapterNumber}/${encodeRouteSegment(fansubKey)}`
        : `${mangaPath}/bolum/${chapterNumber}`

    const versionId = sanitizeRouteSegment(input.chapterId)
    if (!versionId || input.forceVersionQuery !== true) {
        return chapterPath
    }

    return buildPathWithQuery(chapterPath, { version: versionId })
}

/**
 * Chapter reading link: goes to the NEW reader (/oku) since Phase 7.
 *
 * Switched in one place: ~50 links in the app (manga detail, fansub
 * pages, community, search, notification list, sidebar...) use this helper.
 * Old reader routes were NOT DELETED; a user typing the address or opening an old
 * link lands on v1.
 */
export function buildPublicChapterPath(input: PublicChapterRouteInput) {
    const chapterNumber = Number(input.chapterNumber)
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
        return buildPublicMangaPath({ id: input.mangaId, slug: input.mangaSlug, title: input.mangaTitle })
    }

    const mangaKey = resolvePublicMangaKey({
        id: input.mangaId,
        slug: input.mangaSlug,
        title: input.mangaTitle,
    })
    if (!mangaKey) {
        return buildPublicMangaPath({ id: input.mangaId, slug: input.mangaSlug, title: input.mangaTitle })
    }

    return buildReaderV2Path({
        mangaKey,
        chapterNumber,
        fansubKey: resolvePublicFansubKey({ id: input.fansubId, slug: input.fansubSlug }),
        versionId: input.forceVersionQuery === true ? input.chapterId : null,
    })
}

export function normalizeAppPathname(pathname: string) {
    if (!pathname.startsWith('/')) return pathname

    const slug = pathname.slice(1)
    return slug === EXPLORE_ROUTE_SLUG || LEGACY_EXPLORE_ROUTE_SLUGS.includes(slug as (typeof LEGACY_EXPLORE_ROUTE_SLUGS)[number])
        ? EXPLORE_PATH
        : pathname
}

export function normalizeAppPath(path: string) {
    if (!path.startsWith('/')) return path

    const url = new URL(path, 'http://localhost')
    const normalizedPathname = normalizeAppPathname(url.pathname)
    return `${normalizedPathname}${url.search}${url.hash}`
}
