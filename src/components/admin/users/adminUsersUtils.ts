import type {
  AdminManagedUser,
  AdminUserFansubPreview,
  AdminUserOverview,
  AdminUserPresenceStatus as ServiceAdminUserPresenceStatus,
  AdminUserRole,
  AdminUserRoleFilter,
  AdminUserTrustBand as ServiceAdminUserTrustBand,
  AdminUserTrustConfidence as ServiceAdminUserTrustConfidence,
  AdminUserTrustFilter as ServiceAdminUserTrustFilter,
  AdminUserVerificationFilter as ServiceAdminUserVerificationFilter,
} from '@/services/adminUserService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type AdminUserVerificationFilter = ServiceAdminUserVerificationFilter
export type AdminUserTrustFilter = ServiceAdminUserTrustFilter
export type AdminUserPresenceStatus = ServiceAdminUserPresenceStatus
export type AdminUserTrustBand = ServiceAdminUserTrustBand | 'unknown'
export type AdminUserTrustConfidence = ServiceAdminUserTrustConfidence | 'unknown'

export interface AdminUserTrustView {
  score: number | null
  band: AdminUserTrustBand
  confidence: AdminUserTrustConfidence
  reasonCodes: string[]
  components: Record<string, number | boolean>
  algorithmVersion?: string
  calculatedAt?: string
}

export type AdminUserTrustFactorTone = 'positive' | 'negative' | 'neutral' | 'override'

export interface AdminUserTrustFactorView {
  id: 'baseline' | 'email-verification' | 'account-tenure' | 'clean-observation' | 'confirmed-ban' | 'active-ban'
  label: string
  detail: string
  points: number | null
  tone: AdminUserTrustFactorTone
}

export type AdminUserFansubSummary = AdminUserFansubPreview

/**
 * While the new management RPC rolls out, the old list endpoint keeps working.
 * Keeping extra fields optional prevents an empty screen during this transition.
 */
export type AdminManagedUserView = AdminManagedUser

export type AdminUserOverviewView = AdminUserOverview

export const ROLE_FILTERS: Array<{ id: AdminUserRoleFilter; label: string }> = [
  { id: 'all', get label() { return txa('Tüm roller') } },
  { id: 'user', get label() { return txa('Kullanıcı') } },
  { id: 'moderator', get label() { return txa('Moderatör') } },
  { id: 'admin', get label() { return txa('Admin') } },
]

export const VERIFICATION_FILTERS: Array<{ id: AdminUserVerificationFilter; label: string }> = [
  { id: 'all', get label() { return txa('Tüm doğrulamalar') } },
  { id: 'verified', get label() { return txa('Doğrulanmış') } },
  { id: 'unverified', get label() { return txa('Doğrulanmamış') } },
]

export const TRUST_FILTERS: Array<{ id: AdminUserTrustFilter; label: string }> = [
  { id: 'all', get label() { return txa('Tüm güven bantları') } },
  { id: 'trusted', get label() { return txa('Güvenilir') } },
  { id: 'standard', get label() { return txa('Standart') } },
  { id: 'review', get label() { return txa('İncelenmeli') } },
  { id: 'low', get label() { return txa('Düşük güven') } },
]

export function toErrorText(error: unknown, fallback: string) {
  // A response validation error's message is raw JSON; a meaningful text is shown to the user.
  if (error instanceof Error && error.name === 'ZodError') return fallback
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function roleBadgeVariant(role: AdminUserRole) {
  if (role === 'admin') return 'destructive' as const
  if (role === 'moderator') return 'default' as const
  return 'secondary' as const
}

export function roleLabel(role: AdminUserRole) {
  if (role === 'admin') return txa('Admin')
  if (role === 'moderator') return txa('Moderatör')
  return txa('Kullanıcı')
}

export function formatDate(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString(intlLocale())
}

export function formatCompactDate(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Display name is not a unique identifier. When old records lack the field, the unique
 * user handle is only a presentation fallback so the screen is not empty.
 */
export function getUserDisplayName(user: Pick<AdminManagedUserView, 'displayName' | 'username'>) {
  return user.displayName?.trim() || user.username
}

export function formatRelativeTime(value?: string, now = Date.now()) {
  if (!value) return txa('Bilinmiyor')
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return txa('Bilinmiyor')
  const diffMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (diffMinutes < 1) return txa('Şimdi')
  if (diffMinutes < 60) return txa('{v1} dk önce', { v1: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return txa('{v1} sa önce', { v1: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return txa('{v1} gün önce', { v1: diffDays })
  return formatCompactDate(value)
}

export function toDatetimeLocalValue(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}

export function getUserTrust(user: AdminManagedUserView): AdminUserTrustView {
  const rawScore = user.trust?.score
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : null
  const explicitBand = normalizeTrustBand(user.trust?.band)
  const band = explicitBand !== 'unknown' ? explicitBand : trustBandForScore(score)
  const confidence = normalizeTrustConfidence(user.trust?.confidence)

  return {
    score,
    band,
    confidence,
    reasonCodes: Array.isArray(user.trust?.reasonCodes)
      ? user.trust.reasonCodes
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
      : [],
    components: normalizeTrustComponents(user.trust?.components),
    algorithmVersion: user.trust?.algorithmVersion,
    calculatedAt: user.trust?.calculatedAt,
  }
}

/**
 * The breakdown only presents the RPC's explainable components; recalculating the total score
 * on the client is forbidden since it could drift from the server algorithm over time.
 */
export function getTrustScoreFactors(trust: AdminUserTrustView): AdminUserTrustFactorView[] {
  const reasons = new Set(trust.reasonCodes)
  const baseline = readTrustNumber(trust.components, 'baseline')
  const emailVerification = readTrustNumber(trust.components, 'emailVerification')
  const accountTenure = readTrustNumber(trust.components, 'accountTenure')
  const cleanObservation = readTrustNumber(trust.components, 'cleanObservation')
  const confirmedBanPenalty = readTrustNumber(trust.components, 'confirmedBanPenalty')
  const accountAgeDays = readTrustNumber(trust.components, 'accountAgeDays')
  const confirmedBanCount = readTrustNumber(trust.components, 'confirmedBanCount')
  const activeBanOverride = trust.components.activeBanOverride === true || reasons.has('ACTIVE_BAN')
  const factors: AdminUserTrustFactorView[] = []

  if (baseline !== null) {
    factors.push({
      id: 'baseline',
      label: txa('Başlangıç güveni'),
      detail: txa('Algoritmanın sabit başlangıç değeri'),
      points: baseline,
      tone: baseline > 0 ? 'positive' : 'neutral',
    })
  }

  if (emailVerification !== null) {
    const isVerified = reasons.has('EMAIL_VERIFIED') || emailVerification > 0
    factors.push({
      id: 'email-verification',
      label: txa('E-posta doğrulaması'),
      detail: isVerified ? txa('E-posta adresi doğrulanmış') : txa('E-posta adresi henüz doğrulanmamış'),
      points: emailVerification,
      tone: emailVerification > 0 ? 'positive' : 'neutral',
    })
  }

  if (accountTenure !== null) {
    const ageDetail = accountAgeDays === null
      ? txa('Hesap yaşı katkısı')
      : txa('{v1} günlük hesap', { v1: Math.max(0, Math.round(accountAgeDays)) })
    factors.push({
      id: 'account-tenure',
      label: txa('Hesap yaşı'),
      detail: accountTenure > 0 ? ageDetail : txa('{v1}; katkı eşiğine ulaşmadı', { v1: ageDetail }),
      points: accountTenure,
      tone: accountTenure > 0 ? 'positive' : 'neutral',
    })
  }

  if (cleanObservation !== null) {
    const hasBanHistory = reasons.has('CONFIRMED_BAN_HISTORY') || (confirmedBanCount ?? 0) > 0
    const detail = cleanObservation > 0
      ? txa('Kesinleşmiş ban sinyali olmayan gözlem dönemi')
      : hasBanHistory
        ? txa('Ban geçmişi nedeniyle temiz gözlem katkısı yok')
        : txa('Yeterli gözlem süresi henüz oluşmadı')
    factors.push({
      id: 'clean-observation',
      label: txa('Temiz gözlem süresi'),
      detail,
      points: cleanObservation,
      tone: cleanObservation > 0 ? 'positive' : 'neutral',
    })
  }

  if (confirmedBanPenalty !== null && (confirmedBanPenalty < 0 || reasons.has('CONFIRMED_BAN_HISTORY'))) {
    const count = confirmedBanCount === null ? null : Math.max(0, Math.round(confirmedBanCount))
    factors.push({
      id: 'confirmed-ban',
      label: txa('Kesinleşmiş ban geçmişi'),
      detail: count === null ? txa('Son 365 gündeki kesinleşmiş kayıtlar') : txa('Son 365 günde {v1} kayıt', { v1: count }),
      points: confirmedBanPenalty,
      tone: confirmedBanPenalty < 0 ? 'negative' : 'neutral',
    })
  }

  if (activeBanOverride) {
    factors.push({
      id: 'active-ban',
      label: txa('Aktif ban kuralı'),
      detail: txa('Aktif ban nedeniyle nihai güven skoru 0 olarak sabitlendi'),
      points: null,
      tone: 'override',
    })
  }

  return factors
}

export function trustConfidenceLabel(confidence: AdminUserTrustConfidence) {
  if (confidence === 'high') return txa('Yüksek')
  if (confidence === 'medium') return txa('Orta')
  if (confidence === 'low') return txa('Düşük')
  return txa('Bilinmiyor')
}

function normalizeTrustComponents(value?: Record<string, number | boolean>) {
  if (!value) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number | boolean] => (
      typeof entry[1] === 'boolean' || (typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    )),
  )
}

function readTrustNumber(components: Record<string, number | boolean>, key: string) {
  const value = components[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function trustBandForScore(score: number | null): AdminUserTrustBand {
  if (score === null) return 'unknown'
  if (score >= 80) return 'trusted'
  if (score >= 60) return 'standard'
  if (score >= 40) return 'review'
  return 'low'
}

export function normalizeTrustBand(value?: string | null): AdminUserTrustBand {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'trusted') return 'trusted'
  if (normalized === 'standard' || normalized === 'normal') return 'standard'
  if (normalized === 'review') return 'review'
  if (normalized === 'low' || normalized === 'high-risk') return 'low'
  return 'unknown'
}

export function normalizeTrustConfidence(value?: string | null): AdminUserTrustConfidence {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized
  return 'unknown'
}

export function trustBandLabel(band: AdminUserTrustBand) {
  if (band === 'trusted') return txa('Güvenilir')
  if (band === 'standard') return txa('Standart')
  if (band === 'review') return txa('İncelenmeli')
  if (band === 'low') return txa('Düşük güven')
  return txa('Hesaplanmadı')
}

export function getUserPresence(user: AdminManagedUserView, now = Date.now()) {
  const explicit = normalizePresence(user.presenceStatus)
  if (explicit !== 'unknown') {
    return {
      status: explicit,
      label: explicit === 'online'
        ? txa('Çevrim içi')
        : explicit === 'idle'
          ? txa('Boşta')
          : explicit === 'blocked'
            ? txa('Engellendi')
            : formatRelativeTime(user.lastActivityAt ?? user.lastSeenAt, now),
    }
  }

  const lastActivityAt = user.lastActivityAt ?? user.lastSeenAt
  if (!lastActivityAt) return { status: 'unknown' as const, label: txa('Bilinmiyor') }
  const timestamp = new Date(lastActivityAt).getTime()
  if (!Number.isFinite(timestamp)) return { status: 'unknown' as const, label: txa('Bilinmiyor') }
  const ageSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (ageSeconds <= 120) return { status: 'online' as const, label: txa('Çevrim içi') }
  if (ageSeconds <= 300) return { status: 'idle' as const, label: txa('Boşta') }
  return { status: 'offline' as const, label: formatRelativeTime(lastActivityAt, now) }
}

function normalizePresence(value?: string): AdminUserPresenceStatus {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'online') return 'online'
  if (normalized === 'idle') return 'idle'
  if (normalized === 'offline') return 'offline'
  if (normalized === 'blocked') return 'blocked'
  return 'unknown'
}

export function presenceDotClass(status: AdminUserPresenceStatus) {
  if (status === 'online') return 'bg-emerald-500'
  if (status === 'idle') return 'bg-amber-500'
  if (status === 'blocked') return 'bg-destructive'
  if (status === 'offline') return 'bg-muted-foreground/50'
  return 'bg-muted-foreground/30'
}

export function getPrimaryFansub(user: AdminManagedUserView) {
  return user.primaryFansub ?? null
}

export function userLevelLabel(user: AdminManagedUserView) {
  if (user.progression) return `${user.progression.levelNumber} · ${user.progression.title}`
  if (user.level === undefined || user.level === null || user.level === '') return '—'
  return String(user.level)
}

