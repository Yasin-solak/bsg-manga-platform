/**
 * Team member detail panel (opens from the right): roles in this team, translation
 * studio permissions, page tasks, contributions, management actions and
 * membership history. Data is read from get_fansub_member_activity.
 */
import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowSquareOut, CheckCircle, Clock, ListPlus, LockSimple, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { FansubMemberForManagement } from '@/services/fansubMembershipService'
import { FANSUB_PERMISSION_GROUPS } from '@/services/fansubRolesService'
import {
  getFansubMemberActivity,
  type TeamMemberActivity,
  type TeamMemberStudioSummary,
} from '@/services/fansubTeamActivityService'
import { formatRelative } from '@/pages/fansubYonet/FansubYonetOverviewPanels'
import { getAvatarFallback, getRoleLabel, getTeamTagLabel } from './FansubMembershipPanel.shared'
import FansubMemberTaskAssignDialog from './FansubMemberTaskAssignDialog'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const STAGE_LABEL: Record<string, string> = {
  get temizlik() { return txa('Temizlik') },
  get ceviri() { return txa('Çeviri') },
  get dizgi() { return txa('Dizgi') },
  get kontrol() { return txa('Kontrol') },
}

const STUDIO_PERMISSIONS = FANSUB_PERMISSION_GROUPS.find((group) => group.id === 'ceviri')?.permissions ?? []

const LEFT_REASON: Record<string, string> = {
  get left() { return txa('Ayrıldı') },
  get removed() { return txa('Çıkarıldı') },
  get transferred() { return txa('Devretti') },
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <section className="border-t border-border/60 px-5 py-4">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export default function FansubMemberDetailSheet({
  fansubId,
  studioHref,
  member,
  summary,
  canAssign = false,
  onAssigned,
  onOpenChange,
}: {
  fansubId: string
  studioHref: string
  member: FansubMemberForManagement | null
  summary: TeamMemberStudioSummary | null
  /** ceviri.proje: can assign a page task to a member in the studio. */
  canAssign?: boolean
  onAssigned?: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [activity, setActivity] = useState<TeamMemberActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!member) return undefined
    let active = true
    setActivity(null)
    setError(null)
    getFansubMemberActivity(fansubId, member.userId)
      .then((data) => { if (active) setActivity(data) })
      .catch(() => { if (active) setError(txa('Katkı bilgileri yüklenemedi.')) })
    return () => { active = false }
  }, [fansubId, member, reloadKey])

  const name = member?.user?.username || txa('kullanıcı')
  // A fansub admin has all permissions (even without the summary).
  const permissions = new Set(member?.role === 'admin' ? STUDIO_PERMISSIONS.map((entry) => entry.key) : summary?.studioPermissions ?? [])
  const stages = ['temizlik', 'ceviri', 'dizgi', 'kontrol']

  return (
    <Sheet open={Boolean(member)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
        {member ? (
          <>
            <SheetHeader className="flex-row items-center gap-3 px-5 pb-4 pt-5 text-left">
              <span className="size-12 flex-none overflow-hidden rounded-full bg-muted">
                {member.user?.avatarUrl
                  ? <img src={member.user.avatarUrl} alt="" className="size-full object-cover" />
                  : <span className="flex size-full items-center justify-center text-[15px] font-bold text-muted-foreground">{getAvatarFallback(name)}</span>}
              </span>
              <span className="min-w-0">
                <SheetTitle className="truncate text-[17px]">@{name}</SheetTitle>
                <SheetDescription className="text-[12.5px]">
                  {getRoleLabel(member.role)}{member.teamTag ? ` · ${getTeamTagLabel(member.teamTag)}` : ''} · {txa('{v1} katıldı', { v1: formatRelative(member.createdAt) })}
                </SheetDescription>
              </span>
            </SheetHeader>

            {canAssign ? (
              <div className="px-5 pb-3">
                <Button size="sm" className="h-8 w-full gap-1.5 rounded-full" onClick={() => setAssignOpen(true)} data-testid="member-task-assign-open">
                  <ListPlus size={15} weight="bold" />{txa('Görev ata')}
                </Button>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 px-5 pb-4 text-center">
              {[
                [txa('Açık görev'), summary?.openTasks ?? 0, summary?.overdueTasks ? 'text-rose-500' : ''],
                [txa('30 günde biten'), summary?.doneTasks30d ?? 0, 'text-emerald-500'],
                [txa('Kayıtlı sayfa'), activity?.pageVersions ?? '—', ''],
              ].map(([label, value, tone]) => (
                <span key={label as string} className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <b className={cn('block text-[18px] font-black tabular-nums', tone as string)}>{value as number}</b>
                  <span className="text-[11px] text-muted-foreground">{label as string}</span>
                </span>
              ))}
            </div>

            <Section title={txa('Roller')}>
              {summary?.roles.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.roles.map((role) => (
                    <span key={role.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-0.5 text-[12px] font-semibold">
                      <span className="size-2 rounded-full" style={{ background: role.color ?? 'var(--muted-foreground)' }} />{role.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">{member.role === 'admin' ? txa('Fansub admini; tüm izinlere sahip.') : txa('Atanmış rol yok. Roller ve izinler sekmesinden rol verebilirsin.')}</p>
              )}
            </Section>

            <Section title={txa('Çeviri stüdyosunda yapabildikleri')}>
              <ul className="grid gap-1.5">
                {STUDIO_PERMISSIONS.map((entry) => {
                  const on = permissions.has(entry.key)
                  return (
                    <li key={entry.key} className="flex items-start gap-2 text-[12.5px]">
                      {on ? <CheckCircle size={15} weight="fill" className="mt-px flex-none text-emerald-500" /> : <LockSimple size={15} className="mt-px flex-none text-muted-foreground/60" />}
                      <span className={cn(!on && 'text-muted-foreground')}>
                        <b className="font-semibold">{entry.label}</b>
                        <span className="block text-[11.5px] text-muted-foreground">{entry.description}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Section>

            {error ? <p className="border-t border-border/60 px-5 py-4 text-[12.5px] text-destructive">{error}</p> : !activity ? (
              <p className="border-t border-border/60 px-5 py-6 text-center text-[12.5px] text-muted-foreground">{txa('Katkılar yükleniyor…')}</p>
            ) : (
              <>
                <Section title={txa('Sayfa görevleri')}>
                  <div className="mb-3 grid grid-cols-4 gap-1.5 text-center">
                    {stages.map((stage) => (
                      <span key={stage} className="rounded-lg border border-border/60 px-1 py-1.5">
                        <span className="block text-[11px] text-muted-foreground">{STAGE_LABEL[stage]}</span>
                        <b className="text-[13px] tabular-nums">{activity.taskTotals[stage]?.done ?? 0}</b>
                        {activity.taskTotals[stage]?.open ? <span className="text-[11px] text-amber-500"> +{activity.taskTotals[stage].open}</span> : null}
                      </span>
                    ))}
                  </div>
                  {activity.tasks.length ? (
                    <ul className="divide-y divide-border/50">
                      {activity.tasks.slice(0, 8).map((task) => {
                        const overdue = task.isOpen && task.dueAt && new Date(task.dueAt).getTime() < Date.now()
                        return (
                          <li key={task.id} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                            {task.isOpen
                              ? overdue ? <Warning size={14} weight="fill" className="flex-none text-rose-500" /> : <Clock size={14} weight="bold" className="flex-none text-amber-500" />
                              : <CheckCircle size={14} weight="fill" className="flex-none text-emerald-500" />}
                            <span className="min-w-0 flex-1 truncate">
                              <b className="font-semibold">{STAGE_LABEL[task.stage] || task.stage}</b> · {task.seriesTitle} #{task.chapterNumber ?? '—'}{task.pageNumber ? `, s.${task.pageNumber}` : ''}
                            </span>
                            <span className={cn('flex-none text-[11px]', overdue ? 'font-semibold text-rose-500' : 'text-muted-foreground')}>
                              {task.isOpen ? (task.dueAt ? `son ${formatRelative(task.dueAt)}` : txa('açık')) : formatRelative(task.completedAt || task.updatedAt)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">{txa('Bu üyeye henüz sayfa görevi atanmadı.{v1}', { v1: canAssign ? txa(' Yukarıdaki "Görev ata" ile stüdyodaki açık bir bölümden sayfa verebilirsin.') : '' })}</p>
                  )}
                  <Link to={studioHref} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
                    {txa("Çeviri Stüdyosu'nu aç")}<ArrowSquareOut size={12} />
                  </Link>
                </Section>

                <Section title={txa('Katkılar')}>
                  <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                    <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Açtığı bölüm projesi')}</dt><dd className="text-[15px] font-black tabular-nums">{activity.projectsCreated}</dd></div>
                    <div className="rounded-xl bg-muted/40 px-3 py-2"><dt className="text-muted-foreground">{txa('Sayfa kaydı (30 gün)')}</dt><dd className="text-[15px] font-black tabular-nums">{activity.pageVersions30d}</dd></div>
                  </dl>
                  {activity.recentActions.length ? (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {activity.recentActions.slice(0, 6).map((action) => (
                        <li key={action.id} className="flex items-start justify-between gap-3 text-[12.5px]">
                          <span className="min-w-0">{action.summary || action.action}</span>
                          <span className="flex-none text-[11px] text-muted-foreground">{formatRelative(action.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Section>

                {activity.history.length ? (
                  <Section title={txa('Üyelik geçmişi')}>
                    <ul className="flex flex-col gap-1.5 text-[12.5px]">
                      {activity.history.map((entry) => (
                        <li key={entry.joinedAt} className="flex justify-between gap-3">
                          <span>{getRoleLabel(entry.role as FansubMemberForManagement['role'])}{entry.teamTag ? ` · ${getTeamTagLabel(entry.teamTag)}` : ''}</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.joinedAt).toLocaleDateString(intlLocale())}
                            {entry.leftAt ? ` – ${new Date(entry.leftAt).toLocaleDateString(intlLocale())} (${LEFT_REASON[entry.leftReason || ''] || txa('ayrıldı')})` : txa(' – şimdi')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </SheetContent>
      {member && canAssign ? (
        <FansubMemberTaskAssignDialog
          fansubId={fansubId}
          member={{ userId: member.userId, username: name }}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onAssigned={() => { setReloadKey((key) => key + 1); onAssigned?.() }}
        />
      ) : null}
    </Sheet>
  )
}
