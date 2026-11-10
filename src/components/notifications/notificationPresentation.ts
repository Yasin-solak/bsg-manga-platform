import type { Notification } from '@/services/notificationService'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { intlLocale, txa } from '@/i18n/activeLocale'
import { translateNotificationMessage } from './notificationMessageText'

export function notificationText(n: Notification, key: string) {
  const value = n.data?.[key]
  return typeof value === 'string' ? value.trim() : ''
}
function isChapterNotification(n: Notification) {
  const event = notificationText(n, 'event')
  return event === 'manga_chapter_release' || event === 'fansub_new_chapter'
}
function notificationChapterNumber(n: Notification): number | null {
  const raw = n.data?.chapter_number
  const numeric = typeof raw === 'number' || (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()))
  const chapter = numeric ? Number(raw) : NaN
  return Number.isFinite(chapter) && chapter > 0 ? chapter : null
}
export function notificationDisplayTitle(n: Notification): string {
  const mangaTitle = notificationText(n, 'manga_title')
  const chapter = notificationChapterNumber(n)
  return isChapterNotification(n) && mangaTitle && chapter !== null
    ? txa('{title} {chapter}. bölüm yayında', { title: mangaTitle, chapter })
    : txa(n.title)
}
export function notificationDisplayMessage(n: Notification): string | null {
  const fansubName = notificationText(n, 'fansub_name')
  return isChapterNotification(n) && fansubName ? txa('{name} · Yeni bölüm', { name: fansubName }) : n.message ? translateNotificationMessage(n.message) : n.message
}
function hasUnsafePathCharacters(value: string, includeSpace: boolean) {
  return [...value].some(char => char === '\\' || char.charCodeAt(0) <= (includeSpace ? 32 : 31) || char.charCodeAt(0) === 127)
}
export function safeNotificationPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || hasUnsafePathCharacters(value, true)) return null
  try {
    const url = new URL(value, 'https://bsg.invalid')
    if (url.origin !== 'https://bsg.invalid') return null
    // Decoded separators cannot escape to another root/domain.
    const decoded = decodeURIComponent(url.pathname)
    if (decoded.startsWith('//') || hasUnsafePathCharacters(decoded, false)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
export function notificationDestination(n: Notification, username?: string) {
  const text = (key: string) => notificationText(n, key)
  const event = text('event')
  if (event === 'diagnostic_alert') return '/admin/tanilama'
  const mangaId = text('manga_id'), mangaSlug = text('manga_slug'), mangaTitle = text('manga_title')
  if (isChapterNotification(n)) {
    const chapter = notificationChapterNumber(n)
    if ((mangaId || mangaSlug) && chapter !== null) {
      return buildPublicChapterPath({ mangaId, mangaSlug, mangaTitle, chapterNumber: chapter,
        chapterId: text('chapter_id'), fansubId: text('fansub_id'), fansubSlug: text('fansub_slug'), forceVersionQuery: true })
    }
  }
  const hinted = safeNotificationPath(text('route_hint')) || safeNotificationPath(text('url'))
  if (hinted) return hinted
  if (mangaId || mangaSlug) return buildPublicMangaPath({ id: mangaId, slug: mangaSlug, title: mangaTitle })
  if (text('fansub_id')) return `/fansub/${encodeURIComponent(text('fansub_slug') || text('fansub_id'))}`
  const actor = text('follower_username') || text('actor_username')
  if (n.type === 'follow' && actor) return `/profil/${encodeURIComponent(actor.replace(/^@/, ''))}`
  if (['badge_earned', 'badge_purchased', 'level_up'].includes(n.type) && username) return `/profil/${encodeURIComponent(username)}`
  if (['pending_content_review', 'pending_content_created', 'security_alert'].includes(event)) return '/admin'
  return null
}
export function notificationDateGroup(iso: string, now = new Date()) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return txa('Daha önce')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const week = new Date(today); week.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  if (date >= today) return txa('Bugün')
  if (date >= yesterday) return txa('Dün')
  if (date >= week) return txa('Bu hafta')
  return txa('Daha önce')
}
export function notificationTime(iso: string, now = Date.now()) {
  const date = new Date(iso), elapsed = Math.max(0, now - date.getTime())
  if (!Number.isFinite(elapsed)) return ''
  if (elapsed < 60000) return txa('Az önce')
  if (elapsed < 3600000) return txa('{count} dakika önce', { count: Math.floor(elapsed / 60000) })
  if (elapsed < 86400000) return txa('{count} saat önce', { count: Math.floor(elapsed / 3600000) })
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}
