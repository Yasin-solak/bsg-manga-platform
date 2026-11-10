import { useEffect, useState } from 'react'
import { Books, CaretRight } from '@phosphor-icons/react'
import { listFansubSeries, type TlFansubSeries } from '@/services/translationSeriesService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { formatShortDate } from './studioHelpers'
import { txa } from '@/i18n/activeLocale'

/*
 * Start screen "My series": the team's series on the site (including those uploaded through the classic flow),
 * series with a studio project and series drafts pending approval.
 */

export function SeriesBadges({ series }: { series: TlFansubSeries }) {
  return (
    <span className='flex flex-wrap gap-1'>
      {series.kind === 'draft'
        ? <Badge tone='amber'>{txa('Seri onayı bekliyor')}</Badge>
        : series.isApproved && series.isActive
          ? <Badge tone='green'>{txa('Yayında')}</Badge>
          : <Badge tone='amber'>{series.isApproved ? txa('Pasif') : txa('Onay bekliyor')}</Badge>}
      {series.pendingRevision && <Badge tone='p'>{txa('Onay bekleyen revizyon')}</Badge>}
      {series.isMature && <Badge tone='red'>+18</Badge>}
      {series.kind === 'manga' && !series.isMine && <Badge tone='mut'>{txa('Ortak seri')}</Badge>}
    </span>
  )
}

const TONES = {
  green: 'bg-[color-mix(in_srgb,var(--tl-green)_18%,transparent)] text-[var(--tl-green)]',
  amber: 'bg-[color-mix(in_srgb,var(--tl-amber)_18%,transparent)] text-[var(--tl-amber)]',
  red: 'bg-[var(--tl-red)] text-white',
  p: 'bg-[var(--tl-p15)] text-[var(--tl-p)]',
  mut: 'bg-[var(--tl-acc)] text-[var(--tl-mut)]',
} as const

export function Badge({ tone, children }: { tone: keyof typeof TONES, children: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-extrabold ${TONES[tone]}`}>{children}</span>
}

export function StudioMySeries({ fansubId, onOpen }: {
  fansubId: string
  onOpen: (series: TlFansubSeries) => void
}) {
  const [series, setSeries] = useState<TlFansubSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    listFansubSeries(fansubId, controller.signal)
      .then((rows) => { setSeries(rows); setError(null) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toUserFacingErrorMessage(reason, txa('Seriler yüklenemedi.')))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [fansubId])

  if (!loading && !error && series.length === 0) return null

  return (
    <div className='flex flex-col gap-2.5 border-t border-[var(--tl-line)] pt-[22px]' data-testid='tl-my-series'>
      <span className='flex items-center gap-2 text-xs font-bold text-[var(--tl-mut)]'>
        <Books weight='bold' size={14} />
        {txa('Serilerimiz')}
      </span>
      {loading && <span className='text-[12.5px] font-semibold text-[var(--tl-dim)]'>{txa('Yükleniyor…')}</span>}
      {error && <span className='text-[12.5px] font-semibold text-[var(--tl-red)]'>{error}</span>}
      <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2'>
        {series.map((item) => (
          <button
            key={`${item.kind}:${item.id}`}
            type='button'
            onClick={() => onOpen(item)}
            className='flex items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-transparent p-2.5 text-left text-[var(--tl-fg)] transition-colors hover:border-[var(--tl-p35)]'
            data-testid='tl-my-series-item'
          >
            {item.coverUrl
              ? <img src={item.coverUrl} alt='' loading='lazy' className='h-[72px] w-12 flex-none rounded-md object-cover' />
              : <span className='tl-hatch h-[72px] w-12 flex-none rounded-md' />}
            <span className='flex min-w-0 flex-1 flex-col gap-1'>
              <span className='truncate text-sm font-bold'>{item.title}</span>
              <span className='text-xs font-semibold text-[var(--tl-mut)]'>
                {item.kind === 'draft' ? txa('{v1} çalışma', { v1: item.openProjectCount }) : txa('{v1} bölüm', { v1: item.chapterCount })}
                {item.openProjectCount > 0 && item.kind === 'manga' ? txa(' · {v1} açık çalışma', { v1: item.openProjectCount }) : ''}
                {' · '}{formatShortDate(item.lastUpdate)}
              </span>
              <SeriesBadges series={item} />
            </span>
            <CaretRight weight='bold' size={15} className='flex-none text-[var(--tl-mut)]' />
          </button>
        ))}
      </div>
    </div>
  )
}
