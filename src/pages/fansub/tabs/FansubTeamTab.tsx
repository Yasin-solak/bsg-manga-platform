import { Link } from '@/i18n/router'
import { Crown, ShieldCheck, UsersThree } from '@phosphor-icons/react'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { Panel, PanelEmpty } from '../../profile/ProfileTabKit'
import type { FansubMember } from '../types'
import { LEAD_ROLE_PATTERN, roleLabel } from './fansubTabUtils'
import { txa } from '@/i18n/activeLocale'

/*
  Ekip sekmesi (v2): yonetim (kurucu / yonetici) buyuk kartlarda, digerleri sade izgarada.
  Ustte rol dagilimi. Her kart uyenin profiline gider.
*/

const avatarOf = (member: FansubMember) => member.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.username}`

export function FansubTeamTab({ members }: { members: FansubMember[] }) {
  const leads = members.filter((member) => LEAD_ROLE_PATTERN.test(member.role ?? ''))
  const crew = members.filter((member) => !LEAD_ROLE_PATTERN.test(member.role ?? ''))
  const roles = Object.entries(members.reduce<Record<string, number>>((acc, member) => {
    const role = roleLabel(member.role)
    acc[role] = (acc[role] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  return (
    <Panel title={txa('Ekip')} icon={UsersThree} tone='violet' meta={members.length ? txa('{v1} kişi', { v1: members.length }) : undefined} testId='fansub-team-tab'>
      {members.length ? (
        <div className='flex flex-col gap-5'>
          {roles.length > 1 && (
            <div className='flex flex-wrap gap-1.5'>
              {roles.map(([role, count]) => (
                <span key={role} className='rounded-full border border-border/70 px-3 py-1 text-[12px] font-bold capitalize text-muted-foreground'>
                  {role} <span className='opacity-60'>{count}</span>
                </span>
              ))}
            </div>
          )}

          {leads.length ? (
            <div className='grid gap-3 sm:grid-cols-2'>
              {leads.map((member) => (
                <Link
                  key={member.id}
                  to={`/profil/${encodeURIComponent(member.username)}`}
                  className='group relative isolate flex items-center gap-4 overflow-hidden rounded-2xl border border-violet-400/30 bg-violet-400/[0.07] p-4 hover:border-violet-400/50'
                  data-testid='fansub-team-lead'
                >
                  <Crown aria-hidden weight='fill' size={90} className='absolute -right-4 -top-5 -z-10 rotate-12 text-violet-400/10' />
                  <img src={avatarOf(member)} alt='' loading='lazy' className='size-16 flex-none rounded-2xl object-cover ring-2 ring-violet-400/40 transition-transform group-hover:scale-105' />
                  <span className='min-w-0'>
                    <span className='flex flex-wrap items-center gap-1.5'>
                      <span className='truncate text-[15px] font-extrabold group-hover:text-primary'>{member.username}</span>
                      <FansubIdentityTagChip tag={member.activeFansubIdentityTag} size='xs' />
                    </span>
                    <span className='mt-1 flex items-center gap-1 text-[12.5px] font-bold capitalize text-violet-300'>
                      <ShieldCheck weight='fill' size={13} />
                      {roleLabel(member.role)}
                    </span>
                    {member.teamTag && <span className='mt-1.5 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-bold text-primary'>{member.teamTag}</span>}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {crew.length ? (
            <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4'>
              {crew.map((member) => (
                <Link
                  key={member.id}
                  to={`/profil/${encodeURIComponent(member.username)}`}
                  className='group flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-background/40 px-3 pb-3.5 pt-4 text-center hover:border-border'
                  data-testid='fansub-team-member'
                >
                  <img src={avatarOf(member)} alt='' loading='lazy' className='size-14 rounded-full object-cover transition-transform group-hover:scale-105' />
                  <span className='w-full truncate text-[13px] font-bold group-hover:text-primary'>{member.username}</span>
                  <span className='-mt-1 w-full truncate text-[11.5px] capitalize text-muted-foreground'>{roleLabel(member.role)}</span>
                  <FansubIdentityTagChip tag={member.activeFansubIdentityTag} size='xs' />
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <PanelEmpty icon={UsersThree} title={txa('Ekip listelenmiyor')} hint={txa('Fansub kadrosu henüz herkese açık değil.')} />
      )}
    </Panel>
  )
}
