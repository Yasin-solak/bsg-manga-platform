export function toIsoOrNow(input?: string | null) {
  const raw = (input || '').trim()
  if (!raw) return new Date().toISOString()

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Yayin tarihi/saati gecersiz.')
  }

  return parsed.toISOString()
}
