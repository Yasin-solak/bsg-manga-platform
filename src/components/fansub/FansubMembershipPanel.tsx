import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  cancelFansubInvite,
  getMyFansubRole,
  isFansubMembershipWorkflowAvailable,
  leaveFansub,
  listFansubInvitesForManagement,
  listFansubJoinRequestsForManagement,
  listFansubMembersForManagement,
  reviewFansubJoinRequest,
  sendFansubInviteByUsername,
  setFansubMemberTeamTag,
  type FansubInvite,
  type FansubJoinRequest,
  type FansubMemberForManagement,
  type FansubMemberRole,
} from '@/services/fansubMembershipService'
import { confirmDialog } from '@/services/confirmService'
import { removeFansubMember, updateMemberRole } from '@/services/fansubService/management'
import { toast } from '@/services/toastService'
import { EnvelopeSimple, PaperPlaneTilt, ShieldCheck, UsersThree } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/pages/profile/ProfileTabKit'
import { getFansubTeamStudioOverview, type TeamMemberStudioSummary } from '@/services/fansubTeamActivityService'
import { getMyFansubPermissions } from '@/services/fansubRolesService'
import FansubMemberDetailSheet from './FansubMemberDetailSheet'
import { StudioStatStrip } from '@/pages/fansubYonet/StudioStatStrip'
import {
  MembershipInvitePanel,
  MembershipInvitesPanel,
  MembershipJoinRequestsPanel,
  MembershipMembersPanel,
  MembershipRoleLegend,
} from './FansubMembershipPanelSections'
import {
  buildMemberDraftKey,
  DEFAULT_INVITE_DRAFT,
  getRoleLabel,
  getTeamTagLabel,
  normalizeSearchValue,
  toErrorMessage,
  type InviteDraft,
  type MemberRoleFilter,
} from './FansubMembershipPanel.shared'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubMembershipPanelProps = {
  fansubId?: string
  currentUserId: string | null
  isSiteAdmin?: boolean
  onDataChanged?: () => void
}

export function FansubMembershipPanel({
  fansubId,
  currentUserId,
  isSiteAdmin = false,
  onDataChanged,
}: FansubMembershipPanelProps) {
  const [membershipWorkflowAvailable, setMembershipWorkflowAvailable] = useState(true)
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null)
  const [myFansubRole, setMyFansubRole] = useState<FansubMemberRole | null>(null)
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(DEFAULT_INVITE_DRAFT)
  const [managedMembers, setManagedMembers] = useState<FansubMemberForManagement[]>([])
  const [managedInvites, setManagedInvites] = useState<FansubInvite[]>([])
  const [managedJoinRequests, setManagedJoinRequests] = useState<FansubJoinRequest[]>([])
  const [memberTagDrafts, setMemberTagDrafts] = useState<Record<string, string>>({})
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, FansubMemberRole>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [memberSearch, setMemberSearch] = useState('')
  const [memberRoleFilter, setMemberRoleFilter] = useState<MemberRoleFilter>('all')
  const [studioSummaries, setStudioSummaries] = useState<TeamMemberStudioSummary[]>([])
  const [detailMember, setDetailMember] = useState<FansubMemberForManagement | null>(null)
  const [studioReloadKey, setStudioReloadKey] = useState(0)
  const [canAssignTasks, setCanAssignTasks] = useState(false)

  const canManageFansub = isSiteAdmin || myFansubRole === 'admin' || myFansubRole === 'moderator'
  const canEditMemberGovernance = isSiteAdmin || myFansubRole === 'admin'
  const canLeaveFansub = myFansubRole === 'moderator' || myFansubRole === 'member'

  const getMemberTagDraft = useCallback((member: FansubMemberForManagement) => {
    const key = buildMemberDraftKey(member)
    return memberTagDrafts[key] ?? member.teamTag ?? ''
  }, [memberTagDrafts])

  const getMemberRoleDraft = useCallback((member: FansubMemberForManagement) => {
    const key = buildMemberDraftKey(member)
    return memberRoleDrafts[key] ?? member.role
  }, [memberRoleDrafts])

  const updateMemberTagDraft = useCallback((member: FansubMemberForManagement, value: string) => {
    const key = buildMemberDraftKey(member)
    setMemberTagDrafts((previous) => ({
      ...previous,
      [key]: value,
    }))
  }, [])

  const updateMemberRoleDraft = useCallback((member: FansubMemberForManagement, value: FansubMemberRole) => {
    const key = buildMemberDraftKey(member)
    setMemberRoleDrafts((previous) => ({
      ...previous,
      [key]: value,
    }))
  }, [])

  const hasMemberDraftChanges = useCallback((member: FansubMemberForManagement) => {
    const currentTag = member.teamTag ?? ''
    const nextTag = getMemberTagDraft(member).trim()
    const tagChanged = nextTag !== currentTag
    const roleChanged = member.role !== 'admin' && canEditMemberGovernance && getMemberRoleDraft(member) !== member.role
    return tagChanged || roleChanged
  }, [canEditMemberGovernance, getMemberRoleDraft, getMemberTagDraft])

  const filteredMembers = useMemo(() => {
    const query = normalizeSearchValue(memberSearch)
    return managedMembers.filter((member) => {
      if (memberRoleFilter !== 'all' && member.role !== memberRoleFilter) return false
      if (!query) return true

      const haystack = [
        member.user?.username ?? '',
        getRoleLabel(member.role),
        getTeamTagLabel(member.teamTag),
      ]
        .join(' ')
        .toLocaleLowerCase(intlLocale())

      return haystack.includes(query)
    })
  }, [managedMembers, memberRoleFilter, memberSearch])

  const managementRoleLabel = useMemo(() => {
    if (isSiteAdmin && myFansubRole) return txa('Site yöneticisi · {v1}', { v1: getRoleLabel(myFansubRole) })
    if (isSiteAdmin) return txa('Site yöneticisi')
    return getRoleLabel(myFansubRole)
  }, [isSiteAdmin, myFansubRole])

  const reloadMembershipHub = useCallback(async () => {
    if (!fansubId || !currentUserId) {
      setMembershipWorkflowAvailable(true)
      setMyFansubRole(null)
      setManagedMembers([])
      setManagedInvites([])
      setManagedJoinRequests([])
      return
    }

    setMembershipLoading(true)
    try {
      const workflowEnabled = await isFansubMembershipWorkflowAvailable()
      setMembershipWorkflowAvailable(workflowEnabled)

      if (!workflowEnabled) {
        setMyFansubRole(null)
        setManagedMembers([])
        setManagedInvites([])
        setManagedJoinRequests([])
        return
      }

      const role = await getMyFansubRole(fansubId, currentUserId)
      setMyFansubRole(role)

      if (isSiteAdmin || role === 'admin' || role === 'moderator') {
        const [membersForManagement, invitesForManagement, joinRequestsForManagement] = await Promise.all([
          listFansubMembersForManagement(fansubId),
          listFansubInvitesForManagement(fansubId, 'pending'),
          listFansubJoinRequestsForManagement(fansubId, 'pending'),
        ])

        setManagedMembers(membersForManagement)
        setManagedInvites(invitesForManagement)
        setManagedJoinRequests(joinRequestsForManagement)
        setMemberTagDrafts(() => {
          const draftMap: Record<string, string> = {}
          membersForManagement.forEach((member) => {
            draftMap[buildMemberDraftKey(member)] = member.teamTag ?? ''
          })
          return draftMap
        })
        setMemberRoleDrafts(() => {
          const draftMap: Record<string, FansubMemberRole> = {}
          membersForManagement.forEach((member) => {
            draftMap[buildMemberDraftKey(member)] = member.role
          })
          return draftMap
        })
      } else {
        setManagedMembers([])
        setManagedInvites([])
        setManagedJoinRequests([])
      }
    } catch (error) {
      console.error('[FansubMembershipPanel] reloadMembershipHub error', error)
      toast.error(toErrorMessage(error, txa('Ekip bilgileri yüklenemedi.')))
    } finally {
      setMembershipLoading(false)
    }
  }, [currentUserId, fansubId, isSiteAdmin])

  useEffect(() => {
    void reloadMembershipHub()
  }, [reloadMembershipHub])

  // Translation studio summary: refreshes with the member list; an error does not break the panel.
  useEffect(() => {
    if (!fansubId || !managedMembers.length) return
    let active = true
    getFansubTeamStudioOverview(fansubId)
      .then((rows) => { if (active) setStudioSummaries(rows) })
      .catch(() => { if (active) setStudioSummaries([]) })
    return () => { active = false }
  }, [fansubId, managedMembers, studioReloadKey])

  // Gorev atama (uye ayrinti paneli): studyoda proje yonetimi izni. DB de dogrular.
  useEffect(() => {
    if (!fansubId) return
    if (isSiteAdmin) { setCanAssignTasks(true); return }
    let active = true
    getMyFansubPermissions(fansubId)
      .then((permissions) => { if (active) setCanAssignTasks(permissions.has('ceviri.proje')) })
      .catch(() => { if (active) setCanAssignTasks(false) })
    return () => { active = false }
  }, [fansubId, isSiteAdmin])

  const studioByUser = useMemo(() => new Map(studioSummaries.map((row) => [row.userId, row])), [studioSummaries])

  async function handleSubmitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!fansubId) return

    setBusyActionKey('invite-send')
    try {
      await sendFansubInviteByUsername(fansubId, inviteDraft.username, 'member', inviteDraft.note)
      toast.success(txa('Davet gönderildi.'))
      setInviteDraft(DEFAULT_INVITE_DRAFT)
      await reloadMembershipHub()
    } catch (error) {
      console.error('[FansubMembershipPanel] sendFansubInviteByUsername error', error)
      toast.error(toErrorMessage(error, txa('Davet gönderilemedi.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleCancelPendingInvite(inviteId: string) {
    setBusyActionKey(`invite-cancel-${inviteId}`)
    try {
      await cancelFansubInvite(inviteId)
      toast.info(txa('Davet iptal edildi.'))
      await reloadMembershipHub()
    } catch (error) {
      console.error('[FansubMembershipPanel] cancelFansubInvite error', error)
      toast.error(toErrorMessage(error, txa('Davet iptal edilemedi.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleReviewJoinRequest(requestId: string, action: 'approve' | 'reject') {
    const reviewNote = reviewNotes[requestId] || ''
    setBusyActionKey(`join-review-${requestId}-${action}`)
    try {
      await reviewFansubJoinRequest(requestId, action, reviewNote)
      toast.success(action === 'approve' ? txa('Başvuru onaylandı.') : txa('Başvuru reddedildi.'))
      setReviewNotes((previous) => {
        const next = { ...previous }
        delete next[requestId]
        return next
      })
      await reloadMembershipHub()
      onDataChanged?.()
    } catch (error) {
      console.error('[FansubMembershipPanel] reviewFansubJoinRequest error', error)
      toast.error(toErrorMessage(error, txa('Başvuru işlenemedi.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleSaveMemberSettings(member: FansubMemberForManagement) {
    const actionKey = `member-save-${member.fansubId}-${member.userId}`
    const nextTag = getMemberTagDraft(member).trim()
    const currentTag = member.teamTag ?? ''
    const tagChanged = nextTag !== currentTag
    const nextRole = getMemberRoleDraft(member)
    const roleChanged = member.role !== 'admin' && canEditMemberGovernance && nextRole !== member.role

    if (!tagChanged && !roleChanged) return

    setBusyActionKey(actionKey)
    try {
      if (roleChanged) {
        await updateMemberRole(member.fansubId, member.userId, nextRole)
      }
      if (tagChanged) {
        await setFansubMemberTeamTag(member.fansubId, member.userId, nextTag || null)
      }
      toast.success(txa('Üye güncellendi.'))
      await reloadMembershipHub()
      onDataChanged?.()
    } catch (error) {
      console.error('[FansubMembershipPanel] handleSaveMemberSettings error', error)
      toast.error(toErrorMessage(error, txa('Üye güncellenemedi.')))
      await reloadMembershipHub()
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleRemoveMember(member: FansubMemberForManagement) {
    if (!canEditMemberGovernance) {
      toast.warning(txa('Üye çıkarma yalnız adminlere açık.'))
      return
    }
    if (member.role === 'admin') {
      toast.warning(txa('Admin üyeliği buradan kaldırılamaz; devir akışını kullan.'))
      return
    }
    if (member.userId === currentUserId) {
      toast.warning(txa('Kendi üyeliğin için Ekipten ayrıl seçeneğini kullan.'))
      return
    }

    const confirmed = await confirmDialog({
      title: txa('Ekipten çıkar'),
      message: txa('@{v1} ekipten çıkarılsın mı?', { v1: member.user?.username || txa('kullanıcı') }),
      confirmText: txa('Çıkar'),
      cancelText: txa('Vazgeç'),
      variant: 'danger',
    })

    if (!confirmed) return

    const actionKey = `member-remove-${member.fansubId}-${member.userId}`
    setBusyActionKey(actionKey)
    try {
      await removeFansubMember(member.fansubId, member.userId)
      toast.info(txa('Üye ekipten çıkarıldı.'))
      await reloadMembershipHub()
      onDataChanged?.()
    } catch (error) {
      console.error('[FansubMembershipPanel] removeFansubMember error', error)
      toast.error(toErrorMessage(error, txa('Üye çıkarılamadı.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  async function handleLeaveMembership() {
    if (!fansubId || !canLeaveFansub) return

    const confirmed = await confirmDialog({
      title: txa('Ekipten ayrıl'),
      message: txa('Bu fansubdaki üyeliğin sona erecek. Devam edilsin mi?'),
      confirmText: txa('Ayrıl'),
      cancelText: txa('Vazgeç'),
      variant: 'warning',
    })

    if (!confirmed) return

    setBusyActionKey('leave-membership')
    try {
      await leaveFansub(fansubId)
      toast.info(txa('Ekipten ayrıldın.'))
      await reloadMembershipHub()
      onDataChanged?.()
    } catch (error) {
      console.error('[FansubMembershipPanel] leaveFansub error', error)
      toast.error(toErrorMessage(error, txa('Ekipten ayrılınamadı.')))
    } finally {
      setBusyActionKey(null)
    }
  }

  const adminCount = managedMembers.filter((member) => member.role === 'admin').length
  const moderatorCount = managedMembers.filter((member) => member.role === 'moderator').length

  if (!currentUserId || !membershipWorkflowAvailable || !canManageFansub) {
    return (
      <Panel title={txa('Ekip üyeleri')} icon={UsersThree} tone="sky">
        <p className="text-[13px] text-muted-foreground">
          {!currentUserId
            ? txa('Bu alan için giriş yapmalısın.')
            : !membershipWorkflowAvailable
              ? txa('Üyelik davet ve başvuru modülü şu an kapalı.')
              : txa('Bu sekme yalnız admin ve moderatörlere açık.')}
        </p>
        {canLeaveFansub ? (
          <Button type="button" variant="outline" size="sm" className="mt-3 rounded-full" disabled={busyActionKey === 'leave-membership'} onClick={() => void handleLeaveMembership()}>
            {txa('Ekipten ayrıl')}
          </Button>
        ) : null}
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="studio-membership">
      <StudioStatStrip
        items={[
          { key: 'members', icon: UsersThree, tone: 'sky', label: txa('Ekip'), value: managedMembers.length.toLocaleString(intlLocale()), sub: txa('{v1} admin · {v2} moderatör', { v1: adminCount, v2: moderatorCount }) },
          { key: 'requests', icon: EnvelopeSimple, tone: 'amber', label: txa('Bekleyen başvuru'), value: managedJoinRequests.length.toLocaleString(intlLocale()), sub: managedJoinRequests.length ? txa('yanıt bekliyor') : txa('hepsi yanıtlandı') },
          { key: 'invites', icon: PaperPlaneTilt, tone: 'violet', label: txa('Bekleyen davet'), value: managedInvites.length.toLocaleString(intlLocale()), sub: txa('gönderdiğin davetler') },
          {
            key: 'me',
            icon: ShieldCheck,
            tone: 'primary',
            label: txa('Senin rolün'),
            value: managementRoleLabel,
            sub: membershipLoading
              ? txa('Güncelleniyor…')
              : canLeaveFansub
                ? <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => void handleLeaveMembership()} disabled={busyActionKey === 'leave-membership'}>{txa('Ekipten ayrıl')}</button>
                : txa('yönetim yetkisi'),
          },
        ]}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <MembershipMembersPanel
            members={filteredMembers}
            totalCount={managedMembers.length}
            memberSearch={memberSearch}
            memberRoleFilter={memberRoleFilter}
            currentUserId={currentUserId}
            busyActionKey={busyActionKey}
            canEditMemberGovernance={canEditMemberGovernance}
            onMemberSearchChange={setMemberSearch}
            onMemberRoleFilterChange={setMemberRoleFilter}
            getMemberRoleDraft={getMemberRoleDraft}
            getMemberTagDraft={getMemberTagDraft}
            updateMemberRoleDraft={updateMemberRoleDraft}
            updateMemberTagDraft={updateMemberTagDraft}
            hasMemberDraftChanges={hasMemberDraftChanges}
            onSaveMemberSettings={(member) => void handleSaveMemberSettings(member)}
            onRemoveMember={(member) => void handleRemoveMember(member)}
            studioByUser={studioByUser}
            onOpenMember={setDetailMember}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <MembershipJoinRequestsPanel
            managedJoinRequests={managedJoinRequests}
            reviewNotes={reviewNotes}
            busyActionKey={busyActionKey}
            onReviewNoteChange={(requestId, value) => setReviewNotes((previous) => ({ ...previous, [requestId]: value }))}
            onReviewJoinRequest={(requestId, action) => void handleReviewJoinRequest(requestId, action)}
          />
          <MembershipInvitePanel
            inviteDraft={inviteDraft}
            busyActionKey={busyActionKey}
            onInviteDraftChange={setInviteDraft}
            onSubmit={handleSubmitInvite}
          />
          <MembershipInvitesPanel
            managedInvites={managedInvites}
            busyActionKey={busyActionKey}
            onCancelPendingInvite={(inviteId) => void handleCancelPendingInvite(inviteId)}
          />
          <MembershipRoleLegend />
        </div>
      </div>

      {fansubId ? (
        <FansubMemberDetailSheet
          fansubId={fansubId}
          studioHref={`/fansub/${encodeURIComponent(fansubId)}/studyo`}
          member={detailMember}
          summary={detailMember ? studioByUser.get(detailMember.userId) ?? null : null}
          canAssign={canAssignTasks}
          onAssigned={() => setStudioReloadKey((key) => key + 1)}
          onOpenChange={(open) => { if (!open) setDetailMember(null) }}
        />
      ) : null}
    </div>
  )
}
