import { withServiceTimeout } from '../apiResilience'
import { resolveSafeAssetUrl } from '../assetUrlService'
import { supabase } from '../supabase'
import { notificationIdSchema } from './centerModel'
import type { Notification } from './types'
import { txa } from '@/i18n/activeLocale'

type ImageField = { table: 'mangas' | 'fansubs' | 'users'; foreignKeys: string[]; imageKey: string; column: string }
const IMAGE_FIELDS: ImageField[] = [
  { table: 'mangas', foreignKeys: ['manga_id'], imageKey: 'manga_cover', column: 'cover_image_url' },
  { table: 'fansubs', foreignKeys: ['fansub_id'], imageKey: 'fansub_avatar', column: 'avatar_url' },
  { table: 'users', foreignKeys: ['actor_user_id', 'sender_user_id', 'invited_by', 'requester_id', 'transferred_by'], imageKey: 'actor_avatar', column: 'avatar_url' },
]

function readForeignId(row: Notification, keys: string[]) {
  for (const key of keys) {
    const result = notificationIdSchema.safeParse(row.data?.[key])
    if (result.success) return result.data
  }
  return null
}

/** Only the current page's missing images are completed, with three bulk RLS-scoped queries. */
export async function enrichNotificationPage(rows: Notification[], signal?: AbortSignal): Promise<Notification[]> {
  const result = rows.map(row => ({ ...row, data: { ...row.data } }))
  await Promise.all(IMAGE_FIELDS.map(async field => {
    const pending = result.filter(row => !row.data[field.imageKey])
    const ids = [...new Set(pending.map(row => readForeignId(row, field.foreignKeys)).filter((id): id is string => Boolean(id)))]
    if (!ids.length) return
    try {
      const { data, error } = await withServiceTimeout(requestSignal => {
        let query = supabase.from(field.table).select(`id,${field.column}`).in('id', ids).limit(50)
        if (field.table === 'mangas') query = query.eq('is_active', true).eq('is_approved', true)
        return query.abortSignal(requestSignal)
      }, { signal, label: txa('Bildirim görselleri') })
      if (error) return
      const images = new Map<string, string>()
      for (const image of (data || []) as unknown as Record<string, unknown>[]) {
        const url = typeof image[field.column] === 'string' ? resolveSafeAssetUrl(image[field.column] as string) : undefined
        if (typeof image.id === 'string' && url) images.set(image.id, url)
      }
      for (const row of pending) {
        const id = readForeignId(row, field.foreignKeys)
        if (id && images.has(id)) row.data[field.imageKey] = images.get(id)
      }
    } catch (error) {
      if (signal?.aborted) throw error
      // Bir görselin erişilememesi okuma geçmişini kullanılamaz hale getirmemeli.
    }
  }))
  return result
}
