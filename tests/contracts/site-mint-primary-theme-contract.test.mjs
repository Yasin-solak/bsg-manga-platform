import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const indexCssSource = readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf8')

assert.match(
  indexCssSource,
  /--primary:\s*oklch\(0\.832 0\.074 186\.1\);/,
  'the dark theme primary color must tie to the mint commerce accent family on cards.',
)

assert.match(
  indexCssSource,
  /--primary-foreground:\s*oklch\(0\.11 0 0\);/,
  'text on mint primary must stay readable with a dark foreground.',
)

assert.match(
  indexCssSource,
  /--ring:\s*oklch\(0\.832 0\.074 186\.1\);[\s\S]*--chart-1:\s*oklch\(0\.832 0\.074 186\.1\);/,
  'the focus ring and primary chart color must stay in the same family as mint primary.',
)

assert.match(
  indexCssSource,
  /--sidebar-primary:\s*oklch\(0\.832 0\.074 186\.1\);[\s\S]*--sidebar-accent:\s*oklch\(0\.18 0\.026 186\.1\);/,
  'sidebar active text and back surface must use mint tones instead of red.',
)

assert.doesNotMatch(
  indexCssSource,
  /--(?:primary|ring|sidebar-primary|color-primary):\s*oklch\([^;\n]*(?:25\.5|22\.216|16\.439)[^;\n]*\);/,
  'genel site primary tokenlari kirmizi/rose hue ailesine geri donmemelidir.',
)

assert.match(
  indexCssSource,
  /--destructive:\s*oklch\(0\.704 0\.191 22\.216\);/,
  'destructive/error semantics must stay red, unaffected by the primary change.',
)

console.log('PASS site primary theme kept on the mint commerce line')
