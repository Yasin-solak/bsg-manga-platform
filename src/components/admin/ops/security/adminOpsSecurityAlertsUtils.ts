import type {
  SecurityAlertItem,
  SecurityAlertRuleItem,
  SecurityAlertStatus,
  SecuritySeverity,
} from '@/services/adminSecurityService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type AlertStatusFilter = SecurityAlertStatus | 'all'

export interface RuleDraftState {
  windowMinutes: number
  thresholdCount: number
  dedupeMinutes: number
  severity: SecuritySeverity
  isActive: boolean
}

export const STATUS_OPTIONS: Array<{ value: AlertStatusFilter; label: string }> = [
  { value: 'all', get label() { return txa('Tüm durumlar') } },
  { value: 'open', get label() { return txa('Açık') } },
  { value: 'acknowledged', get label() { return txa('Onaylandi') } },
  { value: 'resolved', get label() { return txa('Çözüldü') } },
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

export function formatRemaining(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (hours > 0) return txa('{v1}s {v2}dk', { v1: hours, v2: minutes })
  return `${minutes}dk`
}

export function scopeLabel(rule: SecurityAlertRuleItem | SecurityAlertItem) {
  if (rule.scopeType === 'global') return txa('Global')
  if (rule.scopeType === 'actor_user') return txa('Aktor')
  return txa('Hedef kullanıcı')
}

export function initialDraft(rule: SecurityAlertRuleItem): RuleDraftState {
  return {
    windowMinutes: rule.windowMinutes,
    thresholdCount: rule.thresholdCount,
    dedupeMinutes: rule.dedupeMinutes,
    severity: rule.severity,
    isActive: rule.isActive,
  }
}

export function alertStatusLabel(status: SecurityAlertStatus) {
  if (status === 'acknowledged') return txa('Onaylandi')
  if (status === 'resolved') return txa('Çözüldü')
  return txa('Açık')
}

export function alertStatusBadgeClass(status: SecurityAlertStatus) {
  if (status === 'resolved') return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40'
  if (status === 'acknowledged') return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
  return 'bg-red-500/20 text-red-800 dark:text-red-200 border-red-500/40'
}
