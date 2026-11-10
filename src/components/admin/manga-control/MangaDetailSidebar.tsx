import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Link } from '@/i18n/router'
import type { AdminMangaControlDetail, AdminMangaDetailMetrics } from '@/services/adminService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Left rail of the detail window: PERSISTENT CONTEXT.
 *
 * In the old window identity, warnings and metrics were scattered among tabs;
 * moving to "Comments" you forgot what the series was. The rail never
 * scrolls and never changes, leaving the right side free as a work area.
 *
 * Rail ORDER is by importance: first what is wrong (warnings),
 * then how much interest it gets, technical details last.
 */

interface MangaDetailSidebarProps {
  detail: AdminMangaControlDetail
  metrics: AdminMangaDetailMetrics | null
  metricsLoading: boolean
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysAgo(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
}

export function MangaDetailSidebar({ detail, metrics, metricsLoading }: MangaDetailSidebarProps) {
  const lastChapterDays = daysAgo(metrics?.lastChapterAt)

  const warnings: string[] = []
  if (detail.chapterStats.pending > 0) {
    warnings.push(txa('{v1} çeviri inceleme bekliyor', { v1: detail.chapterStats.pending }))
  }
  if (metrics && metrics.emptyPageChapters > 0) {
    warnings.push(txa('{v1} bölümün sayfası yok — yükleme yarım', { v1: metrics.emptyPageChapters }))
  }
  if (detail.chapterStats.total === 0) {
    warnings.push(txa('Hiç bölümü yok — okuyucu için çıkmaz sokak'))
  }
  if (lastChapterDays !== null && lastChapterDays > 180) {
    warnings.push(txa('Son bolum {v1} gün önce — seri durmuş olabilir', { v1: lastChapterDays }))
  }
  const missingMeta = [
    !detail.coverImageUrl ? 'kapak' : null,
    detail.genres.length === 0 ? 'tur' : null,
    !detail.description?.trim() ? 'aciklama' : null,
  ].filter(Boolean)
  if (missingMeta.length > 0) warnings.push(txa('Künye eksik: {v1}', { v1: missingMeta.join(', ') }))

  return (
    <aside
      className="flex w-full shrink-0 flex-col gap-3 border-border bg-muted/20 p-4 lg:min-h-0 lg:w-[264px] lg:overflow-y-auto lg:border-r"
      data-testid="admin-manga-detail-sidebar"
    >
      <div className="flex gap-3">
        <img
          loading="lazy"
          decoding="async"
          src={detail.coverImageUrl}
          alt=""
          className="h-[92px] w-[66px] shrink-0 rounded-md border border-border object-cover"
        />
        <div className="min-w-0">
          <h3 className="m-0 font-heading text-base leading-tight text-foreground">{detail.title}</h3>
          <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">{detail.slug}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant={detail.isApproved ? 'default' : 'secondary'} className="rounded-full text-[10px]">
              {detail.isApproved ? txa('Onaylı') : txa('Onay bekliyor')}
            </Badge>
            <Badge variant={detail.isActive ? 'default' : 'destructive'} className="rounded-full text-[10px]">
              {detail.isActive ? txa('Yayında') : txa('Yayında değil')}
            </Badge>
          </div>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" className="min-h-11 w-full" asChild>
        <Link
          to={buildPublicMangaPath({ id: detail.id, slug: detail.slug, title: detail.title })}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {txa('Herkese acik sayfa')}
        </Link>
      </Button>

      {warnings.length > 0 ? (
        <ul className="m-0 list-none space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5" data-testid="admin-manga-detail-warnings">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden="true" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-px overflow-hidden rounded-md border border-border" data-testid="admin-manga-detail-metrics">
        {metricsLoading ? (
          <p className="m-0 bg-card px-2.5 py-3 text-center text-[11px] text-muted-foreground">{txa('Metrikler yükleniyor…')}</p>
        ) : !metrics ? (
          <p className="m-0 bg-card px-2.5 py-3 text-center text-[11px] text-muted-foreground">
            {txa('Metrikler yuklenemedi (admin yetkisi gerekiyor olabilir).')}
          </p>
        ) : (
          <>
            <SidebarGroup title={txa('İlgi')} />
            <SidebarRow label={txa('Okur')} value={metrics.readersTotal.toLocaleString(intlLocale())} hint={txa('{v1} son 30g', { v1: metrics.readers30d })} />
            <SidebarRow label={txa('Takipçi')} value={metrics.followers.toLocaleString(intlLocale())} />
            <SidebarRow
              label={txa('Bu ay görüntülenme')}
              value={metrics.viewsCurrentMonth.toLocaleString(intlLocale())}
              hint={metrics.viewsPreviousMonth > 0 ? txa('geçen ay {v1}', { v1: metrics.viewsPreviousMonth.toLocaleString(intlLocale()) }) : undefined}
            />
            <SidebarRow label={txa('Son okunma')} value={formatDate(metrics.lastReadAt)} />

            <SidebarGroup title={txa('Yayın')} />
            <SidebarRow
              label={txa('Bölüm')}
              value={metrics.chapterNumbers.toLocaleString(intlLocale())}
              hint={metrics.chapterVersions > metrics.chapterNumbers ? `${metrics.chapterVersions} surum` : undefined}
            />
            <SidebarRow label={txa('Toplam sayfa')} value={metrics.pagesTotal.toLocaleString(intlLocale())} />
            <SidebarRow
              label={txa('Son bölüm')}
              value={formatDate(metrics.lastChapterAt)}
              hint={lastChapterDays === null ? undefined : txa('{v1} gün önce', { v1: lastChapterDays })}
              tone={lastChapterDays !== null && lastChapterDays > 180 ? 'warning' : undefined}
            />
            <SidebarRow
              label={txa('Tempo')}
              value={metrics.avgChapterIntervalDays === null
                ? '—'
                : txa('{v1} gun', { v1: metrics.avgChapterIntervalDays.toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) })}
              hint={metrics.avgChapterIntervalDays === null ? txa('tek bölüm') : txa('bölüm arası')}
            />
            <SidebarRow label={txa('Çeviren ekip')} value={metrics.contributorFansubs.toLocaleString(intlLocale())} />

            <SidebarGroup title={txa('Etkileşim')} />
            <SidebarRow
              label={txa('Yorum')}
              value={metrics.comments.toLocaleString(intlLocale())}
              hint={metrics.commentsInactive > 0 || metrics.commentsSpoiler > 0
                ? txa('{v1} pasif · {v2} spoiler', { v1: metrics.commentsInactive, v2: metrics.commentsSpoiler })
                : undefined}
            />
            <SidebarRow
              label={txa('Puan')}
              value={metrics.ratingAverage === null ? '—' : metrics.ratingAverage.toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}
              hint={`${metrics.ratings} oy`}
            />
          </>
        )}
      </div>
    </aside>
  )
}

function SidebarGroup({ title }: { title: string }) {
  return (
    <p className="m-0 bg-muted/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </p>
  )
}

function SidebarRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warning'
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 bg-card px-2.5 py-1.5">
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="shrink-0 text-right">
        <span className={cn(
          'block text-[13px] font-semibold tabular-nums leading-tight text-foreground',
          tone === 'warning' && 'text-amber-600 dark:text-amber-400',
        )}>
          {value}
        </span>
        {hint ? <span className="block text-[10px] leading-tight text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  )
}
