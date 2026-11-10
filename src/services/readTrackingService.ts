const READER_CLIENT_KEY_STORAGE = 'reader-client-key:v1'

function createCryptoRandomString(length: number) {
    if (typeof window === 'undefined' || !window.crypto?.getRandomValues) return null

    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = new Uint8Array(length)
    window.crypto.getRandomValues(bytes)

    let output = ''
    for (let i = 0; i < bytes.length; i += 1) {
        output += alphabet[bytes[i] % alphabet.length]
    }
    return output
}

function createRandomKeySegment(length = 10) {
    const secure = createCryptoRandomString(length)
    if (secure) return secure
    return Math.random().toString(36).slice(2, 2 + length)
}

function createReaderClientKey() {
    return `anon_${createRandomKeySegment(12)}${createRandomKeySegment(12)}${createRandomKeySegment(12)}`
}

function isValidReaderClientKey(value: string) {
    return /^[a-z0-9_-]{16,96}$/i.test(value)
}

export function getReaderClientKey() {
    if (typeof window === 'undefined') return null

    try {
        const existing = localStorage.getItem(READER_CLIENT_KEY_STORAGE)
        if (existing && isValidReaderClientKey(existing)) {
            return existing
        }

        const created = createReaderClientKey()
        localStorage.setItem(READER_CLIENT_KEY_STORAGE, created)
        return created
    } catch {
        return null
    }
}
