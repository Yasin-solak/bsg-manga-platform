export function isProfileNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { message?: string; code?: string; details?: string }
  const message = (typed.message || '').toLowerCase()
  const details = (typed.details || '').toLowerCase()
  return typed.code === 'PGRST116' || message.includes('profile_not_found') || message.includes('profil bulunamadi') || details.includes('0 rows')
}

export function toOwnedItemsRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, unknown>
  return value as Record<string, unknown>
}

export function parseOwnedStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return value.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : '')).filter(Boolean)
}

export function normalizeIsoTimestamp(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}
