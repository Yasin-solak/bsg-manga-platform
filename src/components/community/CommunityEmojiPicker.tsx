import { COMMUNITY_COMPOSER_EMOJI_OPTIONS } from './communityUiShared'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SmilePlus } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

interface CommunityEmojiPickerProps {
  disabled?: boolean
  label?: string
  onSelect: (emoji: string) => void
}

export function CommunityEmojiPicker({
  disabled = false,
  label = txa('Emoji'),
  onSelect,
}: CommunityEmojiPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="rounded-full"
        >
          <SmilePlus className="mr-1.5 size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[248px] rounded-2xl border-border/70 p-3">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            {txa('Emoji Seç')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {txa('Metne doğrudan Unicode emoji eklenir.')}
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {COMMUNITY_COMPOSER_EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-2xl border border-border/60 bg-background/90 py-2 text-lg transition-colors hover:border-primary/25 hover:bg-accent/50"
              onClick={() => onSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default CommunityEmojiPicker
