/**
 * OptimizedImage: a performance-focused image component.
 *
 * Features:
 * - `loading="lazy"` + `decoding="async"` (native browser support)
 * - Skeleton placeholder animation (while loading)
 * - Fade-in effect (when loaded)
 * - Error fallback (for broken images)
 * - Optional aspect ratio container
 *
 * Usage:
 * <OptimizedImage src={url} alt="Cover" className="w-full" aspectRatio="3/4" />
 */
import { useState, useCallback, type ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> {
    /** Show the skeleton? (default: true) */
    showSkeleton?: boolean
    /** CSS aspect-ratio, e.g. "3/4", "16/9", "1/1" */
    aspectRatio?: string
    /** Fallback URL to show on error */
    fallbackSrc?: string
    /** Container'a ek className */
    containerClassName?: string
    /** Disable lazy loading? (for critical images like a logo) */
    eager?: boolean
}

function OptimizedImage({
    src,
    alt,
    className,
    showSkeleton = true,
    aspectRatio,
    fallbackSrc,
    containerClassName,
    eager = false,
    fetchPriority,
    ...rest
}: OptimizedImageProps) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)

    const handleLoad = useCallback(() => setLoaded(true), [])
    const handleError = useCallback(() => {
        setError(true)
        setLoaded(true) // Remove the skeleton
    }, [])

    const imgSrc = error && fallbackSrc ? fallbackSrc : src

    const fetchPriorityProps = fetchPriority
        ? ({ fetchpriority: fetchPriority } as Record<string, string>)
        : undefined

    // Wrap in a container if an aspect ratio wrapper is used
    if (aspectRatio) {
        return (
            <div
                className={cn('relative overflow-hidden bg-muted/30', containerClassName)}
                style={{ aspectRatio }}
            >
                {/* Skeleton */}
                {showSkeleton && !loaded && (
                    <div className="absolute inset-0 animate-pulse bg-muted/50" />
                )}

                <img
                    src={imgSrc}
                    alt={alt}
                    loading={eager ? 'eager' : 'lazy'}
                    decoding="async"
                    onLoad={handleLoad}
                    onError={handleError}
                    className={cn(
                        'h-full w-full object-cover transition-opacity duration-300',
                        loaded ? 'opacity-100' : 'opacity-0',
                        className,
                    )}
                    {...fetchPriorityProps}
                    {...rest}
                />

                {/* Error fallback — kırık görsel ikonu */}
                {error && !fallbackSrc && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground">
                        <svg className="h-6 w-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                    </div>
                )}
            </div>
        )
    }

    // No aspect ratio: just the img
    return (
        <>
            {showSkeleton && !loaded && (
                <div className={cn('animate-pulse bg-muted/50', className)} />
            )}
            <img
                src={imgSrc}
                alt={alt}
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                onLoad={handleLoad}
                onError={handleError}
                className={cn(
                    'transition-opacity duration-300',
                    loaded ? 'opacity-100' : 'opacity-0',
                    showSkeleton && !loaded && 'absolute',
                    className,
                )}
                {...fetchPriorityProps}
                    {...rest}
            />
        </>
    )
}

export default OptimizedImage
