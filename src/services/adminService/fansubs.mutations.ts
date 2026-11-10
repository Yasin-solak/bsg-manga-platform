import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
    type DbAdminSetFansubActiveResult,
    type DbAdminUpdateFansubMemberResult,
    ensureMigrationError,
    tryWriteAdminAuditLog,
} from './shared'

const adminFansubMutationsLogger = createScopedLogger('adminService/fansubs.mutations')

export async function setAdminFansubActive(fansubId: string, isActive: boolean) {
    const requestContext = createRequestContext('adminService/fansubs.mutations', 'setAdminFansubActive', {
        fansubId,
        isActive,
    })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('admin_set_fansub_active', {
                p_fansub_id: fansubId,
                p_is_active: isActive,
            }),
            signal,
        ),
        { label: 'adminService.setAdminFansubActive' },
    )

    if (error) {
        adminFansubMutationsLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Fansub aktiflik durumu guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        ensureMigrationError(error)
    }

    const result = data as DbAdminSetFansubActiveResult
    await tryWriteAdminAuditLog({
        action: 'fansub.active.update',
        resourceType: 'fansub',
        resourceId: fansubId,
        summary: isActive ? 'Fansub aktif edildi.' : 'Fansub pasife alindi.',
        metadata: {
            isActive,
            previousIsActive: result?.previous_is_active,
            removedMemberCount: result?.removed_member_count,
        },
    })

    return result
}

export async function updateAdminFansubMemberRoleAndTag(
    fansubId: string,
    memberUserId: string,
    role: 'admin' | 'moderator' | 'member',
    teamTag?: string | null,
) {
    const requestContext = createRequestContext('adminService/fansubs.mutations', 'updateAdminFansubMemberRoleAndTag', {
        fansubId,
        memberUserId,
        role,
    })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('admin_update_fansub_member', {
                p_fansub_id: fansubId,
                p_member_user_id: memberUserId,
                p_role: role,
                p_team_tag: teamTag?.trim() || null,
            }),
            signal,
        ),
        { label: 'adminService.updateAdminFansubMemberRoleAndTag' },
    )

    if (error) {
        adminFansubMutationsLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Fansub uye rol veya tag bilgisi guncellenemedi.'),
            context: toRequestContextLogContext(requestContext, { teamTag: teamTag?.trim() || null }),
            error,
        })
        ensureMigrationError(error)
    }

    await tryWriteAdminAuditLog({
        action: 'fansub_member.role.update',
        resourceType: 'fansub_member',
        resourceId: `${fansubId}:${memberUserId}`,
        summary: 'Fansub uye rol/tag bilgisi guncellendi.',
        metadata: {
            fansubId,
            memberUserId,
            role,
            teamTag: teamTag?.trim() || null,
        },
    })

    return data as DbAdminUpdateFansubMemberResult
}
