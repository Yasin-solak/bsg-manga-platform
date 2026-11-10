import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CATALOG_MANGAS, CATALOG_FANSUBS, slugify } from './data/rich-catalog.mjs'

/**
 * Programmatic (placeholder) cover generator for the Phase 2 catalog.
 * For each manga builds an SVG with a theme color gradient + title + genre label,
 * converts to WebP with sharp and writes under public/covers/generated/.
 *
 * Run: node scripts/generate-catalog-covers.mjs
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'covers', 'generated')
const WIDTH = 600
const HEIGHT = 900

const fansubColor = Object.fromEntries(CATALOG_FANSUBS.map((f) => [f.key, f.color]))

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (ch) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]
  ))
}

function darken(hex, factor = 0.45) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// Roughly splits the title into equal lines (for vertical placement mid-cover).
function wrapTitle(title, maxChars = 13) {
  const words = String(title).split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4)
}

function buildSvg(manga) {
  const color = manga.color
  const dark = darken(color, 0.32)
  const accent = darken(color, 0.7)
  const titleLines = wrapTitle(manga.title)
  const startY = HEIGHT / 2 - (titleLines.length - 1) * 38
  const fansubName = (CATALOG_FANSUBS.find((f) => f.key === manga.fansub) || {}).name || ''

  const titleTspans = titleLines
    .map((line, i) => `<text x="${WIDTH / 2}" y="${startY + i * 76}" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="800" fill="#ffffff" letter-spacing="0.5">${escapeXml(line)}</text>`)
    .join('')

  const genreText = manga.genres.join('  •  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="0.55" stop-color="${dark}"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <circle cx="${WIDTH - 90}" cy="140" r="180" fill="#ffffff" opacity="0.06"/>
  <circle cx="80" cy="${HEIGHT - 180}" r="220" fill="#000000" opacity="0.10"/>
  <line x1="60" y1="${startY - 96}" x2="${WIDTH - 60}" y2="${startY - 96}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
  ${titleTspans}
  <line x1="60" y1="${startY + titleLines.length * 76 - 18}" x2="${WIDTH - 60}" y2="${startY + titleLines.length * 76 - 18}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
  <text x="${WIDTH / 2}" y="${HEIGHT - 110}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#ffffff" fill-opacity="0.92" letter-spacing="2">${escapeXml(genreText.toUpperCase())}</text>
  <text x="${WIDTH / 2}" y="${HEIGHT - 64}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="500" fill="#ffffff" fill-opacity="0.7">${escapeXml(fansubName)}</text>
</svg>`
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  let count = 0
  for (const manga of CATALOG_MANGAS) {
    const svg = buildSvg(manga)
    const slug = slugify(manga.title)
    const outPath = path.join(OUT_DIR, `${slug}.webp`)
    await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(outPath)
    count += 1
    console.log(`  + ${slug}.webp`)
  }
  void fansubColor
  console.log(`\n${count} kapak uretildi -> public/covers/generated/`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
