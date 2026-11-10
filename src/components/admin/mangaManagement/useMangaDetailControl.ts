import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteAdminMangaComment,
  deleteAdminMangaRating,
  getAdminMangaControlDetail,
  getAdminMangaControlDetailFresh,
  getAdminMangaChapterPageCounts,
  getAdminMangaDetailMetrics,
  invalidateAdminMangaControlDetailCache,
  setAdminChapterActive,
  setAdminChapterApproved,
  setAdminChapterPublishAt,
  setAdminMangaCommentActive,
  setAdminMangaCommentPinned,
  setAdminMangaCoverImage,
  setAdminMangaDescription,
  setAdminMangaGenres,
  setAdminMangaMature,
  setAdminMangaSeriesType,
  type SeriesType,
  type AdminMangaChapterBrief,
  type AdminMangaCommentItem,
  type AdminMangaControlDetail,
  type AdminMangaControlItem,
  type AdminMangaDetailMetrics,
  type AdminMangaRatingItem,
} from '@/services/adminService'
import { uploadMangaCover } from '@/services/storageService'
import { toast } from '@/services/toastService'
import type { MangaDetailTab } from '../manga-control/MangaDetailControlModal'
import {
  chapterStatsFromChapters,
  normalizeGenre,
  toDateTimeLocalValue,
} from './mangaManagementUtils'
import { reportMangaDetailControlError } from './mangaDetailControlErrors'
import { txa } from '@/i18n/activeLocale'

interface UseMangaDetailControlParams {
  patchMangaInList: (mangaId: string, patch: Partial<AdminMangaControlItem>) => void
}

function clearBlobPreview(preview: string | null) {
  if (!preview) return
  if (!preview.startsWith('blob:')) return
  URL.revokeObjectURL(preview)
}

export function useMangaDetailControl({ patchMangaInList }: UseMangaDetailControlParams) {
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null)
  /** Rich metrics come from a separate RPC; without it the window works with no metrics. */
  const [detailMetrics, setDetailMetrics] = useState<AdminMangaDetailMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsReloadToken, setMetricsReloadToken] = useState(0)
  /** Page count per chapter: makes a half-finished upload visible in review. */
  const [chapterPageCounts, setChapterPageCounts] = useState<Record<string, number>>({})
  const [selectedMangaDetail, setSelectedMangaDetail] = useState<AdminMangaControlDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [detailTab, setDetailTab] = useState<MangaDetailTab>('chapters')
  const [detailBusyKey, setDetailBusyKey] = useState<string | null>(null)

  const [genreInput, setGenreInput] = useState('')
  const [genreDraft, setGenreDraft] = useState<string[]>([])
  const [savingGenres, setSavingGenres] = useState(false)
  const [seriesTypeDraft, setSeriesTypeDraft] = useState<SeriesType>('manga')
  const [savingSeriesType, setSavingSeriesType] = useState(false)
  const [matureDraft, setMatureDraft] = useState(false)
  const [savingMature, setSavingMature] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)

  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverSaving, setCoverSaving] = useState(false)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [chapterPublishDraft, setChapterPublishDraft] = useState<Record<string, string>>({})

  const [commentSearch, setCommentSearch] = useState('')
  const [ratingSearch, setRatingSearch] = useState('')

  useEffect(() => {
    return () => {
      clearBlobPreview(coverPreview)
    }
  }, [coverPreview])

  const loadDetail = useCallback(async (mangaId: string, mode: 'cached' | 'fresh' = 'cached') => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const detail = mode === 'fresh'
        ? await getAdminMangaControlDetailFresh(mangaId)
        : await getAdminMangaControlDetail(mangaId)
      setSelectedMangaDetail(detail)
      setGenreDraft(detail.genres)
      // Drafts are seeded from the details; otherwise the picker always shows the first value
      // and the "save" button would treat an unchanged field as savable.
      setSeriesTypeDraft(detail.seriesType)
      setMatureDraft(detail.isMature)
      setDescriptionDraft(detail.description || '')
      setGenreInput('')
      clearBlobPreview(coverPreview)
      setCoverFile(null)
      setCoverPreview(null)
      setChapterPublishDraft(
        detail.chapters.reduce<Record<string, string>>((acc, chapter) => {
          acc[chapter.id] = toDateTimeLocalValue(chapter.publishAt || chapter.createdAt)
          return acc
        }, {}),
      )
      setCommentSearch('')
      setRatingSearch('')
    } catch (loadError) {
      const reportedError = reportMangaDetailControlError('load-detail', loadError, txa('Seri ayrıntısı yüklenemedi.'), {
        mangaId,
        mode,
      })
      setSelectedMangaDetail(null)
      setDetailError(reportedError.userMessage)
    } finally {
      setDetailLoading(false)
    }
  }, [coverPreview])

  useEffect(() => {
    if (!selectedMangaId) {
      setSelectedMangaDetail(null)
      setDetailError(null)
      setChapterPublishDraft({})
      setDescriptionDraft('')
      setDetailMetrics(null)
      setChapterPageCounts({})
      return
    }
    void loadDetail(selectedMangaId, 'cached')
  }, [selectedMangaId, loadDetail])

  // Metrics load INDEPENDENTLY of details: not a heavy query, but
  // if it fails the detail window must still open.
  useEffect(() => {
    if (!selectedMangaId) return
    let cancelled = false
    setMetricsLoading(true)
    setDetailMetrics(null)
    void Promise.all([
      getAdminMangaDetailMetrics(selectedMangaId),
      getAdminMangaChapterPageCounts(selectedMangaId),
    ])
      .then(([metrics, pageCounts]) => {
        if (cancelled) return
        setDetailMetrics(metrics)
        setChapterPageCounts(pageCounts)
      })
      .catch(() => {
        if (!cancelled) {
          setDetailMetrics(null)
          setChapterPageCounts({})
        }
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedMangaId, metricsReloadToken])

  const openDetail = useCallback((mangaId: string) => {
    // Default tab is CHAPTERS: the window usually opens to review a
    // translation.
    setDetailTab('chapters')
    setSelectedMangaId(mangaId)
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedMangaId(null)
    setDetailTab('chapters')
    setDetailBusyKey(null)
    setGenreInput('')
    setGenreDraft([])
    setSavingGenres(false)
    setSeriesTypeDraft('manga')
    setSavingSeriesType(false)
    setMatureDraft(false)
    setSavingMature(false)
    setDescriptionDraft('')
    setSavingDescription(false)
    clearBlobPreview(coverPreview)
    setCoverPreview(null)
    setCoverFile(null)
    setCoverSaving(false)
    setCommentSearch('')
    setRatingSearch('')
  }, [coverPreview])

  const refreshDetail = useCallback(async () => {
    if (!selectedMangaId) return
    invalidateAdminMangaControlDetailCache(selectedMangaId)
    setMetricsReloadToken((token) => token + 1)
    await loadDetail(selectedMangaId, 'fresh')
  }, [loadDetail, selectedMangaId])

  const patchSelectedMangaDetail = useCallback((mangaId: string, patch: Partial<AdminMangaControlDetail>) => {
    setSelectedMangaDetail((prev) => (
      prev && prev.id === mangaId
        ? { ...prev, ...patch }
        : prev
    ))
  }, [])

  const addGenreToDraft = useCallback(() => {
    const normalized = normalizeGenre(genreInput)
    if (!normalized) return
    if (genreDraft.some((genre) => genre.toLowerCase() === normalized.toLowerCase())) {
      toast.warning(txa('Bu tür zaten ekli.'))
      return
    }
    if (genreDraft.length >= 20) {
      toast.warning(txa('En fazla 20 tür ekleyebilirsin.'))
      return
    }
    setGenreDraft((prev) => [...prev, normalized])
    setGenreInput('')
  }, [genreDraft, genreInput])

  const removeGenreFromDraft = useCallback((genre: string) => {
    setGenreDraft((prev) => prev.filter((item) => item !== genre))
  }, [])

  const handleSaveGenres = useCallback(async () => {
    if (!selectedMangaDetail) return
    setSavingGenres(true)
    try {
      await setAdminMangaGenres(selectedMangaDetail.id, genreDraft)
      setSelectedMangaDetail((prev) => (prev ? { ...prev, genres: genreDraft } : prev))
      patchMangaInList(selectedMangaDetail.id, { genres: genreDraft })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Türler güncellendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-genres', actionError, txa('Türler kaydedilemedi.'), {
        mangaId: selectedMangaDetail.id,
        genreCount: genreDraft.length,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setSavingGenres(false)
    }
  }, [genreDraft, patchMangaInList, selectedMangaDetail])

  const handleSaveSeriesType = useCallback(async () => {
    if (!selectedMangaDetail) return
    setSavingSeriesType(true)
    try {
      await setAdminMangaSeriesType(selectedMangaDetail.id, seriesTypeDraft)
      setSelectedMangaDetail((prev) => (prev ? { ...prev, seriesType: seriesTypeDraft } : prev))
      patchMangaInList(selectedMangaDetail.id, { seriesType: seriesTypeDraft })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Seri türü güncellendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-series-type', actionError, txa('Seri türü kaydedilemedi.'), {
        mangaId: selectedMangaDetail.id,
        seriesType: seriesTypeDraft,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setSavingSeriesType(false)
    }
  }, [patchMangaInList, selectedMangaDetail, seriesTypeDraft])

  const handleSaveMature = useCallback(async () => {
    if (!selectedMangaDetail) return
    setSavingMature(true)
    try {
      await setAdminMangaMature(selectedMangaDetail.id, matureDraft)
      setSelectedMangaDetail((prev) => (prev ? { ...prev, isMature: matureDraft } : prev))
      patchMangaInList(selectedMangaDetail.id, { isMature: matureDraft })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      // The flag is a visibility gate; the result is stated clearly.
      toast.success(matureDraft
        ? txa('Seri 18+ işaretlendi; yaşı doğrulanmamış kullanıcılara görünmeyecek.')
        : txa('18+ işareti kaldırıldı.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-mature', actionError, txa('18+ işareti kaydedilemedi.'), {
        mangaId: selectedMangaDetail.id,
        isMature: matureDraft,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setSavingMature(false)
    }
  }, [matureDraft, patchMangaInList, selectedMangaDetail])

  const handleSaveDescription = useCallback(async () => {
    if (!selectedMangaDetail) return
    setSavingDescription(true)
    try {
      await setAdminMangaDescription(selectedMangaDetail.id, descriptionDraft)
      const nextDescription = descriptionDraft.trim()
      setSelectedMangaDetail((prev) => (prev ? { ...prev, description: nextDescription } : prev))
      patchMangaInList(selectedMangaDetail.id, { description: nextDescription })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Açıklama güncellendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-description', actionError, txa('Açıklama kaydedilemedi.'), {
        mangaId: selectedMangaDetail.id,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setSavingDescription(false)
    }
  }, [descriptionDraft, patchMangaInList, selectedMangaDetail])

  const handleCoverInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    clearBlobPreview(coverPreview)
    setCoverFile(file)
    setCoverPreview(previewUrl)
  }, [coverPreview])

  const handleSaveCover = useCallback(async () => {
    if (!selectedMangaDetail || !coverFile) return
    setCoverSaving(true)
    try {
      const uploadedUrl = await uploadMangaCover(coverFile, {
        fansubId: selectedMangaDetail.fansubId,
        mangaId: selectedMangaDetail.id,
      })
      await setAdminMangaCoverImage(selectedMangaDetail.id, uploadedUrl)
      setSelectedMangaDetail((prev) => (prev ? { ...prev, coverImageUrl: uploadedUrl } : prev))
      patchMangaInList(selectedMangaDetail.id, { coverImageUrl: uploadedUrl })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      setCoverFile(null)
      clearBlobPreview(coverPreview)
      setCoverPreview(null)
      if (coverInputRef.current) coverInputRef.current.value = ''
      toast.success(txa('Kapak güncellendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-cover', actionError, txa('Kapak güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        hasCoverFile: Boolean(coverFile),
      })
      toast.error(reportedError.userMessage)
    } finally {
      setCoverSaving(false)
    }
  }, [coverFile, coverPreview, patchMangaInList, selectedMangaDetail])

  const clearCoverSelection = useCallback(() => {
    clearBlobPreview(coverPreview)
    setCoverPreview(null)
    setCoverFile(null)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }, [coverPreview])

  const handleChapterPublishDraftChange = useCallback((chapterId: string, value: string) => {
    setChapterPublishDraft((prev) => ({
      ...prev,
      [chapterId]: value,
    }))
  }, [])

  const handleSaveChapterPublishAt = useCallback(async (chapter: AdminMangaChapterBrief) => {
    if (!selectedMangaDetail) return

    const rawValue = (chapterPublishDraft[chapter.id] || '').trim()
    const publishDate = rawValue ? new Date(rawValue) : new Date()
    if (Number.isNaN(publishDate.getTime())) {
      toast.warning(txa('Yayın tarihi ya da saati geçersiz.'))
      return
    }

    const actionKey = `chapter-publish-${chapter.id}`
    setDetailBusyKey(actionKey)
    try {
      const publishIso = publishDate.toISOString()
      await setAdminChapterPublishAt(chapter.id, rawValue || publishIso)
      setSelectedMangaDetail((prev) => {
        if (!prev) return prev
        const chapters = prev.chapters.map((item) => (
          item.id === chapter.id
            ? { ...item, publishAt: publishIso }
            : item
        ))
        return { ...prev, chapters }
      })
      setChapterPublishDraft((prev) => ({
        ...prev,
        [chapter.id]: toDateTimeLocalValue(publishIso),
      }))
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Bölüm yayın tarihi güncellendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('save-chapter-publish-at', actionError, txa('Bölüm yayın tarihi güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        chapterId: chapter.id,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [chapterPublishDraft, selectedMangaDetail])

  const handleToggleChapterActive = useCallback(async (chapter: AdminMangaChapterBrief) => {
    if (!selectedMangaDetail) return
    const next = !chapter.isActive
    const actionKey = `chapter-active-${chapter.id}`
    setDetailBusyKey(actionKey)
    try {
      await setAdminChapterActive(chapter.id, next)
      const nextChapters = selectedMangaDetail.chapters.map((item) =>
        item.id === chapter.id ? { ...item, isActive: next } : item,
      )
      const nextChapterStats = chapterStatsFromChapters(nextChapters)
      setSelectedMangaDetail((prev) => {
        if (!prev || prev.id !== selectedMangaDetail.id) return prev
        return {
          ...prev,
          chapters: nextChapters,
          chapterStats: nextChapterStats,
        }
      })
      patchMangaInList(selectedMangaDetail.id, { chapterStats: nextChapterStats })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(next ? txa('Bölüm çevirisi yayına alındı.') : txa('Bölüm çevirisi yayından kaldırıldı.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('toggle-chapter-active', actionError, txa('Bölüm çevirisi güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        chapterId: chapter.id,
        nextIsActive: next,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [patchMangaInList, selectedMangaDetail])

  const handleToggleChapterApproved = useCallback(async (chapter: AdminMangaChapterBrief) => {
    if (!selectedMangaDetail) return
    const next = !chapter.isApproved
    const actionKey = `chapter-approved-${chapter.id}`
    setDetailBusyKey(actionKey)
    try {
      await setAdminChapterApproved(chapter.id, next)
      const nextChapters = selectedMangaDetail.chapters.map((item) =>
        item.id === chapter.id ? { ...item, isApproved: next } : item,
      )
      const nextChapterStats = chapterStatsFromChapters(nextChapters)
      setSelectedMangaDetail((prev) => {
        if (!prev || prev.id !== selectedMangaDetail.id) return prev
        return {
          ...prev,
          chapters: nextChapters,
          chapterStats: nextChapterStats,
        }
      })
      patchMangaInList(selectedMangaDetail.id, { chapterStats: nextChapterStats })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(next ? txa('Çeviri onaylandı.') : txa('Çeviri yeniden beklemeye alındı.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('toggle-chapter-approved', actionError, txa('Çeviri onay durumu güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        chapterId: chapter.id,
        nextIsApproved: next,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [patchMangaInList, selectedMangaDetail])

  const handleToggleCommentActive = useCallback(async (comment: AdminMangaCommentItem) => {
    if (!selectedMangaDetail) return
    const next = !comment.isActive
    const actionKey = `comment-active-${comment.id}`
    setDetailBusyKey(actionKey)
    try {
      await setAdminMangaCommentActive(comment.id, next)
      setSelectedMangaDetail((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          comments: prev.comments.map((item) =>
            item.id === comment.id ? { ...item, isActive: next } : item,
          ),
        }
      })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(next ? txa('Yorum yeniden yayında.') : txa('Yorum gizlendi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('toggle-comment-active', actionError, txa('Yorum durumu güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        commentId: comment.id,
        nextIsActive: next,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [selectedMangaDetail])

  const handleToggleCommentPinned = useCallback(async (comment: AdminMangaCommentItem) => {
    if (!selectedMangaDetail) return
    const next = !comment.isPinned
    const actionKey = `comment-pin-${comment.id}`
    setDetailBusyKey(actionKey)
    try {
      await setAdminMangaCommentPinned(comment.id, next)
      setSelectedMangaDetail((prev) => {
        if (!prev) return prev
        const comments = prev.comments.map((item) =>
          item.id === comment.id ? { ...item, isPinned: next } : item,
        )
        comments.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        return { ...prev, comments }
      })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(next ? txa('Yorum sabitlendi.') : txa('Yorum sabitlemesi kaldırıldı.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('toggle-comment-pinned', actionError, txa('Yorum sabitleme durumu güncellenemedi.'), {
        mangaId: selectedMangaDetail.id,
        commentId: comment.id,
        nextIsPinned: next,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [selectedMangaDetail])

  const handleDeleteComment = useCallback(async (comment: AdminMangaCommentItem) => {
    if (!selectedMangaDetail) return
    const actionKey = `comment-delete-${comment.id}`
    setDetailBusyKey(actionKey)
    try {
      await deleteAdminMangaComment(comment.id)
      setSelectedMangaDetail((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          comments: prev.comments.filter((item) => item.id !== comment.id),
        }
      })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Yorum silindi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('delete-comment', actionError, txa('Yorum silinemedi.'), {
        mangaId: selectedMangaDetail.id,
        commentId: comment.id,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [selectedMangaDetail])

  const handleDeleteRating = useCallback(async (ratingItem: AdminMangaRatingItem) => {
    if (!selectedMangaDetail) return
    const actionKey = `rating-delete-${ratingItem.userId}`
    setDetailBusyKey(actionKey)
    try {
      await deleteAdminMangaRating(ratingItem.mangaId, ratingItem.userId)
      const nextRatings = selectedMangaDetail.ratings.filter((item) => item.userId !== ratingItem.userId)
      const nextTotalRatings = nextRatings.length
      const nextAverage = nextTotalRatings > 0
        ? Number((nextRatings.reduce((sum, item) => sum + item.rating, 0) / nextTotalRatings).toFixed(2))
        : null
      setSelectedMangaDetail((prev) => {
        if (!prev || prev.id !== selectedMangaDetail.id) return prev
        return {
          ...prev,
          ratings: nextRatings,
          totalRatings: nextTotalRatings,
          rating: nextAverage,
        }
      })
      patchMangaInList(selectedMangaDetail.id, {
        totalRatings: nextTotalRatings,
        rating: nextAverage,
      })
      invalidateAdminMangaControlDetailCache(selectedMangaDetail.id)
      toast.success(txa('Puan kaydı silindi.'))
    } catch (actionError) {
      const reportedError = reportMangaDetailControlError('delete-rating', actionError, txa('Puan kaydı silinemedi.'), {
        mangaId: selectedMangaDetail.id,
        userId: ratingItem.userId,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setDetailBusyKey(null)
    }
  }, [patchMangaInList, selectedMangaDetail])

  const chapterGroups = useMemo(() => {
    if (!selectedMangaDetail) return []
    const grouped = new Map<number, AdminMangaChapterBrief[]>()
    selectedMangaDetail.chapters.forEach((chapter) => {
      const chapterNo = Number(chapter.chapterNumber)
      const prev = grouped.get(chapterNo) || []
      prev.push(chapter)
      grouped.set(chapterNo, prev)
    })
    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([chapterNumber, versions]) => ({ chapterNumber, versions }))
  }, [selectedMangaDetail])

  const filteredComments = useMemo(() => {
    const list = selectedMangaDetail?.comments || []
    const keyword = commentSearch.trim().toLowerCase()
    if (!keyword) return list
    return list.filter((comment) => (
      comment.username.toLowerCase().includes(keyword)
      || comment.content.toLowerCase().includes(keyword)
      || comment.userId.toLowerCase().includes(keyword)
    ))
  }, [selectedMangaDetail, commentSearch])

  const filteredRatings = useMemo(() => {
    const list = selectedMangaDetail?.ratings || []
    const keyword = ratingSearch.trim().toLowerCase()
    if (!keyword) return list
    return list.filter((ratingItem) => (
      ratingItem.username.toLowerCase().includes(keyword)
      || ratingItem.userId.toLowerCase().includes(keyword)
      || String(ratingItem.rating).includes(keyword)
    ))
  }, [selectedMangaDetail, ratingSearch])

  const ratingSummary = useMemo(() => {
    const ratings = selectedMangaDetail?.ratings || []
    const distribution = [0, 0, 0, 0, 0]
    ratings.forEach((item) => {
      if (item.rating >= 1 && item.rating <= 5) {
        distribution[item.rating - 1] += 1
      }
    })
    const total = ratings.length
    const average = total > 0
      ? Number((ratings.reduce((sum, item) => sum + item.rating, 0) / total).toFixed(2))
      : null

    return {
      total,
      average,
      distribution,
    }
  }, [selectedMangaDetail])

  return {
    selectedMangaId,
    selectedMangaDetail,
    detailMetrics,
    metricsLoading,
    chapterPageCounts,
    detailLoading,
    detailError,
    detailTab,
    setDetailTab,
    detailBusyKey,
    openDetail,
    closeDetail,
    patchSelectedMangaDetail,
    refreshDetail,
    coverPreview,
    coverFile,
    coverSaving,
    coverInputRef,
    handleCoverInputChange,
    handleSaveCover,
    clearCoverSelection,
    genreInput,
    setGenreInput,
    genreDraft,
    savingGenres,
    seriesTypeDraft,
    onSeriesTypeChange: setSeriesTypeDraft,
    savingSeriesType,
    onSaveSeriesType: handleSaveSeriesType,
    matureDraft,
    onMatureChange: setMatureDraft,
    savingMature,
    onSaveMature: handleSaveMature,
    addGenreToDraft,
    removeGenreFromDraft,
    handleSaveGenres,
    descriptionDraft,
    setDescriptionDraft,
    handleSaveDescription,
    savingDescription,
    chapterGroups,
    chapterPublishDraft,
    handleChapterPublishDraftChange,
    handleSaveChapterPublishAt,
    handleToggleChapterApproved,
    handleToggleChapterActive,
    filteredComments,
    commentSearch,
    setCommentSearch,
    filteredRatings,
    ratingSearch,
    setRatingSearch,
    ratingSummary,
    handleToggleCommentPinned,
    handleToggleCommentActive,
    handleDeleteComment,
    handleDeleteRating,
  }
}
