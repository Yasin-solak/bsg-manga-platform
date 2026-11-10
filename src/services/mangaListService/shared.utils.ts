import type { CommunityCosmeticPostRow } from '../communityCosmeticService'
import type {
  DbMangaListRow,
  DbMangaRow,
} from './shared.types'

export function toSingleRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export function mapDbMangaToListCover(row: DbMangaRow | null | undefined) {
  if (!row) {
    return {
      id: undefined,
      title: undefined,
      slug: undefined,
      coverImage: undefined,
    }
  }

  return {
    id: row.id,
    title: row.title || undefined,
    slug: row.slug || undefined,
    coverImage: row.cover_image_url || undefined,
  }
}

export function mapDbMangaListCosmeticRows(rows: DbMangaListRow[]): CommunityCosmeticPostRow[] {
  return rows.map((row) => {
    const owner = toSingleRow(row.users)
    return {
      id: row.id,
      frame_type: owner?.frame_type || null,
      users: owner
        ? {
          frame_type: owner.frame_type || null,
          background_type: null,
          owned_items: null,
        }
        : null,
    }
  })
}
