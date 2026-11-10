import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import { ArrowLeft, ArrowRight, CloudCheck, CloudSlash, CloudArrowUp, PaperPlaneTilt, Translate } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { cn } from '@/lib/utils'
import { useFansubPermissions } from '@/hooks/useFansubPermissions'
import { getFansubByIdentifier } from '@/services/fansubService'
import { isFeatureEnabled } from '@/services/featureFlagService'
import {
  createProject, createSeriesDraft, getProject, listOpenProjects, listPages, setProjectStage,
  TL_SOURCE_LANGUAGES, TlProjectExistsError, type TlPage, type TlProject, type TlSeries,
} from '@/services/translationStudioService'
import { getE2EMockFansubs } from '@/testing/e2eMocks'
import type { Fansub } from '@/types'
import { EditorScreen } from './editor/EditorScreen'
import { FULL_STUDIO_ACCESS, studioAccessFrom } from './studioAccess'
import { ReviewScreen } from './editor/ReviewScreen'
import { PageTaskBar } from './editor/PageTaskBar'
import { TasksScreen } from './editor/TasksScreen'
import { listMyTasks, type TlMyTask } from '@/services/translationTaskService'
import { StepPublish } from './editor/StepPublish'
import type { SaveState } from './editor/useEditorPage'
import { StepChapter, type ChapterForm } from './StepChapter'
import { parseChapterNumber } from './studioHelpers'
import { StepScan } from './StepScan'
import { StepSeries, type SeriesDraftForm, type SeriesMode } from './StepSeries'
import { StepStart } from './StepStart'
import { StepUpload } from './StepUpload'
import { RevisionImport } from './RevisionImport'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import { StudioMySeries } from './StudioMySeries'
import { toWizardSeries, type TlFansubSeries } from '@/services/translationSeriesService'
import { GhostButton, PrimaryButton } from './studioUi'
import './translationStudio.css'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

/*
 * Translation Studio V3: /fansub/:id/studyo
 * /                      Start (new chapter + unfinished + My series)
 * /seri/:seriesId        Series details (chapters, series editing, opening revisions)
 * /yeni/seri             1 Series
 * /yeni/bolum            2 Chapter -> 'Continue' creates the project
 * /:projectId/yukle      3 Upload
 * /:projectId/tara       4 Scan
 * /:projectId/duzenle/:n 5 Edit (n = 1-based page order)
 * /:projectId/incele     5 Edit > bulk review (items of all pages in one list)
 * /:projectId/gorevler   5 Edit > tasks (page x stage assignments)
 * /:projectId/yayinla    6 Publish
 * Builds its own full-screen shell; it is in the Layout.shouldUseChrome exceptions.
 */

type Screen = 'basla' | 'seri-detay' | 'seri' | 'bolum' | 'yukle' | 'tara' | 'duzenle' | 'incele' | 'gorevler' | 'yayinla'

const STAGES: Array<{ key: Screen, label: string }> = [
  { key: 'seri', get label() { return txa('Seri') } },
  { key: 'bolum', get label() { return txa('Bölüm') } },
  { key: 'yukle', get label() { return txa('Yükle') } },
  { key: 'tara', get label() { return txa('Tara') } },
  { key: 'duzenle', get label() { return txa('Düzenle') } },
  { key: 'yayinla', get label() { return txa('Yayınla') } },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseRoute(subPath: string): { screen: Screen, projectId: string | null, pageIndex: number } {
  const parts = subPath.split('/').filter(Boolean)
  // In series details the projectId field carries the series id (no project loads, see seriesId).
  if (parts[0] === 'seri' && parts[1] && UUID.test(parts[1])) return { screen: 'seri-detay', projectId: parts[1], pageIndex: 0 }
  if (parts[0] === 'yeni' && parts[1] === 'bolum') return { screen: 'bolum', projectId: null, pageIndex: 0 }
  if (parts[0] === 'yeni') return { screen: 'seri', projectId: null, pageIndex: 0 }
  if (parts[0] && UUID.test(parts[0])) {
    const screens: Record<string, Screen> = { tara: 'tara', duzenle: 'duzenle', incele: 'incele', gorevler: 'gorevler', yayinla: 'yayinla' }
    const pageNumber = Number.parseInt(parts[2] ?? '1', 10)
    return { screen: screens[parts[1]] ?? 'yukle', projectId: parts[0], pageIndex: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber - 1 : 0 }
  }
  return { screen: 'basla', projectId: null, pageIndex: 0 }
}

const EMPTY_DRAFT: SeriesDraftForm = {
  title: '', originalTitle: '', sourceLanguage: 'ja', genres: [], cover: null, coverPreview: null, isMature: false,
}

export default function TranslationStudioPage() {
  const { id: fansubKey = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { isAdminResolved } = useResolvedAdminAccess(currentUser)
  const isSiteAdmin = currentUser?.role === 'admin' || isAdminResolved

  const base = `/fansub/${encodeURIComponent(fansubKey)}/studyo`
  const subPath = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : ''
  const route = parseRoute(subPath)
  const { screen, pageIndex } = route
  const seriesId = screen === 'seri-detay' ? route.projectId : null
  const projectId = screen === 'seri-detay' ? null : route.projectId

  const [fansub, setFansub] = useState<Fansub | null>(null)
  // E2E sahte fansubu DB'de yoktur; izin sorgusu yapilmaz (tam erisim).
  const [isMockFansub, setIsMockFansub] = useState(false)
  const [gate, setGate] = useState<'loading' | 'open' | 'closed' | 'missing'>('loading')
  const [drafts, setDrafts] = useState<TlProject[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)

  const [seriesMode, setSeriesMode] = useState<SeriesMode>('mevcut')
  const [selectedSeries, setSelectedSeries] = useState<TlSeries | null>(null)
  const [draft, setDraft] = useState<SeriesDraftForm>(EMPTY_DRAFT)
  const [chapter, setChapter] = useState<ChapterForm>({ chapterNumber: '', chapterTitle: '', sourceLanguage: 'ja' })
  const [chapterError, setChapterError] = useState<string | null>(null)
  const [existingProjectId, setExistingProjectId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [project, setProject] = useState<TlProject | null>(null)
  const [pages, setPages] = useState<TlPage[]>([])
  const [projectError, setProjectError] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [toast, setToast] = useState<string | null>(null)
  // Revision project: pages of the published classic chapter are first imported as raw.
  const [importDone, setImportDone] = useState(false)

  // Roles and Permissions: what shows and what can be touched in the studio.
  const { permissions } = useFansubPermissions(fansub?.id, Boolean(currentUser?.id) && !isMockFansub)
  const baseAccess = isSiteAdmin || isMockFansub ? FULL_STUDIO_ACCESS : studioAccessFrom(permissions)
  // AI is never used on 18+ series (the server rejects too).
  const access = project?.isMature ? { ...baseAccess, ai: false } : baseAccess

  const showToast = useCallback((message: string) => setToast(message), [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  // Fansub + erisim kapisi
  useEffect(() => {
    let cancelled = false
    setGate('loading')
    void (async () => {
      try {
        // In E2E mode the role guard redirects to a mock fansub; that record is not in the DB.
        const mock = getE2EMockFansubs()?.find((item) => item.id === fansubKey || item.slug === fansubKey)
        const resolved = mock ?? await getFansubByIdentifier(fansubKey)
        if (cancelled) return
        setFansub(resolved)
        setIsMockFansub(Boolean(mock))
        const enabled = isSiteAdmin || await isFeatureEnabled('translation.studio_v3', false)
        if (!cancelled) setGate(enabled ? 'open' : 'closed')
      } catch {
        if (!cancelled) setGate('missing')
      }
    })()
    return () => { cancelled = true }
  }, [currentUser?.id, fansubKey, isSiteAdmin])

  // Open tasks assigned to me (listed on the start screen).
  const [myTasks, setMyTasks] = useState<TlMyTask[]>([])
  useEffect(() => {
    if (gate !== 'open' || screen !== 'basla' || isMockFansub) return undefined
    const controller = new AbortController()
    listMyTasks(controller.signal).then((tasks) => { if (!controller.signal.aborted) setMyTasks(tasks) }).catch(() => {})
    return () => controller.abort()
  }, [gate, isMockFansub, screen])

  // Yarim kalan projeler
  useEffect(() => {
    if (gate !== 'open' || !fansub || screen !== 'basla') return undefined
    const controller = new AbortController()
    setDraftsLoading(true)
    listOpenProjects(fansub.id, controller.signal)
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => { if (!controller.signal.aborted) setDraftsLoading(false) })
    return () => controller.abort()
  }, [fansub, gate, screen])

  // Project + pages
  useEffect(() => {
    if (gate !== 'open' || !projectId) {
      setProject(null)
      setPages([])
      return undefined
    }
    const controller = new AbortController()
    setProjectError(null)
    Promise.all([getProject(projectId, controller.signal), listPages(projectId, controller.signal)])
      .then(([loadedProject, loadedPages]) => {
        setProject(loadedProject)
        setPages(loadedPages)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setProjectError(toUserFacingErrorMessage(error, txa('Proje açılamadı.')))
      })
    return () => controller.abort()
  }, [gate, projectId])

  const go = useCallback((path: string) => navigate(`${base}${path}`), [base, navigate])

  const seriesReady = seriesMode === 'mevcut' ? Boolean(selectedSeries) : draft.title.trim().length > 0

  // If /yeni/bolum opens directly there is no selection; it returns to the series step.
  useEffect(() => {
    if (gate === 'open' && screen === 'bolum' && !seriesReady) go('/yeni/seri')
  }, [gate, go, screen, seriesReady])

  const pickSeries = (series: TlSeries) => {
    setSelectedSeries(series)
    setChapter((current) => ({ ...current, sourceLanguage: series.sourceLanguage }))
  }

  const chapterNumber = parseChapterNumber(chapter.chapterNumber)

  const createFromWizard = async () => {
    if (!fansub || !chapterNumber || submitting) return
    setSubmitting(true)
    setChapterError(null)
    setExistingProjectId(null)
    try {
      let mangaId: string | null = null
      let seriesDraftId: string | null = null
      if (seriesMode === 'mevcut' && selectedSeries) mangaId = selectedSeries.id
      else {
        const created = await createSeriesDraft({
          fansubId: fansub.id,
          title: draft.title,
          originalTitle: draft.originalTitle,
          sourceLanguage: draft.sourceLanguage,
          genres: draft.genres,
          cover: draft.cover,
          isMature: draft.isMature,
        })
        seriesDraftId = created.id
      }
      const created = await createProject({
        fansubId: fansub.id,
        mangaId,
        seriesDraftId,
        chapterNumber,
        chapterTitle: chapter.chapterTitle,
        sourceLanguage: chapter.sourceLanguage,
      })
      setProject(created)
      go(`/${created.id}/yukle`)
    } catch (error) {
      if (error instanceof TlProjectExistsError) setExistingProjectId(error.projectId)
      setChapterError(toUserFacingErrorMessage(error, txa('Proje oluşturulamadı.')))
    } finally {
      setSubmitting(false)
    }
  }

  const openProjectById = useCallback((id: string, stage: string) => {
    const path = stage === 'upload' ? 'yukle' : stage === 'scan' ? 'tara' : stage === 'edit' ? 'duzenle' : 'yayinla'
    go(`/${id}/${path}`)
  }, [go])
  const openProject = (target: TlProject) => openProjectById(target.id, target.stage)

  // New chapter from series details: the wizard starts at the chapter step with the selected series (manga_id).
  const startChapterForSeries = (series: TlFansubSeries, nextChapter: number | null) => {
    const wizardSeries = toWizardSeries(series)
    setSeriesMode('mevcut')
    setSelectedSeries(wizardSeries)
    setChapter({ chapterNumber: nextChapter ? String(nextChapter) : '', chapterTitle: '', sourceLanguage: wizardSeries.sourceLanguage })
    setChapterError(null)
    setExistingProjectId(null)
    go('/yeni/bolum')
  }

  useEffect(() => { setImportDone(false) }, [projectId])
  const needsImport = Boolean(project?.revisionOf) && !importDone && pages.some((page) => page.rawStatus === 'empty')

  const advanceProject = async (stage: 'scan' | 'edit' | 'publish', path: 'tara' | 'duzenle' | 'yayinla') => {
    if (!project) return
    try {
      await setProjectStage(project.id, stage)
      setProject({ ...project, stage })
    } catch {
      // Asama etiketi yalniz "Basla" listesini etkiler; akisi durdurmaz.
    }
    go(`/${project.id}/${path}`)
  }

  const allPagesReady = pages.length > 0 && pages.every((page) => page.rawStatus === 'ready')
  const readyCount = pages.filter((page) => page.rawStatus === 'ready').length

  const seriesTitle = project?.seriesTitle
    ?? (seriesMode === 'mevcut' ? selectedSeries?.title : draft.title.trim()) ?? ''
  const crumbChapter = project ? project.chapterNumber : chapterNumber
  const crumb = screen === 'basla' || screen === 'seri' || screen === 'seri-detay' || !seriesTitle
    ? txa('Yeni çeviri')
    : `${seriesTitle}${crumbChapter ? txa(' · Bölüm {v1}', { v1: crumbChapter }) : ''}${project?.revisionOf ? txa(' · Revizyon') : ''}`

  // Step bar: after the project is created series/chapter lock.
  // Review is the second view of the Edit step.
  const stageScreen: Screen = screen === 'incele' || screen === 'gorevler' ? 'duzenle' : screen
  const screenIndex = STAGES.findIndex((stage) => stage.key === stageScreen)
  const editReached = project ? ['edit', 'publish', 'scheduled', 'published'].includes(project.stage) : false
  const reachable = (key: Screen) => {
    if (projectId) {
      if (key === 'yukle') return true
      if (key === 'tara') return allPagesReady
      if (key === 'duzenle') return editReached || scanDone
      if (key === 'yayinla') return editReached
      return false
    }
    if (key === 'seri') return true
    if (key === 'bolum') return seriesReady
    return false
  }
  const goStage = (key: Screen) => {
    if (!reachable(key)) return
    if (key === 'seri') go('/yeni/seri')
    else if (key === 'bolum') go('/yeni/bolum')
    else if (projectId) go(`/${projectId}/${key}`)
  }

  const footer = (() => {
    switch (screen) {
      case 'seri':
        return {
          hint: seriesReady ? (seriesMode === 'mevcut' ? txa('{v1} seçildi', { v1: selectedSeries?.title ?? '' }) : txa('Yeni seri eklenecek')) : txa('Bir seri seç ya da yeni seri ekle'),
          label: txa('Devam'), enabled: seriesReady, onBack: () => go(''), onNext: () => go('/yeni/bolum'),
        }
      case 'bolum':
        return {
          hint: chapterNumber
            ? txa('{v1} · Bölüm {v2} · {v3} → Türkçe', { v1: seriesTitle, v2: chapterNumber, v3: TL_SOURCE_LANGUAGES[chapter.sourceLanguage].label })
            : txa('Bölüm numarasını gir'),
          label: submitting ? txa('Oluşturuluyor…') : txa('Devam'),
          enabled: Boolean(chapterNumber) && !submitting,
          onBack: () => go('/yeni/seri'),
          onNext: () => { void createFromWizard() },
        }
      case 'yukle':
        return {
          hint: pages.length === 0 ? txa('Önce sayfaları yükle') : uploadBusy ? txa('{v1} / {v2} yüklendi…', { v1: readyCount, v2: pages.length }) : allPagesReady ? txa('{v1} sayfa hazır', { v1: pages.length }) : txa('Yüklenmeyen sayfaları tekrar dene ya da kaldır'),
          label: txa('Devam'), enabled: allPagesReady && !uploadBusy, onBack: () => go(''), onNext: () => { void advanceProject('scan', 'tara') },
        }
      case 'tara':
        return {
          hint: project?.isMature ? txa('+18 seri: yapay zekâ kapalı, elle düzenlenir') : scanDone ? txa('Tarama bitti, editöre geçebilirsin') : txa('Taramayı başlat'),
          label: project?.isMature ? txa('Elle düzenlemeye geç') : txa('Editörde aç'), enabled: scanDone || Boolean(project?.isMature), onBack: () => go(`/${projectId}/yukle`), onNext: () => { void advanceProject('edit', 'duzenle') },
        }
      default:
        return null
    }
  })()


  const fansubName = fansub?.name ?? txa('Fansub')

  return (
    <div className='tl-studio flex h-[100dvh] min-h-0 flex-col overflow-hidden' data-testid='translation-studio'>
      <header className='flex h-[52px] flex-none items-center gap-4 border-b border-[var(--tl-line)] bg-[var(--tl-sb)] px-4'>
        <button
          type='button'
          onClick={() => navigate(`/fansub/${encodeURIComponent(fansubKey)}/yonet`)}
          title={txa('Fansub paneline dön')}
          className='flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)] transition-colors hover:border-[var(--tl-p35)] hover:text-[var(--tl-fg)]'
        >
          <ArrowLeft weight='bold' size={15} />
        </button>
        <button type='button' onClick={() => go('')} className='flex min-w-0 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-[var(--tl-fg)]'>
          <span className='flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-[var(--tl-p15)] text-[var(--tl-p)]'>
            <Translate weight='fill' size={16} />
          </span>
          <span className='flex min-w-0 flex-col gap-px'>
            <span className='text-[13.5px] font-extrabold'>{txa('Çeviri Stüdyosu')}</span>
            <span className='truncate text-[11.5px] font-semibold text-[var(--tl-mut)]'>{fansubName} · {crumb}</span>
          </span>
        </button>
        {screen !== 'basla' && screen !== 'seri-detay' && (
          <nav className='ml-2 hidden items-center gap-1 rounded-[11px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-1 lg:ml-10 md:flex' aria-label={txa('Adımlar')}>
            {STAGES.map((stage, index) => {
              const current = stage.key === stageScreen
              const done = index < screenIndex
              const canGo = reachable(stage.key)
              return (
                <button
                  key={stage.key}
                  type='button'
                  onClick={() => goStage(stage.key)}
                  disabled={!canGo && !current}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg border-0 px-3.5 text-[13px] font-bold',
                    current ? 'bg-[var(--tl-p15)] text-[var(--tl-p)]' : done ? 'bg-transparent text-[var(--tl-fg2)]' : 'bg-transparent text-[var(--tl-mut)]',
                    !canGo && !current && 'cursor-default opacity-45',
                  )}
                >
                  <span className='flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current text-[10.5px] font-extrabold'>{index + 1}</span>
                  {stage.label}
                </button>
              )
            })}
          </nav>
        )}
        <div className='flex-1' />
        {project && (screen === 'duzenle' || screen === 'incele' || screen === 'gorevler' || screen === 'yayinla') && (
          <div className='flex flex-none items-center gap-4'>
            {screen === 'duzenle' && (
              <PageTaskBar
                projectId={project.id}
                pageId={pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height)[pageIndex]?.id ?? null}
                currentUserId={currentUser?.id ?? null}
                onToast={showToast}
              />
            )}
            {(screen === 'duzenle' || screen === 'incele' || screen === 'gorevler') && (
              <div className='flex rounded-[10px] border border-[var(--tl-line)] p-[3px]' role='tablist' aria-label={txa('Görünüm')}>
                {([['duzenle', txa('Düzenle'), `/${project.id}/duzenle/${pageIndex + 1}`], ['incele', txa('Toplu inceleme'), `/${project.id}/incele`], ['gorevler', txa('Görevler'), `/${project.id}/gorevler`]] as const).map(([key, label, path]) => (
                  <button
                    key={key}
                    type='button'
                    role='tab'
                    aria-selected={screen === key}
                    onClick={() => { if (screen !== key) go(path) }}
                    className={cn('h-7 rounded-[7px] border-0 px-3 text-xs font-bold', screen === key ? 'bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'bg-transparent text-[var(--tl-mut)]')}
                    data-testid={`tl-view-${key}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className='hidden h-8 items-center gap-2 rounded-full border border-[var(--tl-line)] px-3 text-xs font-bold text-[var(--tl-fg2)] lg:flex'>
              <span>{TL_SOURCE_LANGUAGES[project.sourceLanguage].code}</span>
              <ArrowRight weight='bold' size={11} className='text-[var(--tl-dim)]' />
              <span>TR</span>
            </div>
            {(screen === 'duzenle' || screen === 'incele') && (
              <span className='hidden items-center gap-1.5 text-xs font-semibold text-[var(--tl-mut)] sm:flex' data-testid='tl-save-state'>
                {saveState === 'saved' && <><CloudCheck weight='bold' size={15} className='text-[var(--tl-green)]' />{txa('Kaydedildi')}</>}
                {saveState === 'saving' && <><CloudArrowUp weight='bold' size={15} className='text-[var(--tl-p)]' />{txa('Kaydediliyor…')}</>}
                {saveState === 'error' && <><CloudSlash weight='bold' size={15} className='text-[var(--tl-red)]' />{txa('Kaydedilemedi')}</>}
              </span>
            )}
            {(screen === 'duzenle' || screen === 'incele') && (
              <PrimaryButton onClick={() => { void advanceProject('publish', 'yayinla') }} className='h-9 rounded-[10px] px-4 text-[13px]'>
                <PaperPlaneTilt weight='bold' size={14} />
                {txa('Yayına hazırla')}
              </PrimaryButton>
            )}
          </div>
        )}
      </header>

      <main className='flex min-h-0 flex-1 flex-col'>
        {gate === 'loading' && <CenterNote text={txa('Stüdyo açılıyor…')} />}
        {gate === 'missing' && <CenterNote text={txa('Fansub bulunamadı.')} />}
        {gate === 'closed' && <CenterNote text={txa('Çeviri Stüdyosu henüz ekibine açılmadı. Yakında!')} />}
        {gate === 'open' && fansub && (
          <>
            {screen === 'basla' && (
              <StepStart
                fansubName={fansubName}
                drafts={drafts}
                draftsLoading={draftsLoading}
                onStart={() => go('/yeni/seri')}
                canStart={access.project}
                myTasks={myTasks.filter((task) => task.fansubId === fansub.id)}
                onOpenTask={(task) => go(`/${task.projectId}/duzenle/${task.pageNumber}`)}
                onOpenDraft={openProject}
                seriesSlot={isMockFansub ? null : <StudioMySeries fansubId={fansub.id} onOpen={(series) => go(`/seri/${series.id}`)} />}
              />
            )}
            {screen === 'seri-detay' && seriesId && (
              <SeriesDetailScreen
                key={seriesId}
                fansubId={fansub.id}
                seriesId={seriesId}
                canProject={access.project}
                canEditSeries={access.project || isSiteAdmin || permissions.has('panel.bolumler')}
                onNewChapter={startChapterForSeries}
                onOpenProject={openProjectById}
                onToast={showToast}
              />
            )}
            {screen === 'seri' && (
              <StepSeries
                fansubId={fansub.id}
                mode={seriesMode}
                onModeChange={setSeriesMode}
                selected={selectedSeries}
                onSelect={pickSeries}
                draft={draft}
                onDraftChange={(next) => {
                  setDraft(next)
                  setChapter((current) => ({ ...current, sourceLanguage: next.sourceLanguage }))
                }}
              />
            )}
            {screen === 'bolum' && seriesReady && (
              <>
                <StepChapter
                  seriesTitle={seriesTitle}
                  seriesMeta={(seriesMode === 'mevcut'
                    ? txa('{v1} · Sitede kayıtlı', { v1: selectedSeries ? TL_SOURCE_LANGUAGES[selectedSeries.sourceLanguage].label : '' })
                    : txa('{v1} · Onay bekleyecek', { v1: draft.originalTitle || txa('Yeni seri') }))
                    + ((seriesMode === 'mevcut' ? selectedSeries?.isMature : draft.isMature) ? txa(' · +18: yapay zekâ kapalı, elle çalışılır') : '')}
                  coverUrl={seriesMode === 'mevcut' ? selectedSeries?.coverUrl ?? null : draft.coverPreview}
                  form={chapter}
                  onChange={setChapter}
                  onChangeSeries={() => go('/yeni/seri')}
                  error={chapterError}
                />
                {existingProjectId && (
                  <div className='flex justify-center pb-4'>
                    <GhostButton onClick={() => go(`/${existingProjectId}/yukle`)} className='h-9 px-3.5 text-[12.5px]'>
                      {txa('Mevcut çalışmayı aç')}
                      <ArrowRight weight='bold' size={13} />
                    </GhostButton>
                  </div>
                )}
              </>
            )}
            {projectId && projectError && <CenterNote text={projectError} />}
            {projectId && !projectError && !project && <CenterNote text={txa('Proje yükleniyor…')} />}
            {project && screen === 'yukle' && !access.project && <CenterNote text={txa('Sayfa yüklemek için proje yönetimi izni gerekir. Düzenle adımına geçebilirsin.')} />}
            {project && screen === 'yukle' && access.project && needsImport && (
              <RevisionImport crumb={crumb} pages={pages} onPagesChange={setPages} onDone={() => setImportDone(true)} />
            )}
            {project && screen === 'yukle' && access.project && !needsImport && (
              <StepUpload
                projectId={project.id}
                crumb={crumb}
                pages={pages}
                onPagesChange={setPages}
                onBusyChange={setUploadBusy}
              />
            )}
            {project && screen === 'tara' && !access.project && <CenterNote text={txa('Tarama ve AI çeviri için proje yönetimi izni gerekir.')} />}
            {project && screen === 'tara' && access.project && (
              <StepScan key={project.id} fansubId={project.fansubId} pages={pages} onDoneChange={setScanDone} aiDisabled={project.isMature} onManual={() => { void advanceProject('edit', 'duzenle') }} />
            )}
            {project && screen === 'duzenle' && (
              <EditorScreen
                key={project.id}
                project={project}
                pages={pages}
                pageIndex={pageIndex}
                onPageChange={(index) => go(`/${project.id}/duzenle/${index + 1}`)}
                onToast={showToast}
                onSaveState={setSaveState}
                access={access}
              />
            )}
            {project && screen === 'incele' && (
              <ReviewScreen
                key={project.id}
                project={project}
                pages={pages}
                onOpenPage={(index) => go(`/${project.id}/duzenle/${index + 1}`)}
                onToast={showToast}
                onSaveState={setSaveState}
                canEdit={access.text}
              />
            )}
            {project && screen === 'gorevler' && (
              <TasksScreen
                key={project.id}
                project={project}
                pages={pages}
                access={access}
                currentUserId={currentUser?.id ?? null}
                onOpenPage={(index) => go(`/${project.id}/duzenle/${index + 1}`)}
                onToast={showToast}
              />
            )}
            {project && screen === 'yayinla' && (
              <StepPublish
                project={project}
                pages={pages}
                canPublish={access.publish}
                onEditPage={(index) => go(`/${project.id}/duzenle/${index + 1}`)}
                onPublished={() => go('')}
                onToast={showToast}
              />
            )}
          </>
        )}
      </main>

      {toast && (
        <div role='status' className='pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--tl-line)] bg-[var(--tl-acc)] px-4 py-2 text-[13px] font-semibold text-[var(--tl-fg)] shadow-lg'>
          {toast}
        </div>
      )}

      {gate === 'open' && footer && (
        <footer className='flex h-[68px] flex-none items-center gap-4 border-t border-[var(--tl-line)] bg-[var(--tl-sb)] px-6 sm:px-10'>
          <GhostButton onClick={footer.onBack} className='h-[42px] px-4 text-[13.5px]'>
            <ArrowLeft weight='bold' size={14} />
            {txa('Geri')}
          </GhostButton>
          <span className='hidden truncate text-[13px] font-semibold text-[var(--tl-mut)] sm:block'>{footer.hint}</span>
          <div className='flex-1' />
          <PrimaryButton onClick={footer.onNext} disabled={!footer.enabled} data-testid='tl-next'>
            {footer.label}
            <ArrowRight weight='bold' size={14} />
          </PrimaryButton>
        </footer>
      )}
    </div>
  )
}

function CenterNote({ text }: { text: string }) {
  return (
    <div className='flex flex-1 items-center justify-center p-10 text-center text-sm font-semibold text-[var(--tl-mut)]'>
      {text}
    </div>
  )
}

