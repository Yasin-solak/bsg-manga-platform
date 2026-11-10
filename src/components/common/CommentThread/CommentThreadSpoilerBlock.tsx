import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

export function CommentThreadSpoilerBlock({
  isRevealed,
  onToggle,
  children,
}: {
  isRevealed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  if (!isRevealed) {
    return (
      <div className="inline-flex max-w-full align-top">
        <button
          type="button"
          onClick={onToggle}
          className="relative inline-flex min-w-[140px] max-w-full cursor-pointer overflow-hidden rounded-lg text-left align-top transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          aria-label={txa('Yorumu göster')}
        >
          <span className="pointer-events-none inline-flex max-w-full px-2.5 py-1.5">
            <span className="inline-block max-w-full select-none blur-[7px] opacity-80 transition duration-300">
              {children}
            </span>
          </span>
          <span className="absolute inset-0 flex items-center justify-center bg-background/10 px-3 backdrop-blur-[1px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-background/85 px-3 py-1 text-[11px] font-medium text-amber-700 shadow-sm transition-colors dark:text-amber-300">
              <Eye className="size-3.5" />
              {txa('Göster')}
            </span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">
          {txa('Spoiler')}
        </Badge>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={onToggle}
        >
          <EyeOff className="size-3.5" />
          {txa('Gizle')}
        </button>
      </div>
      <div>{children}</div>
    </div>
  )
}
