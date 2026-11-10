import { Link } from '@/i18n/router'
import { ChatCircle, Globe, LockSimple, Plus, Stack, Star } from '@phosphor-icons/react'
import type { MangaListSummary } from '@/services/mangaListService/types'
import { profileCover } from './profileMedia'
import { Panel, PanelEmpty } from './ProfileTabKit'
import { txa } from '@/i18n/activeLocale'

/* Lists (tabs v3): list cards with fanned covers; a new list shortcut for the owner. */

function ListCard({ list }: { list: MangaListSummary }) {
  const covers = (list.previewImages?.length ? list.previewImages : list.coverImage ? [list.coverImage] : ['']).slice(0, 3)
  const backdrop = profileCover(covers[0], list.title, 320)
  return (
    <Link to={`/listeler/${list.id}`} className='group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/40 text-inherit transition-colors hover:border-primary/40'>
      <span className='relative isolate flex h-40 items-end justify-center overflow-hidden'>
        <img src={backdrop} alt='' aria-hidden className='absolute inset-0 -z-20 size-full scale-125 object-cover opacity-40 blur-xl' />
        <span aria-hidden className='absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/40 to-transparent' />
        {covers.map((src, index) => {
          const offset = index - (covers.length - 1) / 2
          return (
            <img
              key={`${src}-${index}`}
              src={profileCover(src, list.title, 200)}
              alt=''
              className='absolute bottom-[-18px] h-[132px] w-[92px] rounded-xl object-cover shadow-[0_18px_30px_-14px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-transform duration-300'
              style={{
                zIndex: 10 - Math.abs(offset),
                transform: `translateX(${offset * 58}px) rotate(${offset * 7}deg) translateY(${Math.abs(offset) * 8}px)`,
              }}
            />
          )
        })}
      </span>
      <span className='flex flex-1 flex-col gap-1.5 p-4 pt-5'>
        <span className='flex items-center gap-1.5'>
          <span className='truncate text-[14.5px] font-bold group-hover:text-primary'>{list.title}</span>
          {list.isPublic
            ? <Globe weight='bold' size={12} className='flex-none text-muted-foreground' aria-label={txa('Herkese açık')} />
            : <LockSimple weight='fill' size={12} className='flex-none text-muted-foreground' aria-label={txa('Gizli')} />}
        </span>
        {list.description && <span className='line-clamp-2 text-[12.5px] leading-snug text-muted-foreground'>{list.description}</span>}
        <span className='mt-auto flex items-center gap-3 pt-1.5 text-[11.5px] font-semibold text-muted-foreground'>
          <span className='flex items-center gap-1'><Stack weight='fill' size={12} />{txa('{v1} seri', { v1: list.itemsCount })}</span>
          {list.ratingsCount > 0 && <span className='flex items-center gap-1'><Star weight='fill' size={12} className='text-amber-400' />{list.ratingAvg.toFixed(1)}</span>}
          {list.commentsCount > 0 && <span className='flex items-center gap-1'><ChatCircle weight='fill' size={12} />{list.commentsCount}</span>}
        </span>
      </span>
    </Link>
  )
}

export function ProfileListsTab({ lists, loading, canViewActivity, isOwnProfile }: {
  lists: MangaListSummary[]
  loading: boolean
  canViewActivity: boolean
  isOwnProfile: boolean
}) {
  const items = lists.reduce((sum, list) => sum + list.itemsCount, 0)
  return (
    <Panel
      title={isOwnProfile ? txa('Listelerim') : txa('Listeleri')}
      icon={Stack}
      tone='violet'
      meta={lists.length ? txa('{v1} liste · toplam {v2} seri', { v1: lists.length, v2: items }) : undefined}
      action={isOwnProfile ? { label: txa('Listeleri yönet'), to: '/listeler' } : undefined}
      testId='profile-lists-tab'
    >
      {!canViewActivity ? (
        <PanelEmpty icon={LockSimple} title={txa('Bu kullanıcının liste alanı gizli')} />
      ) : loading ? (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>{[0, 1, 2].map((key) => <span key={key} className='h-64 animate-pulse rounded-2xl bg-muted/40' />)}</div>
      ) : lists.length ? (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {lists.map((list) => <ListCard key={list.id} list={list} />)}
          {isOwnProfile && (
            <Link to='/listeler' className='flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 text-[13px] font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary'>
              <span className='flex size-11 items-center justify-center rounded-full bg-muted'><Plus weight='bold' size={18} /></span>
              {txa('Yeni liste oluştur')}
            </Link>
          )}
        </div>
      ) : (
        <PanelEmpty
          icon={Stack}
          title={isOwnProfile ? txa('Henüz listen yok') : txa('Görüntülenecek liste yok')}
          hint={isOwnProfile ? txa('Okuduklarını temalara göre grupla, başkalarıyla paylaş.') : undefined}
          action={isOwnProfile ? <Link to='/listeler' className='mt-1 rounded-full bg-primary px-4 py-1.5 text-[12.5px] font-bold text-primary-foreground'>{txa('İlk listeni oluştur')}</Link> : undefined}
        />
      )}
    </Panel>
  )
}
