import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { tryWriteAdminAuditLog } from '../adminService/shared.audit'
import { setAdminUserBanState } from '../adminUserService'
import { createScopedLogger } from '../logger'
import {
    sendReportContentRemovedNotification,
    sendReportResolvedReporterNotification,
} from '../notificationService/presets'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getTargetConfig } from './shared'
import type { ReportTargetType } from './types'

const reportModerationLogger = createScopedLogger('reportService/moderation')

type DeactivateContentOptions = {
    reportId?: string
    reporterId?: string | null
    targetOwnerId?: string | null
    targetTitle?: string
    targetPreview?: string
    routeHint?: string
    reason?: string
}

async function notifyReportDeactivation(
    targetId: string,
    targetType: ReportTargetType,
    options?: DeactivateContentOptions,
) {
    if (!options) return

    const jobs: Array<Promise<unknown>> = []
    if (options.targetOwnerId) {
        jobs.push(sendReportContentRemovedNotification({
            userId: options.targetOwnerId,
            reportId: options.reportId,
            targetId,
            targetType,
            targetTitle: options.targetTitle,
            routeHint: options.routeHint,
            reason: options.reason,
        }))
    }

    if (options.reporterId && options.reporterId !== options.targetOwnerId) {
        jobs.push(sendReportResolvedReporterNotification({
            userId: options.reporterId,
            reportId: options.reportId,
            targetId,
            targetType,
            targetTitle: options.targetTitle,
            routeHint: options.routeHint,
        }))
    }

    if (jobs.length === 0) return

    const results = await Promise.allSettled(jobs)
    const rejected = results.filter((result) => result.status === 'rejected')
    if (rejected.length > 0) {
        reportModerationLogger.warn({
            event: 'report-deactivation-notification-failed',
            message: 'Rapor moderasyonu bildirimi gonderilemedi.',
            context: {
                targetId,
                targetType,
                failedCount: rejected.length,
            },
            error: rejected[0],
        })
    }
}

export async function deactivateContent(
    targetId: string,
    targetType: ReportTargetType,
    options?: DeactivateContentOptions,
) {
    const requestContext = createRequestContext('reportService/moderation', 'deactivateContent', {
        targetId,
        targetType,
    })
    if (targetType === 'user') {
        throw new Error('Kullanici raporunda icerik deaktif etme yerine ban aksiyonu kullanilmali.')
    }
    const targetConfig = getTargetConfig(targetType)
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from(targetConfig.table).update({ is_active: false }).eq('id', targetId),
            signal,
        ),
        { label: 'reportService.deactivateContent' },
    )

    if (error) {
        reportModerationLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Icerik pasife alinamadi.'),
            context: toRequestContextLogContext(requestContext, { table: targetConfig.table }),
            error,
        })
        throw error
    }

    await tryWriteAdminAuditLog({
        action: 'report.content.deactivate',
        resourceType: targetConfig.table,
        resourceId: targetId,
        summary: 'Rapor moderasyonu uzerinden icerik pasife alindi.',
        metadata: {
            targetType,
        },
    })

    await notifyReportDeactivation(targetId, targetType, options)

    return true
}

/**
 * Removes fansub-owned content (manga/chapter/post) on a report.
 * Atomic with one RPC: content is deactivated, the report becomes 'resolved', a "to fix" record
 * opens for the related fansub, and the owner/reporter/fansub team are notified.
 * This function is NOT USED for comment/user targets (the old flow continues).
 */
export async function removeReportedContentViaRpc(reportId: string, note?: string) {
    const requestContext = createRequestContext('reportService/moderation', 'removeReportedContentViaRpc', {
        reportId,
    })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('admin_remove_reported_content', {
                p_report_id: reportId,
                p_note: note ?? null,
            }),
            signal,
        ),
        { label: 'reportService.removeReportedContentViaRpc' },
    )

    if (error) {
        reportModerationLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Icerik kaldirilamadi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    return true
}

export async function activateContent(targetId: string, targetType: ReportTargetType) {
    const requestContext = createRequestContext('reportService/moderation', 'activateContent', {
        targetId,
        targetType,
    })
    if (targetType === 'user') {
        throw new Error('Kullanici raporunda geri yukleme aksiyonu desteklenmiyor.')
    }
    const targetConfig = getTargetConfig(targetType)
    // Removing a manga/chapter sets is_approved=false, so restoring must also make these fields approved; otherwise
    // the content stays active but unapproved and invisible to the public. The is_approved false->true
    // transition also closes the open fansub fix record (trigger 241).
    const restorePayload: Record<string, unknown> = { is_active: true }
    if (targetType === 'manga' || targetType === 'chapter') {
        restorePayload.is_approved = true
    }
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from(targetConfig.table).update(restorePayload).eq('id', targetId),
            signal,
        ),
        { label: 'reportService.activateContent' },
    )

    if (error) {
        reportModerationLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Icerik yeniden aktif edilemedi.'),
            context: toRequestContextLogContext(requestContext, { table: targetConfig.table }),
            error,
        })
        throw error
    }

    await tryWriteAdminAuditLog({
        action: 'report.content.reactivate',
        resourceType: targetConfig.table,
        resourceId: targetId,
        summary: 'Rapor moderasyonu uzerinden icerik yeniden aktif edildi.',
        metadata: {
            targetType,
        },
    })

    return true
}

export async function banUser(userId: string) {
    const requestContext = createRequestContext('reportService/moderation', 'banUser', { userId })
    try {
        // Note: we run the ban action through a central admin RPC rather than a raw table update.
        // Why: the permission, security event and ban metadata chain is enforced in one place.
        await setAdminUserBanState({
            userId,
            isBanned: true,
            reason: 'Rapor moderasyonu aksiyonu',
        })
    } catch (error) {
        reportModerationLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Kullanici banlanamadi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    await tryWriteAdminAuditLog({
        action: 'report.user.ban',
        resourceType: 'user',
        resourceId: userId,
        summary: 'Rapor moderasyonu uzerinden kullanici banlandi.',
    })

    return true
}
