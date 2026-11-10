import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface HomeSectionHeaderProps {
    eyebrow: string
    title: string
    description?: string
    icon?: ReactNode
    action?: ReactNode
    className?: string
}

export function HomeSectionHeader({
    eyebrow,
    title,
    description,
    icon,
    action,
    className,
}: HomeSectionHeaderProps) {
    return (
        <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
            <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary/90">
                    {icon}
                    <span>{eyebrow}</span>
                </div>
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
                    {description ? (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    ) : null}
                </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    )
}
