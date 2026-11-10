import { useCallback, type Dispatch, type SetStateAction } from 'react'

import {
  setAdminFansubActive,
  setAdminMangaActive,
  updateAdminFansubMemberRoleAndTag,
  type AdminFansubMemberHistoryRecord,
  type AdminManagedFansub,
  type AdminManagedManga,
} from '@/services/adminService'
import { createScopedLogger } from '@/services/logger'
import { toast } from '@/services/toastService'
import { errText, type MemberDraft } from './fansubManagementUtils'
import { txa } from '@/i18n/activeLocale'

type SetState<T> = Dispatch<SetStateAction<T>>

type UseFansubManagementActionsParams = {
  selectedFansubId: string
  memberDrafts: Record<string, MemberDraft>
  loadStats: () => Promise<void>
  loadMembers: () => Promise<void>
  setFansubBusyId: SetState<string | null>
  setFansubs: SetState<AdminManagedFansub[]>
  setMangaBusyId: SetState<string | null>
  setMangas: SetState<AdminManagedManga[]>
  setMemberBusyId: SetState<string | null>
  setMemberDrafts: SetState<Record<string, MemberDraft>>
}

const fansubManagementLogger = createScopedLogger('FansubManagementSection')

export function useFansubManagementActions({
  selectedFansubId,
  memberDrafts,
  loadStats,
  loadMembers,
  setFansubBusyId,
  setFansubs,
  setMangaBusyId,
  setMangas,
  setMemberBusyId,
  setMemberDrafts,
}: UseFansubManagementActionsParams) {
  const toggleFansubActive = useCallback(async (fansub: AdminManagedFansub) => {
    setFansubBusyId(fansub.id)
    try {
      const result = await setAdminFansubActive(fansub.id, !fansub.isActive)
      setFansubs((prev) => prev.map((item) => (item.id === fansub.id ? { ...item, isActive: !fansub.isActive } : item)))
      if (selectedFansubId === fansub.id) {
        await Promise.all([loadStats(), loadMembers()])
      }
      toast.info(
        !fansub.isActive
          ? txa('Fansub yeniden etkin.')
          : txa('Fansub pasife alındı; {v1} ekip üyeliği sonlandırıldı.', { v1: result.removed_member_count || 0 }),
      )
    } catch (error) {
      fansubManagementLogger.error('toggleFansubActive error', error)
      toast.error(errText(error, txa('Fansub durumu güncellenemedi.')))
    } finally {
      setFansubBusyId(null)
    }
  }, [loadMembers, loadStats, selectedFansubId, setFansubBusyId, setFansubs])

  const toggleMangaActive = useCallback(async (manga: AdminManagedManga) => {
    setMangaBusyId(manga.id)
    try {
      await setAdminMangaActive(manga.id, !manga.isActive)
      setMangas((prev) => prev.map((item) => (item.id === manga.id ? { ...item, isActive: !item.isActive } : item)))
      toast.info(manga.isActive ? txa('Seri yayından kaldırıldı.') : txa('Seri yeniden yayında.'))
    } catch (error) {
      fansubManagementLogger.error('toggleMangaActive error', error)
      toast.error(errText(error, txa('Seri durumu güncellenemedi.')))
    } finally {
      setMangaBusyId(null)
    }
  }, [setMangaBusyId, setMangas])

  const saveMember = useCallback(async (row: AdminFansubMemberHistoryRecord) => {
    if (!selectedFansubId || !row.userId || row.leftAt) return
    const draft = memberDrafts[row.id] || { role: row.role, teamTag: row.teamTag || '' }
    setMemberBusyId(row.id)
    try {
      await updateAdminFansubMemberRoleAndTag(selectedFansubId, row.userId, draft.role, draft.teamTag || null)
      toast.success(txa('Üyenin rolü ve etiketi güncellendi.'))
      await Promise.all([loadMembers(), loadStats()])
    } catch (error) {
      fansubManagementLogger.error('saveMember error', error)
      toast.error(errText(error, txa('Üye güncellenemedi.')))
    } finally {
      setMemberBusyId(null)
    }
  }, [loadMembers, loadStats, memberDrafts, selectedFansubId, setMemberBusyId])

  const updateMemberDraftRole = useCallback((rowId: string, role: MemberDraft['role'], fallbackRole: MemberDraft['role'], fallbackTag: string) => {
    setMemberDrafts((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || { role: fallbackRole, teamTag: fallbackTag }), role },
    }))
  }, [setMemberDrafts])

  const updateMemberDraftTag = useCallback((rowId: string, teamTag: string, fallbackRole: MemberDraft['role'], fallbackTag: string) => {
    setMemberDrafts((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || { role: fallbackRole, teamTag: fallbackTag }), teamTag },
    }))
  }, [setMemberDrafts])

  return {
    toggleFansubActive,
    toggleMangaActive,
    saveMember,
    updateMemberDraftRole,
    updateMemberDraftTag,
  }
}
