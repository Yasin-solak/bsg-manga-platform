import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Same layout as CommunityCard (h-[260px]); shown while loading.
 * Uses shadcn/ui Skeleton + Card components.
 */
function CommunityCardSkeleton() {
    return (
        <Card className="relative h-[260px] overflow-hidden border border-border/60 py-0 gap-0">
            {/* Üst bant — badge iskeletleri */}
            <div className="flex items-center justify-between px-3.5 pt-3.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-14 rounded-full" />
            </div>

            {/* Esnek boşluk */}
            <div className="flex-1" />

            {/* Alt içerik */}
            <div className="space-y-2.5 px-3.5 pb-2.5">
                {/* Avatar + isim */}
                <div className="flex items-center gap-2.5">
                    <Skeleton className="size-[38px] shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-24 rounded" />
                </div>
                {/* Başlık */}
                <div className="space-y-1.5">
                    <Skeleton className="h-4 w-full rounded" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                </div>
                {/* Etiketler */}
                <div className="flex gap-2">
                    <Skeleton className="h-3 w-12 rounded" />
                    <Skeleton className="h-3 w-10 rounded" />
                </div>
            </div>

            {/* İstatistik barı */}
            <div className="flex items-center gap-3.5 border-t border-border/40 bg-muted/40 px-3.5 py-2">
                <Skeleton className="h-3.5 w-10 rounded" />
                <Skeleton className="h-3 w-px bg-border" />
                <Skeleton className="h-3.5 w-10 rounded" />
            </div>
        </Card>
    )
}

export default CommunityCardSkeleton
