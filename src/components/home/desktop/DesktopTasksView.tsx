import { useState } from 'react'
import { Check, ChevronRight, Coins, Gift, Loader2, Lock, Trophy } from 'lucide-react'
import type { Quest } from '@/services/rewardService'
import type { QuestChain } from '@/components/common/questChainTypes'
import { cn } from '@/lib/utils'
import { useTx } from '@/i18n/LocaleProvider'
import { intlLocale, txa } from '@/i18n/activeLocale'

type Props = {
  quests: Quest[]; chains: QuestChain[]; loading: boolean; error: boolean; onRetry: () => void
  claiming: boolean; onClaim: (quest: Quest) => void; onClaimAll: () => void
  onNavigate: (path: string) => void; routes: Record<string, { path: string; label: string }>
}
const number = (value: number) => value.toLocaleString(intlLocale())
export function DesktopTasksView({ quests, chains, loading, error, onRetry, claiming, onClaim, onClaimAll, onNavigate, routes }: Props) {
  const [tab, setTab] = useState<'achievement' | 'daily' | 'weekly'>('achievement')
  const [expanded, setExpanded] = useState<string | null>(null)
  const tx = useTx()
  const available = quests.filter(q => q.isClaimable && !q.isClaimed && !q.isLocked)
  const claimed = quests.filter(q => q.isClaimed)
  function taskRow(q: Quest) {
    const route = routes[q.metricKey]
    const pct = Math.min(100, Math.max(0, q.progressValue / Math.max(1, q.targetValue) * 100))
    return <div key={q.questId} className="dq-task" data-state={q.isClaimed ? 'done' : q.isLocked ? 'locked' : 'active'}>
      <div className="dq-task-title"><strong>{q.title}</strong><span className="dq-coin"><Coins size={14} />+{number(q.coinReward)}</span></div>
      <p>{q.description}</p>
      <div className="dq-progress"><span><i style={{ width: `${pct}%` }} /></span><small>{number(q.progressValue)}/{number(q.targetValue)}</small></div>
      {q.isClaimed ? <span className="dq-status"><Check size={14} />{tx('Ödül alındı')}</span> : q.isLocked ? <span className="dq-status"><Lock size={14} />{tx('Önceki adımı tamamla')}</span> : q.isClaimable ? <button className="dq-action" disabled={claiming} onClick={() => onClaim(q)}><Gift size={14} />{tx('Ödülü al')}</button> : route ? <button className="dq-action" onClick={() => onNavigate(route.path)}>{route.label}<ChevronRight size={14} /></button> : <span className="dq-status">{tx('Devam ediyor')}</span>}
      {q.rewardItemName && <small className="dq-extra">{tx('Ek ödül: {name}', { name: q.rewardItemName })}</small>}
    </div>
  }
  return <div className="dq-view">
    <div className="dq-summary">{[
      [tx('Tamamlanan'), `${claimed.length}/${quests.length}`],
      [tx('Kazanılan Coin'), number(claimed.reduce((sum, q) => sum + q.coinReward, 0))],
      [tx('Bekleyen Coin'), number(available.reduce((sum, q) => sum + q.coinReward, 0))],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{loading ? '—' : value}</strong></div>)}</div>
    <div className="dq-tabs" aria-label={tx('Görev türü')}>{([['achievement', txa('Başarımlar')], ['daily', txa('Günlük')], ['weekly', txa('Haftalık')]] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{tx(label)}</button>)}</div>
    {loading ? <p className="dq-status" role="status"><Loader2 className="animate-spin" size={18} />{tx('Görevler yükleniyor…')}</p> : error ? <p role="alert">{tx('Görevler yüklenemedi.')} <button className="dq-action" onClick={onRetry}>{tx('Tekrar dene')}</button></p> : <>
      {available.length > 0 && <button className="dq-action" disabled={claiming} onClick={onClaimAll}><Gift size={16} />{claiming ? tx('İşleniyor…') : tx('{count} görevin ödülünü al', { count: available.length })}</button>}
      {tab === 'achievement' ? chains.length ? chains.map(chain => {
        const Icon = chain.theme.icon
        const open = expanded === chain.groupKey
        return <div key={chain.groupKey} className={cn('dq-chain bg-gradient-to-br', chain.theme.gradient, chain.theme.border)}>
          <button className="dq-chain-trigger" aria-expanded={open} onClick={() => setExpanded(open ? null : chain.groupKey)}>
            <span className={cn('dq-icon', chain.theme.bgBadge)}><Icon size={22} /></span>
            <span className="dq-chain-copy"><strong>{chain.theme.label}{chain.isAllCompleted && <Check size={14} />}</strong><small>{chain.isAllCompleted ? tx('Tüm adımlar tamamlandı') : chain.activeStep?.title || tx('Önceki adımlar bekleniyor')}</small><span className="dq-progress"><span><i className={chain.theme.progressBg} style={{ width: `${chain.completedCount / Math.max(1, chain.totalCount) * 100}%` }} /></span><small>{chain.completedCount}/{chain.totalCount}</small></span></span>
            <span className="dq-coin"><Coins size={14} />+{number(chain.totalCoinReward)}</span><ChevronRight size={15} className={open ? 'rotate-90' : ''} />
          </button>
          {open && <div className="dq-chain-steps">{chain.steps.map(taskRow)}</div>}
        </div>
      }) : <p className="dq-status"><Trophy size={18} />{tx('Henüz başarım yok.')}</p> : <><p className="dq-reset">{tab === 'daily' ? tx('Her gece yenilenir') : tx('Her pazartesi yenilenir')}</p>{quests.filter(q => q.kind === tab).length ? quests.filter(q => q.kind === tab).map(taskRow) : <p className="dq-status">{tx('Şu anda görev yok.')}</p>}</>}
    </>}
  </div>
}
