import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  buildFansubSupporterEmojiToken,
  buildFansubSupporterStickerToken,
} from '@/lib/fansubSupporterAssetTokens'
import type {
  FansubSupporterAssetCatalogItem,
  FansubSupporterAssetViewerBundle,
} from '@/services/fansubSupporterAssetService'
import FansubSupporterAssetMedia from './FansubSupporterAssetMedia'
import { txa } from '@/i18n/activeLocale'

interface FansubSupporterAssetPickerProps {
  assets: FansubSupporterAssetCatalogItem[]
  bundle: FansubSupporterAssetViewerBundle | null
  disabled?: boolean
  onSelect: (token: string) => void
}

export function FansubSupporterAssetPicker({
  assets,
  bundle,
  disabled = false,
  onSelect,
}: FansubSupporterAssetPickerProps) {
  const emojiAssets = assets.filter((asset) => asset.assetKind === 'emoji' && asset.isUsable)
  const stickerAssets = assets.filter((asset) => asset.assetKind === 'sticker' && asset.isUsable)
  const canUseEmojis = bundle?.canUseSupporterEmojis === true && emojiAssets.length > 0
  const canUseStickers = bundle?.canUseSupporterStickers === true && stickerAssets.length > 0
  const hasAnyAsset = canUseEmojis || canUseStickers

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !hasAnyAsset}
          className="rounded-full"
          data-testid="fansub-supporter-asset-picker-trigger"
        >
          <Sparkles className="mr-1.5 size-4" />
          {txa('Fansub ifadesi')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px] rounded-2xl border-border/70 p-3"
        data-testid="fansub-supporter-asset-picker"
      >
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            {txa('Destekçi seti')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {txa('Yalnız aktif destekçiler kullanabilir.')}
          </p>
        </div>

        <Tabs defaultValue={canUseEmojis ? 'emoji' : 'sticker'} className="space-y-3">
          <TabsList className="h-auto rounded-full p-1">
            <TabsTrigger value="emoji" className="rounded-full px-3" disabled={!canUseEmojis}>
              {txa('Emoji')}
            </TabsTrigger>
            <TabsTrigger value="sticker" className="rounded-full px-3" disabled={!canUseStickers}>
              {txa('Çıkartma')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emoji" className="mt-0">
            {canUseEmojis ? (
              <div className="grid grid-cols-5 gap-2">
                {emojiAssets.map((asset) => {
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className="flex h-12 items-center justify-center rounded-2xl border border-border/60 bg-background/90 p-1 transition-colors hover:border-primary/25 hover:bg-accent/50"
                      onClick={() => onSelect(buildFansubSupporterEmojiToken(asset.shortcode, asset.currentRevisionId))}
                      title={asset.label}
                      data-testid={`fansub-supporter-asset-emoji-${asset.shortcode}`}
                    >
                      <FansubSupporterAssetMedia
                        asset={asset}
                        className="h-9 w-9 rounded-xl bg-transparent"
                        imageClassName="object-cover"
                        fallbackClassName="text-[10px]"
                      />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                {txa('Bu fansub için kullanılabilir emoji yok.')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sticker" className="mt-0">
            {canUseStickers ? (
              <div className="grid grid-cols-3 gap-2">
                {stickerAssets.map((asset) => {
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className="space-y-2 rounded-2xl border border-border/60 bg-background/90 p-2 text-left transition-colors hover:border-primary/25 hover:bg-accent/50"
                      onClick={() => onSelect(buildFansubSupporterStickerToken(asset.shortcode, asset.currentRevisionId))}
                      data-testid={`fansub-supporter-asset-sticker-${asset.shortcode}`}
                    >
                      <FansubSupporterAssetMedia
                        asset={asset}
                        className="h-20 w-full rounded-xl border border-border/60 bg-muted/20"
                        imageClassName="object-contain"
                        fallbackClassName="text-muted-foreground"
                      />
                      <p className="truncate text-[11px] text-muted-foreground">{asset.label}</p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                {txa('Bu fansub için kullanılabilir çıkartma yok.')}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}

export default FansubSupporterAssetPicker
