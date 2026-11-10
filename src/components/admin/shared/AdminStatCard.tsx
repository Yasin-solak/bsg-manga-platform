import type { ReactNode } from 'react'
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface AdminStatCardProps {
    label: string
    value: string | number
    /** Trend percentage: positive = green, negative = red */
    trend?: number
    trendLabel?: string
    icon?: ReactNode
    /** Navigation for a clickable card */
    onClick?: () => void
    className?: string
}

/**
 * AdminStatCard: ShadcnUIKit style stat card.
 *
 * Structure: small gray label on top, large value in the middle,
 * trend badge at top right (+6.1% green / -1.2% red).
 */
export function AdminStatCard({
    label,
    value,
    trend,
    trendLabel,
    icon,
    onClick,
    className,
}: AdminStatCardProps) {
    const isPositive = trend !== undefined && trend >= 0

    return (
        <div
            className={cn(
                'rounded-xl border border-border bg-card p-4 shadow-sm',
                onClick && 'cursor-pointer transition-shadow hover:shadow-md',
                className,
            )}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                {trend !== undefined && (
                    <span
                        className={cn(
                            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                            isPositive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400',
                        )}
                    >
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPositive ? '+' : ''}{trend}%
                    </span>
                )}
                {!trend && icon && (
                    <div className="text-muted-foreground">{icon}</div>
                )}
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            {trendLabel && (
                <p className="mt-1 text-xs text-muted-foreground">{trendLabel}</p>
            )}
            {onClick && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    {txa('Detay')}{' '}<ArrowUpRight className="h-3 w-3" />
                </p>
            )}
        </div>
    )
}
