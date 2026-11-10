import { useEffect, useState } from 'react'
import { BookOpen, Check, Loader2, Plus, Users } from 'lucide-react'
import { listFansubs } from '@/services/fansubService'
import { followFansub, unfollowFansub } from '@/services/userService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { cn } from '@/lib/utils'
import type { Fansub } from '@/types'
import { txa } from '@/i18n/activeLocale'

const onboardingFansubsLogger = createScopedLogger('onboarding/fansubsStep')

type OnboardingFansubsStepProps = {
    userId: string
    disabled?: boolean
    e2eMock?: boolean
    onFollowedCountChange?: (count: number) => void
}

const SUGGESTED_LIMIT = 9

function formatCompact(value?: number) {
    const n = value || 0
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
    return String(n)
}

function buildInitials(name: string) {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join('') || 'FS'
    )
}

function FansubAvatar({ fansub }: { fansub: Fansub }) {
    if (fansub.avatar) {
        return (
            <img
                src={fansub.avatar}
                alt={fansub.name}
                loading="lazy"
                decoding="async"
                className="size-12 shrink-0 rounded-full border border-border/70 object-cover"
            />
        )
    }
    return (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-sm font-black text-primary">
            {buildInitials(fansub.name)}
        </span>
    )
}

export default function OnboardingFansubsStep({
    userId,
    disabled,
    e2eMock,
    onFollowedCountChange,
}: OnboardingFansubsStepProps) {
    const [fansubs, setFansubs] = useState<Fansub[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [followed, setFollowed] = useState<Set<string>>(new Set())
    const [pending, setPending] = useState<Set<string>>(new Set())

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)

        listFansubs()
            .then((res) => {
                if (cancelled) return
                setFansubs((res?.data || []).slice(0, SUGGESTED_LIMIT))
            })
            .catch((err) => {
                if (!cancelled) setError(toAppErrorMessage(err, txa('Fansublar yüklenemedi.')))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        onFollowedCountChange?.(followed.size)
    }, [followed, onFollowedCountChange])

    const toggleFollow = async (fansub: Fansub) => {
        if (disabled || pending.has(fansub.id)) return
        const wasFollowing = followed.has(fansub.id)

        setFollowed((prev) => {
            const next = new Set(prev)
            if (wasFollowing) next.delete(fansub.id)
            else next.add(fansub.id)
            return next
        })

        if (e2eMock) return

        setPending((prev) => new Set(prev).add(fansub.id))
        try {
            if (wasFollowing) await unfollowFansub(userId, fansub.id)
            else await followFansub(userId, fansub.id)
        } catch (err) {
            setFollowed((prev) => {
                const next = new Set(prev)
                if (wasFollowing) next.add(fansub.id)
                else next.delete(fansub.id)
                return next
            })
            onboardingFansubsLogger.warn({
                event: 'onboarding-fansub-follow-failed',
                message: 'Onboarding fansub takip islemi basarisiz oldu.',
                error: err,
            })
            toast.error(toAppErrorMessage(err, txa('Takip işlemi başarısız oldu.')))
        } finally {
            setPending((prev) => {
                const next = new Set(prev)
                next.delete(fansub.id)
                return next
            })
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {txa('Onerilen ekipler yukleniyor...')}
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
            </div>
        )
    }

    if (fansubs.length === 0) {
        return (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border/60 px-5 text-center">
                <p className="text-sm text-muted-foreground">{txa('Şu an önerilecek ekip yok; Keşfet\'ten dilediğinde takip edebilirsin.')}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {fansubs.map((fansub) => {
                    const isFollowing = followed.has(fansub.id)
                    const isPending = pending.has(fansub.id)
                    return (
                        <article
                            key={fansub.id}
                            className={cn(
                                'flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors',
                                isFollowing ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/70 bg-background/70',
                            )}
                        >
                            <FansubAvatar fansub={fansub} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-foreground">{fansub.name}</p>
                                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <Users className="size-3" />
                                        {formatCompact(fansub.followerCount)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <BookOpen className="size-3" />
                                        {txa('{v1} seri', { v1: formatCompact(fansub.mangaCount) })}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={disabled || isPending}
                                aria-pressed={isFollowing}
                                onClick={() => void toggleFollow(fansub)}
                                className={cn(
                                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors disabled:opacity-70',
                                    isFollowing
                                        ? 'border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                                )}
                            >
                                {isPending ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : isFollowing ? (
                                    <>
                                        <Check className="size-3.5" />
                                        {txa('Takipte')}
                                    </>
                                ) : (
                                    <>
                                        <Plus className="size-3.5" />
                                        {txa('Takip et')}
                                    </>
                                )}
                            </button>
                        </article>
                    )
                })}
            </div>
            <p className="text-xs text-muted-foreground">
                {followed.size > 0
                    ? txa('{count} ekip takip ediliyor. Diledigin zaman degistirebilirsin.', { count: followed.size })
                    : txa('Birkaç ekip takip et; ana akışın ve bildirimler bu ekiplerin yayınlarıyla canlanır.')}
            </p>
        </div>
    )
}
