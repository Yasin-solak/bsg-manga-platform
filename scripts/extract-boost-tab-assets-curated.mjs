import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const WORKDIR = process.cwd()
const SOURCE_PATH = path.resolve(WORKDIR, 'deneme.png')
const OUTPUT_DIR = path.resolve(WORKDIR, 'tmp/boost-tab-assets-curated')
const CONTACT_SHEET_PATH = path.join(OUTPUT_DIR, 'contact-sheet.png')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')
const CELL = 220
const COLS = 4

const ASSETS = [
  { name: 'sandik-gumus-kapali', box: { left: 20, top: 20, width: 270, height: 220 } },
  { name: 'sandik-gumus-acik', box: { left: 270, top: 20, width: 310, height: 240 } },
  { name: 'sandik-altin-acik', box: { left: 560, top: 20, width: 320, height: 240 } },
  { name: 'sandik-altin-coinli', box: { left: 860, top: 10, width: 350, height: 250 } },
  { name: 'sandik-prizma-coinli', box: { left: 1170, top: 10, width: 350, height: 250 } },
  { name: 'kubbe-beyaz', box: { left: 20, top: 230, width: 280, height: 240 } },
  { name: 'kubbe-altin', box: { left: 280, top: 220, width: 290, height: 250 } },
  { name: 'kubbe-mor', box: { left: 570, top: 220, width: 300, height: 250 } },
  { name: 'kubbe-prizma', box: { left: 860, top: 220, width: 320, height: 250 } },
  { name: 'kubbe-efsane', box: { left: 1160, top: 220, width: 330, height: 250 } },
  { name: 'sandik-altin-kapali', box: { left: 20, top: 500, width: 280, height: 220 } },
  { name: 'sandik-altin-bos', box: { left: 270, top: 500, width: 310, height: 220 } },
  { name: 'sandik-altin-kucuk-coinli', box: { left: 540, top: 500, width: 350, height: 230 } },
  { name: 'xp-kristal-plaka', box: { left: 900, top: 470, width: 270, height: 240 } },
  { name: 'xp-kure-plaka', box: { left: 1180, top: 470, width: 300, height: 240 } },
  { name: 'kristal-mavi', box: { left: 10, top: 735, width: 270, height: 250 } },
  { name: 'xp-kristal-buyuk-plaka', box: { left: 260, top: 735, width: 330, height: 250 } },
  { name: 'xp-kure-buyuk-plaka', box: { left: 590, top: 735, width: 330, height: 250 } },
  { name: 'rakam-seti-altin', box: { left: 880, top: 680, width: 610, height: 330 } },
]

async function createContactSheet(items) {
  const rows = Math.ceil(items.length / COLS)
  const base = sharp({
    create: {
      width: COLS * CELL,
      height: rows * CELL,
      channels: 4,
      background: { r: 251, g: 251, b: 253, alpha: 1 },
    },
  })

  const composites = []
  for (const [index, item] of items.entries()) {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const cellLeft = col * CELL
    const cellTop = row * CELL
    const thumb = await sharp(item.path)
      .resize({ width: CELL - 34, height: CELL - 60, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    const meta = await sharp(thumb).metadata()
    composites.push({
      input: thumb,
      left: cellLeft + Math.round((CELL - (meta.width || 0)) / 2),
      top: cellTop + 12,
    })
    const label = Buffer.from(`
      <svg width="${CELL}" height="42" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="17" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${index + 1}. ${item.name}</text>
      </svg>
    `)
    composites.push({ input: label, left: cellLeft, top: cellTop + CELL - 40 })
  }

  await base.composite(composites).png().toFile(CONTACT_SHEET_PATH)
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const manifest = []

  for (const [index, asset] of ASSETS.entries()) {
    const fileName = `${String(index + 1).padStart(2, '0')}-${asset.name}.png`
    const outputPath = path.join(OUTPUT_DIR, fileName)
    await sharp(SOURCE_PATH)
      .extract(asset.box)
      .png()
      .toFile(outputPath)

    manifest.push({
      index: index + 1,
      name: asset.name,
      file: outputPath,
      box: asset.box,
    })
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify({
    source: SOURCE_PATH,
    generatedAt: new Date().toISOString(),
    assetCount: manifest.length,
    assets: manifest,
  }, null, 2))

  await createContactSheet(manifest.map((item) => ({ name: item.name, path: item.file })))

  console.log(`Kaynak: ${SOURCE_PATH}`)
  console.log(`Cikti klasoru: ${OUTPUT_DIR}`)
  console.log(`Toplam asset: ${manifest.length}`)
  console.log(`Manifest: ${MANIFEST_PATH}`)
  console.log(`Onizleme: ${CONTACT_SHEET_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
