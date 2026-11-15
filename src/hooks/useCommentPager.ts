import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { commentService, type CommentPage, type CommentSortBy } from '@/services/commentService'
import type { Comment } from '@/types'

interface UseCommentPagerArgs {
  mangaId: string | null | undefined
  setComments: Dispatch<SetStateAction<Comment[]>>
  /** Called with the merged list after a load-more so mention context can be refreshed. */
  onMerged?: (comments: Comment[]) => void
  onError?: (error: unknown) => void
}

/** Count of a comment plus all of its nested replies (used to keep the total in sync after a delete). */
export function countCommentTree(comment: Comment): number {
  return 1 + (comment.replies || []).reduce((sum, reply) => sum + countCommentTree(reply), 0)
}

/**
 * Pagination state for public comment lists. The first page is fetched by the caller
 * (it owns loading/error handling) and handed over via `applyFirstPage`; further pages go
 * through `loadMore`, which appends top-level comments without touching optimistic edits.
 */
export function useCommentPager({ mangaId, setComments, onMerged, onError }: UseCommentPagerArgs) {
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const nextOffsetRef = useRef(0)
  const inFlightRef = useRef(false)
  // Bumped whenever the list is replaced so a late load-more response cannot corrupt it.
  const generationRef = useRef(0)
  // Scope of the loaded first page; load-more must continue the same query even if the UI state already moved on.
  const scopeRef = useRef<{ sortBy: CommentSortBy; chapterId: string | null }>({ sortBy: 'newest', chapterId: null })

  const reset = useCallback(() => {
    generationRef.current += 1
    nextOffsetRef.current = 0
    inFlightRef.current = false
    setHasMore(false)
    setTotal(null)
    setLoadingMore(false)
  }, [])

  const applyFirstPage = useCallback((page: CommentPage, scope: { sortBy: CommentSortBy; chapterId?: string | null }) => {
    generationRef.current += 1
    scopeRef.current = { sortBy: scope.sortBy, chapterId: scope.chapterId ?? null }
    inFlightRef.current = false
    nextOffsetRef.current = page.nextOffset
    setHasMore(page.hasMore)
    setTotal(page.total)
    setLoadingMore(false)
  }, [])

  const adjustTotal = useCallback((delta: number) => {
    setTotal((previous) => (previous === null ? previous : Math.max(0, previous + delta)))
  }, [])

  const loadMore = useCallback(async () => {
    if (!mangaId || inFlightRef.current || !hasMore) return
    inFlightRef.current = true
    const generation = generationRef.current
    setLoadingMore(true)
    try {
      const page = await commentService.getCommentsPage(mangaId, {
        chapterId: scopeRef.current.chapterId,
        sortBy: scopeRef.current.sortBy,
        offset: nextOffsetRef.current,
      })
      if (generation !== generationRef.current) return
      nextOffsetRef.current = page.nextOffset
      setHasMore(page.hasMore)
      setComments((previous) => {
        const knownIds = new Set(previous.map((comment) => comment.id))
        // Pinned roots were already loaded with the first page; optimistic roots may overlap a later page.
        const fresh = page.comments.filter((comment) => !knownIds.has(comment.id) && comment.isPinned !== true)
        const next = fresh.length > 0 ? [...previous, ...fresh] : previous
        if (next !== previous) onMerged?.(next)
        return next
      })
    } catch (error) {
      if (generation === generationRef.current) onError?.(error)
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false
        setLoadingMore(false)
      }
    }
  }, [hasMore, mangaId, onError, onMerged, setComments])

  return { hasMore, total, loadingMore, loadMore, applyFirstPage, adjustTotal, reset }
}
