import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, BookOpen, Clock, Heart, Lightning, UsersThree } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { resolveProfileSurfaceImage } from '../profile/profileMedia'
import type { FansubChapterPreview, FansubMangaShelfItem, FansubMember } from './types'
import { roleLabel } from './tabs/fansubTabUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Fansub showcase (user profile layout): fixed modules on both sides of the scene, a cover wall behind the
 * scene and a right column summary in the tab area. Surfaces use the same tokens as the profile
 * showcase; an empty module is never visible.
 */

const DAY_MS = 86_400_000
const NEW_WINDOW_MS = 3 * DAY_MS

const cover = (value: string | undefined | null, title: string, width = 160) =>
  resolveProfileSurfaceImage(value, width) || buildCoverPlaceholder(title)

const releasedAt = (chapter: FansubChapterPreview) => new Date(chapter.publishAt || chapter.createdAt).getTime()

function relativeTime(time: number) {
  const diff = Date.now() - time
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.max(0, Math.round(diff / 60000))
  if (minutes < 60) return txa('{v1} dk önce', { v1: Math.max(1, minutes) })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return txa('{v1} sa önce', { v1: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  return new Date(time).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

function StageCard({ title, action, children, testId }: { title: string, action?: ReactNode, children: ReactNode, testId: string }) {
  return (
    <div
      className='rounded-2xl border border-[var(--profile-surface-border,rgb(255_255_255/0.1))] bg-[var(--profile-surface,rgb(0_0_0/0.45))] p-4 text-white shadow-[0_24px_60px_-20px_var(--profile-glow,rgb(0_0_0/0.6))] backdrop-blur-md'
      data-profile-themed-surface
      data-testid={testId}
    >
      <div className='mb-3 flex items-center justify-between gap-2'>
        <span className='text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60'>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function StageLinkButton({ onClick, children }: { onClick: () => void, children: ReactNode }) {
  return (
    <button type='button' onClick={onClick} className='flex items-center gap-1 bg-transparent text-[11.5px] font-bold text-white/70 hover:text-white'>
      {children}
      <ArrowRight weight='bold' size={11} />
    </button>
  )
}

/**
 * Behind the scene: a tilted cover wall from the fansub's own series. Even a fansub with no background
 * appears "with its work" in the showcase; it darkens toward the edges and does not overpower cards.
 */
export function FansubCoverWall({ mangas }: { mangas: FansubMangaShelfItem[] }) {
  const covers = mangas.map((manga) => cover(manga.coverImage, manga.title, 200))
  if (covers.length < 2) return null
  const tiles = Array.from({ length: 48 }, (_, index) => covers[index % covers.length])
  return (
    <div className='pointer-events-none absolute inset-0 overflow-hidden rounded-2xl' aria-hidden data-testid='fansub-cover-wall'>
      <div className='absolute left-1/2 top-1/2 grid w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-[8deg] grid-cols-8 gap-3 opacity-[0.16]'>
        {tiles.map((src, index) => (
          <img
            key={index}
            src={src}
            alt=''
            loading='lazy'
            className={cn('aspect-[3/4] w-full rounded-xl object-cover', index % 2 === 1 && 'translate-y-10')}
          />
        ))}
      </div>
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_20%,#07080b_78%)]' />
    </div>
  )
}

export function FansubStageRecentChapters({ chapters, onShowAll }: { chapters: FansubChapterPreview[], onShowAll: () => void }) {
  const items = chapters.filter((chapter) => !chapter.isPending).slice(0, 4)
  if (!items.length) return null
  const now = Date.now()
  return (
    <StageCard title={txa('Son bölümler')} testId='fansub-stage-recent' action={<StageLinkButton onClick={onShowAll}>{txa('Tümü')}</StageLinkButton>}>
      <div className='flex flex-col gap-2.5'>
        {items.map((chapter) => {
          const time = releasedAt(chapter)
          const isNew = now - time < NEW_WINDOW_MS
          return (
            <Link
              key={chapter.chapterId}
              to={buildPublicChapterPath({ mangaId: chapter.mangaId, mangaSlug: chapter.mangaSlug, mangaTitle: chapter.mangaTitle, chapterNumber: chapter.chapterNumber })}
              className='group flex items-center gap-3 text-inherit'
            >
              <img src={cover(chapter.coverImage, chapter.mangaTitle, 96)} alt='' className='h-[52px] w-[38px] flex-none rounded-md object-cover transition-transform group-hover:scale-105' />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-[13px] font-bold group-hover:text-primary'>{chapter.mangaTitle}</span>
                <span className='flex items-center gap-1.5 text-xs font-bold text-primary'>
                  {txa('Bölüm {v1}', { v1: chapter.chapterNumber })}
                  {isNew && <span className='rounded-full bg-primary px-1.5 py-px text-[9.5px] font-black tracking-wide text-primary-foreground' data-testid='fansub-stage-new'>{txa('YENİ')}</span>}
                </span>
              </span>
              <span className='flex-none text-[11px] text-white/50'>{relativeTime(time)}</span>
            </Link>
          )
        })}
      </div>
    </StageCard>
  )
}

export function FansubStageSeries({ mangas, members, onShowAll, onShowTeam }: {
  mangas: FansubMangaShelfItem[]
  members: FansubMember[]
  onShowAll: () => void
  onShowTeam: () => void
}) {
  if (!mangas.length && !members.length) return null
  return (
    <StageCard title={txa('Seriler')} testId='fansub-stage-series' action={mangas.length > 3 ? <StageLinkButton onClick={onShowAll}>{txa('Tümü ({v1})', { v1: mangas.length })}</StageLinkButton> : null}>
      {mangas.length ? (
        <div className='grid grid-cols-3 gap-2'>
          {mangas.slice(0, 3).map((manga) => (
            <Link key={manga.id} to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='group flex min-w-0 flex-col gap-1.5 text-inherit'>
              <span className='relative block aspect-[3/4] overflow-hidden rounded-lg'>
                <img src={cover(manga.coverImage, manga.title)} alt='' className='size-full object-cover transition-transform duration-300 group-hover:scale-105' />
                {manga.approvedChapterCount > 0 && (
                  <span className='absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-px text-[10px] font-bold tabular-nums backdrop-blur-sm'>{manga.approvedChapterCount}{' '}{txa('bl.')}</span>
                )}
              </span>
              <span className='truncate text-[11.5px] font-semibold group-hover:text-primary'>{manga.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {members.length ? (
        <button type='button' onClick={onShowTeam} className={cn('flex w-full items-center gap-2.5 rounded-xl bg-white/[0.05] px-2.5 py-2 text-left hover:bg-white/10', mangas.length && 'mt-3')} data-testid='fansub-stage-team'>
          <span className='flex -space-x-2'>
            {members.slice(0, 5).map((member) => (
              <img key={member.id} src={member.avatar} alt='' className='size-7 rounded-full border-2 border-black/60 object-cover' />
            ))}
          </span>
          <span className='min-w-0 flex-1 truncate text-[12px] font-semibold text-white/80'>{txa('{count} kişilik ekip', { count: members.length })}</span>
          <ArrowRight weight='bold' size={12} className='text-white/60' />
        </button>
      ) : null}
    </StageCard>
  )
}

export function FansubSideSummary({ mangaCount, chapters, followerCount, members }: {
  mangaCount: number
  chapters: FansubChapterPreview[]
  followerCount: number
  members: FansubMember[]
}) {
  const released = chapters.filter((chapter) => !chapter.isPending).map(releasedAt).filter(Number.isFinite)
  const last = released.length ? Math.max(...released) : null
  const now = Date.now()
  const lastMonth = released.filter((time) => now - time < 30 * DAY_MS).length
  const boxes = [
    { k: txa('Seri'), v: mangaCount, icon: BookOpen },
    { k: txa('Takipçi'), v: followerCount, icon: Heart },
    { k: txa('Ekip'), v: members.length, icon: UsersThree },
    { k: txa('Son 30 gün'), v: lastMonth, icon: Lightning, suffix: txa(' bölüm') },
  ]
  return (
    <section className='rounded-2xl border border-border bg-card p-4' data-testid='fansub-side-summary'>
      {last !== null ? (
        <div className='mb-3 flex items-center gap-2.5 rounded-xl bg-primary/10 px-3 py-2.5'>
          <span className='relative flex size-2.5'>
            {now - last < NEW_WINDOW_MS && <span className='absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60' />}
            <span className='relative inline-flex size-2.5 rounded-full bg-primary' />
          </span>
          <span className='text-[12.5px]'>
            <span className='text-muted-foreground'>{txa('Son yayın ')}</span>
            <span className='font-bold'>{relativeTime(last)}</span>
          </span>
          <Clock size={14} className='ml-auto text-primary' />
        </div>
      ) : null}
      <div className='grid grid-cols-2 gap-2'>
        {boxes.map((box) => (
          <div key={box.k} className='rounded-xl bg-muted/50 px-3 py-2.5'>
            <div className='flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground'><box.icon size={13} weight='bold' />{box.k}</div>
            <div className='mt-1 text-lg font-extrabold tabular-nums'>
              {box.v.toLocaleString(intlLocale())}
              {box.suffix && <span className='text-xs font-semibold text-muted-foreground'>{box.suffix}</span>}
            </div>
          </div>
        ))}
      </div>
      {members.length ? (
        <div className='mt-4'>
          <div className='mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('Ekip')}</div>
          <div className='flex flex-col gap-1'>
            {members.slice(0, 6).map((member) => (
              <Link key={member.id} to={`/profil/${encodeURIComponent(member.username)}`} className='flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-inherit hover:bg-muted/60'>
                <img src={member.avatar} alt='' className='size-8 flex-none rounded-full object-cover' />
                <span className='min-w-0 flex-1 truncate text-[13px] font-semibold'>{member.username}</span>
                <span className='flex-none text-[11px] text-muted-foreground'>{roleLabel(member.role)}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
