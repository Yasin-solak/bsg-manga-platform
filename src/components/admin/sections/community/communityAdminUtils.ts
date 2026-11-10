import type { CommunityAdminServer } from '@/services/communityAdminService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const KIND_LABEL: Record<'fansub' | 'room', string> = { get fansub() { return txa('Fansub sunucusu') }, get room() { return txa('Oda') } }

export const JOIN_MODE_LABEL: Record<'open' | 'invite' | 'request', string> = {
  get open() { return txa('Herkes katılabilir') },
  get invite() { return txa('Davetle katılım') },
  get request() { return txa('Başvuruyla katılım') },
}

export const MEMBER_STATE_LABEL: Record<string, string> = {
  get active() { return txa('Aktif') },
  get banned() { return txa('Yasaklı') },
  get left() { return txa('Ayrıldı') },
}

/** Same labels as the server's own action history screen (AuditPanel). */
const AUDIT_LABELS: Record<string, string> = {
  get 'room.created'() { return txa('Oda oluşturuldu') },
  get 'room.save_profile'() { return txa('Sunucu profili güncellendi') },
  get 'room.save_join_mode'() { return txa('Katılım şekli değişti') },
  get 'room.offer_transfer'() { return txa('Sahiplik devri önerildi') },
  get 'room.accept_transfer'() { return txa('Sahiplik devredildi') },
  get 'room.cancel_transfer'() { return txa('Devir iptal edildi') },
  get 'room.archive'() { return txa('Arşiv durumu değişti') },
  get 'room.decide_request'() { return txa('Katılım başvurusu kararı') },
  get 'invite.create'() { return txa('Davet oluşturuldu') },
  get 'invite.revoke'() { return txa('Davet iptal edildi') },
  get 'invite.join'() { return txa('Davetle katıldı') },
  get 'report.resolved'() { return txa('Şikâyet sonuçlandırıldı') },
  get 'report.dismissed'() { return txa('Şikâyet gerekçesiz bulundu') },
  get 'message.pin'() { return txa('Mesaj sabitlendi') },
  get 'message.unpin'() { return txa('Mesaj sabitlemesi kaldırıldı') },
  save_role: 'Rol kaydedildi',
  delete_role: 'Rol silindi',
  get assign_roles() { return txa('Üye rolleri güncellendi') },
  get save_channel() { return txa('Kanal kaydedildi') },
  get archive_channel() { return txa('Kanal arşiv durumu değişti') },
  get 'server.manual'() { return txa('Sunucu açıldı') },
  get 'server.automatic'() { return txa('Sunucu otomatik açıldı') },
  get 'member.timeout'() { return txa('Yazma kısıtlaması değişti') },
  get 'member.kick'() { return txa('Üye çıkarıldı') },
  get 'member.ban'() { return txa('Üye yasaklandı') },
  get 'member.unban'() { return txa('Üye yasağı kaldırıldı') },
  get delete_message() { return txa('Mesaj silindi') },
}

export function auditLabel(entry: CommunityAdminServer['audit'][number]) {
  const base = AUDIT_LABELS[entry.action] ?? entry.action
  if (entry.action === 'room.archive' && typeof entry.details?.archived === 'boolean') {
    return entry.details.archived ? txa('Sunucu arşivlendi') : txa('Sunucu arşivden çıkarıldı')
  }
  if (entry.action === 'member.timeout' && entry.details?.minutes != null) {
    return Number(entry.details.minutes) ? `${base} (${formatMinutes(Number(entry.details.minutes))})` : txa('Yazma kısıtlaması kaldırıldı')
  }
  return base
}

/** Duration options: same upper limit as in-server management (10080 min = 7 days). */
export const TIMEOUT_PRESETS: Array<{ minutes: number, label: string }> = [
  { minutes: 10, get label() { return txa('10 dakika') } },
  { minutes: 60, get label() { return txa('1 saat') } },
  { minutes: 1440, get label() { return txa('1 gün') } },
  { minutes: 10080, get label() { return txa('1 hafta') } },
]

export function formatMinutes(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) return txa('{v1} gün', { v1: minutes / 1440 })
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} saat`
  return `${minutes} dakika`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString(intlLocale())} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} MB`
}

function toTimestamp(value?: string | null) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

/** "9 Tem 2026 23:18" */
export function formatCommunityDate(value?: string | null) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  return new Date(ts).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Relative in the last 30 days ("3 hr", "12 days"), a short date when older. */
export function communityRelativeAge(value?: string | null, now = Date.now()) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  const minutes = Math.max(0, Math.floor((now - ts) / 60_000))
  if (minutes < 60) return txa('{v1} dk', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa', { v1: hours })
  const days = Math.floor(hours / 24)
  if (days <= 30) return txa('{v1} gün', { v1: days })
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(intlLocale(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Restriction end: "until 14:30" (today) or "until 3 Nov 14:30". */
export function formatUntil(value?: string | null, now = Date.now()) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  const date = new Date(ts)
  const sameDay = date.toDateString() === new Date(now).toDateString()
  const text = date.toLocaleString(intlLocale(), sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${text} kadar`
}

/** Uye kisitli mi (yazma kisitlamasi suruyor). */
export function isTimedOut(timeoutUntil?: string | null, now = Date.now()) {
  return toTimestamp(timeoutUntil) > now
}

export function initialsOf(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr-TR') || '?'
}
