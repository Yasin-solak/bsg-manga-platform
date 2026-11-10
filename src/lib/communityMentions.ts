import { txa } from '@/i18n/activeLocale'
export interface CommunityMention { kind: 'user' | 'role'; id: string; label: string; username?: string | null; color?: string | null }
const tokenPattern = /<@(&?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi
export const COMMUNITY_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀'] as const
export const mentionText = (mention: CommunityMention) => mention.kind === 'role' ? `@{${mention.label}}` : `@${mention.label}`
export const mentionToken = (mention: CommunityMention) => `<@${mention.kind === 'role' ? '&' : ''}${mention.id.toLowerCase()}>`
export function splitCommunityMentions(body: string, mentions: CommunityMention[]) {
  const byKey = new Map(mentions.map(m => [`${m.kind}:${m.id.toLowerCase()}`, m]))
  const parts: Array<{ text: string; mention?: CommunityMention }> = []
  let cursor = 0
  for (const match of body.matchAll(tokenPattern)) {
    if (match.index! > cursor) parts.push({ text: body.slice(cursor, match.index) })
    const mention = byKey.get(`${match[1] ? 'role' : 'user'}:${match[2].toLowerCase()}`)
    parts.push(mention ? { text: mentionText(mention), mention } : { text: txa('@erişilemeyen-etiket') })
    cursor = match.index! + match[0].length
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) })
  return parts
}
export function decodeCommunityMentions(body: string, mentions: CommunityMention[]) {
  return splitCommunityMentions(body, mentions).map(p => p.text).join('')
}
export function encodeCommunityMentions(body: string, mentions: CommunityMention[]) {
  // Single pass: no second tag inside a tag; picking a role with the same name uses the last target.
  const byText = new Map(mentions.map(m => [mentionText(m), m]))
  const texts = [...byText.keys()].sort((a, b) => b.length - a.length)
  if (!texts.length) return body.trim()
  const escaped = texts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(^|[\\s(])(${escaped.join('|')})(?=$|[\\s.,!?;:)])`, 'gu')
  return body.replace(pattern, (_, prefix: string, text: string) => prefix + mentionToken(byText.get(text)!)).trim()
}
export function activeCommunityMention(body: string, cursor: number) {
  const prefix = body.slice(0, cursor)
  const match = /(?:^|[\s(])@([^\s@{}<>]{0,60})$/u.exec(prefix)
  return match ? { search: match[1], start: cursor - match[1].length - 1, end: cursor } : null
}
