import { balloonSearchCrop, findBalloonRegion } from '@/lib/mangaTypeset/balloonRegion'
import { blendInto, boxPolygon, densify, floodMask, hexToRgb, polygonMask, stampMask, strokeCrop } from '@/lib/mangaTypeset/brush'
import { buildTextMask, inpaint } from '@/lib/mangaTypeset/inpaint'
import { patchFill } from '@/lib/mangaTypeset/patchFill'
import type { TlItem, TlStroke } from '@/services/translationEditorService'
import { txa } from '@/i18n/activeLocale'

/*
 * 'Clean' view: the raw page with text removed. Each area is processed in its own crop
 * (masking a whole large webtoon page is expensive):
 * - white: ink pixels in the area are painted white (flat balloon)
 * - heal: the ink mask is repaired from its surroundings with Telea (over art)
 * In a balloon/narration area the balloon itself is searched first (balloonRegion): if found
 * its whole interior is painted the background color; columns outside the box are erased too.
 * Then brush and heal strokes in the page cleaning layer apply in order.
 * Eraser strokes apply at the data level (eraseStrokes) and are not drawn here.
 */

const PAD = 4

type Box = { x: number, y: number, w: number, h: number }

function cropBox(box: Box, width: number, height: number) {
  const x = Math.max(0, Math.floor(box.x - PAD))
  const y = Math.max(0, Math.floor(box.y - PAD))
  const right = Math.min(width, Math.ceil(box.x + box.w + PAD))
  const bottom = Math.min(height, Math.ceil(box.y + box.h + PAD))
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

const luminance = (data: Uint8ClampedArray, offset: number) => 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]

/**
 * The background color is measured from the area's edge (median). A balloon interior is usually white, but
 * a sign/narration can be light text on dark; there "painting white" would turn the area
 * into a block. If the background is dark, light pixels count as ink and the fill uses the
 * background color.
 */
export function sampleBackground(data: Uint8ClampedArray, cropWidth: number, region: Box) {
  const samples: Array<[number, number, number, number]> = []
  const x0 = Math.max(0, Math.round(region.x))
  const y0 = Math.max(0, Math.round(region.y))
  const x1 = Math.max(x0, Math.round(region.x + region.w) - 1)
  const y1 = Math.max(y0, Math.round(region.y + region.h) - 1)
  const push = (x: number, y: number) => {
    const offset = (y * cropWidth + x) * 4
    samples.push([luminance(data, offset), data[offset], data[offset + 1], data[offset + 2]])
  }
  const stepX = Math.max(1, Math.floor((x1 - x0) / 48))
  const stepY = Math.max(1, Math.floor((y1 - y0) / 48))
  for (let x = x0; x <= x1; x += stepX) { push(x, y0); push(x, y1) }
  for (let y = y0; y <= y1; y += stepY) { push(x0, y); push(x1, y) }
  samples.sort((a, b) => a[0] - b[0])
  const median = samples[Math.floor(samples.length / 2)] ?? [255, 255, 255, 255]
  return { luminance: median[0], rgb: [median[1], median[2], median[3]] as const }
}

/**
 * Is text darker or lighter than the background: counts of clearly dark and clearly light pixels in the
 * area are compared against the edge median. White text on a gray sign (a real test's uncleaned
 * "誠同病院") gets the right polarity without tripping the dark background threshold.
 */
export function inkIsDark(data: Uint8ClampedArray, cropWidth: number, region: Box, backgroundLuminance: number) {
  let darker = 0
  let lighter = 0
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.ceil(region.x + region.w) - 1
  const y1 = Math.ceil(region.y + region.h) - 1
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const value = luminance(data, (y * cropWidth + x) * 4)
      if (value < backgroundLuminance - 50) darker += 1
      else if (value > backgroundLuminance + 50) lighter += 1
    }
  }
  if (backgroundLuminance > 205) return true
  if (backgroundLuminance < 50) return false
  return darker >= lighter
}

export function buildInkMask(data: Uint8ClampedArray, cropWidth: number, cropHeight: number, region: Box, dilate: number) {
  const background = sampleBackground(data, cropWidth, region)
  const lightBackground = inkIsDark(data, cropWidth, region, background.luminance)
  if (lightBackground) {
    // The threshold follows the area's light side (75th percentile), not the edge median: when the edge
    // fell on screentone the threshold dropped and letter traces stayed faint.
    const paperSamples: number[] = []
    for (let y = Math.max(0, Math.floor(region.y)); y < Math.min(cropHeight, Math.ceil(region.y + region.h)); y += 2) {
      for (let x = Math.max(0, Math.floor(region.x)); x < Math.min(cropWidth, Math.ceil(region.x + region.w)); x += 2) {
        paperSamples.push(luminance(data, (y * cropWidth + x) * 4))
      }
    }
    paperSamples.sort((a, b) => a - b)
    const paper = Math.max(background.luminance, paperSamples[Math.floor(paperSamples.length * 0.75)] ?? 0)
    const mask = buildTextMask({
      pixels: data, width: cropWidth, height: cropHeight,
      region: { x: region.x, y: region.y, width: region.w, height: region.h },
      // Anti-aliased (gray) pixels at text edges also count as ink; otherwise letter
      // traces stayed as a faint outline.
      inkThreshold: Math.min(200, Math.max(60, paper - 40)),
      // Raw threshold first; screentone dots are filtered before inflating (before merging), then inflated.
      dilate: 0,
    })
    const paperRgb = paper > background.luminance + 10 ? [paper, paper, paper] as const : background.rgb
    const cleaned = dilateMask(dropSpeckles(mask, cropWidth, cropHeight), cropWidth, dilate + 1)
    return { mask: cleaned, background: { luminance: paper, rgb: paperRgb, edge: background.luminance } }
  }
  const mask = new Uint8Array(cropWidth * cropHeight)
  // In light text edge samples also hit letters; the background is measured from the area's dark
  // side (35th percentile), otherwise the threshold rose and left a letter halo.
  const insideLuminance: number[] = []
  for (let y = Math.max(0, Math.floor(region.y)); y < Math.min(cropHeight, Math.ceil(region.y + region.h)); y += 2) {
    for (let x = Math.max(0, Math.floor(region.x)); x < Math.min(cropWidth, Math.ceil(region.x + region.w)); x += 2) {
      insideLuminance.push(luminance(data, (y * cropWidth + x) * 4))
    }
  }
  insideLuminance.sort((a, b) => a - b)
  const darkSide = insideLuminance[Math.floor(insideLuminance.length * 0.35)] ?? background.luminance
  const threshold = Math.min(245, Math.min(background.luminance, darkSide) + 30)
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(cropWidth - 1, Math.ceil(region.x + region.w))
  const y1 = Math.min(cropHeight - 1, Math.ceil(region.y + region.h))
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (luminance(data, (y * cropWidth + x) * 4) > threshold) mask[y * cropWidth + x] = 1
    }
  }
  // Acik yazinin beyaz halesi genis: onarim cevreden beyaz cekmesin diye maske kalin.
  for (let step = 0; step < dilate + 2; step += 1) {
    const source = new Uint8Array(mask)
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!source[y * cropWidth + x]) continue
        if (x > 0) mask[y * cropWidth + x - 1] = 1
        if (x < cropWidth - 1) mask[y * cropWidth + x + 1] = 1
        if (y > 0) mask[(y - 1) * cropWidth + x] = 1
        if (y < cropHeight - 1) mask[(y + 1) * cropWidth + x] = 1
      }
    }
  }
  return { mask, background: { ...background, edge: background.luminance } }
}

const SPECKLE_AREA = 14
const SPECKLE_REACH = 4

export function dilateMask(mask: Uint8Array, width: number, steps: number) {
  let current = mask
  for (let step = 0; step < steps; step += 1) {
    const next = new Uint8Array(current)
    for (let index = 0; index < current.length; index += 1) {
      if (!current[index]) continue
      const x = index % width
      if (x > 0) next[index - 1] = 1
      if (x < width - 1) next[index + 1] = 1
      if (index >= width) next[index - width] = 1
      if (index + width < current.length) next[index + width] = 1
    }
    current = next
  }
  return current
}

/**
 * Drops small lone pieces from the mask (screentone dots); small pieces near large letter
 * pieces (dakuten, dots) stay. Prevents painting the text area flat white and leaving a
 * rectangular blot on a screentone background.
 */
export function dropSpeckles(mask: Uint8Array, width: number, height: number) {
  const label = new Int32Array(mask.length).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start] !== -1) continue
    const id = sizes.length
    let size = 0
    label[start] = id
    stack.push(start)
    while (stack.length) {
      const index = stack.pop() as number
      size += 1
      const x = index % width
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index >= width ? index - width : -1, index + width < mask.length ? index + width : -1]
      for (const next of neighbours) {
        if (next < 0 || !mask[next] || label[next] !== -1) continue
        label[next] = id
        stack.push(next)
      }
    }
    sizes.push(size)
  }
  if (!sizes.some((size) => size <= SPECKLE_AREA)) return mask
  const nearBig = new Uint8Array(mask.length)
  for (let index = 0; index < mask.length; index += 1) {
    if (label[index] < 0 || sizes[label[index]] <= SPECKLE_AREA) continue
    const x = index % width
    const y = (index - x) / width
    for (let dy = -SPECKLE_REACH; dy <= SPECKLE_REACH; dy += 1) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -SPECKLE_REACH; dx <= SPECKLE_REACH; dx += 1) {
        const nx = x + dx
        if (nx >= 0 && nx < width) nearBig[ny * width + nx] = 1
      }
    }
  }
  const out = new Uint8Array(mask.length)
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    if (sizes[label[index]] > SPECKLE_AREA || nearBig[index]) out[index] = 1
  }
  return out
}

/** Ray casting: is the point inside the polygon (lasso area)? */
export function pointInPolygon(x: number, y: number, polygon: Array<{ x: number, y: number }>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

type CleanableItem = Pick<TlItem, 'x' | 'y' | 'w' | 'h' | 'shape' | 'cleanup'> & { polygon?: TlItem['polygon'], type?: TlItem['type'] }

/**
 * Balloon/narration: the whole balloon is painted the background color. With a lasso area the user's drawn
 * boundary is authoritative; in that case and if no balloon is found it returns false (threshold method).
 */
function cleanBalloon(context: CanvasRenderingContext2D, item: CleanableItem, width: number, height: number) {
  if (item.cleanup !== 'beyaz' || (item.type !== 'balon' && item.type !== 'anlatim')) return false
  if (item.polygon && item.polygon.length >= 3) return false
  const crop = balloonSearchCrop(item, width, height)
  if (crop.w < 8 || crop.h < 8) return false
  const image = context.getImageData(crop.x, crop.y, crop.w, crop.h)
  const region = findBalloonRegion(image.data, crop.w, crop.h, { x: item.x - crop.x, y: item.y - crop.y, w: item.w, h: item.h })
  if (!region) return false
  if (region.leaked) {
    // Tramli zeminde duz beyaz dolgu dikdortgen leke birakir; yazi parcalari cevreden onarilir.
    const repaired = inpaint({ pixels: image.data, width: crop.w, height: crop.h, mask: region.interior })
    context.putImageData(new ImageData(repaired, crop.w, crop.h), crop.x, crop.y)
    return true
  }
  const [r, g, b] = region.fill
  const data = image.data
  for (let index = 0; index < region.interior.length; index += 1) {
    if (!region.interior[index]) continue
    data[index * 4] = r
    data[index * 4 + 1] = g
    data[index * 4 + 2] = b
  }
  context.putImageData(image, crop.x, crop.y)
  return true
}

/**
 * Sign text is often outlined (white letter + dark edge): a one-way threshold erased
 * only the outline and left the letter as a white blot. A pixel clearly differing from the
 * background in either direction is text.
 */
export function buildSignMask(data: Uint8ClampedArray, cropWidth: number, cropHeight: number, region: Box, dilate: number) {
  const background = sampleBackground(data, cropWidth, region)
  const mask = new Uint8Array(cropWidth * cropHeight)
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(cropWidth - 1, Math.ceil(region.x + region.w))
  const y1 = Math.min(cropHeight - 1, Math.ceil(region.y + region.h))
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (Math.abs(luminance(data, (y * cropWidth + x) * 4) - background.luminance) > 40) mask[y * cropWidth + x] = 1
    }
  }
  for (let step = 0; step < dilate; step += 1) {
    const source = new Uint8Array(mask)
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!source[y * cropWidth + x]) continue
        if (x > 0) mask[y * cropWidth + x - 1] = 1
        if (x < cropWidth - 1) mask[y * cropWidth + x + 1] = 1
        if (y > 0) mask[(y - 1) * cropWidth + x] = 1
        if (y < cropHeight - 1) mask[(y + 1) * cropWidth + x] = 1
      }
    }
  }
  return { mask, background: { ...background, edge: background.luminance } }
}

function cleanItem(context: CanvasRenderingContext2D, item: CleanableItem, width: number, height: number) {
  if (cleanBalloon(context, item, width, height)) return
  const crop = cropBox(item, width, height)
  if (crop.w < 2 || crop.h < 2) return
  const image = context.getImageData(crop.x, crop.y, crop.w, crop.h)
  const region = { x: item.x - crop.x, y: item.y - crop.y, w: item.w, h: item.h }
  // Signs and SFX are often outlined (dark letter + white edge or the reverse).
  const { mask, background } = item.type === 'tabela' || item.type === 'sfx'
    ? buildSignMask(image.data, crop.w, crop.h, region, 2)
    : buildInkMask(image.data, crop.w, crop.h, region, item.cleanup === 'onarim' ? 2 : 1)
  // No ellipse clipping: when the box fit text tightly it left corner characters (first/last letters of
  // vertical text) uncleaned. A closed balloon is already in cleanBalloon.
  // In a lasso area the mask does not leave the polygon.
  if (item.polygon && item.polygon.length >= 3) {
    for (let y = 0; y < crop.h; y += 1) {
      for (let x = 0; x < crop.w; x += 1) {
        if (mask[y * crop.w + x] && !pointInPolygon(x + crop.x + 0.5, y + crop.y + 0.5, item.polygon)) mask[y * crop.w + x] = 0
      }
    }
  }
  // Alan ici ya da kenari saf beyaz degilse (tramli zemin, gradyan) duz dolgu dikdortgen
  // leke birakir; onarim (inpaint) cevreyi surdurur.
  if (item.cleanup === 'beyaz' && background.luminance >= 235 && background.edge >= 235) {
    // "Duz dolgu": murekkep zemin rengiyle kapatilir (balonda beyaz, koyu tabelada koyu).
    const data = image.data
    const [r, g, b] = background.rgb
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue
      data[index * 4] = r
      data[index * 4 + 1] = g
      data[index * 4 + 2] = b
    }
    context.putImageData(image, crop.x, crop.y)
    return
  }
  const repaired = inpaint({ pixels: image.data, width: crop.w, height: crop.h, mask })
  context.putImageData(new ImageData(repaired, crop.w, crop.h), crop.x, crop.y)
}

// ---------------------------------------------------------------------------
// Strokes (brush, heal, stamp, restore, selection). Applied in order to the current canvas state.
// ---------------------------------------------------------------------------

const ALPHA_EDGE = 0.35
const LARGE_FILL = 300_000

function expandCrop(crop: Box, pad: number, width: number, height: number): Box {
  const x = Math.max(0, Math.floor(crop.x - pad))
  const y = Math.max(0, Math.floor(crop.y - pad))
  const right = Math.min(width, Math.ceil(crop.x + crop.w + pad))
  const bottom = Math.min(height, Math.ceil(crop.y + crop.h + pad))
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

function flatFill(pixels: Uint8ClampedArray, width: number, height: number, mask: Uint8Array) {
  const out = new Uint8ClampedArray(pixels)
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  for (let index = 0; index < mask.length; index += 3) {
    if (mask[index]) continue
    const x = index % width
    const y = (index - x) / width
    const touches = (x > 0 && mask[index - 1]) || (x < width - 1 && mask[index + 1]) || (y > 0 && mask[index - width]) || (y < height - 1 && mask[index + width])
    if (!touches) continue
    reds.push(pixels[index * 4]); greens.push(pixels[index * 4 + 1]); blues.push(pixels[index * 4 + 2])
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 255
  blendInto(out, [median(reds), median(greens), median(blues)], mask)
  return out
}

/** Content-aware heal: works in a crop leaving a texture search margin around the mask. */
function repairRegion(context: CanvasRenderingContext2D, maskAt: (x: number, y: number) => boolean, bounds: Box, width: number, height: number) {
  const pad = Math.min(270, Math.max(bounds.w, bounds.h) * 2 + 34)
  const crop = expandCrop(bounds, pad, width, height)
  if (crop.w < 2 || crop.h < 2) return
  const mask = new Uint8Array(crop.w * crop.h)
  let area = 0
  for (let y = Math.max(bounds.y, crop.y); y < Math.min(bounds.y + bounds.h, crop.y + crop.h); y += 1) {
    for (let x = Math.max(bounds.x, crop.x); x < Math.min(bounds.x + bounds.w, crop.x + crop.w); x += 1) {
      if (maskAt(x, y)) { mask[(y - crop.y) * crop.w + (x - crop.x)] = 1; area += 1 }
    }
  }
  if (!area) return
  const image = context.getImageData(crop.x, crop.y, crop.w, crop.h)
  // On a very large area (the whole background via wand) texture search is expensive: a flat fill with the ring's median color.
  const repaired = area > LARGE_FILL ? flatFill(image.data, crop.w, crop.h, mask) : patchFill({ pixels: image.data, width: crop.w, height: crop.h, mask })
  context.putImageData(new ImageData(repaired, crop.w, crop.h), crop.x, crop.y)
}

function applyBrushStroke(context: CanvasRenderingContext2D, stroke: TlStroke, raw: CanvasRenderingContext2D | null, width: number, height: number) {
  const hardness = stroke.hardness ?? 1
  const opacity = stroke.opacity ?? 1
  if (stroke.tool === 'onarim') {
    const bounds = strokeCrop(stroke.points, stroke.radius, width, height)
    if (bounds.w < 2 || bounds.h < 2) return
    const alpha = stampMask(stroke.points, stroke.radius, hardness, bounds)
    repairRegion(context, (x, y) => alpha[(y - bounds.y) * bounds.w + (x - bounds.x)] > ALPHA_EDGE, bounds, width, height)
    return
  }
  const crop = strokeCrop(stroke.points, stroke.radius, width, height)
  if (crop.w < 1 || crop.h < 1) return
  const alpha = stampMask(stroke.points, stroke.radius, hardness, crop)
  const image = context.getImageData(crop.x, crop.y, crop.w, crop.h)
  if (stroke.tool === 'firca') {
    blendInto(image.data, hexToRgb(stroke.color ?? '#ffffff'), alpha, opacity)
  } else if (stroke.tool === 'geri') {
    if (!raw) return
    blendInto(image.data, raw.getImageData(crop.x, crop.y, crop.w, crop.h).data, alpha, opacity)
  } else if (stroke.tool === 'damga') {
    if (!stroke.offset) return
    // The source is the current canvas; a source pixel off the page is not copied.
    const source = context.getImageData(crop.x + stroke.offset.x, crop.y + stroke.offset.y, crop.w, crop.h).data
    for (let index = 0; index < alpha.length; index += 1) if (source[index * 4 + 3] === 0) alpha[index] = 0
    blendInto(image.data, source, alpha, opacity)
  } else {
    return
  }
  context.putImageData(image, crop.x, crop.y)
}

/** Secim bolgesinin maskesi (kutu/kement cokgen, degnek o anki tuvalden). */
export function selectionMask(context: CanvasRenderingContext2D, stroke: Pick<TlStroke, 'shape' | 'points' | 'tolerance'>, width: number, height: number): { bounds: Box, at: (x: number, y: number) => boolean } | null {
  if (stroke.shape === 'degnek') {
    const seed = stroke.points[0]
    if (!seed) return null
    const full = context.getImageData(0, 0, width, height)
    const { mask, bounds } = floodMask(full.data, width, height, seed.x, seed.y, stroke.tolerance ?? 32)
    return { bounds, at: (x, y) => mask[y * width + x] === 1 }
  }
  const polygon = stroke.shape === 'kutu' && stroke.points.length >= 2 ? boxPolygon(stroke.points[0], stroke.points[1]) : stroke.points
  if (polygon.length < 3) return null
  const bounds = strokeCrop(polygon, 0, width, height, 0)
  if (bounds.w < 1 || bounds.h < 1) return null
  const mask = polygonMask(polygon, bounds)
  return { bounds, at: (x, y) => mask[(y - bounds.y) * bounds.w + (x - bounds.x)] === 1 }
}

function applySelectionStroke(context: CanvasRenderingContext2D, stroke: TlStroke, raw: CanvasRenderingContext2D | null, width: number, height: number) {
  const selection = selectionMask(context, stroke, width, height)
  if (!selection) return
  const { bounds, at } = selection
  if (stroke.mode === 'onar') { repairRegion(context, at, bounds, width, height); return }
  const image = context.getImageData(bounds.x, bounds.y, bounds.w, bounds.h)
  const alpha = new Uint8Array(bounds.w * bounds.h)
  for (let y = 0; y < bounds.h; y += 1) for (let x = 0; x < bounds.w; x += 1) if (at(bounds.x + x, bounds.y + y)) alpha[y * bounds.w + x] = 1
  if (stroke.mode === 'geri') {
    if (!raw) return
    blendInto(image.data, raw.getImageData(bounds.x, bounds.y, bounds.w, bounds.h).data, alpha)
  } else {
    blendInto(image.data, hexToRgb(stroke.color ?? '#ffffff'), alpha)
  }
  context.putImageData(image, bounds.x, bounds.y)
}

/** Tek izi o anki tuvale uygular (editorde artimli render bunu kullanir). */
export function applyStroke(context: CanvasRenderingContext2D, stroke: TlStroke, raw: CanvasRenderingContext2D | null, width: number, height: number) {
  if (!stroke.points.length) return
  if (stroke.tool === 'secim') applySelectionStroke(context, stroke, raw, width, height)
  else applyBrushStroke(context, stroke, raw, width, height)
}

/** A readable copy of the raw page (for "restore" strokes). */
export function rawContextOf(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, 0, 0, width, height)
  return context
}

/** Only the automatic cleaning of areas (excluding strokes); the editor caches this separately. */
export async function renderItemsClean(input: {
  source: CanvasImageSource
  width: number
  height: number
  items: CleanableItem[]
  signal?: AbortSignal
}): Promise<HTMLCanvasElement> {
  const { source, width, height, items, signal } = input
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error(txa('Temiz sayfa tuvali açılamadı.'))
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, 0, 0, width, height)
  for (const [index, item] of items.entries()) {
    if (signal?.aborted) throw new DOMException(txa('İptal edildi'), 'AbortError')
    cleanItem(context, item, width, height)
    // On long pages release the main thread now and then so the UI does not freeze.
    if (index % 6 === 5) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return canvas
}

export async function renderCleanPage(input: {
  source: CanvasImageSource
  width: number
  height: number
  items: CleanableItem[]
  strokes: TlStroke[]
  signal?: AbortSignal
}): Promise<HTMLCanvasElement> {
  const { source, width, height, strokes, signal } = input
  const canvas = await renderItemsClean(input)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error(txa('Temiz sayfa tuvali açılamadı.'))
  const raw = strokes.some((stroke) => stroke.tool === 'geri' || stroke.mode === 'geri') ? rawContextOf(source, width, height) : null
  for (const stroke of strokes) {
    if (signal?.aborted) throw new DOMException(txa('İptal edildi'), 'AbortError')
    applyStroke(context, stroke, raw, width, height)
  }
  return canvas
}

/**
 * Eraser: points within the path's radius are removed from strokes; a cut stroke splits into pieces.
 * Strokes are first filled by brush spacing: on a fast stroke points stayed sparse
 * so the line in between could not be erased. Selection actions are unaffected by the eraser.
 */
export function eraseStrokes(strokes: TlStroke[], path: Array<{ x: number, y: number }>, radius: number): TlStroke[] {
  const hit = (point: { x: number, y: number }, strokeRadius: number) => path.some((eraser) => Math.hypot(eraser.x - point.x, eraser.y - point.y) <= radius + strokeRadius * 0.5)
  const result: TlStroke[] = []
  for (const stroke of strokes) {
    if (stroke.tool === 'secim') { result.push(stroke); continue }
    const points = densify(stroke.points, Math.max(1.5, stroke.radius * 0.5))
    if (!points.some((point) => hit(point, stroke.radius))) { result.push(stroke); continue }
    let current: TlStroke['points'] = []
    for (const point of points) {
      if (hit(point, stroke.radius)) {
        if (current.length) result.push({ ...stroke, points: current })
        current = []
      } else {
        current.push({ ...point, x: Math.round(point.x), y: Math.round(point.y) })
      }
    }
    if (current.length) result.push({ ...stroke, points: current })
  }
  return result
}

/**
 * Adds a stroke point from mouse/pen motion: skips very close points, fills the gap up to a far point
 * (for eraser and continuous lines). Pen pressure, if present, is stored on the point.
 */
export function appendPoint(points: TlStroke['points'], point: { x: number, y: number, p?: number }, radius: number): TlStroke['points'] {
  const spacing = Math.max(1.5, radius * 0.35)
  const last = points[points.length - 1]
  const next = { x: Math.round(point.x), y: Math.round(point.y), ...(typeof point.p === 'number' ? { p: Math.round(point.p * 100) / 100 } : {}) }
  if (!last) return [next]
  if (Math.hypot(next.x - last.x, next.y - last.y) < spacing) return points
  if (points.length >= 4096) return points
  const filled = densify([last, next], spacing).slice(1).map((entry) => ({
    x: Math.round(entry.x), y: Math.round(entry.y), ...(typeof entry.p === 'number' ? { p: Math.round(entry.p * 100) / 100 } : {}),
  }))
  return [...points, ...filled].slice(0, 4096)
}
