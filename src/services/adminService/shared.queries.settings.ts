import { supabase } from '../supabase'
import { isAbortError } from '../supabaseError'
import { DEFAULT_SETTINGS } from './shared.constants'
import type { DbSiteSettings } from './shared.db'
import { mapDbSiteSettings } from './shared.mappers'
import type { SiteSettings } from './types'

export async function fetchSiteSettingsRow(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .select(`
      id,
      site_title,
      site_description,
      contact_email,
      maintenance_mode,
      registration_enabled,
      discord_invite_url,
      logo_url,
      store_home_config
    `)
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    if (!isAbortError(error)) {
      console.error('[adminService] getSiteSettings error', error)
    }
    return DEFAULT_SETTINGS
  }

  if (!data) return DEFAULT_SETTINGS
  return mapDbSiteSettings(data as DbSiteSettings)
}
