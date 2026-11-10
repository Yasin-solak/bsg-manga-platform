import * as React from 'react'
import type { FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import { getFansubSupporterAssetTokenRegex } from '@/lib/fansubSupporterAssetTokens'
import { cn } from '@/lib/utils'
import { hasInlineSpoilerSyntax } from '@/lib/inlineSpoilers'
import { Textarea } from '@/components/ui/textarea'
import {
  CommunityExpressionTextareaPreview,
  hasCommunityExpressionPreviewTokens,
} from './CommunityExpressionTextareaPreview'

interface CommunityExpressionTextareaProps extends React.ComponentPropsWithoutRef<'textarea'> {
  supporterAssets?: FansubSupporterAssetCatalogItem[]
  previewClassName?: string
  containerClassName?: string
  /** `||...||` spoiler bolgelerini editorde vurgula (varsayilan true). */
  highlightSpoilers?: boolean
}

type TokenRange = { start: number; end: number }

function getTokenRanges(text: string) {
  const ranges: TokenRange[] = []
  const regex = getFansubSupporterAssetTokenRegex()
  let match = regex.exec(text)
  while (match) {
    const token = match[0]
    const start = match.index
    ranges.push({ start, end: start + token.length })
    match = regex.exec(text)
  }
  return ranges
}

function findTokenRangeAt(ranges: TokenRange[], position: number) {
  return ranges.find((range) => position >= range.start && position < range.end) || null
}

function expandSelectionToTokenBoundaries(text: string, selectionStart: number, selectionEnd: number) {
  if (selectionStart === selectionEnd) return null

  const overlapping = getTokenRanges(text).filter(
    (range) => range.start < selectionEnd && range.end > selectionStart,
  )
  if (overlapping.length === 0) return null

  return {
    start: Math.min(selectionStart, overlapping[0]?.start ?? selectionStart),
    end: Math.max(selectionEnd, overlapping[overlapping.length - 1]?.end ?? selectionEnd),
  }
}

function findDeletionRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'backward' | 'forward',
) {
  const ranges = getTokenRanges(text)
  if (ranges.length === 0) return null

  if (selectionStart !== selectionEnd) {
    const overlapping = ranges.filter((range) => range.start < selectionEnd && range.end > selectionStart)
    if (overlapping.length === 0) return null
    return {
      start: Math.min(selectionStart, overlapping[0]?.start ?? selectionStart),
      end: Math.max(selectionEnd, overlapping[overlapping.length - 1]?.end ?? selectionEnd),
    }
  }

  if (direction === 'backward') {
    const target = ranges.find(
      (range) => selectionStart >= range.start && selectionStart <= range.end,
    )
    return target ? { start: target.start, end: target.end } : null
  }

  const target = ranges.find((range) => range.start === selectionStart || (selectionStart >= range.start && selectionStart < range.end))
  return target ? { start: target.start, end: target.end } : null
}

export const CommunityExpressionTextarea = React.forwardRef<
  HTMLTextAreaElement,
  CommunityExpressionTextareaProps
>(function CommunityExpressionTextarea(
  {
    value = '',
    supporterAssets,
    className,
    previewClassName,
    containerClassName,
    highlightSpoilers = true,
    onScroll,
    onBlur,
    onClick,
    onChange,
    onFocus,
    onKeyDown,
    onKeyUp,
    onSelect,
    style,
    ...props
  },
  forwardedRef,
) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const previewViewportRef = React.useRef<HTMLDivElement | null>(null)
  const stringValue = typeof value === 'string' ? value : ''
  const hasPreview = hasCommunityExpressionPreviewTokens(stringValue)
    || (highlightSpoilers && hasInlineSpoilerSyntax(stringValue))
  const [isFocused, setIsFocused] = React.useState(false)
  const [selection, setSelection] = React.useState({ start: 0, end: 0 })

  const setRefs = React.useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node
    if (typeof forwardedRef === 'function') {
      forwardedRef(node)
      return
    }
    if (forwardedRef) {
      ;(forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
    }
  }, [forwardedRef])

  const syncPreviewScroll = React.useCallback((node: HTMLTextAreaElement | null) => {
    const previewViewport = previewViewportRef.current
    if (!node || !previewViewport) return
    previewViewport.scrollTop = node.scrollTop
    previewViewport.scrollLeft = node.scrollLeft
  }, [])

  const syncSelectionState = React.useCallback((node: HTMLTextAreaElement | null) => {
    if (!node || typeof value !== 'string') return

    const nextStart = node.selectionStart ?? 0
    const nextEnd = node.selectionEnd ?? nextStart
    if (nextStart !== nextEnd) {
      const expandedSelection = expandSelectionToTokenBoundaries(value, nextStart, nextEnd)
      if (expandedSelection) {
        node.setSelectionRange(expandedSelection.start, expandedSelection.end)
        setSelection(expandedSelection)
        return
      }

      setSelection({ start: nextStart, end: nextEnd })
      return
    }

    const tokenRange = findTokenRangeAt(getTokenRanges(value), nextStart)
    if (!tokenRange) {
      setSelection({ start: nextStart, end: nextEnd })
      return
    }

    node.setSelectionRange(tokenRange.end, tokenRange.end)
    setSelection({ start: tokenRange.end, end: tokenRange.end })
  }, [value])

  React.useLayoutEffect(() => {
    if (!hasPreview) return
    syncPreviewScroll(textareaRef.current)
  }, [hasPreview, syncPreviewScroll, value])

  const handleScroll = React.useCallback<React.UIEventHandler<HTMLTextAreaElement>>((event) => {
    syncPreviewScroll(event.currentTarget)
    onScroll?.(event)
  }, [onScroll, syncPreviewScroll])

  const handleSelectionEvent = React.useCallback((node: HTMLTextAreaElement | null) => {
    if (!hasPreview) return
    syncSelectionState(node)
  }, [hasPreview, syncSelectionState])

  const handleChange = React.useCallback<React.ChangeEventHandler<HTMLTextAreaElement>>((event) => {
    onChange?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, onChange])

  const handleFocus = React.useCallback<React.FocusEventHandler<HTMLTextAreaElement>>((event) => {
    setIsFocused(true)
    onFocus?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, onFocus])

  const handleBlur = React.useCallback<React.FocusEventHandler<HTMLTextAreaElement>>((event) => {
    setIsFocused(false)
    onBlur?.(event)
  }, [onBlur])

  const handleClick = React.useCallback<React.MouseEventHandler<HTMLTextAreaElement>>((event) => {
    onClick?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, onClick])

  const handleSelect = React.useCallback<React.ReactEventHandler<HTMLTextAreaElement>>((event) => {
    onSelect?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, onSelect])

  const handleKeyUp = React.useCallback<React.KeyboardEventHandler<HTMLTextAreaElement>>((event) => {
    onKeyUp?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, onKeyUp])

  const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLTextAreaElement>>((event) => {
    if (
      hasPreview
      && typeof value === 'string'
      && (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      const textarea = event.currentTarget
      const selectionStart = textarea.selectionStart ?? 0
      const selectionEnd = textarea.selectionEnd ?? selectionStart
      const deletionRange = findDeletionRange(
        value,
        selectionStart,
        selectionEnd,
        event.key === 'Backspace' ? 'backward' : 'forward',
      )

      if (deletionRange) {
        event.preventDefault()
        const nextValue = `${value.slice(0, deletionRange.start)}${value.slice(deletionRange.end)}`
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        nativeSetter?.call(textarea, nextValue)
        onChange?.({
          ...event,
          target: textarea,
          currentTarget: textarea,
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>)
        window.requestAnimationFrame(() => {
          textarea.focus()
          textarea.setSelectionRange(deletionRange.start, deletionRange.start)
          handleSelectionEvent(textarea)
        })
        return
      }
    }

    onKeyDown?.(event)
    handleSelectionEvent(event.currentTarget)
  }, [handleSelectionEvent, hasPreview, onChange, onKeyDown, value])

  return (
    <div className={cn('relative min-w-0 rounded-md', containerClassName)}>
      {hasPreview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-md"
        >
          <div ref={previewViewportRef} className="h-full w-full overflow-hidden">
            <CommunityExpressionTextareaPreview
              text={stringValue}
              supporterAssets={supporterAssets}
              highlightSpoilers={highlightSpoilers}
              caretIndex={isFocused && selection.start === selection.end ? selection.start : null}
              className={cn('px-3 py-2 text-base leading-5 md:text-sm', previewClassName)}
            />
          </div>
        </div>
      ) : null}

      <Textarea
        {...props}
        ref={setRefs}
        value={value}
        style={hasPreview ? { ...style, color: 'transparent', WebkitTextFillColor: 'transparent' } : style}
        onBlur={handleBlur}
        onChange={handleChange}
        onClick={handleClick}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onSelect={handleSelect}
        onScroll={handleScroll}
        className={cn(
          'whitespace-pre-wrap break-all [overflow-wrap:anywhere]',
          className,
          hasPreview && 'bg-transparent text-transparent caret-transparent selection:text-transparent',
        )}
      />
    </div>
  )
})

CommunityExpressionTextarea.displayName = 'CommunityExpressionTextarea'

export default CommunityExpressionTextarea
