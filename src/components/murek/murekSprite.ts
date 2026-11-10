/*
 * Mürek pixel data (16x16). Both the SVG component (Murek.tsx) and the game canvas (Mürek Run)
 * use the same data, so the character looks identical everywhere.
 */

export type MurekMood = 'idle' | 'happy' | 'sad' | 'think' | 'hungry' | 'full' | 'dizzy' | 'cheer'
export type MurekCell = readonly [x: number, y: number]
export type MurekRole = 'body' | 'shade' | 'light' | 'ink' | 'blush' | 'tear'
/** Aksesuar pikselleri kendi rengini tasir (hex). */
export type MurekPaint = MurekRole | `#${string}`

export const MUREK_INK = '#7c6cff'

// Govde satirlari: [y, xBaslangic, xBitis]. Ust uc sivri, govde genis: murekkep damlasi.
export const MUREK_BODY_ROWS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 7, 8], [1, 7, 8], [2, 6, 9], [3, 5, 10], [4, 4, 11], [5, 3, 12], [6, 3, 12],
  [7, 2, 13], [8, 2, 13], [9, 2, 13], [10, 2, 13], [11, 3, 12], [12, 4, 11],
]
export const MUREK_HIGHLIGHT: MurekCell[] = [[5, 4], [4, 5], [4, 6], [6, 3]]
export const MUREK_FEET_A: MurekCell[] = [[4, 13], [5, 13], [10, 13], [11, 13]]
export const MUREK_FEET_B: MurekCell[] = [[6, 13], [7, 13], [8, 13], [9, 13]]
export const MUREK_ARMS_DOWN: MurekCell[] = [[1, 9], [14, 9], [1, 10], [14, 10]]
export const MUREK_ARMS_UP: MurekCell[] = [[1, 6], [14, 6], [1, 7], [14, 7]]
export const MUREK_EYES_BLINK: MurekCell[] = [[5, 8], [10, 8]]

const EYES_OPEN: MurekCell[] = [[5, 7], [5, 8], [10, 7], [10, 8]]
const EYES_HAPPY: MurekCell[] = [[4, 8], [5, 7], [6, 8], [9, 8], [10, 7], [11, 8]]

export interface MurekFace {
  eyes: MurekCell[]
  blink: boolean
  mouth?: MurekCell[]
  blush?: MurekCell[]
  tear?: MurekCell[]
  armsUp?: boolean
}

export const MUREK_FACES: Record<MurekMood, MurekFace> = {
  idle: { eyes: EYES_OPEN, blink: true },
  happy: { eyes: EYES_HAPPY, blink: false, mouth: [[7, 10], [8, 10]] },
  cheer: { eyes: EYES_HAPPY, blink: false, mouth: [[7, 10], [8, 10], [7, 11], [8, 11]], armsUp: true },
  full: { eyes: EYES_HAPPY, blink: false, mouth: [[7, 10], [8, 10]], blush: [[3, 9], [12, 9]] },
  sad: { eyes: [[5, 8], [10, 8], [4, 7], [11, 7]], blink: false, mouth: [[7, 11], [8, 11]], tear: [[11, 9], [11, 10]] },
  think: { eyes: [[6, 7], [11, 7]], blink: false, mouth: [[8, 10]] },
  hungry: { eyes: EYES_OPEN, blink: true, mouth: [[7, 10], [8, 10], [7, 11], [8, 11]] },
  dizzy: { eyes: [[4, 7], [6, 7], [5, 8], [4, 9], [6, 9], [9, 7], [11, 7], [10, 8], [9, 9], [11, 9]], blink: false, mouth: [[7, 11], [8, 11]] },
}

export function murekPalette(color = MUREK_INK): Record<MurekRole, string> {
  return {
    body: color,
    shade: `color-mix(in srgb, ${color} 72%, #0b0a1a)`,
    light: `color-mix(in srgb, ${color} 45%, #ffffff)`,
    ink: '#15122a',
    blush: '#ff8fb1',
    tear: '#8fd3ff',
  }
}

/*
 * Mürek Closet accessories: a pixel layer drawn over the body. Negative y = above the tip of the
 * drop (SVG overflow visible). Each pixel carries its own color; the accessory stays the same if the body color changes.
 */
type AccessoryPixel = readonly [x: number, y: number, color: `#${string}`]

function row(y: number, x0: number, x1: number, color: `#${string}`): AccessoryPixel[] {
  return Array.from({ length: x1 - x0 + 1 }, (_, index) => [x0 + index, y, color] as const)
}

const GOLD = '#f5b83d'
const GOLD_DARK = '#c98a12'
const RUBY = '#e03131'
const DARK = '#15122a'

export const MUREK_ACCESSORIES: Record<string, AccessoryPixel[]> = {
  // Ponponlu bere: ucu orter, beyaz serit.
  bere: [
    [7, -3, '#f1f3f5'], [8, -3, '#f1f3f5'],
    ...row(-2, 6, 9, '#e03131'), ...row(-1, 5, 10, '#e03131'), ...row(0, 5, 10, '#c92a2a'),
    ...row(1, 4, 11, '#f1f3f5'), ...row(2, 4, 11, '#dee2e6'),
  ],
  // Bow: two loops and a knot at the top of the tip.
  fiyonk: [
    ...row(-3, 4, 5, '#f783ac'), ...row(-3, 10, 11, '#f783ac'),
    ...row(-2, 4, 6, '#f06595'), ...row(-2, 9, 11, '#f06595'),
    ...row(-1, 4, 6, '#e64980'), ...row(-1, 9, 11, '#e64980'),
    [7, -2, '#c2255c'], [8, -2, '#c2255c'], [7, -1, '#a61e4d'], [8, -1, '#a61e4d'],
  ],
  // Striped scarf and its hanging end.
  atki: [
    ...row(11, 3, 12, '#e03131'), [4, 11, '#f8f9fa'], [7, 11, '#f8f9fa'], [10, 11, '#f8f9fa'],
    [10, 12, '#e03131'], [11, 12, '#c92a2a'], [10, 13, '#f8f9fa'], [11, 13, '#e03131'],
  ],
  // Sunglasses: two dark lenses, a bridge, a lens glint.
  gozluk: [
    ...row(7, 3, 12, DARK),
    ...row(8, 4, 6, DARK), ...row(8, 9, 11, DARK),
    [4, 7, '#495057'], [9, 7, '#495057'],
  ],
  // Kulaklik: tepeden gecen kemer, yanlarda kulaklar.
  kulaklik: [
    [7, -1, '#343a40'], [8, -1, '#343a40'], [6, 0, '#343a40'], [9, 0, '#343a40'],
    [5, 1, '#343a40'], [10, 1, '#343a40'], [4, 2, '#343a40'], [11, 2, '#343a40'],
    [3, 3, '#343a40'], [12, 3, '#343a40'], [2, 4, '#343a40'], [13, 4, '#343a40'],
    ...row(5, 0, 2, '#212529'), ...row(6, 0, 2, '#2fe07a'), ...row(7, 0, 2, '#212529'),
    ...row(5, 13, 15, '#212529'), ...row(6, 13, 15, '#2fe07a'), ...row(7, 13, 15, '#212529'),
  ],
  // Tac: uc sivri, ortada yakut.
  tac: [
    [5, -4, GOLD], [7, -4, GOLD], [8, -4, GOLD], [10, -4, GOLD],
    ...row(-3, 5, 10, GOLD), [7, -3, RUBY], [8, -3, RUBY],
    ...row(-2, 5, 10, GOLD_DARK), ...row(-1, 6, 9, GOLD_DARK),
  ],
}

export function murekAccessoryPixels(accessory: string | null | undefined): AccessoryPixel[] {
  return accessory ? MUREK_ACCESSORIES[accessory] ?? [] : []
}

/** Plain pixel list for the canvas (one frame): [x, y, role or hex]. */
export function murekFrame(mood: MurekMood, frame: 0 | 1 = 0, accessory?: string | null): Array<[number, number, MurekPaint]> {
  const face = MUREK_FACES[mood]
  const out: Array<[number, number, MurekPaint]> = []
  for (const [y, x0, x1] of MUREK_BODY_ROWS) {
    for (let x = x0; x <= x1; x += 1) {
      out.push([x, y, y >= 12 || (y >= 5 && x === x1) ? 'shade' : 'body'])
    }
  }
  const push = (cells: readonly MurekCell[] | undefined, role: MurekRole) => cells?.forEach(([x, y]) => out.push([x, y, role]))
  push(MUREK_HIGHLIGHT, 'light')
  push(face.armsUp ? MUREK_ARMS_UP : MUREK_ARMS_DOWN, 'body')
  push(frame === 0 ? MUREK_FEET_A : MUREK_FEET_B, 'shade')
  push(face.blush, 'blush')
  push(face.tear, 'tear')
  push(face.eyes, 'ink')
  push(face.mouth, 'ink')
  for (const [x, y, color] of murekAccessoryPixels(accessory)) out.push([x, y, color])
  return out
}
