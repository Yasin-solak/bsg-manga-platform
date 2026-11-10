import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface AdminFilterOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface AdminFilterGroupProps<T extends string> {
  label: string
  value: T
  options: AdminFilterOption<T>[]
  onChange: (next: T) => void
  className?: string
}

/**
 * AdminFilterGroup: ShadcnUIKit faceted filter.
 *
 * Structure: chip buttons in the form ⊕ Status ⊕ Role.
 * Active is filled, passive is outlined.
 */
export function AdminFilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: AdminFilterGroupProps<T>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            type="button"
            key={`${label}-${option.value}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'border-foreground/20 bg-foreground/5 text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {!isActive && <span className="text-muted-foreground">⊕</span>}
            <span>{option.label}</span>
            {typeof option.count === 'number' && (
              <Badge
                variant={isActive ? 'default' : 'secondary'}
                className="h-4 min-w-4 rounded px-1 text-[10px] font-semibold"
              >
                {option.count}
              </Badge>
            )}
          </button>
        )
      })}
    </div>
  )
}
