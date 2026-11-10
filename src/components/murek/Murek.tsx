import { cn } from '@/lib/utils'
import {
  MUREK_ARMS_DOWN,
  MUREK_ARMS_UP,
  MUREK_BODY_ROWS,
  MUREK_EYES_BLINK,
  MUREK_FACES,
  MUREK_FEET_A,
  MUREK_FEET_B,
  MUREK_HIGHLIGHT,
  MUREK_INK,
  murekAccessoryPixels,
  murekPalette,
  type MurekCell,
  type MurekMood,
} from './murekSprite'
import './murek.css'

/*
 * Mürek: BSG Manga's mascot, a pixel art ink drop (16x16 grid). One bold color,
 * simple eyes, small arms and feet; readable at any size. Mood shows through face pixels, reactions
 * through stepped (steps) CSS animation. The body color can change; shadow and light tones
 * derive from the same color.
 */

export type { MurekMood }
export type MurekMotion = 'bob' | 'jump' | 'wobble' | 'walk' | 'none'

function Pixels({ cells, fill, className }: { cells: readonly MurekCell[], fill: string, className?: string }) {
  return (
    <g className={className} style={{ fill }}>
      {cells.map(([x, y]) => <rect key={`${x}:${y}`} x={x} y={y} width='1.02' height='1.02' />)}
    </g>
  )
}

export function Murek({ mood = 'idle', motion = 'bob', size = 96, color = MUREK_INK, accessory, animated, className, title }: {
  mood?: MurekMood
  motion?: MurekMotion
  size?: number
  color?: string
  /** Murek Dolabi aksesuari (bere, tac, ...). */
  accessory?: string | null
  /** 'rainbow': govde renkten renge akar. */
  animated?: string | null
  className?: string
  title?: string
}) {
  const face = MUREK_FACES[mood]
  const palette = murekPalette(color)
  const accessoryPixels = murekAccessoryPixels(accessory)
  return (
    <span
      className={cn('murek inline-block shrink-0', motion !== 'none' && `murek-motion-${motion}`, animated === 'rainbow' && 'murek-rainbow', className)}
      data-murek-accessory={accessory ?? undefined}
      style={{ width: size, height: size }}
      data-murek-mood={mood}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox='-1 -1 18 18' width={size} height={size} shapeRendering='crispEdges' className='overflow-visible'>
        <rect className='murek-shadow' x='3' y='14.2' width='10' height='1' style={{ fill: 'rgb(0 0 0 / 0.22)' }} />
        <g className='murek-body'>
          {MUREK_BODY_ROWS.map(([y, x0, x1]) => (
            <g key={y}>
              <rect x={x0} y={y} width={x1 - x0 + 1} height='1.02' style={{ fill: y >= 12 ? palette.shade : palette.body }} />
              {y >= 5 && y < 12 && <rect x={x1} y={y} width='1.02' height='1.02' style={{ fill: palette.shade }} />}
            </g>
          ))}
          <Pixels cells={MUREK_HIGHLIGHT} fill={palette.light} />
          <Pixels cells={face.armsUp ? MUREK_ARMS_UP : MUREK_ARMS_DOWN} fill={palette.body} className='murek-arms' />
          <Pixels cells={MUREK_FEET_A} fill={palette.shade} className='murek-feet-a' />
          <Pixels cells={MUREK_FEET_B} fill={palette.shade} className='murek-feet-b' />
          {face.blush && <Pixels cells={face.blush} fill={palette.blush} />}
          {face.tear && <Pixels cells={face.tear} fill={palette.tear} />}
          <Pixels cells={face.eyes} fill={palette.ink} className={face.blink ? 'murek-eyes-open' : undefined} />
          {face.blink && <Pixels cells={MUREK_EYES_BLINK} fill={palette.ink} className='murek-eyes-blink' />}
          {face.mouth && <Pixels cells={face.mouth} fill={palette.ink} />}
          {accessoryPixels.length > 0 && (
            <g className='murek-accessory'>
              {accessoryPixels.map(([x, y, fill]) => <rect key={`${x}:${y}`} x={x} y={y} width='1.02' height='1.02' style={{ fill }} />)}
            </g>
          )}
        </g>
      </svg>
    </span>
  )
}
