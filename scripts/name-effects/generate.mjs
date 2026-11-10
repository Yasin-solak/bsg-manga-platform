/* global window */
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import sharp from 'sharp'

// Generates built-in name effect animations: draws frame by frame in the browser, makes animated
// WebP with sharp (public/name-effects). Usage: node scripts/name-effects/generate.mjs [simsek,buz,...]
// Flame came from the given animation by making its black background transparent (keyblack.mjs).
const OUT = 'public/name-effects'
const W = 320
const H = 134
const FRAMES = 20
const DELAY = 80
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
await page.addScriptTag({ content: readFileSync(new URL('./draw.js', import.meta.url), 'utf8') })

for (const name of (process.argv[2] ?? 'simsek,buz,sakura,yildiz,duman').split(',')) {
  const urls = await page.evaluate(([n, f, w, h]) => window.renderEffect(n, f, w, h), [name, FRAMES, W, H])
  const frames = urls.map((url) => Buffer.from(url.split(',')[1], 'base64'))
  const file = `${OUT}/${name}.webp`
  await sharp(frames, { join: { animated: true } })
    .webp({ loop: 0, delay: Array(FRAMES).fill(DELAY), quality: 72, alphaQuality: 80, effort: 6 })
    .toFile(file)
  
  const meta = await sharp(file, { animated: true }).metadata()
  console.log(name, meta.width, meta.pageHeight, meta.pages, `${Math.round(readFileSync(file).length / 1024)}KB`)
}
await browser.close()
