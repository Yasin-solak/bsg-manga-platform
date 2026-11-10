/**
 * BadgeDisplay component
 * Shows badges on user and fansub profiles
 *
 * Usage:
 * <BadgeDisplay badges={badges} size="md" />
 */

import { useState } from 'react'
import type { Badge, UserBadge, FansubBadge, BadgeRarity } from '@/services/badgeService'
import { BADGE_RARITY_COLORS } from '@/services/badgeService'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/*
   =============================================
   TYPE DEFINITIONS
   =============================================
*/

interface BadgeDisplayProps {
    badges: (UserBadge | FansubBadge)[]
    size?: 'sm' | 'md' | 'lg'
    maxDisplay?: number
    showTooltip?: boolean
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    className?: string
}

interface SingleBadgeProps {
    badge: Badge
    size?: 'sm' | 'md' | 'lg'
    showTooltip?: boolean
}

/*
   =============================================
   HELPER FUNCTIONS
   =============================================
*/

const getSizePixels = (size: 'sm' | 'md' | 'lg'): number => {
    switch (size) {
        case 'sm': return 28
        case 'md': return 40
        case 'lg': return 56
        default: return 40
    }
}

const getRarityGlow = (rarity: BadgeRarity): string => {
    const colors = BADGE_RARITY_COLORS[rarity]
    return `0 0 8px ${colors.border}`
}

/* Tailwind border classes by size variant */
const sizeBorderCls = { sm: 'border-[1.5px]', md: 'border-2', lg: 'border-[3px]' } as const
const dotSizeCls = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-2.5 w-2.5' } as const

/* Position mapping */
const positionCls = {
    'bottom-right': 'bottom-3 right-3',
    'bottom-left': 'bottom-3 left-3',
    'top-right': 'top-3 right-3',
    'top-left': 'top-3 left-3',
} as const

/* =============================================
   SINGLE BADGE COMPONENT
   ============================================= */

export function SingleBadge({ badge, size = 'md', showTooltip = true }: SingleBadgeProps) {
    const [tooltipVisible, setTooltipVisible] = useState(false)
    const sizePixels = getSizePixels(size)
    const rarityColors = BADGE_RARITY_COLORS[badge.rarity]

    return (
        <div
            className={cn(
                'relative flex items-center justify-center rounded-full bg-card cursor-pointer overflow-hidden transition-transform hover:scale-110 hover:z-10',
                sizeBorderCls[size],
            )}
            style={{
                width: sizePixels,
                height: sizePixels,
                borderColor: rarityColors.border,
                boxShadow: getRarityGlow(badge.rarity),
            }}
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
        >
            <img loading="lazy" decoding="async"
                src={badge.image_url}
                alt={txa(badge.name)}
                className="h-full w-full object-contain p-0.5"
            />

            {/* Nadirlik göstergesi */}
            <span
                className={cn('absolute -bottom-0.5 -right-0.5 rounded-full border border-card', dotSizeCls[size])}
                style={{ backgroundColor: rarityColors.border }}
            />

            {/* Tooltip */}
            {showTooltip && tooltipVisible && (
                <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-3 py-2 text-xs shadow-lg pointer-events-none border border-border">
                    <strong className="block text-sm text-popover-foreground mb-0.5">{txa(badge.name)}</strong>
                    {badge.description && <p className="mb-1 text-muted-foreground text-xs">{txa(badge.description)}</p>}
                    <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: rarityColors.text }}
                    >
                        {badge.rarity.toUpperCase()}
                    </span>
                    {/* Ok işareti */}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-popover" />
                </div>
            )}
        </div>
    )
}

/* =============================================
   BADGE DISPLAY COMPONENT
   ============================================= */

export function BadgeDisplay({
    badges,
    size = 'md',
    maxDisplay = 3,
    showTooltip = true,
    position = 'bottom-right',
    className = '',
}: BadgeDisplayProps) {
    /* Take only badges to show (is_displayed = true) */
    const displayedBadges = badges
        .filter((b) => b.is_displayed && b.badge)
        .sort((a, b) => a.display_order - b.display_order)
        .slice(0, maxDisplay)

    if (displayedBadges.length === 0) return null

    return (
        <div className={cn('absolute z-[5] flex gap-1.5', positionCls[position], className)}>
            {displayedBadges.map((userBadge) => (
                <SingleBadge
                    key={userBadge.id}
                    badge={userBadge.badge!}
                    size={size}
                    showTooltip={showTooltip}
                />
            ))}
        </div>
    )
}

/* =============================================
   BADGE LIST FOR INVENTORY
   ============================================= */

interface BadgeListProps {
    badges: (UserBadge | FansubBadge)[]
    selectedIds?: string[]
    onSelect?: (badgeId: string) => void
    maxSelect?: number
}

export function BadgeList({
    badges,
    selectedIds = [],
    onSelect,
    maxSelect = 3,
}: BadgeListProps) {
    const handleToggle = (badgeId: string) => {
        if (!onSelect) return
        if (selectedIds.includes(badgeId)) {
            onSelect(badgeId)
        } else if (selectedIds.length < maxSelect) {
            onSelect(badgeId)
        }
    }

    if (badges.length === 0) {
        return (
            <div className="py-8 text-center text-muted-foreground">
                <span className="mb-3 block text-5xl">🏅</span>
                {txa('Henüz rozet bulunmuyor.')}
            </div>
        )
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-3">
            {badges.map((userBadge) => {
                if (!userBadge.badge) return null

                const isSelected = selectedIds.includes(userBadge.badge_id)
                const canSelect = selectedIds.length < maxSelect || isSelected

                return (
                    <div
                        key={userBadge.id}
                        className={cn(
                            'relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all',
                            isSelected
                                ? 'border-primary bg-primary/10 shadow-md'
                                : 'border-border bg-card hover:bg-accent',
                            !canSelect && 'cursor-not-allowed opacity-50',
                        )}
                        onClick={() => canSelect && handleToggle(userBadge.badge_id)}
                    >
                        <SingleBadge badge={userBadge.badge} size="lg" showTooltip={false} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm font-bold text-foreground">{userBadge.badge.name}</span>
                            <span
                                className="text-xs font-medium uppercase"
                                style={{ color: BADGE_RARITY_COLORS[userBadge.badge.rarity].text }}
                            >
                                {userBadge.badge.rarity}
                            </span>
                        </div>
                        {isSelected && (
                            <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-primary text-xs font-bold text-primary-foreground">
                                {selectedIds.indexOf(userBadge.badge_id) + 1}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default BadgeDisplay
