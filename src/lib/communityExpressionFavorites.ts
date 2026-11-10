export type CommunityExpressionFavoriteTab = 'gif' | 'emoji' | 'sticker'

export interface CommunityExpressionFavoriteState {
  gif: string[]
  emoji: string[]
  sticker: string[]
}

const COMMUNITY_EXPRESSION_FAVORITES_STORAGE_KEY = 'bsgmanga:community-expression-favorites:v1'

const EMPTY_FAVORITES: CommunityExpressionFavoriteState = {
  gif: [],
  emoji: [],
  sticker: [],
}

function normalizeFavoriteState(
  payload: unknown,
): CommunityExpressionFavoriteState {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...EMPTY_FAVORITES }
  }

  const input = payload as Record<string, unknown>
  const normalizeBucket = (value: unknown) => (
    Array.isArray(value)
      ? Array.from(new Set(
        value
          .map((entry) => typeof entry === 'string' ? entry.trim() : '')
          .filter(Boolean),
      )).slice(0, 80)
      : []
  )

  return {
    gif: normalizeBucket(input.gif),
    emoji: normalizeBucket(input.emoji),
    sticker: normalizeBucket(input.sticker),
  }
}

export function readCommunityExpressionFavorites(): CommunityExpressionFavoriteState {
  if (typeof window === 'undefined') {
    return { ...EMPTY_FAVORITES }
  }

  try {
    const raw = window.localStorage.getItem(COMMUNITY_EXPRESSION_FAVORITES_STORAGE_KEY)
    if (!raw) return { ...EMPTY_FAVORITES }
    return normalizeFavoriteState(JSON.parse(raw))
  } catch {
    return { ...EMPTY_FAVORITES }
  }
}

export function writeCommunityExpressionFavorites(
  nextState: CommunityExpressionFavoriteState,
) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(
    COMMUNITY_EXPRESSION_FAVORITES_STORAGE_KEY,
    JSON.stringify(normalizeFavoriteState(nextState)),
  )
}

export function toggleCommunityExpressionFavorite(
  tab: CommunityExpressionFavoriteTab,
  key: string,
): CommunityExpressionFavoriteState {
  const normalizedKey = key.trim()
  const current = readCommunityExpressionFavorites()
  if (!normalizedKey) return current

  const bucket = current[tab]
  const exists = bucket.includes(normalizedKey)
  const nextBucket = exists
    ? bucket.filter((entry) => entry !== normalizedKey)
    : [normalizedKey, ...bucket].slice(0, 80)

  const nextState: CommunityExpressionFavoriteState = {
    ...current,
    [tab]: nextBucket,
  }

  writeCommunityExpressionFavorites(nextState)
  return nextState
}
