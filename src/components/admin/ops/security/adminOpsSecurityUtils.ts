import type { SecuritySeverity } from '@/services/adminSecurityService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type EventFilterSeverity = 'all' | SecuritySeverity

export const SEVERITY_OPTIONS: Array<{ value: EventFilterSeverity; label: string }> = [
  { value: 'all', get label() { return txa('Tüm seviyeler') } },
  { value: 'low', get label() { return txa('Low') } },
  { value: 'medium', get label() { return txa('Medium') } },
  { value: 'high', get label() { return txa('High') } },
  { value: 'critical', get label() { return txa('Critical') } },
]

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function formatDateTime(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString(intlLocale())
}

export function severityBadgeClass(value: SecuritySeverity) {
  if (value === 'critical') return 'bg-red-900/30 text-red-900 dark:text-red-200 border-red-900/50'
  if (value === 'high') return 'bg-red-500/20 text-red-800 dark:text-red-200 border-red-500/40'
  if (value === 'medium') return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
  return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40'
}

export function userStatusBadgeClass(isBanned: boolean) {
  return isBanned
    ? 'bg-destructive/20 text-destructive border-destructive/40'
    : 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40'
}

export function normalizeSource(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._:-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeEventType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export interface NewSecurityEventFormState {
  source: string
  eventType: string
  severity: SecuritySeverity
  message: string
  targetUserId: string
  metadataText: string
}

export const DEFAULT_NEW_EVENT_FORM: NewSecurityEventFormState = {
  source: 'admin',
  eventType: 'manual_note',
  severity: 'medium',
  message: '',
  targetUserId: '',
  metadataText: '',
}
