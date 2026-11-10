import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'

export interface MangaHoverCardProps {
  children: ReactNode
  id?: string
  slug?: string
  title: string
  coverImage?: string
  description?: string
  status?: string
  followerCount?: number
  viewCount?: number
  className?: string
  enableAutoHydration?: boolean
  sideOffset?: number
  openDelayMs?: number
  closeDelayMs?: number
}

function MangaHoverCard({
  children,
  className,
  title,
  coverImage,
}: MangaHoverCardProps) {
  const resolvedCover = optimizePublicImageUrl(coverImage)
    || coverImage
    || buildCoverPlaceholder(title)

  return (
    <span
      className={cn('inline-block', className)}
      data-manga-hover-disabled="true"
      data-manga-hover-cover-ready={resolvedCover ? 'true' : 'false'}
    >
      {/* Hover dili tum yuzeylerde ortak standarda oturana kadar bilincli olarak kapali. */}
      {children}
    </span>
  )
}

export { MangaHoverCard }
