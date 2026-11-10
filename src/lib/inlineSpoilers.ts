export const INLINE_SPOILER_DELIMITER = '||'
export const INLINE_SPOILER_PLACEHOLDER = 'spoiler'

export type InlineSpoilerSegment =
  | { type: 'text'; value: string }
  | { type: 'spoiler'; value: string }

const INLINE_SPOILER_REGEX = /\|\|([\s\S]+?)\|\|/g

export function buildInlineSpoilerText(content: string) {
  return `${INLINE_SPOILER_DELIMITER}${content}${INLINE_SPOILER_DELIMITER}`
}

export function hasInlineSpoilerSyntax(text: string) {
  return /\|\|[\s\S]+?\|\|/.test(text)
}

export function splitInlineSpoilerSegments(text: string): InlineSpoilerSegment[] {
  if (text.length === 0) return []

  const segments: InlineSpoilerSegment[] = []
  let lastIndex = 0
  let match = INLINE_SPOILER_REGEX.exec(text)

  while (match) {
    const rawMatch = match[0]
    const spoilerContent = match[1] ?? ''
    const matchIndex = match.index

    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, matchIndex),
      })
    }

    segments.push({
      type: 'spoiler',
      value: spoilerContent,
    })

    lastIndex = matchIndex + rawMatch.length
    match = INLINE_SPOILER_REGEX.exec(text)
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
    })
  }

  return segments
}
