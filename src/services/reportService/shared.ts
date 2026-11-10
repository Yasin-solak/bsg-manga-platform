import { supabase } from '../supabase'
import type { ReportTargetType, TargetConfig, UserMiniRow } from './types'

export function toSingle<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    if (Array.isArray(value)) return value[0] ?? null
    return value
}

export function getTargetConfig(targetType: ReportTargetType): TargetConfig {
    if (targetType === 'user') {
        return {
            table: 'users',
            ownerColumn: 'id',
            notFoundMessage: 'Raporlanacak kullanici bulunamadi.',
        }
    }
    if (targetType === 'manga_comment') {
        return {
            table: 'manga_comments',
            ownerColumn: 'user_id',
            notFoundMessage: 'Raporlanacak manga yorumu bulunamadi.',
        }
    }
    if (targetType === 'manga') {
        return {
            table: 'mangas',
            ownerColumn: 'id',
            notFoundMessage: 'Raporlanacak manga bulunamadi.',
        }
    }
    if (targetType === 'chapter') {
        return {
            table: 'chapters',
            ownerColumn: 'id',
            notFoundMessage: 'Raporlanacak bolum bulunamadi.',
        }
    }

    return {
        table: 'user_manga_list_comments',
        ownerColumn: 'author_id',
        notFoundMessage: 'Raporlanacak liste yorumu bulunamadi.',
    }
}

export function avatarFromUserId(userId?: string) {
    const seed = userId || 'user'
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

export async function getUserMini(userId?: string | null): Promise<UserMiniRow | null> {
    if (!userId) return null
    const { data, error } = await supabase
        .from('public_user_directory')
        .select('id, username, avatar_url')
        .eq('id', userId)
        .maybeSingle<UserMiniRow>()

    if (error || !data) return null
    return data
}

export async function getTargetOwnerId(targetId: string, targetType: ReportTargetType): Promise<string | null> {
    const targetConfig = getTargetConfig(targetType)
    if (targetType === 'user') {
        const { data, error } = await supabase
            .from('public_user_directory')
            .select('id')
            .eq('id', targetId)
            .single()

        if (error || !data) {
            throw new Error(targetConfig.notFoundMessage)
        }

        return data.id
    }

    // A manga/chapter is owned by a fansub, not a user; there is no user owner for the
    // "reporting your own content" check. Only activeness is verified.
    if (targetType === 'manga' || targetType === 'chapter') {
        const { data, error } = await supabase
            .from(targetConfig.table)
            .select('id, is_active')
            .eq('id', targetId)
            .single()

        if (error || !data) {
            throw new Error(targetConfig.notFoundMessage)
        }
        if ((data as Record<string, unknown>).is_active === false) {
            throw new Error('Bu icerik artik aktif degil.')
        }
        return null
    }

    const { data, error } = await supabase
        .from(targetConfig.table)
        .select(`${targetConfig.ownerColumn}, is_active`)
        .eq('id', targetId)
        .single()

    if (error || !data) {
        throw new Error(targetConfig.notFoundMessage)
    }

    const row = data as Record<string, unknown>
    if (row.is_active === false) {
        throw new Error('Bu icerik artik aktif degil.')
    }

    const owner = row[targetConfig.ownerColumn]
    return typeof owner === 'string' ? owner : null
}
