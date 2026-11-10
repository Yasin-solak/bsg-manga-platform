import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from '@/i18n/router'
import type { Manga } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { getMyPreferredGenres } from '@/services/userService'
import { getGenreCounts, getLatestMangas, getPopularMangas, listMangas } from '@/services/mangaService'
import { DEFAULT_EXPLORE_COLLECTIONS, getPublicExploreConfig, loadExploreEditorMangasByIds, type ExploreCollectionConfig } from '@/services/exploreConfigService'
import { getRecommendedMangas, type RecommendedManga } from '@/services/recommendationService'
import { pickGenreRailItems } from './ExploreCurationSections'
import { GENRE_ALIAS_MAP, GENRE_PRESETS, ITEMS_PER_PAGE, mergeMangaPages, normalizeGenreId, normalizeSort, normalizeStatus, prettifyGenreName, toCanonicalGenreId, type ExploreGenreItem, type ExploreSortId, type ExploreStatusId } from './explorePageShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

function normalizeSortAlias(value: string | null): ExploreSortId {
  return normalizeSort(value === 'new' ? 'latest' : value)
}

function parseGenreQuery(value: string | null) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => toCanonicalGenreId(normalizeGenreId(item)))
    .filter(Boolean)
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

export function useExploreData() {
  const { currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const initialSearchQuery = searchParams.get('q') || searchParams.get('search') || ''
  const initialGenresQuery = searchParams.get('genres') || searchParams.get('genre') || ''

  const [mangas, setMangas] = useState<Manga[]>([])
  const [totalMangas, setTotalMangas] = useState(0)
  const [editorMangas, setEditorMangas] = useState<Manga[]>([])
  const [editorLoading, setEditorLoading] = useState(true)
  const [latestMangas, setLatestMangas] = useState<Manga[]>([])
  const [latestLoading, setLatestLoading] = useState(true)
  const [exploreCollections, setExploreCollections] = useState<ExploreCollectionConfig[]>(DEFAULT_EXPLORE_COLLECTIONS)
  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearchQuery)
  const [currentPage, setCurrentPage] = useState(1)
  const [queryVersion, setQueryVersion] = useState(0)
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => parseGenreQuery(initialGenresQuery))
  const [selectedStatus, setSelectedStatus] = useState<ExploreStatusId>(() => normalizeStatus(searchParams.get('status')))
  const [selectedSort, setSelectedSort] = useState<ExploreSortId>(() => normalizeSortAlias(searchParams.get('sort')))

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [recommended, setRecommended] = useState<RecommendedManga[]>([])
  const [recommendedLoading, setRecommendedLoading] = useState(true)
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({})
  const [genreQueryValuesById, setGenreQueryValuesById] = useState<Record<string, string[]>>({})
  const hasInitializedFiltersRef = useRef(false)
  const hasSeededPreferredGenresRef = useRef(false)
  const syncingFromUrlRef = useRef(false)
  const filterStateRef = useRef({
    searchQuery,
    selectedGenres,
    selectedStatus,
    selectedSort,
  })

  useEffect(() => {
    filterStateRef.current = {
      searchQuery,
      selectedGenres,
      selectedStatus,
      selectedSort,
    }
  }, [searchQuery, selectedGenres, selectedSort, selectedStatus])

  // Applies favorite genres chosen in onboarding once as the default filter when the URL
  // has no genre selection (cold-start suggestion). Hands off if the user played with filters
  // meanwhile or entered a genre in the URL.
  useEffect(() => {
    if (hasSeededPreferredGenresRef.current) return
    if (!currentUser?.id) return
    hasSeededPreferredGenresRef.current = true
    if (initialGenresQuery) return

    let cancelled = false
    getMyPreferredGenres(currentUser.id)
      .then((genres) => {
        if (cancelled || genres.length === 0) return
        const canonical = Array.from(new Set(
          genres.map((genre) => toCanonicalGenreId(normalizeGenreId(genre))).filter(Boolean),
        ))
        if (canonical.length === 0) return
        if (filterStateRef.current.selectedGenres.length > 0) return
        if (filterStateRef.current.searchQuery.trim()) return
        setSelectedGenres(canonical)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, initialGenresQuery])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  /*
   * "For you" rail. If the flag is off the service returns empty and the rail is not
   * drawn at all; we leave no empty title.
   */
  useEffect(() => {
    let cancelled = false
    setRecommendedLoading(true)
    void getRecommendedMangas(12)
      .then((rows) => { if (!cancelled) setRecommended(rows) })
      .catch(() => { if (!cancelled) setRecommended([]) })
      .finally(() => { if (!cancelled) setRecommendedLoading(false) })
    return () => { cancelled = true }
  }, [currentUser?.id])

  useEffect(() => {
    const urlParams = new URLSearchParams(searchParamsKey)
    const nextSearchQuery = urlParams.get('q') || urlParams.get('search') || ''
    const nextGenres = parseGenreQuery(urlParams.get('genres') || urlParams.get('genre'))
    const nextStatus = normalizeStatus(urlParams.get('status'))
    const nextSort = normalizeSortAlias(urlParams.get('sort'))
    const currentState = filterStateRef.current
    const hasUrlDifference = nextSearchQuery !== currentState.searchQuery
      || !areStringArraysEqual(nextGenres, currentState.selectedGenres)
      || nextStatus !== currentState.selectedStatus
      || nextSort !== currentState.selectedSort

    if (hasUrlDifference) {
      syncingFromUrlRef.current = true
    }

    setSearchQuery((previous) => {
      if (previous === nextSearchQuery) return previous
      setDebouncedSearch(nextSearchQuery.trim())
      return nextSearchQuery
    })
    setSelectedGenres((previous) => (areStringArraysEqual(nextGenres, previous) ? previous : nextGenres))
    setSelectedStatus((previous) => (previous === nextStatus ? previous : nextStatus))
    setSelectedSort((previous) => (previous === nextSort ? previous : nextSort))
  }, [searchParamsKey])

  useEffect(() => {
    let cancelled = false

    async function loadGenreCounts() {
      try {
        const counts = await getGenreCounts()
        if (cancelled) return

        const countMap: Record<string, number> = {}
        const queryValueMap: Record<string, Set<string>> = {}

        counts.forEach((entry) => {
          const rawGenre = entry.genre?.trim()
          if (!rawGenre) return

          const normalized = toCanonicalGenreId(normalizeGenreId(rawGenre))
          countMap[normalized] = (countMap[normalized] || 0) + (Number(entry.count) || 0)

          if (!queryValueMap[normalized]) queryValueMap[normalized] = new Set<string>()
          queryValueMap[normalized].add(rawGenre)
          queryValueMap[normalized].add(rawGenre.toLowerCase())
        })

        Object.entries(GENRE_ALIAS_MAP).forEach(([canonical, aliases]) => {
          if (!queryValueMap[canonical]) queryValueMap[canonical] = new Set<string>()
          queryValueMap[canonical].add(canonical)
          aliases.forEach((alias) => {
            queryValueMap[canonical].add(alias)
            queryValueMap[canonical].add(alias.replace(/-/g, ' '))
          })
        })

        const serialized: Record<string, string[]> = {}
        Object.entries(queryValueMap).forEach(([key, values]) => {
          serialized[key] = [...values]
        })

        setGenreCounts(countMap)
        setGenreQueryValuesById(serialized)
      } catch {
        if (!cancelled) {
          setGenreCounts({})
          setGenreQueryValuesById({})
        }
      }
    }

    void loadGenreCounts()
    return () => {
      cancelled = true
    }
  }, [])


  useEffect(() => {
    let cancelled = false

    async function loadExploreCuration() {
      setEditorLoading(true)
      try {
        const config = await getPublicExploreConfig()
        if (cancelled) return

        setExploreCollections(config.collections)
        const selectedMangas = await loadExploreEditorMangasByIds(config.editorMangaIds)
        if (cancelled) return

        if (selectedMangas.length >= 4) {
          setEditorMangas(selectedMangas)
          return
        }

        const fallback = await getPopularMangas(8)
        if (cancelled) return

        const byId = new Map<string, Manga>()
        selectedMangas.concat(fallback).forEach((manga) => {
          byId.set(manga.id, manga)
        })
        setEditorMangas([...byId.values()].slice(0, 8))
      } catch {
        if (!cancelled) {
          setExploreCollections(DEFAULT_EXPLORE_COLLECTIONS)
          setEditorMangas([])
        }
      } finally {
        if (!cancelled) setEditorLoading(false)
      }
    }

    void loadExploreCuration()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadLatestMangas() {
      setLatestLoading(true)
      try {
        const result = await getLatestMangas(6)
        if (!cancelled) setLatestMangas(result)
      } catch {
        if (!cancelled) setLatestMangas([])
      } finally {
        if (!cancelled) setLatestLoading(false)
      }
    }

    void loadLatestMangas()
    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Canonical genre id -> values REALLY in the catalog. `mangas.genres` holds Turkish names;
   * passing the id directly to the query matches nothing. The same resolver is used in the
   * mood section.
   */
  const resolveGenreQueryValues = useCallback((genreIds: string[]) => {
    const values = new Set<string>()
    genreIds.forEach((genreId) => {
      const mappedValues = genreQueryValuesById[genreId]
      if (mappedValues?.length) {
        mappedValues.forEach((value) => values.add(value))
        return
      }

      values.add(genreId)
      values.add(genreId.replace(/-/g, ' '))
    })
    return [...values]
  }, [genreQueryValuesById])

  const selectedGenreQueryValues = useMemo(
    () => resolveGenreQueryValues(selectedGenres),
    [resolveGenreQueryValues, selectedGenres],
  )

  const filterSignature = useMemo(
    () => JSON.stringify({
      search: debouncedSearch,
      genres: selectedGenreQueryValues,
      status: selectedStatus,
      sort: selectedSort,
    }),
    [debouncedSearch, selectedGenreQueryValues, selectedSort, selectedStatus],
  )

  useEffect(() => {
    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true
      return
    }

    setCurrentPage(1)
    setMangas([])
    setTotalMangas(0)
    setLoadError(null)
    setLoadMoreError(null)
    setLoading(true)
    setIsLoadingMore(false)
    setQueryVersion((previous) => previous + 1)
  }, [filterSignature])

  useEffect(() => {
    let cancelled = false

    async function loadPage() {
      const isFirstPage = currentPage === 1
      if (isFirstPage) {
        setLoading(true)
        setLoadError(null)
      } else {
        setIsLoadingMore(true)
        setLoadMoreError(null)
      }

      try {
        const { data, count } = await listMangas({
          search: debouncedSearch,
          genres: selectedGenreQueryValues,
          status: selectedStatus,
          sort: selectedSort,
          page: currentPage,
          limit: ITEMS_PER_PAGE,
        })

        if (cancelled) return

        setTotalMangas(count)
        setMangas((previous) => (isFirstPage ? data : mergeMangaPages(previous, data)))
      } catch {
        if (cancelled) return

        if (currentPage === 1) {
          setMangas([])
          setTotalMangas(0)
          setLoadError(txa('Manga listesi yüklenirken bir hata oluştu.'))
        } else {
          setLoadMoreError(txa('Daha fazla manga yüklenemedi.'))
        }
      } finally {
        if (!cancelled) {
          if (currentPage === 1) setLoading(false)
          else setIsLoadingMore(false)
        }
      }
    }

    void loadPage()

    return () => {
      cancelled = true
    }
  }, [currentPage, debouncedSearch, queryVersion, selectedGenreQueryValues, selectedSort, selectedStatus])

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false
      return
    }

    const params = new URLSearchParams()

    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (selectedGenres.length > 0) params.set('genres', selectedGenres.join(','))
    if (selectedStatus !== 'all') params.set('status', selectedStatus)
    if (selectedSort !== 'popular') params.set('sort', selectedSort)

    if (params.toString() === searchParamsKey) return

    setSearchParams(params, { replace: true })
  }, [searchParamsKey, searchQuery, selectedGenres, selectedSort, selectedStatus, setSearchParams])

  const genresById = useMemo(() => {
    const map = new Map<string, ExploreGenreItem>()
    GENRE_PRESETS.forEach((genre) => map.set(genre.id, genre))
    return map
  }, [])

  const mergedGenres = useMemo(() => {
    const genreMap = new Map<string, ExploreGenreItem>()

    GENRE_PRESETS.forEach((genre) => {
      genreMap.set(genre.id, { ...genre, count: genreCounts[genre.id] || 0 })
    })

    Object.entries(genreCounts).forEach(([genreId, count]) => {
      if (!genreMap.has(genreId)) {
        genreMap.set(genreId, {
          id: genreId,
          name: prettifyGenreName(genreId),
          icon: '📖',
          group: 'other',
          count,
        })
      }
    })

    selectedGenres.forEach((genreId) => {
      if (!genreMap.has(genreId)) {
        genreMap.set(genreId, {
          id: genreId,
          name: prettifyGenreName(genreId),
          icon: '📖',
          group: 'other',
          count: genreCounts[genreId] || 0,
        })
      }
    })

    const items = [...genreMap.values()]
      .filter((genre) => (genre.count || 0) > 0 || selectedGenres.includes(genre.id))
      .sort((left, right) => {
        if ((right.count || 0) !== (left.count || 0)) {
          return (right.count || 0) - (left.count || 0)
        }
        return left.name.localeCompare(right.name, intlLocale())
      })

    return items.length === 0
      ? GENRE_PRESETS.map((genre) => ({ ...genre, count: 0 }))
      : items
  }, [genreCounts, selectedGenres])

  const activeFilterCount = selectedGenres.length + (selectedStatus === 'all' ? 0 : 1) + (searchQuery.trim() ? 1 : 0)
  const hasMoreMangas = mangas.length < totalMangas
  const genreRailItems = useMemo(() => pickGenreRailItems(mergedGenres), [mergedGenres])

  function toggleGenre(genreId: string) {
    const canonicalId = toCanonicalGenreId(normalizeGenreId(genreId))
    setSelectedGenres((previous) => (
      previous.includes(canonicalId)
        ? previous.filter((item) => item !== canonicalId)
        : [...previous, canonicalId]
    ))
  }

  function clearAllFilters() {
    setSearchQuery('')
    setDebouncedSearch('')
    setSelectedGenres([])
    setSelectedStatus('all')
    setSelectedSort('popular')
  }

  function selectSingleGenre(genreId: string) {
    const canonicalId = toCanonicalGenreId(normalizeGenreId(genreId))
    setSelectedGenres([canonicalId])
  }

  /*
   * The query is measured in its DEBOUNCED form: opening and closing the showcase on every
   * keystroke would make the page jump while typing.
   */
  const isSearching = debouncedSearch.trim().length > 0

  const searchPending = searchQuery.trim() !== debouncedSearch.trim()
  return { mangas: searchPending ? [] : mangas, totalMangas: searchPending ? 0 : totalMangas, editorMangas, editorLoading, latestMangas, latestLoading, exploreCollections, loading: loading || searchPending, isLoadingMore, loadError, loadMoreError, searchQuery, setSearchQuery, selectedGenres, setSelectedGenres, selectedStatus, setSelectedStatus, selectedSort, setSelectedSort, filterSheetOpen, setFilterSheetOpen, recommended, recommendedLoading, genreCounts, genresById, mergedGenres, activeFilterCount, hasMoreMangas, genreRailItems, toggleGenre, clearAllFilters, selectSingleGenre, isSearching, resolveGenreQueryValues, setCurrentPage, setQueryVersion }
}

export type ExploreData = ReturnType<typeof useExploreData>
