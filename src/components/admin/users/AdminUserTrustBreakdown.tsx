import { ArrowDown, ArrowUp, Equal, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getTrustScoreFactors,
  type AdminUserTrustFactorTone,
  type AdminUserTrustView,
} from './adminUsersUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminUserTrustBreakdownProps {
  trust: AdminUserTrustView
}

export function AdminUserTrustBreakdown({ trust }: AdminUserTrustBreakdownProps) {
  const factors = getTrustScoreFactors(trust)

  return (
    <div className="mt-3 border-t border-border/80 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-[11px] font-semibold text-foreground">{txa('Puan dökümü')}</h5>
        {trust.algorithmVersion ? (
          <span className="truncate text-[9px] text-muted-foreground" title={`Algoritma: ${trust.algorithmVersion}`}>
            {trust.algorithmVersion}
          </span>
        ) : null}
      </div>

      {factors.length > 0 ? (
        <ul className="mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-4" aria-label={txa('Güven skoru artı ve eksi puanları')}>
          {factors.slice(0, 4).map((factor) => {
            const Icon = iconForTone(factor.tone)
            return (
              <li
                key={factor.id}
                className={cn(
                  'min-w-0 rounded-lg border px-2.5 py-2',
                  factor.tone === 'override'
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border/70 bg-card/70',
                )}
                title={factor.detail}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full', toneIconClass(factor.tone))} aria-hidden="true">
                    <Icon className="size-3" />
                  </span>
                  <strong
                    className={cn('text-[10px] tabular-nums', toneTextClass(factor.tone))}
                    aria-label={factorPointsAriaLabel(factor.points, factor.tone)}
                  >
                    {formatFactorPoints(factor.points, factor.tone)}
                  </strong>
                </div>
                <p className="mt-1.5 truncate text-[10px] font-medium leading-4 text-foreground">{factor.label}</p>
                <p className="truncate text-[9px] leading-3.5 text-muted-foreground">{factor.detail}</p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          {txa('Bu kayıt için sunucu kaynaklı puan dökümü bulunmuyor.')}
        </p>
      )}
    </div>
  )
}

function iconForTone(tone: AdminUserTrustFactorTone) {
  if (tone === 'positive') return ArrowUp
  if (tone === 'negative') return ArrowDown
  if (tone === 'override') return ShieldAlert
  return Equal
}

function toneIconClass(tone: AdminUserTrustFactorTone) {
  if (tone === 'positive') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (tone === 'negative' || tone === 'override') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function toneTextClass(tone: AdminUserTrustFactorTone) {
  if (tone === 'positive') return 'text-emerald-700 dark:text-emerald-300'
  if (tone === 'negative' || tone === 'override') return 'text-destructive'
  return 'text-muted-foreground'
}

function formatFactorPoints(points: number | null, tone: AdminUserTrustFactorTone) {
  if (tone === 'override') return txa('Skor = 0')
  if (points === null) return '—'
  const value = Number.isInteger(points) ? String(points) : points.toFixed(1)
  return points > 0 ? `+${value}` : value
}

function factorPointsAriaLabel(points: number | null, tone: AdminUserTrustFactorTone) {
  if (tone === 'override') return txa('Aktif ban kuralı nedeniyle nihai skor sıfır')
  if (points === null) return txa('Puan bilgisi yok')
  if (points > 0) return txa('{v1} artı puan', { v1: points })
  if (points < 0) return txa('{v1} eksi puan', { v1: Math.abs(points) })
  return txa('Sıfır puan')
}
