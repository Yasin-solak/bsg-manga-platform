import type { CSSProperties } from 'react'
import { Sticker } from 'lucide-react'
import {
  buildFansubSupporterAssetTransformStyle,
  normalizeFansubSupporterAssetPresentation,
} from '@/lib/fansubSupporterAssetPresentation'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import { cn } from '@/lib/utils'

interface FansubSupporterAssetMediaProps {
  asset: Pick<FansubSupporterAssetCatalogItem, 'assetKind' | 'assetRef' | 'label' | 'presentation'>
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  style?: CSSProperties
}

export function FansubSupporterAssetMedia({
  asset,
  className,
  imageClassName,
  fallbackClassName,
  style,
}: FansubSupporterAssetMediaProps) {
  const previewUrl = resolveStoreAssetUrl(asset.assetRef)
  const presentation = normalizeFansubSupporterAssetPresentation(asset.presentation, asset.assetKind)

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted/20',
        asset.assetKind === 'emoji' ? 'rounded-xl' : 'rounded-2xl',
        className,
      )}
      style={style}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={asset.label}
          className={cn('absolute inset-0 h-full w-full', imageClassName)}
          style={buildFansubSupporterAssetTransformStyle(presentation)}
        />
      ) : (
        <div className={cn('flex h-full w-full items-center justify-center text-muted-foreground', fallbackClassName)}>
          <Sticker className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

export default FansubSupporterAssetMedia

