import { Sparkles } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { UserProgression } from '@/services/userProgressionService'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ProfileLevelProgressProps {
  progression: UserProgression
}

export function ProfileLevelProgress({ progression }: ProfileLevelProgressProps) {
  const hasVisibleStats = progression.progressPercent !== null
  const progressValue = progression.progressPercent ?? 0

  return (
    <section
      className="mt-3 max-w-sm rounded-xl border border-border/50 bg-card/55 px-3 py-2.5 backdrop-blur-md"
      aria-label={txa('Kullanıcı seviye ilerlemesi')}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
          <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{txa('Seviye {v1} · {v2}', { v1: progression.levelNumber, v2: txa(progression.title) })}</span>
        </span>
        {hasVisibleStats ? (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {progression.totalXp?.toLocaleString(intlLocale())} XP
          </span>
        ) : null}
      </div>

      {hasVisibleStats ? (
        <>
          <Progress
            value={progressValue}
            className="mt-2 h-1.5"
            aria-label={txa('Seviye ilerlemesi yüzde {v1}', { v1: progressValue })}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <span>{txa('%{v1} tamamlandı', { v1: progressValue })}</span>
            <span>
              {progression.isMaxLevel
                ? txa('En yüksek seviye')
                : txa('{v1} XP kaldı', { v1: (progression.xpToNextLevel ?? 0).toLocaleString(intlLocale()) })}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[10px] text-muted-foreground">{txa('İlerleme ayrıntıları profil sahibi tarafından gizlendi.')}</p>
      )}
    </section>
  )
}
