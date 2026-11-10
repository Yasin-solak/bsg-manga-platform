/** Reader V2: layout, chapter controls and translation meet in the same scroll container. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Link, useNavigate, useSearchParams } from '@/i18n/router'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsDown, FastForward, Home, Loader2, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { resolveMyAccountStones } from '@/services/selfAccountEconomyService'
import { cn } from '@/lib/utils'
import type { FrameType } from '@components/common/AvatarFrame'
import type { Chapter } from '@/types'
import { buildPublicFansubPath, buildPublicMangaPath, doesChapterRouteNeedVersionQuery } from '@/lib/routes'
import { buildReaderV2Path, parseReaderV2Params } from '@/lib/readerV2Route'
import { useReaderV2Chapter } from '@/pages/reader/useReaderV2Chapter'
import { useReaderV2Layout } from '@/pages/reader/useReaderV2Layout'
import { useReaderV2Preferences } from '@/pages/reader/useReaderV2Preferences'
import { useReaderV2Controls } from '@/pages/reader/useReaderV2Controls'
import { useReaderV2AutoScroll } from '@/pages/reader/useReaderV2AutoScroll'
import { ReaderV2SettingsPanel } from '@/pages/reader/ReaderV2SettingsPanel'
import { ReaderV2ChapterPicker } from '@/pages/reader/ReaderV2ChapterPicker'
import { ReaderV2SideRail } from '@/pages/reader/ReaderV2SideRail'
import { ReaderV2SpeedStepper } from '@/pages/reader/ReaderV2SpeedStepper'
import { ReaderV2FloatingControls } from '@/pages/reader/ReaderV2FloatingControls'
import { resolveReaderV2Chrome, shouldShowReaderV2SideRail } from '@/pages/reader/readerV2ChromeEngine'
import { ReaderV2EndSequence } from '@/pages/reader/ReaderV2EndSequence'
import { useReaderV2FeatureFlags } from '@/pages/reader/useReaderV2FeatureFlags'
import { useReaderV2ChapterCredit } from '@/pages/reader/useReaderV2ChapterCredit'
import { useReaderV2Comments } from '@/pages/reader/useReaderV2Comments'
import { ReaderV2Comments } from '@/pages/reader/ReaderV2Comments'
import { useReaderV2Support } from '@/pages/reader/useReaderV2Support'
import { ReaderV2SupportDialogs } from '@/pages/reader/ReaderV2SupportDialogs'
import { useReaderV2NotifyInvite } from '@/pages/reader/useReaderV2NotifyInvite'
import { ReaderV2NotifyInvite } from '@/pages/reader/ReaderV2NotifyInvite'
import { buildReaderV2CreditPresentation } from '@/pages/reader/readerV2CreditPresentation'
import { resolveReaderV2EndSequence } from '@/pages/reader/readerV2EndSequenceEngine'
import { computeReaderV2Progress } from '@/pages/reader/readerV2LayoutEngine'
import { useReaderV2PageAspects } from '@/pages/reader/useReaderV2PageAspects'
import { useReaderV2ReadTracking } from '@/pages/reader/useReaderV2ReadTracking'
import { useReaderV2Resume } from '@/pages/reader/useReaderV2Resume'
import { useReaderTranslation } from '@/pages/reader/useReaderTranslation'
import { ReaderV2StageContent, type ReaderPageEntry } from '@/pages/reader/ReaderV2StageContent'
import { ReaderV2StudioActions, ReaderV2StudioNotice } from '@/pages/reader/ReaderV2StudioChrome'
import { txa } from '@/i18n/activeLocale'

function ReaderV2Page() {
  const params = useParams<{ mangaKey: string; chapterNumber: string; fansubKey?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()

  const { mangaKey, chapterNumber, fansubKey } = parseReaderV2Params(params)
  const versionId = searchParams.get('surum')

  const {
    status,
    errorMessage,
    notFoundReason,
    manga,
    chapter,
    pages: chapterPages,
    previousChapter,
    nextChapter,
    chapterOptions,
  } = useReaderV2Chapter({ mangaKey, chapterNumber, fansubKey, versionId })

  // Translation Studio V3: Turkish is in the chapter images; picking another language shows clean base + language layer.
  const translation = useReaderTranslation(chapter?.id)
  const translationOverlay = translation.overlay
  const pages = useMemo<ReaderPageEntry[]>(() => translationOverlay
    ? translationOverlay.pages.map((page) => ({
      kind: 'studio' as const,
      index: page.index,
      width: page.width,
      height: page.height,
      language: translationOverlay.language,
      items: translationOverlay.items.filter((item) => item.page_index === page.index),
    }))
    : chapterPages.map((src) => ({ kind: 'chapter' as const, src })),
  [translationOverlay, chapterPages])
  const machineTranslation = Boolean(translationOverlay)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState({ percent: 0, pageIndex: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [barsHidden, setBarsHidden] = useState(false)
  /** Last comparison position for the bar rule (see readerV2ChromeEngine). */
  const chromePositionRef = useRef(0)
  /**
   * The "bars forced visible" state is read during measurement. Carried through a ref:
   * as a dependency of measureProgress the scroll listener would be rebuilt
   * on every panel open.
   */
  const chromeForceVisibleRef = useRef(false)
  /** barsHidden'in ref kopyasi: olcum sirasinda bagimliliksiz okunur. */
  const barsHiddenRef = useRef(false)
  /** Okunan icerigin gercek genisligi; yan rayin sigip sigmadigini belirler. */
  const [contentWidth, setContentWidth] = useState(0)

  const { preferences, updatePreferences } = useReaderV2Preferences()

  const { layout, reportPageAspect } = useReaderV2Layout({
    pageCount: pages.length,
    modePreference: preferences.modePreference,
    fitMode: preferences.fitMode,
    seamless: preferences.seamless,
  })

  // Per-page ratio for reserving space. With dimensions saved at upload the right space is reserved
  // on the FIRST frame; otherwise measuring + the median fallback apply.
  const knownRatios = useMemo<Array<number | null>>(
    () => pages.map((page, index) => page.kind === 'studio'
      ? page.height / page.width
      : chapter?.pageRatios?.[index] ?? null),
    [chapter?.pageRatios, pages],
  )
  const { aspectRatios, reportAspect } = useReaderV2PageAspects({
    pageCount: pages.length,
    resetKey: `${chapter?.id ?? ''}:${translationOverlay?.language ?? 'chapter'}`,
    knownRatios,
  })

  // "Continue from your page": the position is stored in PAGES (scrollTop is
  // meaningless across devices). Thanks to space reservation it can jump to the right place
  // before images arrive.
  const {
    resumedPage,
    resumedFromOtherDevice,
    recordPosition,
    dismissResumeNotice,
    restartFromBeginning,
  } = useReaderV2Resume({
    stageRef,
    axis: layout.axis,
    chapterId: chapter?.id,
    pageCount: pages.length,
    currentUserId: currentUser?.id,
    mangaId: manga?.id,
  })

  const measureProgress = useCallback(() => {
    const element = stageRef.current
    if (!element) return

    // Bar visibility feeds from the same measurement: a separate scroll listener
    // would split two sources and cause drift.
    //
    // The calculation is OUTSIDE setBarsHidden. Changing a ref inside the updater
    // caused a bug in StrictMode: React calls the updater twice, the second call
    // reads the already updated ref, sees delta 0 and reverses the decision (caught in the browser).
    const chrome = resolveReaderV2Chrome({
      position: layout.axis === 'x' ? element.scrollLeft : element.scrollTop,
      lastPosition: chromePositionRef.current,
      barsHidden: barsHiddenRef.current,
      forceVisible: chromeForceVisibleRef.current,
    })
    chromePositionRef.current = chrome.lastPosition
    barsHiddenRef.current = chrome.barsHidden
    setBarsHidden(chrome.barsHidden)

    // Content width: column in strip, image in page. The side rail decision depends on this
    // (not the mode), so zoom is also handled correctly.
    const widest = [...element.querySelectorAll('img')]
      .reduce((max, image) => Math.max(max, image.getBoundingClientRect().width), 0)
    setContentWidth(widest)

    recordPosition()

    setProgress(computeReaderV2Progress(layout, {
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
    }, pages.length))
  }, [layout, pages.length, recordPosition])

  // The first measurement should not wait for scrolling: on a short chapter fitting the screen no scroll
  // event ever fires and progress would stick at 0%.
  useEffect(() => {
    measureProgress()
  }, [measureProgress])

  const goToChapter = useCallback((target: typeof nextChapter, versions?: Chapter[]) => {
    if (!target || !manga) return
    // With several versions of one number the fansub key may not be enough
    // (two versions from the same team); v1's proven helper distinguishes them.
    const needsVersionQuery = versions
      ? doesChapterRouteNeedVersionQuery(versions, target.chapter)
      : false
    navigate(buildReaderV2Path({
      mangaKey: manga.slug || manga.id,
      chapterNumber: target.chapterNumber,
      fansubKey: target.chapter.fansub?.slug || target.chapter.fansub?.id,
      versionId: needsVersionQuery ? target.chapter.id : null,
    }))
  }, [manga, navigate])

  // Controls and auto reading need each other (shortcut -> auto
  // reading, auto reading -> page turn command). The cycle is broken by binding the
  // command late through a ref.
  const autoScrollToggleRef = useRef<() => void>(() => {})
  const handleToggleAutoScroll = useCallback(() => autoScrollToggleRef.current(), [])

  const { isFullscreen, toggleFullscreen, step, goToStart } = useReaderV2Controls({
    containerRef,
    stageRef,
    layout,
    onPreviousChapter: () => goToChapter(previousChapter),
    onNextChapter: () => goToChapter(nextChapter),
    onToggleSettings: () => setSettingsOpen((open) => !open),
    settingsOpen,
    onCloseSettings: () => setSettingsOpen(false),
    onToggleAutoScroll: handleToggleAutoScroll,
  })

  const advanceOneView = useCallback(() => step(1), [step])

  const { isAutoScrolling, isWaitingForPage, toggleAutoScroll } = useReaderV2AutoScroll({
    stageRef,
    layout,
    speed: preferences.autoScrollSpeed,
    advanceSeconds: preferences.autoAdvanceSeconds,
    onAdvance: advanceOneView,
    enabled: pages.length > 0,
    resetKey: chapter?.id ?? '',
  })

  useEffect(() => {
    autoScrollToggleRef.current = toggleAutoScroll
  }, [toggleAutoScroll])

  // Okuma takibi: v1'de vardi, v2'ye tasinmamisti — /oku birincil olunca
  // okumalar sessizce sayilmiyordu.
  useReaderV2ReadTracking({
    mangaId: manga?.id,
    chapterId: chapter?.id,
    chapterNumber: chapter?.chapterNumber,
    currentUserId: currentUser?.id,
  })

  const flags = useReaderV2FeatureFlags()

  /**
   * Credit data belongs to chapter end; fetching on chapter open is a needless
   * request. The trigger is REAL VISIBILITY: progress percent proved misleading
   * for this, since before images load scrollHeight ~ clientHeight, so the first measure
   * gives 100% and the request fired in the first frame.
   * Latched once; scrolling back does not refetch.
   */
  const endSequenceRef = useRef<HTMLDivElement | null>(null)
  const [creditActive, setCreditActive] = useState(false)
  /** Refresh credit and the supporter list after a boost/donation. */
  const [creditRefreshToken, setCreditRefreshToken] = useState(0)
  useEffect(() => {
    setCreditActive(false)
  }, [chapter?.id])
  useEffect(() => {
    if (creditActive) return
    const element = endSequenceRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setCreditActive(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setCreditActive(true)
      },
      // Bir ekran once baslat: kredi, okuyucu dibe varmadan hazir olsun.
      { root: stageRef.current, rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [creditActive, pages.length])

  // Second path: nearing the bottom by real scrolling. In environments where IntersectionObserver
  // is late or does not work, credit still arrives.
  // The "at least one screen of scrollable content" condition excludes the fake 100%
  // state before images load.
  useEffect(() => {
    if (creditActive) return
    const element = stageRef.current
    if (!element) return
    const scrollableDistance = layout.axis === 'x'
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight
    const viewportSize = layout.axis === 'x' ? element.clientWidth : element.clientHeight
    if (scrollableDistance < viewportSize) return
    if (progress.percent >= 80) setCreditActive(true)
  }, [creditActive, layout.axis, progress.percent])

  const creditData = useReaderV2ChapterCredit({
    fansubId: chapter?.fansub?.id,
    chapterId: chapter?.id,
    boostEnabled: flags.boostEnabled,
    active: creditActive,
    refreshToken: creditRefreshToken,
  })

  const creditPresentation = useMemo(() => {
    if (!chapter?.fansub) return null
    return buildReaderV2CreditPresentation({
      fansub: chapter.fansub,
      config: creditData.config,
      snapshot: creditData.snapshot,
      supporters: creditData.supporters,
    })
  }, [chapter?.fansub, creditData.config, creditData.snapshot, creditData.supporters])

  const notifyInvite = useReaderV2NotifyInvite({
    fansubId: chapter?.fansub?.id,
    fansubName: chapter?.fansub?.name,
    currentUserId: currentUser?.id,
    active: creditActive,
  })

  const commentsState = useReaderV2Comments({
    mangaId: manga?.id,
    chapterId: chapter?.id,
    commentsEnabled: flags.commentsEnabled,
    active: creditActive,
  })

  const endSequence = useMemo(() => resolveReaderV2EndSequence({
    hasNextChapter: Boolean(nextChapter),
    chapterNotes: chapter?.notes,
    hasFansub: Boolean(chapter?.fansub),
    creditReady: Boolean(creditPresentation) || creditData.isLoading,
    boostEnabled: flags.boostEnabled,
    donationsEnabled: flags.donationsEnabled,
    commentsEnabled: flags.commentsEnabled,
    showNotifyInvite: notifyInvite.variant !== 'hidden',
  }), [
    chapter?.fansub,
    chapter?.notes,
    creditData.isLoading,
    creditPresentation,
    flags.boostEnabled,
    flags.commentsEnabled,
    flags.donationsEnabled,
    nextChapter,
    notifyInvite.variant,
  ])

  const signInFrom = `${location.pathname}${location.search}${location.hash}`
  const support = useReaderV2Support({
    fansubId: chapter?.fansub?.id,
    fansubName: chapter?.fansub?.name,
    snapshot: creditData.snapshot,
    boostEnabled: flags.boostEnabled,
    donationsEnabled: flags.donationsEnabled,
    signedIn: Boolean(currentUser),
    onRequireSignIn: () => navigate('/giris', { state: { from: signInFrom } }),
    onBalanceChanged: () => setCreditRefreshToken((token) => token + 1),
    currentUserCoins: currentUser
      ? resolveMyAccountStones({ userId: currentUser.id, fallbackStones: currentUser.stones ?? 0 })
      : 0,
  })

  const endSequenceNode = (
    <ReaderV2EndSequence
      containerRef={endSequenceRef}
      blocks={endSequence.blocks}
      supportActions={endSequence.supportActions}
      supportInsideCredit={endSequence.supportInsideCredit}
      chapterNotes={chapter?.notes}
      nextChapterNumber={nextChapter?.chapterNumber ?? null}
      onGoNextChapter={() => goToChapter(nextChapter)}
      mangaTitle={manga?.title ?? txa('Seri')}
      mangaHref={manga ? buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title }) : '/kesfet'}
      mangaCoverUrl={manga?.coverImage}
      credit={creditPresentation}
      creditLoading={creditData.isLoading}
      onBoost={support.openBoost}
      onDonate={support.openDonate}
      notifyNode={notifyInvite.variant !== 'hidden' ? (
        <ReaderV2NotifyInvite
          variant={notifyInvite.variant}
          fansubName={chapter?.fansub?.name ?? txa('Ekip')}
          isBusy={notifyInvite.isBusy}
          onDismiss={notifyInvite.dismiss}
          onFollow={() => void notifyInvite.followAndNotify()}
          onEnableNotifications={() => void notifyInvite.enableNotifications()}
          signInFrom={`${location.pathname}${location.search}${location.hash}`}
        />
      ) : null}
      commentsNode={(
        <ReaderV2Comments
          chapterNumber={chapter?.chapterNumber}
          fansubId={chapter?.fansub?.id}
          comments={commentsState.comments}
          isLoading={commentsState.isLoading}
          sortBy={commentsState.sortBy}
          onSortChange={commentsState.setSortBy}
          newComment={commentsState.newComment}
          setNewComment={commentsState.setNewComment}
          onAddComment={commentsState.addComment}
          replyingTo={commentsState.replyingTo}
          setReplyingTo={commentsState.setReplyingTo}
          replyText={commentsState.replyText}
          setReplyText={commentsState.setReplyText}
          onSubmitReply={commentsState.submitReply}
          onLike={commentsState.likeComment}
          onDislike={commentsState.dislikeComment}
          mentionedUsers={commentsState.mentionedUsers}
          relatedFansubs={commentsState.relatedFansubs}
          mentionedMangas={commentsState.mentionedMangas}
          commentsEnabled={flags.commentsEnabled}
          reportsEnabled={flags.reportsEnabled}
          currentUserAvatar={currentUser?.avatar}
          currentUserFrameType={(currentUser?.frameType as FrameType | null) ?? 'default'}
        />
      )}
    />
  )

  /**
   * Bars hide with PAGE MOTION; no separate "quiet reading" preference
   * (user feedback). The rule is in the pure engine: retract reading forward,
   * return going back.
   *
   * `creditActive` is DELIBERATELY not here: it is a LATCH (stays on once chapter end
   * shows). In the force-visible condition, bars never hid again for a reader who reached
   * chapter end once (caught in the browser).
   * Chapter end has its own action cards and does not need bars.
   */
  const chromeForceVisible = settingsOpen || pickerOpen
  useEffect(() => {
    chromeForceVisibleRef.current = chromeForceVisible
    if (!chromeForceVisible) return
    barsHiddenRef.current = false
    setBarsHidden(false)
  }, [chromeForceVisible])

  const barsVisible = !barsHidden || chromeForceVisible

  /**
   * Touch zones: in page mode left/right edges turn pages, the middle
   * toggles bars. In strip mode a click only toggles bars.
   * v1 did this with invisible button layers that overflowing images could swallow;
   * here it is calculated from position on one container.
   */
  const handleStageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (settingsOpen) return
    const element = stageRef.current
    if (!element) return

    if (layout.axis === 'x') {
      const bounds = element.getBoundingClientRect()
      const ratio = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
      if (ratio < 0.25) {
        step(-1)
        return
      }
      if (ratio > 0.75) {
        step(1)
        return
      }
    }
    setBarsHidden((hidden) => {
      barsHiddenRef.current = !hidden
      return !hidden
    })
  }, [layout.axis, settingsOpen, step])

  if (status === 'loading') {
    return (
      <div data-testid="reader-v2-shell" style={{ colorScheme: 'dark' }} className="dark fixed inset-0 z-[9000] flex items-center justify-center bg-neutral-950 text-white/70">
        <Loader2 className="mr-2 size-5 animate-spin" /> {txa('Bolum yukleniyor...')}
      </div>
    )
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <div data-testid="reader-v2-shell" style={{ colorScheme: 'dark' }} className="dark fixed inset-0 z-[9000] flex flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-white/75">
        {/* Yokluk ile HATA ayri seylerdir ve ayri metin ister. Admin seriyi
            pasife alinca burada ham veritabani mesaji gorunuyordu ("Cannot
            coerce the result to a single JSON object") — canlida olculdu. */}
        <p className="text-lg font-semibold text-white">
          {status === 'error'
            ? txa('Bolum yuklenemedi.')
            : notFoundReason === 'manga'
              ? txa('Bu seri su anda yayinda degil.')
              : txa('Bu bolum su anda yayinda degil.')}
        </p>
        <p className="max-w-md text-sm text-white/60">
          {status === 'error'
            ? (errorMessage || txa('Baglanti sorunu olabilir, tekrar deneyebilirsin.'))
            : notFoundReason === 'manga'
              ? txa('Kaldirilmis ya da incelemeye alinmis olabilir.')
              : txa('Kaldirilmis ya da incelemeye alinmis olabilir; serinin diger bolumleri durabilir.')}
        </p>
        <Button asChild variant="secondary">
          <Link to={manga && notFoundReason !== 'manga'
            ? buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
            : '/kesfet'}>
            <ArrowLeft className="mr-1 size-4" />
            {manga && notFoundReason !== 'manga' ? txa('Seriye don') : txa('Kesfete don')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="reader-v2-shell"
      /**
       * `dark` SCOPE is required: the shell is always dark but shared components inside
       * (Button ghost/outline/secondary, scrollbar) take colors from THEME variables.
       * On a light theme this produced white boxes on the dark bar,
       * visible on the fansub badge in a user's screenshot.
       */
      className="dark fixed inset-0 z-[9000] flex flex-col bg-neutral-950 text-white"
      style={{ colorScheme: 'dark' }}
    >
      {/* Sayfa modunda kenarda kalan bos alan hizli ayarlara ayrilir. */}
      <ReaderV2SideRail
        visible={shouldShowReaderV2SideRail({
          viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
          contentWidth,
          barsVisible,
        })}
        preferences={preferences}
        onChange={updatePreferences}
      />
      {/* Barlar akista DEGIL, icerigin UZERINDE durur.
          Onceden flex cocuguydular: gizlenince `translate-y` ile gorunmez
          oluyor ama YER KAPLAMAYA devam ediyorlardi — kullanicinin gordugu
          "butonlar gitti ama siyah blok kaldi" durumu buydu. Bindirilince
          gizlenme gercekten tam ekran okuma veriyor ve icerik yeniden
          akmadigi icin okunan yer kaymiyor. */}
      <header
        data-testid="reader-v2-header"
        className={cn(
          'absolute inset-x-0 top-0 z-[9010] flex items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-3 py-2 backdrop-blur transition-transform duration-200',
          !barsVisible && 'pointer-events-none opacity-0',
        )}
        // The slide uses an inline style: the `-translate-y-full` utility had no effect
        // on this element (--tw-translate-y was right but the `translate` property
        // was not applied). An inline style removes ordering ambiguity
        // entirely.
        style={{ transform: barsVisible ? 'none' : 'translateY(-100%)' }}
      >
        {/* Sol: cikis yollari. Sira genisten dara: ana sayfa -> ceviren ekip ->
            okunan seri (kullanici istegi). */}
        <div className="flex min-w-0 shrink-0 items-center gap-0.5">
          <Button asChild size="sm" variant="ghost" aria-label={txa('Ana sayfa')} className="h-8 w-8 p-0 text-white/60 hover:text-white">
            <Link to="/" data-testid="reader-v2-home">
              <Home className="size-4" />
            </Link>
          </Button>
          {chapter?.fansub ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              aria-label={txa('{v1} sayfasina git', { v1: chapter.fansub.name })}
              title={chapter.fansub.name}
              className="h-8 gap-1.5 px-1.5 text-white/70 hover:text-white"
            >
              <Link
                data-testid="reader-v2-fansub-link"
                to={buildPublicFansubPath({ id: chapter.fansub.id, slug: chapter.fansub.slug })}
              >
                {chapter.fansub.avatar ? (
                  <img src={chapter.fansub.avatar} alt="" className="size-6 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-black text-amber-100">
                    {chapter.fansub.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[14ch] truncate text-[11px] lg:inline">{chapter.fansub.name}</span>
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost" className="gap-1 px-2 text-white/80 hover:text-white">
            <Link
              data-testid="reader-v2-back-manga"
              to={manga ? buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title }) : '/kesfet'}
            >
              <ArrowLeft className="size-4" />
              <span className="hidden max-w-[16ch] truncate md:inline xl:max-w-[28ch]">{manga?.title ?? txa('Seri')}</span>
            </Link>
          </Button>
        </div>

        {/* Başlık dar ekranda akışta kalır; geniş ekranda mutlak konum gerçek merkezlemeyi sağlar. */}
        <div className="flex min-w-0 flex-1 justify-center md:pointer-events-none md:absolute md:inset-x-0">
          <div className="min-w-0 md:pointer-events-auto md:max-w-[46vw]">
            <ReaderV2ChapterPicker
              open={pickerOpen}
              onToggle={() => setPickerOpen((open) => !open)}
              onClose={() => setPickerOpen(false)}
              options={chapterOptions}
              currentChapterNumber={chapter?.chapterNumber}
              currentChapterId={chapter?.id}
              currentTitle={chapter?.title}
              onSelect={(target, versions) => goToChapter(target, versions)}
            />
          </div>
        </div>

        <ReaderV2StudioActions
          translation={translation}
          machineTranslation={machineTranslation}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />
      </header>

      <ReaderV2StudioNotice translation={translation} />

      {/* TEK kaydirma kabi. Eksen ve snap yerlesim motorundan gelir; mod'a
          gore ikinci bir kap veya ayri JSX agaci YOK (v1'in kok sorunu). */}
      <div
        ref={stageRef}
        data-testid="reader-v2-stage"
        data-reader-mode={layout.mode}
        data-reader-axis={layout.axis}
        className={cn(
          'min-h-0 flex-1',
          layout.axis === 'x'
            ? 'flex overflow-x-auto overflow-y-hidden'
            : 'overflow-y-auto overflow-x-hidden',
          layout.snap === 'mandatory' && 'snap-x snap-mandatory',
        )}
        // Since the scrollbar takes space on one side, content shifted ~half a bar
        // left; reserving space on both sides really centers it.
        style={{ scrollbarGutter: 'stable both-edges' }}
        onScroll={measureProgress}
        onClick={handleStageClick}
      >
        <ReaderV2StageContent
          pages={pages}
          layout={layout}
          zoomLevel={preferences.zoomLevel}
          progressPageIndex={progress.pageIndex}
          aspectRatios={aspectRatios}
          chapterId={chapter?.id ?? null}
          reportPageAspect={reportPageAspect}
          reportAspect={reportAspect}
          endSequenceNode={endSequenceNode}
        />
      </div>

      <ReaderV2FloatingControls
        resumedPage={resumedPage}
        resumedFromOtherDevice={resumedFromOtherDevice}
        onRestartFromBeginning={restartFromBeginning}
        onDismissResumeNotice={dismissResumeNotice}
        showScrollTop={progress.percent > 5}
        onScrollTop={goToStart}
        barsVisible={barsVisible}
      />

      <ReaderV2SupportDialogs support={support} fansubName={chapter?.fansub?.name ?? txa('Ekip')} />

      <ReaderV2SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onChange={updatePreferences}
        layout={layout}
      />

      <footer
        data-testid="reader-v2-footer"
        className={cn(
          'absolute inset-x-0 bottom-0 z-[9010] flex flex-col items-center gap-1.5 border-t border-white/10 bg-black/80 px-3 py-2 backdrop-blur transition-transform duration-200',
          !barsVisible && 'pointer-events-none opacity-0',
        )}
        style={{ transform: barsVisible ? 'none' : 'translateY(100%)' }}
      >
        {/* Kontroller ORTADA tek kume: onceki/sonraki ekranin iki ucuna
            dagilmis haldeyken el hareketi genis ekranda cok buyuyordu ve
            otomatik okuma kenarda kayboluyordu. */}
        <div data-testid="reader-v2-footer-controls" className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            data-testid="reader-v2-prev-chapter"
            className="gap-1 text-white/80 hover:text-white disabled:opacity-30"
            disabled={!previousChapter}
            onClick={() => goToChapter(previousChapter)}
          >
            <ChevronLeft className="size-4" /> <span className="hidden sm:inline">{txa('Onceki')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="reader-v2-autoscroll-toggle"
            aria-pressed={isAutoScrolling}
            aria-label={isAutoScrolling ? txa('Otomatik okumayi durdur') : txa('Otomatik okumayi baslat')}
            title={isWaitingForPage
              ? txa('Sayfa yukleniyor, bekleniyor')
              : layout.axis === 'x' ? txa('Otomatik sayfa cevirme (A)') : txa('Otomatik kaydirma (A)')}
            disabled={pages.length === 0}
            className={cn(
              'size-9 shrink-0 rounded-full p-0 text-white/75 hover:text-white disabled:opacity-30',
              isAutoScrolling ? 'bg-primary/25 text-primary' : 'bg-white/[0.06]',
            )}
            onClick={toggleAutoScroll}
          >
            {/* Ikon MODA gore: play ucgeni "otomatik okuma"yi anlatmiyordu
                (kullanici istegi). Seritte asagi akis, sayfada ileri sarma. */}
            {isWaitingForPage
              ? <Loader2 className="size-4 animate-spin" />
              : isAutoScrolling
              ? <Pause className="size-4" />
              : layout.axis === 'x'
                ? <FastForward className="size-4" />
                : <ChevronsDown className="size-4" />}
          </Button>

          {/* Hiz oynatma dugmesinin YANINDA: ayar panelini acmadan
              degistirilebilmeli (kullanici istegi). Serit modunda px/sn,
              sayfa modunda saniye. */}
          <ReaderV2SpeedStepper
            axis={layout.axis}
            speed={preferences.autoScrollSpeed}
            advanceSeconds={preferences.autoAdvanceSeconds}
            onChange={updatePreferences}
          />

          <Button
            size="sm"
            variant="ghost"
            data-testid="reader-v2-next-chapter"
            className="gap-1 text-white/80 hover:text-white disabled:opacity-30"
            disabled={!nextChapter}
            onClick={() => goToChapter(nextChapter)}
          >
            <span className="hidden sm:inline">{txa('Sonraki')}</span> <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Sayfa sayaci, yuzde ve ilerleme cubugu KALDIRILDI (kullanici
            istegi): okurken karar vermeye katkisi yok, alt bari sisiriyordu.
            Ilerleme yine de hesaplaniyor — on yukleme penceresi okunan sayfa
            indeksine dayaniyor. */}
      </footer>
    </div>
  )
}

export default ReaderV2Page
