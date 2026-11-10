/*
 * Balloon region: the detection box is often not the balloon itself but a single column of vertical
 * Japanese text. The balloon the text belongs to is found as the light connected
 * region starting from the box, and its holes (text) are filled:
 * - cleaning paints the balloon's whole interior in the background color; columns outside the box
 * are erased too, and the balloon line (a dark ring reached from outside) is kept
 * - translated text is placed in the balloon's interior, not the narrow column
 * If the region widely touches the crop edge (no closed balloon, text over art),
 * the result counts as a "leak" and the caller returns to the old threshold method.
 */

export type RegionBox = { x: number, y: number, w: number, h: number }

export interface BalloonRegion {
  /** Kirpinti boyutunda: 1 = boyanacak yazi pikseli (balon icindeki delikler). */
  interior: Uint8Array
  /** Kirpinti koordinatinda balon icinin sinirlari. */
  bounds: RegionBox
  /** Median color of the balloon background (light region). */
  fill: [number, number, number]
  /** Bolge trama sizdi: sinirlar balonu temsil etmez (kutu buyutmede kullanilmaz). */
  leaked: boolean
  /** Balloon open to the crop edge (gap between panels): cleaned, but the box is not enlarged. */
  open: boolean
}

const MAX_EDGE_TOUCH = 0.08
const MAX_TONE_DOTS = 60
const GLYPH_REACH = 4

const lum = (data: Uint8ClampedArray, offset: number) => 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]

/**
 * Inside the crop, takes the largest light region overlapping `box` (crop coordinates) as the
 * balloon. Returns null if the paper tone (90th percentile) in the box is not light,
 * or the region touches the crop edge.
 */
export function findBalloonRegion(data: Uint8ClampedArray, width: number, height: number, box: RegionBox): BalloonRegion | null {
  const total = width * height
  if (total === 0) return null
  const luminance = new Float32Array(total)
  for (let index = 0; index < total; index += 1) luminance[index] = lum(data, index * 4)

  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width - 1, Math.ceil(box.x + box.w) - 1)
  const y1 = Math.min(height - 1, Math.ceil(box.y + box.h) - 1)
  if (x1 <= x0 || y1 <= y0) return null
  const inside: number[] = []
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) inside.push(luminance[y * width + x])
  inside.sort((a, b) => a - b)
  const paper = inside[Math.floor(inside.length * 0.9)] ?? 0
  if (paper < 170) return null
  const threshold = paper - 45

  // Light connected components (4-neighbor); the balloon with the most seeds inside the box.
  const component = new Int32Array(total).fill(-1)
  const queue = new Int32Array(total)
  let best = -1
  let bestSeeds = 0
  let label = 0
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const start = y * width + x
      if (component[start] !== -1 || luminance[start] < threshold) continue
      let head = 0
      let tail = 0
      let seeds = 0
      queue[tail++] = start
      component[start] = label
      while (head < tail) {
        const index = queue[head++]
        const px = index % width
        const py = (index - px) / width
        if (px >= x0 && px <= x1 && py >= y0 && py <= y1) seeds += 1
        const neighbours = [px > 0 ? index - 1 : -1, px < width - 1 ? index + 1 : -1, py > 0 ? index - width : -1, py < height - 1 ? index + width : -1]
        for (const next of neighbours) {
          if (next < 0 || component[next] !== -1 || luminance[next] < threshold) continue
          component[next] = label
          queue[tail++] = next
        }
      }
      if (seeds > bestSeeds) { bestSeeds = seeds; best = label }
      label += 1
    }
  }
  if (best < 0) return null

  // Leak: a balloon may open into the white gap between panels (common in manga); touching the edge
  // with a narrow neck is accepted, wide contact means "no closed balloon".
  // Painting the white gap's part inside the crop is harmless (it is already white).
  let area = 0
  for (let index = 0; index < total; index += 1) if (component[index] === best) area += 1
  let touching = 0
  for (let x = 0; x < width; x += 1) {
    if (component[x] === best) touching += 1
    if (component[(height - 1) * width + x] === best) touching += 1
  }
  for (let y = 0; y < height; y += 1) {
    if (component[y * width] === best) touching += 1
    if (component[y * width + width - 1] === best) touching += 1
  }
  if (touching > (width + height) * 2 * MAX_EDGE_TOUCH) return null
  if (area > box.w * box.h * 25) return null

  // Delik doldurma: balon disindan (kenardan) erisilemeyen her piksel balon icidir.
  const outside = new Uint8Array(total)
  let head = 0
  let tail = 0
  const pushOutside = (index: number) => {
    if (outside[index] || component[index] === best) return
    outside[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) { pushOutside(x); pushOutside((height - 1) * width + x) }
  for (let y = 0; y < height; y += 1) { pushOutside(y * width); pushOutside(y * width + width - 1) }
  while (head < tail) {
    const index = queue[head++]
    const px = index % width
    const py = (index - px) / width
    if (px > 0) pushOutside(index - 1)
    if (px < width - 1) pushOutside(index + 1)
    if (py > 0) pushOutside(index - width)
    if (py < height - 1) pushOutside(index + width)
  }
  // Only holes (text, furigana, columns outside the box) are painted; the balloon's light
  // pixels stay as they are. If the balloon leaks into a light screentone region,
  // tone dots become holes too: these are small pieces far from the box and are
  // not painted; large pieces not near the box are also skipped in leak mode.
  const holes = holeComponents(component, outside, best, width, height, box)
  const leaked = holes.filter((hole) => hole.tiny && !hole.nearBox).length > MAX_TONE_DOTS
  const interior = new Uint8Array(total)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const grow = (px: number, py: number) => {
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }
  // A small piece is text only if right next to a letter stroke (dakuten, dot);
  // a small piece standing alone is a tone dot and is not painted (it would leave a flat white blot).
  const nearGlyph = new Uint8Array(total)
  for (const hole of holes) {
    if (hole.tiny || !(hole.nearBox || hole.nearColumns)) continue
    for (const index of hole.pixels) {
      const px = index % width
      const py = (index - px) / width
      for (let dy = -GLYPH_REACH; dy <= GLYPH_REACH; dy += 1) {
        const y = py + dy
        if (y < 0 || y >= height) continue
        for (let dx = -GLYPH_REACH; dx <= GLYPH_REACH; dx += 1) {
          const x = px + dx
          if (x >= 0 && x < width) nearGlyph[y * width + x] = 1
        }
      }
    }
  }
  for (const hole of holes) {
    const paint = hole.tiny
      ? !leaked && hole.pixels.some((index) => nearGlyph[index])
      : hole.nearBox || hole.nearColumns || !leaked
    if (!paint) continue
    for (const index of hole.pixels) interior[index] = 1
  }
  // Very light anti-aliasing pixels at letter edges join the light region; expand by 1 px.
  const painted = interior.slice()
  for (let index = 0; index < total; index += 1) {
    if (!painted[index]) continue
    const px = index % width
    if (px > 0 && component[index - 1] === best) interior[index - 1] = 1
    if (px < width - 1 && component[index + 1] === best) interior[index + 1] = 1
    if (index >= width && component[index - width] === best) interior[index - width] = 1
    if (index + width < total && component[index + width] === best) interior[index + width] = 1
  }
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  for (let index = 0; index < total; index += 1) {
    if (outside[index]) continue
    const px = index % width
    const py = (index - px) / width
    grow(px, py)
    if (component[index] === best && (index & 7) === 0) {
      reds.push(data[index * 4]); greens.push(data[index * 4 + 1]); blues.push(data[index * 4 + 2])
    }
  }
  if (maxX < 0) return null
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 255
  return {
    interior,
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    fill: [median(reds), median(greens), median(blues)],
    leaked,
    open: touching > 0,
  }
}

type Hole = { pixels: number[], tiny: boolean, nearBox: boolean, nearColumns: boolean }

/**
 * Hole pieces inside the balloon. nearBox: touches the box's surroundings with a 15% margin;
 * nearColumns: within one box width horizontally and a 15% margin vertically (neighboring
 * columns of vertical text).
 */
function holeComponents(component: Int32Array, outside: Uint8Array, best: number, width: number, height: number, box: RegionBox): Hole[] {
  const near = (x: number, y: number, mx: number, my: number) => x >= box.x - mx && x <= box.x + box.w + mx && y >= box.y - my && y <= box.y + box.h + my
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const holes: Hole[] = []
  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start] || outside[start] || component[start] === best) continue
    const pixels: number[] = []
    let nearBox = false
    let nearColumns = false
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const index = stack.pop() as number
      pixels.push(index)
      const px = index % width
      const py = (index - px) / width
      if (!nearBox && near(px, py, box.w * 0.15, box.h * 0.15)) nearBox = true
      if (!nearColumns && near(px, py, box.w, box.h * 0.15)) nearColumns = true
      const neighbours = [px > 0 ? index - 1 : -1, px < width - 1 ? index + 1 : -1, py > 0 ? index - width : -1, py < height - 1 ? index + width : -1]
      for (const next of neighbours) {
        if (next < 0 || seen[next] || outside[next] || component[next] === best) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    holes.push({ pixels, tiny: pixels.length <= 12, nearBox, nearColumns })
  }
  return holes
}

/** A wide enough crop around the box for balloon search (clipped at the page edge). */
export function balloonSearchCrop(box: RegionBox, pageWidth: number, pageHeight: number): RegionBox {
  const pad = Math.max(64, Math.round(Math.max(box.w, box.h) * 2))
  const x = Math.max(0, Math.floor(box.x - pad))
  const y = Math.max(0, Math.floor(box.y - pad))
  const right = Math.min(pageWidth, Math.ceil(box.x + box.w + pad))
  const bottom = Math.min(pageHeight, Math.ceil(box.y + box.h + pad))
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

/**
 * Fits the detection box to the balloon's interior (page coordinates; grows or shrinks). The text comes
 * narrow/tall from the vertical Japanese column; translated text should fill the whole balloon.
 * Null if the balloon is not found, leaks into screentone, opens to a panel gap, does not overlap the box enough,
 * is already fitted or covers another item's box.
 */
export function snapBoxToBalloon(region: BalloonRegion | null, crop: RegionBox, box: RegionBox, others: RegionBox[] = []): RegionBox | null {
  if (!region || region.leaked || region.open) return null
  const inset = 3
  const x = crop.x + region.bounds.x + inset
  const y = crop.y + region.bounds.y + inset
  const w = region.bounds.w - inset * 2
  const h = region.bounds.h - inset * 2
  // No change if the box already matches the balloon; a box overflowing the balloon is shrunk to it.
  if (Math.abs(x - box.x) <= 2 && Math.abs(y - box.y) <= 2 && Math.abs(w - box.w) <= 4 && Math.abs(h - box.h) <= 4) return null
  if (w * h > box.w * box.h * 25) return null
  const overlapW = Math.max(0, Math.min(x + w, box.x + box.w) - Math.max(x, box.x))
  const overlapH = Math.max(0, Math.min(y + h, box.y + box.h) - Math.max(y, box.y))
  if (overlapW * overlapH < box.w * box.h * 0.7) return null
  // Adjacent balloons become one region (two balloons merged in a real test). The region is cut at the
  // midline between the two boxes toward the neighbor's box; each text goes in its own half.
  let left = x
  let top = y
  let right = x + w
  let bottom = y + h
  for (const other of others) {
    const ow = Math.max(0, Math.min(right, other.x + other.w) - Math.max(left, other.x))
    const oh = Math.max(0, Math.min(bottom, other.y + other.h) - Math.max(top, other.y))
    if (ow * oh <= other.w * other.h * 0.2) continue
    if (other.x >= box.x + box.w) right = Math.min(right, (box.x + box.w + other.x) / 2)
    else if (other.x + other.w <= box.x) left = Math.max(left, (other.x + other.w + box.x) / 2)
    else if (other.y >= box.y + box.h) bottom = Math.min(bottom, (box.y + box.h + other.y) / 2)
    else if (other.y + other.h <= box.y) top = Math.max(top, (other.y + other.h + box.y) / 2)
    else return null
  }
  if (right - left < box.w * 0.9 || bottom - top < box.h * 0.9) return null
  return { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) }
}
