import { useCallback } from 'react'
import type { FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import CommunityExpressionPicker from '@/components/community/CommunityExpressionPicker'
import CommunityExpressionTextarea from '@/components/community/CommunityExpressionTextarea'
import InlineSuggestionPopup from '@components/common/InlineSuggestionPopup'
import { useInlineAutocomplete } from '@/hooks/useInlineAutocomplete'
import { insertTextAtTextareaCursor } from '@components/community/communityUiShared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EyeOff } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

const COMMENT_LIMIT_WARNING_RATIO = 0.85

function getComposerCounterClassName(currentLength: number, maxLength?: number) {
  if (!maxLength) return 'text-[11px] text-muted-foreground'
  if (currentLength >= maxLength) return 'text-[11px] font-medium text-destructive'
  if (currentLength >= Math.floor(maxLength * COMMENT_LIMIT_WARNING_RATIO)) {
    return 'text-[11px] font-medium text-amber-700 dark:text-amber-300'
  }
  return 'text-[11px] text-muted-foreground'
}

export interface CommentThreadAutocompleteTextareaProps {
  ariaLabel?: string
  autoFocus?: boolean
  className?: string
  disabled?: boolean
  expressionContextFansubId?: string | null
  isSpoiler?: boolean
  maxLength?: number
  onToggleSpoiler?: () => void
  placeholder?: string
  rows?: number
  setText: (value: string) => void
  supporterAssets?: FansubSupporterAssetCatalogItem[]
  testId?: string
  text: string
}

export function CommentThreadAutocompleteTextarea({
  text,
  setText,
  placeholder,
  rows = 2,
  disabled = false,
  className,
  autoFocus = false,
  testId,
  ariaLabel,
  expressionContextFansubId,
  supporterAssets,
  isSpoiler = false,
  onToggleSpoiler,
  maxLength,
}: CommentThreadAutocompleteTextareaProps) {
  const applyTextLimit = useCallback((nextValue: string, mode: 'clip' | 'reject' = 'clip') => {
    if (!maxLength || nextValue.length <= maxLength) {
      setText(nextValue)
      return true
    }

    if (mode === 'reject') {
      return false
    }

    setText(nextValue.slice(0, maxLength))
    return false
  }, [maxLength, setText])

  const autocomplete = useInlineAutocomplete({
    text,
    setText: (nextValue) => {
      applyTextLimit(nextValue, 'clip')
    },
    enabled: !disabled,
  })

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative">
        <CommunityExpressionTextarea
          ref={autocomplete.textareaRef}
          data-testid={testId}
          aria-label={ariaLabel}
          supporterAssets={supporterAssets}
          previewClassName="text-sm"
          placeholder={placeholder}
          value={text}
          onChange={autocomplete.handleChange}
          onClick={autocomplete.handleClick}
          onKeyUp={autocomplete.handleKeyUp}
          onScroll={autocomplete.handleScroll}
          onKeyDown={autocomplete.handleKeyDown}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          className={className}
          autoFocus={autoFocus}
        />
        {autocomplete.isQueryActive && autocomplete.suggestionPosition ? (
          <InlineSuggestionPopup
            suggestions={autocomplete.suggestions}
            activeSuggestionIndex={autocomplete.activeSuggestionIndex}
            position={autocomplete.suggestionPosition}
            onSelect={autocomplete.applySuggestion}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-pressed={isSpoiler}
            className={cn(
              'h-8 gap-1.5 px-2 text-xs',
              isSpoiler
                ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={txa('Tüm yorum gövdesini spoiler olarak işaretle')}
            onClick={onToggleSpoiler}
          >
            <EyeOff className="size-3.5" />
            {isSpoiler ? txa('Spoiler açık') : txa('Spoiler')}
          </Button>
          {isSpoiler ? (
            <span className="text-[11px] text-muted-foreground">{txa('Gövde gizli başlar')}</span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {maxLength ? (
            <span className={cn('tabular-nums', getComposerCounterClassName(text.length, maxLength))}>
              {txa('{current}/{max} karakter', { current: text.length, max: maxLength })}
            </span>
          ) : null}

          <CommunityExpressionPicker
            disabled={disabled}
            contextFansubId={expressionContextFansubId}
            launcherVariant="inline-icons"
            onInsertText={(value) => {
              const textarea = autocomplete.textareaRef.current
              insertTextAtTextareaCursor(textarea, value, (nextValue) => applyTextLimit(nextValue, 'reject'))
              textarea?.focus()
            }}
          />
        </div>
      </div>
    </div>
  )
}
