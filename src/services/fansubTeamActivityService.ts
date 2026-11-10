import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'

/**
 * Team members <-> translation studio: roles, studio permissions and page tasks per member
 * (get_fansub_team_studio_overview) and one member's contribution history
 * (get_fansub_member_activity). Read only; permission is in the DB (panel.uyelik).
 */

export type TeamTaskStage = 'temizlik' | 'ceviri' | 'dizgi' | 'kontrol'

export interface TeamMemberStudioSummary {
  userId: string
  roles: Array<{ id: string, name: string, color: string | null }>
  studioPermissions: string[]
  openTasks: number
  overdueTasks: number
  doneTasks30d: number
  lastActiveAt: string | null
}

export interface TeamMemberTask {
  id: string
  stage: string
  status: string
  isOpen: boolean
  dueAt: string | null
  updatedAt: string
  completedAt: string | null
  pageNumber: number | null
  projectId: string
  chapterNumber: number | null
  seriesTitle: string
}

export interface TeamMemberActivity {
  taskTotals: Record<string, { open: number, done: number }>
  tasks: TeamMemberTask[]
  projectsCreated: number
  pageVersions: number
  pageVersions30d: number
  recentActions: Array<{ id: string, action: string, summary: string, createdAt: string }>
  history: Array<{ role: string, teamTag: string | null, joinedAt: string, leftAt: string | null, leftReason: string | null }>
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const str = (value: unknown) => (typeof value === 'string' ? value : null)
const arr = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [])

export function mapTeamStudioOverview(raw: unknown): TeamMemberStudioSummary[] {
  return arr(raw)
    .filter((row) => typeof row.userId === 'string')
    .map((row) => ({
      userId: row.userId as string,
      roles: arr(row.roles).filter((role) => typeof role.id === 'string').map((role) => ({ id: role.id as string, name: str(role.name) || 'Rol', color: str(role.color) })),
      studioPermissions: Array.isArray(row.studioPermissions) ? row.studioPermissions.filter((key): key is string => typeof key === 'string') : [],
      openTasks: num(row.openTasks),
      overdueTasks: num(row.overdueTasks),
      doneTasks30d: num(row.doneTasks30d),
      lastActiveAt: str(row.lastActiveAt),
    }))
}

export function mapTeamMemberActivity(raw: unknown): TeamMemberActivity {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const totals: TeamMemberActivity['taskTotals'] = {}
  if (data.taskTotals && typeof data.taskTotals === 'object') {
    for (const [stage, value] of Object.entries(data.taskTotals as Record<string, Record<string, unknown>>)) {
      totals[stage] = { open: num(value?.open), done: num(value?.done) }
    }
  }
  return {
    taskTotals: totals,
    tasks: arr(data.tasks).filter((task) => typeof task.id === 'string').map((task) => ({
      id: task.id as string,
      stage: str(task.stage) || 'ceviri',
      status: str(task.status) || 'bekliyor',
      isOpen: task.isOpen === true,
      dueAt: str(task.dueAt),
      updatedAt: str(task.updatedAt) || '',
      completedAt: str(task.completedAt),
      pageNumber: task.pageNumber == null ? null : num(task.pageNumber),
      projectId: str(task.projectId) || '',
      chapterNumber: task.chapterNumber == null ? null : num(task.chapterNumber),
      seriesTitle: str(task.seriesTitle) || 'Seri',
    })),
    projectsCreated: num(data.projectsCreated),
    pageVersions: num(data.pageVersions),
    pageVersions30d: num(data.pageVersions30d),
    recentActions: arr(data.recentActions).filter((row) => typeof row.id === 'string').map((row) => ({
      id: row.id as string, action: str(row.action) || '', summary: str(row.summary) || '', createdAt: str(row.createdAt) || '',
    })),
    history: arr(data.history).map((row) => ({
      role: str(row.role) || 'member', teamTag: str(row.teamTag), joinedAt: str(row.joinedAt) || '', leftAt: str(row.leftAt), leftReason: str(row.leftReason),
    })),
  }
}

export async function getFansubTeamStudioOverview(fansubId: string): Promise<TeamMemberStudioSummary[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_fansub_team_studio_overview', { p_fansub_id: fansubId }), signal),
    { label: 'fansubTeamActivityService.getFansubTeamStudioOverview' },
  )
  if (error) throw error
  return mapTeamStudioOverview(data)
}

export async function getFansubMemberActivity(fansubId: string, userId: string): Promise<TeamMemberActivity> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_fansub_member_activity', { p_fansub_id: fansubId, p_user_id: userId }), signal),
    { label: 'fansubTeamActivityService.getFansubMemberActivity' },
  )
  if (error) throw error
  return mapTeamMemberActivity(data)
}
