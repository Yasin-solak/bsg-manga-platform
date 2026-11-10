import skeletonProfileUrl from './skeletoprofil.png'
import type { ProfileEffectManifest } from '@/data/storeProducts'
import { cn } from '@/lib/utils'
import { resolveSafeAssetUrl } from '@/services/assetUrlService'
import ProfileEffectManifestRenderer from './ProfileEffectManifestRenderer'

interface ProfileEffectSequenceLayersProps {
  active?: boolean
  manifest?: ProfileEffectManifest | null
  posterAssetUrl?: string | null
  layerClassName?: string
}

export function ProfileEffectSequenceLayers({
  active = false,
  manifest,
  posterAssetUrl,
  layerClassName,
}: ProfileEffectSequenceLayersProps) {
  const resolvedPosterAssetUrl = resolveSafeAssetUrl(posterAssetUrl)

  return (
    <>
      <img
        src={skeletonProfileUrl}
        alt=''
        className={cn('absolute inset-0 h-full w-full select-none object-cover', layerClassName)}
        draggable={false}
        data-profile-effect-layer='skeleton'
      />

      {(!active || !manifest) && resolvedPosterAssetUrl ? (
        <img
          key='custom-idle-overlay'
          src={resolvedPosterAssetUrl}
          alt=''
          className={cn('absolute inset-0 h-full w-full select-none object-cover', layerClassName)}
          draggable={false}
          data-profile-effect-layer='custom-idle-overlay'
        />
      ) : null}

      <ProfileEffectManifestRenderer
        manifest={manifest}
        active={active}
        layerClassName={layerClassName}
      />
    </>
  )
}
