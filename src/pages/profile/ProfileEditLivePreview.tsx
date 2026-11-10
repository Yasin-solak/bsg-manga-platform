import type { CSSProperties, ReactNode } from 'react'

import type { FrameType } from '@components/common/AvatarFrame'
import type { HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { cn } from '@/lib/utils'
import ProfileIdentityShowcase from './ProfileIdentityShowcase'
import type { MockUser, OwnedBackground, ProfileOwnedBadge } from './types'
import { txa } from '@/i18n/activeLocale'

const PREVIEW_SOURCE_WIDTH_PX = 360
const PREVIEW_SOURCE_HEIGHT_PX = 640
const PREVIEW_SCALE = 0.92
const PREVIEW_WIDTH_PX = Math.round(PREVIEW_SOURCE_WIDTH_PX * PREVIEW_SCALE)
const PREVIEW_HEIGHT_PX = Math.round(PREVIEW_SOURCE_HEIGHT_PX * PREVIEW_SCALE)

type ProfileEditLivePreviewProps = {
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  /** Onizleme uzerine bindirilen aksiyon butonlari (avatar / arka plan degistir). */
  actionSlot?: ReactNode
  className?: string
  effectiveBg?: OwnedBackground | null
  effectiveCustomFrameUrl?: string
  effectiveFrame: FrameType
  effectivePosterFrameUrl?: string
  ownedBadges: ProfileOwnedBadge[]
  profileHeaderNameClassName?: string
  profileHeaderNameInlineStyle?: CSSProperties
  themeColors?: HoverCardThemeColors | null
  user: MockUser
}

export default function ProfileEditLivePreview({
  activeProfileEffectAssets,
  actionSlot,
  className,
  effectiveBg,
  effectiveCustomFrameUrl,
  effectiveFrame,
  effectivePosterFrameUrl,
  ownedBadges,
  profileHeaderNameClassName,
  profileHeaderNameInlineStyle,
  themeColors = null,
  user,
}: ProfileEditLivePreviewProps) {
  return (
    <aside
      data-profile-edit-live-preview
      className={cn('hidden min-h-0 flex-col border-l border-border/40 bg-muted/10 lg:flex', className)}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-4">
        <div className="relative" style={{ width: `${PREVIEW_WIDTH_PX}px` }}>
          <div
            className="overflow-hidden rounded-[18px] shadow-2xl"
            style={{ height: `${PREVIEW_HEIGHT_PX}px` }}
          >
            <div
              style={{
                height: `${PREVIEW_SOURCE_HEIGHT_PX}px`,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: 'top left',
                width: `${PREVIEW_SOURCE_WIDTH_PX}px`,
              }}
            >
              <ProfileIdentityShowcase
                activeProfileEffectAssets={activeProfileEffectAssets}
                canViewProfileStats={true}
                className="pointer-events-none"
                currentUserExists={true}
                effectiveBg={effectiveBg}
                effectiveCustomFrameUrl={effectiveCustomFrameUrl}
                effectivePosterFrameUrl={effectivePosterFrameUrl}
                effectiveFrame={effectiveFrame}
                isFollowing={false}
                isMutual={false}
                isOwnProfile={true}
                onEdit={() => undefined}
                onFollowersOpen={() => undefined}
                onFollowToggle={() => undefined}
                onFollowingOpen={() => undefined}
                ownedBadges={ownedBadges}
                profileHeaderNameClassName={profileHeaderNameClassName}
                profileHeaderNameInlineStyle={profileHeaderNameInlineStyle}
                themeColors={themeColors}
                user={user}
                variant="editor"
              />
            </div>
          </div>
          {actionSlot}
        </div>
        <p className="mt-3 shrink-0 text-center text-[10px] font-semibold text-muted-foreground/70">
          {txa('Profil sayfan ve hover kartın bu görünümü paylaşır.')}
        </p>
      </div>
    </aside>
  )
}
