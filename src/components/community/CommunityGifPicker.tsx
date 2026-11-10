import { useEffect, useState } from 'react'
import type { CommunityGifSelection } from '@types'
import { searchCommunityGifProvider, isCommunityGifProviderConfigured } from '@/services/communityGifProviderService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Film, Loader2, X } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

interface CommunityGifPickerProps {
  disabled?: boolean
  isEnabled?: boolean
  selectedGif?: CommunityGifSelection
  onSelect: (gif: CommunityGifSelection) => void
  onClear: () => void
}

export function CommunityGifPicker({
  disabled = false,
  isEnabled = true,
  selectedGif,
  onSelect,
  onClear,
}: CommunityGifPickerProps) {
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState<CommunityGifSelection[]>([])
  const [gifLoading, setGifLoading] = useState(false)

  useEffect(() => {
    if (!isEnabled || disabled || !isCommunityGifProviderConfigured() || gifQuery.trim().length < 2) {
      setGifResults([])
      setGifLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setGifLoading(true)
      try {
        const nextResults = await searchCommunityGifProvider(gifQuery.trim(), 8)
        if (!cancelled) setGifResults(nextResults)
      } finally {
        if (!cancelled) setGifLoading(false)
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [disabled, gifQuery, isEnabled])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !isEnabled}
          className="rounded-full"
        >
          <Film className="mr-1.5 size-4" />
          GIF
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] rounded-2xl border-border/70 p-3">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            {txa('GIF Seç')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {txa('Yazına tek bir GIF ekleyebilirsin.')}
          </p>
        </div>

        {!isEnabled ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/25 px-3 py-3 text-xs text-muted-foreground">
            {txa('GIF özelliği şu an kapalı.')}
          </div>
        ) : !isCommunityGifProviderConfigured() ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/25 px-3 py-3 text-xs text-muted-foreground">
            {txa('Tenor anahtarı tanımlı değil. GIF seçici hazır ama sağlayıcı beklemede.')}
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={gifQuery}
              disabled={disabled}
              placeholder={txa('Ornek: reaction, anime, laughing...')}
              onChange={(event) => setGifQuery(event.target.value)}
            />

            {selectedGif ? (
              <div className="rounded-[20px] border border-primary/20 bg-primary/8 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{txa('Seçili GIF')}</p>
                    <p className="text-xs text-muted-foreground">{selectedGif.providerAssetId}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={onClear}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <img
                  loading="lazy"
                  decoding="async"
                  src={selectedGif.previewUrl}
                  alt={selectedGif.altText || txa('Seçili GIF')}
                  className="h-32 w-full rounded-2xl object-cover"
                />
              </div>
            ) : null}

            {gifQuery.trim().length < 2 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/25 px-3 py-3 text-xs text-muted-foreground">
                {txa('En az 2 karakter yazarak GIF arayabilirsin.')}
              </div>
            ) : gifLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 text-xs text-muted-foreground dark:bg-background/55">
                <Loader2 className="size-3.5 animate-spin" />
                {txa('GIF önerileri getiriliyor...')}
              </div>
            ) : gifResults.length > 0 ? (
              <div className="grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {gifResults.map((gif) => (
                  <button
                    key={gif.providerAssetId}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(gif)}
                    className="overflow-hidden rounded-[18px] border border-border/60 bg-background/90 transition-colors hover:border-primary/25 hover:bg-accent/50 dark:border-white/10 dark:bg-background/50"
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={gif.previewUrl}
                      alt={gif.altText || txa('GIF sonucu')}
                      className="h-28 w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/25 px-3 py-3 text-xs text-muted-foreground">
                {txa('GIF sonucu bulunamadı.')}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default CommunityGifPicker
