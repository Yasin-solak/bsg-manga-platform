/*
 * Pure pixel operations for editor brushes and selections (no DOM; runs directly in tests).
 * - densify: fills sparse mouse points by brush spacing (for eraser and stroke
 * continuity; on fast motion points arrived 50 px apart)
 * - stampMask: opacity (0-1) of the brush mark inside the crop. A hard edge is softened 1 px;
 * on a soft edge the profile falls off from the hardness ratio toward the edge. Stamps
 * merge by "largest value": overlapping stamps do not harden the edge.
 * - polygonMask: lasso/box selection
 * - floodMask: magic wand (4-neighbor connected pixels within tolerance of the seed color)
 */

export type BrushPoint = { x: number, y: number, p?: number }
export type Crop = { x: number, y: number, w: number, h: number }

/** Adds in-between points so gaps do not exceed `spacing` (pressure is interpolated too). */
export function densify(points: BrushPoint[], spacing: number): BrushPoint[] {
  if (points.length < 2) return points.slice()
  const step = Math.max(0.5, spacing)
  const out: BrushPoint[] = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const distance = Math.hypot(b.x - a.x, b.y - a.y)
    const count = Math.floor(distance / step)
    for (let k = 1; k <= count; k += 1) {
      const t = (k * step) / distance
      if (t >= 1) break
      const point: BrushPoint = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (typeof a.p === 'number' || typeof b.p === 'number') point.p = (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * t
      out.push(point)
    }
    out.push(b)
  }
  return out
}

export function strokeCrop(points: BrushPoint[], radius: number, width: number, height: number, pad = 2): Crop {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  const x = Math.max(0, Math.floor(minX - radius - pad))
  const y = Math.max(0, Math.floor(minY - radius - pad))
  const right = Math.min(width, Math.ceil(maxX + radius + pad))
  const bottom = Math.min(height, Math.ceil(maxY + radius + pad))
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

/** Merkezden `distance` uzakliktaki firca opakligi. */
export function brushProfile(distance: number, radius: number, hardness: number) {
  if (radius <= 0) return 0
  if (hardness >= 0.999) return Math.max(0, Math.min(1, radius - distance + 0.5))
  if (distance >= radius) return 0
  const inner = radius * Math.max(0, hardness)
  if (distance <= inner) return 1
  const t = (distance - inner) / (radius - inner)
  return 1 - t * t * (3 - 2 * t)
}

/** Firca izinin kirpinti icindeki opaklik haritasi (0-1). */
export function stampMask(points: BrushPoint[], radius: number, hardness: number, crop: Crop): Float32Array {
  const mask = new Float32Array(crop.w * crop.h)
  if (!points.length || crop.w <= 0 || crop.h <= 0) return mask
  const stamps = densify(points, Math.max(0.75, radius * 0.25))
  for (const stamp of stamps) {
    const r = Math.max(0.5, radius * (typeof stamp.p === 'number' ? Math.max(0.05, stamp.p) : 1))
    const cx = stamp.x - crop.x
    const cy = stamp.y - crop.y
    const x0 = Math.max(0, Math.floor(cx - r - 1))
    const x1 = Math.min(crop.w - 1, Math.ceil(cx + r + 1))
    const y0 = Math.max(0, Math.floor(cy - r - 1))
    const y1 = Math.min(crop.h - 1, Math.ceil(cy + r + 1))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const value = brushProfile(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), r, hardness)
        const index = y * crop.w + x
        if (value > mask[index]) mask[index] = value
      }
    }
  }
  return mask
}

/** Binary mask of the polygon (page coordinates) inside the crop. */
export function polygonMask(polygon: Array<{ x: number, y: number }>, crop: Crop): Uint8Array {
  const mask = new Uint8Array(crop.w * crop.h)
  if (polygon.length < 3) return mask
  for (let y = 0; y < crop.h; y += 1) {
    const py = crop.y + y + 0.5
    // Tarama cizgisi: kenar kesisimleri siralanir, ciftler arasi doldurulur.
    const hits: number[] = []
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i]
      const b = polygon[j]
      if ((a.y > py) !== (b.y > py)) hits.push(a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    hits.sort((left, right) => left - right)
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const from = Math.max(0, Math.ceil(hits[k] - crop.x - 0.5))
      const to = Math.min(crop.w - 1, Math.floor(hits[k + 1] - crop.x - 0.5))
      for (let x = from; x <= to; x += 1) mask[y * crop.w + x] = 1
    }
  }
  return mask
}

/** A box selection (two corners) becomes a polygon. */
export function boxPolygon(a: { x: number, y: number }, b: { x: number, y: number }) {
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
}

/**
 * Magic wand: pixels within `tolerance` of the seed pixel's color on every channel,
 * 4-neighbor connected to the seed. The result is full image size with a bounding box.
 */
export function floodMask(data: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number, tolerance: number) {
  const mask = new Uint8Array(width * height)
  const sx = Math.round(seedX)
  const sy = Math.round(seedY)
  const bounds = { x: sx, y: sy, w: 0, h: 0 }
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { mask, bounds }
  const seed = (sy * width + sx) * 4
  const r = data[seed]
  const g = data[seed + 1]
  const b = data[seed + 2]
  const near = (index: number) => {
    const offset = index * 4
    return Math.abs(data[offset] - r) <= tolerance && Math.abs(data[offset + 1] - g) <= tolerance && Math.abs(data[offset + 2] - b) <= tolerance
  }
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  let minX = sx
  let maxX = sx
  let minY = sy
  let maxY = sy
  const start = sy * width + sx
  mask[start] = 1
  queue[tail++] = start
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = (index - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (x > 0 && !mask[index - 1] && near(index - 1)) { mask[index - 1] = 1; queue[tail++] = index - 1 }
    if (x < width - 1 && !mask[index + 1] && near(index + 1)) { mask[index + 1] = 1; queue[tail++] = index + 1 }
    if (y > 0 && !mask[index - width] && near(index - width)) { mask[index - width] = 1; queue[tail++] = index - width }
    if (y < height - 1 && !mask[index + width] && near(index + width)) { mask[index + width] = 1; queue[tail++] = index + width }
  }
  return { mask, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

/** Blends the source over the target with `alpha` opacity (RGBA, same size). */
export function blendInto(target: Uint8ClampedArray, source: Uint8ClampedArray | [number, number, number], alpha: ArrayLike<number>, opacity = 1) {
  const solid = !(source instanceof Uint8ClampedArray)
  for (let index = 0; index < alpha.length; index += 1) {
    const a = alpha[index] * opacity
    if (a <= 0) continue
    const offset = index * 4
    const sr = solid ? source[0] : source[offset]
    const sg = solid ? source[1] : source[offset + 1]
    const sb = solid ? source[2] : source[offset + 2]
    if (a >= 1) {
      target[offset] = sr
      target[offset + 1] = sg
      target[offset + 2] = sb
      continue
    }
    target[offset] = target[offset] + (sr - target[offset]) * a
    target[offset + 1] = target[offset + 1] + (sg - target[offset + 1]) * a
    target[offset + 2] = target[offset + 2] + (sb - target[offset + 2]) * a
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? 'ffffff'
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}
