/**
 * Team members -> "Assign task": assigns a page task to the selected member in the translation
 * studio. Writes use the same Translation Studio RPC (tl_task_write 'assign');
 * permission (ceviri.proje) and the member's stage permission are also validated in the DB.
 */
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, LockSimple, Spinner } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/services/toastService'
import { listOpenProjects, listPages, type TlPage, type TlProject } from '@/services/translationStudioService'
import {
  assignTasks,
  listAssignableMembers,
  listProjectTasks,
  TL_TASK_STAGES,
  type TlAssignableMember,
  type TlPageTask,
  type TlTaskStage,
} from '@/services/translationTaskService'
import { intlLocale, txa } from '@/i18n/activeLocale'

const DUE_PRESETS: Array<{ key: string, label: string, days: number | null }> = [
  { key: 'none', get label() { return txa('Teslim yok') }, days: null },
  { key: '1', get label() { return txa('1 gün') }, days: 1 },
  { key: '3', get label() { return txa('3 gün') }, days: 3 },
  { key: '7', get label() { return txa('1 hafta') }, days: 7 },
]

/** End of day (23:59 local) ISO; no due date if empty. */
export function dueDateIso(days: number | null, now = new Date()) {
  if (days == null) return null
  const due = new Date(now)
  due.setDate(due.getDate() + days)
  due.setHours(23, 59, 0, 0)
  return due.toISOString()
}

type PageState = { page: TlPage, task: TlPageTask | null }

export default function FansubMemberTaskAssignDialog({
  fansubId,
  member,
  open,
  onOpenChange,
  onAssigned,
}: {
  fansubId: string
  member: { userId: string, username: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned?: () => void
}) {
  const [projects, setProjects] = useState<TlProject[] | null>(null)
  const [assignable, setAssignable] = useState<TlAssignableMember[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [pages, setPages] = useState<TlPage[] | null>(null)
  const [taskRows, setTaskRows] = useState<TlPageTask[]>([])
  const [stage, setStage] = useState<TlTaskStage | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [duePreset, setDuePreset] = useState('3')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let active = true
    setProjects(null)
    setLoadError(null)
    setProjectId(null)
    setPages(null)
    setSelected(new Set())
    setNote('')
    setDuePreset('3')
    Promise.all([listOpenProjects(fansubId), listAssignableMembers(fansubId)])
      .then(([projectRows, members]) => {
        if (!active) return
        setProjects(projectRows)
        setAssignable(members)
        if (projectRows.length === 1) setProjectId(projectRows[0].id)
      })
      .catch((err) => { if (active) setLoadError(err instanceof Error ? err.message : txa('Projeler yüklenemedi.')) })
    return () => { active = false }
  }, [fansubId, open])

  const memberStages = useMemo(() => assignable.find((row) => row.userId === member.userId)?.stages ?? [], [assignable, member.userId])
  const nameOf = useMemo(() => new Map(assignable.map((row) => [row.userId, row.username])), [assignable])

  useEffect(() => {
    if (!stage || !memberStages.includes(stage)) setStage(memberStages[0] ?? null)
  }, [memberStages, stage])

  useEffect(() => {
    if (!projectId) return undefined
    let active = true
    setPages(null)
    setSelected(new Set())
    Promise.all([listPages(projectId), listProjectTasks(projectId)])
      .then(([pageRows, tasks]) => {
        if (!active) return
        setPages(pageRows)
        setTaskRows(tasks)
      })
      .catch(() => { if (active) setPages([]) })
    return () => { active = false }
  }, [projectId])

  const pageStates = useMemo<PageState[]>(() => (pages ?? []).map((page) => ({
    page,
    task: taskRows.find((task) => task.pageId === page.id && task.stage === stage) ?? null,
  })), [pages, stage, taskRows])

  // When the stage changes, the selection should not include pages already with this member at that stage.
  useEffect(() => { setSelected(new Set()) }, [stage])

  const free = pageStates.filter((row) => !row.task)
  const takenFromOthers = pageStates.filter((row) => selected.has(row.page.id) && row.task && row.task.assigneeId !== member.userId).length

  const toggle = (pageId: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(pageId)) next.delete(pageId)
    else next.add(pageId)
    return next
  })

  const submit = async () => {
    if (!projectId || !stage || selected.size === 0) return
    setSaving(true)
    try {
      await assignTasks({
        projectId,
        pageIds: [...selected],
        stage,
        assigneeId: member.userId,
        note: note.trim() || undefined,
        dueAt: dueDateIso(DUE_PRESETS.find((preset) => preset.key === duePreset)?.days ?? null),
      })
      toast.success(txa('@{v1} için {v2} sayfa {v3} görevi atandı.', { v1: member.username, v2: selected.size, v3: TL_TASK_STAGES.find((row) => row.key === stage)?.label.toLocaleLowerCase(intlLocale()) ?? '' }))
      onAssigned?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : txa('Görev atanamadı.'))
    } finally {
      setSaving(false)
    }
  }

  const project = projects?.find((row) => row.id === projectId) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[860px]' data-testid='member-task-assign-dialog'>
        <DialogHeader className='border-b border-border/60 px-6 pb-4 pt-5 text-left'>
          <DialogTitle>{txa('@{v1} için görev ata', { v1: member.username })}</DialogTitle>
          <DialogDescription>{txa('Çeviri Stüdyosu\'ndaki açık bir bölümden sayfa seç; üye bildirim alır ve görev "Görevlerim" listesine düşer.')}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className='px-6 py-10 text-center text-[13px] text-destructive'>{loadError}</p>
        ) : !projects ? (
          <p className='flex items-center justify-center gap-2 px-6 py-12 text-[13px] text-muted-foreground'><Spinner className='animate-spin' size={16} />{txa('Yükleniyor…')}</p>
        ) : memberStages.length === 0 ? (
          <div className='flex flex-col items-center gap-2 px-6 py-12 text-center'>
            <LockSimple size={22} className='text-muted-foreground' />
            <b className='text-[14px]'>{txa('Bu üyenin stüdyoda aşama izni yok')}</b>
            <span className='max-w-[420px] text-[12.5px] text-muted-foreground'>{txa('Temizlik, çeviri, dizgi ya da kontrol izni olan bir rol ver; sonra görev atayabilirsin.')}</span>
          </div>
        ) : projects.length === 0 ? (
          <p className='px-6 py-12 text-center text-[13px] text-muted-foreground'>{txa('Stüdyoda açık bölüm yok. Önce Çeviri Stüdyosu\'nda bir bölüm aç.')}</p>
        ) : (
          <div className='grid min-h-0 flex-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]'>
            <ul className='flex max-h-[220px] flex-col gap-1 overflow-y-auto border-b border-border/60 p-3 md:max-h-none md:border-b-0 md:border-r' aria-label={txa('Açık bölümler')}>
              {projects.map((row) => (
                <li key={row.id}>
                  <button
                    type='button'
                    onClick={() => setProjectId(row.id)}
                    className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors', row.id === projectId ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/60')}
                  >
                    <span className='h-11 w-8 flex-none overflow-hidden rounded-md bg-muted'>
                      {row.coverUrl?.startsWith('http') ? <img src={row.coverUrl} alt='' className='size-full object-cover' /> : null}
                    </span>
                    <span className='min-w-0'>
                      <b className='block truncate text-[12.5px] font-semibold'>{row.seriesTitle}</b>
                      <span className='text-[11.5px] text-muted-foreground'>{txa('Bölüm {v1} · {v2} sayfa', { v1: row.chapterNumber, v2: row.pageCount })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className='flex min-h-0 flex-col gap-4 overflow-y-auto p-5'>
              <div>
                <span className='mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground'>{txa('Aşama')}</span>
                <div className='inline-flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1' role='radiogroup' aria-label={txa('Aşama')}>
                  {TL_TASK_STAGES.map((row) => {
                    const allowed = memberStages.includes(row.key)
                    return (
                      <button
                        key={row.key}
                        type='button'
                        role='radio'
                        aria-checked={stage === row.key}
                        disabled={!allowed}
                        title={allowed ? undefined : txa('Bu üyenin bu aşama için izni yok')}
                        onClick={() => setStage(row.key)}
                        className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold', stage === row.key ? 'bg-background shadow-sm' : 'text-muted-foreground', !allowed && 'cursor-not-allowed opacity-50')}
                      >
                        {!allowed && <LockSimple size={11} />}{row.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className='mb-1.5 flex flex-wrap items-center gap-2'>
                  <span className='text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground'>{txa('Sayfalar')}</span>
                  {project && pages ? (
                    <span className='ml-auto flex gap-1'>
                      <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-[12px]' disabled={free.length === 0} onClick={() => setSelected(new Set(free.map((row) => row.page.id)))}>{txa('Boştakiler ({v1})', { v1: free.length })}</Button>
                      <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-[12px]' onClick={() => setSelected(new Set(pageStates.map((row) => row.page.id)))}>{txa('Tümü')}</Button>
                      <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-[12px]' disabled={selected.size === 0} onClick={() => setSelected(new Set())}>{txa('Temizle')}</Button>
                    </span>
                  ) : null}
                </div>
                {!project ? (
                  <p className='rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-[12.5px] text-muted-foreground'>{txa('Soldan bir bölüm seç.')}</p>
                ) : !pages ? (
                  <p className='py-8 text-center text-[12.5px] text-muted-foreground'>{txa('Sayfalar yükleniyor…')}</p>
                ) : pageStates.length === 0 ? (
                  <p className='rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-[12.5px] text-muted-foreground'>{txa('Bu bölüme henüz sayfa yüklenmedi.')}</p>
                ) : (
                  <>
                    <div className='grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5' data-testid='member-task-pages'>
                      {pageStates.map(({ page, task }) => {
                        const isSelected = selected.has(page.id)
                        const mine = task?.assigneeId === member.userId
                        const owner = task?.assigneeId ? nameOf.get(task.assigneeId) ?? txa('başkası') : null
                        return (
                          <button
                            key={page.id}
                            type='button'
                            aria-pressed={isSelected}
                            title={task ? `${mine ? txa('Zaten bu üyede') : `@${owner}`} · ${task.status === 'tamam' ? txa('bitti') : txa('açık')}` : txa('Boş')}
                            onClick={() => toggle(page.id)}
                            className={cn(
                              'relative flex h-12 flex-col items-center justify-center rounded-lg border text-[13px] font-bold tabular-nums transition-colors',
                              isSelected ? 'border-primary bg-primary text-primary-foreground' : mine ? 'border-primary/40 bg-primary/10 text-primary' : task ? 'border-border/60 bg-muted/60 text-muted-foreground' : 'border-border/80 hover:border-primary/50',
                            )}
                          >
                            {page.pageIndex + 1}
                            {task ? (
                              <span className={cn('max-w-full truncate px-1 text-[9.5px] font-semibold', isSelected ? 'text-primary-foreground/80' : '')}>
                                {task.status === 'tamam' ? <CheckCircle size={10} weight='fill' className='inline' /> : null}{mine ? txa('bunda') : owner}
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                    <p className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground'>
                      <span className='inline-flex items-center gap-1'><i className='size-2.5 rounded-sm border border-border' />{txa('Boş')}</span>
                      <span className='inline-flex items-center gap-1'><i className='size-2.5 rounded-sm bg-primary/30' />{txa('Bu üyede')}</span>
                      <span className='inline-flex items-center gap-1'><i className='size-2.5 rounded-sm bg-muted-foreground/40' />{txa('Başka üyede')}</span>
                      <span className='inline-flex items-center gap-1'><CheckCircle size={11} weight='fill' />{txa('Bitti')}</span>
                    </p>
                    <p className='mt-1.5 text-[12px] text-muted-foreground'>
                      {selected.size ? txa('{v1} sayfa seçildi', { v1: selected.size }) : txa('Sayfa seçilmedi')}
                      {takenFromOthers ? <span className='font-semibold text-amber-600 dark:text-amber-400'> {txa('· {v1} sayfa başka üyeden alınacak', { v1: takenFromOthers })}</span> : null}
                    </p>
                  </>
                )}
              </div>

              <div className='grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]'>
                <div>
                  <span className='mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground'>{txa('Teslim')}</span>
                  <div className='inline-flex gap-1 rounded-xl bg-muted/60 p-1' role='radiogroup' aria-label={txa('Teslim süresi')}>
                    {DUE_PRESETS.map((preset) => (
                      <button key={preset.key} type='button' role='radio' aria-checked={duePreset === preset.key} onClick={() => setDuePreset(preset.key)} className={cn('rounded-lg px-2.5 py-1.5 text-[12px] font-semibold', duePreset === preset.key ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className='block'>
                  <span className='mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground'>{txa('Not (isteğe bağlı)')}</span>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 300))} rows={2} placeholder={txa('Örn. SFX çevirisi şart değil, balonlara odaklan.')} className='min-h-[44px] resize-none text-[13px]' />
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className='border-t border-border/60 px-6 py-3'>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>{txa('İptal')}</Button>
          <Button disabled={saving || !stage || selected.size === 0} onClick={() => void submit()} data-testid='member-task-assign-submit'>
            {saving ? <Spinner className='animate-spin' size={14} /> : null}
            {selected.size ? txa('{v1} sayfayı ata', { v1: selected.size }) : txa('Görev ata')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
