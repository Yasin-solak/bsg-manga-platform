export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export function parseRevisionSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function parseSnapshotString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function parseSnapshotStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function arraysEqualByOrder(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

export function arraysEqualAsMultiSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const counts = new Map<string, number>()
  left.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1))
  for (const item of right) {
    const count = counts.get(item) || 0
    if (count <= 0) return false
    if (count === 1) counts.delete(item)
    else counts.set(item, count - 1)
  }
  return counts.size === 0
}

export function diffAddedUrls(before: string[], after: string[]) {
  const counts = new Map<string, number>()
  before.forEach((url) => counts.set(url, (counts.get(url) || 0) + 1))
  const added: string[] = []
  after.forEach((url) => {
    const count = counts.get(url) || 0
    if (count > 0) {
      if (count === 1) counts.delete(url)
      else counts.set(url, count - 1)
    } else {
      added.push(url)
    }
  })
  return added
}

export function diffRemovedUrls(before: string[], after: string[]) {
  const counts = new Map<string, number>()
  after.forEach((url) => counts.set(url, (counts.get(url) || 0) + 1))
  const removed: string[] = []
  before.forEach((url) => {
    const count = counts.get(url) || 0
    if (count > 0) {
      if (count === 1) counts.delete(url)
      else counts.set(url, count - 1)
    } else {
      removed.push(url)
    }
  })
  return removed
}
