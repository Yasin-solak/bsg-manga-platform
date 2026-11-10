import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { useMyMurekLook } from '@/hooks/useMyMurekLook'
import { cn } from '@/lib/utils'
import { DEFAULT_MUREK_LOOK, getUserMurekCached, type MurekLook } from '@/services/murekService'
import { Murek } from './Murek'
import { txa } from '@/i18n/activeLocale'

/*
 * The user's Mürek on the profile and hover card: at the banner's bottom right corner, standing on the card
 * content. On your own card a live look (changes instantly when equipped in the Closet) with a link to the
 * Closet; on someone else's card the color/accessory that user equipped. It cheers on hover.
 */

function useUserMurekLook(userId: string | null | undefined, enabled: boolean): MurekLook {
  const [look, setLook] = useState<MurekLook>(DEFAULT_MUREK_LOOK)
  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    void getUserMurekCached(userId).then((next) => { if (!cancelled) setLook(next) })
    return () => { cancelled = true }
  }, [enabled, userId])
  return enabled && userId ? look : DEFAULT_MUREK_LOOK
}

function murekBuddyLabel(look: MurekLook): string {
  const parts = [look.colorName, look.accessoryName].filter(Boolean)
  return parts.length > 0 ? txa('Mürek · {v1}', { v1: parts.join(' · ') }) : txa('Mürek')
}

export function UserMurekBuddy({ userId, isOwn = false, size = 46, interactive = true, className }: {
  userId: string | null | undefined
  isOwn?: boolean
  size?: number
  /** false: no link and hover reaction in previews. */
  interactive?: boolean
  className?: string
}) {
  const ownLook = useMyMurekLook(isOwn ? userId : null)
  const otherLook = useUserMurekLook(userId, !isOwn)
  const look = isOwn ? ownLook : otherLook
  const [hovered, setHovered] = useState(false)
  const label = isOwn && interactive ? txa('{v1} · Dolabı aç', { v1: murekBuddyLabel(look) }) : murekBuddyLabel(look)

  const body = (
    <Murek
      size={size}
      color={look.colorHex}
      accessory={look.accessory}
      animated={look.animated}
      mood={hovered ? 'happy' : 'idle'}
      motion={hovered ? 'jump' : 'bob'}
    />
  )

  const shared = {
    title: label,
    'aria-label': label,
    'data-testid': 'user-murek-buddy',
    onMouseEnter: interactive ? () => setHovered(true) : undefined,
    onMouseLeave: interactive ? () => setHovered(false) : undefined,
    className: cn('absolute z-20 block drop-shadow-[0_4px_10px_rgb(0_0_0/0.35)]', className),
  }

  if (isOwn && interactive) {
    return <Link to='/magaza/murek' {...shared}>{body}</Link>
  }
  return <span role='img' {...shared}>{body}</span>
}
