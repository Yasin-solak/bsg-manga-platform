/**
 * PrefetchLink: a Link that prefetches the next page chunk on hover.
 *
 * Loads React.lazy page modules ahead of time when the user hovers the link,
 * so the page opens instantly on click.
 *
 * Usage:
 * <PrefetchLink to="/kesfet" prefetch={() => import('@pages/ExplorePage')}>Explore</PrefetchLink>
 */
import { useCallback, useRef } from 'react'
import { type LinkProps } from 'react-router-dom'
import { Link } from '@/i18n/router'
type PrefetchLinkProps = Omit<LinkProps, 'prefetch'> & {
    /** Prefetch edilecek dynamic import fonksiyonu */
    prefetch?: () => Promise<unknown>
    /** Prefetch gecikmesi (ms) - cok kisa hover'lari engeller */
    delay?: number
}

function PrefetchLink({ prefetch, delay = 100, onMouseEnter, ...rest }: PrefetchLinkProps) {
    const prefetchedRef = useRef(false)
    const timerRef = useRef<ReturnType<typeof setTimeout>>()

    const handleMouseEnter = useCallback(
        (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (onMouseEnter) onMouseEnter(e)
            if (prefetchedRef.current || !prefetch) return

            timerRef.current = setTimeout(() => {
                prefetchedRef.current = true
                void prefetch()
            }, delay)
        },
        [prefetch, delay, onMouseEnter],
    )

    const handleMouseLeave = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = undefined
        }
    }, [])

    return <Link onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...rest} />
}

export default PrefetchLink
