import { useState } from 'react'
import { Link } from '@/i18n/router'
import {
  BookOpen, CalendarBlank, CrownSimple, DiscordLogo, InstagramLogo, LinkSimple, Medal, PushPin, Trophy, UsersThree, XLogo,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildPublicFansubPath, buildPublicMangaPath } from '@/lib/routes'
import { membershipLabel } from './helpers'
import { profileCover } from './profileMedia'
import { Meter, Panel, PanelEmpty } from './ProfileTabKit'
import type { MockUser, ProfileOwnedBadge } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Badges / Favorites / Teams tabs and the right column profile summary (tabs v3). */

const RARITY = {
  legendary: { get label() { return txa('Efsanevi') }, ink: 'text-amber-300', ring: 'border-amber-400/50', glow: 'from-amber-400/25', dot: 'bg-amber-400' },
  epic: { get label() { return txa('Destansı') }, ink: 'text-violet-300', ring: 'border-violet-400/45', glow: 'from-violet-400/25', dot: 'bg-violet-400' },
  rare: { get label() { return txa('Nadir') }, ink: 'text-sky-300', ring: 'border-sky-400/40', glow: 'from-sky-400/20', dot: 'bg-sky-400' },
  common: { get label() { return txa('Yaygın') }, ink: 'text-muted-foreground', ring: 'border-border/70', glow: 'from-foreground/[0.06]', dot: 'bg-muted-foreground' },
} as const
type Rarity = keyof typeof RARITY
const RARITY_ORDER: Rarity[] = ['legendary', 'epic', 'rare', 'common']
const rarityOf = (entry: ProfileOwnedBadge): Rarity => (entry.badge?.rarity && entry.badge.rarity in RARITY ? entry.badge.rarity as Rarity : 'common')

export function ProfileBadgesTab({ badges }: { badges: ProfileOwnedBadge[] }) {
  const [filter, setFilter] = useState<Rarity | 'all'>('all')
  const counts = RARITY_ORDER.map((rarity) => ({ rarity, count: badges.filter((entry) => rarityOf(entry) === rarity).length })).filter((entry) => entry.count > 0)
  const sorted = [...badges]
    .filter((entry) => filter === 'all' || rarityOf(entry) === filter)
    .sort((a, b) => Number(b.is_displayed) - Number(a.is_displayed)
      || RARITY_ORDER.indexOf(rarityOf(a)) - RARITY_ORDER.indexOf(rarityOf(b))
      || a.display_order - b.display_order)

  return (
    <Panel title={txa('Rozetler')} icon={Medal} tone='amber' meta={txa('{v1} rozet kazanıldı', { v1: badges.length })} testId='profile-badges-tab'>
      {badges.length ? (
        <div className='flex flex-col gap-4'>
          {counts.length > 1 && (
            <div className='flex flex-wrap gap-1.5' role='tablist' aria-label={txa('Nadirlik')}>
              {[{ rarity: 'all' as const, count: badges.length }, ...counts].map((entry) => (
                <button
                  key={entry.rarity}
                  type='button'
                  onClick={() => setFilter(entry.rarity)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold transition-colors',
                    filter === entry.rarity ? 'border-foreground/20 bg-foreground text-background' : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.rarity !== 'all' && <span className={cn('size-2 rounded-full', RARITY[entry.rarity].dot)} />}
                  {entry.rarity === 'all' ? txa('Tümü') : RARITY[entry.rarity].label}
                  <span className='opacity-60'>{entry.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'>
            {sorted.map((entry) => {
              const rarity = RARITY[rarityOf(entry)]
              return (
                <div key={entry.id} className={cn('group relative isolate flex flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-background/40 px-3 pb-4 pt-5 text-center', rarity.ring)}>
                  <span aria-hidden className={cn('absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b to-transparent', rarity.glow)} />
                  {entry.is_displayed && (
                    <span className='absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary' title={txa('Vitrinde')}>
                      <PushPin weight='fill' size={12} />
                    </span>
                  )}
                  <span className='flex size-[68px] items-center justify-center transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105'>
                    {entry.badge?.image_url ? <img src={entry.badge.image_url} alt='' className='size-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]' /> : <Medal size={36} className='text-muted-foreground' />}
                  </span>
                  <span className='line-clamp-1 text-[13.5px] font-bold'>{entry.badge?.name ?? txa('Rozet')}</span>
                  {entry.badge?.description && <span className='line-clamp-2 text-[11.5px] leading-snug text-muted-foreground'>{txa(entry.badge.description)}</span>}
                  <span className={cn('mt-auto text-[10.5px] font-extrabold uppercase tracking-[0.12em]', rarity.ink)}>{rarity.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : <PanelEmpty icon={Medal} title={txa('Henüz kazanılmış rozet yok')} hint={txa('Görevleri tamamladıkça ve etkinliklere katıldıkça rozetler burada birikir.')} />}
    </Panel>
  )
}

export function ProfileFavsTab({ user }: { user: MockUser }) {
  const [showAll, setShowAll] = useState(false)
  const podium = user.following.slice(0, 3)
  const rest = user.following.slice(3, showAll ? undefined : 13)
  const hidden = user.following.length - 3 - rest.length
  return (
    <Panel title={txa('Favoriler')} icon={CrownSimple} tone='amber' meta={txa('{v1} seri · takip sırasına göre', { v1: user.following.length })} testId='profile-favs-tab'>
      {podium.length ? (
        <div className={cn('grid gap-5', rest.length > 0 && 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8')}>
          <ol className='grid max-w-[620px] grid-cols-3 gap-3 self-start sm:gap-4'>
            {podium.map((manga, index) => (
              <li key={manga.id} className={cn(index === 0 && 'sm:-mt-1')}>
                <Link to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='group flex flex-col gap-2.5 text-inherit'>
                  <span className={cn('relative block aspect-[2/3] overflow-hidden rounded-2xl ring-1', index === 0 ? 'ring-2 ring-amber-400/60 shadow-[0_18px_40px_-18px_rgba(251,191,36,0.55)]' : 'ring-border/70')}>
                    <img src={profileCover(manga.coverImage, manga.title, 360)} alt='' className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]' />
                    <span aria-hidden className='absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent' />
                    <span className={cn('absolute bottom-1.5 left-3 text-4xl font-black italic leading-none drop-shadow sm:text-5xl', index === 0 ? 'text-amber-300' : 'text-white/90')}>{index + 1}</span>
                    {index === 0 && <CrownSimple weight='fill' size={20} className='absolute right-2.5 top-2.5 text-amber-300 drop-shadow' />}
                  </span>
                  <span className='line-clamp-2 text-[13px] font-bold leading-snug group-hover:text-primary sm:text-sm'>{manga.title}</span>
                </Link>
              </li>
            ))}
          </ol>
          {rest.length > 0 && (
            <ol className='grid gap-x-5 border-t border-border/60 pt-3 md:grid-cols-2 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0'>
              {rest.map((manga, index) => (
                <li key={manga.id}>
                  <Link to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='group flex items-center gap-3 rounded-xl px-1 py-2 text-inherit'>
                    <span className='w-6 flex-none text-center text-[15px] font-black tabular-nums text-muted-foreground/60'>{index + 4}</span>
                    <img src={profileCover(manga.coverImage, manga.title, 96)} alt='' className='h-12 w-9 flex-none rounded-md object-cover' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[13px] font-bold group-hover:text-primary'>{manga.title}</span>
                      <span className='block text-[11.5px] text-muted-foreground'>{manga.lastChapter ? txa('Son bölüm {v1}', { v1: manga.lastChapter }) : txa('Takipte')}</span>
                    </span>
                    {manga.isNew && <span className='rounded-md bg-primary/15 px-2 py-0.5 text-[10.5px] font-extrabold text-primary'>{txa('YENİ')}</span>}
                  </Link>
                </li>
              ))}
              {hidden > 0 && (
                <li>
                  <button type='button' onClick={() => setShowAll(true)} className='mt-1 w-full rounded-xl border border-dashed border-border/80 bg-transparent py-2 text-[12.5px] font-bold text-muted-foreground hover:border-primary/40 hover:text-primary'>
                    {txa('{v1} seri daha göster', { v1: hidden })}
                  </button>
                </li>
              )}
            </ol>
          )}
        </div>
      ) : <PanelEmpty icon={CrownSimple} title={txa('Henüz takip edilen seri yok')} />}
    </Panel>
  )
}

export function ProfileTeamsTab({ user }: { user: MockUser }) {
  return (
    <Panel title={txa('Ekipler')} icon={UsersThree} tone='violet' meta={txa('{v1} fansub ekibi takipte', { v1: user.followingFansubs.length })} testId='profile-teams-tab'>
      {user.followingFansubs.length ? (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {user.followingFansubs.map((team) => {
            const from = team.primaryColor || 'hsl(var(--primary))'
            const to = team.secondaryColor || 'hsl(var(--primary) / 0.2)'
            return (
              <Link key={team.id} to={buildPublicFansubPath({ id: team.id, slug: team.slug })} className='group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/40 text-inherit transition-colors hover:border-primary/40'>
                <span aria-hidden className='h-14 opacity-70 transition-opacity group-hover:opacity-100' style={{ background: `linear-gradient(120deg, ${from}, ${to})` }} />
                <span className='-mt-7 flex items-end gap-3 px-4'>
                  <img src={profileCover(team.avatar, team.name, 112)} alt='' className='size-14 flex-none rounded-2xl object-cover ring-4 ring-card' />
                </span>
                <span className='flex flex-col gap-2 px-4 pb-4 pt-2.5'>
                  <span className='truncate text-[14px] font-bold group-hover:text-primary'>{team.name}</span>
                  <span className='flex items-center gap-3 text-[11.5px] text-muted-foreground'>
                    <span className='flex items-center gap-1'><BookOpen weight='fill' size={12} />{txa('{v1} seri', { v1: (team.mangaCount ?? 0).toLocaleString(intlLocale()) })}</span>
                    <span className='flex items-center gap-1'><UsersThree weight='fill' size={12} />{txa('{v1} takipçi', { v1: (team.followerCount ?? 0).toLocaleString(intlLocale()) })}</span>
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      ) : <PanelEmpty icon={UsersThree} title={txa('Henüz takip edilen ekip yok')} hint={txa('Fansub sayfalarından sevdiğin ekipleri takibe alabilirsin.')} />}
    </Panel>
  )
}

const SOCIAL: Record<string, { icon: typeof XLogo, url: (name: string) => string }> = {
  discord: { icon: DiscordLogo, url: () => '' },
  instagram: { icon: InstagramLogo, url: (name) => `https://instagram.com/${name}` },
  x: { icon: XLogo, url: (name) => `https://x.com/${name}` },
  twitter: { icon: XLogo, url: (name) => `https://x.com/${name}` },
}

export function ProfileSocialLinks({ user, size = 'sm' }: { user: MockUser, size?: 'sm' | 'lg' }) {
  const links = user.socialLinks.filter((link) => link.username)
  if (!links.length) return null
  return (
    <div className={cn('flex flex-wrap', size === 'lg' ? 'gap-2' : 'gap-1.5')}>
      {links.map((link) => {
        const entry = SOCIAL[link.platform.toLowerCase()]
        const IconCmp = entry?.icon ?? LinkSimple
        const url = entry?.url(link.username)
        const cls = cn(
          'flex items-center gap-2 rounded-full border border-border/70 bg-background/40 font-semibold text-inherit transition-colors',
          size === 'lg' ? 'px-3.5 py-2 text-[13px]' : 'px-2.5 py-1 text-[11.5px]',
          url && 'hover:border-primary/40 hover:text-primary',
        )
        const body = <><IconCmp weight='fill' size={size === 'lg' ? 16 : 13} />{link.username}</>
        return url
          ? <a key={`${link.platform}-${link.username}`} href={url} target='_blank' rel='noreferrer noopener' className={cls}>{body}</a>
          : <span key={`${link.platform}-${link.username}`} className={cls} title={link.platform}>{body}</span>
      })}
    </div>
  )
}

/** Sag sutun: takip sayilari, seviye ilerlemesi, uyelik, ekipler, sosyal baglantilar. */
export function ProfileSideSummary({ user }: { user: MockUser }) {
  const membership = membershipLabel(user.joinedAt)
  const level = user.progression
  return (
    <Panel className='gap-0' bodyClassName='flex flex-col gap-4' testId='profile-side-summary'>
      <div className='grid grid-cols-2 divide-x divide-border/60 rounded-2xl border border-border/60 bg-background/40 py-3 text-center'>
        <div><div className='text-xl font-black tabular-nums'>{user.stats.followers.toLocaleString(intlLocale())}</div><div className='text-[11px] font-semibold text-muted-foreground'>{txa('takipçi')}</div></div>
        <div><div className='text-xl font-black tabular-nums'>{(user.stats.following ?? 0).toLocaleString(intlLocale())}</div><div className='text-[11px] font-semibold text-muted-foreground'>{txa('takip')}</div></div>
      </div>
      {level && (
        <div className='flex flex-col gap-2'>
          <div className='flex items-center gap-2.5'>
            <span className='flex size-9 flex-none items-center justify-center rounded-xl bg-amber-400/15 text-[13px] font-black text-amber-300'>{level.levelNumber}</span>
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-[13px] font-bold'>{txa(level.title)}</span>
              <span className='block text-[11px] text-muted-foreground'>{level.isMaxLevel ? txa('En yüksek seviye') : txa('Sonraki seviyeye {v1} XP', { v1: (level.xpToNextLevel ?? 0).toLocaleString(intlLocale()) })}</span>
            </span>
            <Trophy weight='fill' size={16} className='text-amber-400' />
          </div>
          <Meter percent={level.isMaxLevel ? 100 : level.progressPercent ?? 0} barClassName='from-amber-400 to-amber-300' />
        </div>
      )}
      <ul className='flex flex-col gap-2.5 border-t border-border/60 pt-3.5 text-[12.5px] text-muted-foreground'>
        {user.joinDate && (
          <li className='flex items-center gap-2.5'>
            <CalendarBlank weight='fill' size={15} className='flex-none text-primary' />
            <span>{txa('{date} tarihinde katıldı', { date: user.joinDate })}{membership ? <span className='text-foreground/70'> · {membership}</span> : null}</span>
          </li>
        )}
        <li className='flex items-center gap-2.5'><BookOpen weight='fill' size={15} className='text-sky-300' />{txa('{v1} seri takip ediyor', { v1: user.following.length })}</li>
        {user.followingFansubs.length > 0 && (
          <li className='flex items-center gap-2.5'><UsersThree weight='fill' size={15} className='text-violet-300' />{txa('{v1} fansub ekibini takip ediyor', { v1: user.followingFansubs.length })}</li>
        )}
      </ul>
      <ProfileSocialLinks user={user} />
    </Panel>
  )
}
