import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'
import { txa } from '@/i18n/activeLocale'

/*
 * Translation Studio page tasks (work assignment). Writes go only through the tl_task_write RPC;
 * assignment needs "ceviri.proje", status changes need the task owner or project manager.
 */

export type TlTaskStage = 'temizlik' | 'ceviri' | 'dizgi' | 'kontrol'
export type TlTaskStatus = 'bekliyor' | 'devam' | 'tamam'

export const TL_TASK_STAGES: Array<{ key: TlTaskStage, label: string }> = [
  { key: 'temizlik', get label() { return txa('Temizlik') } },
  { key: 'ceviri', get label() { return txa('Çeviri') } },
  { key: 'dizgi', get label() { return txa('Dizgi') } },
  { key: 'kontrol', get label() { return txa('Kontrol') } },
]

export const TL_TASK_STATUS_LABEL: Record<TlTaskStatus, string> = { get bekliyor() { return txa('Bekliyor') }, get devam() { return txa('Devam ediyor') }, get tamam() { return txa('Tamam') } }

/** Durum dugmesi: bekliyor -> devam -> tamam -> bekliyor. */
export function nextTaskStatus(status: TlTaskStatus): TlTaskStatus {
  return status === 'bekliyor' ? 'devam' : status === 'devam' ? 'tamam' : 'bekliyor'
}

export interface TlPageTask {
  id: string
  pageId: string
  stage: TlTaskStage
  assigneeId: string | null
  status: TlTaskStatus
  note: string | null
  dueAt: string | null
  updatedAt: string
}

/** An overdue, unfinished task. */
export function isTaskOverdue(task: { dueAt: string | null, status: TlTaskStatus }, now = Date.now()) {
  return Boolean(task.dueAt) && task.status !== 'tamam' && new Date(task.dueAt as string).getTime() < now
}

export interface TlAssignableMember { userId: string, username: string, avatarUrl: string | null, stages: TlTaskStage[] }

export interface TlMyTask {
  taskId: string
  stage: TlTaskStage
  status: TlTaskStatus
  pageNumber: number
  projectId: string
  fansubId: string
  chapterNumber: number | null
  seriesTitle: string | null
  dueAt: string | null
}

export interface TlContributionRow { userId: string, username: string, stage: TlTaskStage, done: number, total: number }

const stage = z.enum(['temizlik', 'ceviri', 'dizgi', 'kontrol'])
const status = z.enum(['bekliyor', 'devam', 'tamam'])

export async function listProjectTasks(projectId: string, signal?: AbortSignal): Promise<TlPageTask[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_page_tasks')
      .select('id,page_id,stage,assignee_id,status,note,due_at,updated_at').eq('project_id', projectId), requestSignal),
    { label: txa('Sayfa görevleri'), signal },
  )
  if (error) throw error
  return z.array(z.object({
    id: z.string(), page_id: z.string(), stage, assignee_id: z.string().nullable(), status, note: z.string().nullable(),
    due_at: z.string().nullable().default(null), updated_at: z.string(),
  })).parse(data ?? []).map((row) => ({
    id: row.id, pageId: row.page_id, stage: row.stage, assigneeId: row.assignee_id, status: row.status, note: row.note,
    dueAt: row.due_at, updatedAt: row.updated_at,
  }))
}

export async function listAssignableMembers(fansubId: string, signal?: AbortSignal): Promise<TlAssignableMember[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_assignable_members', { p_fansub_id: fansubId }), requestSignal),
    { label: txa('Atanabilir üyeler'), signal },
  )
  if (error) throw error
  return z.array(z.object({ user_id: z.string(), username: z.string(), avatar_url: z.string().nullable(), stages: z.array(stage) }))
    .parse(data ?? []).map((row) => ({ userId: row.user_id, username: row.username, avatarUrl: row.avatar_url, stages: row.stages }))
}

async function write(action: string, payload: Record<string, unknown>) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('tl_task_write', { p_action: action, p: payload }), signal),
    { label: txa('Görev güncelleme') },
  )
  if (error) throw error
  return data
}

/** If assigneeId is null, the selected pages' task at that stage is removed. */
export async function assignTasks(input: { projectId: string, pageIds: string[], stage: TlTaskStage, assigneeId: string | null, note?: string, dueAt?: string | null }) {
  await write('assign', {
    project_id: input.projectId, page_ids: input.pageIds, stage: input.stage, assignee_id: input.assigneeId,
    note: input.note ?? null, due_at: input.dueAt ?? '',
  })
}

/** Bulk note / due date. An omitted field is unchanged; an empty string clears it. */
export async function updateTasks(projectId: string, taskIds: string[], patch: { note?: string, dueAt?: string | null }) {
  const payload: Record<string, unknown> = { project_id: projectId, task_ids: taskIds }
  if (patch.note !== undefined) payload.note = patch.note
  if (patch.dueAt !== undefined) payload.due_at = patch.dueAt ?? ''
  await write('update', payload)
}

export async function getProjectContributions(projectId: string, signal?: AbortSignal): Promise<{ rows: TlContributionRow[], credits: string }> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_project_contributions', { p_project_id: projectId }), requestSignal),
    { label: txa('Katkılar'), signal },
  )
  if (error) throw error
  const parsed = z.object({
    rows: z.array(z.object({ user_id: z.string(), username: z.string(), stage, done: z.number(), total: z.number() })),
    credits: z.string(),
  }).parse(data)
  return {
    rows: parsed.rows.map((row) => ({ userId: row.user_id, username: row.username, stage: row.stage, done: row.done, total: row.total })),
    credits: parsed.credits,
  }
}

export async function setTaskStatus(taskId: string, next: TlTaskStatus) {
  await write('set_status', { task_id: taskId, status: next })
}

export async function listMyTasks(signal?: AbortSignal): Promise<TlMyTask[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_my_tasks'), requestSignal),
    { label: txa('Görevlerim'), signal },
  )
  if (error) throw error
  return z.array(z.object({
    task_id: z.string(), stage, status, page_number: z.number(), project_id: z.string(), fansub_id: z.string(),
    chapter_number: z.coerce.number().nullable(), series_title: z.string().nullable(), due_at: z.string().nullable().default(null),
  }).passthrough()).parse(data ?? []).map((row) => ({
    taskId: row.task_id, stage: row.stage, status: row.status, pageNumber: row.page_number, projectId: row.project_id,
    fansubId: row.fansub_id, chapterNumber: row.chapter_number, seriesTitle: row.series_title, dueAt: row.due_at,
  }))
}
