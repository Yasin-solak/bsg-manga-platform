/**
 * EventQuestsPanel: active seasonal events (entity + quests)
 *
 * Separate from the quest panel. Shows the event's title/theme/banner from the DB;
 * lists multiple events in separate cards; marks locked quests in chain
 * events. claimQuest uses the same engine.
 */
import { useCallback, useEffect, useState } from 'react'
import { claimQuest, groupActiveEvents, listActiveEvents, type ActiveEvent, type ActiveEventQuest } from '@/services/rewardService'
import { getEventTheme } from '@/lib/eventThemes'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { BookOpen, CheckCircle2, Clock, Coins, Gift, Loader2, Lock, MessageCircle, Sparkles, Star, Target } from 'lucide-react'
import { intlLocale, txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('EventQuestsPanel')

const METRIC_ICONS: Record<string, typeof BookOpen> = {
    chapters_read: BookOpen,
    rating_count: Star,
    total_comment_count: MessageCircle,
    manga_comment_count: MessageCircle,
}
function metricIcon(metricKey: string) {
    return METRIC_ICONS[metricKey] || Target
}

export function formatEventCountdown(msRemaining: number): string {
    if (msRemaining <= 0) return txa('Sona erdi')
    const totalMin = Math.floor(msRemaining / 60000)
    const days = Math.floor(totalMin / 1440)
    const hours = Math.floor((totalMin % 1440) / 60)
    const mins = totalMin % 60
    if (days > 0) return txa('{v1}g {v2}s kaldı', { v1: days, v2: hours })
    if (hours > 0) return txa('{v1}s {v2}dk kaldı', { v1: hours, v2: mins })
    return txa('{v1}dk kaldı', { v1: mins })
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString(intlLocale())
}
function progressPercent(value: number, target: number) {
    return Math.min(100, Math.round((value / Math.max(1, target)) * 100))
}

export function EventCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
        return () => window.clearInterval(timer)
    }, [])
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm', className)}>
            <Clock className="h-3 w-3" /> {formatEventCountdown(new Date(endsAt).getTime() - nowMs)}
        </span>
    )
}

interface EventQuestsPanelProps {
    currentUserId?: string
    onBalanceChange?: (nextBalance: number) => void
}

export default function EventQuestsPanel({ currentUserId, onBalanceChange }: EventQuestsPanelProps) {
    const [events, setEvents] = useState<ActiveEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [claimingId, setClaimingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentUserId) return
        setLoading(true)
        try {
            setEvents(groupActiveEvents(await listActiveEvents()))
        } catch (err) {
            logger.error({ event: 'load-active-events', message: 'Aktif etkinlikler yuklenemedi', error: err })
            toast.error(txa('Etkinlikler yüklenemedi.'))
        } finally {
            setLoading(false)
        }
    }, [currentUserId])

    useEffect(() => { void load() }, [load])

    const handleClaim = useCallback(async (quest: ActiveEventQuest) => {
        if (claimingId || !quest.isClaimable) return
        setClaimingId(quest.questId)
        try {
            const result = await claimQuest(quest.questId, 'user')
            if (result.success) {
                toast.success(txa('"{v1}" tamamlandı! +{v2} coin', { v1: result.questTitle, v2: formatNumber(result.coinReward) }))
                onBalanceChange?.(result.newBalance)
                await load()
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : txa('Ödül alınamadı.'))
        } finally {
            setClaimingId(null)
        }
    }, [claimingId, onBalanceChange, load])

    if (loading && events.length === 0) {
        return (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">{txa('Yukleniyor...')}</span>
            </div>
        )
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 opacity-40" />
                <p className="text-sm">{txa('Şu anda aktif bir etkinlik yok.')}</p>
                <p className="text-xs">{txa('Yeni sezon etkinliklerini kaçırma!')}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {events.map((event) => (
                <EventCard key={event.id} event={event} claimingId={claimingId} onClaim={handleClaim} />
            ))}
        </div>
    )
}

function EventCard({ event, claimingId, onClaim }: { event: ActiveEvent; claimingId: string | null; onClaim: (q: ActiveEventQuest) => void }) {
    const theme = getEventTheme(event.theme)
    const Icon = theme.icon
    const questTitleById = new Map(event.quests.map((q) => [q.questId, q.title]))

    return (
        <section className={cn('relative overflow-hidden rounded-2xl p-[1.5px] shadow-lg ring-1', theme.ring, 'bg-gradient-to-br', theme.gradient)}>
            <div className="overflow-hidden rounded-[15px] bg-card/95">
                {/* Baslik: banner varsa gorsel, yoksa gradient */}
                {event.banner ? (
                    // Banner: in a fixed 16:9 area (frame); NO name/icon, only counter + countdown.
                    <div className="relative aspect-video w-full overflow-hidden bg-muted">
                        <img src={event.banner} alt={event.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2.5">
                            <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">{event.claimedCount}/{event.quests.length}</span>
                            {event.endsAt && <EventCountdown endsAt={event.endsAt} />}
                        </div>
                    </div>
                ) : (
                    <div className={cn('relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-4', 'bg-gradient-to-r', theme.gradient)}>
                        <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
                        <div className="relative flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white shadow-inner backdrop-blur-sm">
                                <Icon className="h-6 w-6" />
                            </span>
                            <div className="min-w-0">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">
                                    <Sparkles className="h-3 w-3" />{' '}{txa('Sinirli sureli etkinlik')}
                                </p>
                                <h3 className="truncate text-base font-extrabold leading-tight text-white drop-shadow-sm">{event.title}</h3>
                            </div>
                        </div>
                        <div className="relative flex items-center gap-2">
                            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">{event.claimedCount}/{event.quests.length}</span>
                            {event.endsAt && <EventCountdown endsAt={event.endsAt} />}
                        </div>
                    </div>
                )}

                <div className="space-y-2.5 p-3.5">
                    {event.quests.map((quest) => {
                        const pct = progressPercent(quest.progressValue, quest.targetValue)
                        const MetricIcon = metricIcon(quest.metricKey)
                        const unlockTitle = quest.isLocked && quest.unlockRequiresQuestId ? questTitleById.get(quest.unlockRequiresQuestId) : null
                        return (
                            <div
                                key={quest.questId}
                                className={cn(
                                    'group relative overflow-hidden rounded-xl border p-3 transition-all',
                                    quest.isLocked ? 'border-border/40 bg-muted/30 opacity-70'
                                        : quest.isClaimed ? 'border-emerald-500/25 bg-emerald-500/5'
                                        : quest.isClaimable ? cn('border-transparent ring-1 hover:shadow-md bg-gradient-to-br', theme.ring, theme.soft)
                                        : 'border-border/50 bg-card hover:border-border',
                                )}
                            >
                                <div className="mb-2 flex items-start gap-2.5">
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm bg-gradient-to-br',
                                        quest.isLocked ? 'from-slate-400 to-slate-500' : quest.isClaimed ? 'from-emerald-400 to-emerald-600' : theme.gradient)}>
                                        {quest.isLocked ? <Lock className="h-[18px] w-[18px]" /> : quest.isClaimed ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <MetricIcon className="h-[18px] w-[18px]" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-foreground">{quest.title}</p>
                                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                                            {unlockTitle ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> {txa('Önce "{v1}" görevini tamamla', { v1: unlockTitle })}</span> : quest.description}
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className={cn('shrink-0 gap-1 border-0 text-[10px] font-bold', quest.isClaimed ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : cn('bg-white/70 dark:bg-black/20', theme.accent))}>
                                        <Coins className="h-2.5 w-2.5" /> +{formatNumber(quest.coinReward)}
                                    </Badge>
                                </div>
                                {!quest.isLocked ? (
                                    <div className="flex items-center gap-2.5">
                                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/5">
                                            <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700', quest.isClaimed ? 'bg-emerald-500' : theme.bar)} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                                            {formatNumber(quest.progressValue)}/{formatNumber(quest.targetValue)}
                                        </span>
                                        {quest.isClaimed ? (
                                            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> {txa('Alındı')}
                                            </span>
                                        ) : quest.isClaimable ? (
                                            <Button size="sm" className="h-7 gap-1 text-[11px] shadow-sm" disabled={claimingId === quest.questId} onClick={() => onClaim(quest)}>
                                                {claimingId === quest.questId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}{' '}{txa('Al')}
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
