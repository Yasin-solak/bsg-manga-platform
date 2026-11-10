import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@/i18n/router'
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubMangaPeekProps {
  fansubId: string
  mangaCount: number
  mangas?: Manga[]
  isLoading: boolean
  onEnsureLoaded: (fansubId: string) => void
  compact?: boolean
  onOpenChange?: (isOpen: boolean) => void
  trigger?: ReactNode
  triggerClassName?: string
  popoverAlign?: 'left' | 'right'
}

const PREVIEW_LIMIT = 3
const POPOVER_WIDTH = 288
const POPOVER_VIEWPORT_PADDING = 12
let activeFansubMangaPeekId: string | null = null
let closeActiveFansubMangaPeek: (() => void) | null = null

export function FansubMangaPeek({
  fansubId,
  mangaCount,
  mangas,
  isLoading,
  onEnsureLoaded,
  compact = false,
  onOpenChange,
  trigger,
  triggerClassName,
  popoverAlign = 'right',
}: FansubMangaPeekProps) {
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 })
  const resolvedMangaCount = Math.max(0, mangaCount)
  const previewLimit = resolvedMangaCount > 0 ? Math.min(PREVIEW_LIMIT, resolvedMangaCount) : PREVIEW_LIMIT
  const previewItems = (mangas || []).slice(0, previewLimit)
  const remainingCount = Math.max(0, resolvedMangaCount - previewItems.length)

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current)
      }
      if (activeFansubMangaPeekId === fansubId) {
        activeFansubMangaPeekId = null
        closeActiveFansubMangaPeek = null
      }
    }
  }, [fansubId])

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  function clearCloseTimeout() {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  function openPopover() {
    clearCloseTimeout()
    if (activeFansubMangaPeekId && activeFansubMangaPeekId !== fansubId) {
      closeActiveFansubMangaPeek?.()
    }
    activeFansubMangaPeekId = fansubId
    closeActiveFansubMangaPeek = () => {
      clearCloseTimeout()
      setIsOpen(false)
    }
    setIsOpen(true)
    onEnsureLoaded(fansubId)
  }

  const updatePopoverPosition = useCallback(() => {
    const triggerElement = triggerRef.current
    if (!triggerElement) return

    const triggerRect = triggerElement.getBoundingClientRect()
    const popoverHeight = popoverRef.current?.offsetHeight ?? 312
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxLeft = Math.max(POPOVER_VIEWPORT_PADDING, viewportWidth - POPOVER_WIDTH - POPOVER_VIEWPORT_PADDING)
    const desiredLeft = popoverAlign === 'left'
      ? triggerRect.left
      : triggerRect.right - POPOVER_WIDTH
    const left = Math.min(Math.max(POPOVER_VIEWPORT_PADDING, desiredLeft), maxLeft)
    const belowTop = triggerRect.bottom + 8
    const aboveTop = triggerRect.top - popoverHeight - 8
    const top = belowTop + popoverHeight > viewportHeight - POPOVER_VIEWPORT_PADDING
      ? Math.max(POPOVER_VIEWPORT_PADDING, aboveTop)
      : belowTop

    setPopoverPosition({ left, top })
  }, [popoverAlign])

  function closePopover() {
    clearCloseTimeout()
    if (activeFansubMangaPeekId === fansubId) {
      activeFansubMangaPeekId = null
      closeActiveFansubMangaPeek = null
    }
    setIsOpen(false)
  }

  function scheduleClose() {
    clearCloseTimeout()
    closeTimeoutRef.current = window.setTimeout(() => {
      closePopover()
    }, 120)
  }

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePopoverPosition()
    const frameId = window.requestAnimationFrame(updatePopoverPosition)
    return () => window.cancelAnimationFrame(frameId)
  }, [isOpen, previewItems.length, remainingCount, isLoading, updatePopoverPosition])

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)
    return () => {
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [isOpen, updatePopoverPosition])

  if (resolvedMangaCount <= 0) {
    return (
      <span
        className={cn(
          trigger
            ? 'inline-flex shrink-0'
            : 'inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-background/50',
          !trigger && (compact ? 'h-7' : 'h-8'),
          triggerClassName,
        )}
      >
        {trigger || (
          <>
            <BookOpen className="h-3.5 w-3.5" />
            {txa('Yok')}
          </>
        )}
      </span>
    )
  }

  return (
    <div
      ref={triggerRef}
      className={cn('relative shrink-0', isOpen ? 'z-40' : 'z-0')}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div>
        <button
          type="button"
          onFocus={openPopover}
          onBlur={scheduleClose}
          className={cn(
            trigger
              ? 'inline-flex shrink-0 text-left transition hover:text-primary'
              : 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/90 px-2.5 text-[11px] font-medium text-foreground transition hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-background/50',
            !trigger && (compact ? 'h-7' : 'h-8'),
            triggerClassName,
          )}
        >
          {trigger || (
            <>
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">{resolvedMangaCount}</span>
              <span className="text-foreground">manga</span>
            </>
          )}
        </button>
      </div>

      {isOpen ? createPortal(
        <div
          ref={popoverRef}
          className={cn(
            'fixed z-[160] w-72 overflow-y-auto rounded-2xl border border-border/80 bg-background/98 p-3 shadow-2xl dark:border-white/10 dark:bg-popover',
          )}
          style={{
            left: popoverPosition.left,
            top: popoverPosition.top,
            maxHeight: 'min(360px, calc(100vh - 24px))',
          }}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClose}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
                {txa('Manga havuzu')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {txa('Bu ekipte yayında olan mangalar.')}
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {resolvedMangaCount.toLocaleString(intlLocale())}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-background/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              {txa('Mangalar yükleniyor...')}
            </div>
          ) : previewItems.length > 0 ? (
            <div className="space-y-2">
              {previewItems.map((manga) => (
                <Link
                  key={manga.id}
                  to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm transition hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-background/45"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{manga.title}</p>
                    {manga.lastChapter ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{manga.lastChapter}</p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
              {remainingCount > 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-background/40">
                  {txa('+{count} manga daha', { count: remainingCount })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-xs text-muted-foreground dark:border-white/10 dark:bg-background/40">
              {txa('Manga bilgisi henüz yüklenemedi.')}
            </div>
          )}
        </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
