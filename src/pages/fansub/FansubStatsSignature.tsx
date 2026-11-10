import { BookOpen, Clock3, Sparkles, Users, type LucideIcon } from 'lucide-react'
import type { ExtendedFansub, FansubChapterPreview, FansubMangaShelfItem } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubStatsSignatureProps = {
  canSeePending: boolean
  chapters: FansubChapterPreview[]
  fansub: ExtendedFansub
  mangas: FansubMangaShelfItem[]
  membersCount: number
}

type SignalTrackProps = {
  accentClass: string
  fillPercent: number
  icon: LucideIcon
  label: string
  note: string
  value: string
}

function scaleToPercent(value: number, ceiling: number) {
  if (value <= 0) return 16
  const scaled = (Math.log10(value + 1) / Math.log10(ceiling + 1)) * 100
  return Math.max(18, Math.min(100, Math.round(scaled)))
}

function buildSeriesGradient(colors: string[]) {
  const fallback = [
    'hsl(var(--primary) / 0.82)',
    'hsl(var(--secondary) / 0.54)',
    'hsl(var(--chart-1) / 0.38)',
    'hsl(var(--chart-2) / 0.42)',
  ]
  const palette = colors.length > 0 ? colors : fallback
  return `conic-gradient(from 180deg, ${palette.join(', ')})`
}

function SignalTrack({
  accentClass,
  fillPercent,
  icon: Icon,
  label,
  note,
  value,
}: SignalTrackProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
      <div className={`flex size-10 items-center justify-center rounded-[16px] bg-gradient-to-br ${accentClass} text-foreground shadow-[0_18px_48px_-24px_hsl(var(--foreground)/0.55)]`}>
        <Icon className="size-4" />
      </div>

      <div className="min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
          </div>
          <p className="shrink-0 text-[11px] text-muted-foreground">{note}</p>
        </div>

        <div className="mt-2 h-[9px] overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${accentClass}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function SeriesRibbon({
  chapterCount,
  index,
  title,
}: {
  chapterCount: number
  index: number
  title: string
}) {
  const accentClass = [
    'from-primary/80 via-primary/55 to-primary/20',
    'from-secondary/80 via-secondary/55 to-secondary/20',
    'from-chart-1/85 via-chart-1/55 to-chart-1/20',
    'from-chart-2/80 via-chart-2/55 to-chart-2/20',
  ][index % 4]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="truncate">{title}</span>
        <span>{chapterCount.toLocaleString(intlLocale())}</span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-black/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${accentClass}`}
          style={{ width: `${Math.max(12, Math.min(100, scaleToPercent(chapterCount, 300))) }%` }}
        />
      </div>
    </div>
  )
}

export default function FansubStatsSignature({
  canSeePending,
  chapters,
  fansub,
  mangas,
  membersCount,
}: FansubStatsSignatureProps) {
  const approvedChapterCount = chapters.filter((chapter) => !chapter.isPending).length
  const pendingChapterCount = canSeePending ? chapters.filter((chapter) => chapter.isPending).length : 0
  const followerCount = fansub.followerCount || 0
  const activeSeriesCount = mangas.length
  const topSeries = [...mangas]
    .sort((a, b) => (b.approvedChapterCount + b.pendingChapterCount) - (a.approvedChapterCount + a.pendingChapterCount))
    .slice(0, 4)
  const dominantSeries = topSeries[0]?.title || txa('Dağılım yok')
  const latestChapter = chapters[0] || null
  const releaseVelocityNote = latestChapter
    ? new Date(latestChapter.publishAt || latestChapter.createdAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
    : txa('Henüz yayın yok')
  const releaseScale = scaleToPercent(approvedChapterCount, 800)
  const followerScale = scaleToPercent(followerCount, 20000)
  const memberScale = scaleToPercent(membersCount, 80)
  const ringGradient = buildSeriesGradient([
    'hsl(var(--primary) / 0.82)',
    'hsl(var(--secondary) / 0.54)',
    'hsl(var(--chart-1) / 0.38)',
    'hsl(var(--chart-2) / 0.42)',
  ])

  return (
    <section className="relative isolate overflow-hidden rounded-[34px] bg-[linear-gradient(160deg,hsl(var(--background))_0%,hsl(var(--card))_42%,hsl(var(--muted)/0.72)_100%)] px-5 py-5 shadow-[0_26px_90px_-52px_hsl(var(--foreground)/0.5)] sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-primary/12 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-12 bottom-0 h-36 w-36 rounded-full bg-secondary/14 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-x-5 top-[108px] h-px bg-gradient-to-r from-primary/35 via-white/10 to-transparent sm:inset-x-6 sm:top-[118px]" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,transparent_24%,hsl(var(--foreground)/0.03)_24%,transparent_56%,hsl(var(--foreground)/0.025)_56%,transparent_100%)]" aria-hidden />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            <Sparkles className="size-3.5 text-primary" />
            {txa('Yayın izi')}
          </div>
          <p className="text-right text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {txa('Fansub istatistik sahası')}
          </p>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_124px] sm:items-start">
          <div className="min-w-0">
            <div className="flex items-end gap-3">
              <span className="text-[52px] font-semibold leading-none tracking-[-0.04em] text-foreground">
                {approvedChapterCount.toLocaleString(intlLocale())}
              </span>
              <span className="pb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {txa('yayındaki bölüm')}
              </span>
            </div>

            <p className="mt-3 max-w-[32ch] text-sm leading-7 text-muted-foreground">
              {topSeries.length > 0
                ? txa('{v1} çekirdek seriye dönüşmüş durumda. Takip ve ekip sinyalleri aynı omurga üzerinden okunuyor.', { v1: dominantSeries })
                : txa('Yayın verisi biriktikçe bu alan seri dağılımını ve topluluk etkisini daha belirgin gösterecek.')}
            </p>
          </div>

          <div className="justify-self-start sm:justify-self-end">
            <div className="relative size-[116px]">
              <div
                className="absolute inset-0 rounded-full shadow-[0_18px_44px_-24px_hsl(var(--foreground)/0.45)]"
                style={{ background: ringGradient }}
              />
              <div className="absolute inset-[10px] rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,hsl(var(--background)/0.98),hsl(var(--card)/0.9))]" />
              <div className="absolute inset-[25px] rounded-full border border-white/8 bg-background/95" />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Baskın seri')}</span>
                <span className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">{dominantSeries}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4">
          <SignalTrack
            accentClass="from-primary/85 via-primary/55 to-primary/20"
            fillPercent={releaseScale}
            icon={BookOpen}
            label={txa('Yayın hacmi')}
            note={txa('{v1} bolum', { v1: approvedChapterCount.toLocaleString(intlLocale()) })}
            value="Toplam gorunen akis"
          />
          <SignalTrack
            accentClass="from-secondary/80 via-secondary/55 to-secondary/20"
            fillPercent={followerScale}
            icon={Clock3}
            label={txa('Takip çekimi')}
            note={releaseVelocityNote}
            value={txa('{v1} takipci', { v1: followerCount.toLocaleString(intlLocale()) })}
          />
          <SignalTrack
            accentClass="from-chart-1/85 via-chart-1/55 to-chart-1/20"
            fillPercent={memberScale}
            icon={Users}
            label={txa('Ekip omurgası')}
            note={txa('{v1} seri', { v1: activeSeriesCount.toLocaleString(intlLocale()) })}
            value={txa('{v1} uye', { v1: membersCount.toLocaleString(intlLocale()) })}
          />
        </div>

        <div className="mt-8 grid gap-4 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{txa('Seri dağılımı')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {txa('Uretim merkezi {v1} etrafinda toplaniyor.', { v1: topSeries.length > 0 ? dominantSeries : txa('henüz belirgin değil') })}
              </p>
            </div>
            <div className="text-right text-xs font-medium text-foreground">
              {pendingChapterCount > 0 && canSeePending ? `${pendingChapterCount} bekleyen` : txa('Bekleyen yok')}
            </div>
          </div>

          {topSeries.length > 0 ? (
            <div className="grid gap-3">
              {topSeries.map((manga, index) => (
                <SeriesRibbon
                  key={manga.id}
                  chapterCount={manga.approvedChapterCount + (canSeePending ? manga.pendingChapterCount : 0)}
                  index={index}
                  title={manga.title}
                />
              ))}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              {txa('Henüz çıkarılmış bir seri dağılımı yok.')}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
