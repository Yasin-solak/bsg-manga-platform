import { z } from 'zod'
import {
  FANSUB_DESCRIPTION_MAX_LENGTH,
  createOptionalTrimmedStringPreprocessor,
  FANSUB_NAME_MAX_LENGTH,
  FANSUB_NAME_MIN_LENGTH,
  FANSUB_SLUG_MAX_LENGTH,
  FANSUB_SLUG_MIN_LENGTH,
  FANSUB_SLUG_PATTERN,
  getHexColorPattern,
  normalizeOptionalStringArray,
  RESERVED_FANSUB_SLUGS,
} from './shared.utils'

const optionalTrimmedString = (maxLength: number) => {
  const { emptyToUndefined } = createOptionalTrimmedStringPreprocessor(maxLength)
  return z.preprocess(emptyToUndefined, z.string().max(maxLength).optional())
}

const optionalStringArray = (maxItems: number, maxItemLength: number) =>
  z.preprocess(
    normalizeOptionalStringArray,
    z.array(z.string().max(maxItemLength)).max(maxItems).optional(),
  )

export const createFansubRequestSchema = z.object({
  requesterUserId: z.string().uuid('Kullanici bilgisi gecersiz.'),
  name: z.string()
    .trim()
    .min(FANSUB_NAME_MIN_LENGTH, `Fansub adi en az ${FANSUB_NAME_MIN_LENGTH} karakter olmali.`)
    .max(FANSUB_NAME_MAX_LENGTH, `Fansub adi en fazla ${FANSUB_NAME_MAX_LENGTH} karakter olabilir.`),
  description: z.string().trim().max(FANSUB_DESCRIPTION_MAX_LENGTH, `Aciklama en fazla ${FANSUB_DESCRIPTION_MAX_LENGTH} karakter olabilir.`).optional(),
  primaryColor: z.string().trim().regex(getHexColorPattern(), 'Ana renk hex formatinda olmali.').optional(),
  secondaryColor: z.string().trim().regex(getHexColorPattern(), 'Ikinci renk hex formatinda olmali.').optional(),
  requestMeta: z.object({
    contactEmail: z.preprocess(
      createOptionalTrimmedStringPreprocessor(320).emptyToUndefined,
      z.string().email('Iletisim e-postasi gecersiz.').optional(),
    ),
    contactDiscord: optionalTrimmedString(80),
    contactTelegram: optionalTrimmedString(80),
    teamSize: z.preprocess(
      (value) => (value == null || value === '' ? undefined : Number(value)),
      z.number().int().min(1).max(200).optional(),
    ),
    experienceLevel: z.preprocess(
      createOptionalTrimmedStringPreprocessor(32).emptyToUndefined,
      z.enum(['new', 'intermediate', 'experienced']).optional(),
    ),
    sourceLanguages: optionalStringArray(6, 40),
    targetLanguage: optionalTrimmedString(40),
    focusGenres: optionalStringArray(12, 40),
    weeklyReleaseGoal: z.preprocess(
      (value) => (value == null || value === '' ? undefined : Number(value)),
      z.number().int().min(1).max(100).optional(),
    ),
    contentTypes: optionalStringArray(6, 40),
    releaseDays: optionalStringArray(7, 16),
    operatingTimezone: optionalTrimmedString(80),
    recruitmentOpen: z.boolean().optional(),
    recruitmentRoles: optionalTrimmedString(240),
    teamRolesNeeded: optionalStringArray(12, 60),
    communicationHours: optionalTrimmedString(120),
    sampleWorkUrl: z.preprocess(
      createOptionalTrimmedStringPreprocessor(2048).emptyToUndefined,
      z.string().url('Ornek calisma baglantisi gecersiz.').optional(),
    ),
    websiteUrl: z.preprocess(
      createOptionalTrimmedStringPreprocessor(2048).emptyToUndefined,
      z.string().url('Website baglantisi gecersiz.').optional(),
    ),
    portfolioNotes: optionalTrimmedString(1000),
    motivation: optionalTrimmedString(1000),
    spoilerPolicy: optionalTrimmedString(240),
    ageRatingPolicy: z.preprocess(
      createOptionalTrimmedStringPreprocessor(16).emptyToUndefined,
      z.enum(['all', 'teen', 'mature']).optional(),
    ),
    qualityChecklist: optionalTrimmedString(1000),
    moderationPolicy: optionalTrimmedString(1000),
    dmcaAccepted: z.boolean().optional(),
    dmcaAcceptedAt: z.preprocess(
      createOptionalTrimmedStringPreprocessor(64).emptyToUndefined,
      z.string().datetime('DMCA onay zamani gecersiz.').optional(),
    ),
  }).optional(),
})

export const fansubNameSchema = z.string()
  .trim()
  .min(FANSUB_NAME_MIN_LENGTH, `Fansub adi en az ${FANSUB_NAME_MIN_LENGTH} karakter olmali.`)
  .max(FANSUB_NAME_MAX_LENGTH, `Fansub adi en fazla ${FANSUB_NAME_MAX_LENGTH} karakter olabilir.`)

export const fansubSlugSchema = z.string()
  .trim()
  .toLowerCase()
  .min(FANSUB_SLUG_MIN_LENGTH, `Fansub slug en az ${FANSUB_SLUG_MIN_LENGTH} karakter olmali.`)
  .max(FANSUB_SLUG_MAX_LENGTH, `Fansub slug en fazla ${FANSUB_SLUG_MAX_LENGTH} karakter olabilir.`)
  .regex(FANSUB_SLUG_PATTERN, 'Fansub slug yalnizca kucuk harf, rakam ve tire icerebilir.')
  .refine(
    (value) => !RESERVED_FANSUB_SLUGS.includes(value as (typeof RESERVED_FANSUB_SLUGS)[number]),
    'Bu slug ayrilmis bir rota tarafindan kullaniliyor.',
  )
