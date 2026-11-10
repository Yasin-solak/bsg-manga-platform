import { cn } from '@/lib/utils'
import { MUREK_COUSIN_FRAMES, MUREK_COUSIN_NAMES, type MurekCousinKind } from './murekCousins'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek cousin (Halloween): pixel SVG. Two frames (feet / skirt) step in turn; a dark outer
 * line keeps it readable at any size. Data from murekCousins.ts (same drawing as the shop).
 */
export function MurekCousin({ kind, size = 64, frame = 0, className, title }: {
  kind: MurekCousinKind
  size?: number
  frame?: 0 | 1
  className?: string
  title?: string
}) {
  const data = MUREK_COUSIN_FRAMES[kind][frame]
  // Grid: cousin parts such as a cape / hat extend beyond 16x16.
  const xs = [...data.cells.map((c) => c[0]), ...data.outline.map((c) => c[0])]
  const ys = [...data.cells.map((c) => c[1]), ...data.outline.map((c) => c[1])]
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX + 1, h = maxY - minY + 1
  const label = title ?? txa(MUREK_COUSIN_NAMES[kind])
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      width={size * (w / h)}
      height={size}
      shapeRendering='crispEdges'
      className={cn('shrink-0 [image-rendering:pixelated]', className)}
      role='img'
      aria-label={label}
    >
      {data.outline.map(([x, y]) => <rect key={`o${x}:${y}`} x={x} y={y} width='1.02' height='1.02' fill='#15122a' />)}
      {data.cells.map(([x, y, color]) => <rect key={`c${x}:${y}`} x={x} y={y} width='1.02' height='1.02' fill={color} />)}
    </svg>
  )
}
