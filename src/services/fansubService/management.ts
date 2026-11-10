import type { FrameType } from '@/components/common/AvatarFrame'
import type { Fansub } from '@/types'
import { loadPublicUserDirectoryLiteByIds } from '../publicUserDirectoryLite'
import { uploadFansubAvatar, uploadFansubProfileBackground } from '../storageService'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { getPublicChapterUnlockCutoffIso } from '../premiumPackagePublicService'
import { supabase } from '../supabase'
import { getE2EMockStoreData } from '@/testing/e2eMocks'
import {
  fansubSlugSchema,
  type DbFansub,
  fansubNameSchema,
  mapDbFansub,
  slugifyFansubName,
  type ListFansubChaptersOptions,
} from './shared'

const fansubManagementLogger = createScopedLogger('fansubService.management')

function logFansubManagementError(event: string, error: unknown, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('fansubService.management', event, context)
  fansubManagementLogger.error({
    event: requestContext.event,
    message: 'fansub yonetim istegi basarisiz oldu.',
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

function createMissingFansubManagementRpcError(
  rpcName:
    | 'upsert_fansub_profile'
    | 'set_fansub_member_role'
    | 'remove_fansub_member'
    | 'remove_fansub_chapter'
    | 'admin_set_fansub_active',
) {
  return new Error(`${rpcName} RPC bulunamadi. Ilgili SQL migration'i uygulanmamis olabilir.`)
}

export async function getFansubMembers(fansubId: string) {
  const { data, error } = await supabase
    .from('fansub_members')
    .select(`
      role,
      team_tag,
      users:user_id (
        id,
        username,
        avatar_url
      )
    `)
    .eq('fansub_id', fansubId)

  if (error) {
    logFansubManagementError('get-fansub-members', error, { fansubId })
    return []
  }

  const userIds = data
    .map((row: any) => String(row.users?.id || '').trim())
    .filter(Boolean)
  const directoryRows = await loadPublicUserDirectoryLiteByIds(userIds)

  return data.map((row: any) => {
    const userId = String(row.users?.id || '').trim()
    const directoryRow = userId ? directoryRows.get(userId) : undefined
    return {
      id: row.users?.id,
      username: row.users?.username,
      avatar:
        row.users?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.users?.username}`,
      role: row.role,
      teamTag: row.team_tag || undefined,
      frameType: (directoryRow?.frame_type || 'default') as FrameType,
      activeFansubIdentityTag: directoryRow?.active_fansub_identity_tag ?? null,
    }
  })
}

export async function upsertFansub(fansub: Partial<Fansub> & { name: string }) {
  const validatedName = fansubNameSchema.parse(fansub.name)
  const slug = typeof fansub.slug === 'string'
    ? fansubSlugSchema.parse(fansub.slug)
    : slugifyFansubName(validatedName)

  const { data, error } = await supabase.rpc('upsert_fansub_profile', {
    p_fansub_id: fansub.id ?? null,
    p_name: validatedName,
    p_slug: slug,
    p_description: typeof fansub.description === 'string' ? fansub.description : null,
    p_discord_invite_url: Object.prototype.hasOwnProperty.call(fansub, 'discordInviteUrl')
      ? (fansub.discordInviteUrl ?? null)
      : null,
    p_avatar_url: typeof fansub.avatar === 'string' ? fansub.avatar : null,
    p_primary_color: typeof fansub.primaryColor === 'string' ? fansub.primaryColor : null,
    p_secondary_color: typeof fansub.secondaryColor === 'string' ? fansub.secondaryColor : null,
    p_active_name_style: fansub.activeNameStyle ?? null,
    p_custom_background_asset_url: Object.prototype.hasOwnProperty.call(fansub, 'customBackgroundAssetUrl')
      ? (fansub.customBackgroundAssetUrl ?? null)
      : null,
    p_active_background_id: Object.prototype.hasOwnProperty.call(fansub, 'activeBackgroundId')
      ? (fansub.activeBackgroundId ?? null)
      : null,
    p_hover_theme: fansub.hoverTheme ?? null,
  })

  if (error) {
    if (error.code === '42883') {
      throw createMissingFansubManagementRpcError('upsert_fansub_profile')
    }
    logFansubManagementError('upsert-fansub', error, { fansubId: fansub.id || null, slug })
    throw error
  }

  return { data: mapDbFansub(data as DbFansub) }
}

export async function deleteFansub(id: string) {
  const { error } = await supabase.rpc('admin_set_fansub_active', {
    p_fansub_id: id,
    p_is_active: false,
  })

  if (error) {
    if (error.code === '42883') {
      throw createMissingFansubManagementRpcError('admin_set_fansub_active')
    }
    logFansubManagementError('delete-fansub', error, { fansubId: id })
    throw error
  }

  return { error: null }
}

export async function checkFansubAdmin(fansubId: string, userId: string) {
  const { count, error } = await supabase
    .from('fansub_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('fansub_id', fansubId)
    .eq('user_id', userId)
    .eq('role', 'admin')

  if (error) {
    logFansubManagementError('check-fansub-admin', error, { fansubId, userId })
    return false
  }

  return (count || 0) > 0
}

export async function getMyAdminFansubs(userId: string) {
  const e2eMockStoreData = getE2EMockStoreData()
  if (e2eMockStoreData) {
    return e2eMockStoreData.adminFansubs.map((fansub) => ({
      id: fansub.id,
      name: fansub.name,
      coin_balance: fansub.coin_balance,
      inventory: [...fansub.inventory],
    }))
  }

  const { data, error } = await supabase
    .from('fansub_members')
    .select(`
      fansub_id,
      fansubs:fansub_id (
        id,
        name,
        coin_balance,
        fansub_inventory (
          store_item_id
        )
      )
    `)
    .eq('user_id', userId)
    .eq('role', 'admin')

  if (error) {
    logFansubManagementError('get-my-admin-fansubs', error, { userId })
    return []
  }

  return data
    .map((entry: any) => ({
      id: entry.fansubs?.id,
      name: entry.fansubs?.name,
      coin_balance: entry.fansubs?.coin_balance,
      inventory: entry.fansubs?.fansub_inventory?.map((item: any) => item.store_item_id) || [],
    }))
    .filter((fansub: any) => !!fansub.id) as {
      id: string
      name: string
      coin_balance: number
      inventory: string[]
    }[]
}

export async function updateMemberRole(
  fansubId: string,
  userId: string,
  newRole: 'admin' | 'moderator' | 'member',
) {
  if (newRole === 'admin') {
    throw new Error('Admin rolu tablo ici akistan guncellenemez. Devir akisni kullanin.')
  }

  const { error } = await supabase.rpc('set_fansub_member_role', {
    p_fansub_id: fansubId,
    p_member_user_id: userId,
    p_role: newRole,
  })

  if (error) {
    if (error.code === '42883') {
      throw createMissingFansubManagementRpcError('set_fansub_member_role')
    }
    logFansubManagementError('update-member-role', error, { fansubId, userId, newRole })
    throw error
  }
}

export async function listFansubChapters(
  fansubId: string,
  options: ListFansubChaptersOptions = {},
) {
  const includePending = options.includePending === true
  const nowIso = await getPublicChapterUnlockCutoffIso()

  let query = supabase
    .from('chapters')
    .select(`
      id,
      chapter_number,
      title,
      manga_id,
      is_approved,
      publish_at,
      created_at,
      mangas:manga_id!inner (
        id,
        title,
        slug,
        cover_image_url,
        is_active,
        is_approved
      )
    `)
    .eq('fansub_id', fansubId)
    .eq('is_active', true)
    .eq('mangas.is_active', true)
    .order('created_at', { ascending: false })

  if (!includePending) {
    query = query
      .eq('is_approved', true)
      .eq('mangas.is_approved', true)
      .lte('publish_at', nowIso)
  }

  const { data, error } = await query

  if (error) {
    logFansubManagementError('list-fansub-chapters', error, { fansubId, includePending })
    return []
  }

  return data
}

export async function removeChapter(chapterId: string) {
  const { error } = await supabase.rpc('remove_fansub_chapter', {
    p_chapter_id: chapterId,
  })

  if (error) {
    if (error.code === '42883') {
      throw createMissingFansubManagementRpcError('remove_fansub_chapter')
    }
    logFansubManagementError('remove-chapter', error, { chapterId })
    throw error
  }
}

export async function uploadAvatar(
  file: File,
  fansubId?: string | null,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return uploadFansubAvatar(file, { fansubId }, onProgress)
}

export async function uploadProfileBackground(
  file: File,
  fansubId: string,
  slotIndex = 0,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return uploadFansubProfileBackground(file, fansubId, slotIndex, onProgress)
}

export async function removeFansubMember(fansubId: string, userId: string) {
  const { error } = await supabase.rpc('remove_fansub_member', {
    p_fansub_id: fansubId,
    p_member_user_id: userId,
  })

  if (error) {
    if (error.code === '42883') {
      throw createMissingFansubManagementRpcError('remove_fansub_member')
    }
    logFansubManagementError('remove-fansub-member', error, { fansubId, userId })
    throw error
  }
}

/**
 * Studio vault: the fansub's current coin balance. The public fansub query
 * (FANSUB_PUBLIC_STATE_SELECT) does not carry this field; the studio reads the balance from here.
 */
export async function getFansubCoinBalance(fansubId: string): Promise<number> {
  const { data, error } = await supabase
    .from('fansubs')
    .select('coin_balance')
    .eq('id', fansubId)
    .maybeSingle()

  if (error) {
    logFansubManagementError('get-fansub-coin-balance', error, { fansubId })
    throw error
  }

  const value = Number((data as { coin_balance?: number | null } | null)?.coin_balance ?? 0)
  return Number.isFinite(value) ? value : 0
}
