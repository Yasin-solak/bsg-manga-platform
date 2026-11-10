import { cn } from '@/lib/utils'

/**
 * The SHARED badge selection card of profile and fansub edit modals.
 * The simple badge card design from the fansub side; both modals share the same look.
 */
export function BadgePickerCard({
  imageUrl,
  name,
  selected,
  selectOrder,
  disabled,
  limitReached,
  onToggle,
}: {
  imageUrl: string
  name: string
  selected: boolean
  selectOrder: number
  disabled?: boolean
  limitReached?: boolean
  onToggle: () => void
}) {
  const actionDisabled = disabled || (!selected && limitReached)

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={actionDisabled}
      aria-label={`${name} rozetini ${selected ? 'kaldir' : 'sec'}`}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        selected ? 'border-primary bg-primary/10' : 'border-border/70 bg-card/40 hover:border-primary/35',
      )}
    >
      <img
        loading="lazy"
        decoding="async"
        src={imageUrl}
        alt={name}
        className="h-12 w-12 rounded-md object-contain"
        onError={(event) => {
          if (event.currentTarget.src.endsWith('/badges/default.png')) return
          event.currentTarget.src = '/badges/default.png'
        }}
      />
      <span className="line-clamp-2 text-xs font-medium text-foreground">{name}</span>
      {selected ? (
        <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-bold text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.34)]">
          {selectOrder}
        </span>
      ) : null}
    </button>
  )
}
