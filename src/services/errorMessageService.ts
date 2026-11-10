import { txa } from '@/i18n/activeLocale'
type ErrorLike = {
    code?: string
    message?: string
    details?: string
    hint?: string
    status?: number
    error_description?: string
}

function getErrorLike(error: unknown): ErrorLike {
    if (error instanceof Error) {
        return {
            message: error.message,
        }
    }

    if (typeof error === 'object' && error !== null) {
        return error as ErrorLike
    }

    return {}
}

function normalize(value: string | undefined | null) {
    return (value || '').trim().toLowerCase()
}

function includeAny(text: string, tokens: string[]) {
    return tokens.some((token) => text.includes(token))
}

function resolveByCode(code: string, message: string, details: string) {
    switch (code) {
        case '42501':
            return 'Bu islem icin yetkiniz yok.'
        case '23505':
            if (includeAny(message + details, ['username', 'users_username', 'users_username_key'])) {
                return 'Bu kullanici adi zaten kullanimda.'
            }
            return 'Ayni kayit zaten mevcut.'
        case '23514':
            if (includeAny(message + details, ['username_not_reserved', 'reserved', 'kullanici adi'])) {
                return 'Bu kullanici adi rezerve edilmistir. Lutfen farkli bir ad secin.'
            }
            return 'Gonderilen veri kurallara uygun degil.'
        case '22P02':
            return 'Gonderilen veri formati gecersiz.'
        case '42P01':
            return 'Veritabani nesnesi bulunamadi. Migrationlarin guncel oldugunu kontrol edin.'
        case '42703':
            return 'Beklenen kolon bulunamadi. Migrationlar eksik olabilir.'
        case '42P17':
            return 'SQL ifadesinde index/fonksiyon uyumsuzlugu var (IMMUTABLE).'
        case 'PGRST116':
            return 'Kayit bulunamadi.'
        case 'PGRST202':
            return 'Beklenen RPC fonksiyonu bulunamadi. Migrationlar eksik olabilir.'
        default:
            return null
    }
}

function resolveByMessage(message: string, details: string, hint: string) {
    const combined = `${message} ${details} ${hint}`.trim()
    if (!combined) return null

    if (includeAny(combined, ['invalid login credentials'])) {
        return 'E-posta veya sifre hatali.'
    }
    if (includeAny(combined, ['mfa_verification_failed', 'verification failed'])) {
        return 'Girdiginiz 2FA kodu hatali veya suresi doldu.'
    }
    if (includeAny(combined, ['mfa_totp_enroll_not_enabled', 'totp enroll not enabled'])) {
        return '2FA TOTP ozelligi Supabase tarafinda aktif degil.'
    }
    if (includeAny(combined, ['insufficient_aal'])) {
        return 'Bu islem icin once mevcut 2FA oturumunu dogrulamaniz gerekir.'
    }
    if (includeAny(combined, ['too_many_enrolled_mfa_factors'])) {
        return 'Bu hesap icin izin verilen maksimum 2FA faktor sayisina ulasildi.'
    }
    if (includeAny(combined, ['factor name conflict', 'mfa_factor_name_conflict'])) {
        return 'Bu faktor adi zaten kullanimda. Lutfen farkli bir cihaz adi deneyin.'
    }
    if (includeAny(combined, ['email not confirmed', 'email confirmation'])) {
        return 'E-posta dogrulamasi tamamlanmadi. Mail kutunuzu kontrol edin.'
    }
    if (includeAny(combined, ['user already registered'])) {
        return 'Bu e-posta adresi ile zaten bir hesap var.'
    }
    if (includeAny(combined, ['could not find the function public.redeem_coin_code'])) {
        return 'Kod aktiflestirme fonksiyonu bulunamadi. SQL migrationlarini guncelleyin.'
    }
    if (includeAny(combined, ['failed to fetch', 'network error'])) {
        return 'Sunucuya baglanilamadi. Internet baglantinizi kontrol edin.'
    }
    if (includeAny(combined, ['permission denied'])) {
        return 'Bu islem icin yetkiniz yok.'
    }
    if (includeAny(combined, ['row-level security', 'violates row-level security policy'])) {
        return 'Bu islem icin gerekli veritabani veya storage izni bulunamadi. Migrationlari kontrol edin.'
    }

    return null
}

/**
 * Reduces Supabase/Postgres/HTTP errors to one user-appropriate text.
 */
export function toAppErrorMessage(error: unknown, fallback = 'Islem sirasinda bir hata olustu.') {
    const typed = getErrorLike(error)
    const code = normalize(typed.code)
    const message = normalize(typed.message || typed.error_description)
    const details = normalize(typed.details)
    const hint = normalize(typed.hint)

    if (code) {
        const fromCode = resolveByCode(code, message, details)
        if (fromCode) return txa(fromCode)
    }

    const fromMessage = resolveByMessage(message, details, hint)
    if (fromMessage) return txa(fromMessage)

    if (typed.message && typed.message.trim()) return txa(typed.message.trim())
    if (typed.error_description && typed.error_description.trim()) return txa(typed.error_description.trim())

    return txa(fallback)
}

export function isReservedUsernameValue(value: string) {
    const normalized = normalize(value)
    if (!normalized) return false

    const reserved = new Set([
        'admin',
        'administrator',
        'moderator',
        'mod',
        'support',
        'staff',
        'system',
        'root',
        'owner',
    ])

    return reserved.has(normalized)
}
