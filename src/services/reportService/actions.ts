import { isFeatureEnabled } from '../featureFlagService'
import { tryWriteAdminAuditLog } from '../adminService/shared.audit'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { getCurrentUserIdentity } from '../userService/selfIdentity'
import {
    addE2EAdminReportNote,
    getE2EAdminReportHistory,
    getE2EAdminReports,
    updateE2EAdminReportStatus,
} from '@/testing/adminReportsE2e'
import { z } from 'zod'
import { getTargetOwnerId } from './shared'
import type {
    Report,
    ReportModerationEvent,
    ReportStatus,
    ReportTargetType,
} from './types'

const reportNoteSchema = z.string().trim().min(3).max(500)

type AuditLogRow = {
    id: string
    action: string
    summary: string | null
    metadata: Record<string, unknown> | null
    created_at: string
    actor: { username: string | null } | Array<{ username: string | null }> | null
}

function toAuditActorName(actor: AuditLogRow['actor']) {
    if (!actor) return undefined
    const row = Array.isArray(actor) ? actor[0] : actor
    return row?.username || undefined
}

export async function createReport(
    targetId: string,
    targetType: ReportTargetType,
    reason: string,
    description?: string,
) {
    const isReportsEnabled = await isFeatureEnabled('moderation.reports', false)
    if (!isReportsEnabled) {
        throw new Error('Raporlama sistemi su anda aktif degil.')
    }

    const publicUser = await getCurrentUserIdentity({ required: true })
    if (!publicUser?.id) throw new Error('Public user profile not found')

    const targetOwnerId = await getTargetOwnerId(targetId, targetType)
    if (targetOwnerId && targetOwnerId === publicUser.id) {
        throw new Error(targetType === 'user' ? 'Kendinizi raporlayamazsiniz.' : 'Kendi iceriginizi raporlayamazsiniz.')
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(supabase.from('reports').insert({
            reporter_id: publicUser.id,
            target_id: targetId,
            target_type: targetType,
            reason,
            description,
            status: 'pending',
        }), signal),
        { label: 'Rapor oluşturma' },
    )

    if (error) {
        const errorCode = (error as { code?: string }).code
        if (errorCode === '23505') {
            throw new Error(targetType === 'user' ? 'Bu kullaniciyi zaten raporladiniz.' : 'Bu hedefi zaten raporladiniz.')
        }
        throw error
    }

    return true
}

export async function listReports(status?: ReportStatus) {
    const e2eReports = getE2EAdminReports()
    if (e2eReports) {
        return status ? e2eReports.filter((report) => report.status === status) : e2eReports
    }

    const isReportsEnabled = await isFeatureEnabled('moderation.reports', false)
    if (!isReportsEnabled) return []

    let query = supabase
        .from('reports')
        .select(
            `
            *,
            reporter:users!reporter_id(username, avatar_url)
        `,
        )
        .order('created_at', { ascending: false })

    if (status) {
        query = query.eq('status', status)
    }

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(query, signal),
        { label: 'Rapor kuyruğu' },
    )

    if (error) {
        console.error('listReports error', error)
        return []
    }
    return data as Report[]
}

export async function updateReportStatus(id: string, status: ReportStatus) {
    if (updateE2EAdminReportStatus(id, status)) return true

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('reports')
                .update({
                    status,
                    // dismissed also counts as a closed job in the general moderation metric.
                    resolved_at: status === 'pending' ? null : new Date().toISOString(),
                })
                .eq('id', id),
            signal,
        ),
        { label: 'Rapor durumu güncelleme' },
    )

    if (error) throw error

    await tryWriteAdminAuditLog({
        action: status === 'pending' ? 'report.status.reopen' : `report.status.${status}`,
        resourceType: 'report',
        resourceId: id,
        summary: status === 'resolved'
            ? 'Rapor çözüldü olarak işaretlendi.'
            : status === 'dismissed'
                ? 'Rapor yoksayıldı.'
                : 'Rapor yeniden inceleme kuyruğuna alındı.',
        metadata: { status },
    })
    return true
}

export async function getReportModerationHistory(reportId: string): Promise<ReportModerationEvent[]> {
    const e2eHistory = getE2EAdminReportHistory(reportId)
    if (e2eHistory) return e2eHistory

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('audit_logs')
                .select(`
                    id,
                    action,
                    summary,
                    metadata,
                    created_at,
                    actor:actor_user_id (
                        username
                    )
                `)
                .eq('resource_type', 'report')
                .eq('resource_id', reportId)
                .order('created_at', { ascending: false })
                .limit(40),
            signal,
        ),
        { label: 'Rapor moderasyon geçmişi' },
    )

    if (error) throw error

    return ((data || []) as AuditLogRow[]).map((row) => {
        const note = typeof row.metadata?.note === 'string' ? row.metadata.note : undefined
        return {
            id: row.id,
            action: row.action,
            summary: row.summary || 'Moderasyon işlemi',
            note,
            actorUsername: toAuditActorName(row.actor),
            createdAt: row.created_at,
        }
    })
}

export async function addReportModerationNote(reportId: string, noteInput: string) {
    const note = reportNoteSchema.parse(noteInput)
    const e2eEvent = addE2EAdminReportNote(reportId, note)
    if (e2eEvent) return e2eEvent

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(supabase.rpc('create_admin_audit_log', {
            p_action: 'report.note.add',
            p_resource_type: 'report',
            p_resource_id: reportId,
            p_summary: 'Moderasyon notu eklendi.',
            p_metadata: { note },
        }), signal),
        { label: 'Rapor moderasyon notu' },
    )

    if (error) throw error
    return String(data || '')
}
