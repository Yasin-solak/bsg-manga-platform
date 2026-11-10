/**
 * useMangaCreateForm: all state and business logic of the manga add form.
 *
 * Why a separate hook: the same form works in both the full page (MangaAddPage) and the in-studio
 * modal (MangaCreateDialog). Moving state management here keeps the
 * presentation layer (MangaCreateForm) reusable and simple.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createManga, getGenreCounts } from '@/services/mangaService'
import { toast } from '@/services/toastService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { compressImage, humanFileSize } from '@/utils/imageProcessingUtils'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

/* ─── Sabitler ─── */
export const DEFAULT_GENRES = [
  { id: 'action', get name() { return txa('Aksiyon') } },
  { id: 'adventure', get name() { return txa('Macera') } },
  { id: 'romance', get name() { return txa('Romantik') } },
  { id: 'comedy', get name() { return txa('Komedi') } },
  { id: 'drama', get name() { return txa('Drama') } },
  { id: 'fantasy', get name() { return txa('Fantezi') } },
  { id: 'horror', get name() { return txa('Korku') } },
  { id: 'mystery', get name() { return txa('Gizem') } },
  { id: 'sports', get name() { return txa('Spor') } },
  { id: 'slice-of-life', get name() { return txa('Gunluk Hayat') } },
  { id: 'sci-fi', get name() { return txa('Bilim Kurgu') } },
  { id: 'supernatural', get name() { return txa('Dogaustu') } },
  { id: 'shounen', get name() { return txa('Shounen') } },
  { id: 'seinen', get name() { return txa('Seinen') } },
  { id: 'isekai', get name() { return txa('Isekai') } },
  { id: 'psychological', get name() { return txa('Psikolojik') } },
  { id: 'thriller', get name() { return txa('Gerilim') } },
  { id: 'historical', get name() { return txa('Tarihi') } },
] as const

export const STATUS_OPTIONS = [
  { id: 'ongoing', get name() { return txa('Devam ediyor') } },
  { id: 'completed', get name() { return txa('Tamamlandi') } },
  { id: 'hiatus', get name() { return txa('Ara verdi') } },
] as const

export const LANG_OPTIONS = [
  { id: 'jp', get name() { return txa('Japonca') } },
  { id: 'kr', get name() { return txa('Korece') } },
  { id: 'cn', get name() { return txa('Cince') } },
  { id: 'en', get name() { return txa('Ingilizce') } },
  { id: 'other', get name() { return txa('Diger') } },
] as const

export const PLACEHOLDER_COVER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect fill="%23ddd" width="200" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="14" font-family="sans-serif"%3EKapak ekleyin%3C/text%3E%3C/svg%3E'

type MangaStatus = 'ongoing' | 'completed' | 'hiatus'
type GenreOption = { id: string; name: string }

export function normalizeGenreName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 42)
}

export function formatGenreName(value: string) {
  const normalized = normalizeGenreName(value)
  if (!normalized) return normalized
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

interface UseMangaCreateFormOptions {
  fansubId?: string
  /** Manga basariyla olusturulunca cagrilir (modal kapatma, liste tazeleme vb.). */
  onSuccess?: (manga: Manga) => void
}

/**
 * Returns all state and actions of the manga add form.
 */
export function useMangaCreateForm({ fansubId, onSuccess }: UseMangaCreateFormOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [altTitles, setAltTitles] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string>(PLACEHOLDER_COVER)
  const [coverSizeInfo, setCoverSizeInfo] = useState<string>('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [artist, setArtist] = useState('')
  const [status, setStatus] = useState<MangaStatus>('ongoing')
  const [originalLang, setOriginalLang] = useState('jp')
  const [releaseDate, setReleaseDate] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [availableGenres, setAvailableGenres] = useState<GenreOption[]>(() => [...DEFAULT_GENRES])
  const [customGenreInput, setCustomGenreInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleCoverFile = useCallback(async (file: File) => {
    const originalSize = humanFileSize(file.size)
    setCoverPreview(URL.createObjectURL(file))
    setCoverSizeInfo(txa('Sikistiriliyor...'))

    try {
      // Kapak sikistirma — max 600px genislik, WebP
      const compressed = await compressImage(file, { maxWidth: 600, quality: 0.9 })
      setCoverFile(compressed)
      const compressedSize = humanFileSize(compressed.size)
      setCoverSizeInfo(compressed !== file ? `${originalSize} → ${compressedSize}` : originalSize)
    } catch {
      setCoverFile(file)
      setCoverSizeInfo(originalSize)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])
  const onDragLeave = useCallback(() => setIsDragOver(false), [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file && file.type.startsWith('image/')) {
        void handleCoverFile(file)
      }
    },
    [handleCoverFile],
  )

  const toggleGenre = useCallback((g: string) => {
    const normalized = normalizeGenreName(g)
    if (!normalized) return
    setGenres((prev) =>
      prev.some((item) => item.toLowerCase() === normalized.toLowerCase())
        ? prev.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
        : [...prev, normalized],
    )
  }, [])

  const addCustomGenre = useCallback(() => {
    const normalized = normalizeGenreName(customGenreInput)
    if (!normalized) return
    setAvailableGenres((prev) => {
      const exists = prev.some((genre) => genre.name.toLowerCase() === normalized.toLowerCase())
      if (exists) return prev
      return [
        ...prev,
        { id: `custom-${normalized.toLowerCase().replace(/\s+/g, '-')}`, name: formatGenreName(normalized) },
      ]
    })
    setGenres((prev) =>
      prev.some((item) => item.toLowerCase() === normalized.toLowerCase())
        ? prev
        : [...prev, formatGenreName(normalized)],
    )
    setCustomGenreInput('')
  }, [customGenreInput])

  const addTag = useCallback(() => {
    setTagInput((current) => {
      const t = current.trim()
      if (t) setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
      return ''
    })
  }, [])

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t))
  }, [])

  const handleCoverChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) void handleCoverFile(f)
      else clearCover()
    },
    // clearCover is defined below; its reference does not change, so the dependency is needless
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleCoverFile],
  )

  const clearCover = useCallback(() => {
    setCoverFile(null)
    setCoverPreview(PLACEHOLDER_COVER)
    setCoverSizeInfo('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Kapak onizleme blob URL temizligi
  useEffect(() => {
    const url = coverPreview && coverPreview !== PLACEHOLDER_COVER ? coverPreview : null
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [coverPreview])

  // Dinamik tur listesi (mevcut katalogdan)
  useEffect(() => {
    let cancelled = false
    async function loadDynamicGenres() {
      try {
        const genreCounts = await getGenreCounts()
        if (cancelled) return
        const merged = new Map<string, GenreOption>()
        DEFAULT_GENRES.forEach((genre) => merged.set(genre.name.toLowerCase(), { ...genre }))
        genreCounts.forEach((entry) => {
          const normalized = normalizeGenreName(entry.genre || '')
          if (!normalized) return
          const key = normalized.toLowerCase()
          if (merged.has(key)) return
          merged.set(key, { id: `dynamic-${key.replace(/\s+/g, '-')}`, name: formatGenreName(normalized) })
        })
        setAvailableGenres(Array.from(merged.values()))
      } catch (error) {
        console.error('[useMangaCreateForm] loadDynamicGenres error', error)
        if (!cancelled) setAvailableGenres([...DEFAULT_GENRES])
      }
    }
    void loadDynamicGenres()
    return () => {
      cancelled = true
    }
  }, [])

  const coverDisplay = coverPreview || PLACEHOLDER_COVER
  const statusLabel = STATUS_OPTIONS.find((s) => s.id === status)?.name ?? status
  const langLabel = LANG_OPTIONS.find((l) => l.id === originalLang)?.name ?? originalLang

  const previewCard = useMemo(
    () => ({ title: title || txa('Manga basligi'), cover: coverDisplay, isNew }),
    [title, coverDisplay, isNew],
  )

  const isValid = title.trim().length > 0 && description.trim().length > 0 && !loading

  const submit = useCallback(async (): Promise<boolean> => {
    if (!title.trim() || !description.trim() || !fansubId) return false
    try {
      setLoading(true)
      const manga = await createManga(fansubId, {
        title: title.trim(),
        description: description.trim(),
        coverFile,
        author: author.trim() || undefined,
        artist: artist.trim() || undefined,
        status,
        originalLang,
        releaseDate,
        genres,
        tags,
        isNew,
      })
      toast.success(txa('Manga basariyla olusturuldu!'))
      onSuccess?.(manga)
      return true
    } catch (error) {
      console.error('Manga olusturma hatasi:', error)
      toast.error(toAppErrorMessage(error, txa('Manga olusturulurken bir hata olustu.')))
      return false
    } finally {
      setLoading(false)
    }
  }, [title, description, fansubId, coverFile, author, artist, status, originalLang, releaseDate, genres, tags, isNew, onSuccess])

  return {
    fileInputRef,
    title,
    setTitle,
    altTitles,
    setAltTitles,
    coverFile,
    coverDisplay,
    coverSizeInfo,
    description,
    setDescription,
    author,
    setAuthor,
    artist,
    setArtist,
    status,
    setStatus,
    originalLang,
    setOriginalLang,
    releaseDate,
    setReleaseDate,
    genres,
    availableGenres,
    customGenreInput,
    setCustomGenreInput,
    tagInput,
    setTagInput,
    tags,
    isNew,
    setIsNew,
    loading,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    toggleGenre,
    addCustomGenre,
    addTag,
    removeTag,
    handleCoverChange,
    clearCover,
    statusLabel,
    langLabel,
    previewCard,
    isValid,
    submit,
  }
}

export type MangaCreateFormApi = ReturnType<typeof useMangaCreateForm>
