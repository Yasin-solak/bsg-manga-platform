import { StudioBusyError, StudioCodedError } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

/*
 * Cause of AI / studio errors and what to do. Server codes
 * (functions/_shared/translation-ai.js, translation-http.js) match the keys here.
 */

export interface StudioErrorInfo {
  code: string
  /** Short reason (grouping title). */
  title: string
  /** Kullanici ne yapmali. */
  hint: string
  /** "Tekrar dene" ise yarar mi. */
  retryable: boolean
}

const INFO: Record<string, Omit<StudioErrorInfo, 'code'>> = {
  content_blocked: {
    get title() { return txa('İçerik politikası nedeniyle işlenmedi') },
    get hint() { return txa('Yapay zekâ bu sayfayı güvenlik kuralları nedeniyle işlemedi. Tekrar denemek işe yaramaz; alanları editörde elle çizip metni kendin gir.') },
    retryable: false,
  },
  ai_disabled_mature: {
    get title() { return txa('+18 seri: yapay zekâ kapalı') },
    get hint() { return txa('Yetişkin serilerde sayfalar yapay zekâya gönderilmez. Alanları ve metinleri editörde elle girebilirsin.') },
    retryable: false,
  },
  daily_limit: {
    get title() { return txa('Günlük yapay zekâ hakkı doldu') },
    get hint() { return txa('Ekibin bugünkü sayfa hakkı bitti; gece yarısı yenilenir. Bu arada alanları editörde elle ekleyip çevirebilirsin.') },
    retryable: false,
  },
  provider_busy: {
    get title() { return txa('Yapay zekâ servisi yoğun') },
    get hint() { return txa('Dakikalık kullanım sınırına takıldı. Birkaç dakika sonra "Tekrar dene".') },
    retryable: true,
  },
  quota_exhausted: {
    get title() { return txa('Yapay zekâ kotası doldu') },
    get hint() { return txa('Servisin günlük kotası ya da bakiyesi bitti. Ekip yöneticisine haber ver; bu arada elle devam edebilirsin.') },
    retryable: false,
  },
  provider_auth: {
    get title() { return txa('Yapay zekâ servisi yapılandırma hatası') },
    get hint() { return txa('Servis anahtarı geçersiz ya da yetkisiz. Site yöneticisine bildir.') },
    retryable: false,
  },
  not_configured: {
    get title() { return txa('Yapay zekâ servisi yapılandırılmamış') },
    get hint() { return txa('Site yöneticisine bildir; bu arada elle devam edebilirsin.') },
    retryable: false,
  },
  timeout: { get title() { return txa('Zaman aşımı') }, get hint() { return txa('Servis geç yanıt verdi. "Tekrar dene".') }, retryable: true },
  network: { get title() { return txa('Bağlantı hatası') }, get hint() { return txa('Servise ulaşılamadı. İnternet bağlantını kontrol edip "Tekrar dene".') }, retryable: true },
  truncated: { get title() { return txa('Yanıt yarıda kesildi') }, get hint() { return txa('Sayfa çok kalabalık olabilir. "Tekrar dene"; sürerse eksik alanları elle ekle.') }, retryable: true },
  invalid_response: { get title() { return txa('Geçersiz yanıt') }, get hint() { return txa('Servis bozuk veri döndürdü. "Tekrar dene".') }, retryable: true },
  empty: { get title() { return txa('Boş yanıt') }, get hint() { return txa('Servis sonuç döndürmedi. "Tekrar dene"; sürerse elle devam et.') }, retryable: true },
  provider_error: { get title() { return txa('Servis hatası') }, get hint() { return txa('Yapay zekâ servisi hata verdi. Biraz sonra "Tekrar dene".') }, retryable: true },
}

export function describeStudioError(error: unknown, fallback = 'İşlem başarısız.'): StudioErrorInfo {
  if (error instanceof StudioBusyError) return { code: 'provider_busy', ...INFO.provider_busy }
  const code = error instanceof StudioCodedError ? error.code : null
  if (code && INFO[code]) return { code, ...INFO[code] }
  return { code: 'unknown', title: toUserFacingErrorMessage(error, fallback), hint: txa('Tekrar deneyebilirsin; sürerse site yöneticisine bildir.'), retryable: true }
}
