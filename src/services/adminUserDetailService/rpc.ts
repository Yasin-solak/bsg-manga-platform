import { supabase } from '../supabase'
import type { AdminUserDetail } from '../adminUserTypes'
import { isRpcMissingFunctionError, parseSocialLinks } from './shared'

export async function getAdminUserDetailByRpc(userId: string): Promise<AdminUserDetail> {
    const preferred = await supabase.rpc('get_admin_user_detail_v2', {
        p_user_id: userId,
    })
    const response = preferred.error && isRpcMissingFunctionError(preferred.error)
        ? await supabase.rpc('get_admin_user_detail', { p_user_id: userId })
        : preferred
    const { data, error } = response

    if (error) throw error
    if (!data || typeof data !== 'object') {
        throw new Error('Kullanici detayi RPC cevabi gecersiz.')
    }

    const typed = data as AdminUserDetail
    const rawProfile = typed.profile as AdminUserDetail['profile'] & {
        display_name?: unknown
        displayName?: unknown
    }
    const displayName = typeof rawProfile.displayName === 'string' && rawProfile.displayName.trim()
        ? rawProfile.displayName.trim()
        : typeof rawProfile.display_name === 'string' && rawProfile.display_name.trim()
            ? rawProfile.display_name.trim()
            : rawProfile.username

    return {
        ...typed,
        profile: {
            ...rawProfile,
            displayName,
            socialLinks: parseSocialLinks((rawProfile as { socialLinks?: unknown }).socialLinks),
        },
    }
}
