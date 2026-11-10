import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const sourcePath = process.argv[2]

if (!sourcePath) {
  console.error('Kullanim: node scripts/extract-journey-strip-v2-from-sheet.mjs <kaynak-gorsel>')
  process.exit(1)
}

const outputDir = path.resolve('tmp/boost-strip-v2-test')

const layerSpecs = [
  {
    name: 'journey-strip-base',
    bandTop: 150,
    bandBottom: 320,
    alphaThreshold: 8,
    paddingX: 16,
    paddingY: 12,
  },
  {
    name: 'journey-strip-glow',
    bandTop: 700,
    bandBottom: 860,
    alphaThreshold: 10,
    paddingX: 18,
    paddingY: 14,
  },
  {
    name: 'journey-strip-dust',
    bandTop: 1180,
    bandBottom: 1300,
    alphaThreshold: 10,
    paddingX: 14,
    paddingY: 12,
  },
]

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function findBoundsWithinBand(data, info, bandTop, bandBottom, alphaThreshold) {
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  const safeTop = clamp(bandTop, 0, info.height - 1)
  const safeBottom = clamp(bandBottom, safeTop + 1, info.height)

  for (let y = safeTop; y < safeBottom; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const idx = (y * info.width + x) * info.channels
      const alpha = data[idx + 3]
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function expandBounds(bounds, info, paddingX, paddingY) {
  const left = clamp(bounds.left - paddingX, 0, info.width - 1)
  const top = clamp(bounds.top - paddingY, 0, info.height - 1)
  const right = clamp(bounds.left + bounds.width - 1 + paddingX, left, info.width - 1)
  const bottom = clamp(bounds.top + bounds.height - 1 + paddingY, top, info.height - 1)

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

async function createContactSheet(assetPaths) {
  const loaded = await Promise.all(
    assetPaths.map(async (assetPath) => {
      const image = sharp(assetPath)
      const metadata = await image.metadata()
      return {
        assetPath,
        image,
        width: metadata.width ?? 1,
        height: metadata.height ?? 1,
      }
    }),
  )

  const cardWidth = 430
  const cardHeight = 210
  const gap = 28
  const padding = 36
  const labelHeight = 30
  const columns = 1
  const rows = loaded.length
  const sheetWidth = padding * 2 + columns * cardWidth
  const sheetHeight = padding * 2 + rows * (cardHeight + labelHeight) + (rows - 1) * gap

  const composites = []

  for (const [index, item] of loaded.entries()) {
    const top = padding + index * (cardHeight + labelHeight + gap)
    const fitted = await item.image
      .resize({
        width: cardWidth,
        height: cardHeight,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()

    composites.push({
      input: fitted,
      left: padding,
      top,
    })
    composites.push({
      input: {
        text: {
          text: `${index + 1}. ${path.basename(item.assetPath)}`,
          font: 'Arial',
          rgba: true,
          width: cardWidth,
          align: 'left',
          dpi: 144,
        },
      },
      left: padding,
      top: top + cardHeight + 4,
    })
  }

  const previewPath = path.join(outputDir, '_preview-sheet.png')
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 246, g: 243, b: 237, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(previewPath)

  return previewPath
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  const image = sharp(sourcePath)
  const metadata = await image.metadata()
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const manifest = {
    source: sourcePath,
    generatedAt: new Date().toISOString(),
    sourceSize: {
      width: metadata.width,
      height: metadata.height,
    },
    assets: [],
  }

  const assetPaths = []

  for (const spec of layerSpecs) {
    const rawBounds = findBoundsWithinBand(data, info, spec.bandTop, spec.bandBottom, spec.alphaThreshold)
    if (!rawBounds) continue

    const crop = expandBounds(rawBounds, info, spec.paddingX, spec.paddingY)
    const outputPath = path.join(outputDir, `${spec.name}.png`)

    await sharp(sourcePath)
      .extract(crop)
      .png()
      .toFile(outputPath)

    assetPaths.push(outputPath)
    manifest.assets.push({
      name: spec.name,
      file: outputPath,
      band: {
        top: spec.bandTop,
        bottom: spec.bandBottom,
      },
      alphaThreshold: spec.alphaThreshold,
      crop,
    })
  }

  const previewPath = await createContactSheet(assetPaths)
  manifest.previewSheet = previewPath

  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
