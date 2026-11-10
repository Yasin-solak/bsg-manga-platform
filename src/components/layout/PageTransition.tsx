import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useAnimate } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { getPageTransitionKey, pageEnterKeyframes, pageEnterTransition } from '@/lib/motion'

// Softly fades content in on route change.
// Why NOT remount with a key: child routes sharing a page (like shop
// tabs) would lose state. Only the existing DOM's opacity animates here;
// the first render (including SSR/prerender) has no animation.
// Opacity must go to 0 BEFORE paint; in useEffect the new page showed fully for one frame,
// then dimmed and reappeared, causing a flicker. useLayoutEffect warns on SSR,
// so it falls back to useEffect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const transitionKey = getPageTransitionKey(location.pathname)
  const previousKeyRef = useRef(transitionKey)

  useIsomorphicLayoutEffect(() => {
    if (previousKeyRef.current === transitionKey) return
    previousKeyRef.current = transitionKey
    const element = scope.current
    if (prefersReducedMotion || !element) return

    element.style.opacity = '0'
    const controls = animate(element, pageEnterKeyframes, pageEnterTransition)
    return () => {
      controls.stop()
      element.style.opacity = ''
    }
  }, [animate, prefersReducedMotion, scope, transitionKey])

  return (
    // h-full: so the percent height chain on pages does not break before main.
    <div ref={scope} className='h-full' data-page-transition-key={transitionKey}>
      {children}
    </div>
  )
}

export default PageTransition
