import { z } from 'zod'

import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { createAdminDashboardAnalyticsMock } from '@/testing/adminDashboardAnalyticsMock'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'

const adminDashboardPeriodSchema = z.enum(['7d', '30d', 'month'])
const adminDashboardMetricKeySchema = z.enum([
  'users',
  'mangas',
  'community',
  'fansubs',
  'backlog',
  'operations',
])

const nullableFiniteNumberSchema = z.number().finite().nullable()
const nullableCountSchema = z.number().finite().nonnegative().nullable()
const nullablePercentageSchema = z.number().finite().min(0).max(100).nullable()
const timestampSchema = z.string().datetime({ offset: true })

const adminDashboardSnapshotSchema = z.object({
  period: z.object({
    key: adminDashboardPeriodSchema,
    timezone: z.literal('Europe/Istanbul'),
    currentStart: timestampSchema,
    currentEnd: timestampSchema,
    previousStart: timestampSchema,
    previousEnd: timestampSchema,
    dayCount: z.number().int().min(1).max(31),
    comparisonBasis: z.literal('arrivals'),
  }).strict(),
  generatedAt: timestampSchema,
  metrics: z.array(z.object({
    key: adminDashboardMetricKeySchema,
    label: z.string().min(1),
    total: nullableCountSchema,
    currentPeriod: nullableCountSchema,
    previousPeriod: nullableCountSchema,
    delta: nullableFiniteNumberSchema,
    deltaPercent: nullableFiniteNumberSchema,
    unit: z.enum(['count', 'percent']),
    trendPolarity: z.enum(['higher_is_better', 'lower_is_better', 'neutral']),
    comparisonBasis: z.enum(['created', 'arrivals', 'quality_average']),
  }).strict()).length(6),
  queues: z.array(z.object({
    key: z.enum(['approval', 'community', 'reports', 'legal']),
    label: z.string().min(1),
    status: z.enum(['available', 'disabled', 'unavailable']),
    currentTotal: nullableCountSchema,
    currentPeriodArrivals: nullableCountSchema,
    previousPeriodArrivals: nullableCountSchema,
    oldestQueuedAt: timestampSchema.nullable(),
  }).strict()).length(4),
  quality: z.array(z.object({
    key: z.enum([
      'moderation_completion',
      'community_approval',
      'report_closure',
      'legal_closure',
    ]),
    label: z.string().min(1),
    status: z.enum(['available', 'disabled', 'unavailable']),
    numerator: nullableCountSchema,
    denominator: nullableCountSchema,
    rate: nullablePercentageSchema,
    previousNumerator: nullableCountSchema,
    previousDenominator: nullableCountSchema,
    previousRate: nullablePercentageSchema,
    deltaPoints: nullableFiniteNumberSchema,
    disclosure: z.string().min(1),
  }).strict()).length(4),
  operationHealth: z.object({
    status: z.enum(['available', 'partial', 'unavailable']),
    score: nullablePercentageSchema,
    previousScore: nullablePercentageSchema,
    availableMetricCount: z.number().int().nonnegative(),
    totalMetricCount: z.number().int().nonnegative(),
    source: z.literal('quality_average'),
    disclosure: z.string().min(1),
  }).strict(),
  series: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    users: nullableCountSchema,
    mangas: nullableCountSchema,
    community: nullableCountSchema,
    fansubs: nullableCountSchema,
    backlogArrivals: nullableCountSchema,
    backlogOpenFromArrivals: nullableCountSchema,
  }).strict()).min(1).max(31),
  partialFailures: z.array(z.object({
    section: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }).strict()),
}).strict().superRefine((snapshot, context) => {
  const hasUniqueKeys = (items: Array<{ key: string }>) => (
    new Set(items.map((item) => item.key)).size === items.length
  )

  if (!hasUniqueKeys(snapshot.metrics)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'Metrik anahtarlari benzersiz olmali.' })
  }
  if (!hasUniqueKeys(snapshot.queues)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Kuyruk anahtarlari benzersiz olmali.' })
  }
  if (!hasUniqueKeys(snapshot.quality)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['quality'], message: 'Kalite anahtarlari benzersiz olmali.' })
  }
  if (snapshot.series.length !== snapshot.period.dayCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['series'], message: 'Seri gun sayisi donemle ayni olmali.' })
  }
  if (snapshot.operationHealth.availableMetricCount > snapshot.operationHealth.totalMetricCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['operationHealth'], message: 'Kullanilabilir kalite sayisi toplamdan buyuk olamaz.' })
  }
})

export type AdminDashboardPeriod = z.infer<typeof adminDashboardPeriodSchema>
export type AdminDashboardMetricKey = z.infer<typeof adminDashboardMetricKeySchema>
export type AdminDashboardSnapshot = z.infer<typeof adminDashboardSnapshotSchema>

function parseSnapshot(payload: unknown, expectedPeriod: AdminDashboardPeriod) {
  const result = adminDashboardSnapshotSchema.safeParse(payload)
  if (!result.success) {
    throw new Error('Dashboard analytics yaniti beklenen sozlesmeyle uyusmuyor.')
  }
  if (result.data.period.key !== expectedPeriod) {
    throw new Error('Dashboard analytics yaniti istenen donemle uyusmuyor.')
  }
  return result.data
}

export async function getAdminDashboardSnapshot(
  period: AdminDashboardPeriod,
): Promise<AdminDashboardSnapshot> {
  const safePeriod = adminDashboardPeriodSchema.parse(period)

  if (isE2EModeEnabled()) {
    return parseSnapshot(createAdminDashboardAnalyticsMock(safePeriod), safePeriod)
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_dashboard_snapshot', { p_period: safePeriod }),
      signal,
    ),
    { label: 'adminService.getAdminDashboardSnapshot' },
  )

  if (error) {
    throw error
  }

  return parseSnapshot(data, safePeriod)
}
