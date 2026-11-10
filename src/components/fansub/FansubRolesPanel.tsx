import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/services/confirmService'
import { listFansubMembersForManagement, type FansubMemberForManagement } from '@/services/fansubMembershipService'
import {
  deleteFansubRole, FANSUB_PERMISSION_GROUPS, FANSUB_ROLE_TEMPLATES, listFansubRoles, saveFansubRole, setFansubMemberRoles, togglePermission,
  type FansubPermission, type FansubRole, type FansubRolesSnapshot,
} from '@/services/fansubRolesService'
import { toast } from '@/services/toastService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

/*
 * Roles and permissions (the fansub equivalent of the role editor in community servers).
 * A fansub admin can do everything; a member with "Manage roles" edits only roles and
 * members below their own rank and grants only permissions they have.
 * The same rules apply in the DB (manage_fansub_roles); the UI only locks.
 * Dependent permissions: enabling a sub-permission also enables the base (panel.erisim, ceviri.gor),
 * disabling the base also disables those depending on it.
 */

const COLORS = ['#5b8def', '#34c38f', '#f1b44c', '#f46a6a', '#a66cff', '#50a5f1', '#ec4899', '#94a3b8']

interface Draft { id?: string, name: string, color: string | null, permissions: FansubPermission[], isDefault: boolean }

const toDraft = (role: FansubRole): Draft => ({ id: role.id, name: role.name, color: role.color, permissions: role.permissions, isDefault: role.isDefault })

export function FansubRolesPanel({ fansubId, onChanged }: { fansubId: string, onChanged?: () => void }) {
  const [snapshot, setSnapshot] = useState<FansubRolesSnapshot | null>(null)
  const [members, setMembers] = useState<FansubMemberForManagement[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyMember, setBusyMember] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editorTab, setEditorTab] = useState<'izinler' | 'uyeler'>('izinler')

  const load = useCallback(async (keepSelection = true) => {
    try {
      const [next, memberRows] = await Promise.all([listFansubRoles(fansubId), listFansubMembersForManagement(fansubId)])
      setSnapshot(next)
      setMembers(memberRows)
      setLoadError(null)
      setSelectedId((current) => {
        const keep = keepSelection && current && next.roles.some((role) => role.id === current) ? current : next.roles[0]?.id ?? null
        const role = next.roles.find((entry) => entry.id === keep)
        setDraft(role ? toDraft(role) : null)
        return keep
      })
    } catch (error) {
      setLoadError(toUserFacingErrorMessage(error, txa('Roller yüklenemedi.')))
    }
  }, [fansubId])

  useEffect(() => { void load(false) }, [load])

  const roles = snapshot?.roles ?? []
  const assignableRoles = roles.filter((role) => !role.isDefault)
  const selected = roles.find((role) => role.id === selectedId) ?? null
  const isOwner = snapshot?.isOwner ?? false
  // Yeni rol her zaman duzenlenebilir; mevcut rol DB'nin "manageable" bayragina uyar.
  const editable = Boolean(draft && (!draft.id || selected?.manageable))
  const canGrant = (key: FansubPermission) => isOwner || Boolean(snapshot?.myPermissions.has(key))
  /** Uyenin sirasi: atanmis rollerinin en kucuk sirasi (admin -1, rolsuz 1001). */
  const memberRank = (member: FansubMemberForManagement) => {
    if (member.role === 'admin') return -1
    const ids = snapshot?.assignments.get(member.userId) ?? []
    return Math.min(1001, ...roles.filter((role) => ids.includes(role.id)).map((role) => role.position))
  }
  const canEditMember = (member: FansubMemberForManagement) => isOwner
    || (member.userId !== snapshot?.myUserId && memberRank(member) > (snapshot?.myRank ?? -1))
  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return true
    if (!selected) return false
    return draft.name !== selected.name || draft.color !== selected.color
      || [...draft.permissions].sort().join() !== [...selected.permissions].sort().join()
  }, [draft, selected])

  const pick = (role: FansubRole) => {
    setEditorTab('izinler')
    setSelectedId(role.id)
    setDraft(toDraft(role))
  }

  const startNew = (template?: (typeof FANSUB_ROLE_TEMPLATES)[number]) => {
    setSelectedId(null)
    // Of template permissions, only those you can grant go into the draft.
    const permissions = (template?.permissions ?? []).filter((key) => isOwner || snapshot?.myPermissions.has(key))
    setDraft({ name: template?.name ?? txa('Yeni rol'), color: template?.color ?? COLORS[roles.length % COLORS.length], permissions, isDefault: false })
    setTemplatesOpen(false)
  }

  /** Swaps the order of two neighboring roles (only among editable roles). */
  const move = async (role: FansubRole, direction: -1 | 1) => {
    const ordered = roles.filter((entry) => !entry.isDefault)
    const index = ordered.findIndex((entry) => entry.id === role.id)
    const other = ordered[index + direction]
    if (!other || !role.manageable || !other.manageable) return
    const [a, b] = other.position === role.position ? [role.position + direction, role.position] : [other.position, role.position]
    try {
      await saveFansubRole(fansubId, { id: role.id, name: role.name, color: role.color, position: a, permissions: role.permissions })
      await saveFansubRole(fansubId, { id: other.id, name: other.name, color: other.color, position: b, permissions: other.permissions })
      await load()
      onChanged?.()
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, txa('Sıra değiştirilemedi.')))
    }
  }

  const save = async () => {
    if (!draft || !draft.name.trim()) return
    setSaving(true)
    try {
      await saveFansubRole(fansubId, { id: draft.id, name: draft.name.trim(), color: draft.color, permissions: draft.permissions })
      toast.success(txa('"{v1}" kaydedildi', { v1: draft.name.trim() }))
      await load(Boolean(draft.id))
      if (!draft.id) {
        // New role: found by name in the list and selected.
        const refreshed = await listFansubRoles(fansubId)
        const created = refreshed.roles.find((role) => role.name === draft.name.trim())
        if (created) { setSelectedId(created.id); setDraft(toDraft(created)) }
      }
      onChanged?.()
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, txa('Rol kaydedilemedi.')))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected || selected.isDefault) return
    const ok = await confirmDialog({
      title: txa('"{v1}" silinsin mi?', { v1: selected.name }),
      message: selected.memberCount > 0 ? txa('{v1} üye bu rolü ve izinlerini kaybedecek.', { v1: selected.memberCount }) : txa('Bu rol hiçbir üyede yok.'),
      confirmText: txa('Rolü sil'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteFansubRole(fansubId, selected.id)
      toast.success(txa('Rol silindi'))
      await load(false)
      onChanged?.()
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, txa('Rol silinemedi.')))
    }
  }

  const toggleMemberRole = async (userId: string, roleId: string, on: boolean) => {
    const current = snapshot?.assignments.get(userId) ?? []
    const next = on ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId)
    setBusyMember(userId)
    try {
      await setFansubMemberRoles(fansubId, userId, next)
      await load()
      onChanged?.()
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, txa('Üye rolü güncellenemedi.')))
    } finally {
      setBusyMember(null)
    }
  }

  if (loadError) return <p className='rounded-[20px] border border-border/70 bg-card/60 p-4 text-sm text-destructive'>{loadError}</p>
  if (!snapshot) return <p className='rounded-[20px] border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground'>{txa('Roller yükleniyor…')}</p>
  if (!snapshot.canManage) return <p className='rounded-[20px] border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground'>{txa('Rolleri yalnız fansub admini ya da "Rolleri yönet" izni olan üye yönetebilir.')}</p>

  const draftMembers = draft?.id ? members.filter((member) => member.role !== 'admin' && (snapshot.assignments.get(member.userId) ?? []).includes(draft.id!)) : []
  const addableMembers = draft?.id ? members.filter((member) => member.role !== 'admin' && canEditMember(member) && !(snapshot.assignments.get(member.userId) ?? []).includes(draft.id!)) : []
  const card = 'rounded-[20px] border border-border/70 bg-card/60'

  return (
    <div className='flex flex-col gap-4' data-testid='fansub-roles-panel'>
      <div className='flex flex-wrap items-center gap-3'>
        <p className='flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-muted-foreground'>
          <ShieldCheck className='h-4 w-4 flex-none text-primary' />
          {txa('Rollere izin ver, üyelere rol ata. Bir üyenin birden çok rolü olabilir; izinler birleşir. Fansub admini her izne sahiptir.')}
        </p>
        <div className='relative flex gap-2'>
          <Button size='sm' variant='outline' className='rounded-full' onClick={() => setTemplatesOpen((open) => !open)} aria-expanded={templatesOpen} data-testid='fansub-role-templates'>
            <Sparkles className='h-4 w-4' />{txa('Şablondan')}
          </Button>
          <Button size='sm' className='rounded-full' onClick={() => startNew()}><Plus className='h-4 w-4' />{txa('Yeni rol')}</Button>
          {templatesOpen && (
            <div className='absolute right-0 top-10 z-20 flex w-72 flex-col gap-1 rounded-xl border border-border bg-background p-2 shadow-lg' role='menu'>
              {FANSUB_ROLE_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type='button'
                  role='menuitem'
                  onClick={() => startNew(template)}
                  className='flex items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted/60'
                  data-testid='fansub-role-template'
                >
                  <span className='mt-1 h-2.5 w-2.5 flex-none rounded-full' style={{ background: template.color }} />
                  <span className='min-w-0'>
                    <span className='block text-sm font-medium text-foreground'>{template.name}</span>
                    <span className='block text-xs text-muted-foreground'>{template.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]'>
        <article className={cn('flex flex-col gap-0.5 p-2 lg:sticky lg:top-4', card)}>
          <p className='px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>{txa('Roller · üstteki yetkili')}</p>
          {roles.map((role) => (
            <div key={role.id} className='group flex items-center'>
              <button
                type='button'
                onClick={() => pick(role)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  role.id === selectedId ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                data-testid='fansub-role-item'
              >
                <span className='h-3 w-3 flex-none rounded-full' style={{ background: role.color ?? 'var(--muted-foreground)' }} />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-semibold'>{role.name}</span>
                  <span className='block text-[11px] text-muted-foreground'>
                    {role.isDefault ? txa('Tüm üyeler') : txa('{v1} üye', { v1: role.memberCount })} · {role.permissions.length}{' '}{txa('izin')}
                  </span>
                </span>
                {!role.manageable && <Lock className='h-3 w-3 flex-none' aria-label={txa('Düzenleyemezsin')} />}
              </button>
              {!role.isDefault && role.manageable && (
                <span className='flex flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'>
                  <button type='button' onClick={() => { void move(role, -1) }} className='rounded p-0.5 text-muted-foreground hover:text-foreground' aria-label={txa('{v1} yukarı', { v1: role.name })}><ArrowUp className='h-3 w-3' /></button>
                  <button type='button' onClick={() => { void move(role, 1) }} className='rounded p-0.5 text-muted-foreground hover:text-foreground' aria-label={txa('{v1} aşağı', { v1: role.name })}><ArrowDown className='h-3 w-3' /></button>
                </span>
              )}
            </div>
          ))}
          {!draft?.id && draft && (
            <span className='flex items-center gap-2.5 rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-semibold text-foreground'>
              <span className='h-3 w-3 flex-none rounded-full' style={{ background: draft.color ?? 'var(--muted-foreground)' }} />
              {draft.name || txa('Yeni rol')}
            </span>
          )}
        </article>

        {draft && (
          <article className={cn('flex min-w-0 flex-col', card)} data-testid='fansub-role-editor'>
            <div className='flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3.5'>
              <span className='h-4 w-4 flex-none rounded-full' style={{ background: draft.color ?? 'var(--muted-foreground)' }} />
              <Input
                value={draft.name}
                maxLength={40}
                disabled={!editable}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className='h-9 min-w-[180px] flex-1 text-[15px] font-bold'
                aria-label={txa('Rol adı')}
                data-testid='fansub-role-name'
              />
              <div className='flex gap-1'>
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type='button'
                    disabled={!editable}
                    aria-label={`Renk ${color}`}
                    onClick={() => setDraft({ ...draft, color })}
                    className={cn('h-6 w-6 rounded-full border-2 disabled:opacity-50', draft.color === color ? 'border-foreground' : 'border-transparent')}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>

            <div className='flex items-center gap-1 border-b border-border/60 px-4' role='tablist' aria-label={txa('Rol düzenleyici')}>
              {([['izinler', txa('İzinler ({v1})', { v1: draft.permissions.length })], ['uyeler', draft.isDefault ? txa('Üyeler (herkes)') : txa('Üyeler ({v1})', { v1: draftMembers.length })]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type='button'
                  role='tab'
                  aria-selected={editorTab === key}
                  disabled={key === 'uyeler' && (!draft.id || draft.isDefault)}
                  onClick={() => setEditorTab(key)}
                  className={cn('-mb-px border-b-2 px-2.5 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50', editorTab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>

            {!editable && (
              <p className='mx-5 mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground'>
                <Lock className='h-3.5 w-3.5' />{txa('Bu rol senin rolün ya da senden üstte; yalnız görüntüleyebilirsin.')}
              </p>
            )}
            {draft.isDefault && (
              <p className='mx-5 mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground'>
                {txa('Bu varsayılan rol, fansubun')} <strong>{txa('tüm üyelerine')}</strong> {txa('otomatik uygulanır. Buraya verdiğin izinleri herkes alır.')}
              </p>
            )}

            {editorTab === 'izinler' || !draft.id || draft.isDefault ? (
              <fieldset disabled={!editable} className='grid gap-4 p-5 xl:grid-cols-2'>
                {FANSUB_PERMISSION_GROUPS.map((group) => {
                  const onCount = group.permissions.filter((entry) => draft.permissions.includes(entry.key)).length
                  return (
                    <section key={group.id} className='flex flex-col gap-2'>
                      <h3 className='flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        {group.label}<span className='tabular-nums normal-case tracking-normal'>{onCount}/{group.permissions.length}</span>
                      </h3>
                      <div className='divide-y divide-border/60 rounded-xl border border-border/60'>
                        {group.permissions.map((entry) => {
                          const on = draft.permissions.includes(entry.key)
                          const blocked = Boolean(entry.requires && !draft.permissions.includes(entry.requires))
                          return (
                            <label key={entry.key} className={cn('flex cursor-pointer items-start justify-between gap-3 px-3 py-2', on && 'bg-primary/[0.04]')}>
                              <span className='min-w-0'>
                                <span className={cn('block text-[13px] font-semibold', (blocked && !on) || !canGrant(entry.key) ? 'text-muted-foreground' : 'text-foreground')}>
                                  {entry.label}{!canGrant(entry.key) && <Lock className='ml-1.5 inline h-3 w-3' aria-label={txa('Sende olmayan izin')} />}
                                </span>
                                <span className='block text-[11.5px] leading-snug text-muted-foreground'>{entry.description}</span>
                              </span>
                              <Switch
                                checked={on}
                                disabled={!canGrant(entry.key)}
                                onCheckedChange={(value) => setDraft({ ...draft, permissions: togglePermission(draft.permissions, entry.key, value) })}
                                aria-label={entry.label}
                                data-testid={`fansub-perm-${entry.key}`}
                              />
                            </label>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </fieldset>
            ) : (
              <div className='flex flex-col gap-3 p-5'>
                {addableMembers.length > 0 && (
                  <label className='flex items-center gap-2 text-[12.5px]'>
                    <span className='text-muted-foreground'>{txa('Üye ekle')}</span>
                    <select
                      className='h-8 min-w-[180px] rounded-lg border border-input bg-background px-2 text-[12.5px]'
                      value=''
                      disabled={busyMember !== null}
                      onChange={(event) => { if (event.target.value && draft.id) void toggleMemberRole(event.target.value, draft.id, true) }}
                      aria-label={txa('Role üye ekle')}
                    >
                      <option value=''>{txa('Seç…')}</option>
                      {addableMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user?.username ?? member.userId.slice(0, 8)}</option>)}
                    </select>
                  </label>
                )}
                {draftMembers.length === 0 ? (
                  <p className='text-[12.5px] text-muted-foreground'>{txa('Bu rolde henüz üye yok.')}</p>
                ) : (
                  <ul className='divide-y divide-border/50 rounded-xl border border-border/60'>
                    {draftMembers.map((member) => (
                      <li key={member.userId} className='flex items-center gap-3 px-3 py-2'>
                        <span className='min-w-0 flex-1 truncate text-[13px] font-semibold'>{member.user?.username ?? member.userId.slice(0, 8)}</span>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-7 rounded-full text-[12px] text-muted-foreground'
                          disabled={busyMember === member.userId || !canEditMember(member) || !selected?.manageable}
                          onClick={() => { if (draft.id) void toggleMemberRole(member.userId, draft.id, false) }}
                        >
                          {txa('Rolden çıkar')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className='mt-auto flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3'>
              {selected && !selected.isDefault && editable ? (
                <Button variant='ghost' size='sm' className='text-destructive hover:text-destructive' onClick={() => { void remove() }}>
                  <Trash2 className='h-4 w-4' />{txa('Rolü sil')}
                </Button>
              ) : <span />}
              <div className='flex gap-2'>
                {dirty && draft.id && selected && <Button variant='outline' size='sm' className='rounded-full' onClick={() => setDraft(toDraft(selected))}>{txa('Vazgeç')}</Button>}
                <Button size='sm' className='rounded-full' disabled={!editable || !dirty || saving || !draft.name.trim()} onClick={() => { void save() }} data-testid='fansub-role-save'>
                  {saving ? txa('Kaydediliyor…') : txa('Kaydet')}
                </Button>
              </div>
            </div>
          </article>
        )}
      </div>

      <article className={cn('overflow-hidden', card)} data-testid='fansub-member-roles'>
        <div className='border-b border-border/60 px-5 py-3.5'>
          <h3 className='text-[15px] font-bold text-foreground'>{txa('Üye × rol')}</h3>
          <p className='text-xs text-muted-foreground'>{txa('Bir bakışta kimin hangi rolde olduğu; rozete tıklayarak aç / kapat.')}</p>
        </div>
        <div className='divide-y divide-border/50'>
          {members.map((member) => {
            const assigned = snapshot.assignments.get(member.userId) ?? []
            const isAdmin = member.role === 'admin'
            return (
              <div key={member.userId} className='flex flex-wrap items-center gap-3 px-5 py-2.5'>
                <span className='min-w-[140px] flex-1 truncate text-sm font-semibold text-foreground'>{member.user?.username ?? member.userId.slice(0, 8)}</span>
                {!isAdmin && !canEditMember(member) && <Lock className='h-3 w-3 text-muted-foreground' aria-label={txa('Bu üyenin rollerini değiştiremezsin')} />}
                {isAdmin ? (
                  <span className='rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'>{txa('Fansub admini · tüm izinler')}</span>
                ) : (
                  <div className='flex flex-wrap gap-1.5'>
                    {assignableRoles.map((role) => {
                      const on = assigned.includes(role.id)
                      return (
                        <button
                          key={role.id}
                          type='button'
                          disabled={busyMember === member.userId || !canEditMember(member) || !role.manageable}
                          onClick={() => { void toggleMemberRole(member.userId, role.id, !on) }}
                          aria-pressed={on}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                            on ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                          style={on ? { background: role.color ?? 'var(--primary)' } : undefined}
                          data-testid='fansub-member-role-chip'
                        >
                          {!on && <span className='h-2 w-2 rounded-full' style={{ background: role.color ?? 'var(--muted-foreground)' }} />}
                          {role.name}
                        </button>
                      )
                    })}
                    {assignableRoles.length === 0 && <span className='text-xs text-muted-foreground'>{txa('Önce bir rol oluştur.')}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </article>
    </div>
  )
}
