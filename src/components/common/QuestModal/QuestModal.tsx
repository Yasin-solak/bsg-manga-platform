/**
 * QuestModal: chain-based quest system modal (Premium Edition)
 *
 * Each task_group shows as a quest chain.
 * Steps in a chain are ordered by tier_level.
 * The next step opens after claiming.
 * Premium glassmorphism design, dark/light support,
 * metric-based "Go" navigation buttons.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { listUserRewardTasks, claimUserRewardTask, type UserRewardTaskProgress } from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Lock,
    CheckCircle2,
    Gift,
    Coins,
    Loader2,
    Trophy,
    ChevronRight,
    ArrowLeft,
    ExternalLink,
    Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    getChainRank,
    getChainTheme,
    METRIC_ROUTES,
    type QuestChainTheme,
} from './questModal.shared'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface QuestModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface QuestChain {
    groupKey: string
    theme: QuestChainTheme
    steps: UserRewardTaskProgress[]
    completedCount: number
    totalCount: number
    totalCoinReward: number
    earnedCoin: number
    activeStep: UserRewardTaskProgress | null
    isAllCompleted: boolean
    progressPct: number
}

export function QuestModal({ open, onOpenChange }: QuestModalProps) {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState<UserRewardTaskProgress[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [claimingId, setClaimingId] = useState<string | null>(null)
    const [selectedChain, setSelectedChain] = useState<string | null>(null)

    const loadTasks = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await listUserRewardTasks()
            setTasks(data)
        } catch (err) {
            setError(txa('Görevler yüklenemedi.'))
            console.error('[QuestModal]', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!open) return
        void loadTasks()
        setSelectedChain(null)
    }, [open, loadTasks])

    async function handleClaim(taskId: string) {
        setClaimingId(taskId)
        try {
            const result = await claimUserRewardTask(taskId)
            if (result.success) {
                toast.success(txa('"{v1}" ödülü alındı! +{v2} coin', { v1: result.taskTitle, v2: result.coinReward }))
                setTasks((prev) =>
                    prev.map((t) =>
                        t.taskId === taskId
                            ? { ...t, isClaimed: true, isClaimable: false, claimedAt: result.claimedAt }
                            : t,
                    ),
                )
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : txa('Ödül alınamadı.')
            toast.error(message)
        } finally {
            setClaimingId(null)
        }
    }

    // Navigation: close the modal and go to the page
    function handleNavigate(metricKey: string) {
        const route = METRIC_ROUTES[metricKey]
        if (!route) return
        onOpenChange(false)
        navigate(route.path)
    }

    // Zincirler
    const chains = useMemo((): QuestChain[] => {
        const groupMap = new Map<string, UserRewardTaskProgress[]>()
        for (const task of tasks) {
            const key = task.taskGroup || 'default'
            if (!groupMap.has(key)) groupMap.set(key, [])
            groupMap.get(key)!.push(task)
        }
        const result: QuestChain[] = []
        for (const [groupKey, steps] of groupMap) {
            const sorted = [...steps].sort((a, b) => {
                const tierDiff = (a.tierLevel ?? 1) - (b.tierLevel ?? 1)
                if (tierDiff !== 0) return tierDiff
                return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            })
            const completed = sorted.filter((s) => s.isClaimed)
            const totalCoin = sorted.reduce((s, t) => s + t.coinReward, 0)
            const earnedCoin = completed.reduce((s, t) => s + t.coinReward, 0)
            const activeStep = sorted.find((s) => !s.isClaimed && !s.isLocked) || null
            result.push({
                groupKey, theme: getChainTheme(groupKey), steps: sorted,
                completedCount: completed.length, totalCount: sorted.length,
                totalCoinReward: totalCoin, earnedCoin, activeStep,
                isAllCompleted: sorted.length > 0 && completed.length === sorted.length,
                progressPct: sorted.length > 0 ? Math.round((completed.length / sorted.length) * 100) : 0,
            })
        }
        return result.sort((a, b) => {
            if (a.isAllCompleted !== b.isAllCompleted) return a.isAllCompleted ? 1 : -1
            if (!!a.activeStep !== !!b.activeStep) return a.activeStep ? -1 : 1
            const rankDiff = getChainRank(a.groupKey) - getChainRank(b.groupKey)
            if (rankDiff !== 0) return rankDiff
            return a.theme.label.localeCompare(b.theme.label, 'tr')
        })
    }, [tasks])

    const summary = useMemo(() => ({
        completed: tasks.filter((t) => t.isClaimed).length,
        total: tasks.length,
        earned: tasks.filter((t) => t.isClaimed).reduce((s, t) => s + t.coinReward, 0),
        chains: chains.length,
        chainsCompleted: chains.filter((c) => c.isAllCompleted).length,
    }), [tasks, chains])

    const activeChainData = selectedChain ? chains.find((c) => c.groupKey === selectedChain) : null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden border-0 p-0 shadow-2xl sm:max-w-xl">
                {/* Premium Header */}
                <div className={cn(
                    'relative overflow-hidden border-b border-border/50 px-6 py-6',
                    selectedChain && activeChainData
                        ? `bg-gradient-to-br ${activeChainData.theme.headerGradient}`
                        : 'bg-gradient-to-br from-amber-500/10 via-primary/5 to-purple-500/10',
                )}>
                    {/* Dekoratif parlama */}
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-amber-500/10 to-transparent blur-2xl" />
                    <div className="absolute -left-4 bottom-0 h-24 w-24 rounded-full bg-gradient-to-tr from-primary/10 to-transparent blur-xl" />

                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
                            {selectedChain && activeChainData ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChain(null)}
                                        className="rounded-lg p-1.5 transition-colors hover:bg-foreground/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 text-foreground/70" />
                                    </button>
                                    {(() => { const Icon = activeChainData.theme.icon; return <Icon className={cn('h-5 w-5', activeChainData.theme.text)} /> })()}
                                    <span>{activeChainData.theme.label}</span>
                                </>
                            ) : (
                                <>
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                                        <Trophy className="h-4.5 w-4.5 text-amber-500" />
                                    </div>
                                    <span>{txa('Görevler')}</span>
                                    <Sparkles className="h-4 w-4 text-amber-400/60" />
                                </>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {/* Ozet (sadece ana liste) */}
                    {!selectedChain && (
                        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-card/70 px-3 py-2.5 text-center shadow-sm backdrop-blur-sm ring-1 ring-border/30">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{txa('Tamamlanan')}</p>
                                <p className="mt-0.5 text-base font-bold text-foreground">{summary.completed}<span className="text-xs font-normal text-muted-foreground">/{summary.total}</span></p>
                            </div>
                            <div className="rounded-xl bg-card/70 px-3 py-2.5 text-center shadow-sm backdrop-blur-sm ring-1 ring-border/30">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{txa('Kazanılan')}</p>
                                <p className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">{summary.earned.toLocaleString(intlLocale())}</p>
                            </div>
                            <div className="rounded-xl bg-card/70 px-3 py-2.5 text-center shadow-sm backdrop-blur-sm ring-1 ring-border/30">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{txa('Zincirler')}</p>
                                <p className="mt-0.5 text-base font-bold text-foreground">{summary.chainsCompleted}<span className="text-xs font-normal text-muted-foreground">/{summary.chains}</span></p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Icerik */}
                <div className="max-h-[55vh] overflow-y-auto bg-background/80 backdrop-blur-sm">
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">{txa('Görevler yükleniyor...')}</span>
                        </div>
                    )}

                    {error && (
                        <div className="px-6 py-10 text-center text-sm text-destructive">{error}</div>
                    )}

                    {!loading && !error && !selectedChain && (
                        <div className="space-y-2 p-4">
                            {chains.length === 0 && (
                                <p className="py-10 text-center text-sm text-muted-foreground">{txa('Henüz görev bulunmuyor.')}</p>
                            )}
                            {chains.map((chain) => (
                                <ChainCard key={chain.groupKey} chain={chain} onClick={() => setSelectedChain(chain.groupKey)} />
                            ))}
                        </div>
                    )}

                    {!loading && !error && selectedChain && activeChainData && (
                        <ChainDetail
                            chain={activeChainData}
                            claimingId={claimingId}
                            onClaim={handleClaim}
                            onNavigate={handleNavigate}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ============================
// Zincir karti - premium tasarim
// ============================
function ChainCard({ chain, onClick }: { chain: QuestChain; onClick: () => void }) {
    const Icon = chain.theme.icon

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                chain.isAllCompleted
                    ? 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-emerald-600/5 hover:shadow-lg hover:shadow-emerald-500/5'
                    : `${chain.theme.border} bg-gradient-to-r ${chain.theme.gradient} hover:shadow-lg hover:shadow-black/5`,
            )}
        >
            {/* Dekoratif glow (hover) */}
            <div className={cn(
                'absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
                chain.isAllCompleted ? 'bg-emerald-500/20' : chain.theme.progressBg + '/10',
            )} />

            {/* Zincir ikonu */}
            <div className={cn(
                'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1',
                chain.isAllCompleted
                    ? 'bg-emerald-500/10 ring-emerald-500/20'
                    : cn(chain.theme.bgBadge, 'ring-transparent'),
            )}>
                {chain.isAllCompleted ? (
                    <CheckCircle2 className="h-5.5 w-5.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                    <Icon className={cn('h-5.5 w-5.5', chain.theme.text)} />
                )}
            </div>

            {/* Bilgi */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground truncate">{chain.theme.label}</h4>
                    {chain.isAllCompleted && (
                        <Badge variant="secondary" className="gap-1 border-0 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                            {txa('Tamamlandı')}
                        </Badge>
                    )}
                </div>

                {/* Aktif adim */}
                {chain.activeStep && !chain.isAllCompleted && (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {chain.activeStep.title}
                    </p>
                )}

                {/* Adim noktalari */}
                <div className="mt-2 flex items-center gap-1.5">
                    {chain.steps.map((step) => (
                        <div
                            key={step.taskId}
                            className={cn(
                                'h-2 rounded-full transition-all',
                                chain.steps.length <= 5 ? 'w-7' : 'w-5',
                                step.isClaimed
                                    ? 'bg-emerald-500 dark:bg-emerald-400'
                                    : step.isClaimable
                                        ? cn(chain.theme.progressBg, 'animate-pulse')
                                        : 'bg-foreground/10',
                            )}
                        />
                    ))}
                    <span className="ml-1 shrink-0 text-[11px] font-medium text-muted-foreground">
                        {chain.completedCount}/{chain.totalCount}
                    </span>
                </div>
            </div>

            {/* Sag: odul + ok */}
            <div className="flex items-center gap-2.5 shrink-0">
                <Badge variant="secondary" className="gap-1 border-0 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    <Coins className="h-3 w-3" />
                    {chain.totalCoinReward.toLocaleString(intlLocale())}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1" />
            </div>
        </button>
    )
}

// ============================
// Zincir detay - dikey timeline + navigasyon
// ============================
function ChainDetail({
    chain,
    claimingId,
    onClaim,
    onNavigate,
}: {
    chain: QuestChain
    claimingId: string | null
    onClaim: (taskId: string) => void
    onNavigate: (metricKey: string) => void
}) {
    return (
        <div className="p-4 space-y-0">
            {/* Zincir progress ozet */}
            <div className={cn(
                'mb-5 rounded-2xl border p-4 shadow-sm',
                chain.theme.border,
                `bg-gradient-to-br ${chain.theme.gradient}`,
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{txa('İlerleme')}</span>
                        <Badge variant="secondary" className="border-0 bg-foreground/5 text-[10px] text-foreground/70">
                            {chain.completedCount}/{chain.totalCount}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-semibold text-foreground">
                            {chain.earnedCoin.toLocaleString(intlLocale())}
                            <span className="font-normal text-muted-foreground">/{chain.totalCoinReward.toLocaleString(intlLocale())}</span>
                        </span>
                    </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-foreground/5">
                    <div
                        className={cn('h-full rounded-full transition-all duration-700', chain.theme.progressBg)}
                        style={{ width: `${chain.progressPct}%` }}
                    />
                </div>
            </div>

            {/* Dikey timeline */}
            <div className="relative pl-1">
                {/* Sol dikey cizgi */}
                <div className="absolute left-[19px] top-5 bottom-5 w-px bg-border/60" />

                <div className="space-y-1">
                    {chain.steps.map((step, idx) => {
                        const isActive = !step.isClaimed && !step.isLocked
                        const isLocked = step.isLocked && !step.isClaimed
                        const isClaiming = claimingId === step.taskId
                        const pct = Math.min(100, Math.round((step.progressValue / Math.max(1, step.targetValue)) * 100))
                        const routeInfo = METRIC_ROUTES[step.metricKey]

                        return (
                            <div key={step.taskId} className="relative flex gap-4 py-2.5">
                                {/* Timeline nokta */}
                                <div className={cn(
                                    'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                                    step.isClaimed
                                        ? 'border-emerald-500/50 bg-emerald-500/10'
                                        : isActive
                                            ? cn(chain.theme.border, 'bg-card shadow-md ring-2 ring-offset-2 ring-offset-background', chain.theme.border)
                                            : 'border-border/50 bg-muted/30',
                                )}>
                                    {step.isClaimed ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                    ) : isLocked ? (
                                        <Lock className="h-4 w-4 text-muted-foreground/40" />
                                    ) : (
                                        <span className={cn('text-sm font-bold', chain.theme.text)}>
                                            {idx + 1}
                                        </span>
                                    )}
                                </div>

                                {/* Adim icerik */}
                                <div className={cn(
                                    'flex-1 min-w-0 rounded-xl border p-3.5 transition-all',
                                    step.isClaimed
                                        ? 'border-emerald-500/15 bg-emerald-500/5'
                                        : isActive
                                            ? cn(chain.theme.border, `bg-gradient-to-r ${chain.theme.gradient}`, 'shadow-sm')
                                            : 'border-border/30 bg-muted/5',
                                    isLocked && 'opacity-50',
                                )}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <h4 className={cn(
                                                'text-sm font-semibold truncate',
                                                isLocked ? 'text-muted-foreground' : 'text-foreground',
                                            )}>
                                                {step.title}
                                            </h4>
                                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                                {step.description}
                                            </p>
                                        </div>
                                        <Badge variant="secondary" className="shrink-0 gap-1 border-0 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                                            <Coins className="h-2.5 w-2.5" />
                                            {step.coinReward.toLocaleString(intlLocale())}
                                        </Badge>
                                    </div>

                                    {/* Progress + aksiyonlar (sadece acik adimlar) */}
                                    {!isLocked && (
                                        <div className="mt-3 space-y-2">
                                            {/* Progress bar */}
                                            <div className="flex items-center gap-2">
                                                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5">
                                                    <div
                                                        className={cn(
                                                            'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
                                                            step.isClaimed ? 'bg-emerald-500' : chain.theme.progressBg,
                                                        )}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                                                    {step.progressValue}/{step.targetValue}
                                                </span>
                                            </div>

                                            {/* Aksiyon butonlari */}
                                            <div className="flex items-center gap-2">
                                                {/* Claim butonu */}
                                                {step.isClaimable && !step.isClaimed && (
                                                    <Button
                                                        size="sm"
                                                        className="h-7 gap-1.5 rounded-lg px-3 text-xs shadow-sm"
                                                        disabled={isClaiming}
                                                        onClick={() => onClaim(step.taskId)}
                                                    >
                                                        {isClaiming ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Gift className="h-3 w-3" />
                                                        )}
                                                        {txa('Ödülü Al')}
                                                    </Button>
                                                )}

                                                {step.isClaimed && (
                                                    <Badge variant="secondary" className="gap-1 border-0 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        {txa('Alındı')}
                                                    </Badge>
                                                )}
                                                {/* "Git" navigasyon butonu - sadece tamamlanmamis ve kilitli olmayan gorevler icin */}
                                                {routeInfo && !step.isClaimed && isActive && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 gap-1.5 rounded-lg px-3 text-xs"
                                                        onClick={() => onNavigate(step.metricKey)}
                                                    >
                                                        <ExternalLink className="h-3 w-3" />
                                                        {routeInfo.label}
                                                    </Button>
                                                )}

                                                {/* Rozet bilgisi */}
                                                {step.badgeName && (
                                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                                        {txa('Rozet:')}{' '}{step.badgeName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Kilitli mesaj */}
                                    {isLocked && (
                                        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <Lock className="h-3 w-3" />
                                            {txa('Önceki adımı tamamlayın')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}





