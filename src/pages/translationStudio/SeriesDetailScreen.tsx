import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ClockCounterClockwise, PencilSimple, Plus } from '@phosphor-icons/react'
import {
  listFansubSeries, listSeriesChapters, openChapterRevision,
  type TlFansubSeries, type TlSeriesChapter, type TlSeriesProjectBrief,
} from '@/services/translationSeriesService'
import { TL_SOURCE_LANGUAGES } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { Badge, SeriesBadges } from './StudioMySeries'
import { SeriesEditPanel } from './SeriesEditPanel'
import { formatShortDate } from './studioHelpers'
import { GhostButton, PrimaryButton } from './studioUi'
import { txa } from '@/i18n/activeLocale'

/*
 * Series details: this team's chapters. From here
 * - new chapter translation (the wizard enters /yeni/bolum with manga_id),
 * - series info editing (to approval as a revision),
 * - opening a published chapter in the studio as a revision (the old version stays live until approved).
 */

const STAGE_LABEL: Record<string, string> = {
  get upload() { return txa('Yüklemede') }, get scan() { return txa('Taramada') }, get edit() { return txa('Düzenlemede') }, get publish() { return txa('Yayına hazır') },
  get scheduled() { return txa('Zamanlandı') }, get published() { return txa('Yayında') }, get archived() { return txa('Arşivde') },
}

export function SeriesDetailScreen({ fansubId, seriesId, canProject, canEditSeries, onNewChapter, onOpenProject, onToast }: {
  fansubId: string
  seriesId: string
  /** ceviri.proje: opening new chapters and revisions. */
  canProject: boolean
  /** ceviri.proje or panel.bolumler: series info editing. */
  canEditSeries: boolean
  onNewChapter: (series: TlFansubSeries, nextChapter: number | null) => void
  onOpenProject: (projectId: string, stage: string) => void
  onToast: (message: string) => void
}) {
  const [series, setSeries] = useState<TlFansubSeries | null>(null)
  const [chapters, setChapters] = useState<TlSeriesChapter[]>([])
  const [projects, setProjects] = useState<TlSeriesProjectBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busyChapter, setBusyChapter] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    Promise.all([listFansubSeries(fansubId, controller.signal), listSeriesChapters(fansubId, seriesId, controller.signal)])
      .then(([allSeries, detail]) => {
        const found = allSeries.find((item) => item.id === seriesId) ?? null
        setSeries(found)
        setChapters(detail.chapters)
        setProjects(detail.projects)
        setError(found ? null : txa('Seri bulunamadı ya da ekibinle ilişkili değil.'))
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toUserFacingErrorMessage(reason, txa('Seri açılamadı.')))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [fansubId, seriesId, reloadKey])

  const openRevision = useCallback(async (chapter: TlSeriesChapter) => {
    if (busyChapter) return
    setBusyChapter(chapter.id)
    try {
      const projectId = await openChapterRevision(chapter.id)
      // A studio chapter copies with its fields (edit); a classic chapter is first imported raw (upload).
      onOpenProject(projectId, chapter.projectId ? 'edit' : 'upload')
    } catch (reason) {
      onToast(toUserFacingErrorMessage(reason, txa('Revizyon açılamadı.')))
    } finally {
      setBusyChapter(null)
    }
  }, [busyChapter, onOpenProject, onToast])

  if (loading && !series) return <Note text={txa('Seri yükleniyor…')} />
  if (error || !series) return <Note text={error ?? txa('Seri bulunamadı.')} />

  const nextChapter = chapters.length ? Math.floor(Math.max(...chapters.map((chapter) => chapter.chapterNumber))) + 1 : null

  return (
    <div className='tl-screen flex min-h-0 flex-1 justify-center overflow-y-auto p-6 sm:p-10' data-testid='tl-series-detail'>
      <div className='flex w-full max-w-[960px] flex-col gap-6'>
        <div className='flex flex-col gap-5 sm:flex-row sm:items-start'>
          {series.coverUrl
            ? <img src={series.coverUrl} alt='' className='h-[180px] w-[120px] flex-none rounded-xl object-cover' />
            : <span className='tl-hatch h-[180px] w-[120px] flex-none rounded-xl' />}
          <div className='flex min-w-0 flex-1 flex-col gap-2.5'>
            <h1 className='tl-serif m-0 text-[32px] leading-tight'>{series.title}</h1>
            <SeriesBadges series={series} />
            <span className='text-[13px] font-semibold text-[var(--tl-mut)]'>
              {TL_SOURCE_LANGUAGES[series.sourceLanguage].label} · {txa('{v1} bölüm ({v2} yayında) · son güncelleme {v3}', { v1: series.chapterCount, v2: series.liveChapterCount, v3: formatShortDate(series.lastUpdate) })}
            </span>
            {series.description && <p className='m-0 line-clamp-3 text-[13.5px] font-medium leading-relaxed text-[var(--tl-fg2)]'>{series.description}</p>}
            <div className='mt-1 flex flex-wrap gap-2'>
              {series.kind === 'manga' && (
                <PrimaryButton size='sm' onClick={() => onNewChapter(series, nextChapter)} disabled={!canProject} data-testid='tl-series-new-chapter'>
                  <Plus weight='bold' size={13} />
                  {txa('Yeni bölüm çevir')}
                </PrimaryButton>
              )}
              {series.kind === 'manga' && series.isApproved && (
                <GhostButton onClick={() => setEditing((value) => !value)} disabled={!canEditSeries} className='h-9 px-3.5 text-[12.5px]' data-testid='tl-series-edit-open'>
                  <PencilSimple weight='bold' size={13} />
                  {txa('Seri bilgilerini düzenle')}
                </GhostButton>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <SeriesEditPanel
            fansubId={fansubId}
            series={series}
            onClose={() => setEditing(false)}
            onSubmitted={(message) => { setEditing(false); onToast(message); setReloadKey((key) => key + 1) }}
          />
        )}

        {projects.length > 0 && (
          <section className='flex flex-col gap-2'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Stüdyoda süren çalışmalar')}</span>
            {projects.map((project) => (
              <button
                key={project.id}
                type='button'
                onClick={() => onOpenProject(project.id, project.stage)}
                className='flex items-center gap-3 rounded-xl border border-[var(--tl-line)] bg-transparent px-3.5 py-2.5 text-left text-[var(--tl-fg)] hover:border-[var(--tl-p35)]'
              >
                <span className='flex-1 text-sm font-bold'>{txa('Bölüm {v1}', { v1: project.chapterNumber })}</span>
                <span className='text-xs font-semibold text-[var(--tl-mut)]'>{STAGE_LABEL[project.stage] ?? project.stage} · {formatShortDate(project.updatedAt)}</span>
                <ArrowRight weight='bold' size={14} className='text-[var(--tl-mut)]' />
              </button>
            ))}
          </section>
        )}

        <section className='flex flex-col gap-2' data-testid='tl-series-chapters'>
          <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Bölümler')}</span>
          {chapters.length === 0 && <span className='text-[13px] font-semibold text-[var(--tl-dim)]'>{txa('Bu seride ekibinin yayınladığı bölüm yok.')}</span>}
          {chapters.map((chapter) => (
            <div key={chapter.id} className='flex flex-wrap items-center gap-3 rounded-xl border border-[var(--tl-line)] px-3.5 py-2.5'>
              <span className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='truncate text-sm font-bold'>{txa('Bölüm {v1}', { v1: chapter.chapterNumber })}{chapter.title ? ` · ${chapter.title}` : ''}</span>
                <span className='flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--tl-mut)]'>
                  {txa('{v1} sayfa', { v1: chapter.pageCount })} · {formatShortDate(chapter.updatedAt)}
                  {chapter.isApproved && chapter.isActive ? <Badge tone='green'>{txa('Yayında')}</Badge> : <Badge tone='amber'>{chapter.isApproved ? txa('Pasif') : txa('Onay bekliyor')}</Badge>}
                  {chapter.pendingRevision && <Badge tone='p'>{txa('Revizyon onay bekliyor')}</Badge>}
                  {chapter.projectId && <Badge tone='mut'>{txa('Stüdyo')}</Badge>}
                </span>
              </span>
              {chapter.revisionProjectId ? (
                <GhostButton onClick={() => onOpenProject(chapter.revisionProjectId as string, chapter.revisionStage ?? 'edit')} className='h-9 px-3 text-[12.5px]'>
                  <ClockCounterClockwise weight='bold' size={13} />
                  {txa('Revizyonu aç')} · {STAGE_LABEL[chapter.revisionStage ?? ''] ?? txa('Düzenlemede')}
                </GhostButton>
              ) : chapter.isApproved ? (
                <GhostButton
                  onClick={() => { void openRevision(chapter) }}
                  disabled={!canProject || busyChapter === chapter.id}
                  className='h-9 px-3 text-[12.5px]'
                  title={txa('Yayındaki sürüm onaya kadar okuyucuda kalır')}
                  data-testid='tl-series-open-revision'
                >
                  <ClockCounterClockwise weight='bold' size={13} />
                  {busyChapter === chapter.id ? txa('Açılıyor…') : txa('Stüdyoda revizyon aç')}
                </GhostButton>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function Note({ text }: { text: string }) {
  return <div className='flex flex-1 items-center justify-center p-10 text-center text-sm font-semibold text-[var(--tl-mut)]'>{text}</div>
}
