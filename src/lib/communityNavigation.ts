import { txa } from '@/i18n/activeLocale'
/** If the specified target does not exist, opening the first room would take the user to the wrong chat. */
export function resolveCommunityTarget<T extends { id: string }>(items: T[], requested: string | null, fallback?: T): T | undefined {
  return requested ? items.find(item => item.id === requested) : fallback || items[0]
}
export function communityChannelPath(serverId: string, channelId: string) {
  return `/topluluk?${new URLSearchParams({ sunucu: serverId, kanal: channelId })}`
}
export const channelReadOnlyText = {
  get archived() { return txa('Bu kanal arşivlendi. Geçmiş korunur; yeni mesaj gönderilemez ve mesajlar düzenlenemez.') },
  get series_unavailable() { return txa('Bağlı seri yayında değil. Sohbet geçmişi korunuyor; kanal şimdilik salt okunur.') },
  get fansub_unlinked() { return txa('Fansubun bu seride yayımlanmış bölümü kalmadı. Sohbet geçmişi korunuyor; kanal şimdilik salt okunur.') },
} as const
