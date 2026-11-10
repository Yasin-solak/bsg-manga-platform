import type { CommunityPost } from '@types'
import { txa } from '@/i18n/activeLocale'

export const COMMUNITY_COMPOSER_EMOJI_OPTIONS = ['😀', '😂', '😍', '🤔', '🔥', '👏', '😭', '🎉', '😮', '🙌'] as const

export function getRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  if (Number.isNaN(diffMs) || diffMs < 0) return ''

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return txa('Az önce')
  if (minutes < 60) return `${minutes} dk`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} sa`

  const days = Math.floor(hours / 24)
  if (days < 7) return txa('{v1} gun', { v1: days })

  return `${Math.floor(days / 30)} ay`
}

export function getCommunityPostDisplayName(post: CommunityPost) {
  return post.displayName?.trim() || post.username || txa('Bilinmeyen hesap')
}

export function getCommunityPostAuthorHandle(post: CommunityPost) {
  if (post.authorType === 'fansub' && post.authorFansub?.slug) {
    return `fansub/${post.authorFansub.slug}`
  }

  return post.username ? `@${post.username}` : '@bilinmiyor'
}

export function getCommunityPostRoleLabel(post: CommunityPost) {
  return post.authorType === 'fansub' ? txa('Fansub') : txa('Kullanıcı')
}

export function getCommunityPostCategory(post: CommunityPost) {
  return post.category?.trim() || txa('Genel')
}

export function getCommunityPostVisibleTags(post: CommunityPost, limit = 4) {
  return (post.tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, limit)
}

export function getCommunityPostPrimaryMangaContext(post: CommunityPost) {
  const relatedManga = post.relatedManga
  if (relatedManga) {
    return {
      manga: relatedManga,
      chapterNumber: post.chapterNumber,
      source: 'related' as const,
      extraCount: Math.max(0, (post.mentionedMangas?.length ?? 0) - 1),
    }
  }

  const mentionedManga = post.mentionedMangas?.[0]
  if (!mentionedManga) return null

  return {
    manga: mentionedManga,
    chapterNumber: undefined,
    source: 'mentioned' as const,
    extraCount: Math.max(0, (post.mentionedMangas?.length ?? 1) - 1),
  }
}

export function getCommunityPostMentionedMangas(post: CommunityPost) {
  const seen = new Set<string>()
  const entries: Array<{
    manga: NonNullable<CommunityPost['relatedManga']>
    chapterNumber?: number
    source: 'related' | 'mentioned'
  }> = []

  if (post.relatedManga) {
    const key = post.relatedManga.id || post.relatedManga.slug || post.relatedManga.title
    seen.add(key)
    entries.push({
      manga: post.relatedManga,
      chapterNumber: post.chapterNumber,
      source: 'related',
    })
  }

  for (const manga of post.mentionedMangas ?? []) {
    const key = manga.id || manga.slug || manga.title
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      manga,
      source: 'mentioned',
    })
  }

  return entries
}

export function insertTextAtTextareaCursor(
  textarea: HTMLTextAreaElement | null,
  nextText: string,
  setText: (value: string) => boolean | void,
) {
  if (!textarea) {
    setText(nextText)
    return
  }

  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  const currentValue = textarea.value
  const value = `${currentValue.slice(0, start)}${nextText}${currentValue.slice(end)}`
  const didApply = setText(value)

  const cursor = didApply === false ? start : start + nextText.length
  const selectionEnd = didApply === false ? end : cursor
  window.requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursor, selectionEnd)
  })
}

export function wrapSelectedTextareaText(
  textarea: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string,
  setText: (value: string) => void,
  fallbackText = '',
) {
  if (!textarea) {
    setText(`${prefix}${fallbackText}${suffix}`)
    return
  }

  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  const currentValue = textarea.value
  const selectedText = currentValue.slice(start, end)
  const wrappedText = selectedText || fallbackText
  const nextValue = `${currentValue.slice(0, start)}${prefix}${wrappedText}${suffix}${currentValue.slice(end)}`
  setText(nextValue)

  const selectionStart = start + prefix.length
  const selectionEnd = selectionStart + wrappedText.length
  window.requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(selectionStart, selectionEnd)
  })
}

const COMMUNITY_VIEWER_SESSION_KEY = 'bsgmanga:community-viewer-key'

export function getCommunityViewerKey() {
  if (typeof window === 'undefined') return 'server-render'

  const existing = window.sessionStorage.getItem(COMMUNITY_VIEWER_SESSION_KEY)
  if (existing) return existing

  const nextValue = `anon:${Math.random().toString(36).slice(2)}`
  window.sessionStorage.setItem(COMMUNITY_VIEWER_SESSION_KEY, nextValue)
  return nextValue
}
