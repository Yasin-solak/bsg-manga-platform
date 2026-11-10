import { parseProfileTheme, type ProfileTheme } from '@/lib/profileTheme'
import type { OwnedBackground } from '../profile/types'
import type { FansubMangaShelfItem, FansubOwnedBackground } from './types'

/* Converts fansub data to the background and theme the profile showcase scene expects. */

/** A fansub background holds a CSS value; the scene needs only the image address. */
export function toStageBackground(bg: FansubOwnedBackground | null): OwnedBackground | null {
  if (!bg || bg.mediaType === 'video') return null
  const raw = bg.assetRef || bg.background
  const url = /url\("?([^")]+)"?\)/.exec(raw)?.[1] ?? (/^(https?:|\/|store-assets:)/i.test(raw) ? raw : '')
  return url ? { id: bg.id, label: bg.label, background: url, mediaType: 'image', origin: bg.origin } : null
}

/**
 * The fansub's theme (v2: color + style + pattern) to the scene theme. Theme is a boost perk
 * (canUseHoverTheme): for a fansub whose boost ended the scene stays neutral (same as the hover card). Old (v1)
 * records without style / pattern use defaults (parseProfileTheme).
 */
export function toStageTheme(
  hoverTheme: unknown,
  capabilities: { canUseHoverTheme?: boolean } | null | undefined,
): ProfileTheme | null {
  if (capabilities?.canUseHoverTheme !== true) return null
  return parseProfileTheme(hoverTheme)
}

/** Shared resolution for scene + card: v2 theme if theme permission exists, otherwise null. */
export const resolveFansubTheme = toStageTheme

/** If no background is chosen the scene's color light comes from the cover of the fansub's first series. */
export function coverAmbience(mangas: FansubMangaShelfItem[]): OwnedBackground | null {
  const first = mangas.find((manga) => manga.coverImage)
  return first?.coverImage ? { id: `cover:${first.id}`, label: first.title, background: first.coverImage, mediaType: 'image' } : null
}
