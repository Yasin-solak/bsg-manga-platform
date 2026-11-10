import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { featureFlagUsageSource } from './repo-health-feature-flags.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const reportDir = path.join(rootDir, 'docs', 'reports')
const reportJsonPath = path.join(reportDir, 'repo-health-baseline.json')
const reportMarkdownPath = path.join(reportDir, 'repo-health-baseline.md')
const failOnRegression = process.argv.includes('--fail-on-regression')

const IGNORE_DIRS = new Set([
  '.git',
  'dist',
  'node_modules',
  '.wrangler',
  'coverage',
  '.agent',
  // Claude Code arka-plan oturumlari .claude/worktrees/ altina tam repo
  // kopyasi acar; taramaya girerse metrikler ciftlenip strict gate patlar.
  '.claude',
])

const TEST_FILE_REGEX = /(^|\\|\/)(tests|src[\\/]__tests__)[\\/].*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i
const APP_CODE_REGEX = /(^|\\|\/)src[\\/].*\.(ts|tsx|js|jsx|mjs|cjs)$/i
const UI_SURFACE_REGEX = /(^|\\|\/)src[\\/](components|pages)[\\/].*\.(ts|tsx)$/i
const DOC_OR_SQL_REGEX = /(^|\\|\/)(docs|supabase[\\/]migrations)(\\|\/)/i
const UI_HELPER_EXCLUDE_REGEX = /(Loader|Errors|Utils|State|Actions|Derived|Workspace|Persistence|Mutations|Shared)\.(ts|tsx)$/i
const FEATURE_FLAG_BLOCK_PATTERN = /^\s*'([^']+)':\s*\{([\s\S]*?)^\s*\},?/gm
const CONSOLE_PATTERN = /console\.(log|warn|error|info|debug)/g
const LOGGER_USAGE_PATTERN = /\b(createScopedLogger|reportUserFacingError)\b/
const USER_FACING_ERROR_PATTERN = /\b(toUserFacingErrorMessage|buildUserFacingErrorPayload|reportUserFacingError)\b/
const REQUEST_CONTEXT_PATTERN = /\b(createRequestContext|toRequestContextLogContext)\b/
const CATCH_PATTERN = /\bcatch\s*\([^)]*\)\s*\{/
const TOAST_PATTERN = /\btoast\.(success|error|warning|info)\b/
const ERROR_STATE_PATTERN = /\bset(?:Error|LoadError|FormError|SubmitError)\s*\(/
const LOGGER_CALL_PATTERN = /\b[A-Za-z0-9_]+Logger\.(warn|error|info|debug)\s*\(/
const EXPORTED_FUNCTION_PATTERN = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm
const EXPORTED_CONST_PATTERN = /^\s*export\s+const\s+([A-Za-z0-9_]+)\s*=/gm
const EXPORTED_CLASS_PATTERN = /^\s*export\s+class\s+([A-Za-z0-9_]+)/gm
const FEATURE_FLAG_REGISTRY_RELATIVE_PATH = 'src/services/featureFlagRegistry.ts'

const CRITICAL_AREAS = [
  {
    key: 'auth-session',
    label: 'Auth ve session',
    files: [
      'src/services/authService/shared.ts',
      'src/contexts/AuthContext.tsx',
    ],
    relatedTests: ['auth', 'session'],
  },
  {
    key: 'fansub-hover-detail',
    label: 'Fansub hover/detail',
    files: [
      'src/components/common/FansubHoverCard.tsx',
      'src/pages/FansubDetailPage.tsx',
    ],
    relatedTests: ['fansub'],
  },
  {
    key: 'avatar-hover-rollout',
    label: 'Avatar poster-hover rollout',
    files: [
      'src/components/common/AvatarFrame/AvatarFrame.tsx',
      'src/components/common/CommentThread/CommentThread.tsx',
    ],
    relatedTests: ['avatar', 'hover', 'frame'],
  },
]

const LOGGER_CRITICAL_FILES = [
  'src/services/authService/shared.ts',
  'src/contexts/AuthContext.tsx',
  'src/pages/profile/profilePageErrors.ts',
  'src/pages/profile/useProfileEditMutations.ts',
  'src/pages/fansub/fansubDetailErrors.ts',
  'src/services/hoverCardService/userHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.data.ts',
  'src/services/hoverCardService/fansubHover.resolve.row.ts',
  'src/services/hoverCardService/mangaHover.ts',
]

const USER_FACING_CRITICAL_FILES = [
  'src/contexts/AuthContext.tsx',
  'src/pages/profile/profilePageErrors.ts',
  'src/pages/profile/useProfileEditMutations.ts',
  'src/pages/fansub/fansubDetailErrors.ts',
]

const REQUEST_CONTEXT_CRITICAL_FILES = [
  'src/contexts/AuthContext.tsx',
  'src/pages/profile/profilePageErrors.ts',
  'src/pages/profile/useProfileEditMutations.ts',
  'src/pages/fansub/fansubDetailErrors.ts',
  'src/services/hoverCardService/userHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.data.ts',
  'src/services/hoverCardService/fansubHover.resolve.row.ts',
  'src/services/hoverCardService/mangaHover.ts',
]

const CRITICAL_EXPORT_FILES = [
  'src/services/authService/shared.ts',
  'src/services/requestContext.ts',
  'src/services/userFacingError.ts',
  'src/pages/profile/profilePageErrors.ts',
  'src/pages/profile/useProfileEditMutations.ts',
  'src/pages/fansub/fansubDetailErrors.ts',
  'src/services/hoverCardService/userHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.ts',
  'src/services/hoverCardService/fansubHover.resolve.data.ts',
  'src/services/hoverCardService/fansubHover.resolve.row.ts',
  'src/services/hoverCardService/mangaHover.ts',
]

function normalizeRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function listFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function countLines(content) {
  if (!content) return 0
  return content.split(/\r?\n/).length
}

function safeRead(filePath) {
  return readFileSync(filePath, 'utf8')
}

function collectFileStats(filePath) {
  const relativePath = normalizeRelative(filePath)
  const source = safeRead(filePath)
  const consoleMatches = source.match(CONSOLE_PATTERN) || []
  return {
    relativePath,
    source,
    lineCount: countLines(source),
    consoleCount: consoleMatches.length,
    isTestFile: TEST_FILE_REGEX.test(relativePath),
    isAppCode: APP_CODE_REGEX.test(relativePath),
    isDocOrSql: DOC_OR_SQL_REGEX.test(relativePath),
  }
}

function parseFeatureFlagRegistryEntries() {
  const registryPath = path.join(rootDir, 'src', 'services', 'featureFlagRegistry.ts')
  const source = safeRead(registryPath)
  const entries = []
  let match = FEATURE_FLAG_BLOCK_PATTERN.exec(source)
  while (match) {
    const [, key, block] = match
    const readString = (fieldName) => {
      const fieldMatch = new RegExp(`${fieldName}:\\s*'([^']*)'`).exec(block)
      return fieldMatch ? fieldMatch[1] : ''
    }
    const nullMatch = /sonKullanmaTarihi:\s*null/.test(block)
    entries.push({
      key,
      owner: readString('owner'),
      amac: readString('amac'),
      cleanupNotu: readString('cleanupNotu'),
      sonKullanmaTarihi: nullMatch ? null : readString('sonKullanmaTarihi'),
    })
    match = FEATURE_FLAG_BLOCK_PATTERN.exec(source)
  }
  return entries
}

function collectFeatureFlagUsage(entries, files) {
  const usage = new Map(entries.map((entry) => [entry.key, 0]))
  const usageFiles = new Map(entries.map((entry) => [entry.key, new Set()]))

  for (const file of files) {
    if (file.relativePath === FEATURE_FLAG_REGISTRY_RELATIVE_PATH) continue
    const source = featureFlagUsageSource(file)
    for (const entry of entries) {
      if (source.includes(entry.key)) {
        usage.set(entry.key, (usage.get(entry.key) || 0) + 1)
        usageFiles.get(entry.key)?.add(file.relativePath)
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    usageCount: usage.get(entry.key) || 0,
    usageFiles: Array.from(usageFiles.get(entry.key) || []).sort((left, right) => left.localeCompare(right, 'tr')),
  }))
}

function isPastDate(dateValue) {
  if (!dateValue) return false
  const timestamp = Date.parse(dateValue)
  if (Number.isNaN(timestamp)) return false
  return timestamp < Date.now()
}

function collectNamedExports(source) {
  const names = new Set()
  for (const pattern of [EXPORTED_FUNCTION_PATTERN, EXPORTED_CONST_PATTERN, EXPORTED_CLASS_PATTERN]) {
    pattern.lastIndex = 0
    let match = pattern.exec(source)
    while (match) {
      names.add(match[1])
      match = pattern.exec(source)
    }
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right, 'tr'))
}

function buildCriticalExportCoverage(fileMap, testEntries) {
  const testSources = testEntries.map((entry) => entry.source)
  const testedExports = []
  const untestedExports = []

  for (const relativePath of CRITICAL_EXPORT_FILES) {
    const file = fileMap.get(relativePath)
    if (!file) continue
    const exportNames = collectNamedExports(file.source)
    for (const exportName of exportNames) {
      const covered = testSources.some((source) => source.includes(exportName))
      const payload = { relativePath, exportName }
      if (covered) {
        testedExports.push(payload)
      } else {
        untestedExports.push(payload)
      }
    }
  }

  return {
    files: CRITICAL_EXPORT_FILES,
    testedExports,
    untestedExports,
  }
}

function buildCriticalTestCoverage(testFiles) {
  return CRITICAL_AREAS.map((area) => {
    const matchedTests = testFiles.filter((file) => area.relatedTests.some((token) => file.includes(token)))
    return {
      ...area,
      matchedTests,
      covered: matchedTests.length > 0,
    }
  })
}

function hasStructuredLogger(source) {
  return LOGGER_USAGE_PATTERN.test(source)
}

function hasUserFacingErrorSupport(source) {
  return USER_FACING_ERROR_PATTERN.test(source)
}

function hasRequestContextSupport(source) {
  return REQUEST_CONTEXT_PATTERN.test(source)
}

function isUiSurface(file) {
  return UI_SURFACE_REGEX.test(file.relativePath)
}

function hasUiFeedbackOrLogger(source) {
  return TOAST_PATTERN.test(source)
    || ERROR_STATE_PATTERN.test(source)
    || USER_FACING_ERROR_PATTERN.test(source)
    || LOGGER_CALL_PATTERN.test(source)
}

function detectSuspiciousUiCatchSurfaces(appFiles) {
  return appFiles
    .filter((file) => isUiSurface(file)
      && !UI_HELPER_EXCLUDE_REGEX.test(file.relativePath)
      && CATCH_PATTERN.test(file.source)
      && !hasUiFeedbackOrLogger(file.source))
    .map((file) => file.relativePath)
    .sort((left, right) => left.localeCompare(right, 'tr'))
}

function buildCoverageForFiles(files, matcher) {
  const covered = []
  const missing = []
  for (const relativePath of files) {
    const file = matcher.fileMap.get(relativePath)
    if (!file) {
      missing.push(relativePath)
      continue
    }
    if (matcher.hasCoverage(file.source)) {
      covered.push(relativePath)
    } else {
      missing.push(relativePath)
    }
  }
  return { covered, missing }
}

function buildObservabilityHotspots(appFiles, suspiciousUiCatchSurfaces, requestContextCoverage, userFacingErrorCoverage) {
  const suspiciousSet = new Set(suspiciousUiCatchSurfaces)
  const requestGapSet = new Set(requestContextCoverage.criticalFilesWithoutCoverage)
  const userGapSet = new Set(userFacingErrorCoverage.criticalFilesWithoutCoverage)

  return appFiles
    .map((file) => {
      const hasLogger = hasStructuredLogger(file.source)
      const hasUserFacingError = hasUserFacingErrorSupport(file.source)
      const hasRequestContext = hasRequestContextSupport(file.source)
      const hasSuspiciousUiCatch = suspiciousSet.has(file.relativePath)
      const score = (file.consoleCount * 4)
        + (hasSuspiciousUiCatch ? 6 : 0)
        + (!hasLogger ? 2 : 0)
        + (requestGapSet.has(file.relativePath) ? 3 : 0)
        + (userGapSet.has(file.relativePath) ? 3 : 0)
      return {
        relativePath: file.relativePath,
        consoleCount: file.consoleCount,
        hasLogger,
        hasUserFacingError,
        hasRequestContext,
        hasSuspiciousUiCatch,
        score,
      }
    })
    .filter((file) => file.score > 0)
    .sort((left, right) => right.score - left.score || right.consoleCount - left.consoleCount || left.relativePath.localeCompare(right.relativePath, 'tr'))
    .slice(0, 20)
}

function readPreviousReport() {
  if (!existsSync(reportJsonPath)) return null
  try {
    return JSON.parse(readFileSync(reportJsonPath, 'utf8'))
  } catch {
    return null
  }
}

function toConsoleInventoryMap(previousReport) {
  const inventory = Array.isArray(previousReport?.appConsoleInventory)
    ? previousReport.appConsoleInventory
    : Array.isArray(previousReport?.consoleHotspots)
      ? previousReport.consoleHotspots.filter((file) => file.isAppCode)
      : []
  return new Map(inventory.map((item) => [item.relativePath, Number(item.consoleCount || 0)]))
}


function diffNewViolations(previousReport, currentReport) {
  if (!previousReport) {
    return {
      newAppConsoleFiles: [],
      increasedConsoleCounts: [],
      newOversizedFiles: [],
      newFeatureFlagIssues: [],
      newSuspiciousUiCatchSurfaces: [],
      newCriticalUserFacingErrorGaps: [],
      newRequestContextGaps: [],
    }
  }

  const supportsConsoleDiff = Array.isArray(previousReport.appConsoleInventory)
  const supportsUserFacingDiff = Array.isArray(previousReport.userFacingErrorCoverage?.criticalFilesWithoutCoverage)
  const supportsRequestContextDiff = Array.isArray(previousReport.requestContextCoverage?.criticalFilesWithoutCoverage)
  const supportsFeatureFlagDiff = Array.isArray(previousReport.featureFlagIssues)

  const previousConsoleMap = supportsConsoleDiff ? toConsoleInventoryMap(previousReport) : new Map()
  const previousOversized = new Set((previousReport.largeFiles || []).filter((file) => Number(file.lineCount || 0) >= 850).map((file) => file.relativePath))
  const previousFeatureFlagIssues = new Set(supportsFeatureFlagDiff ? (previousReport.featureFlagIssues || []).map((item) => item.key) : [])
  const previousSuspiciousUiCatch = new Set(supportsUserFacingDiff ? (previousReport.userFacingErrorCoverage?.suspiciousUiCatchSurfaces || []) : [])
  const previousUserFacingGaps = new Set(supportsUserFacingDiff ? (previousReport.userFacingErrorCoverage?.criticalFilesWithoutCoverage || []) : [])
  const previousRequestContextGaps = new Set(supportsRequestContextDiff ? (previousReport.requestContextCoverage?.criticalFilesWithoutCoverage || []) : [])

  const newAppConsoleFiles = supportsConsoleDiff
    ? currentReport.appConsoleInventory
        .filter((item) => item.consoleCount > 0 && !previousConsoleMap.has(item.relativePath))
        .map((item) => item.relativePath)
    : []

  const increasedConsoleCounts = supportsConsoleDiff
    ? currentReport.appConsoleInventory
        .filter((item) => item.consoleCount > (previousConsoleMap.get(item.relativePath) || 0))
        .map((item) => ({
          relativePath: item.relativePath,
          previousCount: previousConsoleMap.get(item.relativePath) || 0,
          currentCount: item.consoleCount,
        }))
    : []

  const newOversizedFiles = currentReport.largeFiles
    .filter((file) => file.lineCount >= 850 && !previousOversized.has(file.relativePath))
    .map((file) => file.relativePath)

  const newFeatureFlagIssues = supportsFeatureFlagDiff
    ? currentReport.featureFlagIssues
        .filter((item) => !previousFeatureFlagIssues.has(item.key))
        .map((item) => item.key)
    : []

  const newSuspiciousUiCatchSurfaces = supportsUserFacingDiff
    ? (currentReport.userFacingErrorCoverage?.suspiciousUiCatchSurfaces || [])
        .filter((file) => !previousSuspiciousUiCatch.has(file))
    : []

  const newCriticalUserFacingErrorGaps = supportsUserFacingDiff
    ? (currentReport.userFacingErrorCoverage?.criticalFilesWithoutCoverage || [])
        .filter((file) => !previousUserFacingGaps.has(file))
    : []

  const newRequestContextGaps = supportsRequestContextDiff
    ? (currentReport.requestContextCoverage?.criticalFilesWithoutCoverage || [])
        .filter((file) => !previousRequestContextGaps.has(file))
    : []

  return {
    newAppConsoleFiles,
    increasedConsoleCounts,
    newOversizedFiles,
    newFeatureFlagIssues,
    newSuspiciousUiCatchSurfaces,
    newCriticalUserFacingErrorGaps,
    newRequestContextGaps,
  }
}

function hasRegression(violations) {
  return violations.newAppConsoleFiles.length > 0
    || violations.increasedConsoleCounts.length > 0
    || violations.newOversizedFiles.length > 0
    || violations.newFeatureFlagIssues.length > 0
    || violations.newSuspiciousUiCatchSurfaces.length > 0
    || violations.newCriticalUserFacingErrorGaps.length > 0
    || violations.newRequestContextGaps.length > 0
}

function formatViolationSummary(violations) {
  return [
    ['yeni console dosyasi', violations.newAppConsoleFiles.length],
    ['artan console sayisi', violations.increasedConsoleCounts.length],
    ['yeni 850+ dosya', violations.newOversizedFiles.length],
    ['yeni feature flag sorunu', violations.newFeatureFlagIssues.length],
    ['yeni supheli catch yuzeyi', violations.newSuspiciousUiCatchSurfaces.length],
    ['yeni user-facing gap', violations.newCriticalUserFacingErrorGaps.length],
    ['yeni request-context gap', violations.newRequestContextGaps.length],
  ].map(([label, count]) => `- ${label}: ${count}`).join('\n')
}

function stripSource(file) {
  const next = { ...file }
  delete next.source
  return next
}

function toMarkdown(report) {
  const lines = []
  lines.push('# Repo Health Baseline')
  lines.push('')
  lines.push(`- Uretim tarihi: ${report.generatedAt}`)
  lines.push(`- Toplam satir: ${report.summary.totalLines}`)
  lines.push(`- Uygulama kodu satiri: ${report.summary.appCodeLines}`)
  lines.push(`- Test/spec dosyasi: ${report.summary.testFileCount}`)
  lines.push(`- console.* cagrisi: ${report.summary.consoleCount}`)
  lines.push(`- Feature flag sayisi: ${report.summary.featureFlagCount}`)
  lines.push(`- Kullanilmayan feature flag: ${report.summary.unusedFeatureFlagCount}`)
  lines.push(`- Yapilandirilmis logger kullanan dosya: ${report.summary.structuredLoggerFileCount}`)
  lines.push(`- User-facing error kapsami olan dosya: ${report.summary.userFacingErrorFileCount}`)
  lines.push(`- Request context kullanan dosya: ${report.summary.requestContextFileCount}`)
  lines.push(`- Testsiz kritik export: ${report.summary.untestedCriticalExportCount}`)
  lines.push('')
  lines.push('## Buyuk Dosyalar')
  lines.push('')
  lines.push('| Dosya | Satir | Durum |')
  lines.push('| --- | ---: | --- |')
  for (const file of report.largeFiles) {
    lines.push(`| \`${file.relativePath}\` | ${file.lineCount} | ${file.severity} |`)
  }
  lines.push('')
  lines.push('## Console Yogunlugu')
  lines.push('')
  lines.push('| Dosya | console.* |')
  lines.push('| --- | ---: |')
  for (const file of report.consoleHotspots) {
    lines.push(`| \`${file.relativePath}\` | ${file.consoleCount} |`)
  }
  lines.push('')
  lines.push('## Observability Hotspotlari')
  lines.push('')
  for (const hotspot of report.observabilityHotspots) {
    lines.push(`- ${hotspot.relativePath}: console=${hotspot.consoleCount}, logger=${hotspot.hasLogger}, user-facing=${hotspot.hasUserFacingError}, request-context=${hotspot.hasRequestContext}, supheli-catch=${hotspot.hasSuspiciousUiCatch}`)
  }
  lines.push('')
  lines.push('## User-Facing Error Coverage')
  lines.push('')
  lines.push(`- Kritik dosya kapsami: ${report.userFacingErrorCoverage.criticalFilesWithCoverage.length}/${report.userFacingErrorCoverage.criticalFiles.length}`)
  lines.push(`- Kritik dosyada eksik kapsama: ${report.userFacingErrorCoverage.criticalFilesWithoutCoverage.join(', ') || 'yok'}`)
  lines.push(`- Supheli UI catch yuzeyi: ${report.userFacingErrorCoverage.suspiciousUiCatchSurfaces.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Request Context Coverage')
  lines.push('')
  lines.push(`- Kritik dosya kapsami: ${report.requestContextCoverage.criticalFilesWithCoverage.length}/${report.requestContextCoverage.criticalFiles.length}`)
  lines.push(`- Kritik dosyada eksik kapsama: ${report.requestContextCoverage.criticalFilesWithoutCoverage.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Feature Flag Registry')
  lines.push('')
  lines.push('| Flag | Kullanim | Durum |')
  lines.push('| --- | ---: | --- |')
  for (const flag of report.featureFlags) {
    const status = report.featureFlagIssues.some((issue) => issue.key === flag.key)
      ? 'sorunlu'
      : flag.usageCount > 0
        ? 'bagli'
        : 'kullanilmiyor'
    lines.push(`| \`${flag.key}\` | ${flag.usageCount} | ${status} |`)
  }
  lines.push('')
  lines.push('## Feature Flag Sorunlari')
  lines.push('')
  lines.push(report.featureFlagIssues.length > 0
    ? report.featureFlagIssues.map((issue) => `- \`${issue.key}\`: ${issue.issues.join(', ')}`).join('\n')
    : '- yok')
  lines.push('')
  lines.push('## Kritik Ama Testsiz Alanlar')
  lines.push('')
  for (const area of report.criticalAreas) {
    lines.push(`- ${area.covered ? '[x]' : '[ ]'} ${area.label}: ${area.covered ? area.matchedTests.join(', ') : 'eslesen test yok'}`)
  }
  lines.push('')
  lines.push('## Kritik Export Coverage')
  lines.push('')
  lines.push(`- Testlenen kritik export: ${report.criticalExportCoverage.testedExports.length}`)
  lines.push(`- Testsiz kritik export: ${report.criticalExportCoverage.untestedExports.length}`)
  lines.push(report.criticalExportCoverage.untestedExports.length > 0
    ? report.criticalExportCoverage.untestedExports.map((item) => `  - ${item.relativePath} -> ${item.exportName}`).join('\n')
    : '- yok')
  lines.push('')
  lines.push('## Yeni Ihlaller')
  lines.push('')
  lines.push(`- Yeni app console dosyasi: ${report.newViolations.newAppConsoleFiles.join(', ') || 'yok'}`)
  lines.push(`- Artan console sayisi: ${report.newViolations.increasedConsoleCounts.map((item) => `${item.relativePath} (${item.previousCount} -> ${item.currentCount})`).join(', ') || 'yok'}`)
  lines.push(`- Yeni 850+ dosya: ${report.newViolations.newOversizedFiles.join(', ') || 'yok'}`)
  lines.push(`- Yeni flag sorunu: ${report.newViolations.newFeatureFlagIssues.join(', ') || 'yok'}`)
  lines.push(`- Yeni supheli UI catch: ${report.newViolations.newSuspiciousUiCatchSurfaces.join(', ') || 'yok'}`)
  lines.push(`- Yeni user-facing gap: ${report.newViolations.newCriticalUserFacingErrorGaps.join(', ') || 'yok'}`)
  lines.push(`- Yeni request-context gap: ${report.newViolations.newRequestContextGaps.join(', ') || 'yok'}`)
  lines.push('')
  lines.push('## Notlar')
  lines.push('')
  lines.push('- Dokuman ve SQL migration dosyalari bu raporda envantere girer ama ilk dalgada otomatik bloklanmaz.')
  lines.push('- Touched-file policy geregi buyuk dosyaya dokunuldugunda sorumluluk ayrimi beklenir.')
  lines.push('- Yeni ihlal kapisi fail-fast mantigiyla yalniz regresyonlari hedefler.')
  return `${lines.join('\n')}\n`
}

function main() {
  mkdirSync(reportDir, { recursive: true })

  const previousReport = readPreviousReport()
  const allFiles = listFiles(rootDir)
  const measuredFiles = allFiles
    .filter((filePath) => !statSync(filePath).isDirectory())
    .filter((filePath) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|html)$/i.test(filePath))
    .map(collectFileStats)

  const testEntries = measuredFiles.filter((file) => file.isTestFile)
  const testFiles = testEntries.map((file) => file.relativePath)
  const appFiles = measuredFiles.filter((file) => file.isAppCode)
  const largeFiles = appFiles
    .filter((file) => file.lineCount >= 600)
    .map((file) => ({
      ...file,
      severity: file.lineCount >= 850 ? 'sert-refactor' : 'uyari',
    }))
    .sort((left, right) => right.lineCount - left.lineCount)

  const consoleHotspots = measuredFiles
    .filter((file) => file.consoleCount > 0)
    .sort((left, right) => right.consoleCount - left.consoleCount)
    .slice(0, 20)

  const appConsoleInventory = appFiles
    .filter((file) => file.consoleCount > 0)
    .map((file) => ({ relativePath: file.relativePath, consoleCount: file.consoleCount }))
    .sort((left, right) => right.consoleCount - left.consoleCount || left.relativePath.localeCompare(right.relativePath, 'tr'))

  const featureFlagEntries = parseFeatureFlagRegistryEntries()
  const featureFlags = collectFeatureFlagUsage(featureFlagEntries, measuredFiles)
  const featureFlagIssues = featureFlags
    .filter((flag) => !flag.owner.trim() || !flag.amac.trim() || !flag.cleanupNotu.trim() || flag.usageCount === 0 || isPastDate(flag.sonKullanmaTarihi))
    .map((flag) => ({
      key: flag.key,
      issues: [
        !flag.owner.trim() ? 'owner eksik' : null,
        !flag.amac.trim() ? 'amac eksik' : null,
        !flag.cleanupNotu.trim() ? 'cleanup notu eksik' : null,
        flag.usageCount === 0 ? 'kullanilmiyor' : null,
        isPastDate(flag.sonKullanmaTarihi) ? 'suresi gecmis' : null,
      ].filter(Boolean),
    }))

  const criticalAreas = buildCriticalTestCoverage(testFiles)
  const fileMap = new Map(appFiles.map((file) => [file.relativePath, file]))
  const loggerCoverage = buildCoverageForFiles(LOGGER_CRITICAL_FILES, {
    fileMap,
    hasCoverage: hasStructuredLogger,
  })
  const userFacingErrorCoverageBase = buildCoverageForFiles(USER_FACING_CRITICAL_FILES, {
    fileMap,
    hasCoverage: hasUserFacingErrorSupport,
  })
  const requestContextCoverageBase = buildCoverageForFiles(REQUEST_CONTEXT_CRITICAL_FILES, {
    fileMap,
    hasCoverage: hasRequestContextSupport,
  })
  const suspiciousUiCatchSurfaces = detectSuspiciousUiCatchSurfaces(appFiles)

  const userFacingErrorCoverage = {
    filesWithCoverage: appFiles.filter((file) => hasUserFacingErrorSupport(file.source)).length,
    filesWithoutCoverage: appFiles.filter((file) => !hasUserFacingErrorSupport(file.source)).length,
    criticalFiles: USER_FACING_CRITICAL_FILES,
    criticalFilesWithCoverage: userFacingErrorCoverageBase.covered,
    criticalFilesWithoutCoverage: userFacingErrorCoverageBase.missing,
    suspiciousUiCatchSurfaces,
  }

  const requestContextCoverage = {
    filesWithCoverage: appFiles.filter((file) => hasRequestContextSupport(file.source)).length,
    filesWithoutCoverage: appFiles.filter((file) => !hasRequestContextSupport(file.source)).length,
    criticalFiles: REQUEST_CONTEXT_CRITICAL_FILES,
    criticalFilesWithCoverage: requestContextCoverageBase.covered,
    criticalFilesWithoutCoverage: requestContextCoverageBase.missing,
  }

  const observabilityHotspots = buildObservabilityHotspots(appFiles, suspiciousUiCatchSurfaces, requestContextCoverage, userFacingErrorCoverage)
  const criticalExportCoverage = buildCriticalExportCoverage(fileMap, testEntries)

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalLines: measuredFiles.reduce((sum, file) => sum + file.lineCount, 0),
      appCodeLines: appFiles.reduce((sum, file) => sum + file.lineCount, 0),
      testFileCount: testFiles.length,
      consoleCount: measuredFiles.reduce((sum, file) => sum + file.consoleCount, 0),
      featureFlagCount: featureFlagEntries.length,
      unusedFeatureFlagCount: featureFlags.filter((flag) => flag.usageCount === 0).length,
      structuredLoggerFileCount: appFiles.filter((file) => hasStructuredLogger(file.source)).length,
      userFacingErrorFileCount: userFacingErrorCoverage.filesWithCoverage,
      requestContextFileCount: requestContextCoverage.filesWithCoverage,
      untestedCriticalExportCount: criticalExportCoverage.untestedExports.length,
    },
    largeFiles: largeFiles.map(stripSource),
    consoleHotspots: consoleHotspots.map(stripSource),
    appConsoleFiles: appConsoleInventory.map((item) => item.relativePath),
    appConsoleInventory,
    structuredLoggerFiles: appFiles.filter((file) => hasStructuredLogger(file.source)).map((file) => file.relativePath).sort((left, right) => left.localeCompare(right, 'tr')),
    featureFlags,
    featureFlagIssues,
    criticalAreas,
    criticalExportCoverage,
    observabilityHotspots,
    loggerCoverage: {
      criticalFiles: LOGGER_CRITICAL_FILES,
      criticalFilesWithCoverage: loggerCoverage.covered,
      criticalFilesWithoutCoverage: loggerCoverage.missing,
    },
    userFacingErrorCoverage,
    requestContextCoverage,
  }

  report.newViolations = diffNewViolations(previousReport, report)

  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2))
  writeFileSync(reportMarkdownPath, toMarkdown(report))

  console.log(`[repo-health] toplam satir: ${report.summary.totalLines}`)
  console.log(`[repo-health] buyuk dosya: ${report.largeFiles.length}`)
  console.log(`[repo-health] test/spec: ${report.summary.testFileCount}`)
  console.log(`[repo-health] console.*: ${report.summary.consoleCount}`)
  console.log(`[repo-health] feature flag: ${report.summary.featureFlagCount}`)
  console.log(`[repo-health] observability hotspot: ${report.observabilityHotspots.length}`)
  console.log(`[repo-health] new violation summary:`)
  console.log(formatViolationSummary(report.newViolations))

  if (failOnRegression && hasRegression(report.newViolations)) {
    console.error('[repo-health] regressions detected. strict mode failed.')
    process.exitCode = 1
  }
}

main()
