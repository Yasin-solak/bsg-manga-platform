import { z } from 'zod'
import { getCurrentUserIdentity } from '../userService/selfIdentity'
import type {
  CreateLegalRequestInput,
  LegalRequest,
  LegalRequestPriority,
  LegalRequestStatus,
  LegalRequestType,
  LegalRequestValidationErrors,
} from './types'
import { LegalRequestValidationError } from './types'
import { txa } from '@/i18n/activeLocale'

const urlLineSchema = z.string().trim().min(1).refine(
  (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
  'Baglantilar / ile baslamali ya da tam URL olmalidir.',
)

export const legalRequestTypeOptions: Array<{ value: LegalRequestType; label: string; description: string }> = [
  {
    value: 'dmca',
    get label() { return txa('DMCA bildirimi') },
    get description() { return txa('ABD eksenli telif kaldırma bildirimi ve resmi beyan akışı.') },
  },
  {
    value: 'copyright',
    get label() { return txa('Telif ihlali') },
    get description() { return txa('Genel telif ve yetkisiz kullanım bildirimleri.') },
  },
  {
    value: 'trademark',
    get label() { return txa('Marka / taklit') },
    get description() { return txa('Marka ihlali, taklit ekip ve yanlış temsil talepleri.') },
  },
  {
    value: 'impersonation',
    get label() { return txa('Yanlış temsil') },
    get description() { return txa('Kişi, ekip veya kurum adına sahte temsil bildirimleri.') },
  },
]

export const legalRequestStatusOptions: Array<{ value: LegalRequestStatus; label: string }> = [
  { value: 'new', get label() { return txa('Yeni') } },
  { value: 'needs_info', get label() { return txa('Ek bilgi bekliyor') } },
  { value: 'under_review', get label() { return txa('İncelemede') } },
  { value: 'actioned', get label() { return txa('İşlem uygulandı') } },
  { value: 'rejected', get label() { return txa('Reddedildi') } },
]

export const legalRequestSchema = z.object({
  requestType: z.enum(['dmca', 'copyright', 'trademark', 'impersonation']),
  fullName: z.string().trim().min(2, 'Ad soyad zorunludur.').max(120, 'Ad soyad çok uzun.'),
  organizationName: z.string().trim().max(160, 'Kurum adı çok uzun.').optional().or(z.literal('')),
  email: z.string().trim().email('Geçerli bir e-posta girin.').max(160, 'E-posta çok uzun.'),
  claimantRole: z.string().trim().max(120, 'Rol bilgisi çok uzun.').optional().or(z.literal('')),
  subject: z.string().trim().min(6, 'Konu en az 6 karakter olmalıdır.').max(180, 'Konu çok uzun.'),
  description: z.string().trim().min(20, 'Açıklama en az 20 karakter olmalıdır.').max(4000, 'Açıklama çok uzun.'),
  targetUrls: z.array(urlLineSchema).min(1, 'En az bir hedef bağlantısı eklemelisiniz.').max(12, 'En fazla 12 bağlantı ekleyebilirsiniz.'),
  evidence: z.array(z.string().trim().max(400).min(1)).max(12, 'En fazla 12 ek kanıt satırı ekleyebilirsiniz.').optional(),
  electronicSignature: z.string().trim().min(2, 'Elektronik imza zorunludur.').max(120, 'Elektronik imza çok uzun.'),
  attestationGoodFaith: z.literal(true, {
    errorMap: () => ({ get message() { return txa('İyi niyet beyanını kabul etmelisiniz.') } }),
  }),
  attestationAuthority: z.literal(true, {
    errorMap: () => ({ get message() { return txa('Yetki beyanını kabul etmelisiniz.') } }),
  }),
  attestationAccuracy: z.literal(true, {
    errorMap: () => ({ get message() { return txa('Doğruluk beyanını kabul etmelisiniz.') } }),
  }),
})

type LegalRequestRow = Omit<LegalRequest, 'target_urls' | 'evidence'> & {
  target_urls: unknown
  evidence: unknown
}

export function legalRequestTypeLabel(value: LegalRequestType) {
  return legalRequestTypeOptions.find((option) => option.value === value)?.label || value
}

export function legalRequestStatusLabel(value: LegalRequestStatus) {
  return legalRequestStatusOptions.find((option) => option.value === value)?.label || value
}

export function legalRequestPriorityLabel(value: LegalRequestPriority) {
  return value === 'high' ? txa('Yüksek') : txa('Normal')
}

export function legalRequestPriorityForType(value: LegalRequestType): LegalRequestPriority {
  return value === 'dmca' || value === 'trademark' ? 'high' : 'normal'
}

export function legalRequestStatusVariant(value: LegalRequestStatus): 'default' | 'secondary' | 'destructive' {
  if (value === 'actioned') return 'default'
  if (value === 'rejected') return 'destructive'
  return 'secondary'
}

export function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function mapLegalRequestRow(row: LegalRequestRow): LegalRequest {
  return {
    ...row,
    target_urls: toStringArray(row.target_urls),
    evidence: toStringArray(row.evidence),
  }
}

export async function resolveCurrentSubmitterUserId() {
  const identity = await getCurrentUserIdentity()
  return identity?.id ?? null
}

export function sanitizeCreateLegalRequestInput(input: CreateLegalRequestInput) {
  const result = legalRequestSchema.safeParse({
    requestType: input.requestType,
    fullName: input.fullName,
    organizationName: input.organizationName || '',
    email: input.email,
    claimantRole: input.claimantRole || '',
    subject: input.subject,
    description: input.description,
    targetUrls: input.targetUrls,
    evidence: input.evidence || [],
    electronicSignature: input.electronicSignature,
    attestationGoodFaith: input.attestationGoodFaith,
    attestationAuthority: input.attestationAuthority,
    attestationAccuracy: input.attestationAccuracy,
  })

  if (!result.success) {
    const fieldErrors: LegalRequestValidationErrors = {}
    for (const issue of result.error.issues) {
      const rootKey = issue.path[0]
      if (typeof rootKey !== 'string') continue
      if (rootKey in fieldErrors) continue
      fieldErrors[rootKey as keyof LegalRequestValidationErrors] = txa(issue.message)
    }
    throw new LegalRequestValidationError(fieldErrors)
  }

  return result.data
}

export function isLegalRequestValidationError(error: unknown): error is LegalRequestValidationError {
  return error instanceof LegalRequestValidationError
}
