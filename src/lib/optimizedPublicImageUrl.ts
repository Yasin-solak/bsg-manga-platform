import { PUBLIC_IMAGE_VARIANT_MAP } from '@/generated/publicImageVariants.generated'

function splitUrlSuffix(value: string) {
  const hashIndex = value.indexOf('#')
  const queryIndex = value.indexOf('?')
  const cutIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? -1

  if (cutIndex === -1) {
    return { base: value, suffix: '' }
  }

  return {
    base: value.slice(0, cutIndex),
    suffix: value.slice(cutIndex),
  }
}

function normalizePublicPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return null

  const { base } = splitUrlSuffix(trimmed)
  if (!base) return null

  const normalized = base.startsWith('/') ? base : `/${base.replace(/^\/+/, '')}`
  if (!normalized.startsWith('/covers/') && !normalized.startsWith('/backgrounds/')) {
    return null
  }

  try {
    return decodeURIComponent(normalized)
  } catch {
    return normalized
  }
}

function isSafeDirectImageUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true
  if (/^blob:/i.test(value)) return true
  if (/^data:image\//i.test(value)) return true
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
}

export function optimizePublicImageUrl(value?: string | null): string | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const normalizedPath = normalizePublicPath(trimmed)
  if (!normalizedPath) return isSafeDirectImageUrl(trimmed) ? trimmed : undefined

  const { suffix } = splitUrlSuffix(trimmed)
  const optimizedPath = PUBLIC_IMAGE_VARIANT_MAP[normalizedPath as keyof typeof PUBLIC_IMAGE_VARIANT_MAP]
  return optimizedPath ? `${optimizedPath}${suffix}` : trimmed
}
