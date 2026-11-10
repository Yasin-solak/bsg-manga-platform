import { txa } from '@/i18n/activeLocale'
export const INVITE_DURATIONS = [[3600, '1 saat'], [86400, '1 gün'], [604800, '7 gün'], [2592000, '30 gün'], [0, 'Süresiz']] as const
export const INVITE_STATUS = { get active() { return txa('Açık') }, get suspended() { return txa('Oluşturanın erişimi kapalı') }, get revoked() { return txa('İptal edildi') }, get expired() { return txa('Süresi doldu') }, get exhausted() { return txa('Kullanım sınırı doldu') } } as const
export const INVITE_FAILURE = { get unavailable() { return txa('Bu davet kullanılamıyor. Sunucudan yeni bir bağlantı iste.') }, get revoked() { return txa('Bu davet iptal edilmiş.') }, get expired() { return txa('Bu davetin süresi dolmuş.') }, get exhausted() { return txa('Bu davetin kullanım sınırı dolmuş.') }, get banned() { return txa('Bu sunucuya katılımın engellenmiş.') } } as const
export function createInviteToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
}
export function communityInvitePath(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error(txa('Davet bağlantısı geçersiz.'))
  return `/topluluk?davet=${token}`
}
