import {
  FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH,
  FANSUB_SUPPORTER_ASSET_SHORTCODE_MIN_LENGTH,
} from '@/lib/fansubSupporterAssetPresentation'

export type FansubSupporterAssetKind = 'emoji' | 'sticker'
export {
  FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH,
  FANSUB_SUPPORTER_ASSET_SHORTCODE_MIN_LENGTH,
} from '@/lib/fansubSupporterAssetPresentation'

export const FANSUB_SUPPORTER_EMOJI_TOKEN_PREFIX = 'fse_'
export const FANSUB_SUPPORTER_STICKER_TOKEN_PREFIX = 'fss_'

const SHORTCODE_BODY_LENGTH = FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH - 1
const SHORTCODE_PATTERN = new RegExp(`^[a-z0-9][a-z0-9_-]{${FANSUB_SUPPORTER_ASSET_SHORTCODE_MIN_LENGTH - 1},${SHORTCODE_BODY_LENGTH}}$`, 'i')
const REVISION_ID_PATTERN_SOURCE = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const TOKEN_SHORTCODE_PATTERN_SOURCE = `[a-z0-9][a-z0-9_-]{${FANSUB_SUPPORTER_ASSET_SHORTCODE_MIN_LENGTH - 1},${SHORTCODE_BODY_LENGTH}}`
const EMOJI_TOKEN_PATTERN = new RegExp(`^:fse_(${TOKEN_SHORTCODE_PATTERN_SOURCE})(?:@(${REVISION_ID_PATTERN_SOURCE}))?:$`, 'i')
const STICKER_TOKEN_PATTERN = new RegExp(`^\\[\\[fss_(${TOKEN_SHORTCODE_PATTERN_SOURCE})(?:@(${REVISION_ID_PATTERN_SOURCE}))?\\]\\]$`, 'i')

export const FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE = `:fse_${TOKEN_SHORTCODE_PATTERN_SOURCE}(?:@${REVISION_ID_PATTERN_SOURCE})?:|\\[\\[fss_${TOKEN_SHORTCODE_PATTERN_SOURCE}(?:@${REVISION_ID_PATTERN_SOURCE})?\\]\\]`

export function normalizeFansubSupporterAssetShortcode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH)
}

export function isValidFansubSupporterAssetShortcode(value: string) {
  return SHORTCODE_PATTERN.test(value.trim())
}

export function buildFansubSupporterEmojiToken(shortcode: string, revisionId?: string | null) {
  const normalized = normalizeFansubSupporterAssetShortcode(shortcode)
  const normalizedRevisionId = typeof revisionId === 'string' && revisionId.trim().length > 0
    ? revisionId.trim().toLowerCase()
    : null
  return `:${FANSUB_SUPPORTER_EMOJI_TOKEN_PREFIX}${normalized}${normalizedRevisionId ? `@${normalizedRevisionId}` : ''}:`
}

export function buildFansubSupporterStickerToken(shortcode: string, revisionId?: string | null) {
  const normalized = normalizeFansubSupporterAssetShortcode(shortcode)
  const normalizedRevisionId = typeof revisionId === 'string' && revisionId.trim().length > 0
    ? revisionId.trim().toLowerCase()
    : null
  return `[[${FANSUB_SUPPORTER_STICKER_TOKEN_PREFIX}${normalized}${normalizedRevisionId ? `@${normalizedRevisionId}` : ''}]]`
}

export function parseFansubSupporterAssetToken(token: string): {
  kind: FansubSupporterAssetKind
  shortcode: string
  revisionId: string | null
} | null {
  const normalizedToken = token.trim()
  const emojiMatch = EMOJI_TOKEN_PATTERN.exec(normalizedToken)
  if (emojiMatch?.[1]) {
    return {
      kind: 'emoji',
      shortcode: normalizeFansubSupporterAssetShortcode(emojiMatch[1]),
      revisionId: typeof emojiMatch[2] === 'string' ? emojiMatch[2].toLowerCase() : null,
    }
  }

  const stickerMatch = STICKER_TOKEN_PATTERN.exec(normalizedToken)
  if (stickerMatch?.[1]) {
    return {
      kind: 'sticker',
      shortcode: normalizeFansubSupporterAssetShortcode(stickerMatch[1]),
      revisionId: typeof stickerMatch[2] === 'string' ? stickerMatch[2].toLowerCase() : null,
    }
  }

  return null
}

export function getFansubSupporterAssetTokenRegex() {
  return new RegExp(FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE, 'gi')
}
