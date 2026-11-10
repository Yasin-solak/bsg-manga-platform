import { z } from 'zod'
import { supabase } from './supabase'
import { withServiceTimeout } from './apiResilience'
import { txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

const pendingKey = 'bsg-discord-link-pending'
const pendingSchema = z.object({ userId: z.string().uuid(), startedAt: z.number() })
export type LinkedAccountState = { userId: string; discord: { name: string } | null }
export async function readLinkedAccountState(): Promise<LinkedAccountState> {
  const { data, error } = await withServiceTimeout(() => supabase.auth.getUser(), { label: 'Bağlı hesaplar', timeoutMs: 12000 })
  if (error || !data.user) throw new Error(txa('Hesap bağlantılarını görmek için tekrar giriş yapmalısın.'))
  const identity = data.user.identities?.find(item => item.provider === 'discord')
  const rawName = identity?.identity_data?.full_name || identity?.identity_data?.name || identity?.identity_data?.user_name
  return { userId: data.user.id, discord: identity ? { name: typeof rawName === 'string' ? rawName.slice(0, 100) : txa('Discord hesabı') } : null }
}

export function discordLinkError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : ''
  if (code === 'manual_linking_disabled') return txa('Hesap bağlama henüz sunucuda etkin değil. Biraz sonra tekrar deneyebilirsin.')
  if (code === 'identity_already_exists') return txa('Bu Discord hesabı başka bir BSG hesabına bağlı. Hesaplar otomatik birleştirilmez.')
  return txa('Discord bağlantısı tamamlanamadı. Mevcut hesabın korunuyor; tekrar deneyebilirsin.')
}

export async function beginDiscordLink(expectedUserId: string) {
  z.string().uuid().parse(expectedUserId)
  const state = await readLinkedAccountState()
  if (state.userId !== expectedUserId) throw new Error(txa('Aktif hesap değişti. Sayfayı yenileyip tekrar dene.'))
  if (state.discord) throw new Error(txa('Bu hesabın zaten Discord’a bağlı.'))
  try {
    const { data, error } = await withServiceTimeout(() => supabase.auth.linkIdentity({
      provider: 'discord', options: { redirectTo: `${window.location.origin}${localizeHref('/', getActiveLocale())}`, skipBrowserRedirect: true },
    }), { label: txa('Discord hesabını bağlama'), timeoutMs: 12000 })
    if (error) throw new Error(discordLinkError(error))
    if (!data.url) throw new Error(txa('Discord yönlendirmesi oluşturulamadı.'))
    if ((await readLinkedAccountState()).userId !== state.userId) throw new Error(txa('Aktif hesap değişti. Sayfayı yenileyip tekrar dene.'))
    // A late request cannot redirect by itself; a record is created only after a successful response.
    window.sessionStorage.setItem(pendingKey, JSON.stringify({ userId: state.userId, startedAt: Date.now() }))
    window.location.assign(data.url)
  } catch (error) { clearPendingDiscordLink(); throw error }
}

export function readPendingDiscordLink() {
  try {
    const raw = window.sessionStorage.getItem(pendingKey)
    if (!raw) return null
    const result = pendingSchema.safeParse(JSON.parse(raw))
    if (!result.success || Date.now() - result.data.startedAt > 15 * 60_000 || result.data.startedAt > Date.now()) { clearPendingDiscordLink(); return null }
    return result.data
  } catch { return null }
}
export function clearPendingDiscordLink() {
  try { window.sessionStorage.removeItem(pendingKey) } catch { /* Depolama engeli giriş oturumunu değiştirmez. */ }
}
