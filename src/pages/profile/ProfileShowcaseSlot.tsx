import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowsLeftRight, BookOpen, ChartBar, ClockCounterClockwise, CrownSimple, EyeSlash, Medal, PlusCircle, Sparkle, Stack, Trophy, UsersThree } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicChapterPath, buildPublicFansubPath, buildPublicMangaPath } from '@/lib/routes'
import type { MangaListSummary } from '@/services/mangaListService/types'
import { resolveProfileSurfaceImage } from './profileMedia'
import { PROFILE_SLOT_MODULES, type ProfileSlotModule } from './profileLayout'
import type { MockUser, ProfileOwnedBadge } from './types'
import { slotHasContent, type ProfileSlotData } from './profileSlotData'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
  Profil vitrini yuvasi (prototip v3): sahibi yuvaya modul secer (rozet, okuma, favori
  uclu, liste, istatistik) ya da bos birakir. Bos yuva ziyaretciye gorunmez.
*/

const MODULE_ICON: Record<ProfileSlotModule, typeof Medal> = {
  badges: Medal, reading: BookOpen, fav: CrownSimple, list: Stack, stats: ChartBar,
  genres: Sparkle, level: Trophy, teams: UsersThree, activity: ClockCounterClockwise, none: EyeSlash,
}

const cover = (value: string | undefined | null, title: string, width = 160) =>
  resolveProfileSurfaceImage(value, width) || buildCoverPlaceholder(title)

function displayedBadges(badges: ProfileOwnedBadge[]) {
  const shown = badges.filter((badge) => badge.is_displayed).sort((a, b) => a.display_order - b.display_order)
  return (shown.length ? shown : badges).slice(0, 5)
}

function BadgesModule({ badges }: { badges: ProfileOwnedBadge[] }) {
  return (
    <div className='flex flex-col gap-2'>
      {displayedBadges(badges).map((badge) => (
        <div key={badge.id} className='flex items-center gap-2.5'>
          <span className='flex size-9 flex-none items-center justify-center rounded-[10px] bg-white/[0.06]'>
            {badge.badge?.image_url ? <img src={badge.badge.image_url} alt='' className='size-7 object-contain' /> : <Medal size={18} />}
          </span>
          <span className='min-w-0 truncate text-[13px] font-semibold'>{badge.badge?.name ?? txa('Rozet')}</span>
        </div>
      ))}
    </div>
  )
}

function ReadingModule({ user }: { user: MockUser }) {
  const item = user.readingHistory[0]
  const total = item.lastChapterNumber && item.lastChapterNumber > 0 ? item.lastChapterNumber : null
  const percent = total ? Math.min(100, Math.round((item.chapterNumber / total) * 100)) : null
  const chapterPath = buildPublicChapterPath({ mangaId: item.mangaId, mangaSlug: item.mangaSlug, mangaTitle: item.title, chapterNumber: item.chapterNumber })
  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex gap-3'>
        <img src={cover(item.coverImage, item.title)} alt='' className='h-[88px] w-[62px] flex-none rounded-lg object-cover' />
        <span className='flex min-w-0 flex-1 flex-col'>
          <span className='line-clamp-2 text-sm font-bold leading-snug'>{item.title}</span>
          <span className='mt-1 text-xs font-bold text-primary'>{txa('Bölüm {v1}', { v1: item.chapterNumber })}</span>
          <span className='mt-0.5 text-[11.5px] text-white/60'>{total ? txa('{v1} bölümün {v2}.', { v1: total, v2: item.chapterNumber }) : txa('Kaldığın yer')}</span>
          {percent !== null && (
            <span className='mt-auto h-1.5 overflow-hidden rounded-full bg-white/10' aria-label={txa('İlerleme %{v1}', { v1: percent })}>
              <span className='block h-full rounded-full bg-primary' style={{ width: `${percent}%` }} />
            </span>
          )}
        </span>
      </div>
      <Link to={chapterPath} className='flex h-9 items-center justify-center rounded-[10px] bg-primary text-[13px] font-extrabold text-primary-foreground'>{txa('Kaldığın Yerden Oku')}</Link>
      <Link to={buildPublicMangaPath({ id: item.mangaId, slug: item.mangaSlug, title: item.title })} className='flex h-9 items-center justify-center rounded-[10px] border border-white/15 text-[13px] font-bold'>{txa('Seriyi Aç')}</Link>
    </div>
  )
}

function FavModule({ user }: { user: MockUser }) {
  return (
    <div className='grid grid-cols-3 gap-2'>
      {user.following.slice(0, 3).map((manga, index) => (
        <Link key={manga.id} to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='flex min-w-0 flex-col gap-1.5 text-inherit hover:text-primary'>
          <span className='relative block aspect-[3/4] overflow-hidden rounded-lg'>
            <img src={cover(manga.coverImage, manga.title)} alt='' className='size-full object-cover' />
            <span className='absolute bottom-0 left-1 font-serif text-[30px] font-black leading-none text-white [text-shadow:0_2px_10px_#000c]'>{index + 1}</span>
          </span>
          <span className='truncate text-[11.5px] font-semibold'>{manga.title}</span>
        </Link>
      ))}
    </div>
  )
}

function ListModule({ list }: { list: MangaListSummary }) {
  const images = (list.previewImages?.length ? list.previewImages : [list.coverImage]).filter(Boolean).slice(0, 3) as string[]
  return (
    <Link to={`/listeler/${encodeURIComponent(list.id)}`} className='flex flex-col gap-3 text-inherit hover:text-primary'>
      <span className='relative block h-[120px]'>
        {images.map((image, index) => (
          <img
            key={image}
            src={cover(image, list.title)}
            alt=''
            className='absolute top-2 h-[104px] w-[74px] rounded-lg object-cover shadow-lg'
            style={{ left: `${10 + index * 60}px`, transform: `rotate(${[-8, 0, 8][index]}deg)`, top: index === 1 ? 0 : 12, zIndex: index === 1 ? 2 : 1 }}
          />
        ))}
      </span>
      <span>
        <span className='block truncate text-sm font-bold'>{list.title}</span>
        <span className='block text-xs text-white/60'>{txa('{v1} seri · {v2}', { v1: list.itemsCount, v2: list.isPublic ? txa('herkese açık') : txa('özel') })}</span>
      </span>
    </Link>
  )
}

function StatsModule({ user }: { user: MockUser }) {
  const hours = user.stats.timeSpentMinutes ? Math.round(user.stats.timeSpentMinutes / 60) : 0
  const boxes = [
    { k: txa('Okunan bölüm'), v: (user.stats.totalChaptersRead ?? 0).toLocaleString(intlLocale()) },
    { k: txa('Takip edilen seri'), v: user.following.length.toLocaleString(intlLocale()) },
    { k: txa('Okuma süresi'), v: `${hours.toLocaleString(intlLocale())} sa` },
    { k: txa('Yorum'), v: (user.stats.comments ?? 0).toLocaleString(intlLocale()) },
  ]
  return (
    <div className='grid grid-cols-2 gap-2'>
      {boxes.map((box) => (
        <div key={box.k} className='rounded-[10px] bg-white/[0.06] px-3 py-2.5'>
          <div className='text-[11px] font-semibold text-white/55'>{box.k}</div>
          <div className='mt-1 text-lg font-extrabold'>{box.v}</div>
        </div>
      ))}
    </div>
  )
}

const GENRE_COLORS = ['bg-primary', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400']

function GenresModule({ user }: { user: MockUser }) {
  const genres = (user.favoriteGenres ?? []).slice(0, 4)
  return (
    <div className='flex flex-col gap-2.5'>
      {genres.map((genre, index) => (
        <div key={genre.name} className='flex flex-col gap-1'>
          <div className='flex justify-between text-[12.5px]'><span className='font-semibold'>{genre.name}</span><span className='text-white/60'>{txa('%{v1}', { v1: Math.round(genre.percent) })}</span></div>
          <span className='h-1.5 overflow-hidden rounded-full bg-white/10'>
            <span className={cn('block h-full rounded-full', GENRE_COLORS[index])} style={{ width: `${Math.min(100, genre.percent)}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

function LevelModule({ user }: { user: MockUser }) {
  const level = user.progression
  if (!level) return null
  const percent = level.isMaxLevel ? 100 : Math.max(0, Math.min(100, Math.round(level.progressPercent ?? 0)))
  return (
    <div className='flex items-center gap-3'>
      <span className='flex size-14 flex-none flex-col items-center justify-center rounded-2xl bg-primary/20 text-primary'>
        <span className='text-[10px] font-bold uppercase tracking-wider'>{txa('Sv.')}</span>
        <span className='text-xl font-black leading-none'>{level.levelNumber}</span>
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <span className='truncate text-sm font-bold'>{txa(level.title)}</span>
        <span className='h-1.5 overflow-hidden rounded-full bg-white/10'><span className='block h-full rounded-full bg-primary' style={{ width: `${percent}%` }} /></span>
        <span className='text-[11.5px] text-white/60'>
          {level.isMaxLevel ? txa('En üst seviye') : level.xpToNextLevel !== null ? txa('Sonraki seviyeye {v1} XP', { v1: level.xpToNextLevel.toLocaleString(intlLocale()) }) : txa('%{v1}', { v1: percent })}
        </span>
      </span>
    </div>
  )
}

function TeamsModule({ user }: { user: MockUser }) {
  return (
    <div className='flex flex-col gap-2'>
      {user.followingFansubs.slice(0, 4).map((team) => (
        <Link key={team.id} to={buildPublicFansubPath({ id: team.id, slug: team.slug })} className='flex items-center gap-2.5 text-inherit hover:text-primary'>
          <img src={cover(team.avatar, team.name, 80)} alt='' className='size-9 flex-none rounded-full object-cover' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-[13px] font-semibold'>{team.name}</span>
            {team.mangaCount ? <span className='block text-[11px] text-white/55'>{txa('{v1} seri', { v1: team.mangaCount })}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  )
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} dk`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} sa`
  const days = Math.round(hours / 24)
  return days < 30 ? txa('{v1} gün', { v1: days }) : new Date(value).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

function ActivityModule({ user }: { user: MockUser }) {
  return (
    <ol className='flex flex-col gap-2'>
      {user.activityFeed.slice(0, 4).map((item) => (
        <li key={item.id} className='flex gap-2.5'>
          <span className={cn('mt-1 size-2 flex-none rounded-full', item.type === 'read' ? 'bg-primary' : 'bg-amber-400')} />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-[12.5px] font-semibold'>
              {item.type === 'read' ? txa('{v1} · Böl. {v2}', { v1: item.mangaTitle ?? txa('Seri'), v2: item.chapterNumber ?? '?' }) : txa('Yorum · {v1}', { v1: item.targetLabel ?? item.mangaTitle ?? '' })}
            </span>
            <span className='block text-[11px] text-white/50'>{item.type === 'read' ? txa('okudu') : txa('yorum yaptı')} · {timeAgo(item.timestamp)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function ProfileShowcaseSlot({ side, module, otherModule, data, canEdit, onChange }: {
  side: 'left' | 'right'
  module: ProfileSlotModule
  otherModule: ProfileSlotModule
  data: ProfileSlotData
  canEdit: boolean
  onChange: (module: ProfileSlotModule) => void
}) {
  const [picking, setPicking] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // Menu asagida sigmiyorsa yukari acilir (kart ekranin altindayken kesilmez).
  const togglePicker = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    setOpenUp(Boolean(rect) && (rect as DOMRect).bottom + 460 > window.innerHeight && (rect as DOMRect).top > 460)
    setPicking((value) => !value)
  }
  useEffect(() => {
    if (!picking) return undefined
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setPicking(false) }
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setPicking(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [picking])

  const has = module !== 'none' && slotHasContent(module, data)
  if (!has && !canEdit) return null
  const title = PROFILE_SLOT_MODULES.find((entry) => entry.id === module)?.title ?? ''

  return (
    <div ref={rootRef} className={cn('relative w-full', picking && 'z-50')} data-testid='profile-showcase-slot' data-module={module}>
      {has ? (
        <div className='rounded-2xl border border-[var(--profile-surface-border,rgb(255_255_255/0.1))] bg-[var(--profile-surface,rgb(0_0_0/0.45))] p-4 text-white shadow-[0_24px_60px_-20px_var(--profile-glow,rgb(0_0_0/0.6))] backdrop-blur-md' data-profile-themed-surface>
          <div className='mb-3 flex items-center justify-between gap-2'>
            <span className='text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60'>{title}</span>
            {canEdit && (
              <button type='button' onClick={togglePicker} className='flex h-7 items-center gap-1 rounded-lg border border-white/15 bg-transparent px-2 text-[11.5px] font-bold text-white/80 hover:bg-white/10' data-testid='profile-slot-change'>
                <ArrowsLeftRight weight='bold' size={12} />
                {txa('Değiştir')}
              </button>
            )}
          </div>
          {module === 'badges' && <BadgesModule badges={data.badges} />}
          {module === 'reading' && <ReadingModule user={data.user} />}
          {module === 'fav' && <FavModule user={data.user} />}
          {module === 'list' && <ListModule list={data.lists[0]} />}
          {module === 'stats' && <StatsModule user={data.user} />}
          {module === 'genres' && <GenresModule user={data.user} />}
          {module === 'level' && <LevelModule user={data.user} />}
          {module === 'teams' && <TeamsModule user={data.user} />}
          {module === 'activity' && <ActivityModule user={data.user} />}
        </div>
      ) : (
        <button
          type='button'
          onClick={togglePicker}
          className='flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-white/25 bg-black/30 px-4 py-6 text-center text-white/80 backdrop-blur-sm hover:border-white/45'
          data-testid='profile-slot-empty'
        >
          <PlusCircle weight='bold' size={22} />
          <span className='text-[13px] font-bold'>{txa('Bu yuvaya modül ekle')}</span>
          <span className='text-[11.5px] text-white/55'>
            {module !== 'none' ? txa('{v1} için henüz içerik yok · ', { v1: title }) : ''}{txa('Ziyaretçiler boş yuvayı görmez')}
          </span>
        </button>
      )}

      {picking && (
        <div className={cn('absolute inset-x-0 z-50 max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl', openUp ? 'bottom-full mb-2' : 'top-full mt-2')} role='menu' data-testid='profile-slot-picker'>
          <div className='px-2 pb-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>
            {side === 'left' ? txa('Sol yuvaya ne gelsin?') : txa('Sağ yuvaya ne gelsin?')}
          </div>
          {PROFILE_SLOT_MODULES.map((entry) => {
            const Icon = MODULE_ICON[entry.id]
            const active = entry.id === module
            return (
              <button
                key={entry.id}
                type='button'
                role='menuitemradio'
                aria-checked={active}
                onClick={() => { onChange(entry.id); setPicking(false) }}
                className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-accent', active && 'bg-accent')}
              >
                <span className={cn('flex size-8 flex-none items-center justify-center rounded-lg bg-muted', active ? 'text-primary' : 'text-foreground/80')}>
                  <Icon weight='bold' size={15} />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block text-[13px] font-bold'>{entry.title}</span>
                  <span className='block text-[11.5px] text-muted-foreground'>{entry.description}</span>
                </span>
                {entry.id !== 'none' && entry.id === otherModule && <span className='text-[10.5px] font-bold text-muted-foreground'>{txa('Diğer yuvada')}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
