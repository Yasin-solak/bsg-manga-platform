/*
 * Multi-selection arranging: alignment, even distribution, smart guide snapping and
 * keeping the group inside the page. Pure functions used by the editor screen and canvas.
 */

export interface ArrangeBox { id: string, x: number, y: number, w: number, h: number }
export interface Bounds { x: number, y: number, w: number, h: number }

export type AlignMode = 'sol' | 'yatayOrta' | 'sag' | 'ust' | 'dikeyOrta' | 'alt' | 'yatayDagit' | 'dikeyDagit'

export function boundsOf(boxes: Bounds[]): Bounds {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))
  return { x, y, w: right - x, h: bottom - y }
}

/**
 * Aligns selected boxes to the group's bounds or evens the gaps between them
 * (distribute: at least 3 boxes; the ends stay in place). Only boxes whose position changes
 * are returned.
 */
export function alignBoxes(boxes: ArrangeBox[], mode: AlignMode): Map<string, { x: number, y: number }> {
  const result = new Map<string, { x: number, y: number }>()
  if (boxes.length < 2) return result
  const group = boundsOf(boxes)
  const put = (box: ArrangeBox, x: number, y: number) => {
    const rx = Math.round(x)
    const ry = Math.round(y)
    if (rx !== box.x || ry !== box.y) result.set(box.id, { x: rx, y: ry })
  }
  if (mode === 'yatayDagit' || mode === 'dikeyDagit') {
    if (boxes.length < 3) return result
    const horizontal = mode === 'yatayDagit'
    const sorted = [...boxes].sort((a, b) => (horizontal ? a.x + a.w / 2 - (b.x + b.w / 2) : a.y + a.h / 2 - (b.y + b.h / 2)))
    const total = sorted.reduce((sum, box) => sum + (horizontal ? box.w : box.h), 0)
    const gap = ((horizontal ? group.w : group.h) - total) / (sorted.length - 1)
    let cursor = horizontal ? group.x : group.y
    for (const box of sorted) {
      if (horizontal) put(box, cursor, box.y)
      else put(box, box.x, cursor)
      cursor += (horizontal ? box.w : box.h) + gap
    }
    return result
  }
  for (const box of boxes) {
    if (mode === 'sol') put(box, group.x, box.y)
    else if (mode === 'yatayOrta') put(box, group.x + group.w / 2 - box.w / 2, box.y)
    else if (mode === 'sag') put(box, group.x + group.w - box.w, box.y)
    else if (mode === 'ust') put(box, box.x, group.y)
    else if (mode === 'dikeyOrta') put(box, box.x, group.y + group.h / 2 - box.h / 2)
    else put(box, box.x, group.y + group.h - box.h)
  }
  return result
}

export interface Guide { axis: 'x' | 'y', at: number }

/**
 * Snaps the moved box's edge/center to other boxes' and the page's edge/center
 * (Photoshop smart guides). Moves to the nearest alignment within the threshold;
 * returns guide lines to show.
 */
export function snapBox(moving: Bounds, others: Bounds[], page: { width: number, height: number }, threshold: number): { dx: number, dy: number, guides: Guide[] } {
  const targetsX = [0, page.width / 2, page.width]
  const targetsY = [0, page.height / 2, page.height]
  for (const box of others) {
    targetsX.push(box.x, box.x + box.w / 2, box.x + box.w)
    targetsY.push(box.y, box.y + box.h / 2, box.y + box.h)
  }
  const pick = (edges: number[], targets: number[]) => {
    let best: { delta: number, at: number } | null = null
    for (const edge of edges) {
      for (const target of targets) {
        const delta = target - edge
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target }
      }
    }
    return best
  }
  const snapX = pick([moving.x, moving.x + moving.w / 2, moving.x + moving.w], targetsX)
  const snapY = pick([moving.y, moving.y + moving.h / 2, moving.y + moving.h], targetsY)
  const guides: Guide[] = []
  if (snapX) guides.push({ axis: 'x', at: snapX.at })
  if (snapY) guides.push({ axis: 'y', at: snapY.at })
  return { dx: snapX?.delta ?? 0, dy: snapY?.delta ?? 0, guides }
}

/** Clips the group offset so the group's bounds do not leave the page. */
export function clampGroupDelta(group: Bounds, dx: number, dy: number, page: { width: number, height: number }) {
  return {
    dx: Math.max(-group.x, Math.min(page.width - group.x - group.w, dx)),
    dy: Math.max(-group.y, Math.min(page.height - group.y - group.h, dy)),
  }
}

/** Does the box intersect the selection rectangle (like Photoshop: touching is enough)? */
export function intersects(a: Bounds, b: Bounds) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
