import { loadEnDictionary } from './activeLocale'
import { forwardRef, useCallback, useMemo, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  useLocation,
  useNavigate as useRouterNavigate,
  useResolvedPath,
  useSearchParams as useRouterSearchParams,
  type LinkProps,
  type NavigateOptions,
  type NavigateProps,
  type To,
  type URLSearchParamsInit,
} from 'react-router-dom'
import { useLocale } from './LocaleProvider'
import { alternateHref, LOCALE_TAG, localizeHref, localizePathname, type Locale } from './localizedRoutes'

/*
  Language aware navigation. App code works with canonical (Turkish word) paths;
  these wrappers turn the target into the address of the current language.
  `react-router-dom`'dan Link / NavLink / Navigate / useNavigate /
  useSearchParams yerine buradan alinmali (contract denetler): aksi halde
  a link would leave the current language.
*/

function toHref(resolved: { pathname: string, search: string, hash: string }, locale: Locale) {
  return localizeHref(`${resolved.pathname}${resolved.search}${resolved.hash}`, locale)
}

function isExternal(to: To) {
  return typeof to === 'string' && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(to)
}

/** Also resolves relative targets to a canonical absolute path, then localizes them. */
function useLocalizedTo(to: To): To {
  const { locale } = useLocale()
  const resolved = useResolvedPath(to)
  return useMemo(() => (isExternal(to) ? to : toHref(resolved, locale)), [locale, resolved, to])
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...rest }, ref) {
  const localized = useLocalizedTo(to)
  return <RouterLink ref={ref} to={localized} {...rest} />
})

type NavLinkRenderProps = { isActive: boolean, isPending: boolean, isTransitioning: boolean }

export type NavLinkProps = Omit<LinkProps, 'className' | 'style' | 'children'> & {
  end?: boolean
  className?: string | ((props: NavLinkRenderProps) => string | undefined)
  style?: CSSProperties | ((props: NavLinkRenderProps) => CSSProperties | undefined)
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode)
}

/**
 * The active check uses the canonical (Turkish word) location; RR NavLink would compare the English
 * target with the canonical location and never show as active.
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ to, end = false, className, style, children, ...rest }, ref) {
  const location = useLocation()
  const resolved = useResolvedPath(to)
  const localized = useLocalizedTo(to)
  const current = location.pathname
  const target = resolved.pathname
  const isActive = end || target === '/'
    ? current === target
    : current === target || current.startsWith(`${target.replace(/\/$/, '')}/`)
  const state: NavLinkRenderProps = { isActive, isPending: false, isTransitioning: false }
  return (
    <RouterLink
      ref={ref}
      to={localized}
      aria-current={isActive ? 'page' : undefined}
      className={typeof className === 'function' ? className(state) : [className, isActive ? 'active' : null].filter(Boolean).join(' ') || undefined}
      style={typeof style === 'function' ? style(state) : style}
      {...rest}
    >
      {typeof children === 'function' ? children(state) : children}
    </RouterLink>
  )
})

export function Navigate({ to, ...rest }: NavigateProps) {
  const localized = useLocalizedTo(to)
  return <RouterNavigate to={localized} {...rest} />
}

/** Sends an old address to its new place. The target is already a real address, hence the plain RR Navigate. */
export function LegacyAddressRedirect({ pathname }: { pathname: string }) {
  const location = useLocation()
  return <RouterNavigate to={`${pathname}${location.search}${location.hash}`} state={location.state} replace />
}

export function useNavigate() {
  const navigate = useRouterNavigate()
  const { locale } = useLocale()
  const location = useLocation()
  return useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      navigate(to)
      return
    }
    if (isExternal(to)) {
      navigate(to, options)
      return
    }
    // A relative target (`?sekme=`, `ayarlar`, `..`) is resolved against the canonical location, then localized.
    const base = new URL(`${location.pathname}${location.search}`, 'http://x')
    const target = typeof to === 'string' ? new URL(to, base) : new URL(`${to.pathname ?? location.pathname}${to.search ?? ''}${to.hash ?? ''}`, base)
    navigate(toHref({ pathname: target.pathname, search: target.search, hash: target.hash }, locale), options)
  }, [locale, location.pathname, location.search, navigate])
}

/** setSearchParams stays in the current language (the RR version would navigate to the canonical path). */
export function useSearchParams(init?: URLSearchParamsInit) {
  const [params] = useRouterSearchParams(init)
  const navigate = useNavigate()
  const location = useLocation()
  const setParams = useCallback((next: URLSearchParams | Record<string, string> | ((previous: URLSearchParams) => URLSearchParams | Record<string, string>), options?: NavigateOptions) => {
    const value = typeof next === 'function' ? next(new URLSearchParams(params)) : next
    const search = new URLSearchParams(value as Record<string, string>).toString()
    navigate(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`, options)
  }, [location.hash, location.pathname, navigate, params])
  return [params, setParams] as const
}

/**
 * Language switch: goes to the same page in the other language (`/library` <->
 * `/tr/kutuphane`). The target is already localized, hence the plain RR Link.
 */
export function LocaleSwitchLink({ className, onClick, children }: { className?: string, onClick?: () => void, children?: ReactNode }) {
  const { locale, t } = useLocale()
  const location = useLocation()
  const next: Locale = locale === 'tr' ? 'en' : 'tr'
  const target = `${localizePathname(location.pathname, next)}${location.search}${location.hash}`
  const navigate = useRouterNavigate()
  // Navigation runs inside a transition (the screen stays old for a moment while the new page loads);
  // at click time the target is recomputed from the real browser address.
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.()
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const live = window.location
    const go = () => navigate(`${alternateHref(live.pathname, live.search, live.hash, next)}`)
    // Ingilizce sozluk ayri parcada; dile gecmeden once gelir.
    if (next === 'en') void loadEnDictionary().catch(() => undefined).finally(go)
    else go()
  }
  return (
    <RouterLink to={target} hrefLang={LOCALE_TAG[next]} lang={LOCALE_TAG[next]} className={className} onClick={handleClick} aria-label={t('locale.switchLabel')} data-testid="locale-switch">
      {children ?? t('locale.switchTo')}
    </RouterLink>
  )
}
