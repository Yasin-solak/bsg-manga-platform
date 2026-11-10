import { supabase } from '../supabase'
import type { DbAdminUserProfileRow } from './shared'

export async function fetchAdminUserDetailFallbackProfile(userId: string): Promise<DbAdminUserProfileRow> {
    const { data, error } = await supabase.rpc('get_admin_user_detail_profile', {
        p_user_id: userId,
    })

    if (error) throw error
    const profileRow = (Array.isArray(data) ? data[0] : data) as DbAdminUserProfileRow | null
    if (!profileRow) throw new Error('Kullanici bulunamadi.')

    return profileRow
}
