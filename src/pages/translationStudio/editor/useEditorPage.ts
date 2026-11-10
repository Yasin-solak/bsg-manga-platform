import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteItem, insertItem, loadCleanup, loadItem, loadPageItems, loadSuggestions, saveCleanup, saveHumanText, saveItem,
  TlConflictError, type TlItem, type TlItemPatch, type TlStroke, type TlSuggestion, type TlTextStatus,
} from '@/services/translationEditorService'
import type { TlItemType } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

/*
 * Editor state: local state is the single source of truth, written to the DB with a delay.
 * - Item fields (position, style, type...) accumulate for 600 ms into one versioned UPDATE.
 * - Turkish text is written as human text after 700 ms.
 * - Cleaning strokes are written as one row after 900 ms.
 * On a conflict (another session) the item is reread from the DB and the user is told.
 * Undo/redo works on {items, strokes} snapshots; differences enter the
 * save queue. A deleted item that is undone is re-added with a new id.
 */

type Snapshot = { items: TlItem[], strokes: TlStroke[] }
export type SaveState = 'saved' | 'saving' | 'error'

const ITEM_FIELDS: Array<keyof TlItemPatch> = ['type', 'shape', 'x', 'y', 'w', 'h', 'polygon', 'rotation', 'sourceText', 'cleanup', 'style', 'readingOrder']
const HISTORY_LIMIT = 60

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useEditorPage(pageId: string | null, language: string, onToast: (message: string) => void) {
  const [items, setItems] = useState<TlItem[]>([])
  const [strokes, setStrokes] = useState<TlStroke[]>([])
  const [suggestions, setSuggestions] = useState<TlSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 })

  const itemsRef = useRef<TlItem[]>([])
  const strokesRef = useRef<TlStroke[]>([])
  const cleanupVersion = useRef<number | null>(null)
  const pendingItem = useRef(new Map<string, TlItemPatch>())
  const pendingText = useRef(new Map<string, { text: string, status: TlTextStatus }>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inflight = useRef(0)
  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const pageRef = useRef(pageId)
  pageRef.current = pageId

  const commitItems = useCallback((next: TlItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])
  const commitStrokes = useCallback((next: TlStroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }, [])

  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    inflight.current += 1
    setSaveState('saving')
    try {
      const result = await work()
      return result
    } catch (error) {
      setSaveState('error')
      onToast(toUserFacingErrorMessage(error, txa('Kaydedilemedi.')))
      return undefined
    } finally {
      inflight.current -= 1
      if (inflight.current === 0) setSaveState((state) => (state === 'error' ? 'error' : 'saved'))
    }
  }, [onToast])

  const reloadItem = useCallback(async (itemId: string) => {
    const fresh = await loadItem(itemId, language).catch(() => null)
    commitItems(fresh
      ? itemsRef.current.map((item) => (item.id === itemId ? fresh : item))
      : itemsRef.current.filter((item) => item.id !== itemId))
  }, [commitItems, language])

  const flushItem = useCallback(async (itemId: string) => {
    const patch = pendingItem.current.get(itemId)
    pendingItem.current.delete(itemId)
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!patch || !item) return
    await track(async () => {
      try {
        const { version, sourceVersion } = await saveItem(item, patch)
        commitItems(itemsRef.current.map((entry) => (entry.id === itemId ? { ...entry, version, sourceVersion } : entry)))
      } catch (error) {
        if (error instanceof TlConflictError) {
          await reloadItem(itemId)
          onToast(error.message)
          return
        }
        throw error
      }
    })
  }, [commitItems, onToast, reloadItem, track])

  const flushText = useCallback(async (itemId: string) => {
    const pending = pendingText.current.get(itemId)
    pendingText.current.delete(itemId)
    // If an item field save is pending it goes first, so source_version is current.
    if (pendingItem.current.has(itemId)) await flushItem(itemId)
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!pending || !item) return
    await track(async () => {
      try {
        const textVersion = await saveHumanText(item, language, pending.text, pending.status)
        commitItems(itemsRef.current.map((entry) => (entry.id === itemId
          ? { ...entry, textVersion, textOrigin: 'human' } : entry)))
      } catch (error) {
        if (error instanceof TlConflictError) {
          await reloadItem(itemId)
          onToast(error.message)
          return
        }
        throw error
      }
    })
  }, [commitItems, flushItem, language, onToast, reloadItem, track])

  const flushCleanup = useCallback(async () => {
    const currentPage = pageRef.current
    if (!currentPage) return
    await track(async () => {
      try {
        cleanupVersion.current = await saveCleanup(currentPage, strokesRef.current, cleanupVersion.current)
      } catch (error) {
        if (error instanceof TlConflictError) {
          const fresh = await loadCleanup(currentPage)
          cleanupVersion.current = fresh.version
          commitStrokes(fresh.strokes)
          onToast(txa('Temizleme izleri başka bir oturumda değişti; güncel hâli yüklendi.'))
          return
        }
        throw error
      }
    })
  }, [commitStrokes, onToast, track])

  const schedule = useCallback((key: string, delay: number, run: () => Promise<void>) => {
    const existing = timers.current.get(key)
    if (existing) clearTimeout(existing)
    setSaveState('saving')
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key)
      void run()
    }, delay))
  }, [])

  const flushAll = useCallback(async () => {
    for (const [key, timer] of timers.current) {
      clearTimeout(timer)
      timers.current.delete(key)
      if (key.startsWith('item:')) await flushItem(key.slice(5))
      else if (key.startsWith('text:')) await flushText(key.slice(5))
      else if (key === 'cleanup') await flushCleanup()
    }
  }, [flushCleanup, flushItem, flushText])

  // Page loading
  useEffect(() => {
    if (!pageId) return undefined
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    past.current = []
    future.current = []
    setHistorySize({ past: 0, future: 0 })
    Promise.all([loadPageItems(pageId, language, controller.signal), loadCleanup(pageId, controller.signal)])
      .then(async ([loadedItems, cleanup]) => {
        commitItems(loadedItems)
        commitStrokes(cleanup.strokes)
        cleanupVersion.current = cleanup.version
        setSuggestions(await loadSuggestions(loadedItems.map((item) => item.id), language, controller.signal).catch(() => []))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(toUserFacingErrorMessage(error, txa('Sayfa açılamadı.')))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => {
      controller.abort()
      void flushAll()
    }
    // flushAll sayfa degisiminde bekleyen yazimlari bosaltir; bagimliligi kasitli disarida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, language, commitItems, commitStrokes])

  // Sekme kapanirken bekleyen yazimlar
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (timers.current.size || inflight.current) {
        void flushAll()
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [flushAll])

  const snapshot = useCallback(() => {
    past.current.push({ items: itemsRef.current, strokes: strokesRef.current })
    if (past.current.length > HISTORY_LIMIT) past.current.shift()
    future.current = []
    setHistorySize({ past: past.current.length, future: 0 })
  }, [])

  const updateItem = useCallback((itemId: string, patch: TlItemPatch, options: { snapshot?: boolean } = {}) => {
    if (options.snapshot !== false) snapshot()
    commitItems(itemsRef.current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
    pendingItem.current.set(itemId, { ...(pendingItem.current.get(itemId) ?? {}), ...patch })
    schedule(`item:${itemId}`, 600, () => flushItem(itemId))
  }, [commitItems, flushItem, schedule, snapshot])

  const setText = useCallback((itemId: string, text: string, status?: TlTextStatus) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!item) return
    const nextStatus: TlTextStatus = status ?? (item.status === 'onayli' ? 'onayli' : text.trim() ? 'oneri' : 'eksik')
    commitItems(itemsRef.current.map((entry) => (entry.id === itemId ? { ...entry, text, status: nextStatus } : entry)))
    pendingText.current.set(itemId, { text, status: nextStatus })
    schedule(`text:${itemId}`, status ? 0 : 700, () => flushText(itemId))
  }, [commitItems, flushText, schedule])

  const setStatus = useCallback((itemId: string, status: TlTextStatus) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!item) return
    snapshot()
    setText(itemId, item.text, status)
  }, [setText, snapshot])

  const addItem = useCallback(async (box: { x: number, y: number, w: number, h: number }, type: TlItemType, extra: Partial<TlItem> = {}, options: { snapshot?: boolean } = {}) => {
    if (!pageRef.current) return null
    if (options.snapshot !== false) snapshot()
    const created = await track(() => insertItem({
      pageId: pageRef.current as string,
      type,
      ...box,
      shape: extra.shape,
      style: extra.style,
      polygon: extra.polygon,
      readingOrder: itemsRef.current.length,
    }, language))
    if (!created) return null
    commitItems([...itemsRef.current, created])
    if (extra.text) setText(created.id, extra.text)
    return created
  }, [commitItems, language, setText, snapshot, track])

  /** Deletes several items in one undo step (multi-selection). */
  const removeItems = useCallback(async (itemIds: string[]) => {
    if (!itemIds.length) return
    snapshot()
    for (const itemId of itemIds) {
      for (const key of [`item:${itemId}`, `text:${itemId}`]) {
        const timer = timers.current.get(key)
        if (timer) clearTimeout(timer)
        timers.current.delete(key)
      }
      pendingItem.current.delete(itemId)
      pendingText.current.delete(itemId)
    }
    const removed = new Set(itemIds)
    commitItems(itemsRef.current.filter((item) => !removed.has(item.id)))
    await Promise.all(itemIds.map((itemId) => track(() => deleteItem(itemId))))
  }, [commitItems, snapshot, track])

  const removeItem = useCallback((itemId: string) => removeItems([itemId]), [removeItems])

  const changeStrokes = useCallback((next: TlStroke[], options: { snapshot?: boolean } = {}) => {
    if (options.snapshot) snapshot()
    commitStrokes(next)
    schedule('cleanup', 900, flushCleanup)
  }, [commitStrokes, flushCleanup, schedule, snapshot])

  /** Applies a snapshot and queues the differences with the DB for saving. */
  const applySnapshot = useCallback(async (target: Snapshot) => {
    const currentById = new Map(itemsRef.current.map((item) => [item.id, item]))
    const targetIds = new Set(target.items.map((item) => item.id))
    const restored: TlItem[] = []
    for (const item of target.items) {
      const current = currentById.get(item.id)
      if (!current) {
        // A deleted item: re-added with a new id, ids in history are updated.
        const created = await track(() => insertItem({
          pageId: item.pageId, type: item.type, x: item.x, y: item.y, w: item.w, h: item.h,
          shape: item.shape, style: item.style, readingOrder: item.readingOrder, polygon: item.polygon,
        }, language))
        if (!created) continue
        const replace = (list: Snapshot[]) => list.forEach((snap) => { snap.items = snap.items.map((entry) => (entry.id === item.id ? { ...entry, id: created.id } : entry)) })
        replace(past.current)
        replace(future.current)
        const merged = { ...item, id: created.id, version: created.version, sourceVersion: created.sourceVersion, textVersion: null, textOrigin: null }
        restored.push(merged)
        if (item.sourceText) pendingItem.current.set(created.id, { sourceText: item.sourceText, cleanup: item.cleanup, rotation: item.rotation })
        if (item.text) pendingText.current.set(created.id, { text: item.text, status: item.status })
        continue
      }
      const patch: TlItemPatch = {}
      for (const field of ITEM_FIELDS) {
        if (!same(item[field], current[field])) (patch as Record<string, unknown>)[field] = item[field]
      }
      const merged = { ...item, version: current.version, sourceVersion: current.sourceVersion, textVersion: current.textVersion, textOrigin: current.textOrigin }
      restored.push(merged)
      if (Object.keys(patch).length) pendingItem.current.set(item.id, { ...(pendingItem.current.get(item.id) ?? {}), ...patch })
      if (item.text !== current.text || item.status !== current.status) pendingText.current.set(item.id, { text: item.text, status: item.status })
    }
    const removed = itemsRef.current.filter((item) => !targetIds.has(item.id))
    commitItems(restored)
    for (const item of removed) await track(() => deleteItem(item.id))
    for (const itemId of pendingItem.current.keys()) schedule(`item:${itemId}`, 300, () => flushItem(itemId))
    for (const itemId of pendingText.current.keys()) schedule(`text:${itemId}`, 400, () => flushText(itemId))
    if (!same(target.strokes, strokesRef.current)) {
      commitStrokes(target.strokes)
      schedule('cleanup', 300, flushCleanup)
    }
  }, [commitItems, commitStrokes, flushCleanup, flushItem, flushText, language, schedule, track])

  const undo = useCallback(async () => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push({ items: itemsRef.current, strokes: strokesRef.current })
    setHistorySize({ past: past.current.length, future: future.current.length })
    await applySnapshot(previous)
  }, [applySnapshot])

  const redo = useCallback(async () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push({ items: itemsRef.current, strokes: strokesRef.current })
    setHistorySize({ past: past.current.length, future: future.current.length })
    await applySnapshot(next)
  }, [applySnapshot])

  /** Restores a version: the current state is pushed to history, so Ctrl+Z can undo it. */
  const restore = useCallback(async (target: Snapshot) => {
    snapshot()
    await applySnapshot(target)
  }, [applySnapshot, snapshot])

  const replaceItem = useCallback((itemId: string, patch: Partial<TlItem>) => {
    commitItems(itemsRef.current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
  }, [commitItems])

  return {
    items, strokes, suggestions, loading, loadError, saveState, historySize,
    updateItem, setText, setStatus, addItem, removeItem, removeItems, changeStrokes, snapshot, undo, redo, restore, flushAll, replaceItem,
  }
}
