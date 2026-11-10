import { useOptionalThemeContext } from '@/contexts/ThemeContext'

// Kart zeminleri (acik / koyu tema): isim kontrast kalkani bu zemine gore karar verir.
const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#0f1115'

/** Yorum, kart gibi duz zeminlerde ismin okunurlugu icin sayfa zemin rengi. */
export function useNameSurfaceColors(): string[] {
  const theme = useOptionalThemeContext()
  const resolved = theme?.resolvedTheme
    ?? (typeof document !== 'undefined' && !document.documentElement.classList.contains('dark') ? 'light' : 'dark')
  return [resolved === 'light' ? LIGHT_SURFACE : DARK_SURFACE]
}
