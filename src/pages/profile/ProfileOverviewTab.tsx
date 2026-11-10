import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  BookOpen, BookOpenText, CalendarCheck, ChatCircle, ClockCounterClockwise, Fire, Heart, LockSimple, Play, Stack,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import type { MangaListSummary } from '@/services/mangaListService/types'
import { profileCover } from './profileMedia'
import { Meter, Panel, PanelEmpty, ToneIcon } from './ProfileTabKit'
import type { ProfileReadingSummary } from './useProfileReadingSummary'
import type { MockUser, ReadingHistoryItem } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Overview (tabs v3): a "reading now" scene on top + this month's rhythm and reading history,
 * a shelf of followed series in the middle, lists and recent activity by day at the bottom.
 */

/** Reading history is per chapter; each series once (the last chapter read). */
function latestPerSeries(history: ReadingHistoryItem[], limit: number) {
  const seen = new Set<string>()
  return history.filter((item) => (seen.has(item.mangaId) ? false : (seen.add(item.mangaId), true))).slice(0, limit)
}

function progressOf(item: ReadingHistoryItem) {
  const total = item.lastChapterNumber && item.lastChapterNumber > 0 ? item.lastChapterNumber : null
  const percent = total ? Math.min(100, Math.round((item.chapterNumber / total) * 100)) : null
  return { total, percent }
}

const chapterPath = (item: ReadingHistoryItem) =>
  buildPublicChapterPath({ mangaId: item.mangaId, mangaSlug: item.mangaSlug, mangaTitle: item.title, chapterNumber: item.chapterNumber })

function NowReading({ item, isOwnProfile }: { item: ReadingHistoryItem, isOwnProfile: boolean }) {
  const { total, percent } = progressOf(item)
  const image = profileCover(item.coverImage, item.title, 360)
  return (
    <section className='relative isolate flex min-h-[236px] overflow-hidden rounded-[20px] border border-border/70' data-testid='profile-continue'>
      <img src={image} alt='' aria-hidden className='absolute inset-0 -z-20 size-full scale-125 object-cover opacity-70 blur-2xl' />
      <span aria-hidden className='absolute inset-0 -z-10 bg-gradient-to-r from-background/95 via-background/70 to-background/10' />
      <div className='flex w-full items-center gap-4 p-4 sm:gap-5 sm:p-6'>
        <Link to={chapterPath(item)} className='group relative flex-none'>
          <img src={image} alt='' className='h-[132px] w-[92px] rounded-xl sm:h-[168px] sm:w-[118px] object-cover shadow-[0_24px_48px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-1' />
        </Link>
        <div className='flex min-w-0 flex-1 flex-col gap-2.5' data-testid='profile-continue-card'>
          <span className='flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary'>
            <span className='relative flex size-2'>
              <span className='absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60' />
              <span className='relative inline-flex size-2 rounded-full bg-primary' />
            </span>
            {txa('Şu an okuyor')}
          </span>
          <Link to={buildPublicMangaPath({ id: item.mangaId, slug: item.mangaSlug, title: item.title })} className='line-clamp-2 text-xl font-black leading-tight tracking-tight text-inherit hover:text-primary sm:text-2xl'>
            {item.title}
          </Link>
          <span className='text-[13px] font-semibold text-muted-foreground'>
            {txa('Bölüm {v1}', { v1: item.chapterNumber })}{total ? ` / ${total}` : ''}{percent === 100 ? txa(' · güncel') : ''}
          </span>
          {percent !== null && (
            <span className='flex max-w-[360px] items-center gap-3'>
              <Meter percent={percent} className='h-2 flex-1' />
              <span className='text-[12px] font-extrabold tabular-nums'>{txa('%{v1}', { v1: percent })}</span>
            </span>
          )}
          <Link
            to={chapterPath(item)}
            className='mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground transition-transform hover:scale-[1.03]'
          >
            <Play weight='fill' size={12} />
            <span className='sm:hidden'>{isOwnProfile ? txa('Devam et') : txa('Bölümü aç')}</span>
            <span className='hidden sm:inline'>{isOwnProfile ? txa('Kaldığın yerden devam et') : txa('Bu bölümü aç')}</span>
          </Link>
        </div>
      </div>
    </section>
  )
}

function MonthPulse({ summary }: { summary: ProfileReadingSummary }) {
  const month = summary.monthly[summary.monthly.length - 1]
  const previous = summary.monthly[summary.monthly.length - 2]
  const diff = month && previous ? month.chapters - previous.chapters : 0
  const items: Array<{ icon: typeof Fire, tone: 'primary' | 'amber' | 'emerald', value: string, label: string }> = [
    { icon: BookOpenText, tone: 'primary', value: String(month?.chapters ?? 0), label: txa('bölüm bu ay') },
    { icon: Fire, tone: 'amber', value: `${summary.currentStreak}`, label: txa('günlük seri') },
    { icon: CalendarCheck, tone: 'emerald', value: String(summary.activeDays), label: txa('aktif gün') },
  ]
  return (
    <div className='rounded-[20px] border border-border/70 bg-card/60 p-4'>
      <div className='mb-3 flex items-baseline justify-between'>
        <span className='text-[13px] font-bold'>{txa('Bu ayın ritmi')}</span>
        {previous && (
          <span className={cn('text-[11.5px] font-bold', diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-muted-foreground')}>
            {txa('{diff} geçen aya göre', { diff: diff > 0 ? `+${diff}` : diff })}
          </span>
        )}
      </div>
      <div className='grid grid-cols-3 gap-2'>
        {items.map((entry) => (
          <div key={entry.label} className='flex flex-col items-start gap-1.5 rounded-xl bg-background/50 p-3'>
            <ToneIcon icon={entry.icon} tone={entry.tone} size='sm' />
            <span className='text-xl font-black leading-none tabular-nums'>{entry.value}</span>
            <span className='text-[11px] text-muted-foreground'>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryRow({ item }: { item: ReadingHistoryItem }) {
  const { total, percent } = progressOf(item)
  return (
    <Link to={chapterPath(item)} className='group flex items-center gap-3 rounded-xl px-2 py-2 text-inherit transition-colors hover:bg-accent/60'>
      <img src={profileCover(item.coverImage, item.title, 96)} alt='' className='h-[52px] w-[38px] flex-none rounded-md object-cover' />
      <span className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='truncate text-[13px] font-bold group-hover:text-primary'>{item.title}</span>
        <span className='flex items-center gap-2'>
          <span className='flex-none text-[11.5px] text-muted-foreground'>{txa('Böl. {number}', { number: item.chapterNumber })}{total ? ` / ${total}` : ''}</span>
          {percent !== null && <Meter percent={percent} className='h-1 flex-1' />}
        </span>
      </span>
    </Link>
  )
}

function ListRow({ list }: { list: MangaListSummary }) {
  const covers = (list.previewImages?.length ? list.previewImages : list.coverImage ? [list.coverImage] : []).slice(0, 3)
  return (
    <Link to={`/listeler/${list.id}`} className='group flex items-center gap-3.5 rounded-xl px-2 py-2.5 text-inherit transition-colors hover:bg-accent/60'>
      <span className='relative h-[52px] w-[64px] flex-none'>
        {(covers.length ? covers : ['']).map((src, index) => (
          <img
            key={`${src}-${index}`}
            src={profileCover(src, list.title, 96)}
            alt=''
            className='absolute top-0 h-[52px] w-[38px] rounded-md object-cover ring-2 ring-card'
            style={{ left: index * 12, zIndex: 3 - index, transform: `rotate(${(index - 1) * 4}deg)` }}
          />
        ))}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-1.5 text-[13.5px] font-bold group-hover:text-primary'>
          <span className='truncate'>{list.title}</span>
          {!list.isPublic && <LockSimple weight='fill' size={11} className='flex-none text-muted-foreground' />}
        </span>
        <span className='mt-0.5 flex items-center gap-2.5 text-[11.5px] text-muted-foreground'>
          <span>{txa('{v1} seri', { v1: list.itemsCount })}</span>
          {list.ratingsCount > 0 && <span className='flex items-center gap-1'><Heart weight='fill' size={10} className='text-rose-400' />{list.ratingAvg.toFixed(1)}</span>}
          {list.commentsCount > 0 && <span className='flex items-center gap-1'><ChatCircle weight='fill' size={10} />{list.commentsCount}</span>}
        </span>
      </span>
    </Link>
  )
}

function dayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000)
  if (diff === 0) return txa('Bugün')
  if (diff === 1) return txa('Dün')
  return date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' })
}

function ActivityTimeline({ user }: { user: MockUser }) {
  const groups = new Map<string, MockUser['activityFeed']>()
  for (const item of user.activityFeed.slice(0, 10)) {
    const key = dayLabel(item.timestamp)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return (
    <div className='flex flex-col gap-4'>
      {[...groups.entries()].map(([day, items]) => (
        <div key={day}>
          <span className='mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{day}</span>
          <ol className='relative flex flex-col'>
            <span aria-hidden className='absolute bottom-3 left-[13px] top-3 w-px bg-border' />
            {items.map((item) => {
              const read = item.type === 'read'
              const IconCmp = read ? BookOpen : ChatCircle
              const body: ReactNode = read
                ? <><b className='font-semibold text-foreground'>{item.mangaTitle ?? txa('Seri')}</b> {txa('· Bölüm {v1}', { v1: item.chapterNumber ?? '?' })}</>
                : <><b className='font-semibold text-foreground'>{item.targetLabel ?? item.mangaTitle ?? txa('Gönderi')}</b> {txa('için yorum')}</>
              return (
                <li key={item.id} className='relative flex items-center gap-3 py-1.5 text-[13px] text-muted-foreground'>
                  <span className={cn('relative z-10 flex size-[27px] flex-none items-center justify-center rounded-full ring-4 ring-card', read ? 'bg-primary/15 text-primary' : 'bg-amber-400/15 text-amber-300')}>
                    <IconCmp weight='fill' size={13} />
                  </span>
                  {item.mangaId ? (
                    <Link to={buildPublicMangaPath({ id: item.mangaId, title: item.mangaTitle })} className='min-w-0 truncate text-inherit hover:text-primary'>{body}</Link>
                  ) : <span className='min-w-0 truncate'>{body}</span>}
                  <span className='ml-auto flex-none text-[11px] tabular-nums'>
                    {new Date(item.timestamp).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

export function ProfileOverviewTab({ user, isOwnProfile, canViewActivity, lists, listsLoading, summary, onOpenTab }: {
  user: MockUser
  isOwnProfile: boolean
  canViewActivity: boolean
  lists: MangaListSummary[]
  listsLoading: boolean
  summary: ProfileReadingSummary | null
  onOpenTab: (tab: 'favs' | 'lists') => void
}) {
  const recent = latestPerSeries(user.readingHistory, 5)
  const [current, ...history] = recent
  const follows = user.following.slice(0, 16)
  const showActivity = canViewActivity && user.activityFeed.length > 0

  return (
    <div className='flex flex-col gap-5' data-testid='profile-overview-tab'>
      {current ? (
        <div className='grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
          <NowReading item={current} isOwnProfile={isOwnProfile} />
          <div className='flex min-w-0 flex-col gap-5'>
            {summary && <MonthPulse summary={summary} />}
            {history.length > 0 && (
              <Panel title={txa('Okuma geçmişi')} icon={ClockCounterClockwise} tone='sky' flush bodyClassName='px-3'>
                {history.slice(0, summary ? 2 : 4).map((item) => <HistoryRow key={item.mangaId} item={item} />)}
              </Panel>
            )}
          </div>
        </div>
      ) : null}

      <Panel
        title={txa('Takip ettiği seriler')}
        icon={BookOpen}
        meta={txa('{v1} seri takipte', { v1: user.following.length.toLocaleString(intlLocale()) })}
        action={user.following.length > follows.length ? { label: txa('Tümünü gör'), onClick: () => onOpenTab('favs') } : undefined}
      >
        {follows.length ? (
          <div className='grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 2xl:grid-cols-8'>
            {follows.map((manga) => (
              <Link key={manga.id} to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='group flex min-w-0 flex-col gap-2 text-inherit'>
                <span className='relative block aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-border/70'>
                  <img src={profileCover(manga.coverImage, manga.title)} alt='' loading='lazy' className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]' />
                  <span aria-hidden className='absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent opacity-80' />
                  {manga.isNew && <span className='absolute left-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-primary-foreground'>{txa('YENİ')}</span>}
                  {manga.lastChapter && <span className='absolute bottom-1.5 left-2 text-[11px] font-bold text-white/90'>{txa('Böl. {v1}', { v1: manga.lastChapter })}</span>}
                </span>
                <span className='line-clamp-2 text-[12.5px] font-bold leading-snug group-hover:text-primary'>{manga.title}</span>
              </Link>
            ))}
          </div>
        ) : <PanelEmpty icon={BookOpen} title={txa('Henüz takip edilen seri yok')} hint={isOwnProfile ? txa('Beğendiğin serileri takibe aldığında burada rafa dizilir.') : undefined} />}
      </Panel>

      <div className={cn('grid gap-5', showActivity && 'lg:grid-cols-2')}>
        <Panel
          title={isOwnProfile ? txa('Listelerim') : txa('Listeleri')}
          icon={Stack}
          tone='violet'
          meta={txa('{v1} liste', { v1: lists.length })}
          action={lists.length > 4 ? { label: txa('Tümü'), onClick: () => onOpenTab('lists') } : undefined}
          flush={canViewActivity && lists.length > 0}
          bodyClassName={canViewActivity && lists.length > 0 ? 'px-3' : undefined}
        >
          {!canViewActivity ? (
            <PanelEmpty icon={LockSimple} title={txa('Listeler gizli')} />
          ) : listsLoading ? (
            <div className='flex flex-col gap-2 p-2'>{[0, 1, 2].map((key) => <span key={key} className='h-14 animate-pulse rounded-xl bg-muted/50' />)}</div>
          ) : lists.length ? (
            lists.slice(0, 4).map((list) => <ListRow key={list.id} list={list} />)
          ) : (
            <PanelEmpty icon={Stack} title={isOwnProfile ? txa('Henüz listen yok') : txa('Görüntülenecek liste yok')} hint={isOwnProfile ? txa('Listeler sayfasından ilk listeni oluştur.') : undefined} />
          )}
        </Panel>

        {showActivity && (
          <Panel title={txa('Son etkinlik')} icon={ClockCounterClockwise} tone='amber' testId='profile-activity'>
            <ActivityTimeline user={user} />
          </Panel>
        )}
      </div>
    </div>
  )
}
