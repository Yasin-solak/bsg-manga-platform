import type { QuestChain } from './questChainTypes'
/**
 * UserRewardTasksPanel: unified quest panel (tabbed)
 *
 * Fed from the new quest engine (listQuests/claimQuest).
 * Three tabs: Daily (reset 00:00) - Weekly (reset Monday) - Achievements (chain grid).
 * Cadence quests in a horizontal card grid; achievements in 2-column chain cards.
 * Pending rewards + "claim all" in the top strip. Dark/light support, with a confetti effect.
 */
import { DesktopTasksView } from '@/components/home/desktop/DesktopTasksView'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from '@/i18n/router'
import {
    claimQuest,
    listQuests,
    type Quest,
} from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { EXPLORE_PATH } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    CheckCircle2,
    BookOpen,
    Star,
    Users,
    Compass,
    Heart,
    Flame,
    ListChecks,
    Moon,
    Award,
    Coins,
    Gift,
    Loader2,
    ExternalLink,
    Lock,
    Sparkles,
    CalendarDays,
    Sun,
    Trophy,
    MessageCircle,
    Target,
} from 'lucide-react'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface UserRewardTasksPanelProps {
    currentUserId?: string
    onBalanceChange?: (nextBalance: number) => void
    compact?: boolean
    desktopDesign?: boolean
}

type QuestTab = 'gunluk' | 'haftalik' | 'basarimlar'

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString(intlLocale())
}

function progressPercent(value: number, target: number) {
    return Math.min(100, Math.round((value / Math.max(1, target)) * 100))
}

// Metric -> icon (for cadence cards)
const METRIC_ICONS: Record<string, typeof BookOpen> = {
    chapters_read: BookOpen,
    rating_count: Star,
    total_comment_count: MessageCircle,
    manga_comment_count: MessageCircle,
}

function metricIcon(metricKey: string) {
    return METRIC_ICONS[metricKey] || Target
}

// Konfeti
const PARTICLE_COLORS = ['#ffd600', '#ff9800', '#ef5350', '#42a5f5', '#66bb6a', '#ab47bc']
const PARTICLE_COUNT = 14

function buildParticleStyle(index: number, seed: number): CSSProperties {
    const angle = (index / PARTICLE_COUNT) * 360 + (seed % 50)
    const distance = 40 + (seed + index * 7) % 60
    const color = PARTICLE_COLORS[index % PARTICLE_COLORS.length]
    return {
        position: 'absolute', left: '50%', top: '50%', width: 6, height: 6,
        borderRadius: '50%', backgroundColor: color, pointerEvents: 'none',
        transform: `translate(-50%,-50%) rotate(${angle}deg) translateY(-${distance}px) scale(0)`,
        animation: 'rewardBurst 0.7s ease-out forwards',
        animationDelay: `${index * 25}ms`, opacity: 0,
    } as CSSProperties
}

// Metrik -> navigasyon route
const METRIC_ROUTES: Record<string, { path: string; label: string }> = {
    read_manga_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    unique_mangas_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    chapters_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    chapters_in_single_day: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    night_chapters_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    unique_mangas_completed: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    weekly_trending_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    genres_explored: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    manga_follow_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    favorites_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    fansub_follow_count: { path: '/fansublar', get label() { return txa('Fansublar') } },
    rating_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    qualified_ratings: { path: EXPLORE_PATH, get label() { return txa('Keşfet') } },
    manga_comment_count: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
    total_comment_count: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
    qualified_comments: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
    qualified_unique_comments: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
    upvotes_received: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
    profile_completed: { path: '/profil', get label() { return txa('Profil') } },
    consecutive_days: { path: '/', get label() { return txa('Ana Sayfa') } },
    first_day_actions: { path: '/', get label() { return txa('Ana Sayfa') } },
    lists_with_items: { path: '/listeler', get label() { return txa('Listeler') } },
    qualified_lists: { path: '/listeler', get label() { return txa('Listeler') } },
}

// Zincir tema paleti - dark/light uyumlu (basarimlar)
const CHAIN_THEMES: Record<string, {
    icon: typeof BookOpen; label: string; text: string
    bgBadge: string; progressBg: string; gradient: string; border: string
}> = {
    profil: { icon: Award, get label() { return txa('Profil Vitrini') }, text: 'text-slate-600 dark:text-slate-400', bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600', gradient: 'from-slate-500/10 to-slate-600/5', border: 'border-slate-500/25' },
    kutuphane: { icon: Heart, get label() { return txa('Kütüphane Kuruluyor') }, text: 'text-rose-600 dark:text-rose-400', bgBadge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', progressBg: 'bg-gradient-to-r from-rose-400 to-rose-600', gradient: 'from-rose-500/10 to-rose-600/5', border: 'border-rose-500/25' },
    fansub: { icon: Users, get label() { return txa('Ekip Takibi') }, text: 'text-indigo-600 dark:text-indigo-400', bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600', gradient: 'from-indigo-500/10 to-indigo-600/5', border: 'border-indigo-500/25' },
    degerlendirme: { icon: Star, get label() { return txa('Eleştirmen Rotası') }, text: 'text-amber-600 dark:text-amber-400', bgBadge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', progressBg: 'bg-gradient-to-r from-amber-400 to-amber-600', gradient: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-500/25' },
    liste: { icon: ListChecks, get label() { return txa('Liste Kurucusu') }, text: 'text-cyan-600 dark:text-cyan-400', bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600', gradient: 'from-cyan-500/10 to-cyan-600/5', border: 'border-cyan-500/25' },
    okuma_yolu: { icon: BookOpen, get label() { return txa('Okuma Rotasi') }, text: 'text-blue-600 dark:text-blue-400', bgBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', progressBg: 'bg-gradient-to-r from-blue-400 to-blue-600', gradient: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/25' },
    okuma_hacmi: { icon: Flame, get label() { return txa('Bölüm Hacmi') }, text: 'text-orange-600 dark:text-orange-400', bgBadge: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', progressBg: 'bg-gradient-to-r from-orange-400 to-orange-600', gradient: 'from-orange-500/10 to-orange-600/5', border: 'border-orange-500/25' },
    kesif: { icon: Compass, get label() { return txa('Keşif Rotası') }, text: 'text-emerald-600 dark:text-emerald-400', bgBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', progressBg: 'bg-gradient-to-r from-emerald-400 to-emerald-600', gradient: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-500/25' },
    sadakat: { icon: CheckCircle2, get label() { return txa('Sadakat Serisi') }, text: 'text-teal-600 dark:text-teal-400', bgBadge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300', progressBg: 'bg-gradient-to-r from-teal-400 to-teal-600', gradient: 'from-teal-500/10 to-teal-600/5', border: 'border-teal-500/25' },
    topluluk: { icon: Users, get label() { return txa('Topluluk Katkısı') }, text: 'text-purple-600 dark:text-purple-400', bgBadge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300', progressBg: 'bg-gradient-to-r from-purple-400 to-purple-600', gradient: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-500/25' },

    // Backward theme for old task_group keys
    okuma: { icon: BookOpen, get label() { return txa('Okuma Yolculuğu') }, text: 'text-blue-600 dark:text-blue-400', bgBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', progressBg: 'bg-gradient-to-r from-blue-400 to-blue-600', gradient: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/25' },
    sosyal: { icon: Heart, get label() { return txa('Sosyal Katkı') }, text: 'text-pink-600 dark:text-pink-400', bgBadge: 'bg-pink-500/10 text-pink-700 dark:text-pink-300', progressBg: 'bg-gradient-to-r from-pink-400 to-pink-600', gradient: 'from-pink-500/10 to-pink-600/5', border: 'border-pink-500/25' },
    kasif: { icon: Compass, get label() { return txa('Kaşif') }, text: 'text-emerald-600 dark:text-emerald-400', bgBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', progressBg: 'bg-gradient-to-r from-emerald-400 to-emerald-600', gradient: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-500/25' },
    genel: { icon: Award, get label() { return txa('Genel Görevler') }, text: 'text-slate-600 dark:text-slate-400', bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600', gradient: 'from-slate-500/10 to-slate-600/5', border: 'border-slate-500/25' },
    koleksiyon: { icon: ListChecks, get label() { return txa('Koleksiyon') }, text: 'text-cyan-600 dark:text-cyan-400', bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600', gradient: 'from-cyan-500/10 to-cyan-600/5', border: 'border-cyan-500/25' },
    koleksiyoncu: { icon: ListChecks, get label() { return txa('Koleksiyoncu') }, text: 'text-cyan-600 dark:text-cyan-400', bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600', gradient: 'from-cyan-500/10 to-cyan-600/5', border: 'border-cyan-500/25' },
    ozel: { icon: Moon, get label() { return txa('Özel Görevler') }, text: 'text-indigo-600 dark:text-indigo-400', bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600', gradient: 'from-indigo-500/10 to-indigo-600/5', border: 'border-indigo-500/25' },
    gece_kusu: { icon: Moon, get label() { return txa('Gece Kuşu') }, text: 'text-indigo-600 dark:text-indigo-400', bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600', gradient: 'from-indigo-500/10 to-indigo-600/5', border: 'border-indigo-500/25' },
    maraton: { icon: Flame, get label() { return txa('Maratoncu') }, text: 'text-orange-600 dark:text-orange-400', bgBadge: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', progressBg: 'bg-gradient-to-r from-orange-400 to-orange-600', gradient: 'from-orange-500/10 to-orange-600/5', border: 'border-orange-500/25' },
}

const CHAIN_ORDER = [
    'profil', 'kutuphane', 'fansub', 'degerlendirme', 'liste', 'okuma_yolu',
    'okuma_hacmi', 'kesif', 'sadakat', 'topluluk', 'okuma', 'sosyal', 'genel',
    'koleksiyon', 'koleksiyoncu', 'ozel', 'gece_kusu', 'maraton',
] as const

const DEFAULT_THEME = { icon: Award, get label() { return txa('Görevler') }, text: 'text-slate-600 dark:text-slate-400', bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600', gradient: 'from-slate-500/10 to-slate-600/5', border: 'border-slate-500/25' }

function getChainTheme(key: string) {
    return CHAIN_THEMES[key] || { ...DEFAULT_THEME, label: key }
}

function getChainRank(key: string) {
    const rank = CHAIN_ORDER.indexOf(key as (typeof CHAIN_ORDER)[number])
    return rank === -1 ? 999 : rank
}



export function UserRewardTasksPanel({ currentUserId, onBalanceChange, desktopDesign = false }: UserRewardTasksPanelProps) {
    const navigate = useNavigate()
    const [quests, setQuests] = useState<Quest[]>([])
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(false)
    const [claimingId, setClaimingId] = useState<string | null>(null)
    const [claimingAll, setClaimingAll] = useState(false)
    const [burstTaskId, setBurstTaskId] = useState<string | null>(null)
    const [burstSeed, setBurstSeed] = useState(0)
    const [activeTab, setActiveTab] = useState<QuestTab>('gunluk')

    const loadTasks = useCallback(async () => {
        if (!currentUserId) return
        setLoading(true)
        setError(false)
        try {
            const data = await listQuests('user')
            setQuests(data)
        } catch (err) {
            setError(true)
            console.error('[UserRewardTasksPanel]', err)
            toast.error(txa('Görevler yüklenemedi.'))
        } finally {
            setLoading(false)
        }
    }, [currentUserId])

    useEffect(() => { void loadTasks() }, [loadTasks])

    function triggerBurst(questId: string) {
        setBurstSeed(Date.now())
        setBurstTaskId(questId)
        setTimeout(() => setBurstTaskId(null), 1200)
    }

    function applyClaimedLocal(questId: string, claimedAt: string) {
        setQuests((prev) =>
            prev.map((q) =>
                q.questId === questId
                    ? { ...q, isClaimed: true, isClaimable: false, claimedAt }
                    : q,
            ),
        )
    }

    const handleClaim = useCallback(async (quest: Quest) => {
        if (claimingId || claimingAll || quest.isLocked || !quest.isClaimable) return
        setClaimingId(quest.questId)
        try {
            const result = await claimQuest(quest.questId, 'user')
            if (result.success) {
                triggerBurst(quest.questId)
                const extras = [
                    result.badgeAwarded && result.badgeName ? txa('"{v1}" rozeti', { v1: result.badgeName }) : '',
                    result.itemGranted && quest.rewardItemName ? `"${quest.rewardItemName}"` : '',
                ].filter(Boolean)
                toast.success(
                    txa('"{v1}" tamamlandı! +{v2} coin', { v1: result.questTitle, v2: formatNumber(result.coinReward) }) +
                    (extras.length ? txa(' ve {v1} kazanıldı!', { v1: extras.join(', ') }) : ''),
                )
                onBalanceChange?.(result.newBalance)
                applyClaimedLocal(quest.questId, result.claimedAt)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : txa('Ödül alınamadı.')
            toast.error(message)
        } finally {
            setClaimingId(null)
        }
    }, [claimingId, claimingAll, onBalanceChange])

    const claimableQuests = useMemo(
        () => quests.filter((q) => q.isClaimable && !q.isClaimed && !q.isLocked),
        [quests],
    )
    const claimableCoin = useMemo(
        () => claimableQuests.reduce((s, q) => s + q.coinReward, 0),
        [claimableQuests],
    )
    const completedCount = useMemo(() => quests.filter((q) => q.isClaimed).length, [quests])
    const earnedCoin = useMemo(
        () => quests.filter((q) => q.isClaimed).reduce((s, q) => s + q.coinReward, 0),
        [quests],
    )

    const handleClaimAll = useCallback(async () => {
        if (claimingId || claimingAll || claimableQuests.length === 0) return
        setClaimingAll(true)
        let lastBalance = -1
        let totalCoin = 0
        let claimedCount = 0
        for (const quest of claimableQuests) {
            try {
                const result = await claimQuest(quest.questId, 'user')
                if (result.success) {
                    claimedCount += 1
                    totalCoin += result.coinReward
                    lastBalance = result.newBalance
                    applyClaimedLocal(quest.questId, result.claimedAt)
                }
            } catch {
                // tek tek hata gec, digerlerine devam
            }
        }
        if (claimedCount > 0) {
            triggerBurst(claimableQuests[0].questId)
            toast.success(txa('{v1} görev tamamlandı! +{v2} coin', { v1: claimedCount, v2: formatNumber(totalCoin) }))
            if (lastBalance >= 0) onBalanceChange?.(lastBalance)
        }
        setClaimingAll(false)
    }, [claimingId, claimingAll, claimableQuests, onBalanceChange])

    const dailyQuests = useMemo(
        () => quests.filter((q) => q.kind === 'daily').sort((a, b) => a.sortOrder - b.sortOrder),
        [quests],
    )
    const weeklyQuests = useMemo(
        () => quests.filter((q) => q.kind === 'weekly').sort((a, b) => a.sortOrder - b.sortOrder),
        [quests],
    )

    const chains = useMemo((): QuestChain[] => {
        // Event quests now show in EventQuestsPanel in the left sidebar;
        // deliberately excluded from achievement chains in the quest panel.
        const achievements = quests.filter((q) => q.kind === 'achievement')
        const groupMap = new Map<string, Quest[]>()
        for (const task of achievements) {
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
            const activeStep = sorted.find((s) => !s.isClaimed && !s.isLocked) || null
            result.push({
                groupKey, theme: getChainTheme(groupKey), steps: sorted,
                completedCount: completed.length, totalCount: sorted.length,
                totalCoinReward: totalCoin, activeStep,
                isAllCompleted: sorted.length > 0 && completed.length === sorted.length,
            })
        }
        return result.sort((a, b) => {
            if (a.isAllCompleted !== b.isAllCompleted) return a.isAllCompleted ? 1 : -1
            if (!!a.activeStep !== !!b.activeStep) return a.activeStep ? -1 : 1
            const rankDiff = getChainRank(a.groupKey) - getChainRank(b.groupKey)
            if (rankDiff !== 0) return rankDiff
            return a.theme.label.localeCompare(b.theme.label, 'tr')
        })
    }, [quests])

    const dailyDone = dailyQuests.filter((q) => q.isClaimed).length
    const weeklyDone = weeklyQuests.filter((q) => q.isClaimed).length
    const achievementsDone = chains.reduce((s, c) => s + c.completedCount, 0)
    const achievementsTotal = chains.reduce((s, c) => s + c.totalCount, 0)

    const renderBurst = (questId: string): ReactNode =>
        burstTaskId === questId ? (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
                {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
                    <div key={i} style={buildParticleStyle(i, burstSeed)} />
                ))}
            </div>
        ) : null

    const TABS: Array<{ key: QuestTab; label: string; icon: typeof Sun; count: string; accentText: string }> = [
        { key: 'gunluk', label: txa('Günlük'), icon: Sun, count: `${dailyDone}/${dailyQuests.length}`, accentText: 'text-amber-600 dark:text-amber-400' },
        { key: 'haftalik', label: txa('Haftalık'), icon: CalendarDays, count: `${weeklyDone}/${weeklyQuests.length}`, accentText: 'text-violet-600 dark:text-violet-400' },
        { key: 'basarimlar', label: txa('Başarımlar'), icon: Trophy, count: `${achievementsDone}/${achievementsTotal}`, accentText: 'text-emerald-600 dark:text-emerald-400' },
    ]

    if (desktopDesign) return <DesktopTasksView quests={quests} chains={chains} loading={loading} error={error} onRetry={() => void loadTasks()} claiming={!!claimingId || claimingAll} onClaim={handleClaim} onClaimAll={handleClaimAll} onNavigate={navigate} routes={METRIC_ROUTES} />

    return (
        <div className="flex flex-col gap-4">
            <style>{`
        @keyframes rewardBurst {
          0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--angle,0deg)) translateY(0) scale(1) }
          100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--angle,0deg)) translateY(-80px) scale(0.3) }
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

            {/* Ust serit: bekleyen odul + ozet istatistik */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-gradient-to-r from-amber-500/10 via-card to-card p-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Coins className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{txa('Bekleyen ödül')}</p>
                        <p className="text-lg font-bold leading-tight text-foreground">
                            {formatNumber(claimableCoin)} <span className="text-xs font-normal text-muted-foreground">{txa('coin · {v1} görev', { v1: claimableQuests.length })}</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-1.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{txa('Tamamlanan')}</p>
                        <p className="text-sm font-bold text-foreground">{completedCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-1.5 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{txa('Kazanılan')}</p>
                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatNumber(earnedCoin)}</p>
                    </div>
                    {claimableQuests.length > 0 && (
                        <Button
                            size="sm"
                            className="gap-1.5 rounded-full shadow-sm"
                            disabled={claimingAll}
                            onClick={() => void handleClaimAll()}
                        >
                            {claimingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                            {txa('Hepsini al')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Sekmeler */}
            <div className="flex gap-1 rounded-full bg-muted/60 p-1">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    const active = activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex flex-1 items-center justify-center gap-2 rounded-full px-2 py-2 text-[13px] font-semibold transition-colors',
                                active
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon className={cn('h-4 w-4', active ? tab.accentText : '')} />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                                active ? 'bg-muted text-foreground' : 'bg-background/60 text-muted-foreground',
                            )}>
                                {tab.count}
                            </span>
                        </button>
                    )
                })}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="ml-2 text-sm">{txa('Görevler yükleniyor...')}</span>
                </div>
            ) : (
                <div key={activeTab} className="min-h-[200px]" style={{ animation: 'slideIn 0.25s ease-out both' }}>
                    {activeTab === 'gunluk' && (
                        <CadenceGrid
                            resetLabel={txa('Her gece yenilenir')}
                            quests={dailyQuests}
                            accent={DAILY_ACCENT}
                            claimingId={claimingId}
                            claimingAll={claimingAll}
                            onClaim={handleClaim}
                            onNavigate={(p) => navigate(p)}
                            renderBurst={renderBurst}
                            emptyText={txa('Bugün için görev yok.')}
                        />
                    )}
                    {activeTab === 'haftalik' && (
                        <CadenceGrid
                            resetLabel={txa('Her pazartesi yenilenir')}
                            quests={weeklyQuests}
                            accent={WEEKLY_ACCENT}
                            claimingId={claimingId}
                            claimingAll={claimingAll}
                            onClaim={handleClaim}
                            onNavigate={(p) => navigate(p)}
                            renderBurst={renderBurst}
                            emptyText={txa('Bu hafta için görev yok.')}
                        />
                    )}
                    {activeTab === 'basarimlar' && (
                        <div className="grid gap-3 md:grid-cols-2">
                            {chains.length === 0 && (
                                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{txa('Henüz başarım yok.')}</p>
                            )}
                            {chains.map((chain) => (
                                <AchievementChainCard
                                    key={chain.groupKey}
                                    chain={chain}
                                    claimingId={claimingId}
                                    claimingAll={claimingAll}
                                    onClaim={handleClaim}
                                    onNavigate={(p) => navigate(p)}
                                    renderBurst={renderBurst}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ============================================
// Cadence (gunluk/haftalik) — yatay kart gridi
// ============================================
interface CadenceAccent {
    chip: string
    bar: string
    iconBg: string
    iconText: string
}

const DAILY_ACCENT: CadenceAccent = {
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-gradient-to-r from-amber-400 to-orange-500',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-600 dark:text-amber-400',
}

const WEEKLY_ACCENT: CadenceAccent = {
    chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    bar: 'bg-gradient-to-r from-violet-400 to-indigo-500',
    iconBg: 'bg-violet-500/10',
    iconText: 'text-violet-600 dark:text-violet-400',
}

interface CadenceGridProps {
    resetLabel: string
    quests: Quest[]
    accent: CadenceAccent
    claimingId: string | null
    claimingAll: boolean
    onClaim: (quest: Quest) => void
    onNavigate: (path: string) => void
    renderBurst: (questId: string) => ReactNode
    emptyText: string
}

function CadenceGrid({ resetLabel, quests, accent, claimingId, claimingAll, onClaim, onNavigate, renderBurst, emptyText }: CadenceGridProps) {
    if (quests.length === 0) {
        return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
    }
    const done = quests.filter((q) => q.isClaimed).length
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {resetLabel}
                </span>
                <span className="text-xs text-muted-foreground">{txa('{done}/{total} tamamlandı', { done, total: quests.length })}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                {quests.map((quest) => {
                    const Icon = metricIcon(quest.metricKey)
                    const route = METRIC_ROUTES[quest.metricKey]
                    const pct = progressPercent(quest.progressValue, quest.targetValue)
                    return (
                        <div
                            key={quest.questId}
                            className={cn(
                                'relative flex flex-col rounded-2xl border p-3.5 shadow-sm transition-all',
                                quest.isClaimed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-border/50 bg-card',
                            )}
                        >
                            {renderBurst(quest.questId)}
                            <div className="mb-2.5 flex items-center justify-between">
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', accent.iconBg, accent.iconText)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                                <Badge variant="secondary" className={cn('gap-1 border-0 text-[10px]', accent.chip)}>
                                    <Coins className="h-2.5 w-2.5" /> +{formatNumber(quest.coinReward)}
                                </Badge>
                            </div>
                            <p className="text-sm font-semibold text-foreground">{quest.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{quest.description}</p>
                            <div className="mt-auto pt-3">
                                <div className="mb-1.5 flex items-center gap-2">
                                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5">
                                        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700', quest.isClaimed ? 'bg-emerald-500' : accent.bar)} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                                        {formatNumber(quest.progressValue)}/{formatNumber(quest.targetValue)}
                                    </span>
                                </div>
                                {quest.isClaimed ? (
                                    <p className="flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> {txa('Alındı')}
                                    </p>
                                ) : quest.isClaimable ? (
                                    <Button size="sm" className="h-7 w-full gap-1 text-[11px] shadow-sm" disabled={claimingId === quest.questId || claimingAll} onClick={() => onClaim(quest)}>
                                        {claimingId === quest.questId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                                        {txa('Ödülü al')}
                                    </Button>
                                ) : route ? (
                                    <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-[11px]" onClick={() => onNavigate(route.path)}>
                                        <ExternalLink className="h-3 w-3" /> {route.label}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ============================================
// Basarim zinciri karti
// ============================================
interface AchievementChainCardProps {
    chain: QuestChain
    claimingId: string | null
    claimingAll: boolean
    onClaim: (quest: Quest) => void
    onNavigate: (path: string) => void
    renderBurst: (questId: string) => ReactNode
}

function AchievementChainCard({ chain, claimingId, claimingAll, onClaim, onNavigate, renderBurst }: AchievementChainCardProps) {
    const Icon = chain.theme.icon
    const activeTask = chain.activeStep
    const routeInfo = activeTask ? METRIC_ROUTES[activeTask.metricKey] : null

    return (
        <div
            className={cn(
                'flex flex-col rounded-2xl border p-3.5 shadow-sm transition-all',
                chain.isAllCompleted ? 'border-emerald-500/20 bg-emerald-500/5' : `${chain.theme.border} bg-gradient-to-br ${chain.theme.gradient}`,
            )}
        >
            <div className="flex items-center gap-2.5">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', chain.isAllCompleted ? 'bg-emerald-500/10' : chain.theme.bgBadge)}>
                    {chain.isAllCompleted ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Icon className={cn('h-4 w-4', chain.theme.text)} />}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[13px] font-semibold text-foreground">{chain.theme.label}</h4>
                    <div className="mt-1 flex items-center gap-1">
                        {chain.steps.map((step) => (
                            <div
                                key={step.questId}
                                className={cn(
                                    'h-1.5 flex-1 rounded-full transition-all',
                                    step.isClaimed ? 'bg-emerald-500 dark:bg-emerald-400' : step.isClaimable ? cn(chain.theme.progressBg, 'animate-pulse') : 'bg-foreground/10',
                                )}
                            />
                        ))}
                        <span className="ml-1 shrink-0 text-[10px] font-medium text-muted-foreground">{chain.completedCount}/{chain.totalCount}</span>
                    </div>
                </div>
                <Badge variant="secondary" className="shrink-0 gap-1 border-0 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                    <Coins className="h-3 w-3" /> {chain.totalCoinReward.toLocaleString(intlLocale())}
                </Badge>
            </div>

            <div className="relative mt-2.5 border-t border-border/30 pt-2.5">
                {chain.isAllCompleted ? (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {txa('Tüm adımlar tamamlandı')}
                    </p>
                ) : activeTask ? (
                    <>
                        {renderBurst(activeTask.questId)}
                        <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-semibold text-foreground">{activeTask.title}</p>
                            {activeTask.rewardItemId && (
                                <Badge variant="secondary" className="shrink-0 gap-1 border-0 bg-fuchsia-500/10 text-[9px] text-fuchsia-700 dark:text-fuchsia-300">
                                    <Sparkles className="h-2.5 w-2.5" />{' '}{txa('Kozmetik')}
                                </Badge>
                            )}
                            <span className="ml-auto shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                                {formatNumber(activeTask.progressValue)}/{formatNumber(activeTask.targetValue)}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/5">
                            <div className={cn('h-full rounded-full transition-all duration-700', chain.theme.progressBg)} style={{ width: `${progressPercent(activeTask.progressValue, activeTask.targetValue)}%` }} />
                        </div>
                        {activeTask.rewardItemId && !activeTask.gateMet && (
                            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-fuchsia-600/80 dark:text-fuchsia-400/80">
                                <Lock className="h-2.5 w-2.5" /> {txa('Kozmetik odul icin daha fazla deneyim gerekiyor.')}
                            </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                            {activeTask.isClaimable && !activeTask.isClaimed && (
                                <Button size="sm" className="h-6 gap-1 px-2.5 text-[11px] shadow-sm" disabled={claimingId === activeTask.questId || claimingAll} onClick={() => onClaim(activeTask)}>
                                    {claimingId === activeTask.questId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                                    {txa('Ödülü al')}
                                </Button>
                            )}
                            {routeInfo && !activeTask.isClaimed && !activeTask.isClaimable && (
                                <Button size="sm" variant="outline" className="h-6 gap-1 px-2.5 text-[11px]" onClick={() => onNavigate(routeInfo.path)}>
                                    <ExternalLink className="h-3 w-3" /> {routeInfo.label}
                                </Button>
                            )}
                        </div>
                    </>
                ) : (
                    <p className="text-[11px] text-muted-foreground">{txa('Sonraki adım kilitli.')}</p>
                )}
            </div>
        </div>
    )
}

export default UserRewardTasksPanel
