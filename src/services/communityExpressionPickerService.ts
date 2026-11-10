import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { supabase } from '@/services/supabase'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { getFollowedFansubs } from '@/services/userService/follows'

export type CommunityExpressionFansubSourceReason = 'context' | 'supporting' | 'following'

export interface CommunityExpressionFansubSource {
  id: string
  name: string
  slug: string | null
  avatarUrl: string | null
  reasons: CommunityExpressionFansubSourceReason[]
}

type RawFansubLiteRow = {
  id?: unknown
  name?: unknown
  slug?: unknown
  avatar_url?: unknown
  is_active?: unknown
}

type RawFansubBoostGrantRow = {
  fansub_id?: unknown
  fansub?: RawFansubLiteRow | null
}

const communityExpressionPickerLogger = createScopedLogger('communityExpressionPickerService')

function toSafeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function buildSourceFromRaw(
  row: RawFansubLiteRow | null | undefined,
  reason: CommunityExpressionFansubSourceReason,
): CommunityExpressionFansubSource | null {
  const id = toSafeString(row?.id)
  const name = toSafeString(row?.name)
  if (!id || !name) return null

  return {
    id,
    name,
    slug: toSafeString(row?.slug),
    avatarUrl: toSafeString(row?.avatar_url),
    reasons: [reason],
  }
}

function mergeSourceMaps(
  sources: CommunityExpressionFansubSource[],
): CommunityExpressionFansubSource[] {
  const map = new Map<string, CommunityExpressionFansubSource>()

  for (const source of sources) {
    const existing = map.get(source.id)
    if (!existing) {
      map.set(source.id, source)
      continue
    }

    const reasonSet = new Set<CommunityExpressionFansubSourceReason>([
      ...existing.reasons,
      ...source.reasons,
    ])

    map.set(source.id, {
      ...existing,
      reasons: Array.from(reasonSet).sort((left, right) => {
        const order: Record<CommunityExpressionFansubSourceReason, number> = {
          context: 0,
          supporting: 1,
          following: 2,
        }
        return order[left] - order[right]
      }),
    })
  }

  return Array.from(map.values()).sort((left, right) => {
    const order: Record<CommunityExpressionFansubSourceReason, number> = {
      context: 0,
      supporting: 1,
      following: 2,
    }

    const leftPriority = Math.min(...left.reasons.map((reason) => order[reason]))
    const rightPriority = Math.min(...right.reasons.map((reason) => order[reason]))

    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.name.localeCompare(right.name, 'tr')
  })
}

async function getContextFansubSource(
  fansubId: string,
  signal?: AbortSignal,
): Promise<CommunityExpressionFansubSource | null> {
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select('id, name, slug, avatar_url, is_active')
        .eq('id', fansubId)
        .eq('is_active', true)
        .maybeSingle(),
      nextSignal,
    ),
    { label: 'communityExpressionPickerService.getContextFansubSource', signal },
  )

  if (error) throw error
  return buildSourceFromRaw(data as RawFansubLiteRow | null, 'context')
}

async function getSupportedFansubSources(
  userId: string,
  signal?: AbortSignal,
): Promise<CommunityExpressionFansubSource[]> {
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase
        .from('fansub_boost_grants')
        .select(`
          fansub_id,
          fansub:fansubs!inner(
            id,
            name,
            slug,
            avatar_url,
            is_active
          )
        `)
        .eq('supporter_user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .eq('fansub.is_active', true)
        .order('granted_at', { ascending: false }),
      nextSignal,
    ),
    { label: 'communityExpressionPickerService.getSupportedFansubSources', signal },
  )

  if (error) throw error

  return ((data || []) as RawFansubBoostGrantRow[])
    .map((row) => buildSourceFromRaw(row.fansub, 'supporting'))
    .filter((source): source is CommunityExpressionFansubSource => source !== null)
}

async function getFollowedFansubSources(
  userId: string,
): Promise<CommunityExpressionFansubSource[]> {
  const rows = await getFollowedFansubs(userId, { includeCosmetics: false })

  return rows
    .map((row: any) => buildSourceFromRaw(row?.fansub as RawFansubLiteRow, 'following'))
    .filter((source): source is CommunityExpressionFansubSource => source !== null)
}

export async function listCommunityExpressionFansubSources(options: {
  userId?: string | null
  contextFansubId?: string | null
  signal?: AbortSignal
}): Promise<CommunityExpressionFansubSource[]> {
  const normalizedUserId = toSafeString(options.userId)
  const normalizedContextFansubId = toSafeString(options.contextFansubId)
  const requestContext = createRequestContext(
    'communityExpressionPickerService',
    'listCommunityExpressionFansubSources',
    {
      hasUserId: Boolean(normalizedUserId),
      hasContextFansubId: Boolean(normalizedContextFansubId),
    },
  )

  try {
    const tasks: Array<Promise<CommunityExpressionFansubSource[]>> = []

    if (normalizedContextFansubId) {
      tasks.push(
        getContextFansubSource(normalizedContextFansubId, options.signal).then((source) => (
          source ? [source] : []
        )),
      )
    }

    if (normalizedUserId) {
      tasks.push(getSupportedFansubSources(normalizedUserId, options.signal))
      tasks.push(getFollowedFansubSources(normalizedUserId))
    }

    if (tasks.length === 0) return []

    const groups = await Promise.all(tasks)
    return mergeSourceMaps(groups.flat())
  } catch (error) {
    communityExpressionPickerLogger.warn({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Ifade kaynaklari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }
}
