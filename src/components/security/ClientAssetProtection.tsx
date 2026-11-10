import { useEffect } from 'react'

const PROTECTED_STORE_PATHS = [
    '/storage/v1/object/public/store-assets/',
    '/storage/v1/object/sign/store-assets/',
]

function isProtectedAssetTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false

    if (target.closest('[data-allow-asset-actions="true"]')) return false
    if (target.closest('[data-protect-assets="true"]')) return true

    const media = target.closest('img,video,canvas')
    if (!media) return false
    if (media.getAttribute('data-protect-assets') === 'true') return true

    if (media instanceof HTMLImageElement || media instanceof HTMLVideoElement) {
        const src = media.currentSrc || media.getAttribute('src') || ''
        return PROTECTED_STORE_PATHS.some((path) => src.includes(path))
    }

    return false
}

export default function ClientAssetProtection() {
    const guardEnabled = import.meta.env.VITE_ENABLE_CLIENT_ASSET_GUARD !== 'false'

    useEffect(() => {
        if (!guardEnabled) return

        const blockContextMenu = (event: MouseEvent) => {
            if (!isProtectedAssetTarget(event.target)) return
            event.preventDefault()
            event.stopPropagation()
        }

        const blockDragStart = (event: DragEvent) => {
            if (!isProtectedAssetTarget(event.target)) return
            event.preventDefault()
            event.stopPropagation()
        }

        window.addEventListener('contextmenu', blockContextMenu, { capture: true })
        window.addEventListener('dragstart', blockDragStart, { capture: true })

        return () => {
            window.removeEventListener('contextmenu', blockContextMenu, { capture: true })
            window.removeEventListener('dragstart', blockDragStart, { capture: true })
        }
    }, [guardEnabled])

    return null
}
