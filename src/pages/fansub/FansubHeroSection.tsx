import type { FrameType } from '@components/common/AvatarFrame'
import type { CSSProperties } from 'react'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import type { ExtendedFansub, FansubDisplayedBadge, FansubOwnedBackground } from './types'
import FansubIdentityCard from './FansubIdentityCard'

type FansubHeroSectionProps = {
  canManage: boolean
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  effectiveBg: FansubOwnedBackground | null
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  effectiveFrame: FrameType
  followersCount: number
  fansub: ExtendedFansub
  fansubHeaderNameClassName?: string
  fansubHeaderNameInlineStyle?: CSSProperties
  isFollowing: boolean
  manageHref?: string
  membersCount: number
  onEdit?: () => void
  onFollowToggle?: () => void
  onDonate?: () => void
  isBoostEnabled?: boolean
  boostSnapshot?: FansubBoostSnapshot | null
  ownedBadges: FansubDisplayedBadge[]
}

export default function FansubHeroSection(props: FansubHeroSectionProps) {
  return (
    <FansubIdentityCard
      {...props}
      backgroundPlaybackMode={props.effectiveBg?.videoUrl ? 'always' : 'static'}
    />
  )
}
