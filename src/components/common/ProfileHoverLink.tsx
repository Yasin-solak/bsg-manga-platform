import { Link } from '@/i18n/router'
import { buildPublicFansubPath, resolvePublicFansubKey } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { FansubHoverCard, UserHoverCard } from './UserHoverCard'

interface ProfileHoverLinkProps {
  username: string
  userId?: string
  displayName?: string
  avatar?: string
  bio?: string
  followerCount?: number
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  className?: string
  hoverClassName?: string
  sideOffset?: number
  onClick?: () => void
  children?: React.ReactNode
}

interface FansubProfileHoverLinkProps {
  fansubId?: string
  fansubSlug?: string
  name: string
  avatar?: string
  description?: string
  mangaCount?: number
  followerCount?: number
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  className?: string
  hoverClassName?: string
  sideOffset?: number
  onClick?: () => void
  children?: React.ReactNode
}

function ProfileHoverLink({
  username,
  userId,
  displayName,
  avatar,
  bio,
  followerCount,
  frameType,
  primaryColor,
  secondaryColor,
  profileBackgroundStyle,
  profileBackgroundVideoUrl,
  profilePatternStyle,
  className,
  hoverClassName,
  sideOffset = 8,
  onClick,
  children,
}: ProfileHoverLinkProps) {
  const normalizedUsername = (username || '').trim()
  if (!normalizedUsername) return null

  const fallbackAvatar = avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normalizedUsername)}`

  return (
    <UserHoverCard
      id={userId}
      username={normalizedUsername}
      displayName={displayName}
      avatar={fallbackAvatar}
      bio={bio}
      followerCount={followerCount}
      frameType={frameType}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      profileBackgroundStyle={profileBackgroundStyle}
      profileBackgroundVideoUrl={profileBackgroundVideoUrl}
      profilePatternStyle={profilePatternStyle}
      className={hoverClassName}
      sideOffset={sideOffset}
    >
      <Link
        to={`/profil/${encodeURIComponent(normalizedUsername)}`}
        className={cn(className)}
        onClick={onClick}
      >
        {children ?? `@${normalizedUsername}`}
      </Link>
    </UserHoverCard>
  )
}

function FansubProfileHoverLink({
  fansubId,
  fansubSlug,
  name,
  avatar,
  description,
  mangaCount,
  followerCount,
  frameType,
  primaryColor,
  secondaryColor,
  profileBackgroundStyle,
  profileBackgroundVideoUrl,
  profilePatternStyle,
  className,
  hoverClassName,
  sideOffset = 8,
  onClick,
  children,
}: FansubProfileHoverLinkProps) {
  const resolvedRouteId = resolvePublicFansubKey({ id: fansubId, slug: fansubSlug })
  const resolvedName = (name || '').trim()
  if (!resolvedName || !resolvedRouteId) return null
  const fansubHref = buildPublicFansubPath({ id: fansubId, slug: fansubSlug })

  const fallbackAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(resolvedName)}`

  return (
    <FansubHoverCard
      id={fansubId}
      slug={fansubSlug}
      name={resolvedName}
      avatar={fallbackAvatar}
      description={description}
      mangaCount={mangaCount}
      followerCount={followerCount}
      frameType={frameType}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      profileBackgroundStyle={profileBackgroundStyle}
      profileBackgroundVideoUrl={profileBackgroundVideoUrl}
      profilePatternStyle={profilePatternStyle}
      className={hoverClassName}
      sideOffset={sideOffset}
    >
      <Link
        to={fansubHref}
        className={cn(className)}
        onClick={onClick}
      >
        {children ?? resolvedName}
      </Link>
    </FansubHoverCard>
  )
}

export { FansubProfileHoverLink, ProfileHoverLink }
