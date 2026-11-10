import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

/** Read the browser preference */
function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** LocalStorage'daki tema tercihini oku */
function getStoredTheme(): Theme {
    const previewTheme = import.meta.env.DEV && typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('e2e') === '1'
        ? new URLSearchParams(window.location.search).get('theme')
        : null
    if (previewTheme === 'light' || previewTheme === 'dark' || previewTheme === 'system') {
        return previewTheme
    }

    try {
        const stored = localStorage.getItem('bsgmanga-theme')
        if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    } catch { /* SSR veya hata durumu */ }
    return 'dark' // Default: dark
}

/**
 * useTheme: dark/light mode management
 * Adds or removes the .dark class on the HTML root
 */
export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(getStoredTheme)

    const [systemTheme, setSystemTheme] = useState(getSystemTheme)
    const resolvedTheme = theme === 'system' ? systemTheme : theme

    useEffect(() => {
        const root = document.documentElement
        root.classList.toggle('dark', resolvedTheme === 'dark')
        localStorage.setItem('bsgmanga-theme', theme)
    }, [theme, resolvedTheme])

    /* Update when the system preference changes */
    useEffect(() => {
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => setSystemTheme(getSystemTheme())
        handler()
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [theme])

    const setTheme = (next: Theme) => setThemeState(next)
    const toggleTheme = () => setThemeState((prev) => {
        if (prev === 'dark') return 'light'
        if (prev === 'light') return 'dark'
        return getSystemTheme() === 'dark' ? 'light' : 'dark'
    })

    return { theme, resolvedTheme, setTheme, toggleTheme }
}
