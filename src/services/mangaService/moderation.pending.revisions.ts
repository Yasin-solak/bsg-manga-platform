import { listContentRevisions, revisionPages, type ContentRevision } from '../contentRevisionService'
import {
  arraysEqualAsMultiSet,
  arraysEqualByOrder,
  diffAddedUrls,
  diffRemovedUrls,
  normalizeStringArray,
  parseSnapshotString,
  parseSnapshotStringOrNull,
} from './shared'

/*
 * Pending revisions of published (approved) content for "Pending Approval". Unapproved
 * content's own row is listed anyway; these are changes to a LIVE series/chapter, and
 * the reader sees the old version until approval. The row id is the revision id (revisionId).
 */

function mangaSnapshot(value: Record<string, unknown>) {
  return {
    title: parseSnapshotString(value.title),
    slug: parseSnapshotString(value.slug),
    description: parseSnapshotString(value.description),
    status: parseSnapshotString(value.status) || null,
    genres: normalizeStringArray(value.genres),
    coverImageUrl: parseSnapshotString(value.cover_image_url) || null,
    author: parseSnapshotString(value.author),
    artist: parseSnapshotString(value.artist),
    releaseDate: parseSnapshotStringOrNull(value.release_date),
    isMature: value.is_mature === true,
  }
}

function mapMangaRevision(revision: ContentRevision) {
  const after = mangaSnapshot(revision.after)
  return {
    id: revision.id,
    revisionId: revision.id,
    fansubId: null,
    fansubName: revision.fansubName || 'Bilinmiyor',
    title: after.title || revision.mangaTitle || '-',
    slug: revision.mangaSlug || after.slug,
    description: after.description,
    author: after.author,
    artist: after.artist,
    status: after.status || 'ongoing',
    genres: after.genres,
    coverImage: after.coverImageUrl || revision.mangaCover,
    isApproved: true,
    isActive: true,
    lastChapterNumber: null,
    totalViews: 0,
    rating: null,
    totalRatings: 0,
    followerCount: 0,
    releaseDate: after.releaseDate,
    createdAt: revision.createdAt,
    updatedAt: revision.createdAt,
    changeAction: 'edit' as const,
    revisionCreatedAt: revision.createdAt,
    revisionNote: revision.note,
    revisionBefore: mangaSnapshot(revision.before),
    revisionAfter: after,
    requestedBy: revision.requestedBy,
    type: 'manga' as const,
  }
}

function mapChapterRevision(revision: ContentRevision) {
  const beforePages = revisionPages(revision.before.pages)
  const afterPages = revisionPages(revision.after.pages)
  const sameAsSet = arraysEqualAsMultiSet(beforePages, afterPages)
  return {
    id: revision.id,
    revisionId: revision.id,
    chapterId: revision.targetId,
    mangaId: revision.mangaId,
    mangaTitle: revision.mangaTitle || '-',
    mangaSlug: revision.mangaSlug,
    mangaCover: revision.mangaCover,
    fansubId: null,
    fansubName: revision.fansubName || 'Bilinmiyor',
    chapterNumber: Number(revision.chapterNumber ?? revision.after.chapter_number ?? 0),
    title: parseSnapshotString(revision.after.title),
    pageCount: afterPages.length,
    publishAt: parseSnapshotStringOrNull(revision.after.publish_at),
    isApproved: true,
    isActive: true,
    createdAt: revision.createdAt,
    updatedAt: revision.createdAt,
    changeAction: 'edit' as const,
    revisionCreatedAt: revision.createdAt,
    beforeTitle: parseSnapshotString(revision.before.title),
    afterTitle: parseSnapshotString(revision.after.title),
    beforePublishAt: parseSnapshotStringOrNull(revision.before.publish_at),
    afterPublishAt: parseSnapshotStringOrNull(revision.after.publish_at),
    beforePages,
    afterPages,
    addedPages: diffAddedUrls(beforePages, afterPages),
    removedPages: diffRemovedUrls(beforePages, afterPages),
    reordered: sameAsSet && !arraysEqualByOrder(beforePages, afterPages),
    source: revision.source,
    requestedBy: revision.requestedBy,
    type: 'chapter' as const,
  }
}

export type LiveMangaRevisionRow = ReturnType<typeof mapMangaRevision>
export type LiveChapterRevisionRow = ReturnType<typeof mapChapterRevision>

/** Empty list if unauthorized or the RPC does not exist yet: the pending content queue still works. */
export async function listLiveContentRevisions(): Promise<{ mangas: LiveMangaRevisionRow[], chapters: LiveChapterRevisionRow[] }> {
  try {
    const revisions = await listContentRevisions('pending')
    return {
      mangas: revisions.filter((revision) => revision.targetType === 'manga').map(mapMangaRevision),
      chapters: revisions.filter((revision) => revision.targetType === 'chapter').map(mapChapterRevision),
    }
  } catch {
    return { mangas: [], chapters: [] }
  }
}
