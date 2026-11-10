import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const generatedDir = path.join(rootDir, 'src', 'generated')
const manifestPath = path.join(generatedDir, 'publicImageVariants.generated.ts')
const PUBLIC_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

const TARGETS = [
  {
    sourceDir: path.join(rootDir, 'public', 'covers'),
    outputDir: path.join(rootDir, 'public', 'covers', 'optimized'),
    sourcePublicBase: '/covers',
    outputPublicBase: '/covers/optimized',
    quality: 76,
  },
  {
    sourceDir: path.join(rootDir, 'public', 'backgrounds'),
    outputDir: path.join(rootDir, 'public', 'backgrounds', 'optimized'),
    sourcePublicBase: '/backgrounds',
    outputPublicBase: '/backgrounds/optimized',
    quality: 74,
  },
]

function toPosix(value) {
  return value.replace(/\\/g, '/')
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`
  }

  return `${Math.round(bytes / 1024).toLocaleString('tr-TR')} KB`
}

async function listOptimizableFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => PUBLIC_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'tr'))
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true })
}

async function generateOptimizedAsset({
  sourceFilePath,
  outputFilePath,
  quality,
}) {
  const sourceBuffer = await readFile(sourceFilePath)
  const optimizedBuffer = await sharp(sourceBuffer)
    .rotate()
    .webp({
      quality,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer()

  if (optimizedBuffer.length >= sourceBuffer.length) {
    return {
      sourceBytes: sourceBuffer.length,
      optimizedBytes: sourceBuffer.length,
      written: false,
    }
  }

  await writeFile(outputFilePath, optimizedBuffer)
  return {
    sourceBytes: sourceBuffer.length,
    optimizedBytes: optimizedBuffer.length,
    written: true,
  }
}

async function buildTargetManifest(target) {
  await ensureDir(target.outputDir)

  const fileNames = await listOptimizableFiles(target.sourceDir)
  const manifestEntries = {}
  let sourceBytesTotal = 0
  let optimizedBytesTotal = 0
  let optimizedFileCount = 0
  let skippedFileCount = 0

  for (const fileName of fileNames) {
    const parsed = path.parse(fileName)
    const sourceFilePath = path.join(target.sourceDir, fileName)
    const outputFilePath = path.join(target.outputDir, `${parsed.name}.webp`)

    const result = await generateOptimizedAsset({
      sourceFilePath,
      outputFilePath,
      quality: target.quality,
    })

    sourceBytesTotal += result.sourceBytes
    optimizedBytesTotal += result.optimizedBytes

    if (!result.written) {
      skippedFileCount += 1
      continue
    }

    optimizedFileCount += 1
    manifestEntries[`${target.sourcePublicBase}/${toPosix(fileName)}`] = `${target.outputPublicBase}/${parsed.name}.webp`
  }

  return {
    manifestEntries,
    sourceBytesTotal,
    optimizedBytesTotal,
    optimizedFileCount,
    skippedFileCount,
    sourceFileCount: fileNames.length,
  }
}

function buildManifestSource(manifestEntries) {
  const sortedEntries = Object.entries(manifestEntries)
    .sort(([left], [right]) => left.localeCompare(right, 'tr'))
    .map(([sourcePath, optimizedPath]) => `  ${JSON.stringify(sourcePath)}: ${JSON.stringify(optimizedPath)},`)
    .join('\n')

  return `// Bu dosya scripts/optimize-public-assets.mjs tarafindan uretilir.\n// Public kapak ve arkaplan assetleri icin optimize edilmis varyant haritasi.\n\nexport const PUBLIC_IMAGE_VARIANT_MAP = {\n${sortedEntries}\n} as const\n`
}

async function main() {
  await ensureDir(generatedDir)

  const mergedManifest = {}
  let sourceBytesTotal = 0
  let optimizedBytesTotal = 0
  let optimizedFileCount = 0
  let skippedFileCount = 0
  let sourceFileCount = 0

  for (const target of TARGETS) {
    const result = await buildTargetManifest(target)
    Object.assign(mergedManifest, result.manifestEntries)
    sourceBytesTotal += result.sourceBytesTotal
    optimizedBytesTotal += result.optimizedBytesTotal
    optimizedFileCount += result.optimizedFileCount
    skippedFileCount += result.skippedFileCount
    sourceFileCount += result.sourceFileCount
  }

  await writeFile(manifestPath, buildManifestSource(mergedManifest), 'utf8')

  const savedBytes = Math.max(0, sourceBytesTotal - optimizedBytesTotal)
  console.log(JSON.stringify({
    sourceFileCount,
    optimizedFileCount,
    skippedFileCount,
    sourceBytesTotal,
    optimizedBytesTotal,
    savedBytes,
    savedPretty: formatBytes(savedBytes),
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})