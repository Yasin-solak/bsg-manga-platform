import { Link } from '@/i18n/router'
import {
  BookOpenText, CalendarBlank, ChatCircle, Clock, IdentificationCard, LinkSimple, PencilSimple, Quotes, Sparkle, Trophy, UsersThree,
} from '@phosphor-icons/react'
import { buildPublicFansubPath } from '@/lib/routes'
import { formatTimeSpent, membershipLabel } from './helpers'
import { profileCover } from './profileMedia'
import { ProfileSocialLinks } from './ProfileCollectionTabs'
import { Panel, PanelEmpty } from './ProfileTabKit'
import type { MockUser } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * About (tabs v3): bio, details (membership, level, reading, comments), favorite genres,
 * links and, if there is no Teams tab, followed teams.
 */

function Fact({ icon: IconCmp, label, value, sub }: { icon: typeof Clock, label: string, value: string, sub?: string | null }) {
  return (
    <div className='flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 p-3.5'>
      <span className='flex size-8 flex-none items-center justify-center rounded-[10px] bg-muted text-muted-foreground'><IconCmp weight='fill' size={15} /></span>
      <span className='min-w-0'>
        <span className='block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground'>{label}</span>
        <span className='block truncate text-[14px] font-bold'>{value}</span>
        {sub && <span className='block truncate text-[11.5px] text-muted-foreground'>{sub}</span>}
      </span>
    </div>
  )
}

export function ProfileAboutTab({ user, isOwnProfile, canViewProfileStats, showTeams, onEdit }: {
  user: MockUser
  isOwnProfile: boolean
  canViewProfileStats: boolean
  /** Ekipler sekmesi kapaliysa takip edilen ekipler burada gosterilir. */
  showTeams: boolean
  onEdit: () => void
}) {
  const bio = user.bio?.trim()
  const genres = (user.favoriteGenres ?? []).slice(0, 8)
  const hasLinks = user.socialLinks.some((link) => link.username)
  const level = user.progression

  return (
    <div className='flex flex-col gap-5' data-testid='profile-about-tab'>
      <Panel title={txa('Hakkında')} icon={Quotes} action={isOwnProfile ? { label: txa('Düzenle'), onClick: onEdit } : undefined}>
        {bio ? (
          <p className='relative whitespace-pre-line pl-5 text-[15px] leading-7 text-foreground/90 before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-full before:bg-primary/60'>
            {bio}
          </p>
        ) : (
          <PanelEmpty
            icon={Quotes}
            title={isOwnProfile ? txa('Kendini tanıt') : txa('Henüz bir biyografi yok')}
            hint={isOwnProfile ? txa('Ne okuduğunu, neyi sevdiğini birkaç cümleyle anlat; ziyaretçiler seni daha iyi tanısın.') : undefined}
            action={isOwnProfile ? (
              <button type='button' onClick={onEdit} className='mt-1 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[12.5px] font-bold text-primary-foreground'>
                <PencilSimple weight='bold' size={12} />{txa('Biyografi yaz')}
              </button>
            ) : undefined}
          />
        )}
      </Panel>

      <Panel title={txa('Künye')} icon={IdentificationCard} tone='sky'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {user.joinDate && <Fact icon={CalendarBlank} label={txa('Katılım')} value={user.joinDate} sub={membershipLabel(user.joinedAt)} />}
          {level && <Fact icon={Trophy} label={txa('Seviye')} value={`${level.levelNumber} · ${txa(level.title)}`} sub={`${(level.totalXp ?? 0).toLocaleString(intlLocale())} XP`} />}
          {canViewProfileStats && (
            <>
              <Fact icon={BookOpenText} label={txa('Okunan bölüm')} value={(user.stats.totalChaptersRead ?? user.stats.reading).toLocaleString(intlLocale())} sub={txa('{v1} seri takipte', { v1: user.following.length })} />
              <Fact icon={ChatCircle} label={txa('Yorum')} value={(user.stats.comments ?? 0).toLocaleString(intlLocale())} />
              {user.stats.timeSpentMinutes ? <Fact icon={Clock} label={txa('Okuma süresi')} value={formatTimeSpent(user.stats.timeSpentMinutes)} /> : null}
              <Fact icon={UsersThree} label={txa('Topluluk')} value={txa('{v1} takipçi', { v1: user.stats.followers.toLocaleString(intlLocale()) })} sub={txa('{v1} kişiyi takip ediyor', { v1: (user.stats.following ?? 0).toLocaleString(intlLocale()) })} />
            </>
          )}
        </div>
      </Panel>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Panel title={txa('Favori türler')} icon={Sparkle} tone='violet'>
          {genres.length ? (
            <div className='flex flex-wrap gap-2'>
              {genres.map((genre, index) => (
                <span key={genre.name} className={index < 3 ? 'rounded-full bg-primary/15 px-3 py-1.5 text-[12.5px] font-bold text-primary' : 'rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground'}>
                  {genre.name}{genre.percent > 0 && <span className='ml-1.5 opacity-60'>{txa('%{v1}', { v1: genre.percent })}</span>}
                </span>
              ))}
            </div>
          ) : <PanelEmpty icon={Sparkle} title={txa('Tür verisi henüz oluşmadı')} />}
        </Panel>

        <Panel title={txa('Bağlantılar')} icon={LinkSimple} tone='emerald'>
          {hasLinks
            ? <ProfileSocialLinks user={user} size='lg' />
            : <PanelEmpty icon={LinkSimple} title={txa('Bağlantı eklenmemiş')} hint={isOwnProfile ? txa('Discord, Instagram ya da X hesabını profil düzenlemeden ekleyebilirsin.') : undefined} />}
        </Panel>
      </div>

      {showTeams && user.followingFansubs.length > 0 && (
        <Panel title={txa('Takip ettiği ekipler')} icon={UsersThree} tone='violet' meta={`${user.followingFansubs.length} ekip`}>
          <div className='flex flex-wrap gap-2'>
            {user.followingFansubs.map((team) => (
              <Link key={team.id} to={buildPublicFansubPath({ id: team.id, slug: team.slug })} className='flex items-center gap-2 rounded-full border border-border/70 bg-background/40 py-1 pl-1 pr-3.5 text-[12.5px] font-bold text-inherit hover:border-primary/40 hover:text-primary'>
                <img src={profileCover(team.avatar, team.name, 64)} alt='' className='size-7 rounded-full object-cover' />
                {team.name}
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
