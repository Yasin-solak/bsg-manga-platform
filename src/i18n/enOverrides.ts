import { setEnOverrides } from './activeLocale'

/*
 * English text entered by admins in the panel (i18n_text_overrides). The latest copy stays
 * in the browser: startup does not wait and it refreshes in the background. With no copy there is a
 * short wait; if it is too slow, the app opens with the dictionary and Turkish text, and it arrives on the next navigation.
 */
const CACHE_KEY = 'bsg:i18n-overrides:v1'
const FIRST_LOAD_WAIT_MS = 1200

function readCache(): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null
  } catch {
    return null
  }
}

async function fetchOverrides() {
  const { supabase } = await import('@/services/supabase')
  const { data, error } = await supabase.from('i18n_text_overrides').select('source_text, en_text').limit(5000)
  if (error || !Array.isArray(data)) return
  const next: Record<string, string> = {}
  for (const row of data) {
    if (typeof row.source_text === 'string' && typeof row.en_text === 'string') next[row.source_text] = row.en_text
  }
  setEnOverrides(next)
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next))
  } catch {
    // Depolama kapaliysa her acilista agdan gelir.
  }
}

export async function loadEnOverrides() {
  const cached = readCache()
  if (cached) setEnOverrides(cached)
  const refresh = fetchOverrides().catch(() => undefined)
  if (cached) return
  await Promise.race([refresh, new Promise((resolve) => setTimeout(resolve, FIRST_LOAD_WAIT_MS))])
}
