import { cn } from '@/lib/utils'

interface FansubPlainAvatarProps {
  src: string
  alt: string
  size: number
  className?: string
}

export function FansubPlainAvatar({
  src,
  alt,
  size,
  className,
}: FansubPlainAvatarProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn(
        'block shrink-0 rounded-full border border-border/80 bg-background object-cover dark:border-white/15',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}
