import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'sidebar-collapsed'
const EVENT_NAME = 'sidebar-toggle'

/**
 * Manages the sidebar open/closed state.
 * Persisted in localStorage, synced across tabs with a custom event.
 */
export function useSidebarCollapsed() {
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
    })

    const toggle = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev
            try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* localStorage erişim hatası */ }
            window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
            return next
        })
    }, [])

    /* Listen for the toggle signal from other components */
    useEffect(() => {
        const handler = (e: Event) => setCollapsed((e as CustomEvent).detail as boolean)
        window.addEventListener(EVENT_NAME, handler)
        return () => window.removeEventListener(EVENT_NAME, handler)
    }, [])

    return { collapsed, toggle } as const
}
