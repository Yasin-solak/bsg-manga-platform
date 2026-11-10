import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

type SkeletonVariant = 'cards' | 'table' | 'dashboard'

interface AdminSectionSkeletonProps {
    variant?: SkeletonVariant
    className?: string
}

function Bone({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function SkeletonHeader() {
    return (
        <div className="space-y-2">
            <Bone className="h-7 w-48" />
            <Bone className="h-4 w-72" />
        </div>
    )
}

function SkeletonFilterBar() {
    return (
        <div className="flex items-center gap-2">
            <Bone className="h-9 w-56 rounded-md" />
            <Bone className="h-8 w-20 rounded-md" />
            <Bone className="h-8 w-20 rounded-md" />
            <Bone className="h-8 w-20 rounded-md" />
        </div>
    )
}

function SkeletonStatCard() {
    return (
        <div className="min-h-32 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <Bone className="h-9 w-9 rounded-full" />
                <Bone className="h-7 w-7 rounded-md" />
            </div>
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-20" />
            <Bone className="h-3 w-28" />
        </div>
    )
}

function SkeletonTableRow() {
    return (
        <div className="flex items-center gap-4 py-3 px-4 border-b border-border">
            <Bone className="h-8 w-8 rounded-full" />
            <Bone className="h-4 w-36" />
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-16" />
            <Bone className="h-6 w-14 rounded-md" />
        </div>
    )
}

function SkeletonCard() {
    return (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
                <Bone className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                    <Bone className="h-4 w-28" />
                    <Bone className="h-3 w-44" />
                </div>
            </div>
            <Bone className="h-4 w-3/4" />
            <Bone className="h-3 w-1/2" />
        </div>
    )
}

export function AdminSectionSkeleton({ variant = 'cards', className }: AdminSectionSkeletonProps) {
    return (
        <div
            aria-busy="true"
            aria-label={txa('Bolum yukleniyor')}
            className={cn('space-y-6', className)}
            data-testid={variant === 'dashboard' ? 'dashboard-skeleton' : undefined}
        >
            <SkeletonHeader />

            {variant === 'dashboard' && (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
                    </div>
                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.82fr)_minmax(22rem,1fr)]">
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-card shadow-sm">
                                {Array.from({ length: 4 }).map((_, i) => <SkeletonTableRow key={i} />)}
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Bone className="h-72 rounded-xl" />
                                <Bone className="h-72 rounded-xl" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <Bone className="h-48 rounded-xl" />
                            <Bone className="h-40 rounded-xl" />
                            <Bone className="h-44 rounded-xl" />
                        </div>
                    </div>
                </>
            )}

            {variant === 'cards' && (
                <>
                    <SkeletonFilterBar />
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                </>
            )}

            {variant === 'table' && (
                <>
                    <SkeletonFilterBar />
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonTableRow key={i} />)}
                    </div>
                </>
            )}
        </div>
    )
}
