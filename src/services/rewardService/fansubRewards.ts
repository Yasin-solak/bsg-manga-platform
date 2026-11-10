import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { listAdminUserDirectoryByIds } from '../userService/adminDirectory'
import {
  DbDailyTopMangaRow,
  DbPreviewRow,
  DbRankRuleRow,
  DbRunRow,
  DbViewTierRow,
  mapPreviewRow,
  mapRankRuleRow,
  mapViewTierRow,
  normalizeMonthStart,
  RpcRunResult,
} from './shared'
import type {
  FansubMonthlyRewardPreviewRow,
  FansubMonthlyRewardRunResult,
  FansubMonthlyRewardRunRow,
  FansubTierDailyManga,
} from './types'

const fansubRewardsLogger = createScopedLogger('rewardService/fansubRewards')

export async function listFansubRewardRankRules() {
  const requestContext = createRequestContext('rewardService/fansubRewards', 'listFansubRewardRankRules')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_reward_rank_rules')
        .select('id, rank_position, coin_reward, is_active, created_at, updated_at')
        .order('rank_position', { ascending: true }),
      signal,
    ),
    { label: 'rewardService.listFansubRewardRankRules' },
  )

  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub odul sira kurallari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return ((data || []) as DbRankRuleRow[]).map(mapRankRuleRow)
}

export async function saveFansubRewardRankRule(input: {
  id: string
  rankPosition: number
  coinReward: number
  isActive: boolean
}) {
  const payload = {
    rank_position: Math.max(1, Math.floor(input.rankPosition)),
    coin_reward: Math.max(0, Math.floor(input.coinReward)),
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  }

  const requestContext = createRequestContext('rewardService/fansubRewards', 'saveFansubRewardRankRule', {
    id: input.id,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_reward_rank_rules')
        .update(payload)
        .eq('id', input.id)
        .select('id, rank_position, coin_reward, is_active, created_at, updated_at')
        .single<DbRankRuleRow>(),
      signal,
    ),
    { label: 'rewardService.saveFansubRewardRankRule' },
  )

  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub odul sira kurali kaydedilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return mapRankRuleRow(data)
}

export async function listFansubRewardViewTiers() {
  const requestContext = createRequestContext('rewardService/fansubRewards', 'listFansubRewardViewTiers')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_reward_view_tiers')
        .select('id, label, min_views, coin_reward, is_active, created_at, updated_at')
        .order('min_views', { ascending: true }),
      signal,
    ),
    { label: 'rewardService.listFansubRewardViewTiers' },
  )

  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub odul tier listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  return ((data || []) as DbViewTierRow[]).map(mapViewTierRow)
}

export async function saveFansubRewardViewTier(input: {
  id?: string
  label: string
  minViews: number
  coinReward: number
  isActive: boolean
}) {
  const payload = {
    label: input.label.trim() || 'Tier',
    min_views: Math.max(1, Math.floor(input.minViews)),
    coin_reward: Math.max(0, Math.floor(input.coinReward)),
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  }

  const requestContext = createRequestContext('rewardService/fansubRewards', 'saveFansubRewardViewTier', {
    id: input.id || null,
  })
  if (input.id) {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('fansub_reward_view_tiers')
          .update(payload)
          .eq('id', input.id)
          .select('id, label, min_views, coin_reward, is_active, created_at, updated_at')
          .single<DbViewTierRow>(),
        signal,
      ),
      { label: 'rewardService.saveFansubRewardViewTier.update' },
    )

    if (error) {
      fansubRewardsLogger.error({
        event: requestContext.event,
        message: toUserFacingErrorMessage(error, 'Fansub odul tier guncellenemedi.'),
        context: toRequestContextLogContext(requestContext, { mode: 'update' }),
        error,
      })
      throw error
    }
    return mapViewTierRow(data)
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_reward_view_tiers')
        .insert(payload)
        .select('id, label, min_views, coin_reward, is_active, created_at, updated_at')
        .single<DbViewTierRow>(),
      signal,
    ),
    { label: 'rewardService.saveFansubRewardViewTier.insert' },
  )

  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub odul tier kaydedilemedi.'),
      context: toRequestContextLogContext(requestContext, { mode: 'insert' }),
      error,
    })
    throw error
  }
  return mapViewTierRow(data)
}

export async function getFansubMonthlyRewardPreview(monthStart?: string | null) {
  const pMonthStart = normalizeMonthStart(monthStart)
  const requestContext = createRequestContext('rewardService/fansubRewards', 'getFansubMonthlyRewardPreview', {
    monthStart: pMonthStart || null,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_monthly_reward_preview', {
        p_month_start: pMonthStart,
      }),
      signal,
    ),
    { label: 'rewardService.getFansubMonthlyRewardPreview' },
  )
  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub aylik odul onizlemesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as DbPreviewRow[]).map(mapPreviewRow) as FansubMonthlyRewardPreviewRow[]
}

export async function getPublicFansubTierPreview(monthStart?: string | null, limit = 20) {
  const pMonthStart = normalizeMonthStart(monthStart)
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20
  const requestContext = createRequestContext('rewardService/fansubRewards', 'getPublicFansubTierPreview', {
    monthStart: pMonthStart || null,
    limit: safeLimit,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_public_fansub_tier_preview', {
        p_month_start: pMonthStart,
        p_limit: safeLimit,
      }),
      signal,
    ),
    { label: 'rewardService.getPublicFansubTierPreview' },
  )
  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Public fansub tier onizlemesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as DbPreviewRow[]).map(mapPreviewRow) as FansubMonthlyRewardPreviewRow[]
}

export async function getDailyTopMangas(limit = 5) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.floor(limit))) : 5
  const requestContext = createRequestContext('rewardService/fansubRewards', 'getDailyTopMangas', {
    limit: safeLimit,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_popular_mangas_by_views_window', {
        p_days: 1,
        p_limit: safeLimit,
      }),
      signal,
    ),
    { label: 'rewardService.getDailyTopMangas' },
  )
  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Gunluk populer manga listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as DbDailyTopMangaRow[]).map((row) => ({
    id: row.id,
    title: row.title?.trim() || 'Bilinmeyen Manga',
    coverImageUrl: row.cover_image_url || null,
    lastChapterNumber: row.last_chapter_number != null ? Number(row.last_chapter_number) : null,
    rating: row.rating != null ? Number(row.rating) : null,
    totalViews: Number(row.total_views || 0),
    dailyViews: Number(row.recent_views || 0),
  })) as FansubTierDailyManga[]
}

export async function runFansubMonthlyRewards(monthStart?: string | null) {
  const pMonthStart = normalizeMonthStart(monthStart)
  const requestContext = createRequestContext('rewardService/fansubRewards', 'runFansubMonthlyRewards', {
    monthStart: pMonthStart || null,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('run_fansub_monthly_rewards', {
        p_month_start: pMonthStart,
      }),
      signal,
    ),
    { label: 'rewardService.runFansubMonthlyRewards' },
  )
  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub aylik odul calistirma islemi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const row = (data || {}) as RpcRunResult
  return {
    success: row.success !== false,
    alreadyCompleted: row.already_completed === true,
    runId: row.run_id || '',
    monthStart: row.month_start || pMonthStart || '',
    monthLabel: row.month_label,
    totalFansubs: Number(row.total_fansubs || 0),
    totalCoin: Number(row.total_coin || 0),
  } as FansubMonthlyRewardRunResult
}

export async function listFansubMonthlyRewardRuns(limit = 12) {
  const safeLimit = Math.max(1, Math.min(36, Math.floor(limit)))
  const requestContext = createRequestContext('rewardService/fansubRewards', 'listFansubMonthlyRewardRuns', {
    limit: safeLimit,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_monthly_reward_runs')
        .select('id, month_start, status, started_at, completed_at, run_by, total_fansubs, total_coin, created_at, updated_at')
        .order('month_start', { ascending: false })
        .limit(safeLimit),
      signal,
    ),
    { label: 'rewardService.listFansubMonthlyRewardRuns' },
  )

  if (error) {
    fansubRewardsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub aylik odul calisma gecmisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
  const rows = (data || []) as DbRunRow[]
  const userIds = Array.from(new Set(rows.map((row) => row.run_by).filter((value): value is string => Boolean(value))))
  const usernameMap = new Map<string, string>()

  if (userIds.length > 0) {
    let userRows: Array<{ id: string; username: string | null }> = []
    try {
      userRows = await listAdminUserDirectoryByIds(userIds)
    } catch (userError) {
      fansubRewardsLogger.error({
        event: requestContext.event,
        message: toUserFacingErrorMessage(userError, 'Fansub odul gecmisi kullanici baglantisi yuklenemedi.'),
        context: toRequestContextLogContext(requestContext, { userCount: userIds.length }),
        error: userError,
      })
      throw userError
    }
    ;(userRows || []).forEach((row) => {
      usernameMap.set(row.id, row.username?.trim() || 'Kullanici')
    })
  }

  return rows.map((row) => ({
    id: row.id,
    monthStart: row.month_start,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    runBy: row.run_by,
    runByUsername: row.run_by ? (usernameMap.get(row.run_by) || null) : null,
    totalFansubs: Number(row.total_fansubs || 0),
    totalCoin: Number(row.total_coin || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) as FansubMonthlyRewardRunRow[]
}
