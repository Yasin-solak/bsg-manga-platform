import { supabase } from '../supabase'
import {
    isMissingSchemaError,
    type DbFansubInviteRow,
    type DbFansubMemberHistoryRow,
    type DbFansubMemberRow,
    type DbJoinRequestRow,
} from './shared'
import type { AdminUserDetailFallbackPayload } from './fallback.types'

type AdminUserDetailFallbackFansubPayload = Pick<
    AdminUserDetailFallbackPayload,
    'fansubMembershipRows' | 'fansubHistoryRows' | 'sentInviteRows' | 'joinRequestRows'
>

export async function fetchAdminUserDetailFallbackFansubs(
    userId: string,
): Promise<AdminUserDetailFallbackFansubPayload> {
    const [fansubMembershipResult, fansubHistoryRows, sentInviteRows, joinRequestRows] = await Promise.all([
        supabase
            .from('fansub_members')
            .select(`
                fansub_id,
                role,
                team_tag,
                created_at,
                fansub:fansub_id (
                    id,
                    name,
                    slug,
                    avatar_url,
                    is_active
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        (async () => {
            const result = await supabase
                .from('fansub_member_history')
                .select(`
                    id,
                    fansub_id,
                    role,
                    team_tag,
                    joined_at,
                    left_at,
                    left_reason,
                    ended_by_user_id,
                    fansub:fansub_id (
                        id,
                        name,
                        slug
                    ),
                    ended_by_user:ended_by_user_id (
                        id,
                        username
                    )
                `)
                .eq('user_id', userId)
                .order('joined_at', { ascending: false })
                .limit(80)

            if (result.error) {
                if (isMissingSchemaError(result.error)) return [] as DbFansubMemberHistoryRow[]
                throw result.error
            }
            return (result.data || []) as DbFansubMemberHistoryRow[]
        })(),
        (async () => {
            const result = await supabase
                .from('fansub_invites')
                .select(`
                    id,
                    fansub_id,
                    invited_user_id,
                    role,
                    status,
                    note,
                    responded_at,
                    is_active,
                    created_at,
                    fansub:fansub_id (
                        id,
                        name,
                        slug
                    ),
                    invited_user:invited_user_id (
                        id,
                        username,
                        avatar_url
                    )
                `)
                .eq('invited_by_user_id', userId)
                .order('created_at', { ascending: false })
                .limit(80)

            if (result.error) {
                if (isMissingSchemaError(result.error)) return [] as DbFansubInviteRow[]
                throw result.error
            }
            return (result.data || []) as DbFansubInviteRow[]
        })(),
        (async () => {
            const result = await supabase
                .from('fansub_join_requests')
                .select(`
                    id,
                    fansub_id,
                    status,
                    message,
                    review_note,
                    reviewed_at,
                    is_active,
                    created_at,
                    fansub:fansub_id (
                        id,
                        name,
                        slug
                    ),
                    reviewed_by_user:reviewed_by (
                        id,
                        username
                    )
                `)
                .eq('requester_user_id', userId)
                .order('created_at', { ascending: false })
                .limit(80)

            if (result.error) {
                if (isMissingSchemaError(result.error)) return [] as DbJoinRequestRow[]
                throw result.error
            }
            return (result.data || []) as DbJoinRequestRow[]
        })(),
    ])

    if (fansubMembershipResult.error) throw fansubMembershipResult.error

    return {
        fansubMembershipRows: (fansubMembershipResult.data || []) as DbFansubMemberRow[],
        fansubHistoryRows,
        sentInviteRows,
        joinRequestRows,
    }
}
