import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { AdminUserProgression, AdminUserXpEvent } from '@/services/userProgressionService'
import { cn } from '@/lib/utils'
import { formatDateTime } from './adminUserDetailUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminUserProgressionDetailProps {
  progression: AdminUserProgression
}

function eventLabel(event: AdminUserXpEvent) {
  const questTitle = typeof event.metadata.quest_title === 'string'
    ? event.metadata.quest_title.trim()
    : ''
  if (questTitle) return questTitle
  if (event.reasonCode === 'quest.profile-ready') return txa('Profil tamamlandı')
  if (event.reasonCode === 'quest.post-3-quality') return txa('Nitelikli topluluk katkısı')
  if (event.sourceType === 'admin_adjustment') return txa('Admin XP düzeltmesi')
  if (event.sourceType === 'system_correction') return txa('Sistem XP düzeltmesi')
  return event.reasonCode
}

export function AdminUserProgressionDetail({ progression }: AdminUserProgressionDetailProps) {
  const percent = progression.progressPercent ?? 0

  return (
    <section className="h-full space-y-2.5 rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="admin-user-progression-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="admin-user-progression-title" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden="true" /> {txa('Seviye ve XP Dökümü')}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">{txa('Seviye {v1} · {v2}', { v1: progression.levelNumber, v2: progression.title })}</p>
        </div>
        <strong className="text-sm tabular-nums">{(progression.totalXp ?? 0).toLocaleString(intlLocale())} XP</strong>
      </div>
      <Progress value={percent} className="h-2" aria-label={txa('Seviye ilerlemesi yüzde {v1}', { v1: percent })} />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{txa('%{v1} ilerleme', { v1: percent })}</span>
        <span>{progression.isMaxLevel ? txa('En yüksek seviye') : txa('{v1} XP kaldı', { v1: (progression.xpToNextLevel ?? 0).toLocaleString(intlLocale()) })}</span>
      </div>

      <div className="border-t border-border pt-2.5">
        <p className="text-xs font-semibold text-foreground">{txa('Son XP hareketleri')}</p>
        {progression.events.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{txa('Henüz XP hareketi bulunmuyor.')}</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {progression.events.slice(0, 2).map((event) => {
              const positive = event.xpDelta > 0
              const Icon = positive ? ArrowUp : ArrowDown
              return (
                <div key={event.id} className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5">
                  <span className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full',
                    positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive',
                  )}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-foreground">{eventLabel(event)}</p>
                    <p className="text-[9px] text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
                  </div>
                  <strong className={cn(
                    'shrink-0 text-xs tabular-nums',
                    positive ? 'text-emerald-600' : 'text-destructive',
                  )}>
                    {positive ? '+' : ''}{event.xpDelta.toLocaleString(intlLocale())} XP
                  </strong>
                </div>
              )
            })}
            {progression.events.length > 2 ? (
              <p className="text-[10px] text-muted-foreground">{txa('+{v1} ek XP hareketi', { v1: progression.events.length - 2 })}</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
