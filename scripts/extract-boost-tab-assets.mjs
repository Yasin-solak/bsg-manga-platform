import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const WORKDIR = process.cwd()
const SOURCE_PATH = path.resolve(WORKDIR, process.argv[2] || 'deneme.png')
const OUTPUT_DIR = path.resolve(WORKDIR, process.argv[3] || 'tmp/boost-tab-assets')
const CONTACT_SHEET_PATH = path.join(OUTPUT_DIR, 'contact-sheet.png')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')

const BACKGROUND_THRESHOLD = 238
const MIN_COMPONENT_AREA = 1500
const PADDING = 16
const CONTACT_CELL_SIZE = 220
const CONTACT_COLUMNS = 4

const EXPECTED_NAMES = [
  'sandik-gumus-kapali',
  'sandik-gumus-acik',
  'sandik-altin-acik',
  'sandik-altin-acik-coinli',
  'sandik-prizma-acik-coinli',
  'kubbe-beyaz',
  'kubbe-altin',
  'kubbe-mor',
  'kubbe-prizma',
  'kubbe-efsane',
  'sandik-altin-kapali',
  'sandik-altin-acik-bos',
  'sandik-altin-acik-coinli-kucuk',
  'xp-kristal-plaka',
  'xp-kure-plaka',
  'kristal-mavi',
  'xp-kristal-altin-plaka',
  'xp-kure-efsane-plaka',
  'rakam-seti-altin',
]

function getIndex(width, x, y) {
  return (y * width + x) * 4
}

function isEdgeBackground(data, width, x, y) {
  const idx = getIndex(width, x, y)
  const r = data[idx]
  const g = data[idx + 1]
  const b = data[idx + 2]
  const a = data[idx + 3]
  if (a < 8) return true
  return r >= BACKGROUND_THRESHOLD && g >= BACKGROUND_THRESHOLD && b >= BACKGROUND_THRESHOLD
}

function transparentEdgeBackground(data, width, height) {
  const visited = new Uint8Array(width * height)
  const queue = []

  function push(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const key = y * width + x
    if (visited[key]) return
    if (!isEdgeBackground(data, width, x, y)) return
    visited[key] = 1
    queue.push([x, y])
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift()
    const idx = getIndex(width, x, y)
    data[idx + 3] = 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
}

function collectComponents(data, width, height) {
  const visited = new Uint8Array(width * height)
  const components = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = y * width + x
      if (visited[key]) continue
      const idx = getIndex(width, x, y)
      if (data[idx + 3] < 20) continue

      const queue = [[x, y]]
      visited[key] = 1
      let area = 0
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()
        const currentIdx = getIndex(width, cx, cy)
        if (data[currentIdx + 3] < 20) continue

        area += 1
        if (cx < minX) minX = cx
        if (cy < minY) minY = cy
        if (cx > maxX) maxX = cx
        if (cy > maxY) maxY = cy

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const neighborKey = ny * width + nx
          if (visited[neighborKey]) continue
          visited[neighborKey] = 1
          const neighborIdx = getIndex(width, nx, ny)
          if (data[neighborIdx + 3] >= 20) {
            queue.push([nx, ny])
          }
        }
      }

      const boxWidth = maxX - minX + 1
      const boxHeight = maxY - minY + 1
      if (area < MIN_COMPONENT_AREA || boxWidth < 24 || boxHeight < 24) continue

      components.push({
        area,
        x: minX,
        y: minY,
        width: boxWidth,
        height: boxHeight,
      })
    }
  }

  return components
}

function sortComponents(components) {
  return components
    .slice()
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) <= 40) return a.x - b.x
      return a.y - b.y
    })
}

function clampBox(component, imageWidth, imageHeight) {
  const left = Math.max(0, component.x - PADDING)
  const top = Math.max(0, component.y - PADDING)
  const right = Math.min(imageWidth, component.x + component.width + PADDING)
  const bottom = Math.min(imageHeight, component.y + component.height + PADDING)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function createContactSheet(outputDir, assets) {
  const rows = Math.ceil(assets.length / CONTACT_COLUMNS)
  const width = CONTACT_COLUMNS * CONTACT_CELL_SIZE
  const height = rows * CONTACT_CELL_SIZE
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 250, g: 250, b: 252, alpha: 1 },
    },
  })

  const composites = []
  for (const [index, asset] of assets.entries()) {
    const col = index % CONTACT_COLUMNS
    const row = Math.floor(index / CONTACT_COLUMNS)
    const cellLeft = col * CONTACT_CELL_SIZE
    const cellTop = row * CONTACT_CELL_SIZE
    const thumbBuffer = await sharp(asset.path)
      .resize({
        width: CONTACT_CELL_SIZE - 40,
        height: CONTACT_CELL_SIZE - 70,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()
    const meta = await sharp(thumbBuffer).metadata()
    const thumbLeft = cellLeft + Math.round((CONTACT_CELL_SIZE - (meta.width || 0)) / 2)
    const thumbTop = cellTop + 18
    composites.push({ input: thumbBuffer, left: thumbLeft, top: thumbTop })

    const labelSvg = Buffer.from(`
      <svg width="${CONTACT_CELL_SIZE}" height="44" xmlns="http://www.w3.org/2000/svg">
        <text x="14" y="18" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#111827">${index + 1}. ${asset.name}</text>
      </svg>
    `)
    composites.push({ input: labelSvg, left: cellLeft, top: cellTop + CONTACT_CELL_SIZE - 42 })
  }

  await base.composite(composites).png().toFile(path.join(outputDir, 'contact-sheet.png'))
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const { data, info } = await sharp(SOURCE_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  transparentEdgeBackground(data, info.width, info.height)
  const transparentSheet = sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })

  const components = sortComponents(collectComponents(data, info.width, info.height))
  const manifest = []

  for (const [index, component] of components.entries()) {
    const box = clampBox(component, info.width, info.height)
    const semanticName = EXPECTED_NAMES[index] || `asset-${String(index + 1).padStart(2, '0')}`
    const fileName = `${String(index + 1).padStart(2, '0')}-${sanitizeName(semanticName)}.png`
    const outputPath = path.join(OUTPUT_DIR, fileName)

    await transparentSheet
      .clone()
      .extract(box)
      .png()
      .toFile(outputPath)

    manifest.push({
      index: index + 1,
      name: semanticName,
      file: outputPath,
      box,
      area: component.area,
    })
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify({
    source: SOURCE_PATH,
    generatedAt: new Date().toISOString(),
    assetCount: manifest.length,
    assets: manifest,
  }, null, 2))

  await createContactSheet(OUTPUT_DIR, manifest.map((item) => ({ name: item.name, path: item.file })))

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
