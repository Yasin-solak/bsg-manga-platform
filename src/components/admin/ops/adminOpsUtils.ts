import type { AdminAuditLogItem, AdminFeatureFlagItem } from '@/services/adminOpsService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type OpsTab = 'status' | 'feature_flags' | 'audit_logs' | 'security'

export interface FeatureFlagDraft {
  label: string
  description: string
  isEnabled: boolean
  rolloutPercent: number
  isPublic: boolean
}

export interface NewFeatureFlagFormState {
  key: string
  label: string
  description: string
  isEnabled: boolean
  rolloutPercent: number
  isPublic: boolean
}

export const DEFAULT_NEW_FLAG_FORM: NewFeatureFlagFormState = {
  key: '',
  label: '',
  description: '',
  isEnabled: false,
  rolloutPercent: 100,
  isPublic: false,
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return txa(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return txa(message)
  }
  return fallback
}

export function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function buildFlagDraftMap(flags: AdminFeatureFlagItem[]) {
  return flags.reduce<Record<string, FeatureFlagDraft>>((acc, flag) => {
    acc[flag.id] = {
      label: flag.label,
      description: flag.description,
      isEnabled: flag.isEnabled,
      rolloutPercent: flag.rolloutPercent,
      isPublic: flag.isPublic,
    }
    return acc
  }, {})
}

export function resolveAuditActor(item: AdminAuditLogItem) {
  if (item.actor?.username) return item.actor.username
  if (item.actorRole) return item.actorRole
  return txa('Sistem')
}
