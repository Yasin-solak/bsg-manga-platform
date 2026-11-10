import { Heart, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface FansubFollowButtonProps {
  isFollowing: boolean
  isLoading: boolean
  onToggle: () => void
  compact?: boolean
  className?: string
}

export function FansubFollowButton({
  isFollowing,
  isLoading,
  onToggle,
  compact = false,
  className,
}: FansubFollowButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition',
        compact ? 'h-8 px-3' : 'h-9 px-3.5',
        isFollowing
          ? 'border-primary/35 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-border/80 bg-background/90 text-foreground hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-background/60',
        isLoading ? 'cursor-not-allowed opacity-70' : '',
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Heart className={cn('h-3.5 w-3.5', isFollowing ? 'fill-primary text-primary' : '')} />
      )}
      {isFollowing ? txa('Takipte') : txa('Takip Et')}
    </button>
  )
}
