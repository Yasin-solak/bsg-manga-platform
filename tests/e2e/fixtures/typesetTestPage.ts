import sharp from 'sharp'

/**
 * A synthetic manga page for the Translation Studio.
 *
 * **Why not a real scan.** Copyrighted pages cannot go in the repo; also what the test
 * verifies is not drawing beauty but that the detect->typeset->publish chain
 * works. A synthetic page takes THIS chain through the real code paths:
 * `createImageBitmap`, thresholding, connected component, ray scan, canvas drawing.
 *
 * The geometry comes from the SAME setup as the synthetic page in
 * `tests/contracts/manga-typeset-contract.test.mjs` (two real balloons + three traps). Using the same setup
 * shows that thresholds measured in the contract give the same result in the browser
 * too.
 */

const PAGE_W = 400
const PAGE_H = 300

/** Sayfa basina beklenen gercek balon sayisi; tuzaklar elenmeli. */
export const EXPECTED_BUBBLE_COUNT = 2

export async function buildTypesetTestPagePng(): Promise<Buffer> {
  // Gray ground: the page background must NOT be white, or everything looks like a balloon.
  const gray = new Uint8Array(PAGE_W * PAGE_H).fill(128)

  const put = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= PAGE_W || y >= PAGE_H) return
    gray[y * PAGE_W + x] = value
  }

  const ellipse = (cx: number, cy: number, rx: number, ry: number, outline: boolean) => {
    for (let y = cy - ry - 8; y <= cy + ry + 8; y += 1) {
      for (let x = cx - rx - 8; x <= cx + rx + 8; x += 1) {
        const t = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if (t <= 1) put(x, y, 255)
        else if (outline && t <= 1.3) put(x, y, 20)
      }
    }
  }

  // Text ink INSIDE the balloon: this is the "does this balloon have text" measure.
  const textBars = (cx: number, cy: number) => {
    for (const offset of [-8, 4]) {
      for (let y = cy + offset; y < cy + offset + 6; y += 1) {
        for (let x = cx - 40; x < cx + 40; x += 1) put(x, y, 30)
      }
    }
  }

  // Two real balloons (on the same line; so right-to-left reading order can be tested).
  ellipse(100, 80, 60, 40, true); textBars(100, 80)
  ellipse(280, 80, 55, 38, true); textBars(280, 80)
  // Trap 1: NO outline (white panel). It has text; the only difference is the outline.
  ellipse(100, 220, 55, 38, false); textBars(100, 220)
  // Trap 2: has an outline but is EMPTY INSIDE. Not a balloon for translation.
  ellipse(280, 220, 55, 38, true)
  // Trap 3: a white strip touching the edge (page gutter / margin).
  for (let y = 0; y < PAGE_H; y += 1) for (let x = 0; x < 30; x += 1) put(x, y, 255)

  // Neutral grayscale: the saturation gate drops colored regions, the synthetic page must be
  // colorless or the balloons trip their own gate.
  const rgb = Buffer.alloc(PAGE_W * PAGE_H * 3)
  for (let index = 0; index < gray.length; index += 1) {
    rgb[index * 3] = gray[index]
    rgb[index * 3 + 1] = gray[index]
    rgb[index * 3 + 2] = gray[index]
  }

  return sharp(rgb, { raw: { width: PAGE_W, height: PAGE_H, channels: 3 } })
    .png()
    .toBuffer()
}
