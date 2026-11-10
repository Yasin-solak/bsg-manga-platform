/**
 * Team members v2 sections: compact member rows, invite /
 * application / pending invite panels in the right column. The row's save button shows only when
 * there are changes.
 */
import type { FormEvent } from 'react'
import {
  Check,
  EnvelopeSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
  ShieldCheck,
  Trash,
  UserPlus,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import type {
  FansubInvite,
  FansubJoinRequest,
  FansubMemberForManagement,
  FansubMemberRole,
} from '@/services/fansubMembershipService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Panel } from '@/pages/profile/ProfileTabKit'
import { formatRelative } from '@/pages/fansubYonet/FansubYonetOverviewPanels'
import type { TeamMemberStudioSummary } from '@/services/fansubTeamActivityService'
import {
  MEMBER_ROLE_FILTER_OPTIONS,
  MEMBER_TEAM_TAG_OPTIONS,
  getAvatarFallback,
  getRoleLabel,
  type InviteDraft,
  type MemberRoleFilter,
} from './FansubMembershipPanel.shared'
import { txa } from '@/i18n/activeLocale'

const ROLE_CHIP: Record<FansubMemberRole, string> = {
  admin: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  moderator: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  member: 'bg-muted text-muted-foreground',
}

/** Ceviri studyosu yetkilerinin kisa adlari (uye satirinda rozet). */
const STUDIO_CHIPS: Array<{ key: string, label: string }> = [
  { key: 'ceviri.proje', get label() { return txa('Proje') } },
  { key: 'ceviri.metin', get label() { return txa('Çeviri') } },
  { key: 'ceviri.temizlik', get label() { return txa('Temizlik') } },
  { key: 'ceviri.dizgi', get label() { return txa('Dizgi') } },
  { key: 'ceviri.yayinla', get label() { return txa('Yayın') } },
]

const selectClass = 'h-8 rounded-lg border border-input bg-background px-2 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60'

function Avatar({ url, name, size = 'md' }: { url?: string, name?: string, size?: 'sm' | 'md' }) {
  return (
    <span className={cn('flex-none overflow-hidden rounded-full bg-muted', size === 'sm' ? 'size-7' : 'size-9')}>
      {url
        ? <img src={url} alt="" className="size-full object-cover" />
        : <span className="flex size-full items-center justify-center text-[12px] font-bold text-muted-foreground">{getAvatarFallback(name)}</span>}
    </span>
  )
}

export function MembershipMembersPanel({
  members,
  totalCount,
  memberSearch,
  memberRoleFilter,
  currentUserId,
  busyActionKey,
  canEditMemberGovernance,
  onMemberSearchChange,
  onMemberRoleFilterChange,
  getMemberRoleDraft,
  getMemberTagDraft,
  updateMemberRoleDraft,
  updateMemberTagDraft,
  hasMemberDraftChanges,
  onSaveMemberSettings,
  onRemoveMember,
  studioByUser,
  onOpenMember,
}: {
  members: FansubMemberForManagement[]
  totalCount: number
  memberSearch: string
  memberRoleFilter: MemberRoleFilter
  currentUserId: string | null
  busyActionKey: string | null
  canEditMemberGovernance: boolean
  onMemberSearchChange: (value: string) => void
  onMemberRoleFilterChange: (value: MemberRoleFilter) => void
  getMemberRoleDraft: (member: FansubMemberForManagement) => FansubMemberRole
  getMemberTagDraft: (member: FansubMemberForManagement) => string
  updateMemberRoleDraft: (member: FansubMemberForManagement, value: FansubMemberRole) => void
  updateMemberTagDraft: (member: FansubMemberForManagement, value: string) => void
  hasMemberDraftChanges: (member: FansubMemberForManagement) => boolean
  onSaveMemberSettings: (member: FansubMemberForManagement) => void
  onRemoveMember: (member: FansubMemberForManagement) => void
  /** Translation studio summary (role, permission, open tasks). */
  studioByUser?: Map<string, TeamMemberStudioSummary>
  onOpenMember?: (member: FansubMemberForManagement) => void
}) {
  return (
    <Panel title={txa('Ekip')} icon={UsersThree} tone="sky" meta={txa('{v1} kişi', { v1: totalCount })} testId="studio-members">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex rounded-full border border-border/70 bg-background/40 p-0.5" role="tablist" aria-label={txa('Rol filtresi')}>
          {MEMBER_ROLE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={memberRoleFilter === option.value}
              onClick={() => onMemberRoleFilterChange(option.value)}
              className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', memberRoleFilter === option.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              {option.value === 'all' ? txa('Tümü') : option.label}
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-56">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={memberSearch} onChange={(event) => onMemberSearchChange(event.target.value)} placeholder={txa('Kullanıcı ya da etiket ara')} className="h-8 rounded-full pl-8 text-[12.5px]" />
        </label>
      </div>

      {members.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">{txa('Eşleşen üye yok.')}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {members.map((member) => {
            const saveKey = `member-save-${member.fansubId}-${member.userId}`
            const removeKey = `member-remove-${member.fansubId}-${member.userId}`
            const isSelf = member.userId === currentUserId
            const roleEditable = canEditMemberGovernance && member.role !== 'admin' && !isSelf
            const dirty = hasMemberDraftChanges(member)
            const busy = busyActionKey === saveKey || busyActionKey === removeKey
            const name = member.user?.username || txa('kullanıcı')
            return (
              <li key={`${member.fansubId}:${member.userId}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <button
                  type="button"
                  onClick={() => onOpenMember?.(member)}
                  disabled={!onOpenMember}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left enabled:hover:opacity-90"
                  aria-label={txa('@{v1} ayrıntıları', { v1: name })}
                >
                  <Avatar url={member.user?.avatarUrl} name={name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">@{name}{isSelf ? <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">{txa('(sen)')}</span> : null}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      {(() => {
                        const studio = studioByUser?.get(member.userId)
                        const chips = STUDIO_CHIPS.filter((chip) => studio?.studioPermissions.includes(chip.key))
                        return (
                          <>
                            {chips.length
                              ? chips.map((chip) => <span key={chip.key} className="rounded-md bg-primary/10 px-1.5 py-px font-semibold text-primary">{chip.label}</span>)
                              : <span>{member.role === 'admin' ? txa('Tüm stüdyo yetkileri') : txa('Stüdyo yetkisi yok')}</span>}
                            {studio?.openTasks ? <span className={cn('rounded-md px-1.5 py-px font-semibold', studio.overdueTasks ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300')}>{txa('{v1} açık görev', { v1: studio.openTasks })}</span> : null}
                            <span>· {studio?.lastActiveAt ? txa('aktif {when}', { when: formatRelative(studio.lastActiveAt) }) : txa('katıldı {when}', { when: formatRelative(member.createdAt) })}</span>
                          </>
                        )
                      })()}
                    </span>
                  </span>
                </button>
                {roleEditable ? (
                  <select
                    className={selectClass}
                    aria-label={txa('{v1} rolü', { v1: name })}
                    value={getMemberRoleDraft(member)}
                    disabled={busy}
                    onChange={(event) => updateMemberRoleDraft(member, event.target.value as FansubMemberRole)}
                  >
                    <option value="member">{txa('Üye')}</option>
                    <option value="moderator">{txa('Moderatör')}</option>
                  </select>
                ) : (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', ROLE_CHIP[member.role])}>{getRoleLabel(member.role)}</span>
                )}
                <select
                  className={cn(selectClass, 'w-36')}
                  aria-label={txa('{v1} ekip etiketi', { v1: name })}
                  value={getMemberTagDraft(member)}
                  disabled={busy}
                  onChange={(event) => updateMemberTagDraft(member, event.target.value)}
                >
                  {MEMBER_TEAM_TAG_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span className="flex w-[72px] flex-none justify-end gap-1">
                  {dirty ? (
                    <Button type="button" size="icon-sm" className="rounded-full" disabled={busy} onClick={() => onSaveMemberSettings(member)} aria-label={txa('{v1} değişikliklerini kaydet', { v1: name })} title={txa('Kaydet')}>
                      <Check size={14} weight="bold" />
                    </Button>
                  ) : null}
                  {canEditMemberGovernance && member.role !== 'admin' && !isSelf ? (
                    <Button type="button" size="icon-sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => onRemoveMember(member)} aria-label={txa('{v1} ekipten çıkar', { v1: name })} title={txa('Ekipten çıkar')}>
                      <Trash size={14} />
                    </Button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function MembershipInvitePanel({
  inviteDraft,
  busyActionKey,
  onInviteDraftChange,
  onSubmit,
}: {
  inviteDraft: InviteDraft
  busyActionKey: string | null
  onInviteDraftChange: (draft: InviteDraft) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const busy = busyActionKey === 'invite-send'
  return (
    <Panel title={txa('Davet et')} icon={UserPlus} tone="primary" meta={txa('Davet edilen kişi üye olarak katılır')}>
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <Input value={inviteDraft.username} onChange={(event) => onInviteDraftChange({ ...inviteDraft, username: event.target.value })} placeholder={txa('Kullanıcı adı')} aria-label={txa('Kullanıcı adı')} className="h-9" disabled={busy} />
        <Input value={inviteDraft.note} onChange={(event) => onInviteDraftChange({ ...inviteDraft, note: event.target.value })} placeholder={txa('Kısa not (isteğe bağlı)')} aria-label={txa('Davet notu')} className="h-9" disabled={busy} />
        <Button type="submit" className="rounded-full" disabled={busy || !inviteDraft.username.trim()}>
          <PaperPlaneTilt size={14} />{busy ? txa('Gönderiliyor…') : txa('Davet gönder')}
        </Button>
      </form>
    </Panel>
  )
}

export function MembershipJoinRequestsPanel({
  managedJoinRequests,
  reviewNotes,
  busyActionKey,
  onReviewNoteChange,
  onReviewJoinRequest,
}: {
  managedJoinRequests: FansubJoinRequest[]
  reviewNotes: Record<string, string>
  busyActionKey: string | null
  onReviewNoteChange: (requestId: string, value: string) => void
  onReviewJoinRequest: (requestId: string, action: 'approve' | 'reject') => void
}) {
  return (
    <Panel title={txa('Başvurular')} icon={EnvelopeSimple} tone="amber" meta={managedJoinRequests.length ? `${managedJoinRequests.length} bekliyor` : txa('Bekleyen başvuru yok')} testId="studio-join-requests">
      {managedJoinRequests.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{txa('Profilindeki “Ekibe katıl” düğmesinden gelen başvurular burada onaylanır.')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {managedJoinRequests.map((request) => {
            const name = request.requester?.username || txa('kullanıcı')
            const busy = busyActionKey?.startsWith(`join-review-${request.id}-`) ?? false
            return (
              <li key={request.id} className="rounded-xl border border-border/60 bg-background/40 p-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar url={request.requester?.avatarUrl} name={name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">@{name}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatRelative(request.createdAt)}</span>
                  </span>
                  <Button type="button" size="icon-sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => onReviewJoinRequest(request.id, 'reject')} aria-label={txa('{v1} başvurusunu reddet', { v1: name })} title={txa('Reddet')}>
                    <X size={14} weight="bold" />
                  </Button>
                  <Button type="button" size="icon-sm" className="rounded-full" disabled={busy} onClick={() => onReviewJoinRequest(request.id, 'approve')} aria-label={txa('{v1} başvurusunu onayla', { v1: name })} title={txa('Onayla')}>
                    <Check size={14} weight="bold" />
                  </Button>
                </div>
                {request.message ? <p className="mt-1.5 line-clamp-3 text-[12px] text-muted-foreground">“{request.message}”</p> : null}
                <Input
                  value={reviewNotes[request.id] || ''}
                  onChange={(event) => onReviewNoteChange(request.id, event.target.value)}
                  placeholder={txa('Başvurana not (isteğe bağlı)')}
                  aria-label={txa('{v1} için not', { v1: name })}
                  className="mt-2 h-8 text-[12px]"
                  disabled={busy}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function MembershipInvitesPanel({
  managedInvites,
  busyActionKey,
  onCancelPendingInvite,
}: {
  managedInvites: FansubInvite[]
  busyActionKey: string | null
  onCancelPendingInvite: (inviteId: string) => void
}) {
  if (managedInvites.length === 0) return null
  return (
    <Panel title={txa('Bekleyen davetler')} icon={PaperPlaneTilt} tone="violet" meta={txa('{v1} davet yanıt bekliyor', { v1: managedInvites.length })}>
      <ul className="divide-y divide-border/50">
        {managedInvites.map((invite) => {
          const name = invite.invitedUser?.username || txa('kullanıcı')
          return (
            <li key={invite.id} className="flex items-center gap-2.5 py-2">
              <Avatar url={invite.invitedUser?.avatarUrl} name={name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold">@{name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{invite.note || txa('Not yok')} · {formatRelative(invite.createdAt)}</span>
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 rounded-full text-[12px]" disabled={busyActionKey === `invite-cancel-${invite.id}`} onClick={() => onCancelPendingInvite(invite.id)}>
                {txa('İptal et')}
              </Button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function MembershipRoleLegend() {
  return (
    <Panel title={txa('Roller')} icon={ShieldCheck} tone="neutral">
      <dl className="flex flex-col gap-2 text-[12px]">
        {([
          ['admin', txa('Her şey: içerik, ekip, ayarlar ve devir.')],
          ['moderator', txa('İçerik ve topluluk; davet ve başvuru inceleme.')],
          ['member', txa('İçerik üretimine katkı; yönetim kapalı.')],
        ] as const).map(([role, hint]) => (
          <div key={role} className="flex items-start gap-2">
            <dt className={cn('w-[78px] flex-none rounded-full px-2 py-0.5 text-center text-[11px] font-bold', ROLE_CHIP[role])}>{getRoleLabel(role)}</dt>
            <dd className="text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] text-muted-foreground">{txa('Ayrıntılı izinler için Roller ve izinler sekmesine bak.')}</p>
    </Panel>
  )
}
