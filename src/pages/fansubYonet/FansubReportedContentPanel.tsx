/**
 * FansubReportedContentPanel: reported and removed series / chapters.
 *
 * When site admins resolve a report with "remove", content returns to the fansub for a fix.
 * The team fixes a chapter and resubmits it for review;
 * site admins handle series removals. With no pending records the panel
 * is not visible at all (sits above the Chapters tab).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { ExternalLink, Flag, ShieldAlert, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { listFansubReportedContent, type FansubReportedContentItem } from '@/services/fansubManageService'
import ReportedChapterFixDialog from './ReportedChapterFixDialog'
import { formatRelative } from './FansubYonetOverviewPanels'
import { txa } from '@/i18n/activeLocale'

function publicUrl(item: FansubReportedContentItem) {
  if (item.targetType === 'manga') return buildPublicMangaPath({ id: item.targetId, slug: item.mangaSlug })
  return buildPublicChapterPath({
    mangaSlug: item.mangaSlug,
    chapterNumber: item.chapterNumber ?? 0,
    chapterId: item.targetId,
    forceVersionQuery: true,
  })
}

export default function FansubReportedContentPanel({ fansubId, canFix, reloadToken }: {
  fansubId: string
  canFix: boolean
  reloadToken?: number
}) {
  const [items, setItems] = useState<FansubReportedContentItem[]>([])
  const [fixTarget, setFixTarget] = useState<FansubReportedContentItem | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await listFansubReportedContent(fansubId, 'open'))
    } catch {
      // If the queue cannot be read the panel stays hidden; the Chapters tab keeps working.
      setItems([])
    }
  }, [fansubId])

  useEffect(() => { void load() }, [load, reloadToken])

  if (items.length === 0) return null

  return (
    <section className="rounded-[20px] border border-rose-500/30 bg-rose-500/[0.05] p-4" data-testid="studio-reported-content">
      <h3 className="flex items-center gap-2 text-[14px] font-bold">
        <ShieldAlert className="size-4 text-rose-500" />
        {txa('Raporlanan içerik')}
        <span className="rounded-full bg-rose-500/15 px-2 text-[11.5px] tabular-nums text-rose-700 dark:text-rose-300">{items.length}</span>
      </h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{txa('Site yönetimi bu içerikleri rapor üzerine kaldırdı. Bölümü düzeltip yeniden incelemeye gönderebilirsin.')}</p>
      <ul className="mt-3 flex flex-col divide-y divide-border/50 rounded-xl border border-border/60 bg-card/60">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {item.targetType === 'manga' ? txa('Seri') : txa('Bölüm')} · {item.title}
              </span>
              <span className="block text-[11.5px] text-muted-foreground">
                {item.reason ? <><Flag className="mr-1 inline size-3 text-rose-500" />{item.reason} · </> : null}
                {txa('kaldırıldı {when}', { when: formatRelative(item.removedAt) })}
                {item.status === 'fix_submitted' ? txa(' · yeniden incelemede') : ''}
              </span>
            </span>
            <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px]">
              <Link to={publicUrl(item)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" />{txa('Görüntüle')}</Link>
            </Button>
            {item.status === 'awaiting_fix' && item.targetType === 'chapter' && canFix ? (
              <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => setFixTarget(item)} data-testid="studio-reported-fix">
                <Wrench className="size-3.5" />{txa('Düzelt ve gönder')}
              </Button>
            ) : item.status === 'awaiting_fix' ? (
              <span className="text-[11.5px] text-muted-foreground">{item.targetType === 'manga' ? txa('Site yönetimi ele alıyor') : txa('Düzeltme için ekip yöneticisi gerekli')}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <ReportedChapterFixDialog
        item={fixTarget}
        fansubId={fansubId}
        open={Boolean(fixTarget)}
        onClose={() => setFixTarget(null)}
        onFixed={() => { setFixTarget(null); void load() }}
      />
    </section>
  )
}
