export function buildCoverPlaceholder(title: string) {
    const safeTitle = title.trim() || 'Manga'
    const escapedTitle = safeTitle
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720" fill="none"><rect width="480" height="720" rx="36" fill="#111827"/><path d="M86 126h308" stroke="#F59E0B" stroke-width="20" stroke-linecap="round" opacity="0.55"/><path d="M120 200h240" stroke="#374151" stroke-width="18" stroke-linecap="round"/><path d="M120 252h188" stroke="#374151" stroke-width="18" stroke-linecap="round" opacity="0.8"/><rect x="108" y="326" width="264" height="238" rx="28" fill="#1F2937"/><text x="240" y="620" fill="#F9FAFB" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle">${escapedTitle}</text></svg>`
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
