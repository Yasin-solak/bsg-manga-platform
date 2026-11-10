import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, CheckCircle, Circle, CircleHalf, Copy, NotePencil, UserCircle, WarningCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  assignTasks, getProjectContributions, isTaskOverdue, listAssignableMembers, listProjectTasks, nextTaskStatus, setTaskStatus,
  TL_TASK_STAGES, TL_TASK_STATUS_LABEL, updateTasks,
  type TlAssignableMember, type TlContributionRow, type TlPageTask, type TlTaskStage, type TlTaskStatus,
} from '@/services/translationTaskService'
import type { TlPage, TlProject } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { ProgressBar } from '../studioUi'
import type { StudioAccess } from '../studioAccess'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Tasks: chapter pages x stages (cleaning, translation, typesetting, review).
 * The project manager selects pages and assigns a member to a stage; the assignee changes
 * the status. When cleaning + translation finish the typesetter is notified, when typesetting finishes the
 * reviewer, from the DB.
 */

const STATUS_ICON: Record<TlTaskStatus, typeof Circle> = { bekliyor: Circle, devam: CircleHalf, tamam: CheckCircle }
const STATUS_COLOR: Record<TlTaskStatus, string> = { bekliyor: 'var(--tl-mut)', devam: 'var(--tl-amber)', tamam: 'var(--tl-green)' }

/** datetime-local (yerel saat) -> ISO. */
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)
const dueLabel = (iso: string) => new Date(iso).toLocaleString(intlLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function TasksScreen({ project, pages, access, currentUserId, onOpenPage, onToast }: {
  project: TlProject
  pages: TlPage[]
  access: StudioAccess
  currentUserId: string | null
  onOpenPage: (index: number) => void
  onToast: (message: string) => void
}) {
  const readyPages = useMemo(() => pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height), [pages])
  const [tasks, setTasks] = useState<TlPageTask[]>([])
  const [members, setMembers] = useState<TlAssignableMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [stage, setStage] = useState<TlTaskStage>('temizlik')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [dueInput, setDueInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [contributions, setContributions] = useState<{ rows: TlContributionRow[], credits: string }>({ rows: [], credits: '' })

  const reload = useCallback(async () => {
    try {
      setTasks(await listProjectTasks(project.id))
      getProjectContributions(project.id).then(setContributions).catch(() => {})
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Görevler yüklenemedi.')))
    } finally {
      setLoading(false)
    }
  }, [onToast, project.id])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    if (!access.project) return
    listAssignableMembers(project.fansubId).then(setMembers).catch(() => setMembers([]))
  }, [access.project, project.fansubId])

  const byCell = useMemo(() => new Map(tasks.map((task) => [`${task.pageId}:${task.stage}`, task])), [tasks])
  const nameOf = useCallback((userId: string | null) => members.find((member) => member.userId === userId)?.username ?? (userId === currentUserId ? txa('Sen') : txa('Ekip üyesi')), [currentUserId, members])
  const stageMembers = members.filter((member) => member.stages.includes(stage))

  const progress = TL_TASK_STAGES.map((entry) => {
    const stageTasks = tasks.filter((task) => task.stage === entry.key)
    return { ...entry, total: stageTasks.length, done: stageTasks.filter((task) => task.status === 'tamam').length }
  })

  const assign = async (assigneeId: string | null) => {
    if (!selected.size) { onToast(txa('Önce sayfa seç')); return }
    if (assigneeId === '') { onToast(txa('Önce üye seç')); return }
    setBusy(true)
    try {
      await assignTasks({ projectId: project.id, pageIds: [...selected], stage, assigneeId, dueAt: fromLocalInput(dueInput), note: noteInput.trim() || undefined })
      onToast(assigneeId ? txa('{v1} sayfa atandı', { v1: selected.size }) : txa('Atama kaldırıldı'))
      setSelected(new Set())
      await reload()
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Görev atanamadı.')))
    } finally {
      setBusy(false)
    }
  }

  /** Writes a due date / note to selected pages' tasks at this stage. */
  const updateSelected = async () => {
    const ids = tasks.filter((task) => task.stage === stage && selected.has(task.pageId)).map((task) => task.id)
    if (!ids.length) { onToast(txa('Seçili sayfalarda bu aşamanın görevi yok')); return }
    setBusy(true)
    try {
      await updateTasks(project.id, ids, { dueAt: fromLocalInput(dueInput), note: noteInput })
      onToast(txa('{v1} görev güncellendi', { v1: ids.length }))
      await reload()
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Görev güncellenemedi.')))
    } finally {
      setBusy(false)
    }
  }

  const copyCredits = async () => {
    try {
      await navigator.clipboard.writeText(contributions.credits)
      onToast(txa('Kredi metni kopyalandı'))
    } catch {
      onToast(txa('Kopyalanamadı; metni elle seçebilirsin'))
    }
  }

  const cycle = async (task: TlPageTask) => {
    const next = nextTaskStatus(task.status)
    setTasks((current) => current.map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)))
    try {
      await setTaskStatus(task.id, next)
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Durum güncellenemedi.')))
      await reload()
    }
  }

  const allSelected = readyPages.length > 0 && selected.size === readyPages.length

  return (
    <div className='flex min-h-0 flex-1 flex-col' data-testid='tl-tasks'>
      <div className='flex flex-none flex-wrap items-center gap-4 border-b border-[var(--tl-line)] bg-[var(--tl-sb)] px-5 py-3'>
        {progress.map((entry) => (
          <div key={entry.key} className='flex min-w-[140px] flex-1 flex-col gap-1'>
            <span className='flex justify-between text-xs font-bold text-[var(--tl-fg2)]'>{entry.label}<span className='text-[var(--tl-mut)]'>{entry.done} / {entry.total}</span></span>
            <ProgressBar value={entry.total ? entry.done / entry.total : 0} color='var(--tl-green)' />
          </div>
        ))}
      </div>

      {access.project && (
        <div className='flex flex-none flex-wrap items-center gap-2 border-b border-[var(--tl-line)] px-5 py-2.5' data-testid='tl-task-assign-bar'>
          <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('{v1} sayfa seçili', { v1: selected.size })}</span>
          <select value={stage} onChange={(event) => { setStage(event.target.value as TlTaskStage); setAssignee('') }} className='h-8 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-2 text-xs font-bold text-[var(--tl-fg)]' aria-label={txa('Aşama')}>
            {TL_TASK_STAGES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
          <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className='h-8 min-w-[160px] rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-2 text-xs font-bold text-[var(--tl-fg)]' aria-label={txa('Üye')} data-testid='tl-task-assignee'>
            <option value=''>{txa('Üye seç…')}</option>
            {stageMembers.map((member) => <option key={member.userId} value={member.userId}>{member.username}</option>)}
          </select>
          <button type='button' disabled={busy || !selected.size || !assignee} onClick={() => { void assign(assignee) }} className='h-8 rounded-lg border-0 bg-[var(--tl-p)] px-3.5 text-xs font-extrabold text-[var(--tl-pfg)] disabled:opacity-45' data-testid='tl-task-assign'>
            {txa('Ata')}
          </button>
          <button type='button' disabled={busy || !selected.size} onClick={() => { void assign(null) }} className='h-8 rounded-lg border border-[var(--tl-line)] bg-transparent px-3 text-xs font-bold text-[var(--tl-mut)] disabled:opacity-45'>
            {txa('Atamayı kaldır')}
          </button>
          <span className='mx-1 h-5 w-px bg-[var(--tl-line)]' />
          <label className='flex items-center gap-1.5 text-xs font-bold text-[var(--tl-mut)]'>
            {txa('Teslim')}
            <input type='datetime-local' value={dueInput} onChange={(event) => setDueInput(event.target.value)} className='h-8 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-2 text-xs text-[var(--tl-fg)]' data-testid='tl-task-due' />
          </label>
          <input value={noteInput} maxLength={300} onChange={(event) => setNoteInput(event.target.value)} placeholder={txa('Not (isteğe bağlı)')} className='h-8 w-40 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-2 text-xs text-[var(--tl-fg)]' />
          <button type='button' disabled={busy || !selected.size} onClick={() => { void updateSelected() }} className='h-8 rounded-lg border border-[var(--tl-line)] bg-transparent px-3 text-xs font-bold text-[var(--tl-fg2)] disabled:opacity-45' title={txa('Seçili sayfaların bu aşamadaki görevlerine tarih ve not yazar')} data-testid='tl-task-update'>
            {txa('Tarih / not güncelle')}
          </button>
          {stageMembers.length === 0 && <span className='text-xs text-[var(--tl-amber)]'>{txa('Bu aşama için izni olan üye yok (Roller ve İzinler).')}</span>}
        </div>
      )}

      <div className='min-h-0 flex-1 overflow-auto px-5 py-4'>
        {loading ? <p className='text-sm text-[var(--tl-mut)]'>{txa('Görevler yükleniyor…')}</p> : (
          <table className='w-full min-w-[720px] border-separate border-spacing-y-1 text-left'>
            <thead>
              <tr className='text-xs font-bold text-[var(--tl-mut)]'>
                {access.project && (
                  <th className='w-10 px-2'>
                    <input type='checkbox' checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(readyPages.map((page) => page.id)))} aria-label={txa('Tüm sayfaları seç')} />
                  </th>
                )}
                <th className='w-24 px-2'>{txa('Sayfa')}</th>
                {TL_TASK_STAGES.map((entry) => <th key={entry.key} className='px-2'>{entry.label}</th>)}
                <th className='w-10' />
              </tr>
            </thead>
            <tbody>
              {readyPages.map((page, index) => (
                <tr key={page.id} className='bg-[var(--tl-card)] text-[13px]' data-testid='tl-task-row'>
                  {access.project && (
                    <td className='rounded-l-lg px-2 py-2'>
                      <input type='checkbox' checked={selected.has(page.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (!next.delete(page.id)) next.add(page.id); return next })} aria-label={txa('Sayfa {v1}', { v1: index + 1 })} />
                    </td>
                  )}
                  <td className={cn('px-2 py-2 font-bold', !access.project && 'rounded-l-lg')}>{txa('Sayfa {v1}', { v1: index + 1 })}</td>
                  {TL_TASK_STAGES.map((entry) => {
                    const task = byCell.get(`${page.id}:${entry.key}`)
                    if (!task) return <td key={entry.key} className='px-2 py-2 text-[var(--tl-dim)]'>—</td>
                    const Icon = STATUS_ICON[task.status]
                    const mine = task.assigneeId === currentUserId
                    const canChange = mine || access.project
                    const overdue = isTaskOverdue(task)
                    return (
                      <td key={entry.key} className='px-2 py-2'>
                        <button
                          type='button'
                          disabled={!canChange}
                          onClick={() => { void cycle(task) }}
                          className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-left disabled:cursor-default', mine ? 'border-[var(--tl-p35)]' : 'border-transparent')}
                          title={canChange ? `${TL_TASK_STATUS_LABEL[task.status]} · ${txa('tıkla: {v1}', { v1: TL_TASK_STATUS_LABEL[nextTaskStatus(task.status)] })}` : TL_TASK_STATUS_LABEL[task.status]}
                          data-testid='tl-task-cell'
                          data-status={task.status}
                        >
                          <Icon weight={task.status === 'tamam' ? 'fill' : 'bold'} size={14} style={{ color: STATUS_COLOR[task.status] }} />
                          <UserCircle weight='bold' size={13} className='text-[var(--tl-mut)]' />
                          <span className={cn('truncate', mine && 'font-bold text-[var(--tl-p)]')}>{mine ? txa('Sen') : nameOf(task.assigneeId)}</span>
                          {task.note && <NotePencil weight='bold' size={12} className='flex-none text-[var(--tl-mut)]' aria-label={task.note} />}
                        </button>
                        {task.dueAt && (
                          <span className={cn('mt-0.5 flex items-center gap-1 pl-2 text-[11px] font-semibold', overdue ? 'text-[var(--tl-red)]' : 'text-[var(--tl-mut)]')} data-testid={overdue ? 'tl-task-overdue' : undefined}>
                            {overdue && <WarningCircle weight='bold' size={11} />}
                            {overdue ? txa('Gecikti · ') : ''}{dueLabel(task.dueAt)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className='rounded-r-lg px-2 py-2'>
                    <button type='button' onClick={() => onOpenPage(index)} className='flex h-7 w-7 items-center justify-center rounded-md text-[var(--tl-mut)] hover:text-[var(--tl-fg)]' title={txa('Editörde aç')}>
                      <ArrowSquareOut weight='bold' size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {contributions.rows.length > 0 && (
          <section className='mt-6 flex flex-col gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4' data-testid='tl-contributions'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Katkılar')}</span>
            <div className='flex flex-wrap gap-2'>
              {contributions.rows.map((row) => (
                <span key={`${row.userId}:${row.stage}`} className='rounded-lg border border-[var(--tl-line)] px-2.5 py-1 text-xs text-[var(--tl-fg2)]'>
                  <strong className='text-[var(--tl-fg)]'>{row.username}</strong> · {TL_TASK_STAGES.find((entry) => entry.key === row.stage)?.label} {row.done}/{row.total}
                </span>
              ))}
            </div>
            {contributions.credits && (
              <div className='flex items-center gap-2'>
                <code className='min-w-0 flex-1 truncate rounded-lg bg-[var(--tl-bg)] px-3 py-2 text-xs text-[var(--tl-fg)]' data-testid='tl-credits'>{contributions.credits}</code>
                <button type='button' onClick={() => { void copyCredits() }} className='flex h-8 items-center gap-1.5 rounded-lg border border-[var(--tl-line)] bg-transparent px-3 text-xs font-bold text-[var(--tl-fg2)]' title={txa('Bölüm sonu kredisi için kopyala')}>
                  <Copy weight='bold' size={13} />{txa('Kredi metnini kopyala')}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
