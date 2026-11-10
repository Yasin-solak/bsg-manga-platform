import { useEffect, useState } from 'react'
import { CheckCircle, Circle, CircleHalf } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  isTaskOverdue, listProjectTasks, nextTaskStatus, setTaskStatus, TL_TASK_STAGES, type TlPageTask, type TlTaskStatus,
} from '@/services/translationTaskService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Tasks of the open page in the editor header. In the stage assigned to you, one click
 * "Started" / 'Done'; when done the next stage's owner is notified.
 */

const ICON: Record<TlTaskStatus, typeof Circle> = { bekliyor: Circle, devam: CircleHalf, tamam: CheckCircle }
const ACTION: Record<TlTaskStatus, string> = { get bekliyor() { return txa('Başladım') }, get devam() { return txa('Bitti') }, get tamam() { return txa('Yeniden aç') } }

export function PageTaskBar({ projectId, pageId, currentUserId, onToast }: {
  projectId: string
  pageId: string | null
  currentUserId: string | null
  onToast: (message: string) => void
}) {
  const [tasks, setTasks] = useState<TlPageTask[]>([])

  useEffect(() => {
    if (!pageId) { setTasks([]); return undefined }
    const controller = new AbortController()
    listProjectTasks(projectId, controller.signal)
      .then((all) => { if (!controller.signal.aborted) setTasks(all.filter((task) => task.pageId === pageId)) })
      .catch(() => { if (!controller.signal.aborted) setTasks([]) })
    return () => controller.abort()
  }, [pageId, projectId])

  if (!tasks.length) return null

  const advance = async (task: TlPageTask) => {
    const next = nextTaskStatus(task.status)
    setTasks((current) => current.map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)))
    try {
      await setTaskStatus(task.id, next)
      if (next === 'tamam') onToast(txa('Görev tamamlandı; sıradaki kişiye haber verildi'))
    } catch (error) {
      setTasks((current) => current.map((entry) => (entry.id === task.id ? task : entry)))
      onToast(toUserFacingErrorMessage(error, txa('Görev güncellenemedi.')))
    }
  }

  return (
    <div className='hidden items-center gap-1.5 xl:flex' data-testid='tl-page-tasks'>
      {TL_TASK_STAGES.map((stage) => {
        const task = tasks.find((entry) => entry.stage === stage.key)
        if (!task) return null
        const Icon = ICON[task.status]
        const mine = task.assigneeId === currentUserId
        return (
          <span key={stage.key} className={cn('flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold', isTaskOverdue(task) ? 'border-[var(--tl-red)] text-[var(--tl-red)]' : mine ? 'border-[var(--tl-p35)] text-[var(--tl-fg)]' : 'border-[var(--tl-line)] text-[var(--tl-mut)]')} title={task.dueAt ? `Teslim: ${new Date(task.dueAt).toLocaleString(intlLocale())}` : undefined}>
            <Icon weight={task.status === 'tamam' ? 'fill' : 'bold'} size={13} className={task.status === 'tamam' ? 'text-[var(--tl-green)]' : task.status === 'devam' ? 'text-[var(--tl-amber)]' : ''} />
            {stage.label}
            {mine && (
              <button type='button' onClick={() => { void advance(task) }} className='ml-0.5 rounded-full bg-[var(--tl-p15)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--tl-p)]' data-testid='tl-page-task-action'>
                {ACTION[task.status]}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
