import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminFilterGroup, type AdminFilterOption } from '@/components/admin/shared/AdminFilterGroup'
import { Search, ChevronLeft, ChevronRight, Save, RotateCcw, Shield, UserCheck, UserCog, Users } from 'lucide-react'
import type {
  AdminFansubMemberHistoryRecord,
  AdminMemberStateFilter,
} from '@/services/adminService'
import { dateText, type MemberDraft } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubMembersTabProps {
  searchInput: string
  onSearchInputChange: (value: string) => void
  memberState: AdminMemberStateFilter
  onMemberStateChange: (state: AdminMemberStateFilter) => void
  total: number
  page: number
  pageTotal: number
  loading: boolean
  error: string | null
  members: AdminFansubMemberHistoryRecord[]
  memberDrafts: Record<string, MemberDraft>
  memberBusyId: string | null
  canEditMembers: boolean
  onDraftRoleChange: (rowId: string, role: MemberDraft['role'], fallbackRole: MemberDraft['role'], fallbackTag: string) => void
  onDraftTagChange: (rowId: string, tag: string, fallbackRole: MemberDraft['role'], fallbackTag: string) => void
  onSaveMember: (row: AdminFansubMemberHistoryRecord) => void
  onPrevPage: () => void
  onNextPage: () => void
}

const STATE_OPTIONS: AdminFilterOption<AdminMemberStateFilter>[] = [
  { value: 'all', get label() { return txa('Tüm kayıtlar') } },
  { value: 'active', get label() { return txa('Aktif üyeler') } },
  { value: 'left', get label() { return txa('Ayrilanlar') } },
]

// ── Members tab ──
// Member table with search, filter and inline editing
export function FansubMembersTab({
  searchInput,
  onSearchInputChange,
  memberState,
  onMemberStateChange,
  total,
  page,
  pageTotal,
  loading,
  error,
  members,
  memberDrafts,
  memberBusyId,
  canEditMembers,
  onDraftRoleChange,
  onDraftTagChange,
  onSaveMember,
  onPrevPage,
  onNextPage,
}: FansubMembersTabProps) {
  const activeVisible = members.filter((member) => !member.leftAt)
  const managerCount = activeVisible.filter((member) => member.role === 'admin').length
  const moderatorCount = activeVisible.filter((member) => member.role === 'moderator').length

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MemberSummaryCard icon={Users} label={txa('Toplam Üye')} value={total} helper={txa('Tüm kayıtlar')} />
        <MemberSummaryCard icon={UserCheck} label={txa('Aktif Üye')} value={activeVisible.length} helper={txa('Bu sayfadaki aktif üyeler')} />
        <MemberSummaryCard icon={Shield} label={txa('Moderatör')} value={moderatorCount} helper={txa('Aktif moderatör')} tone="warning" />
        <MemberSummaryCard icon={UserCog} label={txa('Yönetici')} value={managerCount} helper={txa('Tam yetkili')} />
      </div>
      {/* Filtreler */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={txa('Üye ara…')}
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {total}{' '}{txa('kayit')}
          </Badge>
        </div>
        <AdminFilterGroup
          label={txa('Durum')}
          value={memberState}
          options={STATE_OPTIONS}
          onChange={onMemberStateChange}
        />
      </div>

      {/* Tablo */}
      {loading ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{txa('Yükleniyor...')}</p>
      ) : error ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{error}</p>
      ) : members.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{txa('Üye kaydı bulunamadı.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Kullanıcı')}</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Durum')}</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Rol')}</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Takım etiketi')}</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Katılım')}</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('Ayrılma')}</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{txa('İşlem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((row) => {
                const draft = memberDrafts[row.id] || { role: row.role, teamTag: row.teamTag || '' }
                const canEdit = canEditMembers && !row.leftAt && !!row.userId
                const fallbackTag = row.teamTag || ''
                const hasDraftChanges = draft.role !== row.role || draft.teamTag !== fallbackTag

                return (
                  <tr key={row.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <img loading="lazy" decoding="async"
                          src={row.user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.user?.username || row.userId || 'user'}`}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                        />
                        <div className="min-w-0">
                          <strong className="block truncate text-xs font-semibold text-foreground">
                            {row.user?.username || row.userId || txa('Silinmiş kullanıcı')}
                          </strong>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={!row.leftAt ? 'default' : 'secondary'} className="text-[10px]">
                        {!row.leftAt ? txa('Aktif') : txa('Ayrildi')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <select
                          className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                          value={draft.role}
                          onChange={(e) => onDraftRoleChange(
                            row.id,
                            e.target.value as MemberDraft['role'],
                            row.role,
                            fallbackTag,
                          )}
                        >
                          <option value="admin">{txa('Yönetici')}</option>
                          <option value="moderator">{txa('Moderatör')}</option>
                          <option value="member">{txa('Uye')}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.role === 'admin' ? txa('Yonetici') : row.role === 'moderator' ? txa('Moderator') : txa('Uye')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <Input
                          className="h-7 text-xs"
                          value={draft.teamTag}
                          maxLength={40}
                          placeholder={txa('Etiket yok')}
                          onChange={(e) => onDraftTagChange(
                            row.id,
                            e.target.value,
                            row.role,
                            fallbackTag,
                          )}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{fallbackTag || '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dateText(row.joinedAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dateText(row.leftAt)}</td>
                    <td className="px-3 py-2.5">
                      {canEdit && (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={memberBusyId === row.id || !hasDraftChanges}
                            onClick={() => onSaveMember(row)}
                            title={txa('Kaydet')}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={memberBusyId === row.id || !hasDraftChanges}
                            onClick={() => {
                              onDraftRoleChange(row.id, row.role, row.role, fallbackTag)
                              onDraftTagChange(row.id, fallbackTag, row.role, fallbackTag)
                            }}
                            title={txa('Sifirla')}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sayfalama */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {txa('Sayfa {v1}/{v2}', { v1: page, v2: pageTotal })}
        </span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1 || loading} onClick={onPrevPage}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageTotal || loading} onClick={onNextPage}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function MemberSummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Users
  label: string
  value: number
  helper: string
  tone?: 'warning'
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={tone === 'warning'
          ? 'flex size-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary'}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <strong className="block text-xl tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</strong>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">{helper}</p>
    </article>
  )
}
