import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from '@/i18n/router'
import { BookOpen, Bookmark, Compass, Inbox } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import {
  loadLibrary,
  type LibraryData,
  type LibraryFollowEntry,
  type LibraryReadEntry,
} from '@/services/libraryService'
import { txa } from '@/i18n/activeLocale'

/**
 * Library: the user's own reading state.
 *
 * The home strip "N new chapters waiting" links here. It used to go to
 * /kesfet, which did NOT SHOW those 14 chapters; a user noticed.
 *
 * Tabs differ from the prototype because two of its four have no data
 * (there was never a separate bookmark concept, no "finished" mark is
 * kept) and the other two, "Reading" and "History", turned out the same:
 * `reading_history` keeps one row per manga, so there is no per-chapter history
 * anyway. Rather than show an empty tab we defined three REAL jobs:
 *
 * Waiting for you : followed series with unread chapters
 * Following       : all of them
 * Read            : series you started, with the chapter you left off
 *
 * `/listeler` and profile shelves DID NOT CHANGE: those are curation and social
 * (others see them, with comments/ratings), this is personal reading state.
 */

type TabId = 'bekleyen' | 'takip' | 'okunan'

/*
 * Labels are short: the three long labels did not fit 390px and the third tab
 * stayed off screen, not even visibly existing. The page title and subline
 * already give the context.
 */
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'bekleyen', get label() { return txa('Bekleyenler') } },
  { id: 'takip', get label() { return txa('Takip') } },
  { id: 'okunan', get label() { return txa('Okuduklarım') } },
]

function isTabId(value: string | null): value is TabId {
  return value === 'bekleyen' || value === 'takip' || value === 'okunan'
}

function CoverLink({
  coverImage,
  title,
  to,
}: {
  coverImage: string
  title: string
  to: string
}) {
  return (
    <Link to={to} className="shrink-0">
      {coverImage ? (
        <img
          src={coverImage}
          alt=""
          loading="lazy"
          className="h-[76px] w-[54px] rounded-[10px] object-cover"
        />
      ) : (
        <span className="grid h-[76px] w-[54px] place-items-center rounded-[10px] bg-muted text-muted-foreground">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
      )}
      <span className="sr-only">{title}</span>
    </Link>
  )
}

function EmptyState({
  action,
  hint,
  icon: Icon,
  title,
  to,
}: {
  action: string
  hint: string
  icon: typeof Inbox
  title: string
  to: string
}) {
  return (
    <div
      className="mx-4 rounded-[14px] border border-dashed border-border px-5 py-10 text-center"
      data-testid="library-empty"
    >
      <Icon className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
      <p className="m-0 mt-3 text-sm font-bold text-foreground">{title}</p>
      <p className="m-0 mt-1 text-xs font-medium text-muted-foreground">{hint}</p>
      <Link
        to={to}
        className="mt-4 inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-[13px] font-extrabold text-primary-foreground"
      >
        {action}
      </Link>
    </div>
  )
}

function FollowRow({ entry }: { entry: LibraryFollowEntry }) {
  const to = buildPublicMangaPath({
    id: entry.mangaId,
    slug: entry.slug,
    title: entry.title,
  })
  /*
   * If the button says "Chapter 14" it must OPEN 14. Going to the series page would make the user
   * search for the promised chapter once more.
   */
  const readTo = entry.nextChapterNumber !== null
    ? buildPublicChapterPath({
        mangaId: entry.mangaId,
        mangaSlug: entry.slug,
        mangaTitle: entry.title,
        chapterNumber: entry.nextChapterNumber,
      })
    : to

  return (
    <div className="flex items-center gap-3 p-3" data-testid="library-row">
      <CoverLink coverImage={entry.coverImage} title={entry.title} to={to} />
      <Link to={to} className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-bold leading-tight text-foreground">
          {entry.title}
        </p>
        {/*
          Kaldigi yer, "kac bolum birikti"den once gelir: kullanici once
          nereden devam edecegini bilmek ister.
        */}
        <p className="m-0 mt-1 text-xs font-semibold text-muted-foreground">
          {entry.lastReadChapter !== null
            ? txa("Bölüm {number}'desin", { number: entry.lastReadChapter })
            : txa('Henüz başlamadın')}
        </p>
        {entry.unreadCount > 0 ? (
          <span
            className="mt-1.5 inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-bold text-primary"
            data-testid="library-unread-badge"
          >
            {txa('{count} yeni bölüm', { count: entry.unreadCount })}
          </span>
        ) : null}
      </Link>
      <Link
        to={readTo}
        className={cn(
          'inline-flex h-10 shrink-0 items-center rounded-[12px] px-3.5 text-[13px] font-extrabold',
          entry.unreadCount > 0
            ? 'bg-primary text-primary-foreground'
            : 'border border-border text-foreground',
        )}
      >
        {entry.nextChapterNumber !== null ? txa('Bölüm {number}', { number: entry.nextChapterNumber }) : txa('Aç')}
      </Link>
    </div>
  )
}

function ReadRow({ entry }: { entry: LibraryReadEntry }) {
  const to = buildPublicMangaPath({
    id: entry.mangaId,
    slug: entry.slug,
    title: entry.title,
  })
  // 'Continue' opens the chapter left off; the series page does not know where you stopped.
  const readTo = buildPublicChapterPath({
    mangaId: entry.mangaId,
    mangaSlug: entry.slug,
    mangaTitle: entry.title,
    chapterNumber: entry.lastReadChapter,
  })

  return (
    <div className="flex items-center gap-3 p-3" data-testid="library-row">
      <CoverLink coverImage={entry.coverImage} title={entry.title} to={to} />
      <Link to={to} className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-bold leading-tight text-foreground">
          {entry.title}
        </p>
        <p className="m-0 mt-1 text-xs font-semibold text-muted-foreground">
          {txa("Bölüm {number}'desin", { number: entry.lastReadChapter })}
        </p>
        {entry.isFollowed ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
            <Bookmark className="size-3" aria-hidden="true" />
            {txa('Takipte')}
          </span>
        ) : null}
      </Link>
      <Link
        to={readTo}
        className="inline-flex h-10 shrink-0 items-center rounded-[12px] border border-border px-3.5 text-[13px] font-extrabold text-foreground"
      >
        {txa('Devam et')}
      </Link>
    </div>
  )
}

export default function LibraryPage() {
  const { currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<LibraryData | null>(null)
  const [loading, setLoading] = useState(true)

  const paramTab = searchParams.get('sekme')
  const activeTab: TabId = isTabId(paramTab) ? paramTab : 'bekleyen'

  useEffect(() => {
    if (!currentUser?.id) {
      setData(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const result = await loadLibrary(currentUser.id)
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentUser?.id])

  const waiting = useMemo(
    () => (data?.follows ?? []).filter((entry) => entry.unreadCount > 0),
    [data],
  )

  const counts: Record<TabId, number> = {
    bekleyen: waiting.length,
    takip: data?.follows.length ?? 0,
    okunan: data?.reads.length ?? 0,
  }

  if (!currentUser) {
    return (
      <div className="py-8">
        <h1 className="mx-4 mb-1 text-2xl font-extrabold text-foreground">{txa('Kütüphane')}</h1>
        <p className="mx-4 mb-6 text-sm font-medium text-muted-foreground">
          {txa('Takip ettiğin seriler ve kaldığın bölümler burada toplanır.')}
        </p>
        <EmptyState
          action={txa('Giriş yap')}
          hint={txa('Kütüphane hesabına bağlıdır; takip ettiğin seriler orada saklanır.')}
          icon={BookOpen}
          title={txa('Kütüphaneni görmek için giriş yap')}
          to="/giris"
        />
      </div>
    )
  }

  return (
    <div className="pb-8 pt-6" data-testid="library-page">
      <h1 className="mx-4 mb-1 text-2xl font-extrabold text-foreground">{txa('Kütüphane')}</h1>
      <p className="mx-4 text-sm font-medium text-muted-foreground">
        {data && data.unreadTotal > 0
          ? txa('{count} yeni bölüm seni bekliyor.', { count: data.unreadTotal })
          : txa('Takip ettiğin seriler ve kaldığın bölümler.')}
      </p>

      {/*
        Sekmeler URL'de: paylasilabilir ve geri tusu calisir. Ana sayfa seridi
        dogrudan "Seni Bekleyenler"e baglaniyor, bu yuzden sekme adres
        satirindan gelebilmeli.
      */}
      {/*
        `hide-scrollbar`: projenin kendi yardimcisi (index.css). Once arbitrary
        property ile yazmistim; `-ms-overflow-style` eksikti ve kaydirirken
        alttaki imlec goruniyordu. Kaydirma kaliyor, yalnizca imlec gizli.
      */}
      <div
        className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-3"
        role="tablist"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.set('sekme', tab.id)
              setSearchParams(next, { replace: true })
            }}
            className={cn(
              // Not fully round: prototype buttons are softened 12-13px,
              // a pill-shaped chip alone looked foreign.
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-bold transition-colors',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground',
            )}
            data-testid={`library-tab-${tab.id}`}
          >
            {txa(tab.label)}
            {counts[tab.id] > 0 ? (
              <span
                className={cn(
                  'rounded-[6px] px-1.5 text-[10.5px] font-extrabold',
                  activeTab === tab.id ? 'bg-primary-foreground/20' : 'bg-muted',
                )}
              >
                {counts[tab.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/*
        Sekme seridini icerikten ayiran cizgi. Cizgisiz halde sekmeler listenin
        bir parcasi gibi duruyordu; hangi bolgeyi kontrol ettikleri belirsizdi.
      */}
      <div className="border-t border-border pt-4" data-testid="library-divider">
        {loading ? (
          <div className="mx-4 space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-[100px] animate-pulse rounded-[14px] bg-muted" />
            ))}
          </div>
        ) : activeTab === 'bekleyen' ? (
          waiting.length > 0 ? (
            <div
              className="mx-4 divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card"
              data-testid="library-list"
            >
              {waiting.map((entry) => <FollowRow key={entry.mangaId} entry={entry} />)}
            </div>
          ) : (
            <EmptyState
              action={txa('Keşfet\'e git')}
              /*
               * With no follows the issue is not "you read everything" but having no follows.
               * Covering both with the same empty screen would send the user
               * the wrong way.
               */
              hint={
                counts.takip > 0
                  ? txa('Takip ettiğin serilerde okunmamış bölüm kalmadı.')
                  : txa('Bir seriyi takip et; yeni bölümleri burada birikir.')
              }
              icon={Inbox}
              title={counts.takip > 0 ? txa('Her şey okundu') : txa('Henüz takip ettiğin seri yok')}
              to="/kesfet"
            />
          )
        ) : activeTab === 'takip' ? (
          data && data.follows.length > 0 ? (
            <div
              className="mx-4 divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card"
              data-testid="library-list"
            >
              {data.follows.map((entry) => <FollowRow key={entry.mangaId} entry={entry} />)}
            </div>
          ) : (
            <EmptyState
              action={txa('Keşfet\'e git')}
              hint={txa('Takip ettiğin seriler burada toplanır.')}
              icon={Bookmark}
              title={txa('Henüz takip ettiğin seri yok')}
              to="/kesfet"
            />
          )
        ) : data && data.reads.length > 0 ? (
          <div
            className="mx-4 divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card"
            data-testid="library-list"
          >
            {data.reads.map((entry) => <ReadRow key={entry.mangaId} entry={entry} />)}
          </div>
        ) : (
          <EmptyState
            action={txa('Keşfet\'e git')}
            hint={txa('Okumaya başladığın seriler burada kaldığın bölümle görünür.')}
            icon={Compass}
            title={txa('Henüz bir seriye başlamadın')}
            to="/kesfet"
          />
        )}
      </div>
    </div>
  )
}
