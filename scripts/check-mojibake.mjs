import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = ['src', 'docs', 'scripts']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.md'])
const LEGACY_ALLOWLIST = new Set([
  'src/pages/FansubDetailPage.tsx',
  'src/services/badgeService.ts',
  'src/services/mangaService.ts',
  'src/types/index.ts',
])
const SUSPICIOUS_PATTERNS = [
  '\u00C3', // U+00C3
  '\u00C2', // U+00C2
  '\uFFFD', // U+FFFD replacement char
  '\u00E2\u20AC\u201D',
  '\u00E2\u20AC\u201C',
  '\u00E2\u20AC\u0153',
  '\u00E2\u20AC\u009D',
  '\u00E2\u20AC\u00A6',
]

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (EXTENSIONS.has(ext)) out.push(fullPath)
  }
  return out
}

function findSuspiciousLines(content) {
  const lines = content.split(/\r?\n/)
  const hits = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (SUSPICIOUS_PATTERNS.some((pattern) => line.includes(pattern))) {
      hits.push({ line: index + 1, text: line.trim() })
    }
  }
  return hits
}

function main() {
  const files = TARGET_DIRS
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => walk(dir))

  const findings = []

  for (const filePath of files) {
    const relative = path.relative(ROOT, filePath).replaceAll('\\', '/')
    if (LEGACY_ALLOWLIST.has(relative)) continue

    const content = fs.readFileSync(filePath, 'utf8')
    const hits = findSuspiciousLines(content)
    if (hits.length === 0) continue
    findings.push({ filePath, relative, hits })
  }

  if (findings.length === 0) {
    console.log('Encoding check OK: mojibake pattern bulunmadi.')
    return
  }

  console.error('Encoding check FAILED: supheli metinler bulundu.')
  findings.forEach((entry) => {
    entry.hits.slice(0, 10).forEach((hit) => {
      console.error(`- ${entry.relative}:${hit.line}: ${hit.text}`)
    })
    if (entry.hits.length > 10) {
      console.error(`- ${entry.relative}: +${entry.hits.length - 10} ek satir`)
    }
  })
  process.exitCode = 1
}

main()
