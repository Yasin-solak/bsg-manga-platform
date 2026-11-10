function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
    const normalized = (value || '').trim()
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback
}

function getFansubInitials(name: string) {
    const normalized = name.trim()
    if (!normalized) return 'FN'

    const words = normalized.split(/\s+/).filter(Boolean)
    if (words.length >= 2) {
        return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
    }

    return normalized.slice(0, 2).toUpperCase()
}

export function buildFansubAvatarPlaceholder(
    name: string,
    primaryColor?: string | null,
    secondaryColor?: string | null,
) {
    const safeName = name.trim() || 'Fansub'
    const initials = escapeXml(getFansubInitials(safeName))
    const escapedName = escapeXml(safeName)
    const fromColor = normalizeHexColor(primaryColor, '#7c2d12')
    const toColor = normalizeHexColor(secondaryColor, '#b91c1c')

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" fill="none"><defs><linearGradient id="fansubGradient" x1="28" y1="24" x2="212" y2="220" gradientUnits="userSpaceOnUse"><stop stop-color="${fromColor}"/><stop offset="1" stop-color="${toColor}"/></linearGradient></defs><rect width="240" height="240" rx="56" fill="url(#fansubGradient)"/><circle cx="120" cy="92" r="38" fill="rgba(255,255,255,0.16)"/><path d="M58 188c9-29 34-46 62-46s53 17 62 46" stroke="rgba(255,255,255,0.34)" stroke-width="18" stroke-linecap="round"/><text x="120" y="134" fill="#fff7ed" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" text-anchor="middle">${initials}</text><text x="120" y="212" fill="rgba(255,247,237,0.88)" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle">${escapedName}</text></svg>`
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
