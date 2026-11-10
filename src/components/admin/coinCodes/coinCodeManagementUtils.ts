import type {
  AdminRedeemCodeItem,
  AdminRedeemUsageEvent,
  RedeemCodeTargetType,
} from '@/services/redeemCodeService'
import { intlLocale, txa } from '@/i18n/activeLocale'


export interface GenerationFormState {
  value: number
  count: number
  maxUses: number
  targetType: RedeemCodeTargetType
  prefix: string
  expiresAt: string
  seriesLabel: string
  distributionChannel: string
  notes: string
}

export type CoinCodeRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface CoinCodeGenerationRisk {
  riskLevel: CoinCodeRiskLevel
  riskScore: number
  maxDistributionCoin: number
  expiresInDays: number | null
  warnings: string[]
  recommendations: string[]
}

export interface CoinCodeGenerationCheck {
  id: 'prefix' | 'value' | 'count' | 'maxUses' | 'expiresAt' | 'targetType'
  label: string
  detail: string
  ok: boolean
}

export function toDateTimeLocalFromNow(daysAhead: number) {
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function createDefaultGenerationForm(): GenerationFormState {
  return {
    value: 250,
    count: 20,
    maxUses: 1,
    targetType: 'user',
    prefix: 'BSG',
    expiresAt: toDateTimeLocalFromNow(30),
    seriesLabel: '',
    distributionChannel: '',
    notes: '',
  }
}

export function buildGenerationChecks(form: GenerationFormState): CoinCodeGenerationCheck[] {
  const prefix = form.prefix.trim()
  const expiresAt = new Date(form.expiresAt)
  const expiresAtValid = !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()

  return [
    {
      id: 'prefix',
      label: txa('Prefix kullanıma hazır'),
      detail: txa('2-8 karakter; yalnızca harf ve rakam.'),
      ok: /^[A-Za-z0-9]{2,8}$/.test(prefix),
    },
    {
      id: 'value',
      label: txa('Coin değeri geçerli'),
      detail: txa('Her kod için pozitif tam sayı gerekir.'),
      ok: Number.isInteger(form.value) && form.value > 0,
    },
    {
      id: 'count',
      label: txa('Kod adedi güvenli aralıkta'),
      detail: txa('Tek üretimde 1-500 kod oluşturulabilir.'),
      ok: Number.isInteger(form.count) && form.count >= 1 && form.count <= 500,
    },
    {
      id: 'maxUses',
      label: txa('Kullanım limiti geçerli'),
      detail: txa('Her kod için en az bir kullanım hakkı gerekir.'),
      ok: Number.isInteger(form.maxUses) && form.maxUses >= 1,
    },
    {
      id: 'expiresAt',
      label: txa('Son kullanma tarihi geçerli'),
      detail: txa('Tarih gelecekte olmalıdır.'),
      ok: expiresAtValid,
    },
    {
      id: 'targetType',
      label: txa('Hedef cüzdan seçildi'),
      detail: txa('Kullanıcı, fansub veya her ikisi seçilebilir.'),
      ok: ['user', 'fansub', 'both'].includes(form.targetType),
    },
  ]
}

export function isGenerationFormReady(form: GenerationFormState) {
  return buildGenerationChecks(form).every((check) => check.ok)
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parseExpiresInDays(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return txa(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return txa(message)
  }
  return fallback
}

export function formatCodeTarget(value: RedeemCodeTargetType) {
  if (value === 'user') return txa('Kişisel bakiye')
  if (value === 'fansub') return txa('Fansub kasası')
  return txa('Bakiye ya da kasa')
}

export function evaluateCoinCodeGenerationRisk(form: GenerationFormState): CoinCodeGenerationRisk {
  const normalizedPrefix = (form.prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const maxDistributionCoin = Math.max(0, form.value) * Math.max(0, form.count) * Math.max(0, form.maxUses)
  const expiresInDays = parseExpiresInDays(form.expiresAt)

  let riskScore = 0
  const warnings: string[] = []

  if (maxDistributionCoin >= 1_000_000) {
    riskScore += 4
    warnings.push(txa('En fazla dağıtım 1 milyon coin üstünde.'))
  } else if (maxDistributionCoin >= 250_000) {
    riskScore += 3
    warnings.push(txa('En fazla dağıtım yüksek.'))
  } else if (maxDistributionCoin >= 75_000) {
    riskScore += 2
  }

  if (form.count >= 200) {
    riskScore += 2
    warnings.push(txa('Tek seferde çok fazla kod üretiliyor.'))
  } else if (form.count >= 100) {
    riskScore += 1
  }

  if (form.maxUses >= 10) {
    riskScore += 3
    warnings.push(txa('Kod çok fazla kişiye açık (kullanım limiti yüksek).'))
  } else if (form.maxUses >= 5) {
    riskScore += 2
  } else if (form.maxUses >= 3) {
    riskScore += 1
  }

  if (expiresInDays === null) {
    riskScore += 2
    warnings.push(txa('Son kullanma tarihi geçersiz.'))
  } else if (expiresInDays > 180) {
    riskScore += 2
    warnings.push(txa('Son kullanma süresi 6 aydan uzun.'))
  } else if (expiresInDays > 90) {
    riskScore += 1
  }

  if (normalizedPrefix.length < 3) {
    riskScore += 1
    warnings.push(txa('Önek kısa; kod gruplarını ayırt etmek zorlaşır.'))
  }

  if (form.targetType === 'both' && form.value >= 1000) {
    riskScore += 1
    warnings.push(txa('Yüksek değerli kod hem kişisel bakiyeye hem fansub kasasına açık (kişi başına yine bir kez kullanılır).'))
  }

  const recommendations: string[] = []
  if (form.maxUses > 3) recommendations.push(txa('Kullanım limitini mümkünse 1–3 arasında tut.'))
  if (expiresInDays !== null && expiresInDays > 90) recommendations.push(txa('Son kullanma süresini 30–90 gün arasına çek.'))
  if (normalizedPrefix.length < 3) recommendations.push(txa('Öneki en az 3 karakter yap.'))
  if (maxDistributionCoin > 250_000) recommendations.push(txa('Büyük grubu birkaç küçük gruba böl.'))
  if (recommendations.length === 0) recommendations.push(txa('Ayarlar güvenli aralıkta.'))

  let riskLevel: CoinCodeRiskLevel = 'low'
  if (riskScore >= 8) riskLevel = 'critical'
  else if (riskScore >= 5) riskLevel = 'high'
  else if (riskScore >= 3) riskLevel = 'medium'

  return {
    riskLevel,
    riskScore,
    maxDistributionCoin,
    expiresInDays,
    warnings,
    recommendations,
  }
}

/**
 * The code's status. The old version also showed a multi-use code used once as
 * "Used"; status is based on usability.
 */
export function resolveCodeStatus(item: AdminRedeemCodeItem) {
  if (!item.isActive) return { id: 'passive' as const, label: txa('Pasif') }
  if (item.isExpired) return { id: 'expired' as const, label: txa('Süresi doldu') }
  if (item.usedCount >= item.maxUses) return { id: 'exhausted' as const, label: txa('Tükendi') }
  return { id: 'active' as const, label: txa('Aktif') }
}

export function resolveUsageTarget(item: AdminRedeemUsageEvent) {
  return item.targetType === 'fansub'
    ? item.fansubName || txa('Fansub kasası')
    : txa('Kişisel bakiye')
}

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? '')
  // User-sourced cells are forced to text to prevent Excel formula injection.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** A sample code in the server's format (PREFIX-8 hex-4 hex); the preview looks the same as real output. */
export function sampleCoinCode(prefix: string, seed: number) {
  const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MZ'
  const hex = (length: number, salt: number) => Array.from({ length }, (_, index) => ((seed * 7919 + salt * 104729 + index * 31337) % 16).toString(16)).join('').toUpperCase()
  return `${clean}-${hex(8, 1)}-${hex(4, 2)}`
}

export const STATUS_TONE: Record<ReturnType<typeof resolveCodeStatus>['id'], string> = {
  active: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  exhausted: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  expired: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  passive: 'bg-muted text-muted-foreground',
}
