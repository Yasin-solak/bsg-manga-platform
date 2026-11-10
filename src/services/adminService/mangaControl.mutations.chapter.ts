import { syncMangaPublicChapterMeta } from '../mangaMetaService'
import { supabase } from '../supabase'
import { invalidateAdminMangaControlDetailCache } from './mangaControl.detail'
import { auditMangaMutation } from './mangaControl.mutations.shared'

type ChapterMutationRow = {
  manga_id: string
}

async function syncChapterMutationManga(mangaId?: string) {
  if (!mangaId) return
  invalidateAdminMangaControlDetailCache(mangaId)
  await syncMangaPublicChapterMeta(mangaId)
}

export async function setAdminChapterPublishAt(chapterId: string, publishAt: string): Promise<void> {
  const normalized = publishAt.trim()
  const publishDate = normalized ? new Date(normalized) : new Date()

  if (Number.isNaN(publishDate.getTime())) {
    throw new Error('Yayin tarihi/saati gecersiz.')
  }

  const { data, error } = await supabase
    .from('chapters')
    .update({ publish_at: publishDate.toISOString() })
    .eq('id', chapterId)
    .select('manga_id')
    .maybeSingle<ChapterMutationRow>()

  if (error) {
    console.error('[adminService] setAdminChapterPublishAt error', error)
    throw error
  }

  await syncChapterMutationManga(data?.manga_id)
  await auditMangaMutation({
    action: 'chapter.publish_at.update',
    resourceType: 'chapter',
    resourceId: chapterId,
    summary: 'Bolum yayin zamani guncellendi.',
    metadata: {
      publishAt: publishDate.toISOString(),
      mangaId: data?.manga_id || null,
    },
  })
}

export async function setAdminChapterActive(chapterId: string, isActive: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('chapters')
    .update({ is_active: isActive })
    .eq('id', chapterId)
    .select('manga_id')
    .maybeSingle<ChapterMutationRow>()

  if (error) {
    console.error('[adminService] setAdminChapterActive error', error)
    throw error
  }

  await syncChapterMutationManga(data?.manga_id)
  await auditMangaMutation({
    action: 'chapter.active.update',
    resourceType: 'chapter',
    resourceId: chapterId,
    summary: isActive ? 'Bolum aktif edildi.' : 'Bolum pasife alindi.',
    metadata: {
      isActive,
      mangaId: data?.manga_id || null,
    },
  })
}

export async function setAdminChapterApproved(chapterId: string, isApproved: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('chapters')
    .update({ is_approved: isApproved })
    .eq('id', chapterId)
    .select('manga_id')
    .maybeSingle<ChapterMutationRow>()

  if (error) {
    console.error('[adminService] setAdminChapterApproved error', error)
    throw error
  }

  await syncChapterMutationManga(data?.manga_id)
  await auditMangaMutation({
    action: 'chapter.approval.update',
    resourceType: 'chapter',
    resourceId: chapterId,
    summary: isApproved ? 'Bolum onaylandi.' : 'Bolum onayi kaldirildi.',
    metadata: {
      isApproved,
      mangaId: data?.manga_id || null,
    },
  })
}
