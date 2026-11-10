import { supabase } from '../supabase'
import { findAdminUserIdsByUsername } from '../userService/adminDirectory'
import { sanitizeSearchTerm } from './shared.utils'

function mapIdRows(data: any[] | null) {
  return (data || [])
    .map((row: any) => row.id as string | undefined)
    .filter((id): id is string => Boolean(id))
}

export async function findUserIdsByUsernameSearch(search: string) {
  try {
    return await findAdminUserIdsByUsername(search, 200)
  } catch (error) {
    console.error('[adminService] findUserIdsByUsernameSearch error', error)
    return [] as string[]
  }
}

export async function findFansubIdsBySearch(search: string) {
  const safeSearch = sanitizeSearchTerm(search)
  if (!safeSearch) return [] as string[]

  const { data, error } = await supabase
    .from('fansubs')
    .select('id')
    .or(`name.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%`)
    .limit(200)

  if (error) {
    console.error('[adminService] findFansubIdsBySearch error', error)
    return [] as string[]
  }

  return mapIdRows(data)
}

export async function findStoreItemIdsBySearch(search: string) {
  const safeSearch = sanitizeSearchTerm(search)
  if (!safeSearch) return [] as string[]

  const { data, error } = await supabase
    .from('store_items')
    .select('id')
    .or(`name.ilike.%${safeSearch}%,identifier.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`)
    .limit(200)

  if (error) {
    console.error('[adminService] findStoreItemIdsBySearch error', error)
    return [] as string[]
  }

  return mapIdRows(data)
}
