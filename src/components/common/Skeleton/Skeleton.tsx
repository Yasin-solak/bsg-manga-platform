import { cn } from '@/lib/utils'

export interface SkeletonProps {
    className?: string
    width?: string | number
    height?: string | number
    borderRadius?: string | number
}

/**
 * Skeleton: placeholder with a shimmer animation
 * Wraps the shadcn/ui Skeleton, compatible with the existing API
 */
function Skeleton({ className = '', width, height, borderRadius }: SkeletonProps) {
    const style: React.CSSProperties = {}
    if (width != null) style.width = typeof width === 'number' ? `${width}px` : width
    if (height != null) style.height = typeof height === 'number' ? `${height}px` : height
    if (borderRadius != null) style.borderRadius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius

    return (
        <div
            className={cn('animate-pulse rounded-md bg-muted', className)}
            style={Object.keys(style).length ? style : undefined}
        />
    )
}

export default Skeleton
