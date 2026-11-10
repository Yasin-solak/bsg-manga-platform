import Skeleton from './Skeleton'

export interface TableSkeletonProps {
    rows?: number
    cols?: number
    hasAvatar?: boolean
}

/**
 * Table/list loading skeleton; for the admin user list etc.
 */
function TableSkeleton({ rows = 5, cols = 4, hasAvatar = true }: TableSkeletonProps) {
    return (
        <div className="table-skeleton">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="skeleton-row">
                    {hasAvatar && <Skeleton className="skeleton-cell-avatar" />}
                    {Array.from({ length: cols }, (_, j) => (
                        <Skeleton key={j} className="skeleton-cell" />
                    ))}
                </div>
            ))}
        </div>
    )
}

export default TableSkeleton
