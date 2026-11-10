export const USER_DISPLAY_NAME_MIN_LENGTH = 1
export const USER_DISPLAY_NAME_MAX_LENGTH = 40

function containsControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
  })
}

export function normalizeUserDisplayName(value: string) {
  return value
    .trim()
    .replace(/[ \t]+/g, ' ')
}

export function truncateUserDisplayName(value: string) {
  return Array.from(value).slice(0, USER_DISPLAY_NAME_MAX_LENGTH).join('')
}

export function validateUserDisplayName(value: string): string | null {
  if (containsControlCharacter(value)) {
    return 'Gorunen ad kontrol karakterleri veya satir sonu iceremez.'
  }

  const normalized = normalizeUserDisplayName(value)
  const characterCount = Array.from(normalized).length
  if (characterCount < USER_DISPLAY_NAME_MIN_LENGTH) {
    return 'Gorunen ad zorunludur.'
  }
  if (characterCount > USER_DISPLAY_NAME_MAX_LENGTH) {
    return `Gorunen ad en fazla ${USER_DISPLAY_NAME_MAX_LENGTH} karakter olabilir.`
  }

  return null
}
