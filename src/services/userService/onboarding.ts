import { supabase } from '../supabase'
import type { UserOnboardingState } from './types'

type OnboardingStateRow = {
    id: string
    onboarding_completed_at: string | null
}

function isMissingOnboardingInfrastructureError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const typed = error as { code?: string; message?: string; details?: string; hint?: string }
    const text = [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
    return (
        typed.code === 'PGRST202'
        || typed.code === '42703'
        || typed.code === '42883'
        || typed.code === '42P01'
        || text.includes('onboarding_completed_at')
    )
}

function buildOnboardingMigrationError() {
    return new Error('Bu ozellik icin 20260302235901_user_onboarding_phase3.sql migration dosyasini calistirin.')
}

function mapOnboardingState(row: OnboardingStateRow | null | undefined): UserOnboardingState {
    return {
        completedAt: row?.onboarding_completed_at ?? null,
    }
}

export async function markOnboardingCompleted(
    userId: string,
    completedAt = new Date().toISOString(),
): Promise<UserOnboardingState> {
    const { data, error } = await supabase.rpc('mark_my_onboarding_completed', {
        p_completed_at: completedAt,
    })

    if (error) {
        if (isMissingOnboardingInfrastructureError(error)) throw buildOnboardingMigrationError()
        throw error
    }

    const payload = Array.isArray(data) ? data[0] : data
    if (!payload || typeof payload !== 'object') {
        throw new Error('Onboarding durumu bos dondu.')
    }

    const row = payload as OnboardingStateRow
    if (row.id !== userId) {
        throw new Error('Onboarding guncellemesi aktif kullanici ile eslesmiyor.')
    }

    return mapOnboardingState(row)
}
