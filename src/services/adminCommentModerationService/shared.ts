import type {
  AdminCommentModerationItem,
  AdminCommentModerationSignalFilter,
} from './types'
import { FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE } from '@/lib/fansubSupporterAssetTokens'

/*
 * Signal rules match app_private.comment_moderation_signals on the server:
 * - comment text only (previously "final" in a post title made every comment
 * under it count as a spoiler),
 * - Turkish letters are folded ("gerizekalı" -> "gerizekali"),
 * - long stems can take suffixes (gerizekalisin), short / ambiguous words match whole
 * words ("sonuc", "olumlu", "malzeme" are not caught),
 * - the inline spoiler marker (||...||) counts as a spoiler.
 */
const FOLD: Record<string, string> = { '\u00c7': 'c', '\u011e': 'g', '\u0130': 'i', '\u00d6': 'o', '\u015e': 's', '\u00dc': 'u', '\u00e7': 'c', '\u011f': 'g', '\u0131': 'i', '\u00f6': 'o', '\u015f': 's', '\u00fc': 'u', '\u00c2': 'a', '\u00ce': 'i', '\u00db': 'u', '\u00e2': 'a', '\u00ee': 'i', '\u00fb': 'u' }
const FOLD_PATTERN = /[\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c2\u00ce\u00db\u00e2\u00ee\u00fb]/g
const LINK_PATTERN = /(https?:\/\/|www\.|t\.me\/|discord\.gg\/|bit\.ly\/)/
const SPOILER_PATTERN = /(?<![a-z0-9])(?:spoil|final)|(?<![a-z0-9])(?:sonu|olum)(?![a-z0-9])/
const SPAM_PATTERN = /(?<![a-z0-9])(?:bedava|cekilis|promo|indirim|satilik|coin|telegram|discord)/
const ABUSE_PATTERN = /(?<![a-z0-9])(?:aptal|salak|gerizekal|orospu|siktir|sikerim|sikeyim|amina|pezevenk|kahpe|serefsiz|yarrak)|(?<![a-z0-9])(?:mal|pic|amk|aq|ibne)(?![a-z0-9])/
const EXPRESSION_TOKEN_PATTERN = new RegExp(FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE, 'gi')

export function foldCommentText(value: string) {
  return (value || '').replace(FOLD_PATTERN, (char) => FOLD[char] ?? char).toLowerCase()
}

export function detectAdminCommentSignals(
  comment: Pick<AdminCommentModerationItem, 'body' | 'isSpoiler'>,
): AdminCommentModerationSignalFilter[] {
  const haystack = foldCommentText(comment.body)
  const signals: AdminCommentModerationSignalFilter[] = []

  if (LINK_PATTERN.test(haystack)) signals.push('links')
  if (comment.isSpoiler || SPOILER_PATTERN.test(haystack) || (comment.body || '').includes('||')) signals.push('spoiler')
  if (SPAM_PATTERN.test(haystack)) signals.push('spam')
  if (ABUSE_PATTERN.test(haystack)) signals.push('abuse')

  return signals
}

export function matchesAdminCommentSignal(
  comment: Pick<AdminCommentModerationItem, 'body' | 'isSpoiler'>,
  signal: AdminCommentModerationSignalFilter,
) {
  if (signal === 'all') return true
  const detectedSignals = detectAdminCommentSignals(comment)

  if (signal === 'flagged') return detectedSignals.length > 0
  return detectedSignals.includes(signal)
}

export type AdminCommentBodyKind = 'empty' | 'text' | 'expression' | 'mixed'

export function getAdminCommentBodyKind(body: string): AdminCommentBodyKind {
  const trimmedBody = (body || '').trim()
  if (!trimmedBody) return 'empty'

  const hasExpressionToken = new RegExp(FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE, 'i').test(trimmedBody)
  if (!hasExpressionToken) return 'text'

  const textOnlyBody = trimmedBody.replace(EXPRESSION_TOKEN_PATTERN, '').trim()
  return textOnlyBody ? 'mixed' : 'expression'
}
