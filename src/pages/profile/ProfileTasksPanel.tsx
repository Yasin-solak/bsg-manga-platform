import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Coins, Trophy } from '@phosphor-icons/react'
import { listUserRewardTasks, toRewardErrorMessage, type UserRewardTaskProgress } from '@/services/rewardService'
import { Panel, PanelEmpty } from './ProfileTabKit'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Statistics tab (owner only): completed and claimed quests, newest on top. */

const PREVIEW = 6

export function ProfileTasksPanel({ currentUserId }: { currentUserId?: string }) {
  const [tasks, setTasks] = useState<UserRewardTaskProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!currentUserId) { setLoading(false); return undefined }
    let cancelled = false
    setLoading(true)
    listUserRewardTasks()
      .then((rows) => { if (!cancelled) setTasks(rows) })
      .catch((loadError) => { if (!cancelled) setError(toRewardErrorMessage(loadError, txa('Görevler şu anda yüklenemedi.'))) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentUserId])

  const done = useMemo(
    () => tasks.filter((task) => task.isClaimed).sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? '')),
    [tasks],
  )
  const coins = done.reduce((sum, task) => sum + task.coinReward, 0)
  const visible = expanded ? done : done.slice(0, PREVIEW)

  return (
    <Panel
      title={txa('Tamamlanan görevler')}
      icon={Trophy}
      tone='emerald'
      meta={done.length ? txa('{v1} görev · {v2} coin kazanıldı', { v1: done.length, v2: coins.toLocaleString(intlLocale()) }) : undefined}
      action={done.length > PREVIEW ? { label: expanded ? txa('Daha az') : txa('Tümünü gör'), onClick: () => setExpanded((value) => !value) } : undefined}
    >
      {loading ? (
        <div className='flex flex-col gap-2'>{[0, 1, 2].map((key) => <span key={key} className='h-11 animate-pulse rounded-xl bg-muted/50' />)}</div>
      ) : error ? (
        <PanelEmpty icon={Trophy} title={error} />
      ) : done.length === 0 ? (
        <PanelEmpty icon={Trophy} title={txa('Henüz tamamlanan görev yok')} hint={txa('Görevler sayfasından ilk ödülünü al.')} />
      ) : (
        <ul className='grid gap-x-6 md:grid-cols-2'>
          {visible.map((task) => (
            <li key={task.taskId} className='flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0'>
              {task.badgeImageUrl
                ? <img src={task.badgeImageUrl} alt='' className='size-7 flex-none object-contain' />
                : <CheckCircle weight='fill' size={22} className='flex-none text-emerald-400' />}
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-[13px] font-bold'>{txa(task.title)}</span>
                {task.claimedAt && <span className='block text-[11px] text-muted-foreground'>{new Date(task.claimedAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
              </span>
              {task.coinReward > 0 && (
                <span className='flex flex-none items-center gap-1 text-[12px] font-extrabold text-amber-300'>
                  <Coins weight='fill' size={13} />+{task.coinReward.toLocaleString(intlLocale())}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
