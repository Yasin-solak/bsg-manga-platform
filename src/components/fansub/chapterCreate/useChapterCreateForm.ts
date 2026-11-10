/**
 * useChapterCreateForm: state and business logic of the chapter add form.
 *
 * Validates page files, merges/compresses long strips in the background
 * (debounced), supports drag-and-drop ordering and calls createChapter.
 * The same hook is used in both the full page and the in-studio modal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createChapter, getMangasByFansubId } from '@/services/mangaService'
import { toast } from '@/services/toastService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { createLongStrip, totalFileSize, validateImageFiles } from '@/utils/imageProcessingUtils'
import type { Chapter, Manga } from '@/types'
import { getChapterCreationFeedback } from './chapterCreationFeedback'
import { txa } from '@/i18n/activeLocale'

export const SLICE_HEIGHT_OPTIONS = [
  { id: 800, label: '800px' },
  { id: 1200, get label() { return txa('1200px (Onerilen)') } },
  { id: 1600, label: '1600px' },
  { id: 2000, label: '2000px' },
]

export const MAX_WIDTH_OPTIONS = [
  { id: 720, label: '720px (Webtoon)' },
  { id: 800, label: '800px (Manga)' },
  { id: 1000, get label() { return txa('1000px (Genis)') } },
]

export const CHAPTER_NOTES_MAX_LENGTH = 2000

interface UseChapterCreateFormOptions {
  fansubId?: string
  /** Modal quick path: preselects a specific manga. */
  defaultMangaId?: string
  /** Chapter number entered in Translation Studio setup. */
  defaultChapterNumber?: number
  /**
   * Ready pages from outside (Translation Studio output).
   *
   * Files take the normal `addPageFiles` path: validation, long-strip merging
   * and compression must be the SAME as manually uploaded pages. With a second
   * upload path, a chapter from the studio would be processed differently from
   * a manual one.
   */
  initialPageFiles?: File[]
  onSuccess?: (chapter: Chapter) => void
}

export function useChapterCreateForm({
  fansubId,
  defaultMangaId,
  defaultChapterNumber,
  initialPageFiles,
  onSuccess,
}: UseChapterCreateFormOptions) {
  const pageInputRef = useRef<HTMLInputElement>(null)

  const [mangas, setMangas] = useState<Manga[]>([])
  const [mangaId, setMangaId] = useState(defaultMangaId ?? '')
  const [chapterNumber, setChapterNumber] = useState(defaultChapterNumber ? String(defaultChapterNumber) : '')
  const [chapterTitle, setChapterTitle] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [notes, setNotes] = useState('')

  // Raw pages
  const [pageFiles, setPageFiles] = useState<File[]>([])
  const [pagePreviews, setPagePreviews] = useState<string[]>([])
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)
  const [isPageDragOver, setIsPageDragOver] = useState(false)
  const [showReaderPreview, setShowReaderPreview] = useState(false)

  // Birlestirme ayarlari
  const [sliceHeight, setSliceHeight] = useState(1200)
  const [maxWidth, setMaxWidth] = useState(720)

  // Otomatik isleme sonucu
  const [processing, setProcessing] = useState(false)
  const [processedFiles, setProcessedFiles] = useState<File[] | null>(null)
  const [processedPreviews, setProcessedPreviews] = useState<string[]>([])
  const [validatingPages, setValidatingPages] = useState(false)
  const [pageProcessingError, setPageProcessingError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)

  const originalSize = useMemo(() => totalFileSize(pageFiles), [pageFiles])
  const processedSize = useMemo(() => (processedFiles ? totalFileSize(processedFiles) : 0), [processedFiles])

  const pagePreviewsRef = useRef<string[]>([])
  const processedPreviewsRef = useRef<string[]>([])
  pagePreviewsRef.current = pagePreviews
  processedPreviewsRef.current = processedPreviews

  // Load the manga list
  useEffect(() => {
    if (!fansubId) return
    let cancelled = false
    getMangasByFansubId(fansubId)
      .then((list) => {
        if (cancelled) return
        setMangas(list)
      })
      .catch((err) => console.error('[useChapterCreateForm] Mangas fetch error:', err))
    return () => {
      cancelled = true
    }
  }, [fansubId])

  // Unmount temizligi
  useEffect(() => {
    return () => {
      pagePreviewsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
      processedPreviewsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const clearProcessedPreviews = useCallback((previews: string[]) => {
    previews.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    })
  }, [])

  // Both the file input and drag-and-drop use the same validation/add path.
  const addPageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setValidatingPages(true)
      setPageProcessingError(null)
      try {
        const { validFiles, invalidFiles } = await validateImageFiles(files)
        if (invalidFiles.length > 0) {
          const invalidNames = invalidFiles.map((file) => file.name || 'adsiz dosya').slice(0, 3).join(', ')
          toast.error(`Okunamayan gorsel reddedildi: ${invalidNames}`)
        }
        if (validFiles.length === 0) return
        clearProcessedPreviews(processedPreviewsRef.current)
        setProcessedFiles(null)
        setProcessedPreviews([])
        setPageFiles((prev) => [...prev, ...validFiles])
        setPagePreviews((prev) => [...prev, ...validFiles.map((f) => URL.createObjectURL(f))])
      } finally {
        setValidatingPages(false)
      }
    },
    [clearProcessedPreviews],
  )

  /**
   * Ready pages are added ONLY ONCE.
   *
   * If the effect ran on every render the same pages would pile up in the list;
   * the user would notice only after publishing.
   */
  const initialFilesAddedRef = useRef(false)
  useEffect(() => {
    if (initialFilesAddedRef.current) return
    if (!initialPageFiles || initialPageFiles.length === 0) return
    initialFilesAddedRef.current = true
    void addPageFiles(initialPageFiles)
  }, [addPageFiles, initialPageFiles])

  const handlePageFilesChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      try {
        await addPageFiles(files)
      } finally {
        if (pageInputRef.current) pageInputRef.current.value = ''
      }
    },
    [addPageFiles],
  )

  const removePage = useCallback(
    (index: number) => {
      const url = pagePreviewsRef.current[index]
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      setPageProcessingError(null)
      clearProcessedPreviews(processedPreviewsRef.current)
      setProcessedFiles(null)
      setProcessedPreviews([])
      setPageFiles((prev) => prev.filter((_, i) => i !== index))
      setPagePreviews((prev) => prev.filter((_, i) => i !== index))
    },
    [clearProcessedPreviews],
  )

  // Adding files by drag-and-drop to the upload area (a manga must be selected).
  const handleUploadDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!mangaId) return
      e.preventDefault()
      setIsPageDragOver(true)
    },
    [mangaId],
  )
  const handleUploadDragLeave = useCallback(() => setIsPageDragOver(false), [])
  const handleUploadDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsPageDragOver(false)
      if (!mangaId) return
      const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
      if (files.length > 0) void addPageFiles(files)
    },
    [mangaId, addPageFiles],
  )

  const clearAllPages = useCallback(() => {
    pagePreviewsRef.current.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    })
    setPageFiles([])
    setPagePreviews([])
    clearProcessedPreviews(processedPreviewsRef.current)
    setProcessedFiles(null)
    setProcessedPreviews([])
    setPageProcessingError(null)
    if (pageInputRef.current) pageInputRef.current.value = ''
  }, [clearProcessedPreviews])

  // Surukle-birak siralama
  const handlePageDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    setDragStartIndex(index)
  }, [])
  const handlePageDragEnd = useCallback(() => {
    setDragOverIndex(null)
    setDragStartIndex(null)
  }, [])
  const handlePageDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (index !== dragStartIndex) setDragOverIndex(index)
    },
    [dragStartIndex],
  )
  const handlePageDragLeave = useCallback(() => setDragOverIndex(null), [])
  const handlePageDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
    setPageFiles((prev) => {
      const n = [...prev]
      const [r] = n.splice(fromIndex, 1)
      n.splice(toIndex, 0, r)
      return n
    })
    setPagePreviews((prev) => {
      const n = [...prev]
      const [r] = n.splice(fromIndex, 1)
      n.splice(toIndex, 0, r)
      return n
    })
  }, [])

  /**
   * Automatic page merging: when pageFiles/sliceHeight/maxWidth change, in the
   * background merge -> slice -> WebP compress. Debounce 300ms.
   */
  useEffect(() => {
    if (pageFiles.length === 0) {
      clearProcessedPreviews(processedPreviewsRef.current)
      setProcessedFiles(null)
      setProcessedPreviews([])
      setPageProcessingError(null)
      return
    }

    let cancelled = false
    setProcessing(true)
    setPageProcessingError(null)

    const timer = setTimeout(async () => {
      try {
        const resultFiles = await createLongStrip(pageFiles, { sliceHeight, maxWidth, quality: 0.88 })
        if (cancelled) return
        clearProcessedPreviews(processedPreviewsRef.current)
        const previews = resultFiles.map((f) => URL.createObjectURL(f))
        setProcessedFiles(resultFiles)
        setProcessedPreviews(previews)
      } catch (err) {
        if (cancelled) return
        if (import.meta.env.DEV) console.error('[useChapterCreateForm] auto-process error', err)
        setPageProcessingError(txa('Sayfa gorselleri islenemedi. Bozuk veya desteklenmeyen dosyalari kaldirip tekrar yukleyin.'))
        setProcessedFiles(null)
        setProcessedPreviews([])
      } finally {
        if (!cancelled) setProcessing(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFiles, sliceHeight, maxWidth])

  const num = chapterNumber.trim() ? parseInt(chapterNumber, 10) : null
  const isValidNum = num != null && !Number.isNaN(num) && num > 0
  const selectedManga = mangas.find((m) => m.id === mangaId)
  const finalFiles = processedFiles ?? []
  const isValid =
    !!mangaId && isValidNum && finalFiles.length > 0 && !pageProcessingError && !loading && !processing && !validatingPages

  const submit = useCallback(async (): Promise<boolean> => {
    if (!mangaId || !isValidNum || !fansubId || finalFiles.length === 0 || pageProcessingError) {
      toast.error(pageProcessingError || txa('Bolum yayinlamak icin en az bir okunabilir sayfa yukleyin.'))
      return false
    }
    try {
      setLoading(true)
      const chapter = await createChapter(fansubId, {
        mangaId,
        chapterNumber: num!,
        chapterTitle: chapterTitle.trim() || undefined,
        notes: notes.trim() || undefined,
        pageFiles: finalFiles,
        pageCount: finalFiles.length,
        publishAt: publishAt || undefined,
      })
      toast.success(getChapterCreationFeedback(chapter).title)
      onSuccess?.(chapter)
      return true
    } catch (error) {
      console.error('Bolum ekleme hatasi:', error)
      toast.error(toAppErrorMessage(error, txa('Bolum eklenirken bir hata olustu.')))
      return false
    } finally {
      setLoading(false)
    }
  }, [mangaId, isValidNum, fansubId, finalFiles, pageProcessingError, num, chapterTitle, notes, publishAt, onSuccess])

  const displayPreviews = processedPreviews.length > 0 ? processedPreviews : pagePreviews

  return {
    pageInputRef,
    mangas,
    mangaId,
    setMangaId,
    chapterNumber,
    setChapterNumber,
    chapterTitle,
    setChapterTitle,
    publishAt,
    setPublishAt,
    notes,
    setNotes,
    pageFiles,
    pagePreviews,
    dragOverIndex,
    dragStartIndex,
    isPageDragOver,
    showReaderPreview,
    setShowReaderPreview,
    sliceHeight,
    setSliceHeight,
    maxWidth,
    setMaxWidth,
    processing,
    processedFiles,
    validatingPages,
    pageProcessingError,
    loading,
    originalSize,
    processedSize,
    addPageFiles,
    handlePageFilesChange,
    handleUploadDragOver,
    handleUploadDragLeave,
    handleUploadDrop,
    removePage,
    clearAllPages,
    handlePageDragStart,
    handlePageDragEnd,
    handlePageDragOver,
    handlePageDragLeave,
    handlePageDrop,
    num,
    isValidNum,
    selectedManga,
    displayPreviews,
    isValid,
    submit,
  }
}

export type ChapterCreateFormApi = ReturnType<typeof useChapterCreateForm>
