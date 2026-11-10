/**
 * InlineSuggestionPopup: autocomplete suggestions popup shown over a textarea.
 *
 * Used with the useInlineAutocomplete hook.
 */
import { cn } from '@/lib/utils'
import type { InlineSuggestion, InlineSuggestionPosition } from '@/hooks/useInlineAutocomplete'
import { txa } from '@/i18n/activeLocale'

interface InlineSuggestionPopupProps {
    suggestions: InlineSuggestion[]
    activeSuggestionIndex: number
    position: InlineSuggestionPosition
    onSelect: (suggestion: InlineSuggestion) => void
    /** Popup width; default 'min(340px, calc(100% - 12px))' */
    width?: string
}

/** Type icon: round icon shown when there is no avatar */
function TypeIcon({ type }: { type: InlineSuggestion['type'] }) {
    return (
        <span
            className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-bold',
                type === 'tag' && 'bg-primary/50',
                type === 'user' && 'bg-blue-500/25',
                type === 'fansub' && 'bg-red-600/20',
                type === 'manga' && 'bg-green-600/22',
            )}
        >
            {type === 'tag' ? '#' : '@'}
        </span>
    )
}

function InlineSuggestionPopup({
    suggestions,
    activeSuggestionIndex,
    position,
    onSelect,
    width = 'min(340px, calc(100% - 12px))',
}: InlineSuggestionPopupProps) {
    if (suggestions.length === 0) return null

    return (
        <div
            className="absolute z-50 flex max-h-[260px] min-w-0 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width,
            }}
            role="listbox"
            aria-label={txa('Oto-tamamlama önerileri')}
        >
            {suggestions.map((suggestion, index) => (
                <button
                    key={suggestion.key}
                    type="button"
                    className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-foreground transition-colors hover:bg-accent',
                        index === activeSuggestionIndex && 'bg-accent border-border/60 ring-1 ring-primary/20',
                    )}
                    onMouseDown={(e) => {
                        // preventDefault stops the textarea from blurring
                        e.preventDefault()
                        onSelect(suggestion)
                    }}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                >
                    <span className="inline-flex min-w-0 items-center gap-2">
                        {suggestion.avatar ? (
                            <img loading="lazy" decoding="async"
                                src={suggestion.avatar}
                                alt={suggestion.label}
                                className="size-6 shrink-0 rounded-full border border-border object-cover bg-muted"
                            />
                        ) : (
                            <TypeIcon type={suggestion.type} />
                        )}
                        <span className="inline-flex min-w-0 flex-col items-start">
                            <span className="truncate text-sm font-semibold text-foreground">{suggestion.label}</span>
                            {suggestion.secondaryText && (
                                <span className="truncate text-[11px] text-muted-foreground">{suggestion.secondaryText}</span>
                            )}
                        </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/50">{suggestion.insertText}</span>
                </button>
            ))}
        </div>
    )
}

export default InlineSuggestionPopup
