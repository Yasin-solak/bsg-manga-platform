/**
 * Reader v2 route contract.
 *
 * The new reader lives under /oku; the old reader (/manga/:id/bolum/...)
 * stays in reserve untouched. Both readers reach the same chapter with the same parameters,
 * so when comparing, the only difference is the reader itself.
 *
 * Format: /oku/:mangaKey/:chapterNumber/:fansubKey?
 * mangaKey     -> manga slug (otherwise id)
 * chapterNumber-> chapter number (may be decimal: 12.5)
 * fansubKey    -> distinguishes multiple fansub versions of the same chapter
 */

export const READER_V2_ROUTE_PREFIX = '/oku'

export interface ReaderV2RouteInput {
  mangaKey: string
  chapterNumber: number | string
  fansubKey?: string | null
  /** Definite distinguisher for several versions with the same number from the same fansub. */
  versionId?: string | null
}

function sanitizeSegment(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return encodeURIComponent(trimmed)
}

export function buildReaderV2Path(input: ReaderV2RouteInput): string {
  const mangaKey = sanitizeSegment(input.mangaKey)
  if (!mangaKey) return READER_V2_ROUTE_PREFIX

  const chapterNumber = Number(input.chapterNumber)
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    return `${READER_V2_ROUTE_PREFIX}/${mangaKey}`
  }

  const fansubKey = sanitizeSegment(input.fansubKey)
  const base = fansubKey
    ? `${READER_V2_ROUTE_PREFIX}/${mangaKey}/${chapterNumber}/${fansubKey}`
    : `${READER_V2_ROUTE_PREFIX}/${mangaKey}/${chapterNumber}`

  const versionId = sanitizeSegment(input.versionId)
  return versionId ? `${base}?surum=${versionId}` : base
}

/** Converts route parameters to a readable query (for the data layer). */
export function parseReaderV2Params(params: {
  mangaKey?: string
  chapterNumber?: string
  fansubKey?: string
}) {
  const mangaKey = String(params.mangaKey ?? '').trim()
  const parsedNumber = Number(params.chapterNumber)
  return {
    mangaKey,
    chapterNumber: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null,
    fansubKey: String(params.fansubKey ?? '').trim() || null,
  }
}
