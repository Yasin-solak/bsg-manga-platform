import { createContext, useContext, type ReactNode } from 'react'

import { useTheme } from '@/hooks/useTheme'

type ThemeContextValue = ReturnType<typeof useTheme>

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * One theme state across the app. useTheme runs in one place (the provider),
 * so App and the theme toggle share the same state and two separate instances
 * cannot fall out of sync through localStorage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useThemeContext ThemeProvider icinde kullanilmalidir.')
  }
  return ctx
}

/** Returns null outside the provider (e.g. an isolated preview); the name contrast shield uses it for the background color. */
export function useOptionalThemeContext(): ThemeContextValue | null {
  return useContext(ThemeContext)
}
