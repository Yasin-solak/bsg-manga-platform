import type { FansubNoticeActionTarget } from '@/lib/fansubNotices'
import type {
  FansubManageChapter,
  FansubManageManga,
} from '@/services/fansubManageService'
import {
  listFansubManageChapters,
  listFansubManageMangas,
} from '@/services/fansubManageService'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { listPublicMangaLists } from '@/services/mangaListService/lists'
import type { MangaListSummary } from '@/services/mangaListService/types'
import { txa } from '@/i18n/activeLocale'

const TARGET_OPTION_LIMIT = 30

export type FansubNoticeTargetOptionItem = {
  id: string
  label: string
  routeHint: string
}

export type FansubNoticeTargetOptionMap = Record<FansubNoticeActionTarget, FansubNoticeTargetOptionItem[]>

function createEmptyTargetOptionMap(): FansubNoticeTargetOptionMap {
  return {
    mangalar: [],
    bolumler: [],
    listeler: [],
  }
}

function mapMangaTarget(manga: FansubManageManga): FansubNoticeTargetOptionItem {
  return {
    id: manga.id,
    label: manga.title,
    routeHint: buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title }),
  }
}

function mapChapterTarget(chapter: FansubManageChapter): FansubNoticeTargetOptionItem {
  const titleSuffix = chapter.title?.trim() ? ` - ${chapter.title.trim()}` : ''
  return {
    id: chapter.id,
    label: txa('{v1} / Bolum {v2}{v3}', { v1: chapter.mangaTitle, v2: chapter.chapterNumber, v3: titleSuffix }),
    routeHint: buildPublicChapterPath({
      mangaId: chapter.mangaId,
      mangaSlug: chapter.mangaSlug,
      mangaTitle: chapter.mangaTitle,
      chapterNumber: chapter.chapterNumber,
    }),
  }
}

function mapListTarget(list: MangaListSummary): FansubNoticeTargetOptionItem {
  return {
    id: list.id,
    label: `${list.title} / ${list.ownerUsername}`,
    routeHint: `/listeler/${encodeURIComponent(list.id)}`,
  }
}

export function getDefaultNoticeTargetId(
  targetOptions: FansubNoticeTargetOptionMap,
  target: FansubNoticeActionTarget,
) {
  return targetOptions[target][0]?.id || ''
}

export function getDefaultNoticeTargetSelection(
  targetOptions: FansubNoticeTargetOptionMap,
  preferredTarget: FansubNoticeActionTarget = 'mangalar',
) {
  const orderedTargets = [
    preferredTarget,
    'mangalar',
    'bolumler',
    'listeler',
  ].filter((value, index, array): value is FansubNoticeActionTarget => array.indexOf(value) === index)

  for (const target of orderedTargets) {
    const targetEntityId = getDefaultNoticeTargetId(targetOptions, target)
    if (targetEntityId) {
      return { target, targetEntityId }
    }
  }

  return null
}

export function findNoticeTargetOption(
  targetOptions: FansubNoticeTargetOptionMap,
  target: FansubNoticeActionTarget,
  targetEntityId: string | null | undefined,
) {
  if (!targetEntityId) return null
  return targetOptions[target].find((item) => item.id === targetEntityId) || null
}

export function withFallbackNoticeTargetOption(
  targetOptions: FansubNoticeTargetOptionMap,
  target: FansubNoticeActionTarget,
  fallbackOption: FansubNoticeTargetOptionItem | null,
) {
  if (!fallbackOption) return targetOptions[target]
  if (targetOptions[target].some((item) => item.id === fallbackOption.id)) {
    return targetOptions[target]
  }
  return [fallbackOption, ...targetOptions[target]]
}

export async function loadFansubNoticeTargetOptions(fansubId: string): Promise<FansubNoticeTargetOptionMap> {
  const [mangaResult, chapterResult, listResult] = await Promise.all([
    listFansubManageMangas(fansubId, {
      page: 1,
      limit: TARGET_OPTION_LIMIT,
      status: 'approved',
      visibility: 'active',
    }),
    listFansubManageChapters(fansubId, {
      page: 1,
      limit: TARGET_OPTION_LIMIT,
      status: 'approved',
    }),
    listPublicMangaLists({
      page: 1,
      limit: TARGET_OPTION_LIMIT,
      sort: 'newest',
    }),
  ])

  const nextOptions = createEmptyTargetOptionMap()
  nextOptions.mangalar = mangaResult.items.map(mapMangaTarget)
  nextOptions.bolumler = chapterResult.items.map(mapChapterTarget)
  nextOptions.listeler = listResult.data.map(mapListTarget)
  return nextOptions
}
