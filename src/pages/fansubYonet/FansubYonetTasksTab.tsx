/**
 * Quests tab (v2): weekly quests + permanent chains.
 *
 * Reads from the unified quest engine (listQuests('fansub', id)); rewards go to the fansub
 * vault (claimQuest). Weekly fansub quests (metric week_*) are calculated in the DB from
 * real data and reset Monday 00:00 (Istanbul).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle,
  Coins,
  Gift,
  LockSimple,
  Megaphone,
  PaintBrush,
  Sparkle,
  Star,
  TrendUp,
  Trophy,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { claimQuest, listQuests, type Quest } from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { Meter, Panel, PanelEmpty, ToneIcon, type PanelTone } from '@/pages/profile/ProfileTabKit'
import { StudioStatStrip } from './StudioStatStrip'
import type { FansubYonetTab } from './useFansubYonetState'
import { intlLocale, txa } from '@/i18n/activeLocale'

type ChainTheme = { label: string, icon: Icon, tone: PanelTone, bar: string }

export const QUEST_CHAINS: Record<string, ChainTheme> = {
  ceviri: { get label() { return txa('Çeviri yolu') }, icon: BookOpen, tone: 'sky', bar: 'from-sky-500 to-sky-400' },
  studyo: { get label() { return txa('Stüdyo') }, icon: PaintBrush, tone: 'violet', bar: 'from-violet-500 to-violet-400' },
  buyume: { get label() { return txa('Büyüme') }, icon: TrendUp, tone: 'emerald', bar: 'from-emerald-500 to-emerald-400' },
  ekip: { get label() { return txa('Ekip') }, icon: UsersThree, tone: 'primary', bar: 'from-primary to-primary/70' },
  topluluk: { get label() { return txa('Topluluk') }, icon: Megaphone, tone: 'amber', bar: 'from-amber-500 to-amber-400' },
  kalite: { get label() { return txa('Kalite') }, icon: Star, tone: 'rose', bar: 'from-rose-500 to-rose-400' },
}
const CHAIN_ORDER = ['ceviri', 'studyo', 'buyume', 'ekip', 'topluluk', 'kalite']
const FALLBACK_CHAIN: ChainTheme = { get label() { return txa('Diğer') }, icon: Trophy, tone: 'neutral', bar: 'from-slate-500 to-slate-400' }

/** Gorevin ilerledigi yer: panel sekmesi ya da ceviri studyosu. */
type QuestTarget = { tab: FansubYonetTab, label: string } | { studio: true, label: string }
export function questTarget(metricKey: string): QuestTarget | null {
  if (/studio/.test(metricKey)) return { studio: true, label: txa('Stüdyoya git') }
  if (/notice/.test(metricKey)) return { tab: 'duyurular', label: txa('Duyurular') }
  if (/chapter|manga/.test(metricKey)) return { tab: 'bolumler', label: txa('Bölümler') }
  if (metricKey === 'roles_defined') return { tab: 'roller', label: txa('Roller') }
  if (metricKey === 'members_count') return { tab: 'uyelik', label: txa('Ekip üyeleri') }
  return null
}

const WEEKLY_ICON: Array<[RegExp, Icon, PanelTone]> = [
  [/chapters/, BookOpen, 'sky'],
  [/studio_pages/, PaintBrush, 'violet'],
  [/contributors/, UsersThree, 'primary'],
  [/followers/, TrendUp, 'emerald'],
  [/notices/, Megaphone, 'amber'],
]

const fmt = (value: number) => Number(value || 0).toLocaleString(intlLocale())
const pct = (value: number, target: number) => Math.min(100, Math.round((value / Math.max(1, target)) * 100))

/** Time left until next Monday 00:00 (Istanbul, fixed UTC+3). */
export function weeklyResetLabel(now = new Date()) {
  const ist = new Date(now.getTime() + 3 * 3600_000)
  const daysToMonday = ((8 - ist.getUTCDay()) % 7) || 7
  const reset = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysToMonday) - 3 * 3600_000
  const hours = Math.max(0, Math.floor((reset - now.getTime()) / 3600_000))
  return hours >= 24 ? txa('{v1} gün {v2} sa', { v1: Math.floor(hours / 24), v2: hours % 24 }) : `${hours} sa`
}

type Chain = { key: string, theme: ChainTheme, steps: Quest[], done: number, active: Quest | null, complete: boolean }

function buildChains(quests: Quest[]): Chain[] {
  const groups = new Map<string, Quest[]>()
  for (const quest of quests) {
    const list = groups.get(quest.taskGroup) ?? []
    list.push(quest)
    groups.set(quest.taskGroup, list)
  }
  return [...groups.entries()].map(([key, list]) => {
    const steps = [...list].sort((a, b) => a.tierLevel - b.tierLevel || a.sortOrder - b.sortOrder)
    const done = steps.filter((step) => step.isClaimed).length
    // Claimable first, then the first unlocked open step.
    const active = steps.find((step) => step.isClaimable) ?? steps.find((step) => !step.isClaimed && !step.isLocked) ?? null
    return { key, theme: QUEST_CHAINS[key] ?? { ...FALLBACK_CHAIN, label: key }, steps, done, active, complete: done === steps.length }
  }).sort((a, b) => Number(a.complete) - Number(b.complete)
    || (CHAIN_ORDER.indexOf(a.key) + 1 || 99) - (CHAIN_ORDER.indexOf(b.key) + 1 || 99))
}

function RewardChip({ coin, className }: { coin: number, className?: string }) {
  return (
    <span className={cn('inline-flex flex-none items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11.5px] font-bold text-amber-700 tabular-nums dark:text-amber-300', className)}>
      <Coins size={12} weight='fill' />{fmt(coin)}
    </span>
  )
}

export default function FansubYonetTasksTab({
  fansubId,
  onBalanceChange,
  onOpenTab,
}: {
  fansubId: string
  onBalanceChange?: (balance: number) => void
  onOpenTab?: (tab: FansubYonetTab) => void
}) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setQuests(await listQuests('fansub', fansubId))
    } catch (err) {
      setError(err instanceof Error ? err.message : txa('Görevler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [fansubId])

  useEffect(() => { void load() }, [load])

  const weekly = useMemo(() => quests.filter((quest) => quest.kind === 'weekly' || quest.kind === 'event'), [quests])
  const chains = useMemo(() => buildChains(quests.filter((quest) => quest.kind === 'achievement')), [quests])
  const claimable = useMemo(() => quests.filter((quest) => quest.isClaimable && !quest.isClaimed), [quests])
  const claimableCoin = claimable.reduce((sum, quest) => sum + quest.coinReward, 0)
  const achievements = quests.filter((quest) => quest.kind === 'achievement')
  const earned = achievements.filter((quest) => quest.isClaimed).reduce((sum, quest) => sum + quest.coinReward, 0)
  const weeklyDone = weekly.filter((quest) => quest.isClaimed).length

  const claim = useCallback(async (targets: Quest[]) => {
    if (claiming || targets.length === 0) return
    setClaiming(targets.length > 1 ? 'all' : targets[0].questId)
    let coin = 0
    let count = 0
    let balance: number | null = null
    for (const quest of targets) {
      try {
        const result = await claimQuest(quest.questId, 'fansub', fansubId)
        if (!result.success) continue
        count += 1
        coin += result.coinReward
        balance = result.newBalance
        setQuests((prev) => prev.map((row) => (row.questId === quest.questId ? { ...row, isClaimed: true, isClaimable: false, claimedAt: result.claimedAt } : row)))
      } catch (err) {
        if (targets.length === 1) toast.error(err instanceof Error ? err.message : txa('Ödül alınamadı.'))
      }
    }
    if (count > 0) {
      toast.success(count === 1 ? txa('"{v1}" tamamlandı · kasaya +{v2} coin', { v1: targets[0].title, v2: fmt(coin) }) : txa('{v1} görev tamamlandı · kasaya +{v2} coin', { v1: count, v2: fmt(coin) }))
      if (balance != null) onBalanceChange?.(balance)
      // The next step in the chain may have unlocked.
      void load()
    }
    setClaiming(null)
  }, [claiming, fansubId, load, onBalanceChange])

  const renderTarget = (quest: Quest) => {
    if (quest.isClaimed || quest.isClaimable) return null
    const target = questTarget(quest.metricKey)
    if (!target) return null
    const cls = 'inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline'
    return 'studio' in target
      ? <Link to={`/fansub/${fansubId}/studyo`} className={cls}>{target.label}<ArrowRight size={11} weight='bold' /></Link>
      : onOpenTab ? <button type='button' className={cls} onClick={() => onOpenTab(target.tab)}>{target.label}<ArrowRight size={11} weight='bold' /></button> : null
  }

  const renderAction = (quest: Quest) => quest.isClaimed ? (
    <span className='inline-flex flex-none items-center gap-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400'>
      <CheckCircle size={15} weight='fill' />{txa('Alındı')}
    </span>
  ) : quest.isClaimable ? (
    <Button size='sm' className='h-7 flex-none gap-1 rounded-full px-3 text-[12px]' disabled={Boolean(claiming)} onClick={() => void claim([quest])}>
      <Gift size={13} weight='bold' />{txa('Ödülü al')}
    </Button>
  ) : <RewardChip coin={quest.coinReward} />

  if (loading && quests.length === 0) {
    return <div className='py-16 text-center text-[13px] text-muted-foreground' data-testid='studio-tasks-loading'>{txa('Görevler yükleniyor…')}</div>
  }
  if (error) {
    return <PanelEmpty icon={Trophy} title={txa('Görevler yüklenemedi')} hint={error} action={<Button size='sm' variant='outline' onClick={() => void load()}>{txa('Tekrar dene')}</Button>} />
  }

  return (
    <div className='flex flex-col gap-4' data-testid='studio-tasks'>
      <StudioStatStrip
        testId='studio-tasks-summary'
        items={[
          { key: 'ready', icon: Gift, tone: 'emerald', label: txa('Bekleyen ödül'), value: fmt(claimableCoin), sub: claimable.length ? txa('{v1} görev hazır', { v1: claimable.length }) : txa('Hazır ödül yok') },
          { key: 'week', icon: CalendarCheck, tone: 'sky', label: txa('Bu hafta'), value: `${weeklyDone}/${weekly.length}`, sub: txa('Sıfırlanmaya {v1}', { v1: weeklyResetLabel() }) },
          { key: 'done', icon: Trophy, tone: 'amber', label: txa('Başarımlar'), value: `${achievements.filter((quest) => quest.isClaimed).length}/${achievements.length}`, sub: txa('{v1} yol tamam', { v1: chains.filter((chain) => chain.complete).length }) },
          { key: 'earned', icon: Coins, tone: 'violet', label: txa('Kazanılan'), value: fmt(earned), sub: txa('başarımlardan coin') },
        ]}
      />

      {claimable.length > 1 && (
        <div className='flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-2.5' data-testid='studio-tasks-claim-all'>
          <Sparkle size={18} weight='fill' className='text-emerald-500' />
          <span className='min-w-0 flex-1 text-[13px]'><b>{txa('{v1} görevin ödülü hazır.', { v1: claimable.length })}</b> {txa('Kasaya toplam +{v1} coin.', { v1: fmt(claimableCoin) })}</span>
          <Button size='sm' className='h-8 gap-1.5 rounded-full' disabled={Boolean(claiming)} onClick={() => void claim(claimable)}>
            <Gift size={14} weight='bold' />{txa('Hepsini al')}
          </Button>
        </div>
      )}

      <Panel
        title={txa('Bu hafta')}
        icon={CalendarCheck}
        tone='sky'
        meta={txa('Pazartesi 00:00\'da yenilenir · {v1} kaldı', { v1: weeklyResetLabel() })}
        testId='studio-weekly-quests'
        flush
      >
        {weekly.length === 0 ? (
          <p className='px-5 pb-4 text-[12.5px] text-muted-foreground'>{txa('Bu hafta için görev yok.')}</p>
        ) : (
          <ul className='divide-y divide-border/50'>
            {weekly.map((quest) => {
              const [, icon, tone] = WEEKLY_ICON.find(([pattern]) => pattern.test(quest.metricKey)) ?? [null, Trophy, 'neutral' as PanelTone]
              return (
                <li key={quest.questId} className={cn('flex items-center gap-3 px-5 py-3', quest.isClaimed && 'opacity-70')}>
                  <ToneIcon icon={quest.isClaimed ? CheckCircle : icon} tone={quest.isClaimed ? 'emerald' : tone} size='sm' />
                  <span className='min-w-0 flex-1'>
                    <span className='flex flex-wrap items-baseline gap-x-2'>
                      <b className='text-[13.5px] font-bold'>{quest.title}</b>
                      <span className='text-[12px] text-muted-foreground'>{quest.description}</span>
                    </span>
                    <span className='mt-1.5 flex items-center gap-2.5'>
                      <Meter percent={pct(quest.progressValue, quest.targetValue)} className='max-w-[260px] flex-1' barClassName={quest.isCompleted ? 'from-emerald-500 to-emerald-400' : undefined} />
                      <span className='flex-none text-[11.5px] font-semibold tabular-nums text-muted-foreground'>
                        {fmt(Math.min(quest.progressValue, quest.targetValue))}/{fmt(quest.targetValue)}
                      </span>
                      {renderTarget(quest)}
                    </span>
                  </span>
                  {renderAction(quest)}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title={txa('Yolculuklar')} icon={Trophy} tone='amber' meta={txa('Kalıcı başarımlar; her adım bir öncekini açar.')} testId='studio-quest-chains'>
        {chains.length === 0 ? (
          <PanelEmpty icon={Trophy} title={txa('Henüz başarım yok')} hint={txa('Yeni yolculuklar eklendiğinde burada görünür.')} />
        ) : (
          <div className='grid gap-3 md:grid-cols-2'>
            {chains.map((chain) => {
              const active = chain.active
              return (
                <article key={chain.key} className={cn('flex flex-col gap-3 rounded-2xl border p-4', chain.complete ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-border/70 bg-background/40')} data-testid={`studio-chain-${chain.key}`}>
                  <header className='flex items-center gap-3'>
                    <ToneIcon icon={chain.complete ? CheckCircle : chain.theme.icon} tone={chain.complete ? 'emerald' : chain.theme.tone} size='sm' />
                    <span className='min-w-0 flex-1'>
                      <b className='block text-[14px] font-bold'>{chain.theme.label}</b>
                      <span className='text-[11.5px] text-muted-foreground'>{txa('{v1}/{v2} adım · toplam {v3} coin', { v1: chain.done, v2: chain.steps.length, v3: fmt(chain.steps.reduce((sum, step) => sum + step.coinReward, 0)) })}</span>
                    </span>
                  </header>
                  <ol className='flex gap-1' aria-label={txa('{v1} adımları', { v1: chain.theme.label })}>
                    {chain.steps.map((step) => (
                      <li
                        key={step.questId}
                        title={`${step.title}${step.isClaimed ? txa(' · alındı') : step.isLocked ? txa(' · kilitli') : ''}`}
                        className={cn('h-1.5 flex-1 rounded-full', step.isClaimed ? 'bg-emerald-500' : step.isClaimable ? `animate-pulse bg-gradient-to-r ${chain.theme.bar}` : step === active ? 'bg-foreground/25' : 'bg-foreground/[0.08]')}
                      />
                    ))}
                  </ol>
                  {chain.complete ? (
                    <p className='text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400'>{txa('Tüm adımlar tamamlandı.')}</p>
                  ) : active ? (
                    <div className='flex items-center gap-3'>
                      <span className='min-w-0 flex-1'>
                        <b className='block truncate text-[13px] font-semibold'>{active.title}</b>
                        <span className='block truncate text-[11.5px] text-muted-foreground'>{active.description}</span>
                        <span className='mt-1.5 flex items-center gap-2.5'>
                          <Meter percent={pct(active.progressValue, active.targetValue)} className='flex-1' barClassName={`bg-gradient-to-r ${chain.theme.bar}`} />
                          <span className='flex-none text-[11px] font-semibold tabular-nums text-muted-foreground'>{fmt(Math.min(active.progressValue, active.targetValue))}/{fmt(active.targetValue)}</span>
                        </span>
                        <span className='mt-1 block'>{renderTarget(active)}</span>
                      </span>
                      {renderAction(active)}
                    </div>
                  ) : (
                    <p className='flex items-center gap-1.5 text-[12px] text-muted-foreground'><LockSimple size={13} />{txa('Sonraki adım, öncekinin ödülü alınınca açılır.')}</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
