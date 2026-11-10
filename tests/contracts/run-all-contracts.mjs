import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contractDir = __dirname
const contractFiles = readdirSync(contractDir)
  .filter((fileName) => fileName.endsWith('.test.mjs'))
  .sort((left, right) => left.localeCompare(right, 'tr'))

let hasFailure = false

for (const fileName of contractFiles) {
  const fullPath = path.join(contractDir, fileName)
  if (!statSync(fullPath).isFile()) continue
  try {
    await import(pathToFileURL(fullPath).href)
  } catch (error) {
    hasFailure = true
    console.error(`FAIL ${fileName}`)
    console.error(error)
  }
}

if (hasFailure) {
  process.exitCode = 1
}
