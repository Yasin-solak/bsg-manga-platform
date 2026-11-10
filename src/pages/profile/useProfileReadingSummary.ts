import { useEffect, useState } from 'react'
import { z } from 'zod'
import { supabase } from '@/services/supabase'
import { createScopedLogger } from '@/services/logger'

const logger = createScopedLogger('profile.readingSummary')

const summarySchema = z.object({
  monthly: z.array(z.object({ month: z.string(), chapters: z.coerce.number() })),
  activeDays: z.coerce.number(),
  longestStreak: z.coerce.number(),
  currentStreak: z.coerce.number(),
  seriesRead: z.coerce.number(),
  chaptersRead: z.coerce.number(),
  lastReadAt: z.string().nullable(),
  // v3 rhythm data (empty if absent in an old server response).
  daily: z.array(z.object({ day: z.string(), chapters: z.coerce.number() })).default([]),
  hourly: z.array(z.coerce.number()).default([]),
  weekdays: z.array(z.coerce.number()).default([]),
  topSeries: z.array(z.object({
    id: z.string(),
    slug: z.string().nullable().optional(),
    title: z.string(),
    coverImage: z.string().nullable().optional(),
    chapters: z.coerce.number(),
    lastChapterNumber: z.coerce.number().nullable().optional(),
  })).default([]),
})

export type ProfileReadingSummary = z.infer<typeof summarySchema>

/**
 * Statistics tab reading summary (get_profile_reading_summary): monthly chapters, active days,
 * reading streak, daily heatmap, hour / day rhythm and most read series. The server respects the profile's stats privacy; null if private.
 */
export function useProfileReadingSummary(userId: string | undefined, enabled: boolean) {
  const [summary, setSummary] = useState<ProfileReadingSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId || !enabled) {
      setSummary(null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const { data, error } = await supabase.rpc('get_profile_reading_summary', { p_user_id: userId })
      if (cancelled) return
      setLoading(false)
      if (error) {
        logger.warn('okuma ozeti okunamadi', { error })
        return
      }
      const parsed = data ? summarySchema.safeParse(data) : null
      setSummary(parsed?.success ? parsed.data : null)
    })()
    return () => { cancelled = true }
  }, [enabled, userId])

  return { summary, loading }
}
