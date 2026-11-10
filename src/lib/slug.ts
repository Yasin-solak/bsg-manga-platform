const TURKISH_SLUG_CHAR_MAP: Record<string, string> = {
  Ç: 'c',
  ç: 'c',
  Ğ: 'g',
  ğ: 'g',
  I: 'i',
  İ: 'i',
  ı: 'i',
  Ö: 'o',
  ö: 'o',
  Ş: 's',
  ş: 's',
  Ü: 'u',
  ü: 'u',
}

const GENERATED_SLUG_SUFFIX_PATTERN = /-([a-z0-9]{5})$/i

function replaceTurkishSlugChars(value: string) {
  return value.replace(/[ÇçĞğIİıÖöŞşÜü]/g, (char) => TURKISH_SLUG_CHAR_MAP[char] ?? char)
}

export function slugifyText(value: string, options: { maxLength?: number } = {}) {
  const maxLength = Math.max(1, options.maxLength ?? 80)
  const normalized = replaceTurkishSlugChars(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized

  return normalized
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

export function createRandomSlugSuffix(length = 5) {
  const safeLength = Math.max(1, length)
  return Math.random().toString(36).slice(2, 2 + safeLength).padEnd(safeLength, '0')
}

export function extractGeneratedSlugSuffix(slug?: string | null) {
  const normalized = typeof slug === 'string' ? slug.trim().toLowerCase() : ''
  if (!normalized) return ''
  const match = normalized.match(GENERATED_SLUG_SUFFIX_PATTERN)
  return match?.[1] ?? ''
}

export function buildPreferredPublicMangaSlug(input: {
  slug?: string | null
  title?: string | null
}) {
  const existingSlug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  if (!existingSlug) return ''

  const titleSlug = slugifyText(typeof input.title === 'string' ? input.title : '')
  if (!titleSlug) return existingSlug

  // If the slug already matches the title, DO NOT TOUCH it. Suffix merging is only for the
  // "title changed, slug carries the old title + generated suffix" case;
  // this guard is required so natural slugs that happen to end in a 5-character word
  // ('tokyo-ghoul' -> 'ghoul' mistaken for a suffix, producing 'tokyo-ghoul-ghoul')
  // are not treated as suffixed.
  if (existingSlug === titleSlug || existingSlug.startsWith(`${titleSlug}-`)) {
    return existingSlug
  }

  const suffix = extractGeneratedSlugSuffix(existingSlug)
  return suffix ? `${titleSlug}-${suffix}` : existingSlug
}
