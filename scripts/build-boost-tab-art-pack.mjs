import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const WORKDIR = process.cwd()
const OUTPUT_DIR = path.resolve(WORKDIR, 'public/boost/tab')
const PREVIEW_PATH = path.join(OUTPUT_DIR, '_preview-sheet.png')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')
const CELL = 220
const COLS = 4

const ASSETS = [
  {
    name: 'scene-progress-rail',
    source: 'deneme4.png',
    box: { left: 685, top: 22, width: 790, height: 145 },
    transparentize: false,
  },
  {
    name: 'scene-tier-base',
    source: 'deneme5.png',
    box: { left: 6, top: 8, width: 292, height: 285 },
    transparentize: false,
  },
  {
    name: 'scene-tier-rising',
    source: 'deneme5.png',
    box: { left: 312, top: 8, width: 292, height: 285 },
    transparentize: false,
  },
  {
    name: 'scene-tier-empowered',
    source: 'deneme5.png',
    box: { left: 922, top: 8, width: 284, height: 285 },
    transparentize: false,
  },
  {
    name: 'scene-tier-legend',
    source: 'deneme5.png',
    box: { left: 1222, top: 8, width: 300, height: 300 },
    transparentize: false,
  },
  {
    name: 'reward-xp-crystal',
    source: 'deneme4.png',
    box: { left: 980, top: 555, width: 215, height: 150 },
    transparentize: false,
  },
  {
    name: 'chest-silver-closed',
    source: 'deneme.png',
    box: { left: 18, top: 18, width: 260, height: 210 },
    transparentize: true,
  },
  {
    name: 'chest-gold-closed',
    source: 'deneme.png',
    box: { left: 18, top: 492, width: 280, height: 225 },
    transparentize: true,
  },
  {
    name: 'chest-gold-open',
    source: 'deneme.png',
    box: { left: 585, top: 25, width: 255, height: 200 },
    transparentize: true,
  },
  {
    name: 'chest-gold-open-coins',
    source: 'deneme.png',
    box: { left: 565, top: 530, width: 285, height: 200 },
    transparentize: true,
  },
  {
    name: 'chest-prismatic-open-coins',
    source: 'deneme.png',
    box: { left: 1160, top: 15, width: 360, height: 260 },
    transparentize: true,
  },
  {
    name: 'digits-gold-sheet',
    source: 'deneme5.png',
    box: { left: 610, top: 845, width: 695, height: 90 },
    transparentize: false,
  },
]

function getIndex(width, x, y) {
  return (y * width + x) * 4
}

function sampleCornerColor(data, width, height, offsetX, offsetY) {
  const idx = getIndex(width, offsetX, offsetY)
  return [data[idx], data[idx + 1], data[idx + 2]]
}

function colorDistance(a, b) {
  return Math.sqrt(
    ((a[0] ?? 0) - (b[0] ?? 0)) ** 2
      + ((a[1] ?? 0) - (b[1] ?? 0)) ** 2
      + ((a[2] ?? 0) - (b[2] ?? 0)) ** 2,
  )
}

function transparentizeFromEdges(data, width, height) {
  const corners = [
    sampleCornerColor(data, width, height, 0, 0),
    sampleCornerColor(data, width, height, width - 1, 0),
    sampleCornerColor(data, width, height, 0, height - 1),
    sampleCornerColor(data, width, height, width - 1, height - 1),
  ]

  const avg = [
    Math.round(corners.reduce((sum, c) => sum + c[0], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[1], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[2], 0) / corners.length),
  ]

  const tolerance = 42
  const visited = new Uint8Array(width * height)
  const queue = []

  function isBackground(x, y) {
    const idx = getIndex(width, x, y)
    const alpha = data[idx + 3]
    if (alpha < 10) return true
    const current = [data[idx], data[idx + 1], data[idx + 2]]
    return colorDistance(current, avg) <= tolerance
  }

  function push(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const key = y * width + x
    if (visited[key]) return
    if (!isBackground(x, y)) return
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

async function buildAsset(asset) {
  const sourcePath = path.resolve(WORKDIR, asset.source)
  const { data, info } = await sharp(sourcePath)
    .extract(asset.box)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (asset.transparentize) {
    transparentizeFromEdges(data, info.width, info.height)
  }

  let pipeline = sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })

  pipeline = pipeline.trim(
    asset.transparentize
      ? { background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }
      : { background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 10 },
  )

  const outputPath = path.join(OUTPUT_DIR, `${asset.name}.png`)
  await pipeline.png().toFile(outputPath)

  const meta = await sharp(outputPath).metadata()
  return {
    ...asset,
    outputPath,
    finalSize: {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    },
  }
}

async function createPreview(items) {
  const rows = Math.ceil(items.length / COLS)
  const base = sharp({
    create: {
      width: COLS * CELL,
      height: rows * CELL,
      channels: 4,
      background: { r: 249, g: 249, b: 252, alpha: 1 },
    },
  })
  const composites = []

  for (const [index, item] of items.entries()) {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const left = col * CELL
    const top = row * CELL
    const thumb = await sharp(item.outputPath)
      .resize({ width: CELL - 32, height: CELL - 56, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    const meta = await sharp(thumb).metadata()
    composites.push({
      input: thumb,
      left: left + Math.round((CELL - (meta.width || 0)) / 2),
      top: top + 10,
    })
    const label = Buffer.from(`
      <svg width="${CELL}" height="42" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="17" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${index + 1}. ${item.name}</text>
      </svg>
    `)
    composites.push({ input: label, left, top: top + CELL - 38 })
  }

  await base.composite(composites).png().toFile(PREVIEW_PATH)
}

async function main() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const built = []
  for (const asset of ASSETS) {
    built.push(await buildAsset(asset))
  }

  await createPreview(built)
  await fs.writeFile(MANIFEST_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    assets: built.map(({ outputPath, name, source, box, finalSize }) => ({
      name,
      source,
      file: outputPath,
      cropBox: box,
      finalSize,
    })),
  }, null, 2))

  console.log(`Kalici klasor: ${OUTPUT_DIR}`)
  console.log(`Asset sayisi: ${built.length}`)
  console.log(`Manifest: ${MANIFEST_PATH}`)
  console.log(`Onizleme: ${PREVIEW_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
