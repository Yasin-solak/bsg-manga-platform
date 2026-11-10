import { useEffect, useState } from 'react'
import { listMangas } from '@/services/mangaService'
import { searchGlobalEntities, type GlobalSearchResult } from '@/services/globalSearchService'
import { withServiceTimeout } from '@/services/apiResilience'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

type SearchState = { query: string; mangas: Manga[]; count: number; entities: GlobalSearchResult | null; error: boolean; partial: boolean; loading: boolean }
const EMPTY: SearchState = { query: '', mangas: [], count: 0, entities: null, error: false, partial: false, loading: false }

export function useSearchSuggestions(query: string, retry: number) {
  const normalized = query.trim().slice(0, 80)
  const [state, setState] = useState<SearchState>(EMPTY)
  useEffect(() => {
    const controller = new AbortController()
    if (normalized && normalized.length < 2) return () => controller.abort()
    const timer = window.setTimeout(() => {
      setState({ ...EMPTY, query: normalized, loading: true })
      void withServiceTimeout(async signal => {
        const [catalog, directory] = await Promise.allSettled([
          listMangas({ search: normalized || undefined, limit: 5 }, signal),
          normalized ? searchGlobalEntities(normalized, 3, signal) : Promise.resolve(null),
        ])
        if (catalog.status === 'rejected') throw catalog.reason
        return { mangas: catalog.value.data, count: catalog.value.count,
          entities: directory.status === 'fulfilled' ? directory.value : null,
          partial: directory.status === 'rejected' || Boolean(directory.status === 'fulfilled' && directory.value?.partial) }
      }, { label: txa('Arama'), signal: controller.signal, timeoutMs: 10_000 })
        .then(result => { if (!controller.signal.aborted) setState({ ...result, query: normalized, error: false, loading: false }) })
        .catch(() => { if (!controller.signal.aborted) setState({ ...EMPTY, query: normalized, error: true }) })
    }, normalized ? 250 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [normalized, retry])
  // An old query's result does not show under the new query, even during debounce.
  if (normalized && normalized.length < 2) return EMPTY
  return state.query === normalized ? state : { ...EMPTY, loading: true }
}
