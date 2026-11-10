import { inpaint } from './inpaint'

/*
 * Content-aware fill (block-based exemplar fill). Telea inpainting only
 * blurs; on screentone and hatched texture it left "X"-shaped gray smudges.
 * Here the mask is split into BLOCK x BLOCK blocks. The block with the most known surroundings is
 * filled first: its known ring is compared against every offset in the search window and
 * copied from the best-fitting source. A filled block joins the ring of later
 * blocks, so structures such as screentone phase, hair strands and line direction continue
 * block by block. Remaining pixels with no valid source are closed with Telea.
 */

const BLOCK = 16
const RING = 3
const MAX_RING_SAMPLES = 260

export function patchFill(input: { pixels: Uint8ClampedArray, width: number, height: number, mask: Uint8Array }): Uint8ClampedArray {
  const { pixels, width, height, mask } = input
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let area = 0
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    area += 1
    const x = index % width
    const y = (index - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const out = new Uint8ClampedArray(pixels)
  if (maxX < 0) return out

  // Summed area table of the original mask: is there mask in the source rectangle? (O(1))
  const sat = new Int32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < width; x += 1) {
      rowSum += mask[y * width + x]
      sat[(y + 1) * (width + 1) + (x + 1)] = sat[y * (width + 1) + (x + 1)] + rowSum
    }
  }
  const maskedIn = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) return true
    const w1 = width + 1
    return sat[(y1 + 1) * w1 + (x1 + 1)] - sat[y0 * w1 + (x1 + 1)] - sat[(y1 + 1) * w1 + x0] + sat[y0 * w1 + x0] > 0
  }

  const unknown = new Uint8Array(mask)
  type Block = { bx: number, by: number, x0: number, y0: number, x1: number, y1: number }
  const blocks: Block[] = []
  for (let by = minY; by <= maxY; by += BLOCK) {
    for (let bx = minX; bx <= maxX; bx += BLOCK) {
      const x1 = Math.min(maxX, bx + BLOCK - 1)
      const y1 = Math.min(maxY, by + BLOCK - 1)
      let any = false
      for (let y = by; y <= y1 && !any; y += 1) for (let x = bx; x <= x1; x += 1) if (mask[y * width + x]) { any = true; break }
      if (any) blocks.push({ bx, by, x0: bx, y0: by, x1, y1 })
    }
  }
  const reach = Math.max(40, Math.min(area > 40_000 ? 56 : 96, Math.max(maxX - minX, maxY - minY) + BLOCK * 2))

  const ringOf = (block: Block) => {
    const ring: number[] = []
    for (let y = Math.max(0, block.y0 - RING); y <= Math.min(height - 1, block.y1 + RING); y += 1) {
      for (let x = Math.max(0, block.x0 - RING); x <= Math.min(width - 1, block.x1 + RING); x += 1) {
        const index = y * width + x
        if (unknown[index]) continue
        // Yalniz blogun doldurulacak piksellerine yakin bilinenler halkadir.
        let near = false
        for (let dy = -RING; dy <= RING && !near; dy += 1) {
          const ny = y + dy
          if (ny < block.y0 || ny > block.y1) continue
          for (let dx = -RING; dx <= RING; dx += 1) {
            const nx = x + dx
            if (nx >= block.x0 && nx <= block.x1 && unknown[ny * width + nx]) { near = true; break }
          }
        }
        if (near) ring.push(index)
      }
    }
    return ring
  }

  // Blok cevresindeki (1 px cerceve) bilinen piksel sayisi: ucuz oncelik olcusu.
  const knownAround = (block: Block) => {
    let count = 0
    const x0 = block.x0 - 1
    const x1 = block.x1 + 1
    const y0 = block.y0 - 1
    const y1 = block.y1 + 1
    const known = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !unknown[y * width + x]
    for (let x = x0; x <= x1; x += 1) { if (known(x, y0)) count += 1; if (known(x, y1)) count += 1 }
    for (let y = y0 + 1; y < y1; y += 1) { if (known(x0, y)) count += 1; if (known(x1, y)) count += 1 }
    return count
  }

  while (blocks.length) {
    // The block with the most known surroundings first (outside in, like an onion).
    let pick = 0
    let pickScore = -1
    for (let index = 0; index < blocks.length; index += 1) {
      const score = knownAround(blocks[index])
      if (score > pickScore) { pick = index; pickScore = score }
    }
    if (pickScore <= 0) break
    const block = blocks.splice(pick, 1)[0]
    const pickRing = ringOf(block)
    if (!pickRing.length) continue
    const stride = Math.max(1, Math.ceil(pickRing.length / MAX_RING_SAMPLES))
    const samples = pickRing.filter((_, index) => index % stride === 0)
    let best = { dx: 0, dy: 0, cost: Infinity }
    const cost = (dx: number, dy: number, limit: number) => {
      if (maskedIn(block.x0 - RING + dx, block.y0 - RING + dy, block.x1 + RING + dx, block.y1 + RING + dy)) return Infinity
      const shift = dy * width + dx
      let sum = 0
      for (const index of samples) {
        const a = index * 4
        const b = (index + shift) * 4
        const dr = out[a] - out[b]
        const dg = out[a + 1] - out[b + 1]
        const db = out[a + 2] - out[b + 2]
        sum += dr * dr + dg * dg + db * db
        if (sum >= limit) return Infinity
      }
      return sum
    }
    // Coarse search uses even offsets (aligned to 0): starting from odd numbers, textures with an even
    // period such as screentone never matched.
    const from = -Math.floor(reach / 2) * 2
    for (let dy = from; dy <= reach; dy += 2) {
      for (let dx = from; dx <= reach; dx += 2) {
        if (Math.abs(dx) <= BLOCK && Math.abs(dy) <= BLOCK) continue
        const value = cost(dx, dy, best.cost)
        if (value < best.cost) best = { dx, dy, cost: value }
      }
    }
    if (!Number.isFinite(best.cost)) continue
    const coarse = best
    for (let dy = coarse.dy - 1; dy <= coarse.dy + 1; dy += 1) {
      for (let dx = coarse.dx - 1; dx <= coarse.dx + 1; dx += 1) {
        const value = cost(dx, dy, best.cost)
        if (value < best.cost) best = { dx, dy, cost: value }
      }
    }
    const shift = best.dy * width + best.dx
    for (let y = block.y0; y <= block.y1; y += 1) {
      for (let x = block.x0; x <= block.x1; x += 1) {
        const index = y * width + x
        if (!unknown[index]) continue
        const a = index * 4
        const b = (index + shift) * 4
        out[a] = out[b]
        out[a + 1] = out[b + 1]
        out[a + 2] = out[b + 2]
        out[a + 3] = 255
        unknown[index] = 0
      }
    }
  }

  let remaining = 0
  for (let index = 0; index < unknown.length; index += 1) remaining += unknown[index]
  return remaining ? inpaint({ pixels: out, width, height, mask: unknown }) : out
}
