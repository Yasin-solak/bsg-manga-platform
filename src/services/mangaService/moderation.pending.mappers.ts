import {
  arraysEqualAsMultiSet,
  arraysEqualByOrder,
  diffAddedUrls,
  diffRemovedUrls,
  normalizeStringArray,
  parseRevisionSnapshot,
  parseSnapshotString,
  parseSnapshotStringOrNull,
  type PendingRevisionMap,
} from './shared'

type FansubNameRelation = {
  name: string
} | {
  name: string
}[] | null

type PendingMangaRow = {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  description: string | null
  author: string | null
  artist: string | null
  status: string | null
  genres: unknown
  cover_image_url: string | null
  is_approved: boolean | null
  is_active: boolean | null
  last_chapter_number: number | null
  total_views: number | null
  rating: number | null
  total_ratings: number | null
  release_date: string | null
  created_at: string
  updated_at: string
  fansub: FansubNameRelation
}

type ChapterMangaRelation = {
  title: string
  slug: string | null
  cover_image_url: string | null
} | {
  title: string
  slug: string | null
  cover_image_url: string | null
}[] | null

type PendingChapterRow = {
  id: string
  manga_id: string
  fansub_id: string | null
  chapter_number: number
  title: string | null
  pages: unknown
  publish_at: string | null
  is_approved: boolean | null
  is_active: boolean | null
  created_at: string
  updated_at: string
  manga: ChapterMangaRelation
  fansub: FansubNameRelation
}

function takeFirstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

function buildPendingMangaRevisionState(row: PendingMangaRow, revisionByTarget: PendingRevisionMap) {
  const revision = revisionByTarget.get(`manga:${row.id}`)
  if (!revision) {
    return {
      changeAction: 'create',
      revisionCreatedAt: row.created_at,
      revisionBefore: null,
      revisionAfter: {
        title: row.title || '',
        slug: row.slug || '',
        description: row.description || '',
        status: row.status || 'ongoing',
        genres: Array.isArray(row.genres) ? row.genres : [],
        coverImageUrl: row.cover_image_url || null,
        author: row.author || '',
        artist: row.artist || '',
        releaseDate: row.release_date || null,
      },
    }
  }

  const beforeSnapshot = parseRevisionSnapshot(revision.before_data)
  const afterSnapshot = parseRevisionSnapshot(revision.after_data)
  const afterGenres = normalizeStringArray(afterSnapshot.genres)

  return {
    changeAction: revision.change_action,
    revisionCreatedAt: revision.created_at,
    revisionBefore: Object.keys(beforeSnapshot).length > 0 ? {
      title: parseSnapshotString(beforeSnapshot.title),
      slug: parseSnapshotString(beforeSnapshot.slug),
      description: parseSnapshotString(beforeSnapshot.description),
      status: parseSnapshotString(beforeSnapshot.status) || null,
      genres: normalizeStringArray(beforeSnapshot.genres),
      coverImageUrl: parseSnapshotString(beforeSnapshot.cover_image_url) || null,
      author: parseSnapshotString(beforeSnapshot.author),
      artist: parseSnapshotString(beforeSnapshot.artist),
      releaseDate: parseSnapshotStringOrNull(beforeSnapshot.release_date),
    } : null,
    revisionAfter: {
      title: parseSnapshotString(afterSnapshot.title) || row.title || '',
      slug: parseSnapshotString(afterSnapshot.slug) || row.slug || '',
      description: parseSnapshotString(afterSnapshot.description) || row.description || '',
      status: parseSnapshotString(afterSnapshot.status) || row.status || 'ongoing',
      genres: afterGenres.length > 0 ? afterGenres : (Array.isArray(row.genres) ? row.genres : []),
      coverImageUrl: parseSnapshotString(afterSnapshot.cover_image_url) || row.cover_image_url || null,
      author: parseSnapshotString(afterSnapshot.author) || row.author || '',
      artist: parseSnapshotString(afterSnapshot.artist) || row.artist || '',
      releaseDate: parseSnapshotStringOrNull(afterSnapshot.release_date) || row.release_date || null,
    },
  }
}

export function mapPendingMangaRow(
  row: PendingMangaRow,
  revisionByTarget: PendingRevisionMap,
  followerCount: number,
) {
  const fansub = takeFirstRelation(row.fansub)

  return {
    ...buildPendingMangaRevisionState(row, revisionByTarget),
    id: row.id,
    fansubId: row.fansub_id,
    fansubName: fansub?.name || 'Bilinmiyor',
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    author: row.author || '',
    artist: row.artist || '',
    status: row.status || 'ongoing',
    genres: Array.isArray(row.genres) ? row.genres : [],
    coverImage: row.cover_image_url || null,
    isApproved: Boolean(row.is_approved),
    isActive: Boolean(row.is_active),
    lastChapterNumber: row.last_chapter_number ?? null,
    totalViews: Number(row.total_views || 0),
    rating: row.rating == null ? null : Number(row.rating),
    totalRatings: Number(row.total_ratings || 0),
    followerCount,
    releaseDate: row.release_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: 'manga',
  }
}

export function mapPendingChapterRow(
  row: PendingChapterRow,
  revisionByTarget: PendingRevisionMap,
) {
  const revision = revisionByTarget.get(`chapter:${row.id}`)
  const currentPages = normalizeStringArray(row.pages)
  const beforeSnapshot = parseRevisionSnapshot(revision?.before_data)
  const afterSnapshot = parseRevisionSnapshot(revision?.after_data)
  const beforePages = normalizeStringArray(beforeSnapshot.pages)
  const afterPagesFromSnapshot = normalizeStringArray(afterSnapshot.pages)
  const afterPages = afterPagesFromSnapshot.length > 0 ? afterPagesFromSnapshot : currentPages
  const addedPages = diffAddedUrls(beforePages, afterPages)
  const removedPages = diffRemovedUrls(beforePages, afterPages)
  const sameAsSet = arraysEqualAsMultiSet(beforePages, afterPages)
  const reordered = sameAsSet && !arraysEqualByOrder(beforePages, afterPages)
  const manga = takeFirstRelation(row.manga)
  const fansub = takeFirstRelation(row.fansub)

  return {
    id: row.id,
    mangaId: row.manga_id,
    mangaTitle: manga?.title || '-',
    mangaSlug: manga?.slug || null,
    mangaCover: manga?.cover_image_url || null,
    fansubId: row.fansub_id,
    fansubName: fansub?.name || 'Bilinmiyor',
    chapterNumber: Number(row.chapter_number),
    title: row.title || '',
    pageCount: currentPages.length,
    publishAt: row.publish_at || null,
    isApproved: Boolean(row.is_approved),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    changeAction: revision?.change_action || 'create',
    revisionCreatedAt: revision?.created_at || row.updated_at || row.created_at,
    beforeTitle: parseSnapshotString(beforeSnapshot.title),
    afterTitle: parseSnapshotString(afterSnapshot.title) || (row.title || ''),
    beforePublishAt: parseSnapshotStringOrNull(beforeSnapshot.publish_at),
    afterPublishAt: parseSnapshotStringOrNull(afterSnapshot.publish_at) || row.publish_at || null,
    beforePages,
    afterPages,
    addedPages,
    removedPages,
    reordered,
    type: 'chapter',
  }
}
