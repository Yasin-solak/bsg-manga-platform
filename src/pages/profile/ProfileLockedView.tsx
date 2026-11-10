import { CheckCircle, Clock, LockSimple, UserPlus } from '@phosphor-icons/react'
import { AvatarFrame } from '@components/common/AvatarFrame'
import { cn } from '@/lib/utils'
import { profileStageVars, type ProfileTheme } from '@/lib/profileTheme'
import { ProfileThemeBackdrop } from './ProfileThemeBackdrop'
import type { MockUser } from './types'
import { txa } from '@/i18n/activeLocale'

/*
 * Private account lock screen: same background as the profile scene (owner's theme), an identity card in the center.
 * Follow state has three values: Follow -> Request sent (can be undone) -> Following. When the request is approved
 * the profile opens by itself (the relation refreshes).
 */

type ProfileLockedViewProps = {
  currentUserExists: boolean
  isFollowing: boolean
  isRequested: boolean
  followBusy: boolean
  onFollowToggle: () => void
  profilePrivacyGateMessage: string
  theme: ProfileTheme | null
  followersCount: number | null
  followingCount: number | null
  user: MockUser
}

export default function ProfileLockedView({
  currentUserExists,
  isFollowing,
  isRequested,
  followBusy,
  onFollowToggle,
  profilePrivacyGateMessage,
  theme,
  followersCount,
  followingCount,
  user,
}: ProfileLockedViewProps) {
  const name = user.displayName || user.username
  const followLabel = isFollowing ? txa('Takipte') : isRequested ? txa('İstek gönderildi') : txa('Takip isteği gönder')
  const FollowIcon = isFollowing ? CheckCircle : isRequested ? Clock : UserPlus

  return (
    <section
      className='relative flex min-h-[calc(100svh-5rem)] items-center justify-center rounded-2xl border border-[var(--profile-surface-border)] px-4 py-10 lg:min-h-[calc(100svh-1.5rem)]'
      style={profileStageVars(theme)}
      data-testid='profile-locked-view'
    >
      <ProfileThemeBackdrop theme={theme} />
      <div className='dark relative w-full max-w-[380px] rounded-2xl border border-[var(--profile-surface-border)] bg-[var(--profile-surface)] p-6 text-center text-foreground shadow-[0_30px_90px_-30px_rgb(0_0_0/0.8)] backdrop-blur-xl'>
        <div className='mx-auto w-fit'>
          <AvatarFrame src={user.avatar} alt={name} frameType={user.frameType} size={104} animated />
        </div>
        <h1 className='mt-4 text-[22px] font-black tracking-tight'>{name}</h1>
        <p className='mt-0.5 text-[13px] text-white/60'>@{user.username}</p>

        {(followersCount !== null || followingCount !== null) && (
          <div className='mt-4 flex justify-center gap-6 text-[13px] text-white/70'>
            <span><b className='font-black text-white'>{followersCount ?? 0}</b> {txa('takipçi')}</span>
            <span><b className='font-black text-white'>{followingCount ?? 0}</b>{' '}{txa('takip')}</span>
          </div>
        )}

        <div className='mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-left'>
          <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10'>
            <LockSimple weight='bold' size={16} />
          </span>
          <div className='min-w-0'>
            <p className='text-[13px] font-bold'>{txa('Bu hesap gizli')}</p>
            <p className='mt-0.5 text-[12px] leading-5 text-white/65'>
              {isRequested ? txa('Takip isteğin gönderildi. Onaylanınca profil burada açılır.') : profilePrivacyGateMessage}
            </p>
          </div>
        </div>

        {currentUserExists && (
          <button
            type='button'
            onClick={onFollowToggle}
            disabled={followBusy}
            className={cn(
              'mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-black transition-colors disabled:opacity-60',
              isFollowing || isRequested
                ? 'border border-white/15 bg-white/10 text-white hover:bg-white/15'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
            data-testid='profile-locked-follow'
          >
            <FollowIcon weight='bold' size={16} />
            {followLabel}
          </button>
        )}
        {isRequested && <p className='mt-2 text-[11.5px] text-white/50'>{txa('Vazgeçersen butona tekrar basıp isteği geri alabilirsin.')}</p>}
      </div>
    </section>
  )
}
