/**
 * Chapter picker in the header.
 *
 * The header used to say only "Chapter 12 - Name" and changing chapters meant going
 * back to the series page.
 *
 * **Multiple fansub versions:** several teams can translate the same chapter (see the
 * chapter ownership model: chapters are the uploading fansub's version). The first version of the picker
 * showed ONE row per number and readers could not switch to another.
 * Now a chapter with several versions opens with a counter on the row's right,
 * and each team can be picked separately. Single-version chapters open in one click as before,
 * with no needless clutter on a 400-chapter list.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Chapter } from '@/types'
import type { ReaderV2AdjacentTarget, ReaderV2ChapterOption } from '@/pages/reader/useReaderV2Chapter'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2ChapterPickerProps {
  open: boolean
  onToggle: () => void
  onClose: () => void
  options: ReaderV2ChapterOption[]
  currentChapterNumber: number | undefined
  /** Which version of the same number is being read (to mark among multiple versions). */
  currentChapterId: string | undefined
  currentTitle: string | undefined
  onSelect: (target: ReaderV2AdjacentTarget, versions: Chapter[]) => void
}

export function ReaderV2ChapterPicker({
  open,
  onToggle,
  onClose,
  options,
  currentChapterNumber,
  currentChapterId,
  currentTitle,
  onSelect,
}: ReaderV2ChapterPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [expandedNumber, setExpandedNumber] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    activeRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  useEffect(() => {
    if (!open) setExpandedNumber(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    /**
     * An outside click closes through a DOCUMENT listener, NOT a backdrop layer. Measured reason:
     * the header has `backdrop-blur`, and backdrop-filter creates a containing block for
     * `position: fixed` children: a `fixed inset-0` layer became 375x48 (only the header strip)
     * instead of 375x812, and clicking the rest of the screen did not close the picker.
     */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose, open])

  const choose = (option: ReaderV2ChapterOption, chapter: Chapter) => {
    onClose()
    if (chapter.id === currentChapterId) return
    // The version list is passed too: with several versions of one number, the address must carry
    // a definite distinguisher (?surum=), or the reader may open another team's
    // version.
    onSelect({ chapterNumber: option.chapterNumber, chapter }, option.versions)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        data-testid="reader-v2-chapter-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/10"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-white">
          {txa('Bolum {v1}', { v1: currentChapterNumber ?? '' })}
          {currentTitle ? ` - ${currentTitle}` : ''}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-white/60 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <>
          <div
            data-testid="reader-v2-chapter-picker-list"
            role="listbox"
            aria-label={txa('Bolum sec')}
            className="absolute left-1/2 top-full z-[9300] mt-2 max-h-[60vh] w-[min(360px,86vw)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/12 bg-neutral-950/97 p-1.5 shadow-2xl backdrop-blur"
          >
            {options.map((option) => {
              const isActiveNumber = option.chapterNumber === currentChapterNumber
              const hasVersions = option.versions.length > 1
              const isExpanded = expandedNumber === option.chapterNumber

              return (
                <div key={option.chapterNumber}>
                  <div className="flex items-stretch gap-1">
                    <button
                      ref={isActiveNumber ? activeRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={isActiveNumber}
                      onClick={() => choose(option, option.chapter)}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                        isActiveNumber ? 'bg-primary/20 text-white' : 'text-white/75 hover:bg-white/[0.07] hover:text-white',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{txa('Bolum {v1}', { v1: option.chapterNumber })}</span>
                        {option.chapter.title ? (
                          <span className="block truncate text-[11px] text-white/45">{option.chapter.title}</span>
                        ) : null}
                      </span>
                      {!hasVersions && option.chapter.fansub?.name ? (
                        <span className="shrink-0 truncate rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-white/45">
                          {option.chapter.fansub.name}
                        </span>
                      ) : null}
                      {isActiveNumber ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>

                    {hasVersions ? (
                      <button
                        type="button"
                        data-testid="reader-v2-chapter-versions-toggle"
                        aria-expanded={isExpanded}
                        aria-label={txa('Bolum {v1} icin {v2} ceviri surumu', { v1: option.chapterNumber, v2: option.versions.length })}
                        onClick={() => setExpandedNumber(isExpanded ? null : option.chapterNumber)}
                        className={cn(
                          'flex shrink-0 items-center gap-1 rounded-xl px-2 text-[11px] transition-colors',
                          isExpanded
                            ? 'bg-white/[0.12] text-white'
                            : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.1] hover:text-white',
                        )}
                      >
                        <Users className="size-3.5" />
                        {option.versions.length}
                      </button>
                    ) : null}
                  </div>

                  {hasVersions && isExpanded ? (
                    <div
                      data-testid="reader-v2-chapter-versions"
                      className="mb-1 ml-3 border-l border-white/10 pl-2"
                    >
                      {option.versions.map((version) => {
                        const isActiveVersion = version.id === currentChapterId
                        return (
                          <button
                            key={version.id}
                            type="button"
                            role="option"
                            aria-selected={isActiveVersion}
                            onClick={() => choose(option, version)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                              isActiveVersion ? 'bg-primary/15 text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                            )}
                          >
                            {version.fansub?.avatar ? (
                              <img src={version.fansub.avatar} alt="" className="size-5 shrink-0 rounded-full object-cover" loading="lazy" />
                            ) : (
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[9px] font-black text-amber-100">
                                {(version.fansub?.name ?? '?').trim().slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {version.fansub?.name ?? txa('Bilinmeyen ekip')}
                            </span>
                            {isActiveVersion ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default ReaderV2ChapterPicker
